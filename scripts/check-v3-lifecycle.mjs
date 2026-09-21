#!/usr/bin/env node
/**
 * V3 lifecycle integration check (Phase 5).
 *
 * A deterministic, fail-closed end-to-end check that exercises the completed V3
 * lifecycle against *packed artifacts*, never workspace source:
 *
 *   1. validate and pack System A and System B;
 *   2. generate a fresh template package into a temp target, build and pack it
 *      (no repo/registry mutation);
 *   3. hydrate TEMP-only consumers from the packed package names/public
 *      `./manifest` exports for all three packages;
 *   4. run configure-only `ds:connect`, exact discovery/version checks, strict
 *      `ds:check-usage`, repeated/idempotent connect, and no source/dependency
 *      copying/mutation assertions.
 *
 * All pack/extract/scratch/log output lives under project `TEMP/v3/lifecycle/`.
 * It never installs packages, versions, publishes, or mutates the repository.
 * Requires the workspace to be installed and built (`pnpm install && pnpm build`).
 *
 * CLI: pnpm ds:check-v3
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";

import { readJsonFile, repoRoot } from "./register-design-system.mjs";
import { validateDesignSystem } from "./validate-design-system.mjs";
import { inspectTarball } from "./prepare-release.mjs";

const ROOT = repoRoot();
const TEMP = join(ROOT, "TEMP", "v3", "lifecycle");
const PACK_DIR = join(TEMP, "pack");
const EXTRACT_DIR = join(TEMP, "extract");
const GENERATED_DIR = join(TEMP, "generated");
const LOG_PATH = join(TEMP, "check-v3.log");

const GENERATED_ID = "lifecycle-demo";
const GENERATED_PACKAGE_NAME = `@prism-system/ui-${GENERATED_ID}`;

const CLEAN_SOURCE = `export function Clean() {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 w-[320px] rounded-lg shadow-md bg-white text-black">
      <span style={{ display: "flex", gap: 8, padding: 4, width: "100%" }}>ok</span>
    </div>
  );
}
`;

const BAD_SOURCE = `export const Bad = () => (
  <div className="hover:bg-[#ff0000] rounded-[12px] shadow-[0_0_10px_rgba(0,0,0,0.5)]">
    <span style={{ color: "red", borderRadius: 12 }}>bad</span>
  </div>
);
`;

const CLI = {
  create: join(ROOT, "scripts", "create-design-system.mjs"),
  connect: join(ROOT, "scripts", "connect-design-system.mjs"),
  usage: join(ROOT, "scripts", "check-design-system-usage.mjs"),
};

const TOOLS_PACKAGE_NAME = "@prism-system/tools";
const TOOLS_PACKAGE_DIR = join(ROOT, "packages", "tools");
const TOOLS_EXTRACT = join(EXTRACT_DIR, "tools");
const TOOLS_CONSUMER = join(TEMP, "external-consumer");

const CATALOG_DIR = join(TEMP, "catalog");
const CATALOG_CONSUMER = join(CATALOG_DIR, "consumer");
const CATALOG_USE_CONSUMER = join(CATALOG_DIR, "use-consumer");
const FAKE_BIN_DIR = join(CATALOG_DIR, "fake-bin");
const FAKE_ARGS_FILE = join(CATALOG_DIR, "fake-args.txt");

const REPO_MUTATION_WATCH = [
  "config/design-systems.json",
  "packages/system-a/package.json",
  "packages/system-a/design-system.json",
  "packages/system-b/package.json",
  "packages/system-b/design-system.json",
  "packages/tools/package.json",
];

function toPosix(path) {
  return path.split(sep).join("/");
}

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", ...options });
}

function runPnpm(args, options = {}) {
  return spawnSync("pnpm", args, { cwd: ROOT, encoding: "utf8", shell: true, ...options });
}

function runTar(args) {
  return spawnSync("tar", args, { cwd: ROOT, encoding: "utf8" });
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(toPosix(relative(dir, full)));
    }
  };
  walk(dir);
  return out;
}

function hashTree(dir) {
  return listFiles(dir)
    .map((file) => `${file}:${hashFile(join(dir, file))}`)
    .join("\n");
}

function hashConsumer(dir) {
  const files = ["package.json", "AGENTS.md"];
  for (const file of listFiles(join(dir, ".design-system"))) files.push(`.design-system/${file}`);
  for (const file of listFiles(join(dir, "src"))) files.push(`src/${file}`);
  return files
    .sort()
    .map((file) => `${file}:${hashFile(join(dir, file))}`)
    .join("\n");
}

/**
 * Stage a package's declared runtime dependencies into an isolated consumer
 * node_modules from the already-installed workspace, so the packed tools CLI can
 * run without installing from the network or touching the repository.
 */
