#!/usr/bin/env node
/**
 * V3 consumer setup and discovery (Phase 2).
 *
 * `ds:connect` prepares a *consumer* repository to use an already-installed
 * `@prism-system/ui-*` design system. It is configure-only:
 *
 *   - it never installs packages or edits consumer dependencies;
 *   - it never copies component source or styling;
 *   - it never mutates the design-system repository.
 *
 * It writes a small consumer contract next to the product:
 *
 *   <consumer-root>/.design-system/config.json   selected package, version, manifest, strict
 *   <consumer-root>/.design-system/AGENTS.md     agent instructions
 *   <consumer-root>/AGENTS.md                    idempotent managed contract block
 *
 * Discovery precedence: explicit `.design-system/config.json`, then consumer
 * `package.json` `designSystem` metadata, then dependency discovery when exactly
 * one supported `@prism-system/ui-*` package exists. Invalid config, multiple
 * candidates, a missing package, or mismatched versions fail closed.
 *
 * Verification requires exact equality among the consumer config version (when
 * present), the installed `package.json` version, the shipped `design-system.json`
 * version (resolved through the public `./manifest` export), and the package
 * identity.
 *
 * This module is both a library (imported by `connect-design-system.mjs`) and
 * exposes helpers for focused tests. It never falls back to the repository root:
 * every entry point requires an explicit consumer root.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { MANIFEST_EXPORT_SUBPATH, MANIFEST_EXPORT_TARGET } from "./design-system-manifest.mjs";
import {
  PACKAGE_SCOPE,
  RESERVED_SYSTEM_IDS,
  SYSTEM_ID_PATTERN,
  assertWithin,
  readJsonFile,
  toPackageName,
} from "./register-design-system.mjs";

/** Consumer contract directory, relative to the consumer root. */
export const CONSUMER_DIRECTORY = ".design-system";
/** Consumer config filename inside {@link CONSUMER_DIRECTORY}. */
export const CONSUMER_CONFIG_FILENAME = "config.json";
/** Consumer agent instructions filename inside {@link CONSUMER_DIRECTORY}. */
export const CONSUMER_AGENTS_FILENAME = "AGENTS.md";
/** Consumer config schema version. */
export const CONSUMER_SCHEMA_VERSION = 1;
/** Consumer config schema URL. */
export const CONSUMER_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system-consumer.schema.json";
/** Managed contract block markers in the consumer root AGENTS.md. */
export const MANAGED_BLOCK_BEGIN = "<!-- BEGIN @prism-system design system contract (managed) -->";
export const MANAGED_BLOCK_END = "<!-- END @prism-system design system contract (managed) -->";

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

