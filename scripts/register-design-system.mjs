#!/usr/bin/env node
/**
 * Canonical design-system registry.
 *
 * The registry is a single deterministic JSON manifest at
 * `config/design-systems.json`. It is the source of truth for which design
 * systems exist in the monorepo and the metadata later phases need to wire
 * them into Showcase / Reference App.
 *
 * This module is both a reusable library (imported by
 * `create-design-system.mjs`) and a CLI (`pnpm ds:register <id>`).
 *
 * There is exactly one current contract, identified by the numeric
 * `contractVersion: 4`. Every package, source descriptor, and registry entry
 * must declare it, and the package's own `design-system.source.json` is
 * authoritative. The registry never infers or relabels a contract (a
 * missing/mismatched/legacy contract is a hard error).
 *
 * Deterministic derivations (chosen to match the seeded systems exactly, so
 * re-registering an existing system is idempotent):
 *   package name  -> `@prism-system/ui-<id>`
 *   tokens export -> `<camelCase(id)>Tokens`
 *   ui class      -> `maivand-<id-without-system-prefix>-ui`
 *   display name  -> title-cased id, e.g. `fancy-tech` -> `Fancy Tech`
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyAppIntegration,
  planAppIntegration,
  rollbackAppIntegration,
} from "./sync-design-system-apps.mjs";
// The canonical source validation path. Registration invokes
// `readSourceDescriptor` so a package whose component map or token source is
// invalid can never be recorded in the registry or projected into the apps.
// This import is intentionally static: the two modules form a benign ESM cycle
// (the manifest tooling imports shared registry constants), and no imported
// binding is read during either module's top-level evaluation.
import { DESIGN_SYSTEM_SCHEMA_VERSION, readSourceDescriptor } from "./design-system-manifest.mjs";

/** Lower-kebab-case system id, e.g. `pulse`, `fancy-tech`. */
export const SYSTEM_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Ids that are not design systems and can never be registered. */
export const RESERVED_SYSTEM_IDS = Object.freeze(["core", "showcase", "reference-app"]);
/**
 * Registry manifest schema version.
 *
 * Version 3 carries the single current contract as the numeric
 * `contractVersion: 4` and keeps the required `version` field on every entry.
 */
export const MANIFEST_VERSION = 3;
/** Manifest location, relative to the repository (or `--root`) directory. */
export const MANIFEST_RELATIVE_PATH = "config/design-systems.json";
/** npm scope prefix for generated packages. */
export const PACKAGE_SCOPE = "@prism-system/ui-";
/** Workspace directory that holds design-system packages. */
export const PACKAGE_DIRECTORY = "packages";
/** The single current numeric component contract version. */
export const CONTRACT_VERSION = 4;

/** The complete `prismSystem` block every registrable package must declare. */
const PRISM_SYSTEM_FIELDS = Object.freeze(["name", "uiClass", "tokensExport"]);

/** Shared, actionable description of a required `prismSystem` block. */
function prismSystemExpectation() {
  return 'Expected { "name": string, "uiClass": string, "tokensExport": string }.';
}

/** Absolute path to the repository root (the parent directory of `scripts/`). */
export function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strip a leading UTF-8 BOM that Windows editors commonly add. */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Read and parse a JSON file, tolerating a leading BOM. */
export function readJsonFile(filePath) {
  return JSON.parse(stripBom(readFileSync(filePath, "utf8")));
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Expected a non-empty string for "${label}", received ${JSON.stringify(value)}.`,
    );
  }
  return value.trim();
}

/** `fancy-tech` -> `fancyTech` */
export function toCamelCase(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

/** `fancy-tech` -> `Fancy Tech` */
export function toDisplayName(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** `pulse` -> `@prism-system/ui-pulse` */
export function toPackageName(id) {
  return `${PACKAGE_SCOPE}${id}`;
}

/** `system-a` -> `systemATokens`, `fancy-tech` -> `fancyTechTokens` */
export function toTokensExport(id) {
  return `${toCamelCase(id)}Tokens`;
}

/** `system-a` -> `maivand-a`, `pulse` -> `maivand-pulse` (CSS class prefix). */
export function toSystemClass(id) {
  const slug = id.startsWith("system-") ? id.slice("system-".length) : id;
  return `maivand-${slug}`;
}

/** `system-a` -> `maivand-a-ui`, `pulse` -> `maivand-pulse-ui` (the `-ui` root class). */
export function toUiClass(id) {
  return `${toSystemClass(id)}-ui`;
}

/** Validate an id, rejecting reserved names. Returns the id. */
export function assertSystemId(id) {
  if (typeof id !== "string" || !SYSTEM_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid system id ${JSON.stringify(id)}. Use lower-kebab-case (for example "pulse" or "fancy-tech").`,
    );
  }
  if (RESERVED_SYSTEM_IDS.includes(id)) {
    throw new Error(
      `"${id}" is reserved (${RESERVED_SYSTEM_IDS.join(", ")}) and cannot be registered as a design system.`,
    );
  }
  return id;
}

