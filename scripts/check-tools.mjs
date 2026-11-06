#!/usr/bin/env node
/**
 * Packed-artifact consumer validation harness for the published
 * `@prism-system/tools` CLI.
 *
 * A deterministic, fail-closed end-to-end check that exercises the completed
 * `prism-ds` surface against *packed artifacts*, never workspace source:
 *
 *   1. validate System A and System B (static) and pack them together with the
 *      published `@prism-system/tools` package;
 *   2. assert the packed Tailwind bridge / stylesheet / manifest artifacts;
 *   3. drive isolated consumers from the packed artifacts: connect, doctor,
 *      components, icons, tokens, check, setup-tailwind, check-usage, recover
 *      advice, offline skills inventory, idempotency, and the declared optional
 *      sets;
 *   4. exercise the read-only registry catalog and the dependency-mutating
 *      commands (`install`/`use`/`upgrade`) plus `switch`/`remove` dry-run
 *      previews against a local in-process registry serving the packed
 *      artifacts, with a fake package manager. It never invokes the real pinned
 *      Skills CLI, never runs a real CLI self-update, and never touches user
 *      skills.
 *
 * All pack/extract/scratch/log output lives under a fresh
 * `TEMP/lifecycle/tools-packed-<run-id>/` directory; an existing path is never
 * removed or overwritten. It never installs from the network, versions,
 * publishes, or mutates the repository. Requires the workspace to be installed
 * and built (`pnpm install && pnpm build`).
 *
 * CLI: pnpm ds:check-tools
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
import {
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_KEYS,
  ICON_EXPORT_NAMES,
  ICON_EXPORT_SUFFIX,
  ICON_NAMES,
} from "./design-system-manifest.mjs";
import { inspectTarball } from "./prepare-release.mjs";

const ROOT = repoRoot();
const TEMP_ROOT = join(ROOT, "TEMP", "lifecycle");
const TEMP = join(TEMP_ROOT, `tools-packed-${randomUUID()}`);
const PACK_DIR = join(TEMP, "pack");
const EXTRACT_DIR = join(TEMP, "extract");
const FIXTURE_DIR = join(TEMP, "fixtures");
const CONSUMER_DIR = join(TEMP, "consumers");
const REGISTRY_DIR = join(TEMP, "registry");
const LOG_PATH = join(TEMP, "check-tools.log");

const SYSTEM_IDS = ["system-a", "system-b"];

/**
 * The one registered system that declares an icon catalog. Its packed artifact
 * is checked separately from the A/B lifecycle matrix, which stays icon-free:
 * `icons` availability is the verified `publicApi["./icons"]` list, never the
 * core vocabulary and never a top-level manifest field.
 */
const ICON_SYSTEM_ID = "system-plr";
const ICON_SYSTEM_PACKAGE = "@prism-system/ui-system-plr";
const ICON_ENTRYPOINT = "./icons";

const TOOLS_PACKAGE_NAME = "@prism-system/tools";
const TOOLS_PACKAGE_DIR = join(ROOT, "packages", "tools");
const TOOLS_EXTRACT = join(EXTRACT_DIR, "tools");

/** Systems publish the bridge under this exact public subpath. */
const TAILWIND_EXPORT_SUBPATH = "./tailwind.css";
const STYLES_EXPORT_SUBPATH = "./styles.css";
const MANIFEST_EXPORT_SUBPATH = "./manifest";

/** The managed contract markers `connect` writes into the root `AGENTS.md`. */
const MANAGED_BLOCK_BEGIN = "<!-- BEGIN @prism-system design system contract (managed) -->";
const MANAGED_BLOCK_END = "<!-- END @prism-system design system contract (managed) -->";

/** The 29 required contract component names, in canonical order. */
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
  "Center",
  "Cluster",
  "Sidebar",
  "AspectRatio",
  "Combobox",
  "DatePicker",
  "NumberField",
  "Slider",
  "FileUpload",
];

/** The optional capability set each packed system declares. */
const OPTIONAL_SET = {
  "system-a": [
    "Grid",
    "Fieldset",
    "Alert",
    "Progress",
    "Accordion",
    "Pagination",
    "Table",
    "Metric",
    "DescriptionList",
    "Timeline",
    "Meter",
  ],
  "system-b": [
    "Section",
    "Alert",
    "Skeleton",
    "Toast",
    "Avatar",
    "Breadcrumbs",
    "Metric",
    "Timeline",
    "EmptyState",
  ],
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
  "packages/system-plr/package.json",
  "packages/system-plr/design-system.json",
  "packages/tools/package.json",
  "packages/tools/src/cli.mjs",
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
  "upgrade",
  "switch",
  "remove",
  "connect",
  "config",
  "components",
  "icons",
  "tokens",
  "check",
  "check-usage",
  "doctor",
  "setup-tailwind",
  "skills",
  "self-update",
  "recover",
];

/** `skills` subcommands; they are not separate root command names. */
const SKILLS_SUBCOMMANDS = ["list", "add", "update", "remove"];

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

/** Count non-overlapping occurrences of a literal needle. */
function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

