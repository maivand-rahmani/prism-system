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
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { repoRoot } from "./register-design-system.mjs";
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

const REPO_MUTATION_WATCH = [
  "config/design-systems.json",
  "packages/system-a/package.json",
  "packages/system-a/design-system.json",
  "packages/system-b/package.json",
  "packages/system-b/design-system.json",
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

function hashConsumer(dir) {
  const files = ["package.json", "AGENTS.md"];
  for (const file of listFiles(join(dir, ".design-system"))) files.push(`.design-system/${file}`);
  for (const file of listFiles(join(dir, "src"))) files.push(`src/${file}`);
  return files
    .sort()
    .map((file) => `${file}:${hashFile(join(dir, file))}`)
    .join("\n");
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