/**
 * Resolve a path to its real location, following symlinks/junctions for every
 * ancestor that already exists. Not-yet-created leaf segments are re-appended
 * so callers can still validate paths before they are created.
 */
function resolveRealPath(targetPath) {
  let current = resolve(targetPath);
  const missing = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  let real;
  try {
    real = realpathSync.native(current);
  } catch {
    real = current;
  }
  return missing.length > 0 ? join(real, ...missing) : real;
}

/** Throw when `target` resolves outside of `base` (path-traversal guard). */
export function assertWithin(base, target, label = "Path") {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedBase, resolvedTarget);
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new Error(`${label} escapes ${resolvedBase}: ${resolvedTarget}.`);
  }
  // An existing symlink/junction can make a lexically-contained path resolve
  // outside the base, so re-check the real paths (leaf paths may not exist yet).
  const realBase = resolveRealPath(resolvedBase);
  const realTarget = resolveRealPath(resolvedTarget);
  const realRel = relative(realBase, realTarget);
  if (realRel !== "" && (realRel.startsWith("..") || isAbsolute(realRel))) {
    throw new Error(`${label} escapes ${realBase}: ${realTarget}.`);
  }
  return resolvedTarget;
}

/** Canonical manifest entry with a fixed, stable key order. */
export function buildEntry(input) {
  const entry = {
    id: assertSystemId(requireNonEmptyString(input.id, "id")),
    name: requireNonEmptyString(input.name, "name"),
    packageName: requireNonEmptyString(input.packageName, "packageName"),
    packagePath: requireNonEmptyString(input.packagePath, "packagePath"),
    // `package.json.version` is authoritative, so the registry mirrors it and
    // validation can detect drift between the registry, the package manifest,
    // and the generated `design-system.json`.
    version: requireNonEmptyString(input.version, "version"),
    uiClass: requireNonEmptyString(input.uiClass, "uiClass"),
    tokensExport: requireNonEmptyString(input.tokensExport, "tokensExport"),
    contractVersion: input.contractVersion,
  };
  if (entry.contractVersion !== CONTRACT_VERSION) {
    throw new Error(
      `Missing or unsupported "contractVersion" ${JSON.stringify(
        entry.contractVersion ?? null,
      )}; every design system must declare the numeric contractVersion: ${CONTRACT_VERSION}.`,
    );
  }
  return entry;
}

function sanitizeEntry(raw, index) {
  if (!isPlainObject(raw)) {
    throw new Error(`Manifest entry #${index} must be an object.`);
  }
  try {
    return buildEntry(raw);
  } catch (error) {
    throw new Error(`Manifest entry #${index} is invalid: ${error.message}`);
  }
}

/** Fields that must stay unique across different ids in a manifest. */
const UNIQUE_ENTRY_FIELDS = Object.freeze([
  ["packageName", "package name"],
  ["uiClass", "ui class"],
  ["tokensExport", "tokens export"],
]);

