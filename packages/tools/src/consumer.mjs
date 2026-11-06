#!/usr/bin/env node
/**
 * Consumer setup and discovery (published implementation).
 *
 * `prism-ds connect` prepares a *consumer* repository to use an
 * already-installed `@prism-system/ui-*` design system. It is configure-only:
 *
 *   - it never installs packages or edits consumer dependencies;
 *   - it never copies component source or styling;
 *   - it never mutates the design-system repository or accesses its source.
 *
 * The consumer contract is the root `package.json` `"designSystem"` field plus
 * an idempotent managed section in the root `AGENTS.md`:
 *
 *   <consumer-root>/package.json   "designSystem": { schemaVersion, package, version, strict, ignore? }
 *   <consumer-root>/AGENTS.md      managed contract block (user content preserved)
 *
 * No directory or extra configuration file is created for a normal install.
 * `.design-system/` remains an optional project-local extension directory: it
 * holds tool-managed state that does not belong in `package.json` (currently
 * `skills.json`) and is reserved for future complex configuration that genuinely
 * outgrows the package.json field.
 *
 * Discovery precedence: explicit `--package`, then the root `package.json`
 * `"designSystem"` field, then a legacy `.design-system/config.json` (read-only
 * migration path for pre-package.json installs), then dependency discovery when
 * exactly one supported `@prism-system/ui-*` package exists. Invalid config,
 * conflicting configs, multiple candidates, a missing package, or mismatched
 * versions fail closed.
 *
 * The installed package and its public `./manifest` export are resolved from the
 * consumer's current package installation, with Node package resolution as the
 * fallback for hoisted layouts — never by hardcoding a monorepo layout or
 * importing package internals. Verification requires exact
 * equality among the consumer config version (when present), the installed
 * `package.json` version, the shipped `design-system.json` version, and the
 * package identity. The shipped manifest must declare the current metadata —
 * `schemaVersion: 5` and `contractVersion: 4`; any other shape fails closed.
 *
 * This module is both a library and the implementation behind the `prism-ds`
 * CLI. It never falls back to a repository root: every entry point requires an
 * explicit consumer root.
 */

import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  CONTRACT_VERSION,
  MANIFEST_EXPORT_SUBPATH,
  MANIFEST_EXPORT_TARGET,
  MANIFEST_SCHEMA_VERSION,
  PACKAGE_SCOPE,
  RESERVED_SYSTEM_IDS,
  SYSTEM_ID_PATTERN,
  assertWithin,
  readJsonFile,
  resolveRealPath,
  toPackageName,
} from "./constants.mjs";
import { collectManifestFailures, detectManifestContract } from "./manifest.mjs";

/**
 * Optional project-local extension directory, relative to the consumer root.
 * It is NOT the configuration location: configuration lives in `package.json`
 * under {@link CONSUMER_CONFIG_KEY}. This directory only holds tool-managed
 * state that does not belong in `package.json` (currently `skills.json`) and is
 * reserved for future configuration that outgrows the package.json field.
 */
export const CONSUMER_DIRECTORY = ".design-system";
/** The root `package.json` field that holds the consumer configuration. */
export const CONSUMER_CONFIG_KEY = "designSystem";
/** Human-readable label for the primary configuration location. */
export const CONSUMER_CONFIG_LABEL = `package.json#${CONSUMER_CONFIG_KEY}`;
/**
 * The supported consumer configuration locations. `package-json` is the default;
 * `design-system` stores the identical configuration subtree in
 * `.design-system/config.json` for consumers that need a dedicated extended
 * configuration file.
 */
export const CONSUMER_LOCATIONS = Object.freeze(["package-json", "design-system"]);
/** The default consumer configuration location. */
export const DEFAULT_CONSUMER_LOCATION = "package-json";
/**
 * Legacy configuration filename inside {@link CONSUMER_DIRECTORY}. It is read
 * only to migrate pre-package.json installs and is retired by `connect`; never
 * write it for a new installation.
 */
export const LEGACY_CONSUMER_CONFIG_FILENAME = "config.json";
/**
 * Legacy generated agent-instructions filename inside
 * {@link CONSUMER_DIRECTORY}. Instructions now live in the root `AGENTS.md`
 * managed block; this constant only identifies files left by older installs so
 * they can be attributed and retired.
 */
export const LEGACY_CONSUMER_AGENTS_FILENAME = "AGENTS.md";
/** Consumer config schema version. */
export const CONSUMER_SCHEMA_VERSION = 1;
/** Consumer config schema URL. */
export const CONSUMER_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system-consumer.schema.json";
/** Managed contract block markers in the consumer root AGENTS.md. */
export const MANAGED_BLOCK_BEGIN = "<!-- BEGIN @prism-system design system contract (managed) -->";
export const MANAGED_BLOCK_END = "<!-- END @prism-system design system contract (managed) -->";
/** The published CLI name used in generated consumer instructions. */
export const CLI_NAME = "prism-ds";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected a non-empty string for "${label}".`);
  }
  return value.trim();
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

/** True for a supported `@prism-system/ui-<id>` design-system package name. */
export function isSupportedPackageName(name) {
  if (typeof name !== "string" || !name.startsWith(PACKAGE_SCOPE)) return false;
  const id = name.slice(PACKAGE_SCOPE.length);
  return SYSTEM_ID_PATTERN.test(id) && !RESERVED_SYSTEM_IDS.includes(id);
}

/** Accept either a package name or a system id and return the package name. */
export function normalizeRequestedPackage(value) {
  const text = requireNonEmptyString(value, "package");
  const packageName = text.startsWith("@") ? text : toPackageName(text);
  if (!isSupportedPackageName(packageName)) {
    throw new Error(
      `Unsupported design system package ${JSON.stringify(value)}; expected a supported ` +
        `@prism-system/ui-* package.`,
    );
  }
  return packageName;
}

/** Resolve an explicit consumer root; never falls back to a repository root. */
export function resolveConsumerRoot({ cwd } = {}) {
  if (typeof cwd !== "string" || cwd.trim().length === 0) {
    throw new Error(
      "The consumer command requires an explicit --cwd <path> consumer root; it never falls " +
        "back to the design-system repository root.",
    );
  }
  const resolved = resolve(cwd);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`Consumer root does not exist or is not a directory: ${resolved}.`);
  }
  return resolved;
}

/**
 * Resolve a consumer-owned path and require it to stay inside the real consumer
 * root, following symlinks/junctions. New leaves are checked through their
 * nearest existing ancestor. This rejects an external `.design-system` symlink
 * or a symlinked root file that resolves outside the requested `--cwd`, while
 * allowing symlinks that remain contained.
 *
 * This is intentionally NOT applied to read-only package resolution under
 * `node_modules`, where package symlinks are expected.
 */
export function resolveConsumerPath(consumerRoot, ...segments) {
  const target = join(consumerRoot, ...segments);
  return assertWithin(
    consumerRoot,
    target,
    `Consumer path ${segments.length > 0 ? segments.join("/") : "."}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Split a leading UTF-8 BOM from `text` so JSON.parse is not confused by it. */