/** Resolve an explicit consumer root; never falls back to the repository root. */
export function resolveConsumerRoot({ cwd } = {}) {
  if (typeof cwd !== "string" || cwd.trim().length === 0) {
    throw new Error(
      "ds:connect requires an explicit --cwd <path> consumer root; it never falls back to the " +
        "design-system repository root.",
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
/* Discovery                                                                  */
/* -------------------------------------------------------------------------- */

/** Read and validate `<consumer-root>/.design-system/config.json`, or null. */
export function readConsumerConfig(consumerRoot) {
  const configPath = resolveConsumerPath(
    consumerRoot,
    CONSUMER_DIRECTORY,
    CONSUMER_CONFIG_FILENAME,
  );
  if (!existsSync(configPath)) return null;
  let raw;
  try {
    raw = readJsonFile(configPath);
  } catch (error) {
    throw new Error(`Invalid consumer config ${configPath}: ${error.message}`);
  }
  if (!isPlainObject(raw)) {
    throw new Error(`Consumer config ${configPath} must be a JSON object.`);
  }
  if (raw.schemaVersion !== CONSUMER_SCHEMA_VERSION) {
    throw new Error(
      `Consumer config ${configPath} has schemaVersion ${JSON.stringify(
        raw.schemaVersion ?? null,
      )}; expected ${CONSUMER_SCHEMA_VERSION}.`,
    );
  }
  const packageName = requireNonEmptyString(raw.package, "config.package");
  if (!isSupportedPackageName(packageName)) {
    throw new Error(
      `Consumer config ${configPath} names unsupported package ${JSON.stringify(packageName)}.`,
    );
  }
  const version = requireNonEmptyString(raw.version, "config.version");
  if (raw.manifest !== MANIFEST_EXPORT_SUBPATH) {
    throw new Error(
      `Consumer config ${configPath} "manifest" must be exactly ` +
        `${JSON.stringify(MANIFEST_EXPORT_SUBPATH)}.`,
    );
  }
  if (typeof raw.strict !== "boolean") {
    throw new Error(`Consumer config ${configPath} "strict" must be a boolean.`);
  }
  const ignore = normalizeIgnoreGlobs(consumerRoot, raw.ignore, configPath);
  return {
    schemaVersion: CONSUMER_SCHEMA_VERSION,
    package: packageName,
    version,
    manifest: raw.manifest,
    strict: raw.strict,
    ignore,
    path: configPath,
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

function metadataCandidate(meta, packageJsonPath) {
  if (typeof meta === "string") {
    return { packageName: normalizeRequestedPackage(meta), expectedVersion: null };
  }
  if (isPlainObject(meta) && typeof meta.package === "string") {
    return {
      packageName: normalizeRequestedPackage(meta.package),
      expectedVersion: typeof meta.version === "string" ? meta.version.trim() : null,
    };
  }
  throw new Error(
    `Consumer package.json "designSystem" in ${packageJsonPath} must be a package name string ` +
      "or an object { package, version? }.",
  );
}

/**
 * Resolve the candidate design system package for a consumer root.
 *
 * @returns {{ packageName: string, expectedVersion: string | null, source: string, config: object | null }}
 */
export function discoverConsumerPackage({ consumerRoot, explicitPackage } = {}) {
  if (explicitPackage !== undefined && explicitPackage !== null) {
    return {
      packageName: normalizeRequestedPackage(explicitPackage),
      expectedVersion: null,
      source: "explicit",
      config: readConsumerConfig(consumerRoot),
    };
  }

  const config = readConsumerConfig(consumerRoot);
  if (config) {
    return {
      packageName: config.package,
      expectedVersion: config.version,
      source: "config",
      config,
    };
  }

  const packageJsonPath = resolveConsumerPath(consumerRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      "Cannot discover a design system: no .design-system/config.json and no consumer " +
        `package.json at ${packageJsonPath}.`,
    );
  }
  let pkg;
  try {
    pkg = readJsonFile(packageJsonPath);
  } catch (error) {
    throw new Error(`Invalid consumer package.json ${packageJsonPath}: ${error.message}`);
  }
  if (pkg.designSystem !== undefined && pkg.designSystem !== null) {
    const candidate = metadataCandidate(pkg.designSystem, packageJsonPath);
    return { ...candidate, source: "metadata", config: null };
  }

  const dependencies = {
    ...(isPlainObject(pkg.dependencies) ? pkg.dependencies : {}),
    ...(isPlainObject(pkg.devDependencies) ? pkg.devDependencies : {}),
  };
  const candidates = Object.keys(dependencies).filter(isSupportedPackageName);
  if (candidates.length === 0) {
    throw new Error(
      "No supported @prism-system/ui-* package found in consumer dependencies; install one and " +
        "re-run ds:connect, or add .design-system/config.json.",
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Multiple supported @prism-system/ui-* packages found (${candidates.join(
        ", ",
      )}); select one explicitly or add .design-system/config.json.`,
    );
  }
  return { packageName: candidates[0], expectedVersion: null, source: "dependency", config: null };
}

/* -------------------------------------------------------------------------- */
/* Installed package + manifest resolution                                    */
/* -------------------------------------------------------------------------- */

/**
 * Resolve an installed design system through its public `./manifest` export and
 * read its shipped manifest. Never imports package internals.
 */
export function resolveInstalledDesignSystem({ consumerRoot, packageName }) {
  const packageDir = join(consumerRoot, "node_modules", ...packageName.split("/"));
  if (!existsSync(packageDir)) {
    throw new Error(
      `Design system package "${packageName}" is not installed at ${packageDir}. ` +
        "Install it in the consumer before running ds:connect; ds:connect never installs.",
    );
  }
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Installed package "${packageName}" is missing ${packageJsonPath}.`);
  }
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
  const manifestPath = assertWithin(
    packageDir,
    resolve(packageDir, MANIFEST_EXPORT_TARGET),
    `Manifest path for "${packageName}"`,
  );
  if (!existsSync(manifestPath)) {
    throw new Error(`Installed "${packageName}" is missing its manifest at ${manifestPath}.`);
  }
  let manifest;
  try {
    manifest = readJsonFile(manifestPath);
  } catch (error) {
    throw new Error(`Invalid installed manifest ${manifestPath}: ${error.message}`);
  }
  return { packageDir, packageJson, manifest, manifestPath };
}

/**
 * Require exact version/identity equality. Throws with every failure aggregated.
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
  if (installed.manifest?.contract !== "v2") {
    failures.push(
      `Shipped manifest contract ${JSON.stringify(
        installed.manifest?.contract ?? null,
      )} must be "v2".`,
    );
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
  return { version: installedVersion };
}

/* -------------------------------------------------------------------------- */
/* Generated content                                                          */
/* -------------------------------------------------------------------------- */

/** The canonical consumer config object. */
export function buildConsumerConfig({ packageName, version, strict, ignore }) {
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
  return config;
}

/** Render `<consumer-root>/.design-system/AGENTS.md`. */
export function renderConsumerAgents({ packageName, version, strict }) {
  const manifestRequest = `${packageName}${MANIFEST_EXPORT_SUBPATH.replace(/^\./, "")}`;
  return [
    "# Design system consumer contract",
    "",
    "This directory is generated by `pnpm ds:connect` from the `@prism-system` tooling.",
    "It contains configuration and instructions only — never component source or styling.",
    "The installed package remains the source of truth; re-run `pnpm ds:connect` instead of",
    "editing generated files by hand.",
    "",
    "## Selected design system",
    "",
    `- Package: \`${packageName}\``,
    `- Version: \`${version}\``,
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
    `- Import only from \`${packageName}\`, \`${packageName}/tokens\`, \`${packageName}/styles.css\`, and \`${manifestRequest}\`. Never import package internals.`,
    "- Compose existing components with props. Do not restyle them, copy package CSS, or override the visual language.",
    "- Layout (`grid`, `flex`, `gap`, responsive rules, positioning, page composition) belongs to the product. Colors, typography, spacing, radius, borders, shadows, states, variants, and motion belong to the design system.",
    "- In strict mode, do not introduce arbitrary colors, radius, or shadows, do not duplicate primitives, and do not create local replacements for components the design system already provides.",
    "- A reusable visual pattern shared across the product belongs in the design system package. Product-specific and feature components stay here and are composed from design system primitives.",
    "- After changing the installed version, re-run `pnpm ds:connect` and verify types and build.",
    "",
  ].join("\n");
}

/** Render the managed contract block appended to the consumer root AGENTS.md. */
export function buildManagedBlock({ packageName, version, strict }) {
  const manifestRequest = `${packageName}${MANIFEST_EXPORT_SUBPATH.replace(/^\./, "")}`;
  return [
    MANAGED_BLOCK_BEGIN,
    "## Design system (managed)",
    "",
    `This project consumes \`${packageName}@${version}\` as its visual source of truth`,
    `(strict mode: \`${strict}\`). This block is managed by \`pnpm ds:connect\`; do not edit it`,
    "by hand.",
    "",
    "Before implementing UI, read in order:",
    "",
    "1. `.design-system/config.json`",
    `2. \`${manifestRequest}\``,
    `3. \`node_modules/${packageName}/AGENTS.md\``,
    `4. \`node_modules/${packageName}/README.md\``,
    `5. the public TypeScript API of \`${packageName}\``,
    "",
    "Compose existing components with props; do not restyle them, copy package CSS, import",
    "package internals, or create local replacements for components the design system already",
    "provides. Layout and composition belong to the product; visual language changes belong in",
    "the design system package.",
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
        "markers (exactly one BEGIN and one END) or remove them, then re-run ds:connect.",
    );
  }
  const begin = existing.indexOf(MANAGED_BLOCK_BEGIN);
  const end = existing.indexOf(MANAGED_BLOCK_END);
  if (end < begin) {
    throw new Error(
      "Consumer AGENTS.md has an END marker before its BEGIN marker; fix the managed block, " +
        "then re-run ds:connect.",
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
 * Plan a connect without writing anything. Throws on any discovery or
 * verification failure (invalid config, multiple candidates, missing package,
 * mismatched versions, malformed markers).
 */
export function planConnect({ cwd, package: explicitPackage, strict, check = false } = {}) {
  const consumerRoot = resolveConsumerRoot({ cwd });
  const discovered = discoverConsumerPackage({ consumerRoot, explicitPackage });
  const installed = resolveInstalledDesignSystem({
    consumerRoot,
    packageName: discovered.packageName,
  });
  const { version } = verifyConsumerDesignSystem({
    packageName: discovered.packageName,
    expectedVersion: discovered.expectedVersion,
    installed,
  });

  const effectiveStrict = strict ?? (discovered.config ? discovered.config.strict : true);
  // Containment: validate every consumer-owned path (including the
  // .design-system directory) against the real consumer root before planning
  // any write, so an external symlink/junction can never redirect config,
  // AGENTS, or rollback writes outside --cwd.
  resolveConsumerPath(consumerRoot, CONSUMER_DIRECTORY);
  const configPath = resolveConsumerPath(
    consumerRoot,
    CONSUMER_DIRECTORY,
    CONSUMER_CONFIG_FILENAME,
  );
  const agentsPath = resolveConsumerPath(
    consumerRoot,
    CONSUMER_DIRECTORY,
    CONSUMER_AGENTS_FILENAME,
  );
  const rootAgentsPath = resolveConsumerPath(consumerRoot, "AGENTS.md");

  // Preserve any configured ignore globs across re-connect so the config stays
  // idempotent and consumer-defined ignores are not dropped.
  const effectiveIgnore = discovered.config ? discovered.config.ignore : [];
  const configContent = `${JSON.stringify(
    buildConsumerConfig({
      packageName: discovered.packageName,
      version,
      strict: effectiveStrict,
      ignore: effectiveIgnore,
    }),
    null,
    2,
  )}\n`;
  const agentsContent = renderConsumerAgents({
    packageName: discovered.packageName,
    version,
    strict: effectiveStrict,
  });
  const block = buildManagedBlock({
    packageName: discovered.packageName,
    version,
    strict: effectiveStrict,
  });
  const rootAgentsAfter = applyManagedBlock(readIfExists(rootAgentsPath), block);

  return {
    consumerRoot,
    packageName: discovered.packageName,
    version,
    strict: effectiveStrict,
    source: discovered.source,
    check,
    files: [
      { kind: "config", path: configPath, before: readIfExists(configPath), after: configContent },
      { kind: "agents", path: agentsPath, before: readIfExists(agentsPath), after: agentsContent },
      {
        kind: "root-agents",
        path: rootAgentsPath,
        before: readIfExists(rootAgentsPath),
        after: rootAgentsAfter,
      },
    ],
  };
}

/**
 * Discover, verify, and (unless checking) write the consumer contract.
 *
 * @returns {{ ok: boolean, changed: boolean, check: boolean, dryRun: boolean, failures: string[], plan: object | null, changes: object[] }}
 */
export function connectDesignSystem({
  cwd,
  package: explicitPackage,
  strict,
  check = false,
  dryRun = false,
} = {}) {
  let plan;
  try {
    plan = planConnect({ cwd, package: explicitPackage, strict, check });
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

  if (check) {
    return {
      ok: true,
      changed: changes.length > 0,
      check: true,
      dryRun: false,
      failures: [],
      plan,
      changes,
    };
  }
  if (dryRun) {
    return { ok: true, changed: false, check: false, dryRun: true, failures: [], plan, changes };
  }

  const backups = [];
  try {
    for (const file of plan.files) {
      if (file.before === file.after) continue;
      // Re-assert containment immediately before each mutation.
      assertWithin(plan.consumerRoot, file.path, "Consumer write path");
      backups.push({ path: file.path, before: file.before });
      writeFileAtomic(file.path, file.after, plan.consumerRoot);
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
      failures: [`ds:connect failed and was rolled back: ${error.message}`],
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
    changes: backups.map((backup) => ({ kind: "written", path: backup.path })),
  };
}