function assertNoDuplicates(systems) {
  const ids = new Set();
  const owners = {
    packageName: new Map(),
    uiClass: new Map(),
    tokensExport: new Map(),
  };
  for (const system of systems) {
    if (ids.has(system.id)) {
      throw new Error(`Duplicate design-system id "${system.id}" in manifest.`);
    }
    ids.add(system.id);
    for (const [field, label] of UNIQUE_ENTRY_FIELDS) {
      const value = system[field];
      const owner = owners[field].get(value);
      if (owner !== undefined) {
        throw new Error(
          `Duplicate ${label} "${value}" in manifest (ids "${owner}" and "${system.id}").`,
        );
      }
      owners[field].set(value, system.id);
    }
  }
}

/** An empty manifest. */
export function defaultManifest() {
  return { version: MANIFEST_VERSION, designSystems: [] };
}

/**
 * Validate and canonicalize a manifest: known fields only, stable key order,
 * entries sorted by id, and no duplicate ids, package names, ui classes, or
 * tokens exports.
 */
export function normalizeManifest(raw) {
  if (raw === undefined || raw === null) return defaultManifest();
  if (!isPlainObject(raw)) {
    throw new Error("Design-system manifest must be a JSON object.");
  }
  const version = raw.version ?? MANIFEST_VERSION;
  if (version !== MANIFEST_VERSION) {
    throw new Error(
      `Design-system manifest "version" must be ${MANIFEST_VERSION} (received ${JSON.stringify(
        version,
      )}); older registry shapes are not supported.`,
    );
  }
  const list = raw.designSystems ?? [];
  if (!Array.isArray(list)) {
    throw new Error('Design-system manifest "designSystems" must be an array.');
  }
  const systems = list.map(sanitizeEntry);
  systems.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  assertNoDuplicates(systems);
  return { version, designSystems: systems };
}

/** Stable, two-space JSON with a trailing newline. */
export function serializeManifest(manifest) {
  return `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`;
}

/** Read a manifest, returning an empty one when the file does not exist. */
export function readManifest({ manifestPath }) {
  const resolvedPath = resolve(manifestPath);
  if (!existsSync(resolvedPath)) return defaultManifest();
  let parsed;
  try {
    parsed = readJsonFile(resolvedPath);
  } catch (error) {
    throw new Error(`Invalid JSON in design-system manifest ${resolvedPath}: ${error.message}`);
  }
  return normalizeManifest(parsed);
}

/** Write a manifest atomically (temporary sibling then rename). */
export function writeManifest({ manifestPath, content }) {
  const resolvedPath = resolve(manifestPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const tempPath = `${resolvedPath}.tmp-${process.pid}-${Date.now()}`;
  let renamed = false;
  // Temp creation and rename share one cleanup path so a failed write never
  // leaves a stray temp file behind.
  try {
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, resolvedPath);
    renamed = true;
  } finally {
    if (!renamed) rmSync(tempPath, { force: true });
  }
}

/**
 * Add or update exactly one entry, rejecting package names, ui classes, or
 * tokens exports owned by a different id. Pure: returns a new manifest plus
 * the action taken.
 */
export function upsertDesignSystem(manifest, entry) {
  const normalized = normalizeManifest(manifest);
  const systems = [...normalized.designSystems];
  const index = systems.findIndex((system) => system.id === entry.id);
  for (const [field, label] of UNIQUE_ENTRY_FIELDS) {
    const conflicting = systems.find(
      (system) => system[field] === entry[field] && system.id !== entry.id,
    );
    if (conflicting) {
      throw new Error(
        `${label.charAt(0).toUpperCase()}${label.slice(1)} "${entry[field]}" is already ` +
          `registered to "${conflicting.id}". Choose a different id or ${label}.`,
      );
    }
  }

  let action;
  if (index === -1) {
    systems.push(entry);
    action = "added";
  } else {
    action = JSON.stringify(systems[index]) === JSON.stringify(entry) ? "unchanged" : "updated";
    systems[index] = entry;
  }
  systems.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { manifest: { version: normalized.version, designSystems: systems }, action };
}

/**
 * Read the optional `prismSystem` block a generated package exposes. It lets a
 * standalone `ds:register <id>` preserve the generated contract and display
 * name instead of re-deriving them.
 *
 * This reader stays lenient (it returns whatever fields are present) so that
 * validation can report each missing/incorrect field individually. Registration
 * enforces the complete block separately via
 * {@link assertCompletePrismSystem}.
 */
