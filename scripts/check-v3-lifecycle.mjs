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

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
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