function splitBom(text) {
  return text.charCodeAt(0) === 0xfeff
    ? { bom: "\uFEFF", body: text.slice(1) }
    : { bom: "", body: text };
}

/** Detect the indentation unit a JSON document already uses. */
function detectJsonIndent(body) {
  const match = /^([ \t]+)"/m.exec(body);
  return match === null ? "  " : match[1];
}

/**
 * Validate a raw consumer configuration object and return the normalized shape.
 *
 * One validator serves both the `package.json` field and the legacy
 * `.design-system/config.json` so the two can never drift during migration.
 * `version` is optional: `connect` always records the exact verified version,
 * but a hand-written configuration may omit it and rely on the installed
 * package instead.
 */
function normalizeConsumerConfig(raw, { consumerRoot, path, label, source }) {
  const fail = (message) => {
    throw new Error(`Invalid consumer config ${label}: ${message}`);
  };
  if (!isPlainObject(raw)) fail("it must be a JSON object.");
  if (raw.schemaVersion !== CONSUMER_SCHEMA_VERSION) {
    fail(
      `"schemaVersion" is ${JSON.stringify(raw.schemaVersion ?? null)}; expected ` +
        `${CONSUMER_SCHEMA_VERSION}.`,
    );
  }
  if (typeof raw.package !== "string" || raw.package.trim().length === 0) {
    fail('"package" must be a non-empty string.');
  }
  const packageName = raw.package.trim();
  if (!isSupportedPackageName(packageName)) {
    fail(`"package" names unsupported package ${JSON.stringify(packageName)}.`);
  }
  let version = null;
  if (raw.version !== undefined && raw.version !== null) {
    version = requireNonEmptyString(raw.version, "config.version");
  }
  // `manifest` was required by the legacy file and is an invariant of the public
  // package contract; accept it when present, but never require or write it.
  if (raw.manifest !== undefined && raw.manifest !== MANIFEST_EXPORT_SUBPATH) {
    fail(`"manifest" must be exactly ${JSON.stringify(MANIFEST_EXPORT_SUBPATH)}.`);
  }
  const strict = raw.strict === undefined ? true : raw.strict;
  if (typeof strict !== "boolean") fail('"strict" must be a boolean.');
  const ignore = normalizeIgnoreGlobs(consumerRoot, raw.ignore, "config");
  return {
    schemaVersion: CONSUMER_SCHEMA_VERSION,
    package: packageName,
    version,
    strict,
    ignore,
    path,
    label,
    source,
  };
}

/**
 * Read and validate `<root>/.design-system/config.json`, or null.
 *
 * The file has two accepted shapes:
 *
 *   - extended layout: `{ "designSystem": { … } }` — the same subtree as
 *     `package.json`, written by `prism-ds config design-system`. This is a
 *     deliberate, supported location.
 *   - legacy layout: the configuration at the file root, as older `connect`
 *     versions wrote it. It is read only so existing installs keep working and
 *     can be migrated; it is never written again.
 */
function readConfigFileConsumerConfig(consumerRoot) {
  const configPath = resolveConsumerPath(
    consumerRoot,
    CONSUMER_DIRECTORY,
    LEGACY_CONSUMER_CONFIG_FILENAME,
  );
  if (!existsSync(configPath)) return null;
  let raw;
  try {
    raw = readJsonFile(configPath);
  } catch (error) {
    throw new Error(`Invalid consumer config ${configPath}: ${error.message}`);
  }
  if (isPlainObject(raw) && raw[CONSUMER_CONFIG_KEY] !== undefined) {
    return normalizeConsumerConfig(raw[CONSUMER_CONFIG_KEY], {
      consumerRoot,
      path: configPath,
      label: `${configPath}#${CONSUMER_CONFIG_KEY}`,
      source: "extended-config",
    });
  }
  return normalizeConsumerConfig(raw, {
    consumerRoot,
    path: configPath,
    label: configPath,
    source: "legacy-config",
  });
}

/** Read the consumer `package.json` document, or null when it does not exist. */
export function readConsumerPackageJson(consumerRoot) {
  const packageJsonPath = resolveConsumerPath(consumerRoot, "package.json");
  if (!existsSync(packageJsonPath)) return null;
  try {
    return { path: packageJsonPath, json: readJsonFile(packageJsonPath) };
  } catch (error) {
    throw new Error(`Invalid consumer package.json ${packageJsonPath}: ${error.message}`);
  }
}

/** Read and validate `<root>/package.json` `"designSystem"`, or null. */
function readPackageJsonConsumerConfig(consumerRoot) {
  const packageJson = readConsumerPackageJson(consumerRoot);
  if (packageJson === null) return null;
  const raw = packageJson.json?.[CONSUMER_CONFIG_KEY];
  if (raw === undefined || raw === null) return null;
  const label = `${packageJson.path}#${CONSUMER_CONFIG_KEY}`;
  // A bare package name is accepted as the minimal hand-written form; `connect`
  // replaces it with the full object once the exact version is verified.
  if (typeof raw === "string") {
    return {
      schemaVersion: CONSUMER_SCHEMA_VERSION,
      package: normalizeRequestedPackage(raw),
      version: null,
      strict: true,
      ignore: [],
      path: packageJson.path,
      label,
      source: CONSUMER_CONFIG_KEY,
    };
  }
  return normalizeConsumerConfig(raw, {
    consumerRoot,
    path: packageJson.path,
    label,
    source: CONSUMER_CONFIG_KEY,
  });
}

/**
 * Resolve the consumer configuration.
 *
 * `package.json` is authoritative. `.design-system/config.json` is read in two
 * shapes: the supported extended layout (`{ "designSystem": { … } }`), and the
 * legacy layout emitted by older `connect` versions. A legacy file is reported
 * as `legacyPath` so `connect` migrates it away, while an extended file simply
 * becomes the active location.
 *
 * Two complete configurations that disagree fail closed instead of silently
 * picking one; `prism-ds config <location>` is the command that resolves it.
 *
 * @returns {object | null} normalized config, or null when nothing is configured
 */
export function readConsumerConfig(consumerRoot, { resolveLocationConflict = false } = {}) {
  const fromPackageJson = readPackageJsonConsumerConfig(consumerRoot);
  const fromFile = readConfigFileConsumerConfig(consumerRoot);
  if (fromPackageJson === null) return fromFile;
  if (fromFile === null) return { ...fromPackageJson, legacyPath: null };
  if (fromFile.source === "extended-config") {
    if (resolveLocationConflict) return { ...fromPackageJson, legacyPath: null };
    throw new Error(
      `Conflicting consumer configuration: the design system is configured in both ` +
        `${fromPackageJson.label} and ${fromFile.label}. Keep one location with ` +
        `\`${CLI_NAME} config package-json\` or \`${CLI_NAME} config design-system\`.`,
    );
  }
  if (fromFile.package !== fromPackageJson.package) {
    throw new Error(
      `Conflicting consumer configuration: ${fromPackageJson.label} selects ` +
        `"${fromPackageJson.package}" while ${fromFile.path} selects "${fromFile.package}". ` +
        `Remove the stale ${CONSUMER_DIRECTORY}/${LEGACY_CONSUMER_CONFIG_FILENAME} and re-run ` +
        "the consumer command.",
    );
  }
  return { ...fromPackageJson, legacyPath: fromFile.path };
}

