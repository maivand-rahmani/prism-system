#!/usr/bin/env node
/**
 * V4 Phase 3 packed-artifact consumer validation harness for the published
 * `@prism-system/tools` CLI and dual V2/V4 design-system support.
 *
 * A deterministic, fail-closed end-to-end check that exercises the completed
 * V4 `prism-ds` surface against *packed artifacts*, never workspace source:
 *
 *   1. validate System A and System B (static) and pack them, the published
 *      `@prism-system/tools` package, and a deterministic V2 fixture package;
 *   2. assert the packed V4 Tailwind bridge / stylesheet / manifest artifacts;
 *   3. drive isolated consumers from the packed artifacts:
 *        - packed V4 System A and System B: connect, doctor, components, tokens,
 *          check, setup-tailwind, check-usage, idempotency, and dual optional
 *          capability sets;
 *        - the packed V2 fixture: connect, doctor, components, tokens, check,
 *          and the V4-only setup-tailwind failure path;
 *   4. exercise the read-only registry catalog and the dependency-mutating
 *      commands (`install`/`use`/`upgrade`) against a local in-process registry
 *      serving the packed V4 and V2 artifacts, with a fake package manager.
 *
 * All pack/extract/scratch/log output lives under a fresh
 * `TEMP/v4/tools-packed-<run-id>/` directory; an existing path is never removed
 * or overwritten. It never installs from the network, versions, publishes, or mutates the
 * repository. Requires the workspace to be installed and built
 * (`pnpm install && pnpm build`).
 *
 * CLI: pnpm ds:check-v4-tools
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
const TEMP_ROOT = join(ROOT, "TEMP", "v4");
const TEMP = join(TEMP_ROOT, `tools-packed-${randomUUID()}`);
const PACK_DIR = join(TEMP, "pack");
const EXTRACT_DIR = join(TEMP, "extract");
const FIXTURE_DIR = join(TEMP, "fixtures");
const CONSUMER_DIR = join(TEMP, "consumers");
const REGISTRY_DIR = join(TEMP, "registry");
const LOG_PATH = join(TEMP, "check-v4-tools.log");

const SYSTEM_IDS = ["system-a", "system-b"];
const TOOLS_PACKAGE_NAME = "@prism-system/tools";
const TOOLS_PACKAGE_DIR = join(ROOT, "packages", "tools");
const TOOLS_EXTRACT = join(EXTRACT_DIR, "tools");

const V2_FIXTURE_SOURCE = join(ROOT, "schemas", "fixtures", "v2-valid", "design-system.json");
const V2_PACKAGE_NAME = "@prism-system/ui-v2-valid";
const V2_VERSION = "1.1.0";

/** V4 systems publish the bridge under this exact public subpath. */
const TAILWIND_EXPORT_SUBPATH = "./tailwind.css";
const STYLES_EXPORT_SUBPATH = "./styles.css";
const MANIFEST_EXPORT_SUBPATH = "./manifest";

/** The twenty required V4 contract component names, in canonical order. */
const REQUIRED_COMPONENTS = [
  "Button",
  "Input",
  "Textarea",
  "Card",
  "Badge",
  "Checkbox",
  "RadioGroup",
  "Switch",
  "Select",
  "Tabs",
  "Dialog",
  "DropdownMenu",
  "Tooltip",
  "Separator",
  "Heading",
  "Text",
  "Link",
  "Container",
  "Stack",
  "FormField",
];

/** The optional capability set each packed V4 system declares. */
const OPTIONAL_SET = {
  "system-a": ["Grid", "Fieldset", "Alert", "Progress", "Accordion", "Pagination", "Table"],
  "system-b": ["Section", "Alert", "Skeleton", "Toast", "Avatar", "Breadcrumbs"],
};
/** A known optional the other system does not declare (must report unavailable). */
const CROSS_OPTIONAL = { "system-a": "Skeleton", "system-b": "Grid" };

const REPO_MUTATION_WATCH = [
  "package.json",
  "config/design-systems.json",
  "packages/system-a/package.json",
  "packages/system-a/design-system.json",
  "packages/system-b/package.json",
  "packages/system-b/design-system.json",
  "packages/tools/package.json",
  "packages/tools/src/cli.mjs",
  "schemas/fixtures/v2-valid/design-system.json",
];

