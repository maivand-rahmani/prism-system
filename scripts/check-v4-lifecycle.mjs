#!/usr/bin/env node
/**
 * V4 Phase 5 end-to-end lifecycle acceptance harness (`pnpm ds:check-v4`).
 *
 * A deterministic, fail-closed superset of the Phase 3 packed-tools check. It
 * verifies the *packed* V4 lifecycle end to end and orchestrates the existing
 * `ds:check-v4-tools` harness unchanged:
 *
 *   1. snapshot the repository version/config/manifest state (hashes);
 *   2. build `@prism-system/ui-core`, System A, and System B from source;
 *   3. validate both systems statically (`validateDesignSystem`, no commands);
 *   4. run the Phase 3 packed-tools check as a child process
 *      (`scripts/check-v4-tools-packed.mjs`) for the V2 fixture and the full
 *      packed `prism-ds` CLI lifecycle;
 *   5. generate a fresh V4 package from the canonical template into TEMP only
 *      (`ds:create --output <temp> --no-register`), build it, and pack it;
 *   6. pack and inspect ui-core, System A, System B, the fresh generated
 *      package, and `@prism-system/tools`;
 *   7. hydrate isolated TEMP consumers from the packed artifacts only and
 *      typecheck every public import: the twenty required V4 exports, each
 *      system's declared optional set, the `@prism-system/ui-core` V4 contract
 *      names, `./manifest`, `./tokens`, `./styles.css`, and `./tailwind.css`;
 *   8. resolve and load the packed public exports at runtime from a consumer;
 *   9. install the exact `tailwindcss@4.3.3` + `@tailwindcss/cli@4.3.3`
 *      toolchain into this run's TEMP directory (`npm install --ignore-scripts
 *      --no-save --no-package-lock`) and compile a real consumer stylesheet
 *      through Tailwind v4 against the packed package imports, asserting a
 *      representative semantic utility resolves to the packed package's CSS
 *      token variable and value;
 *  10. exercise `prepareRelease` in dry-run mode against TEMP-only invalid
 *      copies (incomplete tokens, missing required component, missing manifest,
 *      missing Tailwind bridge) and against the approval gate, asserting every
 *      case is blocked, byte-stable, and never versions, packs, or publishes;
 *  11. re-verify that every repository version/config/manifest file is
 *      byte-identical (build `dist/` outputs and TEMP artifacts may change).
 *
 * Safety: every artifact, consumer, and log lives under a fresh unique
 * `TEMP/v4/lifecycle-<uuid>/` directory. Creating that directory must not
 * overwrite anything: a collision fails closed. No fixed `TEMP` path is ever
 * cleaned, no prior harness output is touched, and nothing outside the run
 * directory is removed.
 *
 * Network: the only network operation is the explicitly logged transient npm
 * install of the exact Tailwind v4 toolchain (step 9), scoped to this run's
 * TEMP directory. No repository package.json or lockfile is modified.
 *
 * Requires an installed pnpm workspace. The harness builds the packages it
 * needs itself; it never runs `changeset version`, version sync, `ds:release
 * --approved`, publish, or mutating git commands.
 *
 * CLI: pnpm ds:check-v4
 */

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFile, repoRoot, toTokensExport } from "./register-design-system.mjs";
import { validateDesignSystem } from "./validate-design-system.mjs";
import {
  computeNextVersion,
  defaultBumpFor,
  inspectTarball,
  prepareRelease,
} from "./prepare-release.mjs";
import {
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  MANIFEST_EXPORT_SUBPATH,
  V4_OPTIONAL_COMPONENTS,
  V4_REQUIRED_COMPONENTS,
} from "./design-system-manifest.mjs";

const ROOT = repoRoot();
const TEMP_ROOT = join(ROOT, "TEMP", "v4");
const RUN_DIR_NAME = `lifecycle-${randomUUID()}`;
const TEMP = join(TEMP_ROOT, RUN_DIR_NAME);
const PACK_DIR = join(TEMP, "pack");
const EXTRACT_DIR = join(TEMP, "extract");
const GENERATED_DIR = join(TEMP, "generated");
const CONSUMER_DIR = join(TEMP, "consumers");
const RELEASE_DIR = join(TEMP, "release");
const TAILWIND_DIR = join(TEMP, "tailwind");
const LOG_PATH = join(TEMP, "check-v4-lifecycle.log");

const GENERATED_ID = "lifecycle-demo";
const GENERATED_PACKAGE_NAME = `@prism-system/ui-${GENERATED_ID}`;
const CORE_PACKAGE_NAME = "@prism-system/ui-core";
const TOOLS_PACKAGE_NAME = "@prism-system/tools";
const TOOLS_PACKAGE_DIR = join(ROOT, "packages", "tools");

const SYSTEM_IDS = ["system-a", "system-b"];

/** The canonical twenty required V4 component names, in contract order. */
export const V4_REQUIRED_COMPONENT_NAMES = Object.freeze([...V4_REQUIRED_COMPONENTS]);

/** The optional capability set each test system declares (V4 Phase 2). */
export const OPTIONAL_SETS = Object.freeze({
  "system-a": Object.freeze([
    "Grid",
    "Fieldset",
    "Alert",
    "Progress",
    "Accordion",
    "Pagination",
    "Table",
  ]),
  "system-b": Object.freeze(["Section", "Alert", "Skeleton", "Toast", "Avatar", "Breadcrumbs"]),
});

/** Exact Tailwind v4 toolchain versions compiled against packed artifacts. */
const TAILWIND_VERSION = "4.3.3";
const TAILWIND_CLI_PACKAGE = "@tailwindcss/cli";
const TAILWIND_CLI_ENTRY = join(
  TAILWIND_DIR,
  "node_modules",
  "@tailwindcss",
  "cli",
  "dist",
  "index.mjs",
);

/** Repository files whose bytes must never change across a run. */
const REPO_STATE_FILES = Object.freeze([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "config/design-systems.json",
  "schemas/fixtures/v2-valid/design-system.json",
  "templates/design-system/package.json.template",
  "templates/design-system/design-system.source.json.template",
  "templates/design-system/tokens.source.json.template",
]);

/** Package-owned version and manifest sources watched for every package. */
const PACKAGE_STATE_FILES = Object.freeze([
  "package.json",
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  "design-system.source.json",
  "tokens.source.json",
  "src/design-system.ts",
]);

/** Directories excluded from the TEMP-only release fixture copies. */
const RELEASE_EXCLUDED = Object.freeze(["node_modules", "dist", ".turbo", ".next"]);

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for the focused test)                               */
/* -------------------------------------------------------------------------- */