/**
 * Render the extended `.design-system/config.json` document.
 *
 * It wraps the *same* configuration subtree as `package.json` under the same
 * `designSystem` key, so one shape and one validator serve both locations, the
 * file describes itself, and the legacy root-level layout stays unambiguous.
 */
export function renderExtendedConsumerConfig(config) {
  return `${JSON.stringify({ [CONSUMER_CONFIG_KEY]: config }, null, 2)}\n`;
}

/** True when `text` is a `.design-system/config.json` in the extended layout. */
export function isExtendedConsumerConfigText(text) {
  if (text === null) return false;
  try {
    const parsed = JSON.parse(splitBom(text).body);
    return isPlainObject(parsed) && isPlainObject(parsed[CONSUMER_CONFIG_KEY]);
  } catch {
    return false;
  }
}

/**
 * Normalize a user-supplied configuration location. Accepts the canonical names
 * and the obvious spellings of the same locations.
 */
export function normalizeConsumerLocation(value) {
  const text = requireNonEmptyString(value, "location").toLowerCase();
  if (text === "package-json" || text === "package.json" || text === "packagejson") {
    return "package-json";
  }
  if (
    text === "design-system" ||
    text === ".design-system" ||
    text === "designsystem" ||
    text === "extended"
  ) {
    return "design-system";
  }
  throw new Error(
    `Unsupported configuration location ${JSON.stringify(value)}; expected ` +
      `${CONSUMER_LOCATIONS.map((location) => JSON.stringify(location)).join(" or ")}.`,
  );
}

/**
 * Set (or, with `null`, remove) the consumer configuration inside a
 * `package.json` document, preserving the file's own indentation, byte-order
 * mark, trailing newline, and every field this tooling does not own.
 */
export function applyConsumerConfigToPackageJson(text, config) {
  const { bom, body } = splitBom(text);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid consumer package.json: ${error.message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error("Invalid consumer package.json: it must be a JSON object.");
  }
  if (config === null) {
    if (parsed[CONSUMER_CONFIG_KEY] === undefined) return text;
    delete parsed[CONSUMER_CONFIG_KEY];
  } else {
    // Preserve consumer-owned extra keys inside the field; the canonical shape
    // always wins for the keys this tooling owns.
    const existing = isPlainObject(parsed[CONSUMER_CONFIG_KEY]) ? parsed[CONSUMER_CONFIG_KEY] : {};
    parsed[CONSUMER_CONFIG_KEY] = { ...existing, ...config };
  }
  const trailing = body.endsWith("\n") ? "\n" : "";
  return `${bom}${JSON.stringify(parsed, null, detectJsonIndent(body))}${trailing}`;
}

/**
 * Read the raw `"designSystem"` value from an explicit package.json path.
 * Returns null when the field is absent. Used by lifecycle commands that must
 * compare the live configuration against a previewed plan by value rather than
 * by file bytes.
 */
export function readDesignSystemValue(packageJsonPath) {
  let text;
  try {
    text = readFileSync(packageJsonPath, "utf8");
  } catch {
    return null;
  }
  const { body } = splitBom(text);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid consumer package.json ${packageJsonPath}: ${error.message}`);
  }
  return parsed?.[CONSUMER_CONFIG_KEY] ?? null;
}

/**
 * Recompute a planned `package-json` effect against the file's current bytes.
 *
 * A package manager legitimately rewrites unrelated `package.json` content
 * (usually a dependency entry) between planning and writing, so the planned
 * bytes are not authoritative for this file — only the `designSystem` value is.
 * Callers that write after a spawn must refresh the effect instead of writing
 * the previewed bytes.
 */
export function refreshPackageJsonEffect(effect) {
  if (effect?.config !== null && !isPlainObject(effect?.config)) {
    throw new Error(
      `Cannot refresh ${typeof effect?.path === "string" ? effect.path : "package.json"}: the ` +
        "planned effect carries no designSystem configuration.",
    );
  }
  const text = readFileSync(effect.path, "utf8");
  return {
    ...effect,
    before: text,
    after: applyConsumerConfigToPackageJson(text, effect.config),
  };
}

/**
 * Validate root-relative ignore globs. Rejects absolute paths, `..` segments,
 * and any glob that resolves outside the consumer root.
 */
export function normalizeIgnoreGlobs(consumerRoot, value, label = "ignore") {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${label} "ignore" must be an array of root-relative glob strings.`);
  }
  return value.map((glob, index) => {
    if (typeof glob !== "string" || glob.trim().length === 0) {
      throw new Error(`${label} "ignore[${index}]" must be a non-empty string.`);
    }
    const text = glob.trim();
    if (
      isAbsolute(text) ||
      /^[A-Za-z]:/.test(text) ||
      text.startsWith("/") ||
      text.startsWith("\\")
    ) {
      throw new Error(`${label} "ignore[${index}]" must be root-relative, not absolute: ${text}.`);
    }
    if (text.split(/[\\/]+/).includes("..")) {
      throw new Error(`${label} "ignore[${index}]" must not escape the consumer root: ${text}.`);
    }
    // Containment check (defense in depth; also rejects symlinked parents).
    resolveConsumerPath(consumerRoot, text);
    return text;
  });
}

/**
 * Resolve the candidate design system package for a consumer root.
 *
 * @returns {{ packageName: string, expectedVersion: string | null, source: string, config: object | null }}
 */
