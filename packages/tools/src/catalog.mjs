/**
 * Catalog orchestration for `prism-ds search`, `info`, `install`, `use`, and
 * `upgrade`.
 *
 * Network operations are read-only. `install`/`use`/`upgrade` are the only paths
 * that may mutate consumer dependencies, and they do so through a fixed,
 * internally constructed npm/pnpm command after the registry has resolved and
 * validated an exact version. Failures stop at a clearly reported boundary; a
 * package-manager mutation is never rolled back automatically.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  CONSUMER_AGENTS_FILENAME,
  CONSUMER_CONFIG_FILENAME,
  CONSUMER_DIRECTORY,
  connectDesignSystem,
  resolveConsumerPath,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import {
  CONTRACT_V4,
  MANIFEST_V4_SCHEMA_VERSION,
  V4_COMPONENT_NAMES,
  V4_TOKEN_GROUP_KEYS,
  assertWithin,
  readJsonFile,
} from "./constants.mjs";
import { buildInstallCommand, detectPackageManager, spawnInstall } from "./package-manager.mjs";
import { fetchDesignSystemInfo, searchRegistry } from "./registry.mjs";
import { assertExactSemver } from "./semver.mjs";
import { mergeBridgeImports, setupTailwind } from "./tailwind-setup.mjs";

/** Installed package whose major version gates the Tailwind v4 bridge. */
const TAILWIND_PACKAGE = "tailwindcss";
/** Required Tailwind major version for the V4 bridge. */
const TAILWIND_MIN_MAJOR = 4;
/** Exact semver shape used to read an installed package version. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** Read-only registry search for supported design systems. */
export async function searchDesignSystems(options = {}) {
  return searchRegistry(options);
}

