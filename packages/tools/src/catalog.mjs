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
import { isDeepStrictEqual } from "node:util";

import {
  connectDesignSystem,
  planConnectForTarget,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import {
  CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  COMPONENT_NAMES,
  TOKEN_GROUP_KEYS,
  assertWithin,
  readJsonFile,
} from "./constants.mjs";
import {
  planEntryAndPeers,
  verifyPeerInstallations,
} from "./entry-scan.mjs";
import { buildInstallCommand, detectPackageManager, spawnInstall } from "./package-manager.mjs";
import { fetchDesignSystemInfo, searchRegistry } from "./registry.mjs";
import { assertExactSemver } from "./semver.mjs";
import { mergeBridgeImports, setupTailwind } from "./tailwind-setup.mjs";

/** Installed package whose major version gates the Tailwind v4 bridge. */
const TAILWIND_PACKAGE = "tailwindcss";
/** Required Tailwind CSS major for the bridge. */
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
 * It requires the resolved target manifest to be current, an already-installed
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
    manifest?.contractVersion !== CONTRACT_VERSION ||
    manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION
  ) {
    throw new Error(
      `--tailwind requires the current design system manifest (contractVersion ` +
        `${CONTRACT_VERSION}, schemaVersion ${MANIFEST_SCHEMA_VERSION}); the target ` +
        `"${packageName}@${version}" is contractVersion ${JSON.stringify(
          manifest?.contractVersion ?? null,
        )}/schemaVersion ${JSON.stringify(manifest?.schemaVersion ?? null)}.`,
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
  const ordered = COMPONENT_NAMES.filter((name) =>
    Object.prototype.hasOwnProperty.call(components, name),
  );
  const unknown = Object.keys(components).filter((name) => !COMPONENT_NAMES.includes(name));
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

/** A `{ from, to }` change pair, or null when the deep values are equal. */
function deepChange(before, after) {
  const from = before === undefined ? null : before;
  const to = after === undefined ? null : after;
  return isDeepStrictEqual(from, to) ? null : { from, to };
}

/** Added/removed/changed requirement entries for one entrypoint key. */
function diffRequirements(beforeValue, afterValue) {
  const before = Array.isArray(beforeValue) ? beforeValue : [];
  const after = Array.isArray(afterValue) ? afterValue : [];
  const beforeByName = new Map(before.map((requirement) => [requirement.name, requirement]));
  const afterByName = new Map(after.map((requirement) => [requirement.name, requirement]));
  const result = { added: [], removed: [], changed: [] };
  for (const name of afterByName.keys()) {
    if (!beforeByName.has(name)) result.added.push(name);
  }
  for (const name of beforeByName.keys()) {
    if (!afterByName.has(name)) result.removed.push(name);
  }
  for (const [name, from] of beforeByName) {
    const to = afterByName.get(name);
    if (to === undefined) continue;
    if (!isDeepStrictEqual(from, to)) result.changed.push({ name, from, to });
  }
  return result;
}

/** True when a requirement diff has any change. */
function requirementsDiffer(diff) {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
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
 * order; token groups follow {@link TOKEN_GROUP_KEYS} and each group's
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
    const entry = { name };
    if (Object.keys(fields).length) entry.fields = fields;
    const effects = deepChange(before?.effects, after?.effects);
    if (effects !== null) entry.effects = effects;
    if (entry.fields !== undefined || entry.effects !== undefined) components.changed.push(entry);
  }

  // Custom extensions: added/removed names plus apiVersion/entrypoint/effects
  // changes. Requirements are never repeated on the extension; their changes
  // live on the entrypoint diff below.
  const fromExtensions = isPlainObject(fromManifest?.extensions) ? fromManifest.extensions : {};
  const toExtensions = isPlainObject(toManifest?.extensions) ? toManifest.extensions : {};
  const extensionOrder = [
    ...Object.keys(toExtensions),
    ...Object.keys(fromExtensions).filter((name) => !Object.prototype.hasOwnProperty.call(toExtensions, name)),
  ];
  const extensions = { added: [], removed: [], changed: [] };
  for (const name of extensionOrder) {
    const before = fromExtensions[name];
    const after = toExtensions[name];
    if (before === undefined) {
      extensions.added.push(name);
      continue;
    }
    if (after === undefined) {
      extensions.removed.push(name);
      continue;
    }
    const entry = { name };
    const fields = {};
    for (const field of ["apiVersion", "entrypoint"]) {
      const change = deepChange(before?.[field], after?.[field]);
      if (change !== null) fields[field] = change;
    }
    if (Object.keys(fields).length) entry.fields = fields;
    const effects = deepChange(before?.effects, after?.effects);
    if (effects !== null) entry.effects = effects;
    if (entry.fields !== undefined || entry.effects !== undefined) extensions.changed.push(entry);
  }

  // Entrypoint requirement changes (the declared prerequisite contract).
  const fromEntrypoints = isPlainObject(fromManifest?.entrypoints) ? fromManifest.entrypoints : {};
  const toEntrypoints = isPlainObject(toManifest?.entrypoints) ? toManifest.entrypoints : {};
  const entrypointOrder = [
    ...Object.keys(toEntrypoints),
    ...Object.keys(fromEntrypoints).filter((key) => !Object.prototype.hasOwnProperty.call(toEntrypoints, key)),
  ];
  const entrypoints = { added: [], removed: [], changed: [] };
  for (const key of entrypointOrder) {
    const before = fromEntrypoints[key];
    const after = toEntrypoints[key];
    if (before === undefined) {
      entrypoints.added.push(key);
      continue;
    }
    if (after === undefined) {
      entrypoints.removed.push(key);
      continue;
    }
    const requirements = diffRequirements(before?.requirements, after?.requirements);
    if (requirementsDiffer(requirements)) entrypoints.changed.push({ entrypoint: key, requirements });
  }

  const metadata = {};
  for (const field of ["schemaVersion", "contractVersion"]) {
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
  for (const key of [...TOKEN_GROUP_KEYS, ...Object.keys(fromGroups), ...Object.keys(toGroups)]) {
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

  return {
    components,
    extensions,
    entrypoints,
    tokens: { added, removed },
    metadata,
    exports,
  };
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
    for (const [field, change] of Object.entries(component.fields ?? {})) {
      if (change.removed.length)
        lines.push(
          `components changed (${component.name} ${field} removed): ${change.removed.join(", ")}`,
        );
      if (change.added.length)
        lines.push(
          `components changed (${component.name} ${field} added): ${change.added.join(", ")}`,
        );
    }
    if (component.effects !== undefined) {
      lines.push(
        `components changed (${component.name} effects): ` +
          `${JSON.stringify(component.effects.from)} -> ${JSON.stringify(component.effects.to)}`,
      );
    }
  }
  for (const [group, names] of Object.entries(diff.tokens.removed)) {
    lines.push(`tokens removed (${group}): ${names.join(", ")}`);
  }
  for (const [group, names] of Object.entries(diff.tokens.added)) {
    lines.push(`tokens added (${group}): ${names.join(", ")}`);
  }
  for (const name of diff.extensions.removed) lines.push(`extensions removed: ${name}`);
  for (const name of diff.extensions.added) lines.push(`extensions added: ${name}`);
  for (const extension of diff.extensions.changed) {
    for (const [field, change] of Object.entries(extension.fields ?? {})) {
      lines.push(
        `extension changed (${extension.name} ${field}): ` +
          `${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`,
      );
    }
    if (extension.effects !== undefined) {
      lines.push(
        `extension changed (${extension.name} effects): ` +
          `${JSON.stringify(extension.effects.from)} -> ${JSON.stringify(extension.effects.to)}`,
      );
    }
  }
  for (const key of diff.entrypoints.removed) lines.push(`entrypoint removed: ${key}`);
  for (const key of diff.entrypoints.added) lines.push(`entrypoint added: ${key}`);
  for (const entrypoint of diff.entrypoints.changed) {
    const label = `entrypoint changed (${entrypoint.entrypoint})`;
    if (entrypoint.requirements.added.length) {
      lines.push(`${label}: requirements added: ${entrypoint.requirements.added.join(", ")}`);
    }
    if (entrypoint.requirements.removed.length) {
      lines.push(`${label}: requirements removed: ${entrypoint.requirements.removed.join(", ")}`);
    }
    for (const requirement of entrypoint.requirements.changed) {
      lines.push(
        `${label}: requirement changed (${requirement.name}): ` +
          `${JSON.stringify(requirement.from)} -> ${JSON.stringify(requirement.to)}`,
      );
    }
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

/**
 * Deterministic planned file effects of one target-version connect plan. Each
 * managed config/AGENTS file carries its exact kind, absolute path, before/after
 * content, and changed flag so previews, JSON output, and the TUI comparison
 * material all see the same byte-level effects.
 */
function connectPlanChanges(connectPlan) {
  return connectPlan.files.map((file) => ({
    kind: "connect",
    fileKind: file.kind,
    path: file.path,
    changed: file.before !== file.after,
    before: file.before,
    after: file.after,
  }));
}

/** Deterministic planned effects of a dry-run `use`. */
function buildUsePlannedChanges({ install, tailwindPlan, connectPlan }) {
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
  changes.push(...connectPlanChanges(connectPlan));
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
 * `withEntry`/`peers` select the target entry's declared requirements and plan
 * explicit peer installs: an installed satisfying version is retained, a
 * satisfying exact `--peer` override is installed when missing, a missing peer
 * with an exact declared range installs that version, and a missing peer with a
 * non-exact range fails closed until an exact override is given. The planned
 * peer specs become part of the same fixed manager command.
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
  withEntry = [],
  peers: peerSpecs = [],
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

  let entryPlan;
  try {
    entryPlan = planEntryAndPeers({
      consumerRoot,
      packageName: info.package,
      manifest: info.manifest,
      entries: withEntry,
      peerSpecs,
    });
  } catch (error) {
    return { ok: false, boundary: "entry", failures: [error.message], info };
  }
  const entrySelection = entryPlan.selection;
  const peers = entryPlan.peers;

  let detection;
  try {
    detection = detectPackageManager({ consumerRoot });
  } catch (error) {
    return {
      ok: false,
      boundary: "package-manager",
      failures: [error.message],
      info,
      entrySelection,
      peers,
    };
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
      extraPackages: peers
        .filter((peer) => peer.action === "install")
        .map((peer) => `${peer.name}@${peer.version}`),
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "command",
      failures: [error.message],
      info,
      manager: detection.manager,
      entrySelection,
      peers,
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
        entrySelection,
        peers,
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
      entrySelection,
      peers,
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
      entrySelection,
      peers,
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
      entrySelection,
      peers,
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
      entrySelection,
      peers,
    };
  }

  const peerFailures = verifyPeerInstallations({ consumerRoot, peers });
  if (peerFailures.length > 0) {
    return {
      ok: false,
      boundary: "verify-peer",
      failures: peerFailures,
      info,
      manager: detection.manager,
      command,
      entrySelection,
      peers,
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
    entrySelection,
    peers,
    installedDir: installed.packageDir,
  };
}

/**
 * Install, verify, and connect a design system, optionally running the strict
 * usage check. The target must be explicit; the package is never discovered.
 *
 * `dryRun` resolves the exact target and manager command (and, with `tailwind`,
 * the planned CSS import diff) without spawning or writing anything. It also
 * builds the target-version connect plan from the validated registry manifest
 * (exact config/AGENTS before/after content), so the preview shows the same
 * bytes a later connect would write. `tailwind` requires `cssPath` and
 * preflights a current target, an installed Tailwind v4, and the CSS file before
 * any dependency mutation; the real Tailwind setup runs only after a successful
 * install and connect.
 *
 * `expectedConnectPlan` is an optional write precondition: after the install and
 * verification, reconnect recomputes the plan and refuses to write anything if
 * it no longer matches the previewed plan (drift fails closed; the dependency
 * change is never rolled back automatically).
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
  expectedConnectPlan,
  withEntry = [],
  peers: peerSpecs = [],
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
  // The preflight hook captures the validated registry target before any spawn
  // (including a dry run) so the target-version connect plan can be built
  // without a second registry fetch. A non-tailwind preflight returns nothing,
  // so the install result shape is unchanged.
  let targetInfo = null;
  const preflight =
    tailwind === true
      ? ({ consumerRoot, info }) => {
          targetInfo = info;
          tailwindPlan = planUseTailwind({
            consumerRoot,
            packageName: info.package,
            cssPath,
            manifest: info.manifest,
            version: info.version,
          });
          return tailwindPlan;
        }
      : ({ info }) => {
          targetInfo = info;
        };

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
    withEntry,
    peers: peerSpecs,
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
    let connectPlan;
    let plannedChanges;
    try {
      if (targetInfo === null) {
        throw new Error("The validated registry target was not resolved before planning.");
      }
      connectPlan = planConnectForTarget({
        consumerRoot: install.consumerRoot,
        package: install.package,
        version: install.version,
        manifest: targetInfo.manifest,
        strict,
      });
      plannedChanges = buildUsePlannedChanges({ install, tailwindPlan, connectPlan });
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
      connectPlan,
      plannedChanges,
    };
  }

  const connect = connectDesignSystem({
    cwd: install.consumerRoot,
    package: install.package,
    strict,
    expectedPlan: expectedConnectPlan,
  });
  if (!connect.ok) {
    const precondition = connect.boundary === "precondition";
    return {
      ok: false,
      boundary: precondition ? "connect-precondition" : "connect",
      failures: connect.failures,
      note: precondition
        ? "The package was installed and verified, but reconnect did not complete because the " +
          "consumer files changed after the preview. No connect files were written. No rollback " +
          "was attempted; the dependency change remains."
        : "The package was installed and verified, but reconnect did not complete. " +
          "No rollback was attempted.",
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
 * and the target-version connect plan (exact config/AGENTS before/after content)
 * without spawning or writing. On a real run it uses the same fixed npm/pnpm path
 * as `use`, verifies the exact installed identity/version, then reconnects.
 *
 * `expectedConnectPlan` is an optional write precondition: after the upgrade and
 * verification, reconnect recomputes the plan and refuses to write anything if
 * it no longer matches the previewed plan (drift fails closed; the dependency
 * change is never rolled back automatically).
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
  expectedConnectPlan,
  withEntry = [],
  peers: peerSpecs = [],
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

  let entryPlan;
  try {
    entryPlan = planEntryAndPeers({
      consumerRoot,
      packageName: info.package,
      manifest: info.manifest,
      entries: withEntry,
      peerSpecs,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "entry",
      failures: [error.message],
      info,
      fromVersion,
      toVersion: info.version,
    };
  }
  const entrySelection = entryPlan.selection;
  const peers = entryPlan.peers;

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
      entrySelection,
      peers,
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
      extraPackages: peers
        .filter((peer) => peer.action === "install")
        .map((peer) => `${peer.name}@${peer.version}`),
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
      entrySelection,
      peers,
    };
  }

  const preview = buildUpgradePreview({
    packageName: info.package,
    fromVersion,
    toVersion: info.version,
    command,
    diff,
  });

  let connectPlan;
  let plannedChanges;
  try {
    connectPlan = planConnectForTarget({
      consumerRoot,
      package: info.package,
      version: info.version,
      manifest: info.manifest,
      strict,
    });
    plannedChanges = [
      { kind: "dependency", manager: detection.manager, command },
      ...connectPlanChanges(connectPlan),
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
      entrySelection,
      peers,
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
    connectPlan,
    plannedChanges,
    entrySelection,
    peers,
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

  const peerFailures = verifyPeerInstallations({ consumerRoot, peers });
  if (peerFailures.length > 0) {
    return { ok: false, boundary: "verify-peer", failures: peerFailures, ...base };
  }

  const connect = connectDesignSystem({
    cwd: consumerRoot,
    package: info.package,
    strict,
    expectedPlan: expectedConnectPlan,
  });
  if (!connect.ok) {
    const precondition = connect.boundary === "precondition";
    return {
      ok: false,
      boundary: precondition ? "connect-precondition" : "connect",
      failures: connect.failures,
      note: precondition
        ? "The package was updated and verified, but reconnect did not complete because the " +
          "consumer files changed after the preview. No connect files were written. No rollback " +
          "was attempted; the dependency change remains."
        : "The package was updated and verified; only reconnect did not complete. " +
          "No rollback was attempted.",
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