export function discoverConsumerPackage({
  consumerRoot,
  explicitPackage,
  resolveLocationConflict = false,
} = {}) {
  if (explicitPackage !== undefined && explicitPackage !== null) {
    return {
      packageName: normalizeRequestedPackage(explicitPackage),
      expectedVersion: null,
      source: "explicit",
      config: readConsumerConfig(consumerRoot, { resolveLocationConflict }),
    };
  }

  const config = readConsumerConfig(consumerRoot, { resolveLocationConflict });
  if (config) {
    return {
      packageName: config.package,
      expectedVersion: config.version,
      source: config.source,
      config,
    };
  }

  const packageJsonPath = resolveConsumerPath(consumerRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `Cannot discover a design system: no consumer package.json and no ${CONSUMER_DIRECTORY}/` +
        `${LEGACY_CONSUMER_CONFIG_FILENAME} at ${packageJsonPath}.`,
    );
  }
  const pkg = readConsumerPackageJson(consumerRoot).json;

  const dependencies = {
    ...(isPlainObject(pkg.dependencies) ? pkg.dependencies : {}),
    ...(isPlainObject(pkg.devDependencies) ? pkg.devDependencies : {}),
  };
  const candidates = Object.keys(dependencies).filter(isSupportedPackageName);
  if (candidates.length === 0) {
    throw new Error(
      "No supported @prism-system/ui-* package found in consumer dependencies; install one and " +
        `re-run the consumer command, or declare "${CONSUMER_CONFIG_KEY}" in package.json.`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Multiple supported @prism-system/ui-* packages found (${candidates.join(
        ", ",
      )}); select one explicitly or declare "${CONSUMER_CONFIG_KEY}" in package.json.`,
    );
  }
  return { packageName: candidates[0], expectedVersion: null, source: "dependency", config: null };
}

/* -------------------------------------------------------------------------- */
/* Installed package + manifest resolution                                    */
/* -------------------------------------------------------------------------- */

/**
 * Walk up from an installed manifest to the nearest `package.json` whose `name`
 * matches. Node package resolution already selected the package; this only
 * recovers its directory without assuming a fixed manifest filename layout.
 */
function findPackageDirectory(manifestPath, packageName) {
  let current = dirname(manifestPath);
  for (;;) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) {
      let pkg = null;
      try {
        pkg = readJsonFile(candidate);
      } catch {
        pkg = null;
      }
      if (pkg !== null && pkg.name === packageName) return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve the installed package directory through the consumer's own
 * `node_modules` entry and follow that symlink/junction now, bypassing Node's
 * process-wide resolution cache.
 *
 * pnpm replaces a dependency with a new `.pnpm/<pkg>@<version>` target during
 * upgrade. `require.resolve()` can keep returning the previous target for the
 * rest of the process. The incoming `node_modules` link is the current installed
 * entry, so it is realpath'd on every call. Returns null when the package is not
 * linked directly under the consumer root, leaving hoisted/ancestor layouts to
 * Node resolution.
 */
export function resolveDirectInstalledPackageDir(consumerRoot, packageName) {
  const direct = join(consumerRoot, "node_modules", ...packageName.split("/"));
  try {
    if (!statSync(join(direct, "package.json")).isFile()) return null;
  } catch {
    return null;
  }
  return resolveRealPath(direct);
}

/**
 * Locate an installed package directory and its public manifest path. The direct
 * consumer `node_modules` entry wins because it reflects the current on-disk
 * install; Node resolution remains the fallback for hoisted/ancestor layouts.
 */
function resolveInstalledPackageLocation(consumerRoot, packageName) {
  const directPackageDir = resolveDirectInstalledPackageDir(consumerRoot, packageName);
  if (directPackageDir !== null) {
    return {
      packageDir: directPackageDir,
      manifestPath: resolveRealPath(join(directPackageDir, MANIFEST_EXPORT_TARGET)),
    };
  }

  const requireFromConsumer = createRequire(join(consumerRoot, "package.json"));
  const manifestSpecifier = `${packageName}${MANIFEST_EXPORT_SUBPATH.replace(/^\./, "")}`;
  let manifestPath;
  try {
    manifestPath = requireFromConsumer.resolve(manifestSpecifier);
  } catch {
    throw new Error(
      `Design system package "${packageName}" is not installed at ` +
        `${join(consumerRoot, "node_modules", ...packageName.split("/"))}. ` +
        "Install it in the consumer before running the consumer tooling; it never installs.",
    );
  }
  const packageDir = findPackageDirectory(manifestPath, packageName);
  if (packageDir === null) {
    throw new Error(
      `Installed "${packageName}" could not be located from its manifest at ${manifestPath}.`,
    );
  }
  return { packageDir, manifestPath };
}

/**
 * Resolve an installed design system from the consumer's current package
 * installation and read its public `./manifest` export. Never imports package
 * internals, hardcodes a monorepo layout, or reads the design-systems source.
 */
export function resolveInstalledDesignSystem({ consumerRoot, packageName }) {
  const { packageDir, manifestPath } = resolveInstalledPackageLocation(consumerRoot, packageName);
  const packageJsonPath = join(packageDir, "package.json");
  let packageJson;
  try {
    packageJson = readJsonFile(packageJsonPath);
  } catch (error) {
    throw new Error(`Invalid installed package.json ${packageJsonPath}: ${error.message}`);
  }
  if (packageJson.name !== packageName) {
    throw new Error(
      `Installed package name ${JSON.stringify(
        packageJson.name ?? null,
      )} does not match "${packageName}".`,
    );
  }
  const exportsField = packageJson.exports;
  if (
    !isPlainObject(exportsField) ||
    exportsField[MANIFEST_EXPORT_SUBPATH] !== MANIFEST_EXPORT_TARGET
  ) {
    throw new Error(
      `Installed "${packageName}" must expose ${JSON.stringify(
        MANIFEST_EXPORT_SUBPATH,
      )} as exactly ${JSON.stringify(MANIFEST_EXPORT_TARGET)}.`,
    );
  }
  const containedManifestPath = assertWithin(
    packageDir,
    manifestPath,
    `Manifest path for "${packageName}"`,
  );
  if (!existsSync(containedManifestPath)) {
    throw new Error(`Installed "${packageName}" is missing its manifest at ${manifestPath}.`);
  }
  let manifest;
  try {
    manifest = readJsonFile(containedManifestPath);
  } catch (error) {
    throw new Error(`Invalid installed manifest ${manifestPath}: ${error.message}`);
  }
  return { packageDir, packageJson, manifest, manifestPath: containedManifestPath };
}

/**
 * Require exact version/identity equality and the current contract metadata
 * (`schemaVersion: 5`, numeric `contractVersion: 4`). Any other shape fails
 * closed. Throws with every failure aggregated.
 *
 * @returns {{ version: string, contractVersion: 4 }}
 */
export function verifyConsumerDesignSystem({ packageName, expectedVersion, installed }) {
  const failures = [];
  const installedVersion = installed.packageJson.version;
  if (typeof installedVersion !== "string" || installedVersion.trim().length === 0) {
    failures.push(`Installed "${packageName}" has no version.`);
  }
  if (installed.manifest?.package !== packageName) {
    failures.push(
      `Shipped manifest package ${JSON.stringify(
        installed.manifest?.package ?? null,
      )} does not match "${packageName}".`,
    );
  }
  if (installed.manifest?.version !== installedVersion) {
    failures.push(
      `Shipped manifest version ${JSON.stringify(
        installed.manifest?.version ?? null,
      )} does not match installed version ${JSON.stringify(installedVersion ?? null)}.`,
    );
  }
  // The manifest must declare exactly the current metadata: schemaVersion 5 and
  // the numeric contractVersion 4. Any other shape fails closed here; for a
  // recognized manifest the full shape validation below reports the specific
  // invalid fields.
  if (detectManifestContract(installed.manifest) === null) {
    if (installed.manifest?.contractVersion !== CONTRACT_VERSION) {
      failures.push(
        `Shipped manifest contractVersion ${JSON.stringify(
          installed.manifest?.contractVersion ?? null,
        )} must be the numeric ${CONTRACT_VERSION}.`,
      );
    }
    if (installed.manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      failures.push(
        `Shipped manifest schemaVersion ${JSON.stringify(
          installed.manifest?.schemaVersion ?? null,
        )} must be ${MANIFEST_SCHEMA_VERSION}.`,
      );
    }
  }
  // Full schema-shape validation (the runtime counterpart of
  // schemas/design-system.schema.json), in addition to the exact identity checks
  // above. Aggregated so callers still see every failure at once.
  for (const failure of collectManifestFailures(installed.manifest, {
    packageName,
    version: typeof installedVersion === "string" ? installedVersion : undefined,
  })) {
    failures.push(`Shipped manifest is invalid: ${failure}`);
  }
  if (expectedVersion !== null && expectedVersion !== installedVersion) {
    failures.push(
      `Declared version ${JSON.stringify(expectedVersion)} does not match installed version ` +
        `${JSON.stringify(installedVersion ?? null)}.`,
    );
  }
  if (failures.length > 0) {
    throw new Error(failures.join(" "));
  }
  return { version: installedVersion, contractVersion: CONTRACT_VERSION };
}

/* -------------------------------------------------------------------------- */
/* Generated content                                                          */
/* -------------------------------------------------------------------------- */

/** The canonical consumer configuration object written to `package.json`. */
export function buildConsumerConfig({ packageName, version, strict, ignore }) {
  const config = {
    schemaVersion: CONSUMER_SCHEMA_VERSION,
    package: packageName,
    version,
    strict,
  };
  if (Array.isArray(ignore) && ignore.length > 0) {
    config.ignore = [...ignore];
  }
  return config;
}

/**
 * Render the legacy `.design-system/config.json` text used by pre-package.json
 * installs. Current versions never write it; this exists only so `remove` can
 * attribute and retire a file an older `connect` generated, byte for byte.
 */
export function renderLegacyConsumerConfig({ packageName, version, strict, ignore }) {
  const config = {
    $schema: CONSUMER_SCHEMA_URL,
    schemaVersion: CONSUMER_SCHEMA_VERSION,
    package: packageName,
    version,
    manifest: MANIFEST_EXPORT_SUBPATH,
    strict,
  };
  if (Array.isArray(ignore) && ignore.length > 0) {
    config.ignore = [...ignore];
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Render the legacy `.design-system/AGENTS.md` text used by pre-package.json
 * installs. Instructions now live in the root `AGENTS.md` managed block
 * ({@link buildManagedBlock}); this exists only so `remove` can attribute and
 * retire a file an older `connect` generated, byte for byte.
 */
export function renderConsumerAgents({ packageName, version, strict, contractVersion }) {
  const manifestRequest = `${packageName}${MANIFEST_EXPORT_SUBPATH.replace(/^\./, "")}`;
  const importPaths = [
    `\`${packageName}\``,
    `\`${packageName}/tokens\``,
    `\`${packageName}/styles.css\``,
    `\`${packageName}/tailwind.css\``,
  ];
  importPaths.push(`\`${manifestRequest}\``);
  const importList = `${importPaths.slice(0, -1).join(", ")}, and ${
    importPaths[importPaths.length - 1]
  }`;
  return [
    "# Design system consumer contract",
    "",
    `This directory is generated by \`${CLI_NAME} connect\` from the \`@prism-system/tools\``,
    "package. It contains configuration and instructions only — never component source or",
    "styling. The installed package remains the source of truth; re-run",
    `\`${CLI_NAME} connect\` instead of editing generated files by hand.`,
    "",
    "## Selected design system",
    "",
    `- Package: \`${packageName}\``,
    `- Version: \`${version}\``,
    ...(contractVersion ? [`- Contract version: \`${contractVersion}\``] : []),
    `- Manifest: \`${manifestRequest}\``,
    `- Strict mode: \`${strict}\``,
    "",
    "## Read before implementing UI",
    "",
    "Follow this order and do not guess the API:",
    "",
    `1. \`.design-system/config.json\` — the selected package, exact version, manifest subpath, and strict mode.`,
    `2. \`${manifestRequest}\` — the shipped structured manifest: component catalog, variants, sizes, compound members, and usage rules.`,
    `3. \`node_modules/${packageName}/AGENTS.md\` — the package consumer contract and restrictions.`,
    `4. \`node_modules/${packageName}/README.md\` — installation, setup, and usage.`,
    `5. The public TypeScript API exported by \`${packageName}\`.`,
    "",
    "## Rules",
    "",
    `- Import only from ${importList}. Never import package internals.`,
    "- Compose existing components with props. Do not restyle them, copy package CSS, or override the visual language.",
    "- Layout (`grid`, `flex`, `gap`, responsive rules, positioning, page composition) belongs to the product. Colors, typography, spacing, radius, borders, shadows, states, variants, and motion belong to the design system.",
    "- In strict mode, do not introduce arbitrary colors, radius, or shadows, do not duplicate primitives, and do not create local replacements for components the design system already provides.",
    "- A reusable visual pattern shared across the product belongs in the design system package. Product-specific and feature components stay here and are composed from design system primitives.",
    `- After changing the installed version, re-run \`${CLI_NAME} connect\` and verify types and build.`,
    "",
  ].join("\n");
}