function readPrismSystemMetadata(pkg, packageJsonPath) {
  const raw = pkg.prismSystem;
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) {
    throw new Error(`Cannot register: "prismSystem" in ${packageJsonPath} must be an object.`);
  }
  const metadata = {};
  for (const field of PRISM_SYSTEM_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) continue;
    metadata[field] = requireNonEmptyString(raw[field], `prismSystem.${field}`);
  }
  return metadata;
}

/**
 * Read the contract version declared by a package's own
 * `design-system.source.json`.
 *
 * Registration uses this to validate package/source agreement, so the registry
 * records the package's real contract instead of inferring or relabeling it.
 * Only the current numeric `contractVersion: 4` is accepted.
 *
 * @returns {4} The declared contract version.
 */
export function readSourceContractVersion(packageDir) {
  const sourcePath = join(packageDir, "design-system.source.json");
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Cannot register: missing source descriptor at ${sourcePath}. ` +
        `Every design system declares its contract in design-system.source.json.`,
    );
  }
  let raw;
  try {
    raw = readJsonFile(sourcePath);
  } catch (error) {
    throw new Error(`Cannot register: invalid JSON in ${sourcePath}: ${error.message}`);
  }
  if (!isPlainObject(raw)) {
    throw new Error(`Cannot register: ${sourcePath} must be a JSON object.`);
  }
  if (raw.schemaVersion !== DESIGN_SYSTEM_SCHEMA_VERSION) {
    throw new Error(
      `Cannot register: ${sourcePath} must declare schemaVersion ` +
        `${DESIGN_SYSTEM_SCHEMA_VERSION}; received ${JSON.stringify(raw.schemaVersion ?? null)}.`,
    );
  }
  if (raw.contractVersion !== CONTRACT_VERSION) {
    throw new Error(
      `Cannot register: ${sourcePath} must declare the numeric contractVersion ` +
        `${CONTRACT_VERSION}; received ${JSON.stringify(raw.contractVersion ?? null)}.`,
    );
  }
  return CONTRACT_VERSION;
}

/**
 * Reject a package whose `prismSystem` metadata is not a complete block for the
 * current contract.
 *
 * A missing, partial, or mismatched block is a hard error rather than something
 * to derive or downgrade.
 */
function assertCompletePrismSystem(prismSystem, packageJsonPath) {
  const expectation = prismSystemExpectation();
  if (!isPlainObject(prismSystem)) {
    throw new Error(
      `Cannot register: ${packageJsonPath} is missing a complete "prismSystem" block. ` +
        expectation,
    );
  }
  const missing = PRISM_SYSTEM_FIELDS.filter(
    (field) => typeof prismSystem[field] !== "string" || prismSystem[field].trim().length === 0,
  );
  if (missing.length > 0) {
    throw new Error(
      `Cannot register: "prismSystem" in ${packageJsonPath} is incomplete ` +
        `(missing ${missing.join(", ")}). ${expectation}`,
    );
  }
}

/**
 * Validate a package's source descriptor and semantic token source through the
 * canonical manifest validation path.
 *
 * Registration must never record or app-integrate a package whose component map
 * or token source is invalid, so this runs the same strict validation the
 * generated manifest uses (`readSourceDescriptor` -> `parseSourceDescriptor` +
 * `readTokensSource`) before any manifest read, plan, apply, or write.
 */
function assertValidSource(packageDir, id) {
  try {
    readSourceDescriptor(packageDir);
  } catch (error) {
    throw new Error(`Cannot register "${id}": invalid source in ${packageDir}: ${error.message}`);
  }
}

/**
 * Read the generated package metadata needed to register a system.
 * Rejects missing/unknown package paths and non-canonical package names.
 */
export function readPackageMetadata({ id, root }) {
  const resolvedRoot = resolve(root);
  const packageDir = assertWithin(
    join(resolvedRoot, PACKAGE_DIRECTORY),
    join(resolvedRoot, PACKAGE_DIRECTORY, id),
    `Package path for "${id}"`,
  );
  if (!existsSync(packageDir)) {
    throw new Error(
      `Cannot register "${id}": package directory not found at ${packageDir}. ` +
        `Run "pnpm ds:create ${id}" first.`,
    );
  }
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Cannot register "${id}": missing package manifest at ${packageJsonPath}.`);
  }

  let pkg;
  try {
    pkg = readJsonFile(packageJsonPath);
  } catch (error) {
    throw new Error(
      `Cannot register "${id}": invalid JSON in ${packageJsonPath}: ${error.message}`,
    );
  }

  const expectedName = toPackageName(id);
  if (typeof pkg.name !== "string" || pkg.name.trim().length === 0) {
    throw new Error(`Cannot register "${id}": ${packageJsonPath} has no "name" field.`);
  }
  if (pkg.name !== expectedName) {
    throw new Error(
      `Cannot register "${id}": package name "${pkg.name}" does not match the expected canonical ` +
        `name "${expectedName}".`,
    );
  }

  let name = toDisplayName(id);
  const briefPath = join(packageDir, "design-brief.json");
  if (existsSync(briefPath)) {
    try {
      const brief = readJsonFile(briefPath);
      if (isPlainObject(brief) && typeof brief.project === "string" && brief.project.trim()) {
        name = brief.project.trim();
      }
    } catch (error) {
      throw new Error(`Cannot register "${id}": invalid JSON in ${briefPath}: ${error.message}`);
    }
  }

  if (typeof pkg.version !== "string" || pkg.version.trim().length === 0) {
    throw new Error(
      `Cannot register "${id}": ${packageJsonPath} has no "version" field; ` +
        `package.json.version is authoritative and must be a non-empty string.`,
    );
  }

  return {
    packageDir,
    packageName: pkg.name,
    version: pkg.version.trim(),
    name,
    prismSystem: readPrismSystemMetadata(pkg, packageJsonPath),
  };
}