/** Read-only registry inspection of a published design system manifest. */
export async function inspectDesignSystem(options = {}) {
  return fetchDesignSystemInfo(options);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve an installed package through Node package resolution from the consumer
 * root and read its `package.json`. Offline, read-only, and built-in-only; it
 * never runs scripts and never touches the network.
 */
function resolveInstalledPackageJson({ consumerRoot, packageName }) {
  const requireFromConsumer = createRequire(join(consumerRoot, "package.json"));

  let packageJsonPath = null;
  try {
    packageJsonPath = requireFromConsumer.resolve(`${packageName}/package.json`);
  } catch {
    packageJsonPath = null;
  }
  if (packageJsonPath === null) {
    let entryPath;
    try {
      entryPath = requireFromConsumer.resolve(packageName);
    } catch {
      throw new Error(
        `Package "${packageName}" is not installed in ${consumerRoot}; install it before ` +
          "enabling --tailwind (this command never installs Tailwind).",
      );
    }
    let current = dirname(entryPath);
    for (;;) {
      const candidate = join(current, "package.json");
      if (existsSync(candidate)) {
        let json = null;
        try {
          json = readJsonFile(candidate);
        } catch {
          json = null;
        }
        if (json !== null && json.name === packageName) {
          packageJsonPath = candidate;
          break;
        }
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    if (packageJsonPath === null) {
      throw new Error(
        `Installed "${packageName}" could not be located from its entry ${entryPath}.`,
      );
    }
  }

  let packageJson;
  try {
    packageJson = readJsonFile(packageJsonPath);
  } catch (error) {
    throw new Error(
      `Invalid installed "${packageName}" package.json ${packageJsonPath}: ${error.message}`,
    );
  }
  if (packageJson?.name !== packageName) {
    throw new Error(
      `Installed package.json ${packageJsonPath} has name ${JSON.stringify(
        packageJson?.name ?? null,
      )}; expected "${packageName}".`,
    );
  }
  return { dir: dirname(packageJsonPath), packageJsonPath, packageJson };
}

/** Require the installed Tailwind to be major v4, read from its package.json. */
function verifyInstalledTailwindV4({ consumerRoot }) {
  const installed = resolveInstalledPackageJson({
    consumerRoot,
    packageName: TAILWIND_PACKAGE,
  });
  const version = installed.packageJson?.version;
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version.trim())) {
    throw new Error(
      `Installed "${TAILWIND_PACKAGE}" has an unrecognized version ${JSON.stringify(
        version ?? null,
      )}; expected Tailwind CSS v${TAILWIND_MIN_MAJOR}.`,
    );
  }
  const normalized = version.trim();
  const major = Number.parseInt(normalized.split(".")[0], 10);
  if (major !== TAILWIND_MIN_MAJOR) {
    throw new Error(
      `Installed "${TAILWIND_PACKAGE}" is v${normalized}; the design-system bridge ` +
        `requires Tailwind CSS v${TAILWIND_MIN_MAJOR}.`,
    );
  }
  return { version: normalized };
}

/**
 * Preflight a `use --tailwind` request before any dependency mutation.
 *
 * It requires the resolved target manifest to be V4, an already-installed
 * Tailwind CSS v4, a contained existing CSS file, and no conflicting second
 * design-system bridge (via the same pure `mergeBridgeImports` order/conflict
 * rules used by the real setup). It deliberately does not check the
 * not-yet-installed bridge export files: only a successful install can prove
 * those exist.
 *
 * @returns {{
 *   cssPath: string,
 *   packageName: string,
 *   version: string,
 *   tailwindVersion: string,
 *   before: string,
 *   after: string,
 *   changed: boolean,
 * }}
 */
function planUseTailwind({ consumerRoot, packageName, cssPath, manifest, version }) {
  if (
    manifest?.contract !== CONTRACT_V4 ||
    manifest?.schemaVersion !== MANIFEST_V4_SCHEMA_VERSION
  ) {
    throw new Error(
      `--tailwind requires a V4 design system (contract "v4", schemaVersion ` +
        `${MANIFEST_V4_SCHEMA_VERSION}); the target "${packageName}@${version}" is ` +
        `${JSON.stringify(manifest?.contract ?? null)}/schemaVersion ${JSON.stringify(
          manifest?.schemaVersion ?? null,
        )}.`,
    );
  }
  if (typeof cssPath !== "string" || cssPath.trim().length === 0) {
    throw new Error("--tailwind requires an explicit --css <file> path inside the consumer root.");
  }
  const requested = cssPath.trim();
  const cssTarget = assertWithin(
    consumerRoot,
    isAbsolute(requested) ? resolve(requested) : join(consumerRoot, requested),
    "CSS file",
  );
  if (!existsSync(cssTarget)) {
    throw new Error(
      `CSS file does not exist: ${cssTarget}. --tailwind only edits an existing file inside --cwd.`,
    );
  }
  if (!statSync(cssTarget).isFile()) {
    throw new Error(`CSS path is not a regular file: ${cssTarget}.`);
  }

  const tailwind = verifyInstalledTailwindV4({ consumerRoot });
  const before = readFileSync(cssTarget, "utf8");
  const after = mergeBridgeImports(before, { packageName });
  return {
    cssPath: cssTarget,
    packageName,
    version,
    tailwindVersion: tailwind.version,
    before,
    after,
    changed: before !== after,
  };
}

/** Canonical component names a manifest declares, in deterministic order. */
function manifestComponentNames(manifest) {
  const components = isPlainObject(manifest?.components) ? manifest.components : {};
  const ordered = V4_COMPONENT_NAMES.filter((name) =>
    Object.prototype.hasOwnProperty.call(components, name),
  );
  const unknown = Object.keys(components).filter((name) => !V4_COMPONENT_NAMES.includes(name));
  return [...ordered, ...unknown];
}

/** Read one token group's names as strings, or `[]`. */
function tokenGroupNames(groups, group) {
  const value = isPlainObject(groups) ? groups[group] : undefined;
  return Array.isArray(value) ? value.filter((name) => typeof name === "string") : [];
}

/** Read a manifest array as a set while keeping source order for stable output. */
function manifestStringSet(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function diffStringSets(beforeValue, afterValue) {
  const before = manifestStringSet(beforeValue);
  const after = manifestStringSet(afterValue);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((value) => !beforeSet.has(value)),
    removed: before.filter((value) => !afterSet.has(value)),
  };
}

function manifestExportTargets(exportsMap) {
  const targets = {};
  if (!isPlainObject(exportsMap)) return targets;
  for (const subpath of Object.keys(exportsMap).sort()) {
    const value = exportsMap[subpath];
    if (typeof value === "string") {
      targets[subpath] = value;
      continue;
    }
    if (!isPlainObject(value)) continue;
    for (const condition of Object.keys(value).sort()) {
      const target = value[condition];
      if (typeof target === "string") targets[`${subpath}#${condition}`] = target;
    }
  }
  return targets;
}

/**
 * Deterministic component and token removals/additions between an installed
 * manifest and a validated registry target. Component names follow the canonical
 * V4 order; token groups follow {@link V4_TOKEN_GROUP_KEYS} and each group's
 * names keep manifest order.
 */
function computeManifestDiff(fromManifest, toManifest) {
  const fromComponents = manifestComponentNames(fromManifest);
  const toComponents = manifestComponentNames(toManifest);
  const fromComponentSet = new Set(fromComponents);
  const toComponentSet = new Set(toComponents);
  const components = {
    added: toComponents.filter((name) => !fromComponentSet.has(name)),
    removed: fromComponents.filter((name) => !toComponentSet.has(name)),
    changed: [],
  };
  for (const name of toComponents) {
    if (!fromComponentSet.has(name)) continue;
    const before = fromManifest.components[name];
    const after = toManifest.components[name];
    const fields = {};
    for (const field of ["variants", "sizes", "members"]) {
      const change = diffStringSets(before?.[field], after?.[field]);
      if (change.added.length || change.removed.length) fields[field] = change;
    }
    if (Object.keys(fields).length) components.changed.push({ name, fields });
  }

  const metadata = {};
  for (const field of ["schemaVersion", "contract"]) {
    if (fromManifest?.[field] !== toManifest?.[field]) {
      metadata[field] = { from: fromManifest?.[field] ?? null, to: toManifest?.[field] ?? null };
    }
  }

  const fromExports = manifestExportTargets(fromManifest?.exports);
  const toExports = manifestExportTargets(toManifest?.exports);
  const exportKeys = [...new Set([...Object.keys(fromExports), ...Object.keys(toExports)])].sort();
  const exports = { added: [], removed: [], changed: [] };
  for (const key of exportKeys) {
    if (!Object.prototype.hasOwnProperty.call(fromExports, key)) {
      exports.added.push({ target: key, value: toExports[key] });
    } else if (!Object.prototype.hasOwnProperty.call(toExports, key)) {
      exports.removed.push({ target: key, value: fromExports[key] });
    } else if (fromExports[key] !== toExports[key]) {
      exports.changed.push({ target: key, from: fromExports[key], to: toExports[key] });
    }
  }

  const fromGroups = isPlainObject(fromManifest?.tokens?.groups) ? fromManifest.tokens.groups : {};
  const toGroups = isPlainObject(toManifest?.tokens?.groups) ? toManifest.tokens.groups : {};
  const groupOrder = [];
  for (const key of [
    ...V4_TOKEN_GROUP_KEYS,
    ...Object.keys(fromGroups),
    ...Object.keys(toGroups),
  ]) {
    if (!groupOrder.includes(key)) groupOrder.push(key);
  }

  const added = {};
  const removed = {};
  for (const group of groupOrder) {
    const before = tokenGroupNames(fromGroups, group);
    const after = tokenGroupNames(toGroups, group);
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const groupAdded = after.filter((name) => !beforeSet.has(name));
    const groupRemoved = before.filter((name) => !afterSet.has(name));
    if (groupAdded.length > 0) added[group] = groupAdded;
    if (groupRemoved.length > 0) removed[group] = groupRemoved;
  }

  return { components, tokens: { added, removed }, metadata, exports };
}

/** Deterministic, human-readable preview of an upgrade comparison. */
function buildUpgradePreview({ packageName, fromVersion, toVersion, command, diff }) {
  const lines = [`upgrade ${packageName}: ${fromVersion} -> ${toVersion}`];
  lines.push(`manager command: ${[command.manager, ...command.args].join(" ")}`);
  if (diff.components.removed.length > 0) {
    lines.push(`components removed: ${diff.components.removed.join(", ")}`);
  }
  if (diff.components.added.length > 0) {
    lines.push(`components added: ${diff.components.added.join(", ")}`);
  }
  for (const component of diff.components.changed) {
    for (const [field, change] of Object.entries(component.fields)) {
      if (change.removed.length)
        lines.push(
          `components changed (${component.name} ${field} removed): ${change.removed.join(", ")}`,
        );
      if (change.added.length)
        lines.push(
          `components changed (${component.name} ${field} added): ${change.added.join(", ")}`,
        );
    }
  }
  for (const [group, names] of Object.entries(diff.tokens.removed)) {
    lines.push(`tokens removed (${group}): ${names.join(", ")}`);
  }
  for (const [group, names] of Object.entries(diff.tokens.added)) {
    lines.push(`tokens added (${group}): ${names.join(", ")}`);
  }
  for (const [field, change] of Object.entries(diff.metadata)) {
    lines.push(
      `manifest metadata changed (${field}): ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`,
    );
  }
  for (const item of diff.exports.removed)
    lines.push(`public export removed (${item.target}): ${item.value}`);
  for (const item of diff.exports.added)
    lines.push(`public export added (${item.target}): ${item.value}`);
  for (const item of diff.exports.changed)
    lines.push(`public export changed (${item.target}): ${item.from} -> ${item.to}`);
  if (lines.length === 2)
    lines.push("no manifest metadata, component, token, or public export changes");
  return lines;
}

/** The three consumer contract files `connect` manages, in write order. */
function plannedConnectPaths(consumerRoot) {
  return [
    resolveConsumerPath(consumerRoot, CONSUMER_DIRECTORY, CONSUMER_CONFIG_FILENAME),
    resolveConsumerPath(consumerRoot, CONSUMER_DIRECTORY, CONSUMER_AGENTS_FILENAME),
    resolveConsumerPath(consumerRoot, "AGENTS.md"),
  ];
}

/** Deterministic planned effects of a dry-run `use`. */
function buildUsePlannedChanges({ install, tailwindPlan }) {
  const changes = [{ kind: "dependency", manager: install.manager, command: install.command }];
  if (tailwindPlan) {
    changes.push({
      kind: "css",
      path: tailwindPlan.cssPath,
      changed: tailwindPlan.changed,
      before: tailwindPlan.before,
      after: tailwindPlan.after,
    });
  }
  for (const path of plannedConnectPaths(install.consumerRoot)) {
    changes.push({ kind: "connect", path });
  }
  return changes;
}

/**
 * Explicitly install a design system into a consumer.
 *
 * Resolves and validates the exact version from the registry first; if registry
 * resolution fails the package manager is never invoked. After the manager exits
 * zero, the installed package is verified through the public `./manifest` export
 * and exact identity/version checks. Returns a structured result.
 *
 * With `dryRun` it resolves and validates the exact remote info and the exact
 * manager command, then returns without spawning anything.
 *
 * `preflight` is an internal hook run after command construction and before any
 * spawn (including on a dry run); it may return a value that is surfaced on the
 * dry-run result, and throwing turns into a `preflight` boundary failure.
 */
export async function installDesignSystem({
  cwd,
  package: target,
  version,
  saveDev = false,
  exact = false,
  registry,
  fetchImpl,
  spawnImpl,
  stdio = "inherit",
  dryRun = false,
  preflight,
} = {}) {
  let consumerRoot;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    return { ok: false, boundary: "consumer-root", failures: [error.message] };
  }

  let info;
  try {
    info = await fetchDesignSystemInfo({ package: target, version, registry, fetchImpl });
  } catch (error) {
    return { ok: false, boundary: "registry", failures: [error.message] };
  }

  let detection;
  try {
    detection = detectPackageManager({ consumerRoot });
  } catch (error) {
    return { ok: false, boundary: "package-manager", failures: [error.message], info };
  }

  let command;
  try {
    command = buildInstallCommand({
      manager: detection.manager,
      packageName: info.package,
      version: info.version,
      saveDev,
      exact,
      registry: info.registry,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "command",
      failures: [error.message],
      info,
      manager: detection.manager,
    };
  }

  let preflightResult;
  if (typeof preflight === "function") {
    try {
      preflightResult = preflight({ consumerRoot, info, detection, command });
    } catch (error) {
      return {
        ok: false,
        boundary: "preflight",
        failures: [error.message],
        info,
        manager: detection.manager,
        managerSource: detection.source,
        command,
      };
    }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      changed: false,
      failures: [],
      consumerRoot,
      manager: detection.manager,
      managerSource: detection.source,
      package: info.package,
      version: info.version,
      registry: info.registry,
      command,
      plannedChanges: [{ kind: "dependency", manager: detection.manager, command }],
      ...(preflightResult !== undefined ? { preflight: preflightResult } : {}),
    };
  }

  let result;
  try {
    result = spawnInstall({
      manager: detection.manager,
      args: command.args,
      cwd: consumerRoot,
      spawnImpl,
      stdio,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "spawn",
      failures: [error.message],
      info,
      manager: detection.manager,
      command,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      boundary: "manager",
      failures: [`${detection.manager} exited with code ${result.status ?? "unknown"}.`],
      info,
      manager: detection.manager,
      command,
    };
  }

  let installed;
  try {
    installed = resolveInstalledDesignSystem({ consumerRoot, packageName: info.package });
    verifyConsumerDesignSystem({
      packageName: info.package,
      expectedVersion: info.version,
      installed,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "verify",
      failures: [`Installed package verification failed: ${error.message}`],
      info,
      manager: detection.manager,
      command,
    };
  }

  return {
    ok: true,
    failures: [],
    consumerRoot,
    manager: detection.manager,
    managerSource: detection.source,
    package: info.package,
    version: info.version,
    registry: info.registry,
    command,
    installedDir: installed.packageDir,
  };
}

/**
 * Install, verify, and connect a design system, optionally running the strict
 * usage check. The target must be explicit; the package is never discovered.
 *
 * `dryRun` resolves the exact target and manager command (and, with `tailwind`,
 * the planned CSS import diff) without spawning or writing anything. `tailwind`
 * requires `cssPath` and preflights a V4 target, an installed Tailwind v4, and
 * the CSS file before any dependency mutation; the real Tailwind setup runs only
 * after a successful install and connect.
 */
export async function runUseDesignSystem({
  cwd,
  package: target,
  version,
  saveDev = false,
  exact = false,
  registry,
  strict,
  ignore = [],
  checkUsage: runUsage = false,
  fetchImpl,
  spawnImpl,
  stdio = "inherit",
  dryRun = false,
  tailwind = false,
  cssPath,
} = {}) {
  if (Array.isArray(ignore) && ignore.length > 0 && runUsage !== true) {
    return { ok: false, boundary: "arguments", failures: ["--ignore requires --check-usage."] };
  }
  const hasCss = typeof cssPath === "string" && cssPath.trim().length > 0;
  if (tailwind === true && !hasCss) {
    return { ok: false, boundary: "arguments", failures: ["--tailwind requires --css <file>."] };
  }
  if (tailwind !== true && hasCss) {
    return { ok: false, boundary: "arguments", failures: ["--css requires --tailwind."] };
  }

  let tailwindPlan = null;
  const preflight =
    tailwind === true
      ? ({ consumerRoot, info }) => {
          tailwindPlan = planUseTailwind({
            consumerRoot,
            packageName: info.package,
            cssPath,
            manifest: info.manifest,
            version: info.version,
          });
          return tailwindPlan;
        }
      : undefined;

  const install = await installDesignSystem({
    cwd,
    package: target,
    version,
    saveDev,
    exact,
    registry,
    fetchImpl,
    spawnImpl,
    stdio,
    dryRun,
    preflight,
  });
  if (!install.ok) {
    return {
      ok: false,
      boundary: install.boundary ?? "install",
      failures: install.failures,
      install,
    };
  }

  if (dryRun) {
    let plannedChanges;
    try {
      plannedChanges = buildUsePlannedChanges({ install, tailwindPlan });
    } catch (error) {
      return { ok: false, boundary: "plan", failures: [error.message], install };
    }
    return {
      ok: true,
      dryRun: true,
      changed: false,
      failures: [],
      install,
      connect: null,
      usage: null,
      tailwind: tailwindPlan,
      plannedChanges,
    };
  }

  const connect = connectDesignSystem({
    cwd: install.consumerRoot,
    package: install.package,
    strict,
  });
  if (!connect.ok) {
    return {
      ok: false,
      boundary: "connect",
      failures: connect.failures,
      install,
      connect,
    };
  }

  let usage = null;
  if (runUsage === true) {
    // Lazy-load the checker so TypeScript stays lazy for every other command.
    const { checkUsage } = await import("./usage.mjs");
    try {
      usage = checkUsage({ cwd: install.consumerRoot, ignore, strict });
    } catch (error) {
      return {
        ok: false,
        boundary: "check-usage",
        failures: [error.message],
        install,
        connect,
      };
    }
    if (!usage.ok) {
      return {
        ok: false,
        boundary: "check-usage",
        failures: ["Strict usage check failed."],
        install,
        connect,
        usage,
      };
    }
  }

  let tailwindSetup = null;
  if (tailwind === true) {
    tailwindSetup = setupTailwind({ cwd: install.consumerRoot, cssPath: tailwindPlan.cssPath });
    if (!tailwindSetup.ok) {
      return {
        ok: false,
        boundary: "setup-tailwind",
        failures: tailwindSetup.failures,
        note:
          "The package was installed and connected; only the Tailwind CSS setup did not " +
          "complete. No rollback was attempted.",
        install,
        connect,
        usage,
        tailwind: tailwindPlan,
        tailwindSetup,
      };
    }
  }

  return {
    ok: true,
    failures: [],
    install,
    connect,
    usage,
    ...(tailwind === true ? { tailwind: tailwindPlan, tailwindSetup } : {}),
  };
}

/**
 * Explicitly upgrade an installed design system to an exact registry version.
 *
 * The exact version is required. The installed valid manifest is compared against
 * the validated registry target *before* any package-manager mutation, producing
 * deterministic component and token removals/additions plus a preview. A dry run
 * resolves and checks the target and manager, returning the exact manager command
 * and planned consumer file effects without spawning or writing. On a real run it
 * uses the same fixed npm/pnpm path as `use`, verifies the exact installed
 * identity/version, then reconnects. A manager mutation is never rolled back.
 */
export async function upgradeDesignSystem({
  cwd,
  package: target,
  version,
  strict,
  registry,
  fetchImpl,
  spawnImpl,
  stdio = "inherit",
  dryRun = false,
} = {}) {
  let requestedVersion;
  try {
    if (typeof version !== "string" || version.trim().length === 0) {
      throw new Error("upgrade requires an explicit exact <version>.");
    }
    requestedVersion = assertExactSemver(version.trim());
  } catch (error) {
    return { ok: false, boundary: "arguments", failures: [error.message], dryRun };
  }

  let consumerRoot;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    return { ok: false, boundary: "consumer-root", failures: [error.message], dryRun };
  }

  let info;
  try {
    info = await fetchDesignSystemInfo({
      package: target,
      version: requestedVersion,
      registry,
      fetchImpl,
    });
  } catch (error) {
    return { ok: false, boundary: "registry", failures: [error.message], dryRun };
  }

  let installed;
  try {
    installed = resolveInstalledDesignSystem({ consumerRoot, packageName: info.package });
    verifyConsumerDesignSystem({ packageName: info.package, expectedVersion: null, installed });
  } catch (error) {
    return {
      ok: false,
      boundary: "installed",
      failures: [`Installed package verification failed: ${error.message}`],
      info,
      toVersion: info.version,
    };
  }
  const fromVersion = installed.packageJson.version;

  // Compared against the validated target before any manager mutation.
  const diff = computeManifestDiff(installed.manifest, info.manifest);

  let detection;
  try {
    detection = detectPackageManager({ consumerRoot });
  } catch (error) {
    return {
      ok: false,
      boundary: "package-manager",
      failures: [error.message],
      info,
      diff,
      fromVersion,
      toVersion: info.version,
    };
  }

  let command;
  try {
    command = buildInstallCommand({
      manager: detection.manager,
      packageName: info.package,
      version: info.version,
      saveDev: false,
      exact: false,
      registry: info.registry,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "command",
      failures: [error.message],
      info,
      manager: detection.manager,
      managerSource: detection.source,
      diff,
      fromVersion,
      toVersion: info.version,
    };
  }

  const preview = buildUpgradePreview({
    packageName: info.package,
    fromVersion,
    toVersion: info.version,
    command,
    diff,
  });

  let plannedChanges;
  try {
    plannedChanges = [
      { kind: "dependency", manager: detection.manager, command },
      ...plannedConnectPaths(consumerRoot).map((path) => ({ kind: "connect", path })),
    ];
  } catch (error) {
    return {
      ok: false,
      boundary: "plan",
      failures: [error.message],
      info,
      manager: detection.manager,
      managerSource: detection.source,
      command,
      diff,
      preview,
      fromVersion,
      toVersion: info.version,
    };
  }

  const base = {
    consumerRoot,
    package: info.package,
    fromVersion,
    toVersion: info.version,
    registry: info.registry,
    manager: detection.manager,
    managerSource: detection.source,
    command,
    diff,
    preview,
    plannedChanges,
  };

  if (dryRun) {
    return { ok: true, dryRun: true, changed: false, failures: [], ...base };
  }

  let result;
  try {
    result = spawnInstall({
      manager: detection.manager,
      args: command.args,
      cwd: consumerRoot,
      spawnImpl,
      stdio,
    });
  } catch (error) {
    return { ok: false, boundary: "spawn", failures: [error.message], ...base };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      boundary: "manager",
      failures: [`${detection.manager} exited with code ${result.status ?? "unknown"}.`],
      ...base,
    };
  }

  let installedAfter;
  try {
    installedAfter = resolveInstalledDesignSystem({ consumerRoot, packageName: info.package });
    verifyConsumerDesignSystem({
      packageName: info.package,
      expectedVersion: info.version,
      installed: installedAfter,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "verify",
      failures: [`Installed package verification failed: ${error.message}`],
      ...base,
    };
  }

  const connect = connectDesignSystem({ cwd: consumerRoot, package: info.package, strict });
  if (!connect.ok) {
    return {
      ok: false,
      boundary: "connect",
      failures: connect.failures,
      note: "The package was updated and verified; only reconnect did not complete.",
      ...base,
      connect,
    };
  }

  return {
    ok: true,
    dryRun: false,
    changed: true,
    failures: [],
    ...base,
    installedDir: installedAfter.packageDir,
    connect,
  };
}