/**
 * Render the managed contract block inserted into the consumer root `AGENTS.md`.
 *
 * This is the single agent-instruction surface: it carries the full guidance an
 * agent needs (configuration, read order, and rules) so no separate
 * `.design-system/AGENTS.md` is required.
 */
export function buildManagedBlock({ packageName, version, strict, contractVersion }) {
  const manifestRequest = `${packageName}${MANIFEST_EXPORT_SUBPATH.replace(/^\./, "")}`;
  const importPaths = [
    `\`${packageName}\``,
    `\`${packageName}/tokens\``,
    `\`${packageName}/styles.css\``,
    `\`${packageName}/tailwind.css\``,
    `\`${manifestRequest}\``,
  ];
  const importList = `${importPaths.slice(0, -1).join(", ")}, and ${
    importPaths[importPaths.length - 1]
  }`;
  const mode = contractVersion
    ? `contract version \`${contractVersion}\`, strict mode: \`${strict}\``
    : `strict mode: \`${strict}\``;
  return [
    MANAGED_BLOCK_BEGIN,
    "## Design system (managed)",
    "",
    `This project consumes \`${packageName}@${version}\` as its visual source of truth`,
    `(${mode}). The configuration lives in \`package.json\` under \`${CONSUMER_CONFIG_KEY}\`.`,
    "",
    `This section is generated by \`${CLI_NAME} connect\`. Re-run that command instead of`,
    "editing it by hand; everything outside the markers belongs to the project and is never",
    "modified.",
    "",
    "### Selected design system",
    "",
    `- Package: \`${packageName}\``,
    `- Version: \`${version}\``,
    ...(contractVersion ? [`- Contract version: \`${contractVersion}\``] : []),
    `- Manifest: \`${manifestRequest}\``,
    `- Strict mode: \`${strict}\``,
    "",
    "### Read before implementing UI",
    "",
    "Follow this order and do not guess the API:",
    "",
    `1. \`package.json\` → \`${CONSUMER_CONFIG_KEY}\` — the selected package, exact version, and strict mode.`,
    `2. \`${manifestRequest}\` — the shipped structured manifest: component catalog, variants, sizes, compound members, and usage rules.`,
    `3. \`node_modules/${packageName}/AGENTS.md\` — the package consumer contract and restrictions.`,
    `4. \`node_modules/${packageName}/README.md\` — installation, setup, and usage.`,
    `5. The public TypeScript API exported by \`${packageName}\`.`,
    "",
    "### Rules",
    "",
    `- Import only from ${importList}. Never import package internals.`,
    "- Compose existing components with props. Do not restyle them, copy package CSS, or",
    "  override the visual language.",
    "- Layout (`grid`, `flex`, `gap`, responsive rules, positioning, page composition) belongs",
    "  to the product. Colors, typography, spacing, radius, borders, shadows, states, variants,",
    "  and motion belong to the design system.",
    "- In strict mode, do not introduce arbitrary colors, radius, or shadows, do not duplicate",
    "  primitives, and do not create local replacements for components the design system",
    "  already provides.",
    "- A reusable visual pattern shared across the product belongs in the design system",
    "  package. Product-specific and feature components stay in the project and are composed",
    "  from design system primitives.",
    `- After changing the installed version, re-run \`${CLI_NAME} connect\` and verify types and build.`,
    MANAGED_BLOCK_END,
  ].join("\n");
}