/**
 * Register (add or update) exactly one design system.
 *
 * App integration is planned and applied from the *candidate* manifest before
 * the manifest is written. If the manifest write fails, the app bytes and new
 * files are rolled back so the repository is never left half-synced. A root
 * without `apps/` stays manifest-only.
 *
 * @param {object} options
 * @param {string} options.id          Lower-kebab-case system id.
 * @param {string} [options.root]      Root holding `packages/`, `config/`, and `apps/` (defaults to repo root).
 * @param {string} [options.manifestPath] Explicit manifest path (defaults to `<root>/config/design-systems.json`).
 * @param {object} [options.entry]     Optional metadata overrides (name/uiClass/tokensExport/contract).
 * @returns {Promise<{ id: string, entry: object, manifestPath: string, packagePath: string, action: string, changed: boolean, appIntegration: { status: string, reason: string | null, changed: boolean } }>}
 */
export async function registerDesignSystem(options = {}) {
  const id = assertSystemId(options.id);
  const root = resolve(options.root ?? repoRoot());
  const manifestPath = resolve(options.manifestPath ?? join(root, MANIFEST_RELATIVE_PATH));
  const metadata = readPackageMetadata({ id, root });
  // The package's own source descriptor is authoritative for the contract.
  // Refuse a missing/partial `prismSystem` block instead of deriving metadata.
  const packageJsonPath = join(metadata.packageDir, "package.json");
  const contractVersion = readSourceContractVersion(metadata.packageDir);
  assertCompletePrismSystem(metadata.prismSystem, packageJsonPath);
  // The numeric `contractVersion` alone is not proof the package is registrable:
  // validate the full component map and token source through the canonical path
  // before the candidate registry is read, planned, applied, or written.
  assertValidSource(metadata.packageDir, id);
  const override = options.entry ?? {};
  if (override.contractVersion !== undefined && override.contractVersion !== contractVersion) {
    throw new Error(
      `Cannot register "${id}": entry contractVersion ${JSON.stringify(
        override.contractVersion,
      )} does not match the package source descriptor contractVersion ${JSON.stringify(
        contractVersion,
      )}.`,
    );
  }

  const packagePath = relative(root, metadata.packageDir).split("\\").join("/");
  if (packagePath.startsWith("..") || isAbsolute(packagePath)) {
    throw new Error(
      `Cannot register "${id}": package path escapes the root at ${metadata.packageDir}.`,
    );
  }

  const previous = readManifest({ manifestPath });
  const existing = previous.designSystems.find((system) => system.id === id);
  const packageMetadata = metadata.prismSystem ?? {};
  const firstDefined = (...candidates) =>
    candidates.find((value) => value !== undefined && value !== null && value !== "");

  // Precedence (highest first): explicit entry override, the package's own
  // `prismSystem` metadata, the existing manifest entry, then brief/project or
  // derived defaults. Consulting the existing entry keeps a package from losing
  // generated metadata on a standalone `ds:register`. The contract version is
  // never defaulted: it is the package source descriptor's numeric
  // `contractVersion`, validated above.
  const entry = buildEntry({
    id,
    name: firstDefined(
      override.name,
      packageMetadata.name,
      existing?.name,
      metadata.name,
      toDisplayName(id),
    ),
    packageName: metadata.packageName,
    packagePath,
    version: metadata.version,
    uiClass: firstDefined(
      override.uiClass,
      packageMetadata.uiClass,
      existing?.uiClass,
      toUiClass(id),
    ),
    tokensExport: firstDefined(
      override.tokensExport,
      packageMetadata.tokensExport,
      existing?.tokensExport,
      toTokensExport(id),
    ),
    contractVersion,
  });

  const { manifest, action } = upsertDesignSystem(previous, entry);
  const content = serializeManifest(manifest);
  const changed = content !== serializeManifest(previous);

  // Plan and apply app integration from the candidate manifest first. Writing
  // the manifest last means a failed manifest write can roll the apps back.
  const plan = await planAppIntegration({ manifest, root });
  const applied = plan.status === "planned" ? applyAppIntegration(plan) : null;
  try {
    if (changed) writeManifest({ manifestPath, content });
  } catch (error) {
    if (applied) rollbackAppIntegration(applied);
    throw error;
  }

  return {
    id,
    entry,
    manifestPath,
    packagePath,
    action,
    changed,
    appIntegration: {
      status: applied ? "applied" : plan.status,
      reason: plan.reason ?? null,
      changed: applied ? applied.changed : false,
    },
  };
}