/** A `package.json` object with the tool-owned `designSystem` field removed. */
function packageWithoutConfig(pkg) {
  const copy = { ...pkg };
  delete copy.designSystem;
  return copy;
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

runCheck("prepare unique TEMP/lifecycle/tools-packed workspace", () => {
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

runCheck("pack System A and System B", () => {
  for (const id of SYSTEM_IDS) {
    const packageDir = join(ROOT, "packages", id);
    assert(existsSync(join(packageDir, "dist")), `${id} is not built; run "pnpm build" first`);
    const pack = runPnpm(["pack", "--pack-destination", PACK_DIR], { cwd: packageDir });
    assert(pack.status === 0, `pnpm pack failed for ${id}: ${output(pack)}`);
  }
});

const targets = SYSTEM_IDS.map((id) => ({
  id,
  packageName: `@prism-system/ui-${id}`,
  packageDir: join(ROOT, "packages", id),
  extractDir: join(EXTRACT_DIR, id),
}));

/**
 * The icon-catalog target is packed and inspected independently so `icons` is
 * verified against a real shipped `./icons` entrypoint without widening the
 * component/lifecycle matrix asserted for systems A and B.
 */
const iconTarget = {
  id: ICON_SYSTEM_ID,
  packageName: ICON_SYSTEM_PACKAGE,
  packageDir: join(ROOT, "packages", ICON_SYSTEM_ID),
  extractDir: join(EXTRACT_DIR, ICON_SYSTEM_ID),
};

runCheck("pack the icon-catalog system", () => {
  assert(
    existsSync(join(iconTarget.packageDir, "dist")),
    `${ICON_SYSTEM_ID} is not built; run "pnpm build" first`,
  );
  const pack = runPnpm(["pack", "--pack-destination", PACK_DIR], { cwd: iconTarget.packageDir });
  assert(pack.status === 0, `pnpm pack failed for ${ICON_SYSTEM_ID}: ${output(pack)}`);
});

runCheck("extract and inspect the packed system artifacts", () => {
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
    assert(manifest.schemaVersion === 5, `${target.id} manifest must be schemaVersion 5`);
    assert(manifest.contractVersion === 4, `${target.id} manifest must declare contractVersion 4`);
    assert(manifest.package === target.packageName, `${target.id} manifest identity mismatch`);
    assert(manifest.version === pkg.version, `${target.id} manifest/package version mismatch`);
    target.manifest = manifest;
    target.version = pkg.version;
  }
});

runCheck("extract and inspect the packed icon-catalog system", () => {
  const tarball = readdirSync(PACK_DIR).find(
    (name) => name.includes(iconTarget.id) && name.endsWith(".tgz"),
  );
  assert(tarball, `no tarball produced for ${iconTarget.id}`);
  const tarballPath = join(PACK_DIR, tarball);
  const inspection = inspectTarball(tarballPath);
  assert(inspection.ok, `tarball inspection failed for ${iconTarget.id}: ${inspection.detail}`);
  mkdirSync(iconTarget.extractDir, { recursive: true });
  const extract = runTar(["-xzf", tarballPath, "-C", iconTarget.extractDir]);
  assert(extract.status === 0, `failed to extract ${iconTarget.id}: ${output(extract)}`);

  const extractedDir = join(iconTarget.extractDir, "package");
  iconTarget.extractedPackageDir = extractedDir;
  const pkg = readJsonFile(join(extractedDir, "package.json"));
  const manifest = readJsonFile(join(extractedDir, "design-system.json"));
  assert(pkg.name === iconTarget.packageName, `${iconTarget.id} packed package identity mismatch`);
  assert(
    manifest.package === iconTarget.packageName,
    `${iconTarget.id} manifest identity mismatch`,
  );
  assert(manifest.version === pkg.version, `${iconTarget.id} manifest/package version mismatch`);
  assert(manifest.schemaVersion === 5, `${iconTarget.id} manifest must be schemaVersion 5`);
  assert(
    manifest.contractVersion === 4,
    `${iconTarget.id} manifest must declare contractVersion 4`,
  );
  assert(
    manifest.icons === undefined,
    `${iconTarget.id} manifest must not gain a top-level "icons" field`,
  );
  assert(
    typeof pkg.exports?.[ICON_ENTRYPOINT] !== "undefined",
    `${iconTarget.id} must publish the ${ICON_ENTRYPOINT} entrypoint`,
  );

  // The entrypoint's real requirements are manifest data, not inferred from the
  // icon names; PLR depends on Lucide for its glyphs.
  const requirements = manifest.entrypoints?.[ICON_ENTRYPOINT]?.requirements;
  assert(
    Array.isArray(requirements) && requirements.length > 0,
    `${iconTarget.id} ${ICON_ENTRYPOINT} entrypoint must declare its requirements`,
  );
  const lucide = requirements.find((requirement) => requirement?.name === "lucide-react");
  assert(lucide, `${iconTarget.id} ${ICON_ENTRYPOINT} requirements must include lucide-react`);
  assert(lucide.kind === "dependency", `${iconTarget.id} lucide-react requirement kind`);
  assert(
    typeof lucide.range === "string" && lucide.range.trim().length > 0,
    `${iconTarget.id} lucide-react requirement range`,
  );
  assert(lucide.optional === false, `${iconTarget.id} lucide-react requirement must be required`);

  // Availability is only the verified canonical export list: no invented names,
  // no duplicates, and no `NameIcon` export implied outside the catalog.
  const declaredIcons = manifest.publicApi?.[ICON_ENTRYPOINT];
  assert(
    Array.isArray(declaredIcons) && declaredIcons.length > 0,
    `${iconTarget.id} must declare publicApi["${ICON_ENTRYPOINT}"]`,
  );
  assert(
    new Set(declaredIcons).size === declaredIcons.length,
    `${iconTarget.id} publicApi["${ICON_ENTRYPOINT}"] must be unique`,
  );
  const canonicalExports = new Set(ICON_EXPORT_NAMES);
  const nonCanonical = declaredIcons.filter((name) => !canonicalExports.has(name));
  assert(
    nonCanonical.length === 0,
    `${iconTarget.id} publicApi["${ICON_ENTRYPOINT}"] must contain only canonical ` +
      `NameIcon exports, invalid: ${nonCanonical.join(", ")}`,
  );

  iconTarget.declaredIcons = declaredIcons;
  iconTarget.manifest = manifest;
  iconTarget.version = pkg.version;
});

runCheck("packed systems ship a real Tailwind bridge and stylesheet", () => {
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

runCheck("the packed systems declare different optional capability sets", () => {
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

runCheck("the packed manifests declare the canonical capability categories", () => {
  for (const target of targets) {
    const categories = target.manifest.capabilities?.categories;
    assert(
      categories !== null && typeof categories === "object" && !Array.isArray(categories),
      `${target.id} manifest must declare capabilities.categories`,
    );
    assert(
      JSON.stringify(Object.keys(categories)) === JSON.stringify([...CAPABILITY_CATEGORY_KEYS]),
      `${target.id} capability category keys must be exactly ${CAPABILITY_CATEGORY_KEYS.join(
        ", ",
      )} (received ${Object.keys(categories).join(", ")})`,
    );
    for (const key of CAPABILITY_CATEGORY_KEYS) {
      const category = categories[key];
      assert(
        category !== null && typeof category === "object" && !Array.isArray(category),
        `${target.id} capability category "${key}" must be an object`,
      );
      assert(
        JSON.stringify(category.required) === JSON.stringify(CAPABILITY_CATEGORIES[key].required),
        `${target.id} capability category "${key}".required must be exactly ${JSON.stringify(
          CAPABILITY_CATEGORIES[key].required,
        )}`,
      );
      assert(
        JSON.stringify(category.optional) === JSON.stringify(CAPABILITY_CATEGORIES[key].optional),
        `${target.id} capability category "${key}".optional must be exactly ${JSON.stringify(
          CAPABILITY_CATEGORIES[key].optional,
        )}`,
      );
    }
  }
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
    "package/src/icons.mjs",
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
  // Stage TypeScript next to the packed tools so check-usage/check and the
  // scanner-backed switch/recover steps can lazy-load it without a network
  // install.
  // The packed checks below exercise argument-driven commands only. TypeScript
  // is the sole runtime dependency they load; the inline TUI dependencies stay
  // lazy and are installed normally by package consumers.
  stageRuntimeDependencies(join(extracted, ".."), {
    typescript: pkg.dependencies.typescript,
  });
  toolsPackageJson = pkg;
  toolsPackageJson.extractedDir = extracted;
});

assert(toolsPackageJson !== null, "packed tools inspection failed; see the failure above");

const toolsBin = join(
  toolsPackageJson.extractedDir,
  toolsPackageJson.bin["prism-ds"].replace(/^\.\//, ""),
);

function runPackedTools(args, { cwd = ROOT, env = process.env } = {}) {
  assert(existsSync(toolsBin), `packed prism-ds bin is missing at ${toolsBin}`);
  return spawnSync(process.execPath, [toolsBin, ...args], { cwd, env, encoding: "utf8" });
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

runCheck("packed prism-ds exposes the full command surface", () => {
  const help = runPackedTools(["--help"]);
  assert(help.status === 0, `prism-ds --help failed: ${output(help)}`);
  for (const command of TOOLS_COMMANDS) {
    assert(output(help).includes(command), `prism-ds --help is missing ${command}`);
  }
  for (const command of TOOLS_COMMANDS) {
    const commandHelp = runPackedTools([command, "--help"]);
    assert(commandHelp.status === 0, `prism-ds ${command} --help failed: ${output(commandHelp)}`);
  }
  const skillsHelp = output(runPackedTools(["skills", "--help"]));
  for (const subcommand of SKILLS_SUBCOMMANDS) {
    assert(skillsHelp.includes(subcommand), `prism-ds skills --help is missing ${subcommand}`);
  }
  // `self-update` is network- and mutation-capable; this packed gate verifies
  // only its help surface and never runs a real update.
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
    scripts: { test: "node --version" },
    harness: { owner: "check-tools" },
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
  const pkg = readJsonFile(join(dir, "package.json"));
  assert(pkg.designSystem, "consumer package.json is missing the designSystem field");
  return pkg.designSystem;
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

/** The full offline lifecycle for one packed system. */
function verifyConsumer(target) {
  const dir = makeConsumer(`${target.id}`, {
    packageName: target.packageName,
    version: target.version,
    sourceDir: target.extractedPackageDir,
    tailwind: "4.1.0",
  });
  const consumerPackageJson = join(dir, "package.json");
  const packageBefore = readJsonFile(consumerPackageJson);
  const appCssPath = join(dir, "src", "app.css");

  // Connect (configure-only) and verify exact identity/version invariants. The
  // contract is package.json#designSystem plus the root AGENTS.md managed block;
  // no `.design-system/` directory is created for a normal install.
  const connect = runPackedTools(["connect", target.packageName, "--cwd", dir]);
  assert(connect.status === 0, `connect failed for ${target.id}: ${output(connect)}`);
  assert(
    output(connect).includes(`${target.packageName}@${target.version}`),
    `connect must report the exact version for ${target.id}`,
  );
  const config = consumerConfig(dir);
  const manifest = installedManifest(dir, target.packageName);
  assert(
    manifest.contractVersion === 4,
    `${target.id} installed manifest must declare contractVersion 4`,
  );
  assert(
    manifest.schemaVersion === 5,
    `${target.id} installed manifest must declare schemaVersion 5`,
  );
  const installedCategories = manifest.capabilities?.categories;
  assert(
    installedCategories !== null &&
      typeof installedCategories === "object" &&
      JSON.stringify(Object.keys(installedCategories)) ===
        JSON.stringify([...CAPABILITY_CATEGORY_KEYS]),
    `${target.id} installed manifest must declare the canonical capability categories`,
  );
  assert(config.schemaVersion === 1, `${target.id} config schemaVersion mismatch`);
  assert(config.package === target.packageName, `${target.id} config identity mismatch`);
  assert(config.version === target.version, `${target.id} config version mismatch`);
  assert(config.strict === true, `${target.id} config strict default`);
  assert(
    !("manifest" in config) && !("$schema" in config),
    `${target.id} config must not carry legacy-only keys`,
  );
  assert(!existsSync(join(dir, ".design-system")), "connect must not create .design-system");

  const connectedPackage = readJsonFile(consumerPackageJson);
  assert(connectedPackage.name === packageBefore.name, `${target.id} package name mutated`);
  assert(
    connectedPackage.version === packageBefore.version,
    `${target.id} package version mutated`,
  );
  assert(
    JSON.stringify(connectedPackage.dependencies) === JSON.stringify(packageBefore.dependencies),
    `${target.id} package dependencies mutated`,
  );
  assert(
    JSON.stringify(connectedPackage.scripts) === JSON.stringify(packageBefore.scripts),
    `${target.id} package scripts mutated`,
  );
  assert(
    connectedPackage.harness?.owner === "check-tools",
    `${target.id} unrelated package.json key mutated`,
  );
  assert(
    JSON.stringify(packageWithoutConfig(connectedPackage)) ===
      JSON.stringify(packageWithoutConfig(packageBefore)),
    `${target.id} connect must preserve every consumer-owned package.json field`,
  );
  const rootAgents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert(
    rootAgents.startsWith("# Tools harness consumer\n\nUser-owned content.\n"),
    `${target.id} user AGENTS content not preserved`,
  );
  assert(
    countOccurrences(rootAgents, MANAGED_BLOCK_BEGIN) === 1 &&
      countOccurrences(rootAgents, MANAGED_BLOCK_END) === 1,
    `${target.id} managed block must have exactly one BEGIN and one END marker`,
  );

  // `connect --check` is read-only: up to date immediately after connect, out of
  // date once the recorded configuration no longer matches the installed system.
  const freshCheck = runPackedTools(["connect", "--check", "--cwd", dir]);
  assert(freshCheck.status === 0, `${target.id} connect --check failed: ${output(freshCheck)}`);
  assert(
    /Consumer contract is up to date/.test(output(freshCheck)),
    `${target.id} fresh connect --check must report up to date`,
  );
  const stalePackage = readJsonFile(consumerPackageJson);
  delete stalePackage.designSystem.version;
  writeJson(consumerPackageJson, stalePackage);
  const staleCheck = runPackedTools(["connect", "--check", "--cwd", dir]);
  assert(staleCheck.status !== 0, `${target.id} connect --check must report an incomplete field`);
  assert(
    /Consumer contract is out of date/.test(output(staleCheck)),
    `${target.id} stale connect --check diagnostic`,
  );
  const repaired = runPackedTools(["connect", "--cwd", dir]);
  assert(repaired.status === 0, `${target.id} connect repair failed: ${output(repaired)}`);
  assert(
    consumerConfig(dir).version === target.version,
    `${target.id} connect must restore the exact version`,
  );
  const connectedPackageHash = hashFile(consumerPackageJson);

  // Doctor: read-only, and the Tailwind bridge must validate.
  const doctor = runPackedTools(["doctor", "--cwd", dir]);
  assert(doctor.status === 0, `doctor failed for ${target.id}: ${output(doctor)}`);
  assert(/\[ok\] tailwind bridge/.test(output(doctor)), `${target.id} doctor bridge check`);
  assert(/Doctor passed\./.test(output(doctor)), `${target.id} doctor should pass`);

  // Component catalog: 29 required, the declared optional set, and the other
  // system's optionals reported unavailable.
  const components = runPackedTools(["components", "--cwd", dir, "--json"]);
  assert(components.status === 0, `components failed for ${target.id}: ${output(components)}`);
  const catalog = JSON.parse(components.stdout);
  assert(catalog.ok === true, `${target.id} components ok`);
  assert(catalog.contractVersion === 4, `${target.id} components contractVersion`);
  assert(catalog.counts.required === 29, `${target.id} components required count`);
  assert(catalog.counts.optional === 17, `${target.id} components optional count`);
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
  assert(checkReport.contractVersion === 4, `${target.id} check contractVersion`);
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

  // Read-only commands and a repeated connect never mutate the connected
  // consumer package.json; connect wrote `designSystem` exactly once above.
  assert(
    hashFile(consumerPackageJson) === connectedPackageHash,
    `${target.id} consumer package.json mutated`,
  );
}

for (const target of targets) {
  runCheck(`offline consumer lifecycle against packed ${target.packageName}`, () => {
    verifyConsumer(target);
  });
}

runCheck("packed icons reports the declared catalog offline", () => {
  const dir = makeConsumer("icon-catalog", {
    packageName: iconTarget.packageName,
    version: iconTarget.version,
    sourceDir: iconTarget.extractedPackageDir,
  });
  const before = hashTree(dir);
  const declared = iconTarget.declaredIcons;
  const expectedAvailable = ICON_NAMES.filter((name) =>
    declared.includes(`${name}${ICON_EXPORT_SUFFIX}`),
  );

  const catalog = runPackedTools(["icons", "--cwd", dir, "--json"]);
  assert(catalog.status === 0, `icons failed: ${output(catalog)}`);
  const parsed = JSON.parse(catalog.stdout);
  assert(parsed.ok === true, "icons ok");
  assert(parsed.contractVersion === 4, "icons contractVersion");
  assert(parsed.supported === true, "icons supported");
  assert(parsed.entrypoint === ICON_ENTRYPOINT, "icons entrypoint");
  assert(
    parsed.importPath === `${iconTarget.packageName}/icons`,
    `icons importPath: ${parsed.importPath}`,
  );
  assert(
    parsed.counts.available === declared.length,
    `icons available count must equal the declared publicApi list (${declared.length})`,
  );
  assert(parsed.counts.total === ICON_EXPORT_NAMES.length, "icons canonical total");
  assert(
    parsed.counts.unavailable === parsed.counts.total - declared.length,
    "icons unavailable count",
  );
  assert(
    JSON.stringify(parsed.available) === JSON.stringify(expectedAvailable),
    "icons available names must be the declared canonical names in canonical order",
  );
  for (const icon of parsed.icons) {
    if (!icon.available) {
      assert(icon.importStatement === null, `${icon.name} unavailable importStatement`);
      continue;
    }
    assert(declared.includes(icon.exportName), `${icon.name} exportName must be declared`);
    assert(icon.entrypoint === ICON_ENTRYPOINT, `${icon.name} entrypoint`);
    assert(icon.importPath === parsed.importPath, `${icon.name} importPath`);
    assert(
      icon.importStatement === `import { ${icon.exportName} } from "${parsed.importPath}";`,
      `${icon.name} importStatement`,
    );
  }

  const requested = runPackedTools(["icons", "Search", "--cwd", dir, "--json"]);
  assert(requested.status === 0, `icons Search failed: ${output(requested)}`);
  const requestedIcon = JSON.parse(requested.stdout).requested;
  assert(requestedIcon?.name === "Search", "icons requested name");
  assert(requestedIcon?.exportName === "SearchIcon", "icons requested exportName");
  assert(requestedIcon?.available === true, "icons requested availability");
  assert(requestedIcon?.reason === null, "icons requested reason");
  assert(
    requestedIcon?.importStatement ===
      `import { SearchIcon } from "${iconTarget.packageName}/icons";`,
    `icons requested importStatement: ${requestedIcon?.importStatement}`,
  );

  const unknown = runPackedTools(["icons", "Nope", "--cwd", dir, "--json"]);
  assert(unknown.status !== 0, "unknown icon must fail closed");
  assert(/Unknown icon/.test(output(unknown)), "unknown icon diagnostic");

  assert(hashTree(dir) === before, "icons must be read-only");
});

runCheck("packed icons reports absence without implying availability", () => {
  const target = targets[0];
  const dir = makeConsumer("icon-absent", {
    packageName: target.packageName,
    version: target.version,
    sourceDir: target.extractedPackageDir,
  });
  const before = hashTree(dir);

  const catalog = runPackedTools(["icons", "--cwd", dir, "--json"]);
  assert(catalog.status === 0, `icons failed for ${target.id}: ${output(catalog)}`);
  const parsed = JSON.parse(catalog.stdout);
  assert(parsed.ok === true, `${target.id} icons ok`);
  assert(parsed.supported === false, `${target.id} icons must report no catalog`);
  assert(parsed.entrypoint === null, `${target.id} absent icons entrypoint`);
  assert(parsed.importPath === null, `${target.id} absent icons importPath`);
  assert(parsed.counts.available === 0, `${target.id} absent icons available count`);
  assert(parsed.counts.unavailable === parsed.counts.total, `${target.id} absent icons count`);
  assert(parsed.available.length === 0, `${target.id} absent icons available list`);
  for (const icon of parsed.icons) {
    assert(icon.available === false, `${target.id} ${icon.name} must stay unavailable`);
    assert(icon.entrypoint === null, `${target.id} ${icon.name} entrypoint`);
    assert(icon.importPath === null, `${target.id} ${icon.name} importPath`);
    assert(icon.importStatement === null, `${target.id} ${icon.name} importStatement`);
  }

  const requested = runPackedTools(["icons", "Search", "--cwd", dir, "--json"]);
  assert(requested.status === 0, `icons Search failed for ${target.id}: ${output(requested)}`);
  const requestedIcon = JSON.parse(requested.stdout).requested;
  assert(requestedIcon?.available === false, `${target.id} requested icon must stay unavailable`);
  assert(requestedIcon?.reason === "no-icon-catalog", `${target.id} requested icon reason`);
  assert(requestedIcon?.importStatement === null, `${target.id} requested importStatement`);

  assert(hashTree(dir) === before, `${target.id} icons must be read-only`);
});

runCheck("connect migrates a legacy .design-system install in one run", () => {
  const target = targets[0];
  const dir = makeConsumer("legacy-migration", {
    packageName: target.packageName,
    version: target.version,
    sourceDir: target.extractedPackageDir,
  });
  // Seed a pre-package.json install: the legacy config, the generated
  // `.design-system/AGENTS.md`, and the consumer's own root AGENTS.md.
  writeJson(join(dir, ".design-system", "config.json"), {
    schemaVersion: 1,
    package: target.packageName,
    version: target.version,
    manifest: MANIFEST_EXPORT_SUBPATH,
    strict: true,
  });
  writeFile(
    dir,
    ".design-system/AGENTS.md",
    [
      "# Design system consumer contract",
      "",
      "This directory is generated by `prism-ds connect` from the `@prism-system/tools`",
      "package.",
      "",
    ].join("\n"),
  );
  const userAgents = "# Legacy consumer\n\nUser-owned content.\n";
  writeFile(dir, "AGENTS.md", userAgents);

  const migrated = runPackedTools(["connect", "--cwd", dir]);
  assert(migrated.status === 0, `legacy connect failed: ${output(migrated)}`);
  const config = consumerConfig(dir);
  assert(config.schemaVersion === 1, "migrated config schemaVersion");
  assert(config.package === target.packageName, "migrated config identity");
  assert(config.version === target.version, "migrated config version");
  assert(!existsSync(join(dir, ".design-system")), "legacy .design-system must be removed");
  const rootAgents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert(rootAgents.startsWith(userAgents), "legacy migration must preserve user AGENTS content");
  assert(
    countOccurrences(rootAgents, MANAGED_BLOCK_BEGIN) === 1 &&
      countOccurrences(rootAgents, MANAGED_BLOCK_END) === 1,
    "legacy migration must write exactly one managed block",
  );
});

runCheck("config moves the consumer configuration between both locations", () => {
  const target = targets[0];
  const dir = makeConsumer("config-location", {
    packageName: target.packageName,
    version: target.version,
    sourceDir: target.extractedPackageDir,
  });
  const extendedPath = join(dir, ".design-system", "config.json");

  const connected = runPackedTools(["connect", "--cwd", dir]);
  assert(connected.status === 0, `connect failed: ${output(connected)}`);
  const packageAfterConnect = readFileSync(join(dir, "package.json"), "utf8");

  const reported = runPackedTools(["config", "--cwd", dir]);
  assert(reported.status === 0, `config report failed: ${output(reported)}`);
  assert(
    output(reported).includes("package.json#designSystem"),
    "config must report the active package.json location",
  );

  const moved = runPackedTools(["config", "design-system", "--cwd", dir]);
  assert(moved.status === 0, `config design-system failed: ${output(moved)}`);
  const extended = readJsonFile(extendedPath);
  assert(
    extended.designSystem?.package === target.packageName &&
      extended.designSystem?.version === target.version,
    "the extended config must hold the identical designSystem subtree",
  );
  assert(
    readJsonFile(join(dir, "package.json")).designSystem === undefined,
    "moving to .design-system must remove the package.json field",
  );

  // A plain connect keeps the chosen location instead of migrating it back.
  const reconnect = runPackedTools(["connect", "--cwd", dir]);
  assert(reconnect.status === 0, `reconnect failed: ${output(reconnect)}`);
  assert(existsSync(extendedPath), "connect must not migrate a deliberate extended config back");
  assert(
    readJsonFile(join(dir, "package.json")).designSystem === undefined,
    "connect must not re-add the package.json field",
  );

  const pending = runPackedTools(["config", "package-json", "--cwd", dir, "--check"]);
  assert(pending.status === 1, "config --check must fail while the target location is not active");

  const dryRun = runPackedTools(["config", "package-json", "--cwd", dir, "--dry-run"]);
  assert(dryRun.status === 0, `config --dry-run failed: ${output(dryRun)}`);
  assert(existsSync(extendedPath), "a dry run must not move the configuration");

  const back = runPackedTools(["config", "package-json", "--cwd", dir]);
  assert(back.status === 0, `config package-json failed: ${output(back)}`);
  assert(!existsSync(join(dir, ".design-system")), "the emptied directory must be retired");
  assert(
    readFileSync(join(dir, "package.json"), "utf8") === packageAfterConnect,
    "moving back must restore the exact package.json bytes",
  );

  const atTarget = runPackedTools(["config", "package-json", "--cwd", dir, "--check"]);
  assert(atTarget.status === 0, "config --check must pass once the target location is active");
});

/* -------------------------------------------------------------------------- */
/* Step 3: unsupported metadata fails closed                                  */
/* -------------------------------------------------------------------------- */

runCheck("packed tools fail closed on unsupported metadata and exports", () => {
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
  pairManifest.contractVersion = 2; // schemaVersion stays 5 -> unsupported metadata.
  writeJson(pairManifestPath, pairManifest);
  const pairConnect = runPackedTools(["connect", "--cwd", pairDir]);
  assert(pairConnect.status !== 0, "connect must reject unsupported contract metadata");
  assert(
    /Unsupported manifest metadata \(schemaVersion 5, contractVersion 2\)/.test(
      output(pairConnect),
    ),
    "unsupported metadata diagnostic",
  );
  assert(
    readJsonFile(join(pairDir, "package.json")).designSystem === undefined,
    "connect must not write designSystem for invalid metadata",
  );
  assert(
    !existsSync(join(pairDir, ".design-system")),
    "connect must not create .design-system for invalid metadata",
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
    readJsonFile(join(exportDir, "package.json")).designSystem === undefined,
    "connect must not write designSystem without a ./manifest export",
  );
  assert(
    !existsSync(join(exportDir, ".design-system")),
    "connect must not create .design-system without a ./manifest export",
  );
});

/* -------------------------------------------------------------------------- */
/* Step 4: registry catalog and dependency-mutating commands                   */
/* -------------------------------------------------------------------------- */

/* Fake npm/pnpm shims that record their fixed arguments and exit 0, plus a fake
 * `npx` shim with its own marker so catalog/read-only/dry-run paths can prove
 * they never bootstrap the pinned Skills CLI. */
const FAKE_BIN_DIR = join(REGISTRY_DIR, "fake-bin");
const FAKE_ARGS_FILE = join(REGISTRY_DIR, "fake-args.txt");
const FAKE_NPX_MARKER = join(REGISTRY_DIR, "fake-npx.txt");

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

/** Fake `npx` that records every invocation to its own marker file. */
function writeFakeNpxShim() {
  mkdirSync(FAKE_BIN_DIR, { recursive: true });
  if (process.platform === "win32") {
    writeFileSync(
      join(FAKE_BIN_DIR, "npx.cmd"),
      ["@echo off", `echo npx %* >>"%FAKE_NPX_MARKER%"`, "exit /b 0", ""].join("\r\n"),
    );
    return;
  }
  const file = join(FAKE_BIN_DIR, "npx");
  writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "npx $*" >> "$FAKE_NPX_MARKER"\n`);
  chmodSync(file, 0o755);
}

function withFakeManagerEnv() {
  const delimiter = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: `${FAKE_BIN_DIR}${delimiter}${process.env.PATH ?? ""}`,
    FAKE_ARGS_FILE,
    FAKE_NPX_MARKER,
  };
}

/** Fixture-only home tree so offline inventory never reads the real user home. */
const HERMETIC_HOME = join(TEMP, "hermetic-home");
const HERMETIC_HOME_KEYS = [
  "USERPROFILE",
  "HOME",
  "APPDATA",
  "XDG_CONFIG_HOME",
  "XDG_STATE_HOME",
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
];

function withHermeticHomeEnv() {
  return {
    ...withFakeManagerEnv(),
    USERPROFILE: HERMETIC_HOME,
    HOME: HERMETIC_HOME,
    APPDATA: join(HERMETIC_HOME, "AppData", "Roaming"),
    XDG_CONFIG_HOME: join(HERMETIC_HOME, ".config"),
    XDG_STATE_HOME: join(HERMETIC_HOME, ".local", "state"),
    CLAUDE_CONFIG_DIR: join(HERMETIC_HOME, ".claude"),
    CODEX_HOME: join(HERMETIC_HOME, ".codex"),
  };
}

function resetFakeNpx() {
  rmSync(FAKE_NPX_MARKER, { force: true });
}

function readFakeNpxInvocations() {
  if (!existsSync(FAKE_NPX_MARKER)) return [];
  return readFileSync(FAKE_NPX_MARKER, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readFakeArgs() {
  if (!existsSync(FAKE_ARGS_FILE)) return [];
  const text = readFileSync(FAKE_ARGS_FILE, "utf8").trim();
  if (text === "") return [];
  return text.split(/\s+/);
}

/** Build the upgrade-target fixture (1.2.0) from packed System A. */
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
  // A fake `npx` shim so catalog/read-only/dry-run paths can prove they never
  // bootstrap the pinned Skills CLI.
  writeFakeNpxShim();
  // A fixture-only home tree: offline inventory must never read or write the
  // real user home or agent directories.
  for (const directory of [
    [".agents", "skills"],
    [".claude"],
    [".codex"],
    [".config"],
    [".local", "state"],
    ["AppData", "Roaming"],
  ]) {
    mkdirSync(join(HERMETIC_HOME, ...directory), { recursive: true });
  }
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
    tarball: upgradeTarball,
    integrity: sha512Base64(upgradeTarball),
    tarballName: "upgrade-1.2.0.tgz",
    latest: false,
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
          prismSystem: { contractVersion: 4 },
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
      names.join(",") === "@prism-system/ui-system-a,@prism-system/ui-system-b",
      `unexpected search results: ${names.join(",")}`,
    );
    assert(parsed.registry === registryBase, "search registry mismatch");
    assert(fixture.state.requests.length > before, "search made no registry request");
  });

  await runAsyncCheck("packed info validates current manifests and fails closed", async () => {
    const v4 = await runPackedToolsAsync([
      "info",
      "system-a",
      "--registry",
      registryBase,
      "--json",
    ]);
    assert(v4.status === 0, `info system-a failed: ${output(v4)}`);
    const v4Info = JSON.parse(v4.stdout);
    assert(v4Info.package === "@prism-system/ui-system-a", "info package");
    assert(v4Info.contractVersion === 4, "info contractVersion");
    assert(v4Info.manifest.tokens.names.tailwindUtilityPrefix === "prism", "info tokens");
    assert(
      Object.keys(v4Info.components).length ===
        REQUIRED_COMPONENTS.length + OPTIONAL_SET["system-a"].length,
      "info component count",
    );

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

  await runAsyncCheck("packed install/use/upgrade stay gated and fixed-arg", async () => {
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
    assert(
      readJsonFile(join(installDir, "package.json")).designSystem === undefined,
      "install must not write designSystem",
    );

    rmSync(FAKE_ARGS_FILE, { force: true });
    resetFakeNpx();
    const use = await runPackedToolsAsync(
      [
        "use",
        "system-a",
        "--cwd",
        installDir,
        "--registry",
        registryBase,
        "--check-usage",
        "--no-skills",
      ],
      { env: withFakeManagerEnv() },
    );
    assert(use.status === 0, `use failed: ${output(use)}`);
    const usedConfig = consumerConfig(installDir);
    assert(usedConfig.package === targets[0].packageName, "use must connect");
    assert(usedConfig.version === targets[0].version, "use must record the exact version");
    assert(
      !existsSync(join(installDir, ".design-system", "config.json")),
      "use must not write the legacy .design-system/config.json",
    );
    assert(/0 error\(s\), 0 warning\(s\)/.test(output(use)), "use usage summary");
    assert(
      readFakeNpxInvocations().length === 0,
      "use --no-skills must not bootstrap the pinned Skills CLI",
    );
    resetFakeNpx();
    const useAgain = await runPackedToolsAsync(
      [
        "use",
        "system-a",
        "--cwd",
        installDir,
        "--registry",
        registryBase,
        "--check-usage",
        "--no-skills",
      ],
      { env: withFakeManagerEnv() },
    );
    assert(useAgain.status === 0, `repeated use failed: ${output(useAgain)}`);
    assert(/already up to date/.test(output(useAgain)), "repeated use should be idempotent");
    assert(
      readFakeNpxInvocations().length === 0,
      "repeated use --no-skills must not bootstrap the pinned Skills CLI",
    );

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

  await runAsyncCheck("packed switch/remove previews and recover stay read-only", async () => {
    const dir = makeConsumer("registry-switch", {
      packageName: targets[0].packageName,
      version: targets[0].version,
      sourceDir: targets[0].extractedPackageDir,
    });
    // Keep this consumer clean for the removal-preview smoke; separate lifecycle
    // tests exercise the expected blocker when token/component usage remains.
    writeFile(dir, "src/clean.tsx", "export const Empty = () => null;\n");
    const connected = runPackedTools(["connect", targets[0].packageName, "--cwd", dir]);
    assert(connected.status === 0, `switch fixture connect failed: ${output(connected)}`);
    const before = hashTree(dir);

    // switch --dry-run: resolve the other packed system, report compatibility,
    // and prove neither the manager nor any consumer file is touched. The
    // hermetic home keeps the run away from real user/agent state.
    rmSync(FAKE_ARGS_FILE, { force: true });
    resetFakeNpx();
    const switchDry = await runPackedToolsAsync(
      ["switch", "system-b", "--cwd", dir, "--registry", registryBase, "--dry-run", "--json"],
      { env: withHermeticHomeEnv() },
    );
    assert(switchDry.status === 0, `switch --dry-run failed: ${output(switchDry)}`);
    const switchReport = JSON.parse(switchDry.stdout);
    assert(typeof switchReport === "object" && switchReport !== null, "switch JSON report");
    assert(output(switchDry).includes("system-b"), "switch --dry-run must report the target");
    assert(hashTree(dir) === before, "switch --dry-run mutated the consumer");
    assert(readFakeArgs().length === 0, "switch --dry-run must not spawn the manager");
    assert(readFakeNpxInvocations().length === 0, "switch --dry-run must not bootstrap npx");

    // remove --dry-run: preview attributable removal without mutation.
    rmSync(FAKE_ARGS_FILE, { force: true });
    resetFakeNpx();
    const removeDry = await runPackedToolsAsync(
      ["remove", targets[0].packageName, "--cwd", dir, "--dry-run", "--json"],
      { env: withHermeticHomeEnv() },
    );
    assert(removeDry.status === 0, `remove --dry-run failed: ${output(removeDry)}`);
    const removeReport = JSON.parse(removeDry.stdout);
    assert(typeof removeReport === "object" && removeReport !== null, "remove JSON report");
    assert(output(removeDry).includes("system-a"), "remove --dry-run must report the selection");
    assert(hashTree(dir) === before, "remove --dry-run mutated the consumer");
    assert(readFakeArgs().length === 0, "remove --dry-run must not spawn the manager");
    assert(readFakeNpxInvocations().length === 0, "remove --dry-run must not bootstrap npx");

    // recover default run: structured offline advice, nothing written.
    resetFakeNpx();
    const recover = runPackedTools(["recover", "--cwd", dir, "--json"], {
      env: withHermeticHomeEnv(),
    });
    assert(recover.status === 0, `recover failed: ${output(recover)}`);
    const recoverReport = JSON.parse(recover.stdout);
    assert(typeof recoverReport === "object" && recoverReport !== null, "recover JSON report");
    assert(hashTree(dir) === before, "recover default run mutated the consumer");
    assert(readFakeNpxInvocations().length === 0, "recover must not bootstrap npx");
  });

  await runAsyncCheck("packed skills list is an offline inventory", async () => {
    const dir = makeConsumer("registry-skills", {
      packageName: targets[0].packageName,
      version: targets[0].version,
      sourceDir: targets[0].extractedPackageDir,
    });
    const before = hashTree(dir);
    const homeBefore = hashTree(HERMETIC_HOME);
    const env = withHermeticHomeEnv();
    // The inventory must run against the fixture home tree, never the real
    // user or agent directories.
    for (const key of HERMETIC_HOME_KEYS) {
      assert(
        typeof env[key] === "string" && env[key].startsWith(TEMP),
        `${key} must point into the fixture temp root`,
      );
    }
    rmSync(FAKE_ARGS_FILE, { force: true });
    resetFakeNpx();
    const list = await runPackedToolsAsync(["skills", "list", "--cwd", dir, "--json"], { env });
    assert(list.status === 0, `skills list failed: ${output(list)}`);
    const inventory = JSON.parse(list.stdout);
    assert(typeof inventory === "object" && inventory !== null, "skills inventory JSON");
    assert(hashTree(dir) === before, "skills list mutated the consumer");
    assert(hashTree(HERMETIC_HOME) === homeBefore, "skills list wrote to the fixture home");
    assert(readFakeArgs().length === 0, "skills list must not spawn a package manager");
    assert(
      readFakeNpxInvocations().length === 0,
      "skills list must stay offline and never bootstrap the pinned Skills CLI",
    );
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
  `${results.length - failures.length}/${results.length} packed-tools check(s) passed. ` +
    `Artifacts under ${toPosix(relative(ROOT, TEMP))}.`,
);

if (failures.length > 0) {
  log("Packed tools check failed:");
  for (const failure of failures) log(`  - ${failure.name}: ${failure.error}`);
  process.exitCode = 1;
} else {
  log("Packed tools check passed.");
}

mkdirSync(TEMP, { recursive: true });
writeFileSync(LOG_PATH, `${logs.join("\n")}\n`, "utf8");