/**
 * Append or replace the managed block in an existing AGENTS.md, preserving all
 * user content. Fails closed on malformed or partial markers.
 */
export function applyManagedBlock(existing, block) {
  if (existing === null || existing === undefined || existing.length === 0) {
    return `${block}\n`;
  }
  const beginCount = countOccurrences(existing, MANAGED_BLOCK_BEGIN);
  const endCount = countOccurrences(existing, MANAGED_BLOCK_END);
  if (beginCount === 0 && endCount === 0) {
    const base = existing.endsWith("\n") ? existing : `${existing}\n`;
    return `${base}\n${block}\n`;
  }
  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(
      "Consumer AGENTS.md has malformed or partial @prism-system managed markers; fix the " +
        "markers (exactly one BEGIN and one END) or remove them, then re-run the consumer command.",
    );
  }
  const begin = existing.indexOf(MANAGED_BLOCK_BEGIN);
  const end = existing.indexOf(MANAGED_BLOCK_END);
  if (end < begin) {
    throw new Error(
      "Consumer AGENTS.md has an END marker before its BEGIN marker; fix the managed block, " +
        "then re-run the consumer command.",
    );
  }
  return `${existing.slice(0, begin)}${block}${existing.slice(end + MANAGED_BLOCK_END.length)}`;
}

/* -------------------------------------------------------------------------- */
/* Connect                                                                    */
/* -------------------------------------------------------------------------- */

function writeFileAtomic(filePath, content, containRoot) {
  if (containRoot !== undefined) {
    assertWithin(containRoot, filePath, "Consumer write path");
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  if (containRoot !== undefined) {
    assertWithin(containRoot, tempPath, "Consumer temp path");
  }
  let renamed = false;
  try {
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, filePath);
    renamed = true;
  } finally {
    if (!renamed) rmSync(tempPath, { force: true });
  }
}

function readIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

/**
 * Detect whether `text` is a `.design-system/AGENTS.md` written by an older
 * `connect`. It is conservative: only the exact generated title followed by the
 * generated preamble counts, so a consumer-authored file is never deleted.
 */
function isLegacyGeneratedAgents(text) {
  if (text === null) return false;
  // Tolerate CRLF and a leading BOM: an editor may have normalized or re-saved
  // the file since it was generated, and the content is still unmistakably the
  // generated one.
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return (
    normalized.startsWith("# Design system consumer contract\n") &&
    normalized.includes("generated by `prism-ds connect`")
  );
}

/**
 * Build the managed consumer-file effects from explicit target content.
 * Shared by the installed-package plan ({@link planConnect}), the pre-install
 * target plan ({@link planConnectForTarget}), and the location command
 * ({@link connectDesignSystem} with an explicit `location`) so every path
 * produces the same content, strict/ignore semantics, and containment checks.
 *
 * `location` selects where the configuration lives:
 *
 *   - `package-json` (default): the `package.json` `"designSystem"` field. A
 *     `.design-system/config.json` is retired so the field is the only location.
 *   - `design-system`: `.design-system/config.json` in the extended shape
 *     `{ "designSystem": { … } }`; the `package.json` field is removed.
 *
 * Either way the root `AGENTS.md` managed block is the single agent-instruction
 * surface, and the generated legacy `.design-system/AGENTS.md` is retired so an
 * existing installation migrates in one idempotent run. The `.design-system/`
 * directory is removed only when it becomes empty; `skills.json` and any
 * consumer file keep it.
 *
 * Containment: validate every consumer-owned path against the real consumer
 * root before planning any write, so an external symlink/junction can never
 * redirect a config, AGENTS, migration, or rollback write outside the root.
 */