/** Render the CLI help text. */
export function helpText() {
  return [
    "Usage: pnpm ds:register <id> [options]",
    "",
    "Add or update exactly one design system in config/design-systems.json.",
    "Reads the generated package metadata from packages/<id>/package.json (including",
    "the `prismSystem` block) and design-brief.json, rejecting unknown paths and",
    "duplicate ids, package names, ui classes, or tokens exports.",
    "",
    "Arguments:",
    "  <id>                  Lower-kebab-case system id (e.g. pulse).",
    "",
    "Options:",
    "  --root <path>         Root holding packages/, config/, and apps/ (default: repo root).",
    "  --manifest <path>     Explicit manifest path (default: <root>/config/design-systems.json).",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { id: undefined, root: undefined, manifest: undefined, help: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      let value;
      if (equals !== -1) {
        value = arg.slice(equals + 1);
      } else {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (key === "root") options.root = value;
      else if (key === "manifest") options.manifest = value;
      else throw new Error(`Unknown option: --${key}`);
      continue;
    }
    positionals.push(arg);
  }
  if (positionals.length > 1) {
    throw new Error(`Expected a single <id>, received: ${positionals.join(", ")}.`);
  }
  options.id = positionals[0];
  return options;
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (!options.id) {
    process.stderr.write(`Missing required <id>.\n\n${helpText()}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await registerDesignSystem({
      id: options.id,
      root: options.root,
      manifestPath: options.manifest,
    });
    const location = relative(repoRoot(), result.manifestPath);
    const displayPath = location && !location.startsWith("..") ? location : result.manifestPath;
    process.stdout.write(
      `Registered "${result.entry.packageName}" (${result.id}) as ${result.action} in ${displayPath}.\n`,
    );
    if (result.appIntegration.status === "applied" && result.appIntegration.changed) {
      process.stdout.write("Synced Showcase and Reference App integration files.\n");
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