function toPosix(path) {
  return path.split(sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Every file under `dir`, relative POSIX paths, sorted for determinism. */
export function listFiles(dir) {
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

export function hashTree(dir) {
  return listFiles(dir)
    .map((file) => `${file}:${hashFile(join(dir, file))}`)
    .join("\n");
}

/**
 * Create `<baseDir>/<name>` without recursive reuse, so an existing path fails
 * closed (EEXIST) instead of being deleted or overwritten.
 */
export function createUniqueRunDirectory(baseDir, name) {
  mkdirSync(baseDir, { recursive: true });
  const dir = join(baseDir, name);
  mkdirSync(dir);
  return dir;
}

/**
 * The first declaration value of a CSS custom property, trimmed, or null.
 * Used to prove a compiled utility points at the packed package's token value.
 */
export function cssVariableValue(cssText, variableName) {
  const pattern = new RegExp(`${escapeRegExp(variableName)}\\s*:\\s*([^;{}]+);`);
  const match = pattern.exec(cssText);
  return match ? match[1].trim() : null;
}

/** `text-prism-text-primary`, `bg-prism-surface-raised`, ... */
export function semanticUtilityClass(tailwindPrefix, kind, tokenName) {
  return `${kind}-${tailwindPrefix}-${tokenName}`;
}

/** The declaration body of a single-class CSS rule, or null when absent. */
export function semanticUtilityRule(cssText, utilityClass) {
  const pattern = new RegExp(`\\.${escapeRegExp(utilityClass)}\\s*\\{([^}]*)\\}`);
  const match = pattern.exec(cssText);
  return match ? match[1] : null;
}

/** The canonical consumer stylesheet compiled by the Tailwind CLI. */
export function buildTailwindProbeCss(packageName) {
  return [
    '@import "tailwindcss";',
    `@import "${packageName}/tailwind.css";`,
    `@import "${packageName}/styles.css";`,
    '@source "./Probe.tsx";',
    "",
  ].join("\n");
}

/** The source file whose semantic utilities the Tailwind CLI must generate. */
export function buildTailwindProbeSource(tailwindPrefix) {
  const textUtility = semanticUtilityClass(tailwindPrefix, "text", "text-primary");
  const surfaceUtility = semanticUtilityClass(tailwindPrefix, "bg", "surface-raised");
  return [
    "export const Probe = () => (",
    `  <p className="${textUtility} ${surfaceUtility}">`,
    "    Probe",
    "  </p>",
    ");",
    "",
  ].join("\n");
}

/**
 * Hash every repository file whose bytes must stay identical across the run:
 * the root package/lock/workspace/config files, every package's version and
 * manifest sources, every app package.json, and Changesets entries.
 */
export function collectRepoVersionState(root) {
  const state = new Map();
  const add = (relPath) => {
    const absolute = join(root, relPath);
    if (existsSync(absolute)) state.set(relPath, hashFile(absolute));
  };
  for (const relPath of REPO_STATE_FILES) add(relPath);

  const subdirectories = (parent) => {
    const absolute = join(root, parent);
    if (!existsSync(absolute)) return [];
    return readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  };
  for (const id of subdirectories("packages")) {
    for (const relPath of PACKAGE_STATE_FILES) add(`packages/${id}/${relPath}`);
  }
  for (const id of subdirectories("apps")) add(`apps/${id}/package.json`);

  const changesetDir = join(root, ".changeset");
  if (existsSync(changesetDir)) {
    for (const name of readdirSync(changesetDir).sort()) {
      if (name.toLowerCase().endsWith(".md")) add(`.changeset/${name}`);
    }
  }
  return state;
}

/**
 * The consumer TypeScript source that typechecks every public import of the
 * packed packages: all twenty required exports, the declared optionals, the
 * ui-core V4 contract names, `./manifest`, `./tokens`, `./styles.css`, and
 * `./tailwind.css`.
 *
 * @param {{namespace: string, id: string, packageName: string, optional: string[]}[]} systems
 */
export function buildTypecheckSource(systems) {
  if (systems.length === 0) throw new Error("buildTypecheckSource requires at least one system");
  for (const system of systems) {
    if (typeof system.tokensExport !== "string" || system.tokensExport.length === 0) {
      throw new Error(`buildTypecheckSource requires a tokensExport for ${system.namespace}`);
    }
  }
  const namespaces = systems.map((system) => system.namespace);
  const lines = [
    'import * as React from "react";',
    ...systems.map(
      (system) => `import * as ${system.namespace} from ${JSON.stringify(system.packageName)};`,
    ),
    "import {",
    "  OPTIONAL_COMPONENTS_V4,",
    "  REQUIRED_COMPONENTS_V4,",
    "  defineDesignSystemV4,",
    "  type DesignSystemComponentNameV4,",
    "  type DesignSystemComponentsV4,",
    "  type DesignSystemV4,",
    '} from "@prism-system/ui-core";',
    ...systems.map(
      (system, index) =>
        `import manifest${index} from ${JSON.stringify(`${system.packageName}/manifest`)};`,
    ),
    ...systems.map(
      (system) =>
        `import { ${system.tokensExport} } from ${JSON.stringify(`${system.packageName}/tokens`)};`,
    ),
    `import ${JSON.stringify(`${systems[0].packageName}/styles.css`)};`,
    `import ${JSON.stringify(`${systems[0].packageName}/tailwind.css`)};`,
    "",
    "type RequiredName = (typeof REQUIRED_COMPONENTS_V4)[number];",
    "",
  ];

  for (const system of systems) {
    lines.push(`const ${system.namespace}Required: Record<RequiredName, unknown> = {`);
    for (const name of V4_REQUIRED_COMPONENT_NAMES) {
      lines.push(`  ${name}: ${system.namespace}.${name},`);
    }
    lines.push("};", "");
    if (system.optional.length > 0) {
      lines.push(
        `const ${system.namespace}OptionalNames = ${JSON.stringify(system.optional)} as const;`,
      );
      lines.push(
        `const ${system.namespace}Optional: Record<(typeof ${system.namespace}OptionalNames)[number], unknown> = {`,
      );
      for (const name of system.optional) {
        lines.push(`  ${name}: ${system.namespace}.${name},`);
      }
      lines.push("};", "");
    }
  }

  lines.push(
    "const requiredNames: readonly DesignSystemComponentNameV4[] = REQUIRED_COMPONENTS_V4;",
    "const optionalNames: readonly DesignSystemComponentNameV4[] = OPTIONAL_COMPONENTS_V4;",
    "type V4ComponentMap = DesignSystemComponentsV4;",
    "const designSystemV4: DesignSystemV4 | null = null;",
    "const factory: typeof defineDesignSystemV4 = defineDesignSystemV4;",
    "",
    "const probe = (",
    `  <${namespaces[0]}.Container>`,
    `    <${namespaces[0]}.Stack>`,
    `      <${namespaces[0]}.Heading level={1}>Public imports</${namespaces[0]}.Heading>`,
    `      <${namespaces[0]}.Text>Body</${namespaces[0]}.Text>`,
    `      <${namespaces[0]}.Link href="/probe">Probe</${namespaces[0]}.Link>`,
    `      <${namespaces[0]}.Button>Probe</${namespaces[0]}.Button>`,
    `    </${namespaces[0]}.Stack>`,
    `  </${namespaces[0]}.Container>`,
    ");",
    "",
    "export const publicImports = {",
    "  React,",
    "  probe,",
    "  requiredNames,",
    "  optionalNames,",
    "  designSystemV4,",
    "  factory,",
    "  type: null as V4ComponentMap | null,",
    `  required: [${namespaces.map((namespace) => `${namespace}Required`).join(", ")}],`,
    `  optional: [${systems
      .filter((system) => system.optional.length > 0)
      .map((system) => `${system.namespace}Optional`)
      .join(", ")}],`,
    `  manifests: [${systems.map((_system, index) => `manifest${index}`).join(", ")}],`,
    `  tokens: [${systems.map((system) => system.tokensExport).join(", ")}],`,
    "} satisfies Record<string, unknown>;",
    "",
  );
  return lines.join("\n");
}

/**
 * A consumer-side Node script that resolves and loads every packed public
 * export from the consumer's own `node_modules`, proving the published
 * `exports` map works at runtime (not just for TypeScript).
 */
export function buildRuntimeProbeSource(packages, consumerRoot) {
  return `import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const consumerRoot = ${JSON.stringify(consumerRoot)};
const nodeModulesPrefix = join(consumerRoot, "node_modules") + sep;
const packages = ${JSON.stringify(packages, null, 2)};
const report = { ok: true, errors: [], resolved: {}, manifestVersions: {}, tokenExports: {}, designSystemVersions: {} };
const fail = (message) => report.errors.push(message);

for (const entry of packages) {
  for (const subpath of [".", "./manifest", "./tokens", "./styles.css", "./tailwind.css"]) {
    const specifier = subpath === "." ? entry.packageName : entry.packageName + "/" + subpath.slice(2);
    try {
      const resolved = require.resolve(specifier);
      if (!existsSync(resolved)) fail(specifier + " resolved to a missing file");
      else if (!resolved.startsWith(nodeModulesPrefix)) fail(specifier + " resolved outside the consumer node_modules");
      report.resolved[specifier] = resolved;
    } catch (error) {
      fail(specifier + ": " + (error.code ?? error.message));
    }
  }
  try {
    const manifest = require(entry.packageName + "/manifest");
    report.manifestVersions[entry.packageName] = manifest.version;
    if (manifest.version !== entry.version) fail(entry.packageName + " manifest version mismatch");
    if (manifest.contract !== "v4") fail(entry.packageName + " manifest contract is not v4");
  } catch (error) {
    fail(entry.packageName + "/manifest: " + (error.code ?? error.message));
  }
  try {
    const tokens = await import(entry.packageName + "/tokens");
    const tokensExport = tokens[entry.tokensExport];
    report.tokenExports[entry.packageName] = typeof tokensExport;
    if (typeof tokensExport !== "object" || tokensExport === null) {
      fail(entry.packageName + "/tokens does not export " + entry.tokensExport);
    }
  } catch (error) {
    fail(entry.packageName + "/tokens: " + error.message);
  }
  try {
    const system = await import(entry.packageName);
    report.designSystemVersions[entry.packageName] = system.DesignSystem?.version ?? null;
    if (system.DesignSystem?.version !== entry.version) {
      fail(entry.packageName + " runtime DesignSystem.version mismatch");
    }
  } catch (error) {
    fail(entry.packageName + " root import: " + error.message);
  }
}

try {
  const core = await import("@prism-system/ui-core");
  if (core.REQUIRED_COMPONENTS_V4?.length !== 20) fail("ui-core REQUIRED_COMPONENTS_V4 length");
  if (core.OPTIONAL_COMPONENTS_V4?.length !== 12) fail("ui-core OPTIONAL_COMPONENTS_V4 length");
  if (typeof core.defineDesignSystemV4 !== "function") fail("ui-core defineDesignSystemV4");
  if (typeof core.createDesignSystemRegistryV4 !== "function") {
    fail("ui-core createDesignSystemRegistryV4");
  }
} catch (error) {
  fail("ui-core import: " + error.message);
}

report.ok = report.errors.length === 0;
process.stdout.write(JSON.stringify(report));
process.exitCode = report.ok ? 0 : 1;
`;
}

/* -------------------------------------------------------------------------- */
/* Check runner and process helpers                                           */
/* -------------------------------------------------------------------------- */

const results = [];
const logs = [];
const RUN_DIRECTORY_SETUP_ABORT = Symbol("run-directory-setup-abort");

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

function runPnpm(args, options = {}) {
  return spawnSync("pnpm", args, { cwd: ROOT, encoding: "utf8", shell: true, ...options });
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", ...options });
}

function runTar(args) {
  return spawnSync("tar", args, { cwd: ROOT, encoding: "utf8" });
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

/** Read a tarball's entry list through the system `tar`. */
function tarballEntries(tarballPath) {
  const result = runTar(["-tzf", tarballPath]);
  assert(result.status === 0, `tar -tzf failed: ${output(result)}`);
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function packPackage(packageDir, label) {
  const pack = runPnpm(["pack", "--pack-destination", PACK_DIR], { cwd: packageDir });
  assert(pack.status === 0, `pnpm pack failed for ${label}: ${output(pack)}`);
  const tarball = readdirSync(PACK_DIR).find(
    (name) => name.includes(label.replace(/[@/]/g, "-")) && name.endsWith(".tgz"),
  );
  assert(tarball, `no tarball was produced for ${label}`);
  return join(PACK_DIR, tarball);
}

function extractTarball(tarballPath, targetDir, label) {
  mkdirSync(targetDir, { recursive: true });
  const extract = runTar(["-xzf", tarballPath, "-C", targetDir]);
  assert(extract.status === 0, `failed to extract ${label}: ${output(extract)}`);
  return join(targetDir, "package");
}

/** Resolve the on-disk directory of an installed package from a package.json. */
function resolveInstalledPackage(name, fromPackageJson) {
  const requireFrom = createRequire(fromPackageJson);
  let entry;
  try {
    entry = requireFrom.resolve(`${name}/package.json`);
  } catch {
    entry = requireFrom.resolve(name);
  }
  let dir = dirname(entry);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return realpathSync.native(dir);
    const parent = dirname(dir);
    assert(parent !== dir, `could not locate the installed package directory for ${name}`);
    dir = parent;
  }
}

/**
 * Link an already-installed workspace dependency into an isolated consumer
 * from the workspace, so packed artifacts can resolve react/radix/typescript
 * without a network install and without touching the repository.
 */
function stageInstalledDependency(consumerRoot, name, fromPackageJson) {
  const target = join(consumerRoot, "node_modules", ...name.split("/"));
  if (existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  const source = resolveInstalledPackage(name, fromPackageJson);
  try {
    symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  } catch {
    cpSync(source, target, { recursive: true });
  }
}

/** Copy a packed artifact (its `package/` directory) into a consumer. */
function stagePackedPackage(consumerRoot, packageName, packedDir) {
  const target = join(consumerRoot, "node_modules", ...packageName.split("/"));
  assert(!existsSync(target), `${packageName} is already staged in ${consumerRoot}`);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(packedDir, target, { recursive: true });
  return target;
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const repoStateBefore = new Map();
let runDirectoryReady = false;

/** Packed V4 targets, hydrated during the packing step. */
const systemTargets = SYSTEM_IDS.map((id) => ({
  id,
  packageName: `@prism-system/ui-${id}`,
  packageDir: join(ROOT, "packages", id),
  tokensExport: toTokensExport(id),
}));

const generatedTarget = {
  id: GENERATED_ID,
  packageName: GENERATED_PACKAGE_NAME,
  packageDir: join(GENERATED_DIR, "packages", GENERATED_ID),
  tokensExport: toTokensExport(GENERATED_ID),
};

const typecheckSystems = [
  {
    namespace: "SystemA",
    id: "system-a",
    packageName: systemTargets[0].packageName,
    tokensExport: systemTargets[0].tokensExport,
    optional: [...OPTIONAL_SETS["system-a"]],
  },
  {
    namespace: "SystemB",
    id: "system-b",
    packageName: systemTargets[1].packageName,
    tokensExport: systemTargets[1].tokensExport,
    optional: [...OPTIONAL_SETS["system-b"]],
  },
  {
    namespace: "Generated",
    id: GENERATED_ID,
    packageName: GENERATED_PACKAGE_NAME,
    tokensExport: generatedTarget.tokensExport,
    optional: [],
  },
];

/** Create a TEMP-only release fixture root mirroring the real system-a. */
function makeReleaseFixtureRoot(name) {
  const caseRoot = join(RELEASE_DIR, name);
  assert(!existsSync(caseRoot), `release fixture already exists: ${caseRoot}`);
  mkdirSync(join(caseRoot, "config"), { recursive: true });
  mkdirSync(join(caseRoot, ".changeset"), { recursive: true });
  cpSync(join(ROOT, "packages", "system-a"), join(caseRoot, "packages", "system-a"), {
    recursive: true,
    filter: (source) => !RELEASE_EXCLUDED.includes(source.split(/[\\/]/).pop()),
  });
  const registry = readJsonFile(join(ROOT, "config", "design-systems.json"));
  const entries = registry.designSystems.filter((entry) => entry.id === "system-a");
  assert(entries.length === 1, "the repository registry must contain exactly one system-a entry");
  writeJson(join(caseRoot, "config", "design-systems.json"), {
    version: registry.version,
    designSystems: entries,
  });
  return caseRoot;
}

async function main() {
  try {
    /* ---------------------------------------------------------------------- */
    /* Step 0: unique run directory                                           */
    /* ---------------------------------------------------------------------- */

    runCheck("prepare unique TEMP/v4/lifecycle-<uuid> run directory", () => {
      // mkdir (non-recursive) fails closed on collision: nothing is ever
      // deleted or overwritten.
      const dir = createUniqueRunDirectory(TEMP_ROOT, RUN_DIR_NAME);
      assert(dir === TEMP, `run directory mismatch: ${dir}`);
      for (const subdir of [
        PACK_DIR,
        EXTRACT_DIR,
        GENERATED_DIR,
        CONSUMER_DIR,
        RELEASE_DIR,
        TAILWIND_DIR,
      ]) {
        mkdirSync(subdir, { recursive: true });
      }
      runDirectoryReady = true;
      log(`INFO run directory: ${toPosix(relative(ROOT, TEMP))}`);
    });

    // A failed setup (especially EEXIST) means TEMP may belong to a previous
    // run. Do not allow later checks to create or overwrite anything there.
    if (!runDirectoryReady) throw RUN_DIRECTORY_SETUP_ABORT;

    /* ---------------------------------------------------------------------- */
    /* Step 1: repository state before                                        */
    /* ---------------------------------------------------------------------- */

    runCheck("snapshot repository version/config/manifest state (before)", () => {
      const state = collectRepoVersionState(ROOT);
      assert(state.size >= 20, `unexpectedly few repository state files: ${state.size}`);
      for (const [file, hash] of state) repoStateBefore.set(file, hash);
      log(
        `INFO watched ${state.size} repository files (root package/lock/config, ` +
          "package manifests/sources, apps, changesets)",
      );
    });

    /* ---------------------------------------------------------------------- */
    /* Step 2: build the packages the harness packs                           */
    /* ---------------------------------------------------------------------- */

    runCheck("build @prism-system/ui-core, System A, and System B", () => {
      const build = runPnpm([
        "--filter",
        CORE_PACKAGE_NAME,
        "--filter",
        systemTargets[0].packageName,
        "--filter",
        systemTargets[1].packageName,
        "run",
        "build",
      ]);
      assert(build.status === 0, `pnpm build failed: ${output(build)}`);
      for (const target of [
        join(ROOT, "packages", "core"),
        ...systemTargets.map((t) => t.packageDir),
      ]) {
        assert(
          existsSync(join(target, "dist")),
          `${toPosix(relative(ROOT, target))} has no dist/ after the build`,
        );
      }
    });

    runCheck("validate System A and System B (static)", () => {
      for (const id of SYSTEM_IDS) {
        const result = validateDesignSystem({ id, root: ROOT, runCommands: false });
        assert(result.ok, `ds:check ${id} failed: ${result.failures.join("; ")}`);
      }
    });

    /* ---------------------------------------------------------------------- */
    /* Step 3: compose the Phase 3 packed-tools check unchanged               */
    /* ---------------------------------------------------------------------- */

    runCheck("run pnpm ds:check-v4-tools (V2 fixture + packed CLI lifecycle)", () => {
      const child = runPnpm(["ds:check-v4-tools"], { maxBuffer: 32 * 1024 * 1024 });
      const text = output(child);
      assert(child.status === 0, `ds:check-v4-tools failed:\n${text}`);
      assert(
        /V4 packed-tools check passed\./.test(text),
        `ds:check-v4-tools did not report success:\n${text}`,
      );
      const summary = text
        .split(/\r?\n/)
        .filter((line) => line.startsWith("PASS") || line.includes("check(s) passed"));
      for (const line of summary) log(`  tools: ${line.trim()}`);
    });

    /* ---------------------------------------------------------------------- */
    /* Step 4: fresh V4 template package (TEMP only)                          */
    /* ---------------------------------------------------------------------- */

    runCheck("generate a fresh V4 package from the template (TEMP only)", () => {
      const create = runNode([
        join(ROOT, "scripts", "create-design-system.mjs"),
        GENERATED_ID,
        "--output",
        GENERATED_DIR,
        "--no-register",
      ]);
      assert(create.status === 0, `ds:create failed: ${output(create)}`);
      assert(
        existsSync(join(generatedTarget.packageDir, "package.json")),
        "generated package.json is missing",
      );
      assert(
        !existsSync(join(ROOT, "packages", GENERATED_ID)),
        "generation must not touch repository packages/",
      );
      assert(
        !existsSync(join(GENERATED_DIR, "config")),
        "generation with --no-register must not write a registry",
      );
      const pkg = readJsonFile(join(generatedTarget.packageDir, "package.json"));
      const manifest = readJsonFile(
        join(generatedTarget.packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME),
      );
      assert(manifest.contract === "v4", "fresh template package must declare contract v4");
      assert(manifest.schemaVersion === 2, "fresh template manifest must be schemaVersion 2");
      assert(
        manifest.version === pkg.version,
        "fresh template manifest version must equal package.json version",
      );
      const declared = Object.keys(manifest.components);
      assert(
        declared.length === V4_REQUIRED_COMPONENT_NAMES.length &&
          V4_REQUIRED_COMPONENT_NAMES.every((name) => declared.includes(name)),
        `fresh template must declare exactly the twenty required components: ${declared.join(", ")}`,
      );
    });

    runCheck("build the fresh generated V4 package in TEMP", () => {
      const link = join(generatedTarget.packageDir, "node_modules");
      if (!existsSync(link)) {
        symlinkSync(
          join(ROOT, "packages", "system-a", "node_modules"),
          link,
          process.platform === "win32" ? "junction" : "dir",
        );
      }
      const build = runPnpm(["run", "build"], { cwd: generatedTarget.packageDir });
      assert(build.status === 0, `generated template build failed: ${output(build)}`);
      assert(
        existsSync(join(generatedTarget.packageDir, "dist")),
        "generated template build produced no dist/",
      );
    });

    /* ---------------------------------------------------------------------- */
    /* Step 5: pack and inspect every artifact                                */
    /* ---------------------------------------------------------------------- */

    runCheck("pack and inspect @prism-system/ui-core", () => {
      const coreDir = join(ROOT, "packages", "core");
      const tarball = packPackage(coreDir, "core");
      const entries = tarballEntries(tarball);
      for (const required of [
        "package/package.json",
        "package/README.md",
        "package/AGENTS.md",
        "package/LICENSE",
        "package/dist/index.js",
        "package/dist/index.d.ts",
      ]) {
        assert(entries.includes(required), `ui-core tarball is missing ${required}`);
      }
      for (const entry of entries) {
        assert(entry.startsWith("package/"), `ui-core entry outside package/: ${entry}`);
        const rel = entry.slice("package/".length);
        assert(
          !/(^|\/)(packages|apps|scripts|templates|TEMP|node_modules)\//.test(rel),
          `source path leaked into the ui-core tarball: ${entry}`,
        );
      }
      const extracted = extractTarball(tarball, join(EXTRACT_DIR, "core"), "ui-core");
      const pkg = readJsonFile(join(extracted, "package.json"));
      const sourcePkg = readJsonFile(join(coreDir, "package.json"));
      assert(pkg.name === CORE_PACKAGE_NAME, "packed ui-core identity mismatch");
      assert(pkg.version === sourcePkg.version, "packed ui-core version mismatch");
      for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
        assert(
          !String(range).startsWith("workspace:"),
          `packed ui-core dependency ${name} still uses the workspace protocol`,
        );
      }
    });

    runCheck("pack, inspect, and extract the V4 systems and the fresh generated package", () => {
      for (const target of [...systemTargets, generatedTarget]) {
        assert(existsSync(join(target.packageDir, "dist")), `${target.id} is not built`);
        const tarball = packPackage(target.packageDir, target.id);
        const inspection = inspectTarball(tarball);
        assert(inspection.ok, `tarball inspection failed for ${target.id}: ${inspection.detail}`);
        const extracted = extractTarball(tarball, join(EXTRACT_DIR, target.id), target.id);
        target.extractedPackageDir = extracted;

        const pkg = readJsonFile(join(extracted, "package.json"));
        const manifest = readJsonFile(join(extracted, DESIGN_SYSTEM_MANIFEST_FILENAME));
        assert(pkg.name === target.packageName, `${target.id} packed identity mismatch`);
        assert(manifest.package === target.packageName, `${target.id} manifest identity mismatch`);
        assert(manifest.version === pkg.version, `${target.id} manifest/package version mismatch`);
        assert(manifest.contract === "v4", `${target.id} manifest must declare contract v4`);
        assert(manifest.schemaVersion === 2, `${target.id} manifest must be schemaVersion 2`);
        for (const subpath of ["./styles.css", "./tailwind.css", "./tokens"]) {
          assert(
            typeof pkg.exports?.[subpath] !== "undefined",
            `${target.id} must publish ${subpath}`,
          );
        }
        assert(
          pkg.exports?.[MANIFEST_EXPORT_SUBPATH] === `./${DESIGN_SYSTEM_MANIFEST_FILENAME}`,
          `${target.id} must expose ${MANIFEST_EXPORT_SUBPATH} as the shipped manifest`,
        );
        target.manifest = manifest;
        target.version = pkg.version;

        // The packed bridge and stylesheet are real artifacts with the
        // declared prefixes, and the bridge aliases the semantic color token.
        const cssPrefix = manifest.tokens?.names?.cssVariablePrefix;
        const tailwindPrefix = manifest.tokens?.names?.tailwindUtilityPrefix;
        assert(typeof cssPrefix === "string", `${target.id} manifest must declare a CSS prefix`);
        assert(tailwindPrefix === "prism", `${target.id} Tailwind prefix must be "prism"`);
        const bridgePath = join(extracted, "dist", "tailwind.css");
        assert(existsSync(bridgePath), `${target.id} packed artifact is missing dist/tailwind.css`);
        const bridge = readFileSync(bridgePath, "utf8");
        assert(bridge.includes("@theme inline"), `${target.id} bridge must declare @theme inline`);
        assert(
          bridge.includes(
            `--color-${tailwindPrefix}-text-primary: var(--${cssPrefix}-color-text-primary);`,
          ),
          `${target.id} bridge must alias the semantic color token to its CSS variable`,
        );
        const stylesPath = join(extracted, "dist", "index.css");
        assert(existsSync(stylesPath), `${target.id} packed artifact is missing dist/index.css`);
        const styles = readFileSync(stylesPath, "utf8");
        assert(
          styles.includes(`--${cssPrefix}-color-text-primary`),
          `${target.id} stylesheet must define the semantic CSS custom properties`,
        );
        target.cssPrefix = cssPrefix;
        target.tailwindPrefix = tailwindPrefix;
      }

      // The fresh template declares exactly the twenty required components;
      // System A and System B keep their distinct optional capability sets.
      for (const id of SYSTEM_IDS) {
        const target = systemTargets.find((candidate) => candidate.id === id);
        const declared = Object.keys(target.manifest.components).filter(
          (name) => !V4_REQUIRED_COMPONENT_NAMES.includes(name),
        );
        assert(
          JSON.stringify(declared) === JSON.stringify([...OPTIONAL_SETS[id]]),
          `${id} optional capability set mismatch: ${declared.join(", ")}`,
        );
      }
      const generatedDeclared = Object.keys(generatedTarget.manifest.components);
      assert(
        generatedDeclared.length === V4_REQUIRED_COMPONENT_NAMES.length,
        `fresh generated package must declare exactly the required set: ${generatedDeclared.join(", ")}`,
      );
      assert(
        V4_OPTIONAL_COMPONENTS.every((name) => !generatedDeclared.includes(name)),
        "fresh generated package must not declare optional components",
      );
    });

    runCheck("pack and inspect @prism-system/tools", () => {
      assert(existsSync(TOOLS_PACKAGE_DIR), "packages/tools is missing");
      const tarball = packPackage(TOOLS_PACKAGE_DIR, "tools");
      const entries = tarballEntries(tarball);
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
      const extracted = extractTarball(tarball, join(EXTRACT_DIR, "tools"), "tools");
      const pkg = readJsonFile(join(extracted, "package.json"));
      assert(pkg.name === TOOLS_PACKAGE_NAME, "tools package identity mismatch");
      assert(typeof pkg.bin?.["prism-ds"] === "string", "tools must declare the prism-ds bin");
      const binRel = pkg.bin["prism-ds"].replace(/^\.\//, "");
      assert(existsSync(join(extracted, binRel)), `tools bin target is missing: ${binRel}`);
      for (const rel of listFiles(extracted)) {
        if (!/\.(mjs|js|json|md)$/.test(rel)) continue;
        const text = readFileSync(join(extracted, rel), "utf8");
        assert(!text.includes(ROOT), `shipped tools file ${rel} references the repository root`);
      }
    });

    /* ---------------------------------------------------------------------- */
    /* Step 6: isolated consumer typechecks every public import               */
    /* ---------------------------------------------------------------------- */

    runCheck("isolated consumer typechecks all packed public imports", () => {
      const dir = join(CONSUMER_DIR, "typecheck");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeJson(join(dir, "package.json"), {
        name: "prism-v4-typecheck-consumer",
        version: "0.0.0",
        private: true,
      });
      writeJson(join(dir, "tsconfig.json"), {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          types: [],
        },
        include: ["src"],
      });
      writeFile(dir, "src/public-imports.tsx", buildTypecheckSource(typecheckSystems));

      for (const target of [...systemTargets, generatedTarget]) {
        assert(target.extractedPackageDir, `${target.id} was not extracted`);
        stagePackedPackage(dir, target.packageName, target.extractedPackageDir);
      }
      const coreDir = join(EXTRACT_DIR, "core", "package");
      stagePackedPackage(dir, CORE_PACKAGE_NAME, coreDir);

      // Runtime dependencies come from the already-installed workspace.
      const corePackageJson = join(ROOT, "packages", "core", "package.json");
      const corePkg = readJsonFile(join(coreDir, "package.json"));
      for (const name of Object.keys(corePkg.dependencies ?? {})) {
        stageInstalledDependency(dir, name, corePackageJson);
      }
      const systemPackageJson = join(ROOT, "packages", "system-a", "package.json");
      for (const name of ["react", "react-dom", "@types/react", "@types/react-dom"]) {
        stageInstalledDependency(dir, name, systemPackageJson);
      }

      const tsc = runNode(
        [join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"],
        {
          cwd: dir,
        },
      );
      assert(tsc.status === 0, `tsc failed:\n${output(tsc)}`);
    });

    /* ---------------------------------------------------------------------- */
    /* Step 7: isolated consumer resolves and loads packed public exports     */
    /* ---------------------------------------------------------------------- */

    runCheck("isolated consumer resolves and loads packed public exports at runtime", () => {
      const dir = join(CONSUMER_DIR, "runtime");
      mkdirSync(dir, { recursive: true });
      writeJson(join(dir, "package.json"), {
        name: "prism-v4-runtime-consumer",
        version: "0.0.0",
        private: true,
      });
      const packages = [...systemTargets, generatedTarget].map((target) => ({
        packageName: target.packageName,
        version: target.version,
        tokensExport: target.tokensExport,
      }));
      writeFile(dir, "runtime-probe.mjs", buildRuntimeProbeSource(packages, dir));
      for (const target of [...systemTargets, generatedTarget]) {
        stagePackedPackage(dir, target.packageName, target.extractedPackageDir);
      }
      stagePackedPackage(dir, CORE_PACKAGE_NAME, join(EXTRACT_DIR, "core", "package"));
      const corePackageJson = join(ROOT, "packages", "core", "package.json");
      const corePkg = readJsonFile(join(EXTRACT_DIR, "core", "package", "package.json"));
      for (const name of Object.keys(corePkg.dependencies ?? {})) {
        stageInstalledDependency(dir, name, corePackageJson);
      }
      const systemPackageJson = join(ROOT, "packages", "system-a", "package.json");
      for (const name of ["react", "react-dom"]) {
        stageInstalledDependency(dir, name, systemPackageJson);
      }

      const probe = runNode(["runtime-probe.mjs"], { cwd: dir });
      assert(probe.status === 0, `runtime probe failed:\n${output(probe)}`);
      const report = JSON.parse(probe.stdout);
      assert(report.ok === true, `runtime probe errors: ${report.errors.join("; ")}`);
      for (const target of [...systemTargets, generatedTarget]) {
        assert(
          report.designSystemVersions[target.packageName] === target.version,
          `${target.id} runtime DesignSystem.version mismatch`,
        );
        assert(
          report.manifestVersions[target.packageName] === target.version,
          `${target.id} runtime manifest version mismatch`,
        );
        assert(
          report.tokenExports[target.packageName] === "object",
          `${target.id} tokens export missing at runtime`,
        );
      }
    });

    /* ---------------------------------------------------------------------- */
    /* Step 8: real Tailwind v4 compilation against packed imports (network)  */
    /* ---------------------------------------------------------------------- */

    runCheck(
      `install exact tailwindcss@${TAILWIND_VERSION} + ${TAILWIND_CLI_PACKAGE}@${TAILWIND_VERSION} in TEMP`,
      () => {
        const toolchainPackageJson = join(TAILWIND_DIR, "package.json");
        writeJson(toolchainPackageJson, {
          name: "prism-v4-tailwind-lifecycle",
          version: "0.0.0",
          private: true,
        });
        const packageHashBefore = hashFile(toolchainPackageJson);

        log(
          `NETWORK npm install --ignore-scripts --no-save --no-package-lock ` +
            `tailwindcss@${TAILWIND_VERSION} ${TAILWIND_CLI_PACKAGE}@${TAILWIND_VERSION} ` +
            `(cwd ${toPosix(relative(ROOT, TAILWIND_DIR))})`,
        );
        log("NETWORK this is the only network operation performed by ds:check-v4");
        const install = spawnSync(
          "npm",
          [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--no-save",
            "--no-package-lock",
            `tailwindcss@${TAILWIND_VERSION}`,
            `${TAILWIND_CLI_PACKAGE}@${TAILWIND_VERSION}`,
          ],
          { cwd: TAILWIND_DIR, encoding: "utf8", shell: true, maxBuffer: 32 * 1024 * 1024 },
        );
        assert(
          install.status === 0,
          `transient Tailwind install failed (network access to the npm registry is required):\n${output(install)}`,
        );
        log(`NETWORK npm: ${output(install).split(/\r?\n/).pop()}`);

        const tailwindPkg = readJsonFile(
          join(TAILWIND_DIR, "node_modules", "tailwindcss", "package.json"),
        );
        const cliPkg = readJsonFile(
          join(TAILWIND_DIR, "node_modules", "@tailwindcss", "cli", "package.json"),
        );
        assert(
          tailwindPkg.version === TAILWIND_VERSION,
          `tailwindcss must resolve to exactly ${TAILWIND_VERSION}, received ${tailwindPkg.version}`,
        );
        assert(
          cliPkg.version === TAILWIND_VERSION,
          `${TAILWIND_CLI_PACKAGE} must resolve to exactly ${TAILWIND_VERSION}, received ${cliPkg.version}`,
        );
        assert(existsSync(TAILWIND_CLI_ENTRY), "the installed Tailwind CLI entry point is missing");
        assert(
          !existsSync(join(TAILWIND_DIR, "package-lock.json")),
          "the transient install must not write a lockfile",
        );
        assert(
          hashFile(toolchainPackageJson) === packageHashBefore,
          "the transient install must not modify its own package.json (--no-save)",
        );
      },
    );

    runCheck("Tailwind v4 compiles a consumer stylesheet against packed package imports", () => {
      assert(existsSync(TAILWIND_CLI_ENTRY), "the Tailwind CLI was not installed");
      for (const target of [...systemTargets, generatedTarget]) {
        const dir = join(TAILWIND_DIR, "consumers", target.id);
        mkdirSync(join(dir, "src"), { recursive: true });
        writeJson(join(dir, "package.json"), {
          name: `prism-v4-tailwind-${target.id}`,
          version: "0.0.0",
          private: true,
        });
        stagePackedPackage(dir, target.packageName, target.extractedPackageDir);
        writeFile(dir, "src/app.css", buildTailwindProbeCss(target.packageName));
        writeFile(dir, "src/Probe.tsx", buildTailwindProbeSource(target.tailwindPrefix));

        const compile = runNode([TAILWIND_CLI_ENTRY, "-i", "src/app.css", "-o", "dist/app.css"], {
          cwd: dir,
        });
        assert(
          compile.status === 0,
          `Tailwind compile failed for ${target.id}:\n${output(compile)}`,
        );
        const compiledPath = join(dir, "dist", "app.css");
        assert(existsSync(compiledPath), `Tailwind produced no stylesheet for ${target.id}`);
        const compiled = readFileSync(compiledPath, "utf8");

        const packedStyles = readFileSync(
          join(target.extractedPackageDir, "dist", "index.css"),
          "utf8",
        );
        const checks = [
          {
            utility: semanticUtilityClass(target.tailwindPrefix, "text", "text-primary"),
            property: "color",
            variable: `--${target.cssPrefix}-color-text-primary`,
          },
          {
            utility: semanticUtilityClass(target.tailwindPrefix, "bg", "surface-raised"),
            property: "background-color",
            variable: `--${target.cssPrefix}-color-surface-raised`,
          },
        ];
        for (const check of checks) {
          const rule = semanticUtilityRule(compiled, check.utility);
          assert(rule, `${target.id}: compiled CSS is missing .${check.utility}`);
          assert(
            new RegExp(
              `${escapeRegExp(check.property)}\\s*:\\s*var\\(${escapeRegExp(check.variable)}\\)`,
            ).test(rule),
            `${target.id}: .${check.utility} must resolve to var(${check.variable})`,
          );
          const packedValue = cssVariableValue(packedStyles, check.variable);
          assert(packedValue, `${target.id}: packed stylesheet is missing ${check.variable}`);
          assert(
            new RegExp(
              `${escapeRegExp(check.variable)}\\s*:\\s*${escapeRegExp(packedValue)};`,
            ).test(compiled),
            `${target.id}: compiled CSS must carry the packed token value ${check.variable}: ${packedValue}`,
          );
        }
      }
    });

    /* ---------------------------------------------------------------------- */
    /* Step 9: release preparation stays fail-closed (dry-run, TEMP only)     */
    /* ---------------------------------------------------------------------- */

    await runAsyncCheck(
      "release preparation is fail-closed against TEMP-only invalid copies",
      async () => {
        const sourcePackageJson = readJsonFile(join(ROOT, "packages", "system-a", "package.json"));
        const expectedBump = defaultBumpFor(sourcePackageJson.version);

        // Positive control: a valid copy prepares in dry-run mode and writes
        // nothing, runs no commands, and packs nothing.
        const baseline = makeReleaseFixtureRoot("baseline");
        const baselineBefore = hashTree(baseline);
        const baselineResult = await prepareRelease({
          id: "system-a",
          root: baseline,
          dryRun: true,
        });
        assert(
          baselineResult.ok === true,
          `baseline dry run should pass: ${baselineResult.failures.join("; ")}`,
        );
        assert(baselineResult.blocked === false, "baseline dry run must not be blocked");
        assert(
          baselineResult.synchronization.status === "skipped",
          "dry run must not synchronize versions",
        );
        assert(baselineResult.build.status === "skipped", "dry run must not build");
        assert(baselineResult.pack.status === "planned", "dry run must not pack");
        assert(baselineResult.changeset.action === "planned", "dry run must not write a changeset");
        assert(
          baselineResult.bump === expectedBump &&
            baselineResult.nextVersion ===
              computeNextVersion(sourcePackageJson.version, expectedBump),
          `baseline release plan mismatch: ${baselineResult.currentVersion} -> ${baselineResult.nextVersion}`,
        );
        assert(hashTree(baseline) === baselineBefore, "baseline dry run mutated the fixture");
        assert(
          listFiles(join(baseline, ".changeset")).length === 0,
          "baseline dry run wrote a changeset",
        );
        assert(
          !listFiles(baseline).some((file) => file.endsWith(".tgz")),
          "baseline dry run packed a tarball",
        );

        // The approval gate blocks before anything is validated or executed.
        const unapproved = makeReleaseFixtureRoot("unapproved");
        const unapprovedBefore = hashTree(unapproved);
        const unapprovedResult = await prepareRelease({ id: "system-a", root: unapproved });
        assert(
          unapprovedResult.ok === false && unapprovedResult.blocked === true,
          "an unapproved release must be blocked",
        );
        assert(
          unapprovedResult.failures.some((failure) => /Missing --approved/.test(failure)),
          `approval diagnostic: ${unapprovedResult.failures.join("; ")}`,
        );
        assert(hashTree(unapproved) === unapprovedBefore, "unapproved release mutated the fixture");

        // Invalid copies: each must be blocked with the exact diagnostic,
        // byte-stable, and free of any changeset/tarball/version writes.
        const cases = [
          {
            name: "incomplete-tokens",
            needle: /tokens\.source\.json is missing required group "themes"/,
            mutate: (root) => {
              const path = join(root, "packages", "system-a", "tokens.source.json");
              const tokens = readJsonFile(path);
              delete tokens.themes;
              writeJson(path, tokens);
            },
          },
          {
            name: "missing-required-component",
            needle: /src\/components\/index\.ts is missing declared component exports: Button/,
            mutate: (root) => {
              const path = join(root, "packages", "system-a", "src", "components", "index.ts");
              const source = readFileSync(path, "utf8");
              assert(
                source.includes('export * from "./button/index";'),
                "the barrel must export the button folder",
              );
              writeFileSync(path, source.replace('export * from "./button/index";\n', ""), "utf8");
            },
          },
          {
            name: "missing-manifest",
            needle: /Missing required file: design-system\.json/,
            mutate: (root) => {
              rmSync(join(root, "packages", "system-a", DESIGN_SYSTEM_MANIFEST_FILENAME));
            },
          },
          {
            name: "missing-tailwind-bridge",
            needle: /Missing required file: src\/styles\/tailwind\.css/,
            mutate: (root) => {
              rmSync(join(root, "packages", "system-a", "src", "styles", "tailwind.css"));
            },
          },
        ];
        for (const testCase of cases) {
          const root = makeReleaseFixtureRoot(testCase.name);
          testCase.mutate(root);
          const before = hashTree(root);
          const result = await prepareRelease({ id: "system-a", root, dryRun: true });
          assert(
            result.ok === false && result.blocked === true,
            `${testCase.name}: release preparation must be blocked`,
          );
          assert(
            result.failures.some((failure) => testCase.needle.test(failure)),
            `${testCase.name}: expected ${testCase.needle}, received: ${result.failures.join(" | ")}`,
          );
          assert(
            result.synchronization?.status === "skipped",
            `${testCase.name}: dry run must not synchronize versions`,
          );
          assert(result.pack === undefined, `${testCase.name}: no pack may be attempted`);
          assert(
            hashTree(root) === before,
            `${testCase.name}: blocked release mutated the fixture`,
          );
          assert(
            listFiles(join(root, ".changeset")).length === 0,
            `${testCase.name}: a changeset was written`,
          );
          assert(
            !listFiles(root).some((file) => file.endsWith(".tgz")),
            `${testCase.name}: a tarball was produced`,
          );
        }
        log("INFO release checks: dry-run only; no versioning, pack, publish, or git mutation");
      },
    );

    /* ---------------------------------------------------------------------- */
    /* Step 10: repository state after                                        */
    /* ---------------------------------------------------------------------- */

    runCheck("repository version/config/manifest state is byte-identical (after)", () => {
      const after = collectRepoVersionState(ROOT);
      assert(after.size === repoStateBefore.size, "the watched repository file set changed");
      const changed = [];
      for (const [file, hash] of repoStateBefore) {
        if (after.get(file) !== hash) changed.push(file);
      }
      for (const file of after.keys()) {
        if (!repoStateBefore.has(file)) changed.push(file);
      }
      assert(changed.length === 0, `repository files were mutated: ${changed.join(", ")}`);
      for (const critical of ["package.json", "pnpm-lock.yaml", "config/design-systems.json"]) {
        assert(
          repoStateBefore.get(critical) === after.get(critical),
          `${critical} was mutated during the run`,
        );
      }
      log(
        "INFO root package.json, pnpm-lock.yaml, config/design-systems.json, package manifests, " +
          "and Changesets entries are byte-identical",
      );
    });
  } catch (error) {
    if (error === RUN_DIRECTORY_SETUP_ABORT) {
      log("ABORT: run directory setup failed; skipped all remaining checks.");
    } else {
      // A defect in the harness itself: fail closed and still leave a log.
      log(`UNEXPECTED FAILURE: ${error.stack ?? error.message}`);
      results.push({ name: "unexpected harness failure", ok: false, error: error.message });
    }
  } finally {
    if (runDirectoryReady) {
      mkdirSync(TEMP, { recursive: true });
      writeFileSync(LOG_PATH, `${logs.join("\n")}\n`, "utf8");
    }
  }

  const failures = results.filter((result) => !result.ok);
  log("");
  log(
    `${results.length - failures.length}/${results.length} V4 lifecycle check(s) passed. ` +
      `Artifacts under ${toPosix(relative(ROOT, TEMP))}.`,
  );
  if (failures.length > 0) {
    log("V4 lifecycle check failed:");
    for (const failure of failures) log(`  - ${failure.name}: ${failure.error}`);
    process.exitCode = 1;
  } else {
    log("V4 lifecycle check passed.");
  }
  if (runDirectoryReady) {
    log(`Log: ${toPosix(relative(ROOT, LOG_PATH))}`);
    writeFileSync(LOG_PATH, `${logs.join("\n")}\n`, "utf8");
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main();
}