function planConnectFiles({
  consumerRoot,
  packageName,
  version,
  contractVersion,
  strict,
  ignore,
  source,
  location = DEFAULT_CONSUMER_LOCATION,
  check = false,
}) {
  const packageJsonPath = resolveConsumerPath(consumerRoot, "package.json");
  const rootAgentsPath = resolveConsumerPath(consumerRoot, "AGENTS.md");
  const configFilePath = resolveConsumerPath(
    consumerRoot,
    CONSUMER_DIRECTORY,
    LEGACY_CONSUMER_CONFIG_FILENAME,
  );
  const legacyAgentsPath = resolveConsumerPath(
    consumerRoot,
    CONSUMER_DIRECTORY,
    LEGACY_CONSUMER_AGENTS_FILENAME,
  );

  const packageJsonBefore = readIfExists(packageJsonPath);
  if (packageJsonBefore === null) {
    throw new Error(
      `Cannot write the consumer contract: no consumer package.json at ${packageJsonPath}.`,
    );
  }

  const config = buildConsumerConfig({ packageName, version, strict, ignore });
  const block = buildManagedBlock({ packageName, version, strict, contractVersion });
  const rootAgentsAfter = applyManagedBlock(readIfExists(rootAgentsPath), block);

  const fileEffect = (kind, path, after) => {
    const before = readIfExists(path);
    return { kind, path, before, after, changed: before !== after };
  };

  const configFileBefore = readIfExists(configFilePath);
  const configFileWasExtended = isExtendedConsumerConfigText(configFileBefore);
  const migrations = [];
  const files = [];

  if (location === "design-system") {
    // The field must be gone from package.json: one configuration, one location.
    // When it is already absent this effect is a no-op (`changed: false`).
    const packageJsonAfter = applyConsumerConfigToPackageJson(packageJsonBefore, null);
    files.push({ ...fileEffect("package-json", packageJsonPath, packageJsonAfter), config: null });
    files.push(
      fileEffect("design-system-config", configFilePath, renderExtendedConsumerConfig(config)),
    );
    if (configFileBefore !== null && !configFileWasExtended) {
      migrations.push(
        `converted ${CONSUMER_DIRECTORY}/${LEGACY_CONSUMER_CONFIG_FILENAME} to the extended ` +
          `${CONSUMER_CONFIG_KEY} layout`,
      );
    }
  } else {
    // `config` travels with the effect so plan-drift comparison can use the
    // semantic configuration instead of the whole package.json byte image (the
    // installer legitimately rewrites unrelated package.json content).
    const packageJsonAfter = applyConsumerConfigToPackageJson(packageJsonBefore, config);
    files.push({ ...fileEffect("package-json", packageJsonPath, packageJsonAfter), config });
    if (configFileBefore !== null) {
      files.push(fileEffect("design-system-config", configFilePath, null));
      migrations.push(
        `moved ${CONSUMER_DIRECTORY}/${LEGACY_CONSUMER_CONFIG_FILENAME} to ` +
          `${CONSUMER_CONFIG_LABEL}`,
      );
    }
  }

  // The root AGENTS.md block is the only instruction surface in both locations.
  files.push(fileEffect("root-agents", rootAgentsPath, rootAgentsAfter));

  const legacyAgentsBefore = readIfExists(legacyAgentsPath);
  const retiresLegacyAgents = isLegacyGeneratedAgents(legacyAgentsBefore);
  if (retiresLegacyAgents) {
    files.push(fileEffect("legacy-agents", legacyAgentsPath, null));
    migrations.push(
      `removed the generated ${CONSUMER_DIRECTORY}/${LEGACY_CONSUMER_AGENTS_FILENAME}; its ` +
        "instructions now live in AGENTS.md",
    );
  }

  // Predict the directory state after the planned retirements: it is removed
  // only when nothing else remains (for example `skills.json` keeps it, and so
  // does a consumer-authored file we are not allowed to delete). The extended
  // location keeps the directory by definition.
  let directory = null;
  if (location !== "design-system" && (retiresLegacyAgents || configFileBefore !== null)) {
    const directoryPath = resolveConsumerPath(consumerRoot, CONSUMER_DIRECTORY);
    if (existsSync(directoryPath)) {
      const retiring = new Set();
      if (retiresLegacyAgents) retiring.add(LEGACY_CONSUMER_AGENTS_FILENAME);
      if (configFileBefore !== null) retiring.add(LEGACY_CONSUMER_CONFIG_FILENAME);
      const remaining = readdirSync(directoryPath).filter((name) => !retiring.has(name));
      if (remaining.length === 0) {
        directory = { kind: "directory", path: directoryPath, remove: true };
      }
    }
  }

  return {
    consumerRoot,
    packageName,
    version,
    strict,
    source,
    location,
    check,
    files,
    directory,
    migrations,
  };
}

/**
 * Plan a connect without writing anything. Throws on any discovery or
 * verification failure (invalid config, multiple candidates, missing package,
 * mismatched versions, malformed markers).
 *
 * `location` is optional: when omitted the plan keeps the location that is
 * already active, so `connect` never fights a deliberate
 * `.design-system/config.json` and still migrates a legacy file by default. An
 * explicit `location` is the `prism-ds config <location>` move, which also
 * resolves a two-location conflict instead of failing closed.
 */
export function planConnect({
  cwd,
  package: explicitPackage,
  strict,
  check = false,
  location,
} = {}) {
  const consumerRoot = resolveConsumerRoot({ cwd });
  const explicitLocation = location === undefined ? undefined : normalizeConsumerLocation(location);
  const discovered = discoverConsumerPackage({
    consumerRoot,
    explicitPackage,
    resolveLocationConflict: explicitLocation !== undefined,
  });
  const installed = resolveInstalledDesignSystem({
    consumerRoot,
    packageName: discovered.packageName,
  });
  const { version, contractVersion } = verifyConsumerDesignSystem({
    packageName: discovered.packageName,
    expectedVersion: discovered.expectedVersion,
    installed,
  });

  const effectiveStrict = strict ?? (discovered.config ? discovered.config.strict : true);
  // Preserve any configured ignore globs across re-connect so the config stays
  // idempotent and consumer-defined ignores are not dropped.
  const effectiveIgnore = discovered.config ? discovered.config.ignore : [];
  const effectiveLocation =
    explicitLocation ??
    (discovered.config?.source === "extended-config" ? "design-system" : DEFAULT_CONSUMER_LOCATION);
  return planConnectFiles({
    consumerRoot,
    packageName: discovered.packageName,
    version,
    contractVersion,
    strict: effectiveStrict,
    ignore: effectiveIgnore,
    source: discovered.source,
    location: effectiveLocation,
    check,
  });
}

/**
 * Plan the connect writes for one explicit, already-validated target version
 * *before* the package is installed. The caller supplies the registry-validated
 * manifest; the existing consumer config supplies the strict/ignore defaults
 * exactly as a post-install {@link planConnect} derives them, and every path
 * goes through the same containment checks. Nothing is written and nothing is
 * resolved from `node_modules`.
 */