const CLEAN_SOURCE = `export function Clean() {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 w-[320px] rounded-lg shadow-md bg-prism-surface-raised text-prism-text-primary">
      <span className="flex gap-2 p-1 w-full">ok</span>
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

const TOOLS_COMMANDS = [
  "search",
  "info",
  "install",
  "use",
  "connect",
  "check-usage",
  "doctor",
  "components",
  "tokens",
  "check",
  "setup-tailwind",
  "upgrade",
];

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function toPosix(path) {
  return path.split(sep).join("/");
}

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function sha512Base64(buffer) {
  return `sha512-${createHash("sha512").update(buffer).digest("base64")}`;
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

/** Read the entry list of a tarball via the system `tar`. */
function tarballEntries(tarballPath) {
  const result = runTar(["-tzf", tarballPath]);
  assert(result.status === 0, `tar -tzf failed: ${output(result)}`);
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Build a gzip tarball from `<dir>/package` at `REGISTRY_DIR/<name>`. */
function buildTarball(dir, name) {
  const tarballPath = join(REGISTRY_DIR, name);
  mkdirSync(REGISTRY_DIR, { recursive: true });
  const result = runTar(["-czf", tarballPath, "-C", dir, "package"]);
  assert(result.status === 0, `tar -czf failed for ${name}: ${output(result)}`);
  return tarballPath;
}

/**
 * Stage a package's declared runtime dependencies into an isolated
 * `node_modules` next to a packed artifact, from the already-installed
 * workspace, so the packed tools CLI can lazy-load TypeScript (check-usage /
 * check) without a network install and without touching the repository.
 */
function stageRuntimeDependencies(targetRoot, dependencies) {
  const requireFromRoot = createRequire(join(ROOT, "package.json"));
  for (const name of Object.keys(dependencies ?? {})) {
    const target = join(targetRoot, "node_modules", ...name.split("/"));
    if (existsSync(target)) continue;
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

const repoHashesBefore = new Map(
  REPO_MUTATION_WATCH.map((file) => [file, hashFile(join(ROOT, file))]),
);
const toolsSrcHashBefore = hashTree(join(TOOLS_PACKAGE_DIR, "src"));

/* -------------------------------------------------------------------------- */
/* Step 0: workspace, validation, and packing                                  */
/* -------------------------------------------------------------------------- */

runCheck("prepare unique TEMP/v4/tools-packed workspace", () => {
  mkdirSync(TEMP_ROOT, { recursive: true });
  // Create the unique run directory without recursive reuse: a collision fails
  // closed rather than deleting or overwriting any existing TEMP data.
  mkdirSync(TEMP);
  mkdirSync(PACK_DIR, { recursive: true });
  mkdirSync(EXTRACT_DIR, { recursive: true });
  mkdirSync(FIXTURE_DIR, { recursive: true });
  mkdirSync(CONSUMER_DIR, { recursive: true });
  mkdirSync(REGISTRY_DIR, { recursive: true });
  assert(existsSync(TEMP), "temp workspace was not created");
});

runCheck("validate System A and System B (static)", () => {
  for (const id of SYSTEM_IDS) {
    const result = validateDesignSystem({ id, root: ROOT, runCommands: false });
    assert(result.ok, `ds:check ${id} failed: ${result.failures.join("; ")}`);
  }
});

/** Deterministic V2 fixture package, derived from the shipped V2 fixture. */
const v2FixtureDir = join(FIXTURE_DIR, "v2-valid");
const v2PackageDir = join(v2FixtureDir, "package");

runCheck("construct a deterministic packed V2 fixture package", () => {
  const manifest = readJsonFile(V2_FIXTURE_SOURCE);
  assert(manifest.contract === "v2", "V2 fixture manifest must declare contract v2");
  assert(manifest.schemaVersion === 1, "V2 fixture manifest must be schemaVersion 1");
  assert(manifest.package === V2_PACKAGE_NAME, "V2 fixture package identity mismatch");
  writeJson(join(v2PackageDir, "package.json"), {
    name: V2_PACKAGE_NAME,
    version: V2_VERSION,
    type: "module",
    main: "./dist/index.mjs",
    exports: {
      ".": { import: "./dist/index.mjs" },
      [STYLES_EXPORT_SUBPATH]: "./dist/index.css",
      [MANIFEST_EXPORT_SUBPATH]: "./design-system.json",
    },
  });
  writeJson(join(v2PackageDir, "design-system.json"), manifest);
  writeFile(v2PackageDir, "dist/index.mjs", "export const v2Valid = true;\n");
  writeFile(v2PackageDir, "dist/index.css", `.--${manifest.id}-fixture {\n  color: black;\n}\n`);
});

runCheck("pack System A, System B, and the synthetic V2 fixture", () => {
  for (const id of SYSTEM_IDS) {
    const packageDir = join(ROOT, "packages", id);
    assert(existsSync(join(packageDir, "dist")), `${id} is not built; run "pnpm build" first`);
    const pack = runPnpm(["pack", "--pack-destination", PACK_DIR], { cwd: packageDir });
    assert(pack.status === 0, `pnpm pack failed for ${id}: ${output(pack)}`);
  }
  const v2TarballPath = buildTarball(v2FixtureDir, `v2-valid-${V2_VERSION}.tgz`);
  const entries = tarballEntries(v2TarballPath);
  for (const required of ["package/package.json", "package/design-system.json"]) {
    assert(entries.includes(required), `V2 fixture tarball is missing ${required}`);
  }
});

const targets = SYSTEM_IDS.map((id) => ({
  id,
  packageName: `@prism-system/ui-${id}`,
  packageDir: join(ROOT, "packages", id),
  extractDir: join(EXTRACT_DIR, id),
}));

runCheck("extract and inspect the packed V4 system artifacts", () => {
  for (const target of targets) {
    const tarball = readdirSync(PACK_DIR).find(
      (name) => name.includes(target.id) && name.endsWith(".tgz"),
    );
    assert(tarball, `no tarball produced for ${target.id}`);
    const tarballPath = join(PACK_DIR, tarball);
    const inspection = inspectTarball(tarballPath);
    assert(inspection.ok, `tarball inspection failed for ${target.id}: ${inspection.detail}`);
    mkdirSync(target.extractDir, { recursive: true });
    const extract = runTar(["-xzf", tarballPath, "-C", target.extractDir]);
    assert(extract.status === 0, `failed to extract ${target.id}: ${output(extract)}`);
    const extractedDir = join(target.extractDir, "package");
    target.extractedPackageDir = extractedDir;
    const pkg = readJsonFile(join(extractedDir, "package.json"));
    const manifest = readJsonFile(join(extractedDir, "design-system.json"));
    assert(pkg.name === target.packageName, `${target.id} packed package identity mismatch`);
    assert(
      pkg.exports?.[MANIFEST_EXPORT_SUBPATH] === "./design-system.json",
      `${target.id} must expose ${MANIFEST_EXPORT_SUBPATH} as ./design-system.json`,
    );
    assert(
      typeof pkg.exports?.[TAILWIND_EXPORT_SUBPATH] === "string",
      `${target.id} must publish ${TAILWIND_EXPORT_SUBPATH}`,
    );
    assert(
      typeof pkg.exports?.[STYLES_EXPORT_SUBPATH] === "string",
      `${target.id} must publish ${STYLES_EXPORT_SUBPATH}`,
    );
    assert(manifest.schemaVersion === 2, `${target.id} manifest must be schemaVersion 2`);
    assert(manifest.contract === "v4", `${target.id} manifest must declare contract v4`);
    assert(manifest.package === target.packageName, `${target.id} manifest identity mismatch`);
    assert(manifest.version === pkg.version, `${target.id} manifest/package version mismatch`);
    target.manifest = manifest;
    target.version = pkg.version;
  }
});

runCheck("packed V4 systems ship a real Tailwind bridge and stylesheet", () => {
  for (const target of targets) {
    const prefix = target.manifest.tokens?.names?.cssVariablePrefix;
    const twPrefix = target.manifest.tokens?.names?.tailwindUtilityPrefix;
    assert(typeof prefix === "string", `${target.id} manifest must declare a CSS prefix`);
    assert(twPrefix === "prism", `${target.id} Tailwind prefix must be "prism"`);

    const bridgePath = join(target.extractedPackageDir, "dist", "tailwind.css");
    assert(existsSync(bridgePath), `${target.id} packed artifact is missing dist/tailwind.css`);
    const bridge = readFileSync(bridgePath, "utf8");
    assert(bridge.includes("@theme inline"), `${target.id} bridge must declare @theme inline`);
    assert(
      bridge.includes(`--color-${twPrefix}-text-primary: var(--${prefix}-color-text-primary);`),
      `${target.id} bridge must alias the semantic color token to its CSS variable`,
    );

    const stylesPath = join(target.extractedPackageDir, "dist", "index.css");
    assert(existsSync(stylesPath), `${target.id} packed artifact is missing dist/index.css`);
    const styles = readFileSync(stylesPath, "utf8");
    assert(
      styles.includes(`--${prefix}-color-text-primary`),
      `${target.id} stylesheet must define the CSS custom properties`,
    );
  }
});

runCheck("the packed V4 systems declare different optional capability sets", () => {
  const declared = {};
  for (const target of targets) {
    declared[target.id] = Object.keys(target.manifest.components).filter(
      (name) => !REQUIRED_COMPONENTS.includes(name),
    );
  }
  assert(
    JSON.stringify(declared["system-a"]) === JSON.stringify(OPTIONAL_SET["system-a"]),
    `System A optional set mismatch: ${declared["system-a"].join(", ")}`,
  );
  assert(
    JSON.stringify(declared["system-b"]) === JSON.stringify(OPTIONAL_SET["system-b"]),
    `System B optional set mismatch: ${declared["system-b"].join(", ")}`,
  );
});

/* -------------------------------------------------------------------------- */
/* Step 1: the packed @prism-system/tools artifact                             */
/* -------------------------------------------------------------------------- */

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
    "package/src/components.mjs",
    "package/src/tokens.mjs",
    "package/src/check.mjs",
    "package/src/tailwind-setup.mjs",
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
  assert(pkg.dependencies?.typescript, "typescript must be a declared runtime dependency");
  for (const rel of listFiles(extracted)) {
    if (!/\.(mjs|js|json|md)$/.test(rel)) continue;
    const text = readFileSync(join(extracted, rel), "utf8");
    assert(!text.includes(ROOT), `shipped tools file ${rel} references the repository root`);
  }
  // Stage TypeScript next to the packed tools so check-usage/check can lazy-load
  // it without a network install.
  stageRuntimeDependencies(join(extracted, ".."), pkg.dependencies);
  toolsPackageJson = pkg;
  toolsPackageJson.extractedDir = extracted;
});

const toolsBin = join(
  toolsPackageJson.extractedDir,
  toolsPackageJson.bin["prism-ds"].replace(/^\.\//, ""),
);

function runPackedTools(args, { cwd = ROOT } = {}) {
  assert(existsSync(toolsBin), `packed prism-ds bin is missing at ${toolsBin}`);
  return spawnSync(process.execPath, [toolsBin, ...args], { cwd, encoding: "utf8" });
}

/** Async variant: a synchronous spawn would deadlock the in-process registry. */
function runPackedToolsAsync(args, { cwd = ROOT, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [toolsBin, ...args], { cwd, env });
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

runCheck("packed prism-ds exposes the full dual V2/V4 command surface", () => {
  const help = runPackedTools(["--help"]);
  assert(help.status === 0, `prism-ds --help failed: ${output(help)}`);
  for (const command of TOOLS_COMMANDS) {
    assert(output(help).includes(command), `prism-ds --help is missing ${command}`);
  }
  for (const command of ["components", "tokens", "check", "setup-tailwind", "upgrade"]) {
    const commandHelp = runPackedTools([command, "--help"]);
    assert(commandHelp.status === 0, `prism-ds ${command} --help failed: ${output(commandHelp)}`);
  }
});

/* -------------------------------------------------------------------------- */
/* Step 2: offline consumer lifecycle against the packed artifacts             */
/* -------------------------------------------------------------------------- */

/** Install a fixture package (its `package/` directory) into a consumer. */
function stagePackage(consumerRoot, packageName, sourceDir) {
  const target = join(consumerRoot, "node_modules", ...packageName.split("/"));
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(sourceDir, target, { recursive: true });
}

function makeConsumer(name, { packageName, version, sourceDir, tailwind = null }) {
  const dir = join(CONSUMER_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  const dependencies = { [packageName]: version };
  if (tailwind !== null) dependencies.tailwindcss = tailwind;
  writeJson(join(dir, "package.json"), {
    name,
    version: "0.0.0",
    private: true,
    packageManager: "npm@10.0.0",
    dependencies,
  });
  writeFile(dir, "AGENTS.md", "# Tools harness consumer\n\nUser-owned content.\n");
  writeFile(dir, "src/clean.tsx", CLEAN_SOURCE);
  writeFile(dir, "src/app.css", "body { margin: 0; }\n");
  stagePackage(dir, packageName, sourceDir);
  if (tailwind !== null) stageTailwind(dir, tailwind);
  return dir;
}

function stageTailwind(consumerRoot, version) {
  const dir = join(consumerRoot, "node_modules", "tailwindcss");
  writeJson(join(dir, "package.json"), { name: "tailwindcss", version, main: "index.css" });
  writeFile(dir, "index.css", "/* tailwind */\n");
}

function consumerConfig(dir) {
  return readJsonFile(join(dir, ".design-system", "config.json"));
}

function installedManifest(dir, packageName) {
  return readJsonFile(join(dir, "node_modules", ...packageName.split("/"), "design-system.json"));
}

/** The three managed imports setup-tailwind writes, in order. */
function managedCss(packageName, extra = []) {
  return [
    '@import "tailwindcss";',
    `@import "${packageName}/tailwind.css";`,
    `@import "${packageName}/styles.css";`,
    ...extra,
    "",
  ].join("\n");
}

function checkStatus(report, id) {
  const found = report.checks.find((entry) => entry.id === id);
  assert(found, `check report is missing the "${id}" check`);
  return found.status;
}

/** The full offline lifecycle for one packed V4 system. */
function verifyV4Consumer(target) {
  const dir = makeConsumer(`v4-${target.id}`, {
    packageName: target.packageName,
    version: target.version,
    sourceDir: target.extractedPackageDir,
    tailwind: "4.1.0",
  });
  const consumerPackageJson = join(dir, "package.json");
  const packageHashBefore = hashFile(consumerPackageJson);
  const appCssPath = join(dir, "src", "app.css");

  // Connect (configure-only) and verify exact identity/version invariants.
  const connect = runPackedTools(["connect", target.packageName, "--cwd", dir]);
  assert(connect.status === 0, `connect failed for ${target.id}: ${output(connect)}`);
  assert(
    output(connect).includes(`${target.packageName}@${target.version}`),
    `connect must report the exact version for ${target.id}`,
  );
  const config = consumerConfig(dir);
  const manifest = installedManifest(dir, target.packageName);
  assert(config.package === target.packageName, `${target.id} config identity mismatch`);
  assert(config.manifest === MANIFEST_EXPORT_SUBPATH, `${target.id} config manifest subpath`);
  assert(config.version === target.version, `${target.id} config version mismatch`);
  assert(manifest.contract === "v4", `${target.id} installed manifest must be v4`);
  assert(
    listFiles(join(dir, ".design-system")).join(",") === "AGENTS.md,config.json",
    ".design-system must contain only config/AGENTS",
  );
  const rootAgents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert(rootAgents.includes("# Tools harness consumer"), "user AGENTS content not preserved");
  assert(
    rootAgents.includes("BEGIN @prism-system design system contract"),
    "managed contract block missing",
  );

  // Doctor: read-only, and the V4 bridge must validate.
  const doctor = runPackedTools(["doctor", "--cwd", dir]);
  assert(doctor.status === 0, `doctor failed for ${target.id}: ${output(doctor)}`);
  assert(/\[ok\] tailwind bridge/.test(output(doctor)), `${target.id} doctor bridge check`);
  assert(/Doctor passed\./.test(output(doctor)), `${target.id} doctor should pass`);

  // Component catalog: 20 required, the declared optional set, and the other
  // system's optionals reported unavailable.
  const components = runPackedTools(["components", "--cwd", dir, "--json"]);
  assert(components.status === 0, `components failed for ${target.id}: ${output(components)}`);
  const catalog = JSON.parse(components.stdout);
  assert(catalog.ok === true, `${target.id} components ok`);
  assert(catalog.contract === "v4", `${target.id} components contract`);
  assert(catalog.counts.required === 20, `${target.id} components required count`);
  assert(catalog.counts.optional === 12, `${target.id} components optional count`);
  for (const optional of OPTIONAL_SET[target.id]) {
    assert(catalog.available.includes(optional), `${target.id} should make ${optional} available`);
  }
  const crossName = CROSS_OPTIONAL[target.id];
  assert(
    catalog.unavailable.includes(crossName),
    `${target.id} should report ${crossName} unavailable`,
  );
  const cross = runPackedTools(["components", crossName, "--cwd", dir, "--json"]);
  assert(cross.status === 0, `${target.id} components ${crossName} failed`);
  assert(
    JSON.parse(cross.stdout).requested.available === false,
    `${target.id} requested ${crossName} availability`,
  );
  const declared = runPackedTools([
    "components",
    OPTIONAL_SET[target.id][0],
    "--cwd",
    dir,
    "--json",
  ]);
  assert(
    JSON.parse(declared.stdout).requested.available === true,
    `${target.id} requested declared optional availability`,
  );

  // Token catalog: nine groups, real prefixes.
  const tokens = runPackedTools(["tokens", "--cwd", dir, "--json"]);
  assert(tokens.status === 0, `tokens failed for ${target.id}: ${output(tokens)}`);
  const catalogTokens = JSON.parse(tokens.stdout);
  assert(catalogTokens.supported === true, `${target.id} tokens supported`);
  assert(
    catalogTokens.prefixes.css === target.manifest.tokens.names.cssVariablePrefix,
    `${target.id} CSS prefix`,
  );
  assert(catalogTokens.prefixes.tailwind === "prism", `${target.id} Tailwind prefix`);
  assert(catalogTokens.counts.groups === 9, `${target.id} token groups`);
  assert(catalogTokens.counts.tokens > 0, `${target.id} token count`);
  const themed = runPackedTools(["tokens", "themes", "--cwd", dir, "--json"]);
  assert(
    JSON.parse(themed.stdout).requested.tokens[0].cssVariable.startsWith("--"),
    `${target.id} token CSS variable`,
  );
  const badGroup = runPackedTools(["tokens", "nope", "--cwd", dir]);
  assert(badGroup.status !== 0, `${target.id} unknown token group must fail closed`);
  assert(/Unknown token group/.test(output(badGroup)), `${target.id} unknown group diagnostic`);

  // check without --css: import order is not guessed.
  const checkNoCss = runPackedTools(["check", "--cwd", dir, "--json"]);
  assert(checkNoCss.status === 0, `check failed for ${target.id}: ${output(checkNoCss)}`);
  const checkReport = JSON.parse(checkNoCss.stdout);
  assert(checkReport.ok === true, `${target.id} check ok`);
  assert(checkReport.contract === "v4", `${target.id} check contract`);
  assert(checkStatus(checkReport, "styles-export") === "passed", `${target.id} styles export`);
  assert(checkStatus(checkReport, "tailwind-bridge") === "passed", `${target.id} bridge check`);
  assert(
    checkStatus(checkReport, "tailwind-prerequisite") === "passed",
    `${target.id} tailwind prerequisite`,
  );
  assert(
    checkStatus(checkReport, "css-imports") === "not_checked",
    `${target.id} css imports not guessed`,
  );
  assert(
    checkStatus(checkReport, "components") === "passed",
    `${target.id} component availability`,
  );

  // setup-tailwind: --check fails on pending changes, --dry-run previews, the
  // write changes only the named file, and a repeat is byte-stable.
  const cssBefore = readFileSync(appCssPath, "utf8");
  const checkPending = runPackedTools([
    "setup-tailwind",
    "--check",
    "--cwd",
    dir,
    "--css",
    "src/app.css",
  ]);
  assert(checkPending.status !== 0, `${target.id} setup-tailwind --check must fail when pending`);
  assert(readFileSync(appCssPath, "utf8") === cssBefore, `${target.id} --check wrote the CSS file`);
  const dryRun = runPackedTools([
    "setup-tailwind",
    "--dry-run",
    "--cwd",
    dir,
    "--css",
    "src/app.css",
  ]);
  assert(dryRun.status === 0, `${target.id} setup-tailwind --dry-run failed: ${output(dryRun)}`);
  assert(/preview only/.test(output(dryRun)), `${target.id} dry run must preview only`);
  assert(
    readFileSync(appCssPath, "utf8") === cssBefore,
    `${target.id} --dry-run wrote the CSS file`,
  );

  const beforeWrite = new Map(listFiles(dir).map((file) => [file, hashFile(join(dir, file))]));
  const write = runPackedTools(["setup-tailwind", "--cwd", dir, "--css", "src/app.css"]);
  assert(write.status === 0, `${target.id} setup-tailwind failed: ${output(write)}`);
  const cssAfter = readFileSync(appCssPath, "utf8");
  assert(cssAfter.includes('@import "tailwindcss";'), `${target.id} missing tailwindcss import`);
  assert(
    cssAfter.includes(`@import "${target.packageName}/tailwind.css";`),
    `${target.id} missing bridge import`,
  );
  assert(
    cssAfter.includes(`@import "${target.packageName}/styles.css";`),
    `${target.id} missing styles import`,
  );
  assert(
    cssAfter === managedCss(target.packageName, ["body { margin: 0; }"]),
    `${target.id} managed import block must be exact and preserve adjacent CSS`,
  );
  const afterWrite = new Map(listFiles(dir).map((file) => [file, hashFile(join(dir, file))]));
  const changedFiles = [];
  for (const [file, hash] of afterWrite) {
    if (beforeWrite.get(file) !== hash) changedFiles.push(file);
  }
  for (const file of beforeWrite.keys()) {
    if (!afterWrite.has(file)) changedFiles.push(file);
  }
  changedFiles.sort();
  assert(
    JSON.stringify(changedFiles) === JSON.stringify(["src/app.css"]),
    `${target.id} setup-tailwind must change only src/app.css, changed: ${changedFiles.join(", ")}`,
  );

  const checkAfter = runPackedTools(["check", "--css", "src/app.css", "--cwd", dir, "--json"]);
  assert(checkAfter.status === 0, `${target.id} check --css failed: ${output(checkAfter)}`);
  assert(
    checkStatus(JSON.parse(checkAfter.stdout), "css-imports") === "passed",
    `${target.id} css imports should pass after setup`,
  );
  const idempotent = runPackedTools(["setup-tailwind", "--cwd", dir, "--css", "src/app.css"]);
  assert(idempotent.status === 0, `${target.id} repeated setup failed: ${output(idempotent)}`);
  assert(/No changes needed/.test(output(idempotent)), `${target.id} setup must be idempotent`);

  // Strict usage: clean passes, a violation fails closed, --no-strict warns.
  const cleanUsage = runPackedTools(["check-usage", "--cwd", dir]);
  assert(cleanUsage.status === 0, `${target.id} clean check-usage failed: ${output(cleanUsage)}`);
  assert(/Usage check passed\./.test(output(cleanUsage)), `${target.id} usage pass message`);
  writeFile(dir, "src/bad.tsx", BAD_SOURCE);
  const badUsage = runPackedTools(["check-usage", "--cwd", dir]);
  assert(badUsage.status !== 0, `${target.id} strict usage must fail closed`);
  assert(/no-arbitrary-color/.test(output(badUsage)), `${target.id} arbitrary color diagnostic`);
  assert(
    /no-visual-style-override/.test(output(badUsage)),
    `${target.id} style override diagnostic`,
  );
  const relaxed = runPackedTools(["check-usage", "--cwd", dir, "--no-strict"]);
  assert(relaxed.status === 0, `${target.id} --no-strict must pass`);
  rmSync(join(dir, "src", "bad.tsx"));

  // Repeated connect is idempotent and byte-stable.
  const idempotentBefore = hashTree(dir);
  const again = runPackedTools(["connect", "--cwd", dir]);
  assert(again.status === 0, `${target.id} repeated connect failed: ${output(again)}`);
  assert(/Already connected/.test(output(again)), `${target.id} repeated connect message`);
  assert(hashTree(dir) === idempotentBefore, `${target.id} repeated connect was not byte-stable`);

  // The consumer package.json and dependencies are never mutated by read-only
  // commands or connect.
  assert(
    hashFile(consumerPackageJson) === packageHashBefore,
    `${target.id} consumer package.json mutated`,
  );
}

for (const target of targets) {
  runCheck(`offline consumer lifecycle against packed ${target.packageName}`, () => {
    verifyV4Consumer(target);
  });
}

/* -------------------------------------------------------------------------- */
/* Step 3: the packed V2 fixture stays fully supported                         */
/* -------------------------------------------------------------------------- */

runCheck("offline consumer lifecycle against the packed V2 fixture", () => {
  const dir = makeConsumer("v2", {
    packageName: V2_PACKAGE_NAME,
    version: V2_VERSION,
    sourceDir: join(v2FixtureDir, "package"),
  });
  const consumerPackageJson = join(dir, "package.json");
  const packageHashBefore = hashFile(consumerPackageJson);

  const connect = runPackedTools(["connect", "--cwd", dir]);
  assert(connect.status === 0, `V2 connect failed: ${output(connect)}`);
  const config = consumerConfig(dir);
  assert(config.package === V2_PACKAGE_NAME, "V2 config identity mismatch");
  assert(config.version === V2_VERSION, "V2 config version mismatch");
  const agents = readFileSync(join(dir, ".design-system", "AGENTS.md"), "utf8");
  assert(agents.includes("Contract: `v2`"), "V2 AGENTS must declare contract v2");
  assert(!agents.includes("/tailwind.css"), "V2 instructions must not claim a Tailwind bridge");

  const doctor = runPackedTools(["doctor", "--cwd", dir]);
  assert(doctor.status === 0, `V2 doctor failed: ${output(doctor)}`);
  assert(/Doctor passed\./.test(output(doctor)), "V2 doctor should pass");
  assert(!output(doctor).includes("tailwind bridge"), "V2 doctor must not require a bridge");

  const components = runPackedTools(["components", "--cwd", dir, "--json"]);
  assert(components.status === 0, `V2 components failed: ${output(components)}`);
  const catalog = JSON.parse(components.stdout);
  assert(catalog.contract === "v2", "V2 component contract");
  assert(catalog.counts.required === 14, "V2 required component count");
  assert(catalog.counts.optional === 0, "V2 has no optional components");

  const tokens = runPackedTools(["tokens", "--cwd", dir, "--json"]);
  assert(tokens.status === 0, "V2 tokens must exit zero (unsupported, not an error)");
  const tokenCatalog = JSON.parse(tokens.stdout);
  assert(tokenCatalog.supported === false, "V2 token catalog must be unsupported");
  assert(/no token catalog/.test(tokenCatalog.reason), "V2 token reason");

  const check = runPackedTools(["check", "--cwd", dir, "--json"]);
  assert(check.status === 0, `V2 check failed: ${output(check)}`);
  const report = JSON.parse(check.stdout);
  assert(report.ok === true, "V2 check ok");
  assert(report.contract === "v2", "V2 check contract");
  assert(checkStatus(report, "tailwind-bridge") === "not_applicable", "V2 bridge not applicable");
  assert(checkStatus(report, "css-imports") === "not_applicable", "V2 css imports not applicable");
  assert(checkStatus(report, "styles-export") === "passed", "V2 styles export");

  const usage = runPackedTools(["check-usage", "--cwd", dir]);
  assert(usage.status === 0, `V2 check-usage failed: ${output(usage)}`);

  // setup-tailwind is V4-only and must fail closed on a V2 system.
  const setup = runPackedTools(["setup-tailwind", "--cwd", dir, "--css", "src/app.css"]);
  assert(setup.status !== 0, "setup-tailwind must reject a V2 design system");
  assert(/V4 design systems/.test(output(setup)), "V2 setup-tailwind diagnostic");

  const repeat = runPackedTools(["connect", "--cwd", dir]);
  assert(repeat.status === 0 && /Already connected/.test(output(repeat)), "V2 connect idempotent");
  assert(hashFile(consumerPackageJson) === packageHashBefore, "V2 consumer package.json mutated");
});

/* -------------------------------------------------------------------------- */
/* Step 4: dual-contract fail-closed manifest handling                         */
/* -------------------------------------------------------------------------- */

runCheck("packed tools fail closed on unsupported manifest and exports", () => {
  const target = targets[0];

  const pairDir = makeConsumer("fail-pair", {
    packageName: target.packageName,
    version: target.version,
    sourceDir: target.extractedPackageDir,
  });
  const pairManifestPath = join(
    pairDir,
    "node_modules",
    ...target.packageName.split("/"),
    "design-system.json",
  );
  const pairManifest = readJsonFile(pairManifestPath);
  pairManifest.contract = "v2"; // schemaVersion stays 2 -> unsupported pair.
  writeJson(pairManifestPath, pairManifest);
  const pairConnect = runPackedTools(["connect", "--cwd", pairDir]);
  assert(pairConnect.status !== 0, "connect must reject an unsupported schema/contract pair");
  assert(
    /Unsupported schema\/contract pair/.test(output(pairConnect)),
    "unsupported pair diagnostic",
  );
  assert(
    !existsSync(join(pairDir, ".design-system", "config.json")),
    "connect must not write config for an invalid pair",
  );

  const exportDir = makeConsumer("fail-export", {
    packageName: target.packageName,
    version: target.version,
    sourceDir: target.extractedPackageDir,
  });
  const installedPkgPath = join(
    exportDir,
    "node_modules",
    ...target.packageName.split("/"),
    "package.json",
  );
  const installedPkg = readJsonFile(installedPkgPath);
  delete installedPkg.exports[MANIFEST_EXPORT_SUBPATH];
  writeJson(installedPkgPath, installedPkg);
  const exportConnect = runPackedTools(["connect", "--cwd", exportDir]);
  assert(exportConnect.status !== 0, "connect must fail closed without a ./manifest export");
  assert(
    /not installed|must expose|public .\/manifest|exports/i.test(output(exportConnect)),
    "missing export diagnostic",
  );
  assert(
    !existsSync(join(exportDir, ".design-system", "config.json")),
    "connect must not write config without a ./manifest export",
  );
});

/* -------------------------------------------------------------------------- */
/* Step 5: registry catalog and dependency-mutating commands (dual V2/V4)      */
/* -------------------------------------------------------------------------- */

/* Fake npm/pnpm shims that record their fixed arguments and exit 0. */
const FAKE_BIN_DIR = join(REGISTRY_DIR, "fake-bin");
const FAKE_ARGS_FILE = join(REGISTRY_DIR, "fake-args.txt");

function writeFakeManager(manager) {
  mkdirSync(FAKE_BIN_DIR, { recursive: true });
  if (process.platform === "win32") {
    writeFileSync(
      join(FAKE_BIN_DIR, `${manager}.cmd`),
      ["@echo off", `echo ${manager} %* >>"%FAKE_ARGS_FILE%"`, "exit /b 0", ""].join("\r\n"),
    );
    return;
  }
  const file = join(FAKE_BIN_DIR, manager);
  writeFileSync(file, `#!/bin/sh\nprintf '%s ' '${manager}' "$@" > "$FAKE_ARGS_FILE"\n`);
  chmodSync(file, 0o755);
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