function stageRuntimeDependencies(consumerRoot, dependencies) {
  const requireFromRoot = createRequire(join(ROOT, "package.json"));
  for (const name of Object.keys(dependencies ?? {})) {
    const target = join(consumerRoot, "node_modules", ...name.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    const entry = requireFromRoot.resolve(name);
    let dir = dirname(entry);
    for (;;) {
      if (existsSync(join(dir, "package.json"))) break;
      const parent = dirname(dir);
      assert(parent !== dir, `could not locate the installed package directory for ${name}`);
      dir = parent;
    }
    const source = realpathSync.native(dir);
    try {
      symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
    } catch {
      cpSync(source, target, { recursive: true });
    }
  }
}

/** Read the entry list of a tarball via the system `tar`. */
function tarballEntries(tarballPath) {
  const result = runTar(["-tzf", tarballPath]);
  assert(result.status === 0, `tar -tzf failed: ${output(result)}`);
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Check runner                                                               */
/* -------------------------------------------------------------------------- */

const results = [];
const logs = [];

function log(line) {
  logs.push(line);
  process.stdout.write(`${line}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCheck(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    log(`FAIL ${name}: ${error.message}`);
  }
}

async function runAsyncCheck(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    log(`FAIL ${name}: ${error.message}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

const repoHashesBefore = new Map(
  REPO_MUTATION_WATCH.map((file) => [file, hashFile(join(ROOT, file))]),
);

runCheck("prepare TEMP/v3/lifecycle workspace", () => {
  rmSync(TEMP, { recursive: true, force: true });
  mkdirSync(PACK_DIR, { recursive: true });
  mkdirSync(EXTRACT_DIR, { recursive: true });
  mkdirSync(GENERATED_DIR, { recursive: true });
  assert(existsSync(TEMP), "temp workspace was not created");
});

runCheck("validate System A and System B (static)", () => {
  for (const id of ["system-a", "system-b"]) {
    const result = validateDesignSystem({ id, root: ROOT, runCommands: false });
    assert(result.ok, `ds:check ${id} failed: ${result.failures.join("; ")}`);
  }
});

runCheck("generate a fresh template package without mutating the repo/registry", () => {
  const create = runNode([CLI.create, GENERATED_ID, "--output", GENERATED_DIR, "--no-register"]);
  assert(create.status === 0, `ds:create failed: ${output(create)}`);
  const packageDir = join(GENERATED_DIR, "packages", GENERATED_ID);
  for (const file of [
    "package.json",
    "design-system.json",
    "design-system.source.json",
    "src/index.ts",
  ]) {
    assert(existsSync(join(packageDir, file)), `generated package is missing ${file}`);
  }
  const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(packageDir, "design-system.json"), "utf8"));
  assert(
    manifest.version === pkg.version,
    "generated manifest version must equal package.json version",
  );
  assert(manifest.contract === "v2", "generated manifest must declare contract v2");
  assert(
    !existsSync(join(ROOT, "packages", GENERATED_ID)),
    "generation must not touch repository packages/",
  );
  assert(
    !existsSync(join(GENERATED_DIR, "config")),
    "generation with --no-register must not write a registry",
  );
});

const generatedPackageDir = join(GENERATED_DIR, "packages", GENERATED_ID);

runCheck("build the generated template package in TEMP", () => {
  // Reuse an existing workspace package's node_modules so the fresh package can
  // resolve core/react/tsup without installing anything or touching the repo.
  const link = join(generatedPackageDir, "node_modules");
  if (!existsSync(link)) {
    symlinkSync(
      join(ROOT, "packages", "system-a", "node_modules"),
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  const build = runPnpm(["run", "build"], { cwd: generatedPackageDir });
  assert(build.status === 0, `generated template build failed: ${output(build)}`);
  assert(
    existsSync(join(generatedPackageDir, "dist")),
    "generated template build produced no dist/",
  );
});

const targets = [
  {
    id: "system-a",
    packageName: "@prism-system/ui-system-a",
    packageDir: join(ROOT, "packages", "system-a"),
  },
  {
    id: "system-b",
    packageName: "@prism-system/ui-system-b",
    packageDir: join(ROOT, "packages", "system-b"),
  },
  {
    id: GENERATED_ID,
    packageName: GENERATED_PACKAGE_NAME,
    packageDir: generatedPackageDir,
  },
];

runCheck("pack and inspect System A, System B, and generated template artifacts", () => {
  for (const target of targets) {
    assert(
      existsSync(join(target.packageDir, "dist")),
      `${target.id} is not built; run "pnpm build" first`,
    );
    const pack = runPnpm(["pack", "--pack-destination", PACK_DIR], { cwd: target.packageDir });
    assert(pack.status === 0, `pnpm pack failed for ${target.id}: ${output(pack)}`);
    const tarball = readdirSync(PACK_DIR).find(
      (name) => name.includes(target.id) && name.endsWith(".tgz"),
    );
    assert(tarball, `no tarball produced for ${target.id}`);
    const tarballPath = join(PACK_DIR, tarball);
    const inspection = inspectTarball(tarballPath);
    assert(inspection.ok, `tarball inspection failed for ${target.id}: ${inspection.detail}`);
    const extractDir = join(EXTRACT_DIR, target.id);
    mkdirSync(extractDir, { recursive: true });
    const extract = runTar(["-xzf", tarballPath, "-C", extractDir]);
    assert(extract.status === 0, `failed to extract ${target.id}: ${output(extract)}`);
    const extractedManifestPath = join(extractDir, "package", "design-system.json");
    assert(existsSync(extractedManifestPath), `${target.id} extract is missing design-system.json`);
    const extractedPkg = JSON.parse(
      readFileSync(join(extractDir, "package", "package.json"), "utf8"),
    );
    const extractedManifest = JSON.parse(readFileSync(extractedManifestPath, "utf8"));
    assert(
      extractedPkg.exports?.["./manifest"] === "./design-system.json",
      `${target.id} tarball must expose ./manifest as ./design-system.json`,
    );
    assert(
      extractedManifest.package === target.packageName,
      `${target.id} manifest package identity mismatch`,
    );
    assert(
      extractedManifest.version === extractedPkg.version,
      `${target.id} manifest/package version mismatch`,
    );
    target.extractedPackageDir = join(extractDir, "package");
  }
});

function hydrateConsumer(name, target) {
  const dir = join(TEMP, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name,
        version: "0.0.0",
        private: true,
        dependencies: { [target.packageName]: "*" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(dir, "AGENTS.md"), "# Lifecycle consumer\n\nUser content.\n");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "clean.tsx"), CLEAN_SOURCE);
  const installed = join(dir, "node_modules", ...target.packageName.split("/"));
  mkdirSync(dirname(installed), { recursive: true });
  cpSync(target.extractedPackageDir, installed, { recursive: true });
  return dir;
}

function checkConsumerLifecycle(target) {
  const dir = hydrateConsumer(`consumer-${target.id}`, target);
  const consumerPackageJson = join(dir, "package.json");
  const packageHashBefore = hashFile(consumerPackageJson);
  const dependencyBefore = JSON.parse(readFileSync(consumerPackageJson, "utf8")).dependencies;

  // Configure-only connect.
  const connect = runNode([CLI.connect, target.packageName, "--cwd", dir]);
  assert(connect.status === 0, `ds:connect failed for ${target.id}: ${output(connect)}`);

  // Exact discovery/version/identity checks.
  const installedDir = join(dir, "node_modules", ...target.packageName.split("/"));
  const installed = JSON.parse(readFileSync(join(installedDir, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(installedDir, "design-system.json"), "utf8"));
  const config = JSON.parse(readFileSync(join(dir, ".design-system", "config.json"), "utf8"));
  assert(config.package === target.packageName, "config package identity mismatch");
  assert(config.manifest === "./manifest", "config manifest subpath mismatch");
  assert(config.version === installed.version, "config version must equal installed version");
  assert(manifest.version === installed.version, "manifest version must equal installed version");
  assert(manifest.package === target.packageName, "manifest package identity mismatch");
  assert(manifest.contract === "v2", "manifest contract must be v2");

  // No copied source; only config + AGENTS in .design-system.
  const dsFiles = listFiles(join(dir, ".design-system"));
  assert(
    dsFiles.join(",") === "AGENTS.md,config.json",
    `.design-system must contain only config/AGENTS, found: ${dsFiles.join(",")}`,
  );

  // Root AGENTS managed block appended; consumer package.json/dependencies untouched.
  const rootAgents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert(
    rootAgents.includes("BEGIN @prism-system design system contract"),
    "managed block missing",
  );
  assert(rootAgents.includes("# Lifecycle consumer"), "user content not preserved");
  assert(hashFile(consumerPackageJson) === packageHashBefore, "consumer package.json was mutated");
  const dependencyAfter = JSON.parse(readFileSync(consumerPackageJson, "utf8")).dependencies;
  assert(
    JSON.stringify(dependencyAfter) === JSON.stringify(dependencyBefore),
    "consumer dependencies were mutated",
  );

  // Strict usage check: clean passes.
  const cleanUsage = runNode([CLI.usage, "--cwd", dir]);
  assert(cleanUsage.status === 0, `ds:check-usage failed on clean consumer: ${output(cleanUsage)}`);

  // Strict usage check: a violation fails closed with actionable rules.
  writeFileSync(join(dir, "src", "bad.tsx"), BAD_SOURCE);
  const badUsage = runNode([CLI.usage, "--cwd", dir]);
  assert(badUsage.status !== 0, "ds:check-usage must fail closed on violations");
  assert(/no-arbitrary-color/.test(badUsage.stdout), "expected no-arbitrary-color diagnostic");
  assert(
    /no-visual-style-override/.test(badUsage.stdout),
    "expected no-visual-style-override diagnostic",
  );
  rmSync(join(dir, "src", "bad.tsx"));

  // Repeated connect is idempotent.
  const treeBefore = hashConsumer(dir);
  const again = runNode([CLI.connect, "--cwd", dir]);
  assert(again.status === 0, `repeated ds:connect failed: ${output(again)}`);
  assert(/Already connected/.test(again.stdout), "repeated connect should report no changes");
  assert(hashConsumer(dir) === treeBefore, "repeated connect was not byte-stable");
}

for (const target of targets) {
  runCheck(`consumer lifecycle against packed ${target.packageName}`, () => {
    checkConsumerLifecycle(target);
  });
}

/* -------------------------------------------------------------------------- */
/* External boundary: packed @prism-system/tools from an isolated consumer    */
/* -------------------------------------------------------------------------- */

let toolsExtractedDir = null;
let toolsPackageJson = null;

runCheck("pack and inspect the @prism-system/tools artifact", () => {
  assert(existsSync(TOOLS_PACKAGE_DIR), "packages/tools is missing");
  const pack = runPnpm(["pack", "--pack-destination", PACK_DIR], { cwd: TOOLS_PACKAGE_DIR });
  assert(pack.status === 0, `pnpm pack failed for @prism-system/tools: ${output(pack)}`);
  const tarball = readdirSync(PACK_DIR).find(
    (name) => name.includes("tools") && name.endsWith(".tgz"),
  );
  assert(tarball, "no @prism-system/tools tarball was produced");
  const tarballPath = join(PACK_DIR, tarball);
  const entries = tarballEntries(tarballPath);
  for (const entry of entries) {
    assert(entry.startsWith("package/"), `tools entry outside package/: ${entry}`);
    const rel = entry.slice("package/".length);
    const allowed =
      rel === "package.json" ||
      rel === "README.md" ||
      rel === "AGENTS.md" ||
      rel === "LICENSE" ||
      rel.startsWith("bin/") ||
      rel.startsWith("src/");
    assert(allowed, `unexpected @prism-system/tools tarball path: ${entry}`);
    assert(
      !/(^|\/)(packages|apps|scripts|templates|TEMP|node_modules)\//.test(rel),
      `source path leaked into the tools tarball: ${entry}`,
    );
  }
  for (const required of [
    "package/bin/prism-ds.mjs",
    "package/src/cli.mjs",
    "package/README.md",
    "package/AGENTS.md",
    "package/LICENSE",
  ]) {
    assert(entries.includes(required), `tools tarball is missing ${required}`);
  }

  rmSync(TOOLS_EXTRACT, { recursive: true, force: true });
  mkdirSync(TOOLS_EXTRACT, { recursive: true });
  const extract = runTar(["-xzf", tarballPath, "-C", TOOLS_EXTRACT]);
  assert(extract.status === 0, `failed to extract @prism-system/tools: ${output(extract)}`);
  const extracted = join(TOOLS_EXTRACT, "package");
  const pkg = readJsonFile(join(extracted, "package.json"));
  assert(pkg.name === TOOLS_PACKAGE_NAME, "tools package identity mismatch");
  assert(typeof pkg.bin?.["prism-ds"] === "string", "tools must declare the prism-ds bin");
  const binRel = pkg.bin["prism-ds"].replace(/^\.\//, "");
  assert(existsSync(join(extracted, binRel)), `tools bin target is missing: ${binRel}`);
  const rootExport = typeof pkg.exports === "object" ? pkg.exports["."] : pkg.exports;
  const exportTarget =
    typeof rootExport === "string" ? rootExport : (rootExport?.import ?? rootExport?.default);
  assert(typeof exportTarget === "string", "tools exports['.'] is missing");
  assert(
    existsSync(join(extracted, exportTarget.replace(/^\.\//, ""))),
    `tools exports['.'] target is missing: ${exportTarget}`,
  );
  assert(pkg.dependencies?.typescript, "typescript must be a declared runtime dependency");
  for (const rel of listFiles(extracted)) {
    if (!/\.(mjs|js|json|md)$/.test(rel)) continue;
    const text = readFileSync(join(extracted, rel), "utf8");
    assert(!text.includes(ROOT), `shipped tools file ${rel} references the repository root`);
  }
  toolsExtractedDir = extracted;
  toolsPackageJson = pkg;
});

function installPackedPackage(consumerRoot, packageName, sourceDir) {
  const target = join(consumerRoot, "node_modules", ...packageName.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  cpSync(sourceDir, target, { recursive: true });
}

function hydrateExternalToolsConsumer() {
  assert(toolsExtractedDir, "the tools artifact was not extracted");
  const systemA = targets.find((target) => target.id === "system-a");
  assert(systemA?.extractedPackageDir, "packed System A is required for the external consumer");
  rmSync(TOOLS_CONSUMER, { recursive: true, force: true });
  mkdirSync(join(TOOLS_CONSUMER, "src"), { recursive: true });
  writeFileSync(
    join(TOOLS_CONSUMER, "package.json"),
    `${JSON.stringify(
      {
        name: "external-tools-consumer",
        version: "0.0.0",
        private: true,
        dependencies: { [systemA.packageName]: "*", [TOOLS_PACKAGE_NAME]: "*" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(TOOLS_CONSUMER, "AGENTS.md"), "# External consumer\n\nUser content.\n");
  writeFileSync(join(TOOLS_CONSUMER, "src", "clean.tsx"), CLEAN_SOURCE);
  installPackedPackage(TOOLS_CONSUMER, systemA.packageName, systemA.extractedPackageDir);
  installPackedPackage(TOOLS_CONSUMER, TOOLS_PACKAGE_NAME, toolsExtractedDir);
  stageRuntimeDependencies(TOOLS_CONSUMER, toolsPackageJson.dependencies);
  return systemA;
}

runCheck("packed @prism-system/tools drives an isolated external consumer", () => {
  const systemA = hydrateExternalToolsConsumer();
  const installedToolsDir = join(TOOLS_CONSUMER, "node_modules", "@prism-system", "tools");
  const toolsBin = join(installedToolsDir, toolsPackageJson.bin["prism-ds"].replace(/^\.\//, ""));
  assert(existsSync(toolsBin), `extracted prism-ds bin is missing at ${toolsBin}`);
  const runToolsBin = (args) =>
    spawnSync(process.execPath, [toolsBin, ...args], { cwd: TOOLS_CONSUMER, encoding: "utf8" });

  const consumerPackageJson = join(TOOLS_CONSUMER, "package.json");
  const packageHashBefore = hashFile(consumerPackageJson);
  const dependencyBefore = JSON.parse(readFileSync(consumerPackageJson, "utf8")).dependencies;
  const cleanSourceHashBefore = hashFile(join(TOOLS_CONSUMER, "src", "clean.tsx"));
  const toolsTreeBefore = hashTree(installedToolsDir);

  // Help + public import resolve without any repository access.
  const help = runToolsBin(["--help"]);
  assert(help.status === 0, `prism-ds --help failed: ${output(help)}`);
  for (const command of ["connect", "check-usage", "doctor"]) {
    assert(output(help).includes(command), `prism-ds --help is missing ${command}`);
  }
  const indexPath = `file://${join(installedToolsDir, "src", "index.mjs").replace(/\\/g, "/")}`;
  const imported = spawnSync(
    process.execPath,
    [
      "-e",
      `import(${JSON.stringify(indexPath)}).then((m) => { if (typeof m.connectDesignSystem !== "function" || typeof m.checkUsage !== "function") process.exit(3); });`,
    ],
    { cwd: TOOLS_CONSUMER, encoding: "utf8" },
  );
  assert(imported.status === 0, `tools public import failed: ${output(imported)}`);

  // Read-only doctor before connect (dependency discovery).
  const doctorBefore = runToolsBin(["doctor", "--cwd", TOOLS_CONSUMER]);
  assert(doctorBefore.status === 0, `doctor before connect failed: ${output(doctorBefore)}`);
  assert(
    /installed package/.test(output(doctorBefore)),
    "doctor should report the installed package",
  );

  // Connect through the packed bin.
  const connect = runToolsBin(["connect", systemA.packageName, "--cwd", TOOLS_CONSUMER]);
  assert(connect.status === 0, `prism-ds connect failed: ${output(connect)}`);
  const installedVersion = JSON.parse(
    readFileSync(
      join(TOOLS_CONSUMER, "node_modules", ...systemA.packageName.split("/"), "package.json"),
      "utf8",
    ),
  ).version;
  assert(
    output(connect).includes(`${systemA.packageName}@${installedVersion}`),
    "connect must report the exact version",
  );

  // Exact identity/version invariants via config + manifest.
  const config = JSON.parse(
    readFileSync(join(TOOLS_CONSUMER, ".design-system", "config.json"), "utf8"),
  );
  const manifest = JSON.parse(
    readFileSync(
      join(TOOLS_CONSUMER, "node_modules", ...systemA.packageName.split("/"), "design-system.json"),
      "utf8",
    ),
  );
  assert(config.package === systemA.packageName, "config package identity mismatch");
  assert(config.manifest === "./manifest", "config manifest subpath mismatch");
  assert(config.version === installedVersion, "config version must equal the installed version");
  assert(
    manifest.version === installedVersion,
    "manifest version must equal the installed version",
  );
  assert(manifest.package === systemA.packageName, "manifest package identity mismatch");
  assert(manifest.contract === "v2", "manifest contract must be v2");

  // No copied source: only config + AGENTS in .design-system.
  assert(
    listFiles(join(TOOLS_CONSUMER, ".design-system")).join(",") === "AGENTS.md,config.json",
    ".design-system must contain only config/AGENTS",
  );
  const rootAgents = readFileSync(join(TOOLS_CONSUMER, "AGENTS.md"), "utf8");
  assert(rootAgents.includes("# External consumer"), "user content was not preserved");
  assert(
    rootAgents.includes("BEGIN @prism-system design system contract"),
    "managed block was not appended",
  );

  // No consumer dependency/source/tools mutation.
  assert(hashFile(consumerPackageJson) === packageHashBefore, "consumer package.json was mutated");
  const dependencyAfter = JSON.parse(readFileSync(consumerPackageJson, "utf8")).dependencies;
  assert(
    JSON.stringify(dependencyAfter) === JSON.stringify(dependencyBefore),
    "consumer dependencies were mutated",
  );
  assert(
    hashTree(installedToolsDir) === toolsTreeBefore,
    "the installed tools package was mutated",
  );

  // Doctor after connect.
  const doctorAfter = runToolsBin(["doctor", "--cwd", TOOLS_CONSUMER]);
  assert(doctorAfter.status === 0, `doctor after connect failed: ${output(doctorAfter)}`);
  assert(/version\/identity invariants/.test(output(doctorAfter)), "doctor invariants missing");

  // Strict usage: clean passes.
  const cleanUsage = runToolsBin(["check-usage", "--cwd", TOOLS_CONSUMER]);
  assert(
    cleanUsage.status === 0,
    `strict check-usage failed on clean source: ${output(cleanUsage)}`,
  );

  // Strict usage: a violation fails closed; --no-strict only warns.
  const badPath = join(TOOLS_CONSUMER, "src", "bad.tsx");
  writeFileSync(badPath, BAD_SOURCE);
  const badUsage = runToolsBin(["check-usage", "--cwd", TOOLS_CONSUMER]);
  assert(badUsage.status !== 0, "strict check-usage must fail closed on violations");
  assert(/no-arbitrary-color/.test(output(badUsage)), "expected no-arbitrary-color diagnostic");
  assert(
    /no-visual-style-override/.test(output(badUsage)),
    "expected no-visual-style-override diagnostic",
  );
  const relaxedUsage = runToolsBin(["check-usage", "--cwd", TOOLS_CONSUMER, "--no-strict"]);
  assert(relaxedUsage.status === 0, "--no-strict must downgrade findings to warnings");
  assert(/warning/.test(output(relaxedUsage)), "expected warning diagnostics");
  rmSync(badPath);

  // Repeated connect is idempotent and byte-stable.
  const idempotentBefore = hashConsumer(TOOLS_CONSUMER);
  const again = runToolsBin(["connect", "--cwd", TOOLS_CONSUMER]);
  assert(again.status === 0, `repeated prism-ds connect failed: ${output(again)}`);
  assert(/Already connected/.test(output(again)), "repeated connect should report no changes");
  assert(hashConsumer(TOOLS_CONSUMER) === idempotentBefore, "repeated connect was not byte-stable");
  assert(
    hashTree(installedToolsDir) === toolsTreeBefore,
    "repeated connect mutated the installed tools package",
  );

  // Consumer-owned source is untouched by connect/check-usage.
  assert(
    hashFile(join(TOOLS_CONSUMER, "src", "clean.tsx")) === cleanSourceHashBefore,
    "consumer source changed",
  );
  assert(hashFile(consumerPackageJson) === packageHashBefore, "consumer package.json changed");

  // Doctor fails closed with an actionable message when the package is missing.
  const missing = join(TEMP, "external-tools-consumer-missing");
  rmSync(missing, { recursive: true, force: true });
  mkdirSync(join(missing, "node_modules"), { recursive: true });
  writeFileSync(
    join(missing, "package.json"),
    `${JSON.stringify(
      {
        name: "external-tools-consumer-missing",
        version: "0.0.0",
        private: true,
        dependencies: { [systemA.packageName]: "*" },
      },
      null,
      2,
    )}\n`,
  );
  const missingDoctor = runToolsBin(["doctor", "--cwd", missing]);
  assert(missingDoctor.status !== 0, "doctor must fail closed when the package is missing");
  assert(/not installed/.test(output(missingDoctor)), "doctor must give an actionable message");
});

/* -------------------------------------------------------------------------- */
/* Catalog boundary: packed search/info/install/use against a local registry  */
/* -------------------------------------------------------------------------- */

function sha512Base64(buffer) {
  return `sha512-${createHash("sha512").update(buffer).digest("base64")}`;
}

/** Create a fake npm/pnpm shim that records its fixed arguments and exits 0. */
function writeFakeManager(manager) {
  if (process.platform === "win32") {
    const file = join(FAKE_BIN_DIR, `${manager}.cmd`);
    writeFileSync(
      file,
      ["@echo off", `echo ${manager} %* >>"%FAKE_ARGS_FILE%"`, "exit /b 0", ""].join("\r\n"),
    );
    return file;
  }
  const file = join(FAKE_BIN_DIR, manager);
  writeFileSync(file, `#!/bin/sh\nprintf '%s ' '${manager}' "$@" > "$FAKE_ARGS_FILE"\n`);
  chmodSync(file, 0o755);
  return file;
}

function withFakeManagerEnv() {
  const delimiter = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: `${FAKE_BIN_DIR}${delimiter}${process.env.PATH ?? ""}`,
    FAKE_ARGS_FILE,
  };
}

function readFakeArgs() {
  if (!existsSync(FAKE_ARGS_FILE)) return [];
  const text = readFileSync(FAKE_ARGS_FILE, "utf8").trim();
  if (text === "") return [];
  return text.split(/\s+/);
}

function runPackedTools(args, options = {}) {
  const bin = join(toolsExtractedDir, toolsPackageJson.bin["prism-ds"].replace(/^\.\//, ""));
  assert(existsSync(bin), `packed prism-ds bin is missing at ${bin}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function makeCatalogConsumer(
  name,
  { packageManager, lockfiles = [], installSystemA = false, agents } = {},
) {
  const dir = join(CATALOG_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  const pkg = { name, version: "0.0.0", private: true };
  if (packageManager !== undefined) pkg.packageManager = packageManager;
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(join(dir, "AGENTS.md"), agents ?? "# Catalog consumer\n\nUser content.\n");
  writeFileSync(join(dir, "src", "clean.tsx"), CLEAN_SOURCE);
  for (const lockfile of lockfiles) writeFileSync(join(dir, lockfile), "");
  if (installSystemA) {
    const systemA = targets.find((target) => target.id === "system-a");
    installPackedPackage(dir, systemA.packageName, systemA.extractedPackageDir);
  }
  return dir;
}

/** Start an in-process HTTP registry fixture serving packed System A/B. */
async function startRegistryFixture() {
  const systemA = targets.find((target) => target.id === "system-a");
  const systemB = targets.find((target) => target.id === "system-b");
  const entries = [systemA, systemB].map((target) => {
    const pkg = readJsonFile(join(target.extractedPackageDir, "package.json"));
    const tarballPath = join(
      PACK_DIR,
      readdirSync(PACK_DIR).find((name) => name.includes(target.id) && name.endsWith(".tgz")),
    );
    const tarball = readFileSync(tarballPath);
    return {
      packageName: target.packageName,
      version: pkg.version,
      tarball,
      integrity: sha512Base64(tarball),
      tarballName: `${target.packageName.replace(/[@/]/g, "_")}.tgz`,
    };
  });

  // A tarball without package/design-system.json, to prove fail-closed extraction.
  const missingDir = join(CATALOG_DIR, "missing-manifest");
  mkdirSync(join(missingDir, "package"), { recursive: true });
  writeFileSync(
    join(missingDir, "package", "package.json"),
    `${JSON.stringify({ name: systemA.packageName, version: entries[0].version }, null, 2)}\n`,
  );
  const missingTarballPath = join(CATALOG_DIR, "missing.tgz");
  const missingTar = runTar(["-czf", missingTarballPath, "-C", missingDir, "package"]);
  assert(
    missingTar.status === 0,
    `could not build the missing-manifest tarball: ${output(missingTar)}`,
  );
  const missingTarball = readFileSync(missingTarballPath);

  // Malformed-manifest tarballs that previously could pass partial validation.
  function buildManifestTarball(name, mutate) {
    const baseManifest = readJsonFile(join(systemA.extractedPackageDir, "design-system.json"));
    const basePackage = readJsonFile(join(systemA.extractedPackageDir, "package.json"));
    const manifest = JSON.parse(JSON.stringify(baseManifest));
    mutate(manifest);
    const dir = join(CATALOG_DIR, name);
    mkdirSync(join(dir, "package"), { recursive: true });
    writeFileSync(
      join(dir, "package", "package.json"),
      `${JSON.stringify({ name: basePackage.name, version: basePackage.version }, null, 2)}\n`,
    );
    writeFileSync(
      join(dir, "package", "design-system.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const tarballPath = join(CATALOG_DIR, `${name}.tgz`);
    const tar = runTar(["-czf", tarballPath, "-C", dir, "package"]);
    assert(tar.status === 0, `could not build the ${name} tarball: ${output(tar)}`);
    const bytes = readFileSync(tarballPath);
    return { tarball: bytes, integrity: sha512Base64(bytes) };
  }

  const malformedTarballs = {
    "missing-fields": buildManifestTarball("missing-fields", (manifest) => {
      delete manifest.components.Button.variants;
    }),
    "unknown-field": buildManifestTarball("unknown-field", (manifest) => {
      manifest.unexpected = true;
      manifest.components.Button.extra = [];
    }),
  };

  const searchObjects = entries.map((entry) => ({
    package: {
      name: entry.packageName,
      version: entry.version,
      description: `Lifecycle fixture for ${entry.packageName}`,
      keywords: ["lifecycle", "design-system"],
    },
  }));
  searchObjects.push({ package: { name: "react", version: "19.0.0" } });
  searchObjects.push({ package: { name: "@prism-system/ui-core", version: "1.0.0" } });
  searchObjects.push({ package: { name: "@prism-system/tools", version: "1.0.0" } });

  const state = { requests: [] };
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.statusCode = 400;
      response.end("bad request");
      return;
    }
    state.requests.push(pathname);

    if (pathname === "/-/v1/search") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ objects: searchObjects }));
      return;
    }

    const match =
      /^\/(?:(happy|bad-integrity|missing-manifest|bad-export|missing-fields|unknown-field)\/)?@prism-system\/ui-system-(a|b)$/.exec(
        pathname,
      );
    if (match) {
      const prefix = match[1] ?? "happy";
      const entry = entries.find((candidate) => candidate.packageName.endsWith(`-${match[2]}`));
      const metadata = {
        name: entry.packageName,
        version: entry.version,
        prismSystem: { contract: "v2" },
        exports: { "./manifest": "./design-system.json" },
        dist: {
          tarball: `${registryBase}/tarballs/${entry.tarballName}`,
          integrity: entry.integrity,
        },
      };
      if (prefix === "bad-integrity") {
        metadata.dist.integrity = sha512Base64(Buffer.from("wrong"));
      } else if (prefix === "missing-manifest") {
        metadata.dist.tarball = `${registryBase}/missing.tgz`;
        metadata.dist.integrity = sha512Base64(missingTarball);
      } else if (prefix === "bad-export") {
        metadata.exports = { ".": "./index.js" };
      } else if (prefix === "missing-fields" || prefix === "unknown-field") {
        metadata.dist.tarball = `${registryBase}/${prefix}.tgz`;
        metadata.dist.integrity = malformedTarballs[prefix].integrity;
      }
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          name: entry.packageName,
          "dist-tags": { latest: entry.version },
          versions: { [entry.version]: metadata },
        }),
      );
      return;
    }

    if (pathname.startsWith("/tarballs/")) {
      const name = pathname.slice("/tarballs/".length);
      const entry = entries.find((candidate) => candidate.tarballName === name);
      if (entry) {
        response.end(entry.tarball);
        return;
      }
    }
    if (pathname === "/missing.tgz") {
      response.end(missingTarball);
      return;
    }
    if (pathname === "/missing-fields.tgz" || pathname === "/unknown-field.tgz") {
      response.end(malformedTarballs[pathname.slice(1, -".tgz".length)].tarball);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const registryBase = `http://127.0.0.1:${server.address().port}`;
  return { server, registryBase, state, entries, missingTarball };
}

const toolsSrcHashBefore = hashTree(join(TOOLS_PACKAGE_DIR, "src"));

let fixture = null;
try {
  rmSync(CATALOG_DIR, { recursive: true, force: true });
  mkdirSync(CATALOG_DIR, { recursive: true });
  mkdirSync(FAKE_BIN_DIR, { recursive: true });
  writeFakeManager("npm");
  writeFakeManager("pnpm");
  fixture = await startRegistryFixture();

  await runAsyncCheck("packed search lists only supported styles and mutates nothing", async () => {
    const consumer = makeCatalogConsumer("search", { packageManager: "npm@10.0.0" });
    const before = hashTree(consumer);
    const json = await runPackedTools(["search", "--registry", fixture.registryBase, "--json"]);
    assert(json.status === 0, `search --json failed: ${output(json)}`);
    const parsed = JSON.parse(json.stdout);
    const names = parsed.results.map((entry) => entry.name);
    assert(
      names.join(",") === "@prism-system/ui-system-a,@prism-system/ui-system-b",
      `unexpected search results: ${names.join(",")}`,
    );
    assert(parsed.registry === fixture.registryBase, "search registry mismatch");
    for (const entry of parsed.results) {
      assert(/^\d+\.\d+\.\d+/.test(entry.version), "exact result version");
      assert(Array.isArray(entry.keywords), "allowlisted keywords");
    }
    const human = await runPackedTools(["search", "lifecycle", "--registry", fixture.registryBase]);
    assert(human.status === 0, `search failed: ${output(human)}`);
    assert(output(human).includes("@prism-system/ui-system-a"), "human search output");
    const badSize = await runPackedTools([
      "search",
      "--registry",
      fixture.registryBase,
      "--size",
      "0",
    ]);
    assert(badSize.status !== 0, "search --size 0 must fail closed");
    assert(hashTree(consumer) === before, "search mutated the consumer");
  });

  await runAsyncCheck("packed info validates the manifest and emits stable JSON", async () => {
    const consumer = makeCatalogConsumer("info", { packageManager: "npm@10.0.0" });
    const before = hashTree(consumer);
    const json = await runPackedTools([
      "info",
      "system-a",
      "--registry",
      fixture.registryBase,
      "--json",
    ]);
    assert(json.status === 0, `info --json failed: ${output(json)}`);
    const parsed = JSON.parse(json.stdout);
    assert(parsed.package === "@prism-system/ui-system-a", "info package");
    assert(parsed.version === fixture.entries[0].version, "info version");
    assert(typeof parsed.name === "string" && parsed.name.length > 0, "info name");
    assert(typeof parsed.design.density === "string", "info design density");
    assert(Object.keys(parsed.components).length === 14, "info components");
    assert(parsed.manifest.package === "@prism-system/ui-system-a", "info full manifest");
    assert(parsed.manifest.contract === "v2", "info manifest contract");
    const exact = await runPackedTools([
      "info",
      "@prism-system/ui-system-a",
      fixture.entries[0].version,
      "--registry",
      fixture.registryBase,
      "--json",
    ]);
    assert(exact.status === 0, `info exact version failed: ${output(exact)}`);
    const human = await runPackedTools(["info", "system-a", "--registry", fixture.registryBase]);
    assert(human.status === 0, `info failed: ${output(human)}`);
    assert(output(human).includes("System A"), "human info output");
    assert(hashTree(consumer) === before, "info mutated the consumer");
  });

  await runAsyncCheck("packed info fails closed on untrusted registry data", async () => {
    const cases = [
      {
        args: ["info", "system-a", "--registry", `${fixture.registryBase}/bad-integrity`],
        needle: /integrity mismatch/i,
      },
      {
        args: ["info", "system-a", "--registry", `${fixture.registryBase}/missing-manifest`],
        needle: /missing .*design-system\.json/i,
      },
      {
        args: ["info", "system-a", "--registry", `${fixture.registryBase}/bad-export`],
        needle: /exports\["\.\/manifest"\]/i,
      },
      {
        args: ["info", "system-a", "--registry", `${fixture.registryBase}/missing-fields`],
        needle: /components\.Button\.variants/i,
      },
      {
        args: ["info", "system-a", "--registry", `${fixture.registryBase}/unknown-field`],
        needle: /is not allowed/i,
      },
      {
        args: ["info", "@prism-system/ui-core", "--registry", fixture.registryBase],
        needle: /Unsupported design system package/i,
      },
      {
        args: ["info", "@angular/core", "--registry", fixture.registryBase],
        needle: /Unsupported design system package/i,
      },
      {
        args: ["info", "system-a", "^1.0.0", "--registry", fixture.registryBase],
        needle: /Invalid version/i,
      },
      {
        args: ["info", "system-a", "latest", "--registry", fixture.registryBase],
        needle: /Invalid version/i,
      },
    ];
    for (const testCase of cases) {
      const result = await runPackedTools(testCase.args);
      assert(result.status !== 0, `expected failure for ${testCase.args.join(" ")}`);
      assert(
        testCase.needle.test(output(result)),
        `expected diagnostic for ${testCase.args.join(" ")}: ${output(result)}`,
      );
    }
  });

  await runAsyncCheck("packed install uses fixed manager args and verifies", async () => {
    const consumer = makeCatalogConsumer("install", {
      packageManager: "npm@10.0.0",
      installSystemA: true,
    });
    const consumerPackageBefore = hashFile(join(consumer, "package.json"));
    rmSync(FAKE_ARGS_FILE, { force: true });
    const result = await runPackedTools(
      ["install", "system-a", "--cwd", consumer, "--registry", fixture.registryBase, "--exact"],
      { env: withFakeManagerEnv() },
    );
    assert(result.status === 0, `install failed: ${output(result)}`);
    const args = readFakeArgs();
    assert(args[0] === "npm", `manager shim not invoked: ${args.join(" ")}`);
    const fixed = args.slice(1);
    assert(fixed[0] === "install", "npm verb");
    assert(fixed.includes("--save-prod"), "default prod save");
    assert(fixed.includes("--save-exact"), "--exact");
    assert(fixed.includes("--ignore-scripts"), "--ignore-scripts");
    assert(fixed.includes(`--registry=${fixture.registryBase}`), "registry arg");
    assert(
      fixed[fixed.length - 1] === `@prism-system/ui-system-a@${fixture.entries[0].version}`,
      "exact target last",
    );
    assert(
      hashFile(join(consumer, "package.json")) === consumerPackageBefore,
      "install unexpectedly changed package.json",
    );
    assert(!existsSync(join(consumer, ".design-system")), "install must not connect");

    const devConsumer = makeCatalogConsumer("install-dev", {
      packageManager: "npm@10.0.0",
      installSystemA: true,
    });
    rmSync(FAKE_ARGS_FILE, { force: true });
    const dev = await runPackedTools(
      [
        "install",
        "system-a",
        "--cwd",
        devConsumer,
        "--registry",
        fixture.registryBase,
        "--save-dev",
      ],
      { env: withFakeManagerEnv() },
    );
    assert(dev.status === 0, `install --save-dev failed: ${output(dev)}`);
    const devArgs = readFakeArgs().slice(1);
    assert(devArgs.includes("--save-dev"), "--save-dev");
    assert(!devArgs.includes("--save-prod"), "no prod save with --save-dev");
  });

  await runAsyncCheck("packed install fails closed without invoking the manager", async () => {
    const ambiguous = makeCatalogConsumer("install-ambiguous", {
      lockfiles: ["package-lock.json", "pnpm-lock.yaml"],
    });
    const missing = makeCatalogConsumer("install-missing-manager", {});
    const unsupported = makeCatalogConsumer("install-unsupported", {
      packageManager: "yarn@1.22.0",
    });
    const notFound = makeCatalogConsumer("install-404", {
      packageManager: "npm@10.0.0",
      installSystemA: true,
    });
    const unsafe = makeCatalogConsumer("install-unsafe", {
      packageManager: "npm@10.0.0",
      installSystemA: true,
    });
    const cases = [
      ["install", "system-a", "--cwd", ambiguous, "--registry", fixture.registryBase],
      ["install", "system-a", "--cwd", missing, "--registry", fixture.registryBase],
      ["install", "system-a", "--cwd", unsupported, "--registry", fixture.registryBase],
      ["install", "system-a", "--cwd", notFound, "--registry", `${fixture.registryBase}/nope`],
      ["install", "system-a", "--cwd", unsafe, "--registry", `${fixture.registryBase}/evil;touch`],
    ];
    for (const args of cases) {
      rmSync(FAKE_ARGS_FILE, { force: true });
      const result = await runPackedTools(args, { env: withFakeManagerEnv() });
      assert(result.status !== 0, `expected failure for ${args.join(" ")}`);
      assert(readFakeArgs().length === 0, `manager was invoked for ${args.join(" ")}`);
    }
  });

  await runAsyncCheck("packed install stops at the verification boundary", async () => {
    const consumer = makeCatalogConsumer("install-verify", { packageManager: "npm@10.0.0" });
    rmSync(FAKE_ARGS_FILE, { force: true });
    const result = await runPackedTools(
      ["install", "system-a", "--cwd", consumer, "--registry", fixture.registryBase],
      { env: withFakeManagerEnv() },
    );
    assert(result.status !== 0, "verification failure must fail closed");
    assert(/verification failed/i.test(output(result)), "verification diagnostic");
    assert(!existsSync(join(consumer, ".design-system")), "no connect after verification failure");
  });

  await runAsyncCheck(
    "packed install and use reject an invalid installed manifest at verify",
    async () => {
      const consumer = makeCatalogConsumer("install-invalid-manifest", {
        packageManager: "npm@10.0.0",
        installSystemA: true,
      });
      const installedManifestPath = join(
        consumer,
        "node_modules",
        "@prism-system",
        "ui-system-a",
        "design-system.json",
      );
      const installedManifest = readJsonFile(installedManifestPath);
      delete installedManifest.components.Button.variants;
      writeFileSync(installedManifestPath, `${JSON.stringify(installedManifest, null, 2)}\n`);

      rmSync(FAKE_ARGS_FILE, { force: true });
      const install = await runPackedTools(
        ["install", "system-a", "--cwd", consumer, "--registry", fixture.registryBase],
        { env: withFakeManagerEnv() },
      );
      assert(install.status !== 0, "install must fail closed on an invalid installed manifest");
      assert(/verification failed/i.test(output(install)), "install verification diagnostic");
      assert(/components\.Button\.variants/i.test(output(install)), "shape failure evidence");
      assert(!existsSync(join(consumer, ".design-system")), "install must not connect");

      rmSync(FAKE_ARGS_FILE, { force: true });
      const use = await runPackedTools(
        ["use", "system-a", "--cwd", consumer, "--registry", fixture.registryBase],
        { env: withFakeManagerEnv() },
      );
      assert(use.status !== 0, "use must fail closed on an invalid installed manifest");
      assert(/boundary: verify/i.test(output(use)), "use verify boundary reported");
      assert(!existsSync(join(consumer, ".design-system", "config.json")), "use must not connect");
    },
  );

  await runAsyncCheck("packed use installs, connects, and checks usage", async () => {
    const consumer = makeCatalogConsumer("use", {
      packageManager: "pnpm@10.0.0",
      installSystemA: true,
    });
    rmSync(FAKE_ARGS_FILE, { force: true });
    const result = await runPackedTools(
      ["use", "system-a", "--cwd", consumer, "--registry", fixture.registryBase, "--check-usage"],
      { env: withFakeManagerEnv() },
    );
    assert(result.status === 0, `use failed: ${output(result)}`);
    assert(readFakeArgs()[0] === "pnpm", "pnpm shim invoked");
    assert(existsSync(join(consumer, ".design-system", "config.json")), "use must connect");
    const rootAgents = readFileSync(join(consumer, "AGENTS.md"), "utf8");
    assert(rootAgents.includes("BEGIN @prism-system design system contract"), "managed block");
    assert(/0 error\(s\), 0 warning\(s\)/.test(output(result)), "usage summary");

    const again = await runPackedTools(
      ["use", "system-a", "--cwd", consumer, "--registry", fixture.registryBase, "--check-usage"],
      { env: withFakeManagerEnv() },
    );
    assert(again.status === 0, `repeated use failed: ${output(again)}`);
    assert(/already up to date/i.test(output(again)), "repeated use should be idempotent");
    const markers =
      readFileSync(join(consumer, "AGENTS.md"), "utf8").split(
        "BEGIN @prism-system design system contract",
      ).length - 1;
    assert(markers === 1, "managed block must not be duplicated");
  });

  await runAsyncCheck("packed use stops at the connect boundary without rollback", async () => {
    const consumer = makeCatalogConsumer("use-connect-fail", {
      packageManager: "npm@10.0.0",
      installSystemA: true,
      agents:
        "# Catalog consumer\n\n<!-- BEGIN @prism-system design system contract (managed) -->\npartial\n",
    });
    rmSync(FAKE_ARGS_FILE, { force: true });
    const result = await runPackedTools(
      ["use", "system-a", "--cwd", consumer, "--registry", fixture.registryBase],
      { env: withFakeManagerEnv() },
    );
    assert(result.status !== 0, "connect failure must fail closed");
    assert(/boundary: connect/i.test(output(result)), "connect boundary reported");
    assert(/no rollback was attempted/i.test(output(result)), "no-rollback boundary message");
    assert(
      existsSync(join(consumer, "node_modules", "@prism-system", "ui-system-a", "package.json")),
      "package remains installed",
    );
    assert(
      !existsSync(join(consumer, ".design-system", "config.json")),
      "config must not be written",
    );
  });

  await runAsyncCheck("connect, doctor, and check-usage stay offline", async () => {
    const consumer = makeCatalogConsumer("offline", {
      packageManager: "npm@10.0.0",
      installSystemA: true,
    });
    const requestsBefore = fixture.state.requests.length;
    const connect = await runPackedTools(["connect", "system-a", "--cwd", consumer]);
    assert(connect.status === 0, `connect failed: ${output(connect)}`);
    const doctor = await runPackedTools(["doctor", "--cwd", consumer]);
    assert(doctor.status === 0, `doctor failed: ${output(doctor)}`);
    const usage = await runPackedTools(["check-usage", "--cwd", consumer]);
    assert(usage.status === 0, `check-usage failed: ${output(usage)}`);
    assert(
      fixture.state.requests.length === requestsBefore,
      "connect/doctor/check-usage made registry requests",
    );
    for (const command of ["connect", "doctor", "check-usage"]) {
      const rejected = await runPackedTools([
        command,
        "--cwd",
        consumer,
        "--registry",
        fixture.registryBase,
      ]);
      assert(rejected.status !== 0, `${command} must reject --registry`);
      assert(
        /Unknown option/i.test(output(rejected)),
        `${command} should reject --registry as unknown`,
      );
    }
  });

  await runAsyncCheck("importing packed tools performs no network or manager work", () => {
    const entry = join(toolsExtractedDir, "src", "index.mjs");
    const script = `globalThis.fetch = undefined; import(${JSON.stringify(
      `file://${entry.replace(/\\/g, "/")}`,
    )}).then((m) => { if (typeof m.searchDesignSystems !== "function") process.exit(3); if (typeof m.buildInstallCommand !== "function") process.exit(4); let threw = false; try { m.buildInstallCommand({ manager: "npm", packageName: "@prism-system/ui-system-a", version: "1.0.0", registry: "https://x;rm" }); } catch { threw = true; } if (!threw) process.exit(5); });`;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: TOOLS_CONSUMER,
      encoding: "utf8",
    });
    assert(result.status === 0, `packed index import failed: ${output(result)}`);
  });

  await runAsyncCheck("packed catalog leaves repository source untouched", () => {
    assert(
      hashTree(join(TOOLS_PACKAGE_DIR, "src")) === toolsSrcHashBefore,
      "packages/tools/src was mutated",
    );
  });
} finally {
  if (fixture !== null) {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
}

runCheck("repository and registry were not mutated", () => {
  for (const file of REPO_MUTATION_WATCH) {
    assert(
      hashFile(join(ROOT, file)) === repoHashesBefore.get(file),
      `repository file was mutated: ${file}`,
    );
  }
  assert(
    !existsSync(join(ROOT, "packages", GENERATED_ID)),
    "repository packages/ gained a generated package",
  );
});

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const failures = results.filter((result) => !result.ok);
log("");
log(
  `${results.length - failures.length}/${results.length} V3 lifecycle check(s) passed. ` +
    `Artifacts under ${toPosix(relative(ROOT, TEMP))}.`,
);

if (failures.length > 0) {
  log("V3 lifecycle check failed:");
  for (const failure of failures) log(`  - ${failure.name}: ${failure.error}`);
  process.exitCode = 1;
} else {
  log("V3 lifecycle check passed.");
}

mkdirSync(TEMP, { recursive: true });
writeFileSync(LOG_PATH, `${logs.join("\n")}\n`, "utf8");