export function planConnectForTarget({
  consumerRoot,
  package: target,
  version,
  manifest,
  strict,
} = {}) {
  if (typeof consumerRoot !== "string" || consumerRoot.trim().length === 0) {
    throw new Error("planConnectForTarget requires an explicit consumerRoot.");
  }
  const root = resolve(consumerRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Consumer root does not exist or is not a directory: ${root}.`);
  }
  const packageName = normalizeRequestedPackage(target);
  const targetVersion = requireNonEmptyString(version, "version");
  if (!isPlainObject(manifest)) {
    throw new Error("planConnectForTarget requires the validated target manifest.");
  }
  if (manifest.package !== packageName) {
    throw new Error(
      `Target manifest package ${JSON.stringify(manifest.package ?? null)} does not match ` +
        `"${packageName}".`,
    );
  }
  if (manifest.version !== targetVersion) {
    throw new Error(
      `Target manifest version ${JSON.stringify(manifest.version ?? null)} does not match ` +
        `"${targetVersion}".`,
    );
  }
  if (
    manifest.contractVersion !== CONTRACT_VERSION ||
    manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION
  ) {
    throw new Error(
      `Target manifest must declare contractVersion ${CONTRACT_VERSION} and schemaVersion ` +
        `${MANIFEST_SCHEMA_VERSION}; received contractVersion ${JSON.stringify(
          manifest.contractVersion ?? null,
        )}/schemaVersion ${JSON.stringify(manifest.schemaVersion ?? null)}.`,
    );
  }
  const config = readConsumerConfig(root);
  const effectiveStrict = strict ?? (config ? config.strict : true);
  const effectiveIgnore = config ? config.ignore : [];
  return planConnectFiles({
    consumerRoot: root,
    packageName,
    version: targetVersion,
    contractVersion: manifest.contractVersion,
    strict: effectiveStrict,
    ignore: effectiveIgnore,
    source: "target",
    location: config?.source === "extended-config" ? "design-system" : DEFAULT_CONSUMER_LOCATION,
    check: false,
  });
}

/**
 * Compare a previewed connect plan against a freshly recomputed one by material
 * content only: consumer root, package, version, strict mode, and every managed
 * file's kind/path/content. Returns human-readable differences; an empty array
 * means the plans are materially identical.
 *
 * The `package-json` effect is compared by the `designSystem` value it sets,
 * never by whole-file bytes: a package manager legitimately rewrites unrelated
 * package.json content between the preview and the confirmed run, and that must
 * not be reported as drift. Every other managed file is byte-compared.
 */
function connectPlanDifference(expected, actual) {
  if (!isPlainObject(expected) || !Array.isArray(expected.files)) {
    return ["the expected connect plan has no managed file list"];
  }
  const details = [];
  if (expected.consumerRoot !== actual.consumerRoot) details.push("consumer root changed");
  if (expected.packageName !== actual.packageName) details.push("package changed");
  if (expected.version !== actual.version) details.push("version changed");
  if (expected.strict !== actual.strict) details.push("strict mode changed");
  if (expected.location !== actual.location) details.push("configuration location changed");
  const expectedFiles = expected.files;
  const actualFiles = actual.files;
  if (expectedFiles.length !== actualFiles.length) {
    details.push(`managed file count changed (${expectedFiles.length} -> ${actualFiles.length})`);
  }
  const count = Math.min(expectedFiles.length, actualFiles.length);
  for (let index = 0; index < count; index += 1) {
    const before = expectedFiles[index];
    const after = actualFiles[index];
    if (!isPlainObject(before) || !isPlainObject(after)) {
      details.push(`managed file ${index + 1} is malformed`);
      continue;
    }
    const label = typeof before.kind === "string" ? before.kind : `file ${index + 1}`;
    const changed = [];
    if (before.kind !== after.kind) changed.push("kind");
    if (before.path !== after.path) changed.push("path");
    if (before.kind === "package-json") {
      if (JSON.stringify(before.config ?? null) !== JSON.stringify(after.config ?? null)) {
        changed.push("designSystem configuration");
      }
    } else {
      if (before.before !== after.before) changed.push("before");
      if (before.after !== after.after) changed.push("after");
    }
    if (changed.length > 0) {
      details.push(
        `${label} (${typeof before.path === "string" ? before.path : "unknown path"}): ` +
          changed.join(", "),
      );
    }
  }
  return details;
}

/**
 * Discover, verify, and (unless checking) write the consumer contract.
 *
 * `expectedPlan` is an optional write precondition for callers that already
 * presented an exact plan (for example a confirmed TUI `use`/`upgrade`). In
 * write mode the contract is planned once more and compared field by field
 * against it; any drift fails closed before the first write and never
 * replans-and-overwrites. It is ignored by `--check` and `--dry-run`.
 *
 * `location` moves the configuration to `package-json` or `design-system`; it
 * is what `prism-ds config <location>` uses. Omitted, the active location is
 * kept.
 *
 * @returns {{ ok: boolean, changed: boolean, check: boolean, dryRun: boolean, failures: string[], plan: object | null, changes: object[] }}
 */
export function connectDesignSystem({
  cwd,
  package: explicitPackage,
  strict,
  check = false,
  dryRun = false,
  expectedPlan,
  location,
} = {}) {
  let plan;
  try {
    plan = planConnect({ cwd, package: explicitPackage, strict, check, location });
  } catch (error) {
    return {
      ok: false,
      changed: false,
      check,
      dryRun,
      failures: [error.message],
      plan: null,
      changes: [],
    };
  }

  const changes = plan.files
    .filter((file) => file.before !== file.after)
    .map((file) => ({ kind: file.kind, path: file.path }));

  // Optional write precondition: recompute the plan, compare all file material,
  // and fail closed on any drift *before* the first write. A confirmed caller
  // (for example the TUI) can therefore never silently overwrite a consumer
  // file that changed after its preview.
  if (!check && !dryRun && expectedPlan !== undefined && expectedPlan !== null) {
    const differences = connectPlanDifference(expectedPlan, plan);
    if (differences.length > 0) {
      return {
        ok: false,
        changed: false,
        check: false,
        dryRun: false,
        boundary: "precondition",
        failures: [
          "Refusing to write the consumer contract: the current connect plan no longer " +
            `matches the previewed plan (${differences.join("; ")}). No connect files were ` +
            "written and the dependency change is not rolled back; preview again and confirm " +
            "the new plan.",
        ],
        plan,
        changes: [],
      };
    }
  }

  if (check) {
    return {
      ok: true,
      changed: changes.length > 0,
      check: true,
      dryRun: false,
      failures: [],
      plan,
      migrations: plan.migrations,
      changes,
    };
  }
  if (dryRun) {
    return {
      ok: true,
      changed: false,
      check: false,
      dryRun: true,
      failures: [],
      plan,
      migrations: plan.migrations,
      changes,
    };
  }

  const backups = [];
  try {
    for (const file of plan.files) {
      if (file.before === file.after) continue;
      // Re-assert containment immediately before each mutation.
      assertWithin(plan.consumerRoot, file.path, "Consumer write path");
      backups.push({ path: file.path, before: file.before });
      if (file.after === null) rmSync(file.path, { force: true });
      else writeFileAtomic(file.path, file.after, plan.consumerRoot);
    }
    // The optional `.design-system/` directory is retired only when it is empty
    // after the planned migrations. Best effort: a directory that gained a file
    // in the meantime is simply kept.
    if (plan.directory !== null && plan.directory?.remove === true) {
      try {
        assertWithin(plan.consumerRoot, plan.directory.path, "Consumer directory path");
        if (readdirSync(plan.directory.path).length === 0) rmdirSync(plan.directory.path);
      } catch {
        // Nothing else depends on the directory; keep it and report the run.
      }
    }
  } catch (error) {
    for (const backup of [...backups].reverse()) {
      // Never restore outside the consumer root, even if a path changed after
      // planning; fail closed instead of mutating an external target.
      try {
        assertWithin(plan.consumerRoot, backup.path, "Consumer rollback path");
      } catch {
        continue;
      }
      if (backup.before === null) rmSync(backup.path, { force: true });
      else writeFileSync(backup.path, backup.before, "utf8");
    }
    return {
      ok: false,
      changed: false,
      check: false,
      dryRun: false,
      failures: [`Connect failed and was rolled back: ${error.message}`],
      plan,
      changes,
    };
  }

  return {
    ok: true,
    changed: backups.length > 0,
    check: false,
    dryRun: false,
    failures: [],
    plan,
    migrations: plan.migrations,
    changes: backups.map((backup) => ({ kind: "written", path: backup.path })),
  };
}