/** Build the V4 upgrade-target fixture (1.2.0) from packed System A. */
function buildUpgradeTarget() {
  const base = readJsonFile(join(targets[0].extractedPackageDir, "design-system.json"));
  const manifest = structuredClone(base);
  manifest.version = "1.2.0";
  delete manifest.components.Grid;
  manifest.components.Section = { variants: [], sizes: [], members: [] };
  manifest.tokens.groups.containers.push("bleed");
  const dir = join(FIXTURE_DIR, "upgrade-target");
  writeJson(join(dir, "package", "package.json"), {
    name: manifest.package,
    version: manifest.version,
  });
  writeJson(join(dir, "package", "design-system.json"), manifest);
  return buildTarball(dir, `upgrade-${manifest.version}.tgz`);
}

let fixture = null;
let registryBase = null;

async function startRegistryFixture() {
  writeFakeManager("npm");
  writeFakeManager("pnpm");
  const entries = [];
  for (const target of targets) {
    const tarballPath = join(
      PACK_DIR,
      readdirSync(PACK_DIR).find((name) => name.includes(target.id) && name.endsWith(".tgz")),
    );
    const bytes = readFileSync(tarballPath);
    entries.push({
      packageName: target.packageName,
      version: target.version,
      contract: "v4",
      tarball: bytes,
      integrity: sha512Base64(bytes),
      tarballName: `${target.packageName.replace(/[@/]/g, "_")}.tgz`,
      latest: true,
    });
  }

  const upgradeTarball = readFileSync(buildUpgradeTarget());
  entries.push({
    packageName: targets[0].packageName,
    version: "1.2.0",
    contract: "v4",
    tarball: upgradeTarball,
    integrity: sha512Base64(upgradeTarball),
    tarballName: "upgrade-1.2.0.tgz",
    latest: false,
  });

  const v2Tarball = readFileSync(join(REGISTRY_DIR, `v2-valid-${V2_VERSION}.tgz`));
  entries.push({
    packageName: V2_PACKAGE_NAME,
    version: V2_VERSION,
    contract: "v2",
    tarball: v2Tarball,
    integrity: sha512Base64(v2Tarball),
    tarballName: "v2-valid.tgz",
    latest: true,
  });

  // A tarball without package/design-system.json, to prove fail-closed extraction.
  const missingDir = join(REGISTRY_DIR, "missing-manifest");
  writeJson(join(missingDir, "package", "package.json"), {
    name: targets[0].packageName,
    version: "9.9.9",
  });
  const missingTarball = readFileSync(buildTarball(missingDir, "missing-manifest.tgz"));

  const searchObjects = [];
  for (const entry of entries) {
    const already = searchObjects.some((object) => object.package.name === entry.packageName);
    if (already) continue;
    searchObjects.push({
      package: {
        name: entry.packageName,
        version: entry.version,
        description: `Fixture for ${entry.packageName}`,
        keywords: ["lifecycle", "design-system"],
      },
    });
  }
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
      /^\/(?:(happy|bad-integrity|missing-manifest)\/)?(@prism-system\/ui-[a-z0-9-]+)$/.exec(
        pathname,
      );
    if (match) {
      const prefix = match[1] ?? "happy";
      const packageEntries = entries.filter((entry) => entry.packageName === match[2]);
      if (packageEntries.length === 0) {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      const versions = {};
      for (const entry of packageEntries) {
        const metadata = {
          name: entry.packageName,
          version: entry.version,
          prismSystem: { contract: entry.contract },
          exports: { [MANIFEST_EXPORT_SUBPATH]: "./design-system.json" },
          dist: {
            tarball: `${registryBase}/tarballs/${entry.tarballName}`,
            integrity: entry.integrity,
          },
        };
        if (prefix === "bad-integrity" && entry.version === packageEntries[0].version) {
          metadata.dist.integrity = sha512Base64(Buffer.from("wrong"));
        }
        if (prefix === "missing-manifest" && entry.version === packageEntries[0].version) {
          metadata.dist.tarball = `${registryBase}/missing-manifest.tgz`;
          metadata.dist.integrity = sha512Base64(missingTarball);
        }
        versions[entry.version] = metadata;
      }
      const latest = packageEntries.find((entry) => entry.latest) ?? packageEntries[0];
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ name: match[2], "dist-tags": { latest: latest.version }, versions }),
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
    if (pathname === "/missing-manifest.tgz") {
      response.end(missingTarball);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  registryBase = `http://127.0.0.1:${server.address().port}`;
  return { server, state };
}

try {
  fixture = await startRegistryFixture();

  await runAsyncCheck("packed search lists only supported styles and mutates nothing", async () => {
    const before = fixture.state.requests.length;
    const json = await runPackedToolsAsync(["search", "--registry", registryBase, "--json"]);
    assert(json.status === 0, `search --json failed: ${output(json)}`);
    const parsed = JSON.parse(json.stdout);
    const names = parsed.results.map((entry) => entry.name);
    assert(
      names.join(",") ===
        "@prism-system/ui-system-a,@prism-system/ui-system-b,@prism-system/ui-v2-valid",
      `unexpected search results: ${names.join(",")}`,
    );
    assert(parsed.registry === registryBase, "search registry mismatch");
    assert(fixture.state.requests.length > before, "search made no registry request");
  });

  await runAsyncCheck("packed info validates V4 and V2 manifests and fails closed", async () => {
    const v4 = await runPackedToolsAsync([
      "info",
      "system-a",
      "--registry",
      registryBase,
      "--json",
    ]);
    assert(v4.status === 0, `info system-a failed: ${output(v4)}`);
    const v4Info = JSON.parse(v4.stdout);
    assert(v4Info.package === "@prism-system/ui-system-a", "info V4 package");
    assert(v4Info.contract === "v4", "info V4 contract");
    assert(v4Info.manifest.tokens.names.tailwindUtilityPrefix === "prism", "info V4 tokens");
    assert(Object.keys(v4Info.components).length === 27, "info V4 component count");

    const v2 = await runPackedToolsAsync([
      "info",
      "v2-valid",
      "--registry",
      registryBase,
      "--json",
    ]);
    assert(v2.status === 0, `info v2-valid failed: ${output(v2)}`);
    const v2Info = JSON.parse(v2.stdout);
    assert(v2Info.manifest.contract === "v2", "info V2 manifest contract");
    assert(typeof v2Info.contract === "undefined", "V2 info keeps the V2 shape");

    const cases = [
      {
        args: ["info", "system-a", "--registry", `${registryBase}/bad-integrity`],
        needle: /integrity mismatch/i,
      },
      {
        args: ["info", "system-a", "--registry", `${registryBase}/missing-manifest`],
        needle: /missing .*design-system\.json/i,
      },
      {
        args: ["info", "@prism-system/ui-core", "--registry", registryBase],
        needle: /Unsupported design system package/i,
      },
      {
        args: ["info", "system-a", "latest", "--registry", registryBase],
        needle: /Invalid version/i,
      },
    ];
    for (const testCase of cases) {
      const result = await runPackedToolsAsync(testCase.args);
      assert(result.status !== 0, `expected failure for ${testCase.args.join(" ")}`);
      assert(
        testCase.needle.test(output(result)),
        `diagnostic for ${testCase.args.join(" ")}: ${output(result)}`,
      );
    }
  });

  await runAsyncCheck("packed install/use/upgrade stay gated and fixed-arg (V4)", async () => {
    // A pre-staged consumer so a real install/use can verify the installed package
    // without the fake manager actually fetching it.
    const installDir = makeConsumer("registry-install", {
      packageName: targets[0].packageName,
      version: targets[0].version,
      sourceDir: targets[0].extractedPackageDir,
    });
    const installPackageHash = hashFile(join(installDir, "package.json"));

    const dryRun = await runPackedToolsAsync([
      "install",
      "system-a",
      "--cwd",
      installDir,
      "--registry",
      registryBase,
      "--exact",
      "--dry-run",
      "--json",
    ]);
    assert(dryRun.status === 0, `install --dry-run failed: ${output(dryRun)}`);
    const dryReport = JSON.parse(dryRun.stdout);
    assert(dryReport.ok === true && dryReport.dryRun === true, "install dry-run result");
    assert(dryReport.command.manager === "npm", "install dry-run manager");
    assert(
      dryReport.command.args.join(" ") ===
        `install --save-prod --save-exact --ignore-scripts --registry=${registryBase} ` +
          `@prism-system/ui-system-a@${targets[0].version}`,
      `install dry-run command: ${dryReport.command.args.join(" ")}`,
    );
    assert(
      hashFile(join(installDir, "package.json")) === installPackageHash,
      "dry-run mutated package.json",
    );

    rmSync(FAKE_ARGS_FILE, { force: true });
    const install = await runPackedToolsAsync(
      ["install", "system-a", "--cwd", installDir, "--registry", registryBase, "--exact"],
      { env: withFakeManagerEnv() },
    );
    assert(install.status === 0, `install failed: ${output(install)}`);
    const installArgs = readFakeArgs();
    assert(installArgs[0] === "npm", `npm shim not invoked: ${installArgs.join(" ")}`);
    assert(installArgs.includes("--ignore-scripts"), "install must pass --ignore-scripts");
    assert(
      installArgs[installArgs.length - 1] === `@prism-system/ui-system-a@${targets[0].version}`,
      "install target",
    );
    assert(!existsSync(join(installDir, ".design-system")), "install must not connect");

    rmSync(FAKE_ARGS_FILE, { force: true });
    const use = await runPackedToolsAsync(
      ["use", "system-a", "--cwd", installDir, "--registry", registryBase, "--check-usage"],
      { env: withFakeManagerEnv() },
    );
    assert(use.status === 0, `use failed: ${output(use)}`);
    assert(existsSync(join(installDir, ".design-system", "config.json")), "use must connect");
    assert(/0 error\(s\), 0 warning\(s\)/.test(output(use)), "use usage summary");
    const useAgain = await runPackedToolsAsync(
      ["use", "system-a", "--cwd", installDir, "--registry", registryBase, "--check-usage"],
      { env: withFakeManagerEnv() },
    );
    assert(useAgain.status === 0, `repeated use failed: ${output(useAgain)}`);
    assert(/already up to date/.test(output(useAgain)), "repeated use should be idempotent");

    const upgradeDry = await runPackedToolsAsync([
      "upgrade",
      "system-a",
      "1.2.0",
      "--cwd",
      installDir,
      "--registry",
      registryBase,
      "--dry-run",
      "--json",
    ]);
    assert(upgradeDry.status === 0, `upgrade --dry-run failed: ${output(upgradeDry)}`);
    const upgradeReport = JSON.parse(upgradeDry.stdout);
    assert(upgradeReport.fromVersion === targets[0].version, "upgrade fromVersion");
    assert(upgradeReport.toVersion === "1.2.0", "upgrade toVersion");
    assert(upgradeReport.diff.components.removed.join(",") === "Grid", "upgrade removed diff");
    assert(upgradeReport.diff.components.added.join(",") === "Section", "upgrade added diff");
    assert(upgradeReport.diff.tokens.added.containers.join(",") === "bleed", "upgrade token diff");
    assert(upgradeReport.dryRun === true, "upgrade dry-run flag");
  });

  await runAsyncCheck("packed install/use work against the V2 fixture", async () => {
    const dir = makeConsumer("registry-v2", {
      packageName: V2_PACKAGE_NAME,
      version: V2_VERSION,
      sourceDir: join(v2FixtureDir, "package"),
    });
    rmSync(FAKE_ARGS_FILE, { force: true });
    const use = await runPackedToolsAsync(
      ["use", "v2-valid", "--cwd", dir, "--registry", registryBase, "--check-usage"],
      { env: withFakeManagerEnv() },
    );
    assert(use.status === 0, `V2 use failed: ${output(use)}`);
    assert(readFakeArgs()[0] === "npm", "V2 use must invoke npm");
    const config = consumerConfig(dir);
    assert(config.package === V2_PACKAGE_NAME, "V2 use config identity");
    assert(config.version === V2_VERSION, "V2 use config version");
  });

  await runAsyncCheck("dependency-mutating commands fail closed without a manager", async () => {
    // No packageManager field and two supported lockfiles -> ambiguous, so the
    // manager must not be detected and no spawn may happen.
    const ambiguous = join(CONSUMER_DIR, "registry-ambiguous");
    rmSync(ambiguous, { recursive: true, force: true });
    mkdirSync(join(ambiguous, "src"), { recursive: true });
    writeJson(join(ambiguous, "package.json"), {
      name: "registry-ambiguous",
      version: "0.0.0",
      private: true,
      dependencies: { [targets[0].packageName]: targets[0].version },
    });
    writeFile(ambiguous, "package-lock.json", "");
    writeFile(ambiguous, "pnpm-lock.yaml", "");
    stagePackage(ambiguous, targets[0].packageName, targets[0].extractedPackageDir);
    rmSync(FAKE_ARGS_FILE, { force: true });
    const result = await runPackedToolsAsync(
      ["install", "system-a", "--cwd", ambiguous, "--registry", registryBase],
      { env: withFakeManagerEnv() },
    );
    assert(result.status !== 0, "ambiguous manager must fail closed");
    assert(/Ambiguous package manager/.test(output(result)), "ambiguous manager diagnostic");
    assert(readFakeArgs().length === 0, "manager must not be invoked on ambiguity");
  });
} finally {
  if (fixture !== null) {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
}

/* -------------------------------------------------------------------------- */
/* Step 6: no repository or workspace mutation                                 */
/* -------------------------------------------------------------------------- */

runCheck("repository source was not mutated", () => {
  for (const file of REPO_MUTATION_WATCH) {
    assert(
      hashFile(join(ROOT, file)) === repoHashesBefore.get(file),
      `repository file was mutated: ${file}`,
    );
  }
  assert(
    hashTree(join(TOOLS_PACKAGE_DIR, "src")) === toolsSrcHashBefore,
    "packages/tools/src was mutated",
  );
});

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

const failures = results.filter((result) => !result.ok);
log("");
log(
  `${results.length - failures.length}/${results.length} V4 packed-tools check(s) passed. ` +
    `Artifacts under ${toPosix(relative(ROOT, TEMP))}.`,
);

if (failures.length > 0) {
  log("V4 packed-tools check failed:");
  for (const failure of failures) log(`  - ${failure.name}: ${failure.error}`);
  process.exitCode = 1;
} else {
  log("V4 packed-tools check passed.");
}

mkdirSync(TEMP, { recursive: true });
writeFileSync(LOG_PATH, `${logs.join("\n")}\n`, "utf8");
