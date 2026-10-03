/**
 * Lifecycle operations for `prism-ds switch` and `prism-ds remove` (offline
 * planning, explicit mutation).
 *
 * `switchDesignSystem` changes the selected design system of a consumer:
 *
 *   1. resolves and validates the exact target version through the bounded
 *      registry client (read-only);
 *   2. verifies the currently selected installed system (schema 5 / contract 4);
 *   3. scans the consumer's *active API usage* with {@link scanActiveUsage} and
 *      refuses to proceed when any used component, extension, entrypoint,
 *      variant, size, member, or known token reference is missing from the
 *      target, or when usage cannot be verified (dynamic/computed cases);
 *   4. plans exact byte-level changes: the fixed `--ignore-scripts` install
 *      command with the selected entries' peer requirements (explicit
 *      `--with-entry` plus every extension the scan verified as actively used),
 *      literal package-prefix module/CSS-import rewrites, and the generated
 *      connect files;
 *   5. requires explicit `confirmed: true` for mutation; a dry run never spawns
 *      or writes, and missing consent returns the plan with
 *      `boundary: "confirmation-required"`;
 *   6. verifies every file/path/manifest/dependency precondition before the
 *      manager runs and again before the first write, then installs, verifies
 *      the exact target version, writes the planned bytes with rollback of this
 *      command's own writes on failure, and post-checks the result.
 *
 * The previous design system dependency is deliberately kept (no hidden
 * uninstall); token values cannot be compared, so appearance is reported as
 * unknown.
 *
 * `removeDesignSystem` removes one explicitly selected design system from a
 * consumer. It blocks when the package is still actively imported or its token
 * names are referenced, runs the fixed `npm uninstall` / `pnpm remove
 * --ignore-scripts` command, then removes only generated files that are still
 * byte-identical to their expected generated content and strips the managed
 * root-AGENTS block. User-edited files, malformed markers, unrelated
 * dependencies/peers, and user CSS are preserved and reported.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  ACTIVE_USAGE_LIMITATIONS,
  buildTokenIndex,
  buildUsageModel,
  scanActiveUsage,
} from "./active-usage.mjs";
import {
  CONSUMER_AGENTS_FILENAME,
  CONSUMER_CONFIG_FILENAME,
  CONSUMER_DIRECTORY,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  buildConsumerConfig,
  buildManagedBlock,
  discoverConsumerPackage,
  normalizeRequestedPackage,
  planConnectForTarget,
  readConsumerConfig,
  renderConsumerAgents,
  resolveConsumerPath,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import {
  CONTRACT_VERSION,
  DEFAULT_ENTRYPOINT_KEYS,
  assertWithin,
  readJsonFile,
} from "./constants.mjs";
import {
  parsePeerOverrides,
  planEntryAndPeers,
  resolveInstalledPackageVersion,
  verifyPeerInstallations,
} from "./entry-scan.mjs";
import {
  buildInstallCommand,
  buildRemoveCommand,
  detectPackageManager,
  spawnInstall,
} from "./package-manager.mjs";
import { isExactSemver } from "./semver.mjs";
import { removeBridgeImports } from "./tailwind-setup.mjs";
import { fetchDesignSystemInfo } from "./registry.mjs";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function readFileOrNull(filePath) {
  try {
    return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  } catch {
    return null;
  }
}

/** Read the consumer `package.json` or throw a clear failure. */
function readConsumerPackageJson(consumerRoot) {
  const path = resolveConsumerPath(consumerRoot, "package.json");
  if (!existsSync(path)) {
    throw new Error(`Consumer package.json not found at ${path}.`);
  }
  let json;
  try {
    json = readJsonFile(path);
  } catch (error) {
    throw new Error(`Invalid consumer package.json ${path}: ${error.message}`);
  }
  if (!isPlainObject(json)) {
    throw new Error(`Consumer package.json ${path} must be a JSON object.`);
  }
  return { path, json };
}

/** Find one declared dependency entry, or null. */
function dependencyOf(packageJson, packageName) {
  for (const section of ["dependencies", "devDependencies"]) {
    const block = packageJson?.[section];
    if (isPlainObject(block) && typeof block[packageName] === "string") {
      return { section, spec: block[packageName] };
    }
  }
  return null;
}

/** True for the two package-owned Tailwind bridge asset subpaths. */
function isBridgeSubpath(subpath) {
  return subpath === "./tailwind.css" || subpath === "./styles.css";
}

/** Atomic contained write; `writeImpl` is an internal test hook. */
function writeAtomic(filePath, content, containRoot, writeImpl) {
  assertWithin(containRoot, filePath, "Consumer write path");
  if (typeof writeImpl === "function") {
    writeImpl(filePath, content);
    return;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  assertWithin(containRoot, tempPath, "Consumer temp path");
  let renamed = false;
  try {
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, filePath);
    renamed = true;
  } finally {
    if (!renamed) rmSync(tempPath, { force: true });
  }
}

/**
 * Apply the planned file effects in order. On failure, every file already
 * written by this command is restored best-effort (contained) and the precise
 * partial state is returned. The package-manager mutation is never rolled back.
 */
function applyFileChanges({ consumerRoot, entries, writeImpl }) {
  const changed = entries.filter((entry) => entry.changed);
  const written = [];
  try {
    for (const entry of changed) {
      assertWithin(consumerRoot, entry.path, "Consumer write path");
      if (entry.after === null) {
        rmSync(entry.path, { force: true });
      } else {
        writeAtomic(entry.path, entry.after, consumerRoot, writeImpl);
      }
      written.push(entry);
    }
  } catch (error) {
    const rolledBack = [];
    const failed = [];
    for (const entry of [...written].reverse()) {
      try {
        assertWithin(consumerRoot, entry.path, "Consumer rollback path");
        if (entry.before === null) rmSync(entry.path, { force: true });
        else writeAtomic(entry.path, entry.before, consumerRoot, writeImpl);
        rolledBack.push(entry.path);
      } catch {
        failed.push(entry.path);
      }
    }
    return {
      ok: false,
      error,
      written: written.map((entry) => entry.path),
      rolledBack,
      failed,
      remaining: changed.filter((entry) => !written.includes(entry)).map((entry) => entry.path),
    };
  }
  return {
    ok: true,
    error: null,
    written: written.map((entry) => entry.path),
    rolledBack: [],
    failed: [],
    remaining: [],
  };
}

/** Read back every planned file effect and report byte mismatches. */
function verifyWrittenBytes(entries) {
  const failures = [];
  for (const entry of entries) {
    if (entry.changed !== true) continue;
    const current = readFileOrNull(entry.path);
    if (entry.after === null) {
      if (current !== null) failures.push(`${entry.path} still exists after removal.`);
    } else if (current !== entry.after) {
      failures.push(`${entry.path} does not match the planned bytes after writing.`);
    }
  }
  return failures;
}

/** Connect-plan file effects in the shared planned-change shape. */
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

/* -------------------------------------------------------------------------- */
/* Plan material (expectedPlan previews)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Version of the stable plan material accepted by `expectedPlan`.
 *
 * The material is a small, deterministic projection of a successful plan (the
 * result of a `dryRun` preview or a real run) containing only the reviewed
 * decisions: action, consumer root, resolved options, source/target manifest
 * identity digests, dependency snapshot, manager, the fixed command, selected
 * entry/peers, and the exact planned file bytes plus preserve/delete decisions.
 * Status flags, runtime results, and other bookkeeping are deliberately
 * excluded. It is not signed: it is compared structurally against a freshly
 * derived plan before any spawn or write.
 */
export const LIFECYCLE_PLAN_MATERIAL_VERSION = 1;

/** Deterministic JSON with recursively sorted object keys. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Stable content digest of a validated manifest, or null. */
function manifestDigest(manifest) {
  if (!isPlainObject(manifest)) return null;
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

/** Small manifest identity snapshot (no full manifest copy). */
function manifestIdentity(manifest) {
  if (!isPlainObject(manifest)) return null;
  return {
    package: typeof manifest.package === "string" ? manifest.package : null,
    version: typeof manifest.version === "string" ? manifest.version : null,
    id: typeof manifest.id === "string" ? manifest.id : null,
    contractVersion: manifest.contractVersion ?? null,
    schemaVersion: manifest.schemaVersion ?? null,
    digest: manifestDigest(manifest),
  };
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function normalizeOptionalString(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string or null.`);
  return value;
}

function normalizeStringArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of strings.`);
  return value.map((entry, index) => {
    if (typeof entry !== "string") throw new Error(`${label}[${index}] must be a string.`);
    return entry;
  });
}

function normalizeManifestIdentity(value, label) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) throw new Error(`${label} must be an object or null.`);
  return {
    package: requireNonEmptyString(value.package, `${label}.package`),
    version: requireNonEmptyString(value.version, `${label}.version`),
    id: normalizeOptionalString(value.id, `${label}.id`),
    contractVersion: value.contractVersion ?? null,
    schemaVersion: value.schemaVersion ?? null,
    digest: requireNonEmptyString(value.digest, `${label}.digest`),
  };
}

function normalizeFromTo(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
  return {
    package: requireNonEmptyString(value.package, `${label}.package`),
    version:
      value.version === null || value.version === undefined
        ? null
        : requireNonEmptyString(value.version, `${label}.version`),
    manifest: normalizeManifestIdentity(value.manifest, `${label}.manifest`),
  };
}

function normalizeDependency(value) {
  if (!isPlainObject(value)) throw new Error("plan material dependency must be an object.");
  return {
    package: requireNonEmptyString(value.package, "plan material dependency.package"),
    section: requireNonEmptyString(value.section, "plan material dependency.section"),
    spec: requireNonEmptyString(value.spec, "plan material dependency.spec"),
  };
}

function normalizeCommand(value) {
  if (!isPlainObject(value)) throw new Error("plan material command must be an object.");
  return {
    manager: requireNonEmptyString(value.manager, "plan material command.manager"),
    verb: requireNonEmptyString(value.verb, "plan material command.verb"),
    args: normalizeStringArray(value.args, "plan material command.args"),
  };
}

function normalizePlannedChanges(value) {
  if (!Array.isArray(value)) throw new Error("plan material plannedChanges must be an array.");
  return value.map((change, index) => {
    if (!isPlainObject(change)) {
      throw new Error(`plan material plannedChanges[${index}] must be an object.`);
    }
    const kind = requireNonEmptyString(change.kind, `plan material plannedChanges[${index}].kind`);
    if (kind === "dependency") {
      throw new Error(
        "plan material plannedChanges must contain only file effects; the dependency command is " +
          "stored separately.",
      );
    }
    return {
      kind,
      fileKind: normalizeOptionalString(
        change.fileKind,
        `plan material plannedChanges[${index}].fileKind`,
      ),
      path: normalizeOptionalString(change.path, `plan material plannedChanges[${index}].path`),
      changed: change.changed === true,
      before: normalizeOptionalString(
        change.before,
        `plan material plannedChanges[${index}].before`,
      ),
      after: normalizeOptionalString(change.after, `plan material plannedChanges[${index}].after`),
    };
  });
}

function normalizeEntrySelection(value) {
  if (!isPlainObject(value)) throw new Error("plan material entrySelection must be an object.");
  if (!Array.isArray(value.requirements)) {
    throw new Error("plan material entrySelection.requirements must be an array.");
  }
  if (!Array.isArray(value.entries)) {
    throw new Error("plan material entrySelection.entries must be an array.");
  }
  return {
    requested: normalizeStringArray(value.requested, "plan material entrySelection.requested"),
    entries: value.entries.map((entry, index) => {
      if (!isPlainObject(entry)) {
        throw new Error(`plan material entrySelection.entries[${index}] must be an object.`);
      }
      return {
        requested: requireNonEmptyString(
          entry.requested,
          `plan material entrySelection.entries[${index}].requested`,
        ),
        kind: requireNonEmptyString(
          entry.kind,
          `plan material entrySelection.entries[${index}].kind`,
        ),
        extension: normalizeOptionalString(
          entry.extension,
          `plan material entrySelection.entries[${index}].extension`,
        ),
        entrypoint: normalizeOptionalString(
          entry.entrypoint,
          `plan material entrySelection.entries[${index}].entrypoint`,
        ),
        selectedEntrypoints: normalizeStringArray(
          entry.selectedEntrypoints,
          `plan material entrySelection.entries[${index}].selectedEntrypoints`,
        ),
        selectedExtensions: normalizeStringArray(
          entry.selectedExtensions,
          `plan material entrySelection.entries[${index}].selectedExtensions`,
        ),
        source: normalizeOptionalString(
          entry.source,
          `plan material entrySelection.entries[${index}].source`,
        ),
      };
    }),
    requirements: value.requirements.map((requirement, index) => {
      if (!isPlainObject(requirement)) {
        throw new Error(`plan material entrySelection.requirements[${index}] must be an object.`);
      }
      return {
        name: requireNonEmptyString(
          requirement.name,
          `plan material entrySelection.requirements[${index}].name`,
        ),
        kind: requireNonEmptyString(
          requirement.kind,
          `plan material entrySelection.requirements[${index}].kind`,
        ),
        range: typeof requirement.range === "string" ? requirement.range : null,
        optional: requirement.optional === true,
      };
    }),
  };
}

function normalizePeers(value) {
  if (!Array.isArray(value)) throw new Error("plan material peers must be an array.");
  return value.map((peer, index) => {
    if (!isPlainObject(peer)) {
      throw new Error(`plan material peers[${index}] must be an object.`);
    }
    return {
      name: requireNonEmptyString(peer.name, `plan material peers[${index}].name`),
      kind: requireNonEmptyString(peer.kind, `plan material peers[${index}].kind`),
      range: typeof peer.range === "string" ? peer.range : null,
      optional: peer.optional === true,
      action: requireNonEmptyString(peer.action, `plan material peers[${index}].action`),
      version: normalizeOptionalString(peer.version, `plan material peers[${index}].version`),
      source: normalizeOptionalString(peer.source, `plan material peers[${index}].source`),
    };
  });
}

function normalizePreserved(value) {
  if (!Array.isArray(value)) throw new Error("plan material preserved must be an array.");
  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`plan material preserved[${index}] must be an object.`);
    }
    return {
      path: requireNonEmptyString(entry.path, `plan material preserved[${index}].path`),
      reason: requireNonEmptyString(entry.reason, `plan material preserved[${index}].reason`),
    };
  });
}

function normalizeDirectory(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) throw new Error("plan material directory must be an object or null.");
  return {
    path: requireNonEmptyString(value.path, "plan material directory.path"),
    changed: value.changed === true,
  };
}

function normalizeSwitchMaterial(source) {
  if (!isPlainObject(source.options)) throw new Error("plan material options must be an object.");
  return {
    materialVersion: LIFECYCLE_PLAN_MATERIAL_VERSION,
    action: "switch",
    consumerRoot: requireNonEmptyString(source.consumerRoot, "plan material consumerRoot"),
    options: {
      cssPath: normalizeOptionalString(source.options.cssPath, "plan material options.cssPath"),
      strict:
        source.options.strict === null || source.options.strict === undefined
          ? null
          : source.options.strict === true,
      ignore: normalizeStringArray(source.options.ignore, "plan material options.ignore"),
      withEntry: normalizeStringArray(source.options.withEntry, "plan material options.withEntry"),
      peers: normalizeStringArray(source.options.peers, "plan material options.peers"),
    },
    from: normalizeFromTo(source.from, "plan material from"),
    to: normalizeFromTo(source.to, "plan material to"),
    dependency: normalizeDependency(source.dependency),
    manager: requireNonEmptyString(source.manager, "plan material manager"),
    command: normalizeCommand(source.command),
    entrySelection: normalizeEntrySelection(source.entrySelection),
    peers: normalizePeers(source.peers),
    plannedChanges: normalizePlannedChanges(source.plannedChanges),
  };
}

function normalizeRemoveMaterial(source) {
  if (!isPlainObject(source.options)) throw new Error("plan material options must be an object.");
  return {
    materialVersion: LIFECYCLE_PLAN_MATERIAL_VERSION,
    action: "remove",
    consumerRoot: requireNonEmptyString(source.consumerRoot, "plan material consumerRoot"),
    options: {
      cssPath: normalizeOptionalString(source.options.cssPath, "plan material options.cssPath"),
    },
    from: normalizeFromTo(source.from, "plan material from"),
    package: requireNonEmptyString(source.package, "plan material package"),
    dependency: normalizeDependency(source.dependency),
    manager: requireNonEmptyString(source.manager, "plan material manager"),
    command: normalizeCommand(source.command),
    plannedChanges: normalizePlannedChanges(source.plannedChanges),
    preserved: normalizePreserved(source.preserved),
    directory: normalizeDirectory(source.directory),
  };
}

/**
 * Normalize an `expectedPlan` value into the stable plan material.
 *
 * Accepts either a successful plan result (the object returned by a `dryRun`
 * preview or a real run, which carries `planMaterial`) or an already-built
 * material object. Any other shape throws a precise error; callers surface it
 * as a `plan-drift` refusal with zero effects.
 *
 * @param {unknown} value A plan result or plan material object.
 * @returns {object} A fresh, structurally validated material object.
 */
export function buildLifecyclePlanMaterial(value) {
  if (!isPlainObject(value)) {
    throw new Error("the expected plan must be a plan result or a plan material object.");
  }
  if (Object.prototype.hasOwnProperty.call(value, "ok") && value.ok !== true) {
    throw new Error("the expected plan must come from a successful plan preview.");
  }
  const source = isPlainObject(value.planMaterial) ? value.planMaterial : value;
  if (!isPlainObject(source)) {
    throw new Error("the expected plan result has no stable plan material.");
  }
  if (source.materialVersion !== LIFECYCLE_PLAN_MATERIAL_VERSION) {
    throw new Error(
      `unsupported plan material version ${JSON.stringify(
        source.materialVersion ?? null,
      )}; expected ${LIFECYCLE_PLAN_MATERIAL_VERSION}.`,
    );
  }
  if (source.action === "switch") return normalizeSwitchMaterial(source);
  if (source.action === "remove") return normalizeRemoveMaterial(source);
  throw new Error(
    `unsupported plan action ${JSON.stringify(
      source.action ?? null,
    )}; expected "switch" or "remove".`,
  );
}

function shortJson(value, limit = 160) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (typeof text !== "string") text = String(text);
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

/**
 * Compare an expected plan material against a freshly derived one. Returns
 * precise, human-readable differences; an empty array means the plan is
 * materially identical.
 */
export function diffLifecyclePlanMaterial(expected, actual) {
  const details = [];
  const add = (message) => {
    if (details.length < 30) details.push(message);
  };
  if (expected.action !== actual.action) {
    add(`action changed (${expected.action} -> ${actual.action})`);
  }
  if (expected.consumerRoot !== actual.consumerRoot) {
    add(`consumer root changed (${expected.consumerRoot} -> ${actual.consumerRoot})`);
  }
  const sections = [
    ["options", expected.options, actual.options],
    ["source system", expected.from, actual.from],
    ...(expected.action === "switch" ? [["target release", expected.to, actual.to]] : []),
    ["dependency state", expected.dependency, actual.dependency],
    ...(expected.action === "switch"
      ? [
          ["selected entry", expected.entrySelection, actual.entrySelection],
          ["planned peers", expected.peers, actual.peers],
        ]
      : [
          ["preserved files", expected.preserved, actual.preserved],
          ["directory decision", expected.directory, actual.directory],
        ]),
  ];
  for (const [label, left, right] of sections) {
    if (!isDeepStrictEqual(left, right)) {
      add(`${label} changed: ${shortJson(left)} -> ${shortJson(right)}`);
    }
  }
  if (expected.manager !== actual.manager) {
    add(`package manager changed (${expected.manager} -> ${actual.manager})`);
  }
  if (
    expected.command.manager !== actual.command.manager ||
    expected.command.verb !== actual.command.verb ||
    !isDeepStrictEqual(expected.command.args, actual.command.args)
  ) {
    add(
      `package-manager command changed: ${shortJson(expected.command)} -> ${shortJson(
        actual.command,
      )}`,
    );
  }
  const expectedChanges = expected.plannedChanges;
  const actualChanges = actual.plannedChanges;
  if (expectedChanges.length !== actualChanges.length) {
    add(`planned file change count changed (${expectedChanges.length} -> ${actualChanges.length})`);
  }
  const count = Math.min(expectedChanges.length, actualChanges.length);
  let reported = 0;
  for (let index = 0; index < count && reported < 10; index += 1) {
    const before = expectedChanges[index];
    const after = actualChanges[index];
    const fields = [];
    for (const field of ["kind", "fileKind", "path", "changed", "before", "after"]) {
      if (!isDeepStrictEqual(before[field], after[field])) fields.push(field);
    }
    if (fields.length > 0) {
      reported += 1;
      add(
        `planned change ${index + 1} (${before.path ?? before.kind}) changed: ${fields.join(", ")}`,
      );
    }
  }
  return details;
}

/** Build the stable switch material from the exact planned decisions. */
function buildSwitchPlanMaterial({
  consumerRoot,
  options,
  from,
  to,
  dependency,
  manager,
  command,
  entrySelection,
  peers,
  plannedChanges,
}) {
  return {
    materialVersion: LIFECYCLE_PLAN_MATERIAL_VERSION,
    action: "switch",
    consumerRoot,
    options,
    from,
    to,
    dependency,
    manager,
    command: { manager: command.manager, verb: command.verb, args: [...command.args] },
    entrySelection: {
      requested: [...entrySelection.requested],
      entries: entrySelection.entries.map((entry) => ({
        requested: entry.requested,
        kind: entry.kind,
        extension: entry.extension ?? null,
        entrypoint: entry.entrypoint ?? null,
        selectedEntrypoints: [...(entry.selectedEntrypoints ?? [])],
        selectedExtensions: [...(entry.selectedExtensions ?? [])],
        source: entry.source ?? null,
      })),
      requirements: entrySelection.requirements.map((requirement) => ({
        name: requirement.name,
        kind: requirement.kind,
        range: requirement.range,
        optional: requirement.optional === true,
      })),
    },
    peers: peers.map((peer) => ({
      name: peer.name,
      kind: peer.kind,
      range: peer.range,
      optional: peer.optional === true,
      action: peer.action,
      version: peer.version ?? null,
      source: peer.source ?? null,
    })),
    plannedChanges: plannedChanges
      .filter((change) => typeof change.path === "string")
      .map((change) => ({
        kind: change.kind,
        fileKind: change.fileKind ?? null,
        path: change.path,
        changed: change.changed === true,
        before: change.before ?? null,
        after: change.after ?? null,
      })),
  };
}

/** Build the stable remove material from the exact planned decisions. */
function buildRemovePlanMaterial({
  consumerRoot,
  options,
  package: packageName,
  from,
  dependency,
  manager,
  command,
  plannedChanges,
  preserved,
  directory,
}) {
  return {
    materialVersion: LIFECYCLE_PLAN_MATERIAL_VERSION,
    action: "remove",
    consumerRoot,
    options,
    package: packageName,
    from,
    dependency,
    manager,
    command: { manager: command.manager, verb: command.verb, args: [...command.args] },
    plannedChanges: plannedChanges
      .filter((change) => typeof change.path === "string")
      .map((change) => ({
        kind: change.kind,
        fileKind: change.fileKind ?? null,
        path: change.path,
        changed: change.changed === true,
        before: change.before ?? null,
        after: change.after ?? null,
      })),
    preserved: preserved.map((entry) => ({ path: entry.path, reason: entry.reason })),
    directory:
      directory === null || directory === undefined
        ? null
        : { path: directory.path, changed: directory.changed === true },
  };
}

/**
 * Normalize explicit `--with-entry` values (a single string or an array) into
 * an ordered, unique, non-empty list. Invalid values keep failing closed with
 * the same message the entry planner uses.
 */
function normalizeExplicitEntries(values) {
  const list =
    values === undefined || values === null ? [] : Array.isArray(values) ? values : [values];
  const entries = [];
  for (const raw of list) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error("--with-entry/--entry requires a non-empty path or extension name.");
    }
    const text = raw.trim();
    if (!entries.includes(text)) entries.push(text);
  }
  return entries;
}

/**
 * Extensions the active-usage scan verified as literally imported/rendered,
 * deduplicated by name in first-seen order. Compatibility assessment runs
 * before planning and blocks any used extension that the target does not
 * declare with the same entrypoint, so every returned name is safe to select.
 */
function usedExtensionEntries(usage) {
  const sites = Array.isArray(usage?.extensions) ? usage.extensions : [];
  const byName = new Map();
  for (const site of sites) {
    if (byName.has(site.name)) continue;
    byName.set(site.name, {
      name: site.name,
      entrypoint: typeof site.entrypoint === "string" ? site.entrypoint : null,
      source: "active-usage",
      file: typeof site.file === "string" ? site.file : null,
      line: Number.isInteger(site.line) ? site.line : null,
    });
  }
  return [...byName.values()];
}

/** Material option block for a switch plan. */
function switchOptionsMaterial({ usage, strict, ignore, withEntry, peerSpecs }) {
  return {
    cssPath: usage.cssFile === null || usage.cssFile === undefined ? null : usage.cssFile.path,
    strict: strict === undefined || strict === null ? null : strict === true,
    ignore: Array.isArray(ignore) ? ignore.map((entry) => String(entry)) : [],
    withEntry: [...withEntry],
    peers: parsePeerOverrides(peerSpecs).map((peer) => `${peer.name}@${peer.version}`),
  };
}

/** Consistent `plan-drift` refusal with zero effects. */
function planDriftResult({ failures, dryRun = false, extra = {} }) {
  return {
    ok: false,
    boundary: "plan-drift",
    reason: "plan-drift",
    failures,
    plannedChanges: [],
    dryRun,
    ...extra,
  };
}

/* -------------------------------------------------------------------------- */
/* Compatibility                                                              */
/* -------------------------------------------------------------------------- */

function coverageOf(usage, targetTokens) {
  return {
    filesScanned: usage.counts.sourceFiles,
    unsupportedFiles: usage.counts.unsupportedFiles,
    skippedFiles: usage.skipped.length,
    moduleReferences: usage.counts.moduleReferences,
    components: usage.counts.components,
    variants: usage.counts.variants,
    sizes: usage.counts.sizes,
    members: usage.counts.members,
    extensions: usage.counts.extensions,
    unverified: usage.counts.unverified,
    tokenReferences: usage.counts.tokenReferences,
    publicApiAccesses: usage.counts.publicApiAccesses,
    cssImports: usage.counts.cssImports,
    cssFile: usage.cssFile === null ? null : usage.cssFile.relativePath,
    targetTokensCompared: targetTokens !== null,
    limitations: ACTIVE_USAGE_LIMITATIONS,
  };
}

/**
 * Decide whether the scanned current usage can be carried by the validated
 * target manifest. Every missing used API is a blocker; unverifiable
 * dynamic/computed usage is a blocker; token value differences are warnings
 * because token values cannot be compared.
 */
export function assessSwitchCompatibility({ usage, targetManifest, fromPackage, toPackage } = {}) {
  const targetModel = buildUsageModel(targetManifest);
  const targetTokens = buildTokenIndex(targetManifest);
  const blockers = [];
  const warnings = [];
  const pushBlocker = (code, message, site = {}) => {
    blockers.push({
      code,
      message,
      ...(site.file ? { file: site.file } : {}),
      ...(site.line ? { line: site.line } : {}),
    });
  };
  const where = (site) => `${site.file}:${site.line}`;

  for (const reference of usage.moduleReferences) {
    if (!reference.declared) {
      pushBlocker(
        "undeclared-public-path",
        `"${reference.specifier}" (${where(reference)}) is not a declared public path of "${fromPackage}".`,
        reference,
      );
      continue;
    }
    if (!targetModel.publicPaths.has(reference.subpath)) {
      pushBlocker(
        "missing-public-path",
        `"${reference.specifier}" (${where(reference)}) has no equivalent declared public path on "${toPackage}".`,
        reference,
      );
      continue;
    }
    if (!reference.rewritable) {
      pushBlocker(
        "unverifiable-specifier",
        `The module specifier "${reference.specifier}" at ${where(reference)} cannot be safely rewritten.`,
        reference,
      );
    }
    if (reference.star) {
      pushBlocker(
        "unverified-star-export",
        `\`export * from "${reference.specifier}"\` (${where(reference)}) cannot be verified against "${toPackage}".`,
        reference,
      );
    }
    if (reference.defaultName) {
      pushBlocker(
        "unverified-default-import",
        `Default import of "${reference.specifier}" (${where(reference)}) cannot be verified against "${toPackage}".`,
        reference,
      );
    }
    if (reference.entrypoint !== null) {
      const api = targetModel.publicApi.get(reference.entrypoint);
      for (const name of reference.names) {
        if (name.typeOnly) continue;
        if (Array.isArray(api) && api.includes(name.imported)) continue;
        pushBlocker(
          "missing-named-export",
          `Import of "${name.imported}" from "${reference.specifier}" (${where(reference)}) is not declared in the "${toPackage}" public API.`,
          reference,
        );
      }
    }
  }

  for (const site of usage.components) {
    if (!targetModel.components.has(site.name)) {
      pushBlocker(
        "missing-component",
        `Component "${site.name}" used at ${where(site)} is not declared by "${toPackage}".`,
        site,
      );
    }
  }
  for (const site of usage.variants) {
    const target = targetModel.components.get(site.component);
    if (target === undefined) continue;
    if (!target.variants.includes(site.value)) {
      pushBlocker(
        "missing-variant",
        `Variant "${site.value}" of "${site.component}" used at ${where(site)} is not declared by "${toPackage}".`,
        site,
      );
    }
  }
  for (const site of usage.sizes) {
    const target = targetModel.components.get(site.component);
    if (target === undefined) continue;
    if (!target.sizes.includes(site.value)) {
      pushBlocker(
        "missing-size",
        `Size "${site.value}" of "${site.component}" used at ${where(site)} is not declared by "${toPackage}".`,
        site,
      );
    }
  }
  for (const site of usage.members) {
    const target = targetModel.components.get(site.component);
    if (target === undefined) continue;
    if (!target.members.includes(site.member)) {
      pushBlocker(
        "missing-member",
        `Compound member "${site.component}.${site.member}" used at ${where(site)} is not declared by "${toPackage}".`,
        site,
      );
    }
  }
  for (const site of usage.extensions) {
    const target = targetModel.extensions.get(site.name);
    if (target === undefined) {
      pushBlocker(
        "missing-extension",
        `Extension "${site.name}" used at ${where(site)} is not declared by "${toPackage}".`,
        site,
      );
    } else if (site.entrypoint !== null && target.entrypoint !== site.entrypoint) {
      pushBlocker(
        "changed-extension-entrypoint",
        `Extension "${site.name}" moved from "${site.entrypoint}" to "${target.entrypoint}" and cannot be rewritten automatically (${where(site)}).`,
        site,
      );
    }
  }
  for (const item of usage.unverified) {
    pushBlocker(item.code, item.message, item);
  }

  if (usage.tokenReferences.length > 0) {
    if (targetTokens === null) {
      pushBlocker(
        "tokens-unavailable",
        `The "${toPackage}" token catalog is not readable; token references cannot be verified.`,
      );
    } else {
      for (const reference of usage.tokenReferences) {
        const target = targetTokens.byName.get(reference.name);
        if (target === undefined) {
          pushBlocker(
            "missing-token",
            `Token "${reference.name}" referenced as "${reference.raw}" at ${where(reference)} is not declared by "${toPackage}".`,
            reference,
          );
          continue;
        }
        const sameReference =
          reference.kind === "css-var"
            ? target.cssVariable === reference.raw || target.tailwind?.variable === reference.raw
            : target.tailwind?.utility === reference.raw;
        if (!sameReference) {
          pushBlocker(
            "renamed-token-reference",
            `Token "${reference.name}" is referenced as "${reference.raw}" at ${where(reference)}; "${toPackage}" spells it differently and token references are never rewritten.`,
            reference,
          );
          continue;
        }
        warnings.push({
          code: "appearance-unknown",
          message: `Token "${reference.name}" exists in "${toPackage}", but token values cannot be compared; visual appearance may change (${where(reference)}).`,
          file: reference.file,
          line: reference.line,
        });
      }
    }
  }
  for (const access of usage.publicApiAccesses) {
    warnings.push({
      code: "appearance-unknown",
      message: `Token object access "${access.imported}.${access.member}" at ${where(access)} cannot be value-checked; visual appearance may change.`,
      file: access.file,
      line: access.line,
    });
  }
  if (usage.cssFile !== null && usage.cssFile.imports.length === 0) {
    warnings.push({
      code: "css-bridge-not-found",
      message:
        `No "${fromPackage}" bridge imports were found in ${usage.cssFile.relativePath}; ` +
        "the target bridge was not added (run setup-tailwind to add it explicitly).",
    });
  }
  if (usage.skipped.length > 0) {
    warnings.push({
      code: "scan-skipped-files",
      message: `${usage.skipped.length} source file(s) were skipped by the bounded scanner; they were not verified.`,
    });
  }
  warnings.push({
    code: "old-dependency-retained",
    message: `The previous design system "${fromPackage}" is not uninstalled; both dependencies remain after the switch.`,
  });
  warnings.push({
    code: "source-rewrites-limited",
    message:
      "Only exact literal package-prefix module specifiers and explicit-CSS imports are rewritten; " +
      "JSX, props, token references, and all other source are never transformed.",
  });

  return { blockers, warnings, coverage: coverageOf(usage, targetTokens) };
}

/* -------------------------------------------------------------------------- */
/* Preconditions                                                              */
/* -------------------------------------------------------------------------- */

function verifySwitchPreconditions({ consumerRoot, packageName, version, dependency, files }) {
  const failures = [];
  try {
    const packageJson = readConsumerPackageJson(consumerRoot);
    const current = dependencyOf(packageJson.json, packageName);
    if (current === null) {
      failures.push(`Dependency "${packageName}" is no longer declared in ${packageJson.path}.`);
    } else if (current.spec !== dependency.spec || current.section !== dependency.section) {
      failures.push(
        `Dependency "${packageName}" changed from ${dependency.section} "${dependency.spec}" to ` +
          `${current.section} "${current.spec}".`,
      );
    }
  } catch (error) {
    failures.push(error.message);
  }
  for (const file of files) {
    if (readFileOrNull(file.path) !== file.before) {
      failures.push(`Planned file changed after preview: ${file.path}.`);
    }
  }
  try {
    const installed = resolveInstalledDesignSystem({ consumerRoot, packageName });
    verifyConsumerDesignSystem({ packageName, expectedVersion: version, installed });
  } catch (error) {
    failures.push(
      `The selected design system "${packageName}@${version}" is no longer verifiable: ${error.message}`,
    );
  }
  return failures;
}

/* -------------------------------------------------------------------------- */
/* inspectDesignSystemUsage                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Read-only active API usage report for the currently selected design system.
 * Offline; never writes or spawns.
 */
export function inspectDesignSystemUsage({
  cwd,
  package: explicitPackage,
  cssPath,
  ignore = [],
} = {}) {
  let consumerRoot;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    return {
      ok: false,
      boundary: "consumer-root",
      reason: "invalid-consumer-root",
      failures: [error.message],
    };
  }
  let discovered;
  let installed;
  try {
    discovered = discoverConsumerPackage({ consumerRoot, explicitPackage });
    installed = resolveInstalledDesignSystem({
      consumerRoot,
      packageName: discovered.packageName,
    });
    verifyConsumerDesignSystem({
      packageName: discovered.packageName,
      expectedVersion: discovered.expectedVersion,
      installed,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "installed",
      reason: "installed-unverified",
      failures: [`The selected design system could not be verified: ${error.message}`],
    };
  }
  let usage;
  try {
    usage = scanActiveUsage({
      consumerRoot,
      packageName: discovered.packageName,
      manifest: installed.manifest,
      cssPath,
      ignoreGlobs: ignore,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "scan",
      reason: "scan-failed",
      failures: [error.message],
      package: discovered.packageName,
      version: installed.packageJson.version,
    };
  }
  return {
    ok: true,
    reason: null,
    failures: [],
    package: discovered.packageName,
    version: installed.packageJson.version,
    source: discovered.source,
    usage,
    summary:
      `Scanned ${usage.counts.sourceFiles} file(s) for active usage of ` +
      `${discovered.packageName}@${installed.packageJson.version}: ` +
      `${usage.counts.moduleReferences} module reference(s), ${usage.counts.components} component ` +
      `use(s), ${usage.counts.tokenReferences} token reference(s), ${usage.counts.unverified} ` +
      "unverified case(s).",
  };
}

/* -------------------------------------------------------------------------- */
/* switchDesignSystem                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Switch the consumer to an exact, registry-validated design-system version.
 *
 * Options mirror the catalog lifecycle naming: `cwd`, `package`, `version`,
 * `registry`, `fetchImpl`, `spawnImpl`, `stdio`, `dryRun`, `cssPath`,
 * `withEntry`, `peers`, `strict`, `ignore`. `confirmed: true` is required for
 * any dependency or file mutation; without it (or on a dry run) the exact plan
 * is returned and nothing is spawned or written.
 *
 * `expectedPlan` is the optional TUI/CLI execution precondition: the previous
 * successful plan result (or its `planMaterial`, see
 * {@link buildLifecyclePlanMaterial}). When supplied on a confirmed run, the
 * previewed action, consumer root, options, source/target manifest identity,
 * dependency state, manager, fixed command, selected entry/peers, and the exact
 * planned file bytes are re-derived and compared before any spawn or write; any
 * drift, tampering, or target/option conflict fails closed with
 * `boundary: "plan-drift"` and zero effects. An omitted target `version` is
 * frozen to the preview's resolved exact release.
 */
export async function switchDesignSystem({
  cwd,
  package: target,
  version,
  registry,
  fetchImpl,
  spawnImpl,
  stdio = "inherit",
  dryRun = false,
  confirmed = false,
  cssPath,
  withEntry = [],
  peers: peerSpecs = [],
  strict,
  ignore = [],
  writeImpl,
  expectedPlan,
} = {}) {
  let expectedMaterial = null;
  if (dryRun !== true && expectedPlan !== undefined && expectedPlan !== null) {
    try {
      expectedMaterial = buildLifecyclePlanMaterial(expectedPlan);
    } catch (error) {
      return planDriftResult({
        failures: [`The supplied expected plan cannot be used: ${error.message}`],
      });
    }
    if (expectedMaterial.action !== "switch") {
      return planDriftResult({
        failures: [
          `The supplied expected plan is a "${expectedMaterial.action}" plan, not a switch plan.`,
        ],
      });
    }
  }

  let consumerRoot;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    return {
      ok: false,
      boundary: "consumer-root",
      reason: "invalid-consumer-root",
      failures: [error.message],
      dryRun,
    };
  }
  if (expectedMaterial !== null && expectedMaterial.consumerRoot !== consumerRoot) {
    return planDriftResult({
      failures: [
        `The supplied expected plan was created for ${expectedMaterial.consumerRoot}; this run ` +
          `targets ${consumerRoot}.`,
      ],
    });
  }

  if (expectedMaterial !== null) {
    const requestedVersion = typeof version === "string" ? version.trim() : "";
    if (requestedVersion !== "" && requestedVersion !== expectedMaterial.to.version) {
      return planDriftResult({
        failures: [
          `Requested version ${JSON.stringify(
            requestedVersion,
          )} conflicts with the expected plan's exact target ` +
            `${JSON.stringify(expectedMaterial.to.version)}.`,
        ],
      });
    }
    let requestedPackage = null;
    try {
      requestedPackage = normalizeRequestedPackage(target);
    } catch {
      requestedPackage = null;
    }
    if (requestedPackage !== null && requestedPackage !== expectedMaterial.to.package) {
      return planDriftResult({
        failures: [
          `The requested target "${requestedPackage}" conflicts with the expected plan's target ` +
            `"${expectedMaterial.to.package}".`,
        ],
      });
    }
  }
  const frozenVersion =
    typeof version === "string" && version.trim() !== ""
      ? version
      : expectedMaterial !== null
        ? expectedMaterial.to.version
        : version;

  let info;
  try {
    info = await fetchDesignSystemInfo({
      package: target,
      version: frozenVersion,
      registry,
      fetchImpl,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "registry",
      reason: "target-unresolved",
      failures: [error.message],
      dryRun,
    };
  }
  if (expectedMaterial !== null) {
    if (expectedMaterial.to.package !== info.package) {
      return planDriftResult({
        failures: [
          `The supplied expected plan targets "${expectedMaterial.to.package}", but this run ` +
            `resolved "${info.package}".`,
        ],
      });
    }
    if (expectedMaterial.to.version !== info.version) {
      return planDriftResult({
        failures: [
          `The supplied expected plan froze target version "${expectedMaterial.to.version}", ` +
            `but this run resolved "${info.version}".`,
        ],
      });
    }
    if (
      expectedMaterial.to.manifest !== null &&
      expectedMaterial.to.manifest.digest !== manifestDigest(info.manifest)
    ) {
      return planDriftResult({
        failures: [
          `The target manifest for "${info.package}@${info.version}" changed after the preview; ` +
            "the reviewed plan no longer matches the registry release.",
        ],
      });
    }
  }
  const to = { package: info.package, version: info.version, registry: info.registry };

  let discovered;
  let installed;
  try {
    discovered = discoverConsumerPackage({ consumerRoot });
    installed = resolveInstalledDesignSystem({
      consumerRoot,
      packageName: discovered.packageName,
    });
    verifyConsumerDesignSystem({
      packageName: discovered.packageName,
      expectedVersion: discovered.expectedVersion,
      installed,
    });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          "The expected plan can no longer be reproduced: the selected design system could not " +
            `be verified (${error.message}).`,
        ],
        extra: { to },
      });
    }
    return {
      ok: false,
      boundary: "installed",
      reason: "installed-unverified",
      failures: [`The selected design system could not be verified: ${error.message}`],
      to,
      dryRun,
    };
  }
  const from = {
    package: discovered.packageName,
    version: installed.packageJson.version,
    source: discovered.source,
  };
  if (expectedMaterial !== null) {
    if (expectedMaterial.from.package !== from.package) {
      return planDriftResult({
        failures: [
          `The selected design system changed from "${expectedMaterial.from.package}" to ` +
            `"${from.package}" after the preview.`,
        ],
      });
    }
    if (expectedMaterial.from.version !== from.version) {
      return planDriftResult({
        failures: [
          `The selected design system version changed from "${expectedMaterial.from.version}" ` +
            `to "${from.version}" after the preview.`,
        ],
      });
    }
    if (
      expectedMaterial.from.manifest !== null &&
      expectedMaterial.from.manifest.digest !== manifestDigest(installed.manifest)
    ) {
      return planDriftResult({
        failures: [
          `The installed manifest for "${from.package}@${from.version}" changed after the ` +
            "preview; the reviewed plan no longer matches the installed system.",
        ],
      });
    }
  }

  let usage;
  try {
    usage = scanActiveUsage({
      consumerRoot,
      packageName: from.package,
      manifest: installed.manifest,
      cssPath,
      ignoreGlobs: ignore,
      targetPackage: to.package,
    });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          "The expected plan can no longer be reproduced: active usage could not be scanned " +
            `(${error.message}).`,
        ],
        extra: { from, to },
      });
    }
    return {
      ok: false,
      boundary: "scan",
      reason: "scan-failed",
      failures: [error.message],
      from,
      to,
      dryRun,
    };
  }

  const compatibility = assessSwitchCompatibility({
    usage,
    targetManifest: info.manifest,
    fromPackage: from.package,
    toPackage: to.package,
  });
  if (compatibility.blockers.length > 0) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          "The expected plan is no longer executable: current active usage is incompatible with " +
            `"${to.package}".`,
          ...compatibility.blockers.map((blocker) => blocker.message),
        ],
        extra: { from, to, compatibility, usage },
      });
    }
    return {
      ok: false,
      boundary: "compatibility",
      reason: "incompatible-usage",
      failures: compatibility.blockers.map((blocker) => blocker.message),
      from,
      to,
      compatibility,
      usage,
      plannedChanges: [],
      dryRun,
    };
  }

  let entryPlan;
  let explicitEntries = [];
  let autoSelectedEntries = [];
  try {
    explicitEntries = normalizeExplicitEntries(withEntry);
    const explicitSet = new Set(explicitEntries);
    autoSelectedEntries = usedExtensionEntries(usage).filter(
      (entry) => !explicitSet.has(entry.name),
    );
    // Verified used extensions are planned exactly like an explicit
    // `--with-entry`, so a declared requirement of an imported extension can
    // never be skipped. The conservative root/tokens defaults stay selected
    // only when no entry was given explicitly, preserving the previous
    // no-flag behavior.
    entryPlan = planEntryAndPeers({
      consumerRoot,
      packageName: to.package,
      manifest: info.manifest,
      entries: [
        ...explicitEntries,
        ...autoSelectedEntries.map((entry) => entry.name),
        ...(explicitEntries.length === 0 ? DEFAULT_ENTRYPOINT_KEYS : []),
      ],
      peerSpecs,
    });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: entry/peer planning failed (${error.message}).`,
        ],
        extra: { from, to },
      });
    }
    return {
      ok: false,
      boundary: "entry",
      reason: "entry-plan-failed",
      failures: [error.message],
      from,
      to,
      compatibility,
      usage,
      autoSelectedEntries,
      dryRun,
    };
  }
  const entrySelection = entryPlan.selection;
  const peers = entryPlan.peers;

  let detection;
  try {
    detection = detectPackageManager({ consumerRoot });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: package-manager detection failed (${error.message}).`,
        ],
        extra: { from, to },
      });
    }
    return {
      ok: false,
      boundary: "package-manager",
      reason: "manager-detection-failed",
      failures: [error.message],
      from,
      to,
      compatibility,
      usage,
      entrySelection,
      peers,
      dryRun,
    };
  }

  let command;
  try {
    command = buildInstallCommand({
      manager: detection.manager,
      packageName: to.package,
      version: to.version,
      saveDev: false,
      exact: false,
      registry: info.registry,
      extraPackages: peers
        .filter((peer) => peer.action === "install")
        .map((peer) => `${peer.name}@${peer.version}`),
    });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: the fixed install command could not be built (${error.message}).`,
        ],
        extra: { from, to },
      });
    }
    return {
      ok: false,
      boundary: "command",
      reason: "command-build-failed",
      failures: [error.message],
      from,
      to,
      manager: detection.manager,
      compatibility,
      usage,
      entrySelection,
      peers,
      dryRun,
    };
  }

  let connectPlan;
  try {
    connectPlan = planConnectForTarget({
      consumerRoot,
      package: to.package,
      version: to.version,
      manifest: info.manifest,
      strict,
    });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: the connect plan failed (${error.message}).`,
        ],
        extra: { from, to },
      });
    }
    return {
      ok: false,
      boundary: "plan",
      reason: "connect-plan-failed",
      failures: [error.message],
      from,
      to,
      manager: detection.manager,
      command,
      compatibility,
      usage,
      entrySelection,
      peers,
      dryRun,
    };
  }

  let dependency;
  try {
    const packageJson = readConsumerPackageJson(consumerRoot);
    dependency = dependencyOf(packageJson.json, from.package);
    if (dependency === null) {
      throw new Error(
        `The selected design system "${from.package}" is not declared in ${packageJson.path}; ` +
          "switch requires the current dependency to remain declared.",
      );
    }
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: the current dependency state could not be read (${error.message}).`,
        ],
        extra: { from, to },
      });
    }
    return {
      ok: false,
      boundary: "dependency",
      reason: "dependency-precondition",
      failures: [error.message],
      from,
      to,
      manager: detection.manager,
      command,
      compatibility,
      usage,
      entrySelection,
      peers,
      dryRun,
    };
  }

  const sourceChanges = (usage.rewrites ?? []).map((rewrite) => ({
    kind: rewrite.kind,
    path: rewrite.path,
    changed: rewrite.before !== rewrite.after,
    before: rewrite.before,
    after: rewrite.after,
  }));
  const plannedChanges = [
    { kind: "dependency", manager: detection.manager, command },
    ...sourceChanges,
    ...connectPlanChanges(connectPlan),
  ];
  const preconditionFiles = plannedChanges
    .filter((change) => typeof change.path === "string")
    .map((change) => ({ path: change.path, before: change.before }));

  const planMaterial = buildSwitchPlanMaterial({
    consumerRoot,
    options: switchOptionsMaterial({
      usage,
      strict,
      ignore,
      withEntry: explicitEntries,
      peerSpecs,
    }),
    from: {
      package: from.package,
      version: from.version,
      manifest: manifestIdentity(installed.manifest),
    },
    to: {
      package: to.package,
      version: to.version,
      manifest: manifestIdentity(info.manifest),
    },
    dependency: { package: from.package, section: dependency.section, spec: dependency.spec },
    manager: detection.manager,
    command,
    entrySelection,
    peers,
    plannedChanges,
  });

  if (expectedMaterial !== null) {
    const differences = diffLifecyclePlanMaterial(expectedMaterial, planMaterial);
    if (differences.length > 0) {
      return planDriftResult({
        failures: [
          "Refusing to switch: the supplied expected plan no longer matches the current plan.",
          ...differences,
          "No dependency or file changes were made; preview again and confirm the new plan.",
        ],
        extra: { from, to, compatibility, usage, planMaterial },
      });
    }
  }

  const base = {
    consumerRoot,
    from,
    to,
    manager: detection.manager,
    managerSource: detection.source,
    command,
    entrySelection,
    autoSelectedEntries,
    peers,
    compatibility,
    usage,
    connectPlan,
    plannedChanges,
    planMaterial,
    dryRun,
  };

  if (dryRun) {
    return { ok: true, dryRun: true, changed: false, reason: "dry-run", failures: [], ...base };
  }
  if (confirmed !== true) {
    return {
      ok: false,
      boundary: "confirmation-required",
      reason: "confirmation-required",
      failures: [
        "switch requires explicit confirmation; re-run with --yes. No dependency or file " +
          "changes were made.",
      ],
      ...base,
    };
  }

  const preSpawnFailures = verifySwitchPreconditions({
    consumerRoot,
    packageName: from.package,
    version: from.version,
    dependency,
    files: preconditionFiles,
  });
  if (preSpawnFailures.length > 0) {
    return {
      ok: false,
      boundary: "precondition",
      reason: "drift",
      failures: [
        "Refusing to switch: consumer state changed after planning.",
        ...preSpawnFailures,
        "No dependency or file changes were made; preview again.",
      ],
      ...base,
    };
  }

  let spawnResult;
  try {
    spawnResult = spawnInstall({
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
      reason: "manager-spawn-failed",
      failures: [error.message],
      note: "No file changes were made; the package manager was not started.",
      ...base,
    };
  }
  if (spawnResult.status !== 0) {
    return {
      ok: false,
      boundary: "manager",
      reason: "manager-failed",
      failures: [`${detection.manager} exited with code ${spawnResult.status ?? "unknown"}.`],
      note:
        "The package manager exited non-zero before any file writes. No files were changed; " +
        "the previous design system remains selected. No rollback was attempted.",
      ...base,
    };
  }

  try {
    const installedTarget = resolveInstalledDesignSystem({
      consumerRoot,
      packageName: to.package,
    });
    verifyConsumerDesignSystem({
      packageName: to.package,
      expectedVersion: to.version,
      installed: installedTarget,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "verify",
      reason: "target-unverified",
      failures: [`Installed target verification failed: ${error.message}`],
      note:
        `"${to.package}@${to.version}" was not verified after the manager exited; no files were ` +
        "changed. No rollback was attempted; inspect the consumer dependency state.",
      ...base,
    };
  }

  const peerFailures = verifyPeerInstallations({ consumerRoot, peers });
  if (peerFailures.length > 0) {
    return {
      ok: false,
      boundary: "verify-peer",
      reason: "peer-unverified",
      failures: peerFailures,
      note: "No files were changed; no rollback was attempted.",
      ...base,
    };
  }

  const preWriteFailures = verifySwitchPreconditions({
    consumerRoot,
    packageName: from.package,
    version: from.version,
    dependency,
    files: preconditionFiles,
  });
  if (preWriteFailures.length > 0) {
    return {
      ok: false,
      boundary: "precondition",
      reason: "drift-after-install",
      failures: [
        "Refusing to write files: consumer state changed while the package manager ran.",
        ...preWriteFailures,
      ],
      note:
        `"${to.package}@${to.version}" was installed and verified, but no files were written. ` +
        "The previous design system remains selected. No rollback of the manager was attempted.",
      ...base,
    };
  }

  const applied = applyFileChanges({
    consumerRoot,
    entries: plannedChanges.filter((change) => typeof change.path === "string"),
    writeImpl,
  });
  if (!applied.ok) {
    return {
      ok: false,
      boundary: "write",
      reason: "write-failed",
      failures: [`File writes failed: ${applied.error.message}`],
      written: applied.written,
      rolledBack: applied.rolledBack,
      failed: applied.failed,
      remaining: applied.remaining,
      note:
        `"${to.package}@${to.version}" was installed and verified. This command's file writes ` +
        "were rolled back where possible; the previous design system remains selected. No " +
        "rollback of the package manager was attempted.",
      ...base,
    };
  }

  const postFailures = verifyWrittenBytes(
    plannedChanges.filter((change) => typeof change.path === "string"),
  );
  try {
    const packageJson = readConsumerPackageJson(consumerRoot);
    if (dependencyOf(packageJson.json, from.package) === null) {
      postFailures.push(`Dependency "${from.package}" is no longer declared after the switch.`);
    }
  } catch (error) {
    postFailures.push(error.message);
  }
  if (postFailures.length > 0) {
    return {
      ok: false,
      boundary: "postcheck",
      reason: "postcheck-failed",
      failures: postFailures,
      written: applied.written,
      note:
        `"${to.package}@${to.version}" was installed and the planned files were written, but ` +
        "the post-check reported differences. Review the listed files and the consumer " +
        "dependency state; no automatic rollback was attempted.",
      ...base,
    };
  }

  return {
    ok: true,
    dryRun: false,
    changed: true,
    reason: null,
    failures: [],
    ...base,
    install: {
      manager: detection.manager,
      package: to.package,
      version: to.version,
      registry: info.registry,
      command,
    },
    written: applied.written,
  };
}

/* -------------------------------------------------------------------------- */
/* removeDesignSystem                                                         */
/* -------------------------------------------------------------------------- */

/** Plan the managed-block strip only when the block is the exact generated one. */
function planManagedBlockRemoval(existing, expectedBlocks) {
  if (existing === null) return { after: null, changed: false, preserved: false, reason: null };
  const beginCount = countOccurrences(existing, MANAGED_BLOCK_BEGIN);
  const endCount = countOccurrences(existing, MANAGED_BLOCK_END);
  if (beginCount === 0 && endCount === 0) {
    return { after: existing, changed: false, preserved: false, reason: null };
  }
  if (beginCount !== 1 || endCount !== 1) {
    return {
      after: existing,
      changed: false,
      preserved: true,
      reason: "malformed-managed-markers",
    };
  }
  const begin = existing.indexOf(MANAGED_BLOCK_BEGIN);
  const end = existing.indexOf(MANAGED_BLOCK_END);
  if (end < begin) {
    return {
      after: existing,
      changed: false,
      preserved: true,
      reason: "malformed-managed-markers",
    };
  }
  const block = existing.slice(begin, end + MANAGED_BLOCK_END.length);
  if (!expectedBlocks.includes(block)) {
    return { after: existing, changed: false, preserved: true, reason: "edited-managed-block" };
  }
  let before = existing.slice(0, begin);
  let after = existing.slice(end + MANAGED_BLOCK_END.length);
  // The generated append writes `base + "\n" + block + "\n"`; remove the join
  // newline so the user content is restored (block at EOF with no trailing
  // newline is left byte-exact).
  if (after === "\n") {
    if (before.endsWith("\n")) before = before.slice(0, -1);
    after = "";
  }
  const result = `${before}${after}`;
  if (result.trim().length === 0) {
    return { after: null, changed: true, preserved: false, reason: null };
  }
  return { after: result, changed: true, preserved: false, reason: null };
}

/** Active usage that blocks removal, with precise paths and reasons. */
export function collectRemoveBlockers(usage) {
  const blockers = [];
  for (const reference of usage.moduleReferences) {
    if (reference.css && isBridgeSubpath(reference.subpath)) continue;
    blockers.push({
      code: reference.css ? "active-css-import" : "active-import",
      message:
        `Active ${reference.css ? "CSS " : ""}import "${reference.specifier}" at ` +
        `${reference.file}:${reference.line}; migrate or remove it before removing the package.`,
      file: reference.file,
      line: reference.line,
    });
  }
  for (const item of usage.unverified) {
    blockers.push({ code: item.code, message: item.message, file: item.file, line: item.line });
  }
  for (const reference of usage.tokenReferences) {
    blockers.push({
      code: "active-token-reference",
      message:
        `Active token reference "${reference.raw}" at ${reference.file}:${reference.line}; ` +
        "remove it before removing the package.",
      file: reference.file,
      line: reference.line,
    });
  }
  return blockers;
}

/**
 * Plan the generated-integration removal: only byte-identical generated files
 * are removed; every edited/malformed/unknown file is preserved and reported.
 */
function planRemoveIntegrations({
  consumerRoot,
  packageName,
  config,
  installedSystem,
  installedVersion,
  dependency,
  cssPath,
}) {
  const changes = [];
  const preserved = [];
  const warnings = [];
  const version =
    installedVersion ??
    config?.version ??
    (dependency !== null && isExactSemver(dependency.spec) ? dependency.spec : null);
  const strict = config !== null ? config.strict : true;
  const contractVersion = installedSystem?.manifest?.contractVersion ?? CONTRACT_VERSION;
  // Strict attribution: when the installed version is known, a config that
  // declares a different version is not the expected generated file and every
  // generated artifact is preserved rather than guessed at.
  const configMatchesInstalled =
    config === null || installedVersion === null || config.version === installedVersion;
  const expectedConfigs =
    version === null || !configMatchesInstalled
      ? []
      : [
          `${JSON.stringify(
            buildConsumerConfig({ packageName, version, strict, ignore: config?.ignore }),
            null,
            2,
          )}\n`,
        ];
  const expectedAgents =
    version === null || !configMatchesInstalled
      ? []
      : [renderConsumerAgents({ packageName, version, strict, contractVersion })];
  const expectedBlocks =
    version === null || !configMatchesInstalled
      ? []
      : [
          buildManagedBlock({ packageName, version, strict, contractVersion }),
          ...(config === null
            ? [buildManagedBlock({ packageName, version, strict: !strict, contractVersion })]
            : []),
        ];

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

  if (existsSync(configPath)) {
    const before = readFileSync(configPath, "utf8");
    if (expectedConfigs.includes(before)) {
      changes.push({
        kind: "file",
        fileKind: "config",
        path: configPath,
        changed: true,
        before,
        after: null,
      });
    } else {
      preserved.push({
        path: configPath,
        reason: "edited-generated-file",
        message: `${configPath} is not the expected generated config for "${packageName}"; it was preserved.`,
      });
    }
  }
  if (existsSync(agentsPath)) {
    const before = readFileSync(agentsPath, "utf8");
    if (expectedAgents.includes(before)) {
      changes.push({
        kind: "file",
        fileKind: "agents",
        path: agentsPath,
        changed: true,
        before,
        after: null,
      });
    } else {
      preserved.push({
        path: agentsPath,
        reason: "edited-generated-file",
        message: `${agentsPath} is not the expected generated AGENTS.md for "${packageName}"; it was preserved.`,
      });
    }
  }
  if (existsSync(rootAgentsPath)) {
    const before = readFileSync(rootAgentsPath, "utf8");
    const stripped = planManagedBlockRemoval(before, expectedBlocks);
    if (stripped.changed) {
      changes.push({
        kind: "file",
        fileKind: "root-agents",
        path: rootAgentsPath,
        changed: true,
        before,
        after: stripped.after,
      });
    } else if (stripped.preserved) {
      preserved.push({
        path: rootAgentsPath,
        reason: stripped.reason,
        message: `${rootAgentsPath} was preserved (${stripped.reason}).`,
      });
    }
  }

  let css = null;
  if (typeof cssPath === "string" && cssPath.trim().length > 0) {
    const requested = cssPath.trim();
    const cssTarget = assertWithin(
      consumerRoot,
      isAbsolute(requested) ? resolve(requested) : join(consumerRoot, requested),
      "CSS file",
    );
    if (!existsSync(cssTarget) || !statSync(cssTarget).isFile()) {
      throw new Error(
        `CSS file does not exist or is not a regular file: ${cssTarget}. ` +
          "remove only edits an explicitly named existing file inside --cwd.",
      );
    }
    const before = readFileSync(cssTarget, "utf8");
    const removal = removeBridgeImports(before, { packageName });
    css = {
      kind: "css",
      path: cssTarget,
      changed: removal.changed,
      before,
      after: removal.after,
      removed: removal.removed,
    };
    if (!removal.changed) {
      warnings.push({
        code: "css-bridge-not-found",
        message: `No managed "${packageName}" bridge imports were found in ${cssTarget}; the CSS file was left unchanged.`,
      });
    }
  }

  const directoryPath = resolveConsumerPath(consumerRoot, CONSUMER_DIRECTORY);
  const removesConfig = changes.some((change) => change.fileKind === "config");
  const removesAgents = changes.some((change) => change.fileKind === "agents");
  let directory = null;
  if (removesConfig && removesAgents && existsSync(directoryPath)) {
    // Predict the directory state after the two planned removals: it may be
    // removed only when nothing else remains.
    const remaining = readdirSync(directoryPath).filter(
      (name) => name !== CONSUMER_CONFIG_FILENAME && name !== CONSUMER_AGENTS_FILENAME,
    );
    if (remaining.length === 0) {
      directory = {
        kind: "directory",
        path: directoryPath,
        changed: true,
        before: null,
        after: null,
      };
    } else {
      preserved.push({
        path: directoryPath,
        reason: "directory-not-empty",
        message: `${directoryPath} still contains other files; it was preserved.`,
      });
    }
  }

  return { changes, preserved, warnings, css, directory };
}

/**
 * Remove one explicitly selected design system from a consumer.
 *
 * Options mirror the catalog lifecycle naming: `cwd`, `package`, `cssPath`,
 * `dryRun`. `confirmed: true` is required for any dependency or file mutation.
 *
 * `expectedPlan` is the optional execution precondition: the previous
 * successful plan result (or its `planMaterial`). When supplied on a confirmed
 * run, the previewed action, consumer root, options, package identity, installed
 * manifest identity, dependency state, manager, fixed command, and the exact
 * planned removal/preserve decisions are re-derived and compared before any
 * spawn or write; any drift, tampering, or option conflict fails closed with
 * `boundary: "plan-drift"` and zero effects.
 */
export function removeDesignSystem({
  cwd,
  package: explicitPackage,
  cssPath,
  dryRun = false,
  confirmed = false,
  spawnImpl,
  stdio = "inherit",
  writeImpl,
  expectedPlan,
} = {}) {
  let expectedMaterial = null;
  if (dryRun !== true && expectedPlan !== undefined && expectedPlan !== null) {
    try {
      expectedMaterial = buildLifecyclePlanMaterial(expectedPlan);
    } catch (error) {
      return planDriftResult({
        failures: [`The supplied expected plan cannot be used: ${error.message}`],
      });
    }
    if (expectedMaterial.action !== "remove") {
      return planDriftResult({
        failures: [
          `The supplied expected plan is a "${expectedMaterial.action}" plan, not a remove plan.`,
        ],
      });
    }
  }

  let consumerRoot;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    return {
      ok: false,
      boundary: "consumer-root",
      reason: "invalid-consumer-root",
      failures: [error.message],
      dryRun,
    };
  }
  if (expectedMaterial !== null && expectedMaterial.consumerRoot !== consumerRoot) {
    return planDriftResult({
      failures: [
        `The supplied expected plan was created for ${expectedMaterial.consumerRoot}; this run ` +
          `targets ${consumerRoot}.`,
      ],
    });
  }

  let config;
  try {
    config = readConsumerConfig(consumerRoot);
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: the consumer config is invalid (${error.message}).`,
        ],
      });
    }
    return {
      ok: false,
      boundary: "config",
      reason: "invalid-config",
      failures: [`Cannot remove a design system with an invalid consumer config: ${error.message}`],
      dryRun,
    };
  }

  let selected;
  try {
    selected = discoverConsumerPackage({ consumerRoot, explicitPackage });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: the selected package could not be discovered (${error.message}).`,
        ],
      });
    }
    return {
      ok: false,
      boundary: "selection",
      reason: "not-installed",
      failures: [error.message],
      dryRun,
    };
  }
  const packageName = selected.packageName;
  if (config !== null && config.package !== packageName) {
    return {
      ok: false,
      boundary: "selection",
      reason: "ambiguous-selection",
      failures: [
        `The requested package "${packageName}" does not match the selected design system ` +
          `"${config.package}" in the consumer config.`,
      ],
      dryRun,
    };
  }
  if (expectedMaterial !== null && expectedMaterial.package !== packageName) {
    return planDriftResult({
      failures: [
        `The supplied expected plan removes "${expectedMaterial.package}", but this run selected ` +
          `"${packageName}".`,
      ],
    });
  }

  let packageJson;
  try {
    packageJson = readConsumerPackageJson(consumerRoot);
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: the consumer package.json could not be read (${error.message}).`,
        ],
      });
    }
    return {
      ok: false,
      boundary: "dependency",
      reason: "dependency-precondition",
      failures: [error.message],
      package: packageName,
      dryRun,
    };
  }
  const dependency = dependencyOf(packageJson.json, packageName);
  if (dependency === null) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: "${packageName}" is no longer declared ` +
            "in the consumer package.json.",
        ],
      });
    }
    return {
      ok: false,
      boundary: "selection",
      reason: "not-declared",
      failures: [
        `"${packageName}" is not declared in ${packageJson.path}; remove only manages an ` +
          "explicit consumer dependency.",
      ],
      package: packageName,
      dryRun,
    };
  }
  if (expectedMaterial !== null) {
    const expectedDependency = expectedMaterial.dependency;
    if (
      expectedDependency.package !== packageName ||
      expectedDependency.section !== dependency.section ||
      expectedDependency.spec !== dependency.spec
    ) {
      return planDriftResult({
        failures: [
          `The dependency state for "${packageName}" changed after the preview ` +
            `(${expectedDependency.section} "${expectedDependency.spec}" -> ` +
            `${dependency.section} "${dependency.spec}").`,
        ],
      });
    }
  }

  const resolved = resolveInstalledPackageVersion({ consumerRoot, packageName });
  let installedSystem = null;
  let installedVersion = resolved.version;
  let verifyWarning = null;
  if (resolved.installed) {
    try {
      installedSystem = resolveInstalledDesignSystem({ consumerRoot, packageName });
      verifyConsumerDesignSystem({
        packageName,
        expectedVersion: null,
        installed: installedSystem,
      });
      installedVersion = installedSystem.packageJson.version;
    } catch (error) {
      installedSystem = null;
      verifyWarning =
        `The installed "${packageName}" manifest could not be verified; active usage was ` +
        `checked for literal module references only (${error.message}).`;
    }
  }
  if (expectedMaterial !== null) {
    const freshVersion = installedVersion ?? null;
    if (expectedMaterial.from.version !== freshVersion) {
      return planDriftResult({
        failures: [
          `The installed "${packageName}" version changed after the preview ` +
            `(${expectedMaterial.from.version ?? "unknown"} -> ${freshVersion ?? "unknown"}).`,
        ],
      });
    }
    const expectedDigest = expectedMaterial.from.manifest?.digest ?? null;
    const freshDigest = manifestDigest(installedSystem?.manifest ?? null);
    if (expectedDigest !== freshDigest) {
      return planDriftResult({
        failures: [
          `The installed "${packageName}" manifest changed after the preview; the reviewed plan ` +
            "no longer matches the installed system.",
        ],
      });
    }
  }

  let usage;
  try {
    usage = scanActiveUsage({
      consumerRoot,
      packageName,
      manifest: installedSystem?.manifest ?? null,
      cssPath,
    });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: active usage could not be scanned (${error.message}).`,
        ],
        extra: { package: packageName },
      });
    }
    return {
      ok: false,
      boundary: "scan",
      reason: "scan-failed",
      failures: [error.message],
      package: packageName,
      dryRun,
    };
  }

  const blockers = collectRemoveBlockers(usage);
  if (blockers.length > 0) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan is no longer executable: active usage still references "${packageName}".`,
          ...blockers.map((blocker) => blocker.message),
        ],
        extra: { package: packageName, version: installedVersion, usage },
      });
    }
    return {
      ok: false,
      boundary: "usage",
      reason: "active-usage",
      failures: blockers.map((blocker) => blocker.message),
      package: packageName,
      version: installedVersion,
      usage,
      compatibility: {
        blockers,
        warnings: [],
        coverage: coverageOf(usage, buildTokenIndex(installedSystem?.manifest ?? null)),
      },
      plannedChanges: [],
      dryRun,
    };
  }

  let integration;
  try {
    integration = planRemoveIntegrations({
      consumerRoot,
      packageName,
      config,
      installedSystem,
      installedVersion,
      dependency,
      cssPath,
    });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: integration cleanup planning failed (${error.message}).`,
        ],
        extra: { package: packageName },
      });
    }
    return {
      ok: false,
      boundary: "arguments",
      reason: "integration-plan-failed",
      failures: [error.message],
      package: packageName,
      dryRun,
    };
  }

  let detection;
  try {
    detection = detectPackageManager({ consumerRoot });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: package-manager detection failed (${error.message}).`,
        ],
        extra: { package: packageName },
      });
    }
    return {
      ok: false,
      boundary: "package-manager",
      reason: "manager-detection-failed",
      failures: [error.message],
      package: packageName,
      dryRun,
    };
  }

  let command;
  try {
    command = buildRemoveCommand({ manager: detection.manager, packageName });
  } catch (error) {
    if (expectedMaterial !== null) {
      return planDriftResult({
        failures: [
          `The expected plan can no longer be reproduced: the fixed removal command could not be built (${error.message}).`,
        ],
        extra: { package: packageName },
      });
    }
    return {
      ok: false,
      boundary: "command",
      reason: "command-build-failed",
      failures: [error.message],
      package: packageName,
      manager: detection.manager,
      dryRun,
    };
  }

  const fileChanges = [...integration.changes];
  if (integration.css !== null) fileChanges.push(integration.css);
  const plannedChanges = [
    { kind: "dependency", manager: detection.manager, command },
    ...fileChanges,
    ...(integration.directory !== null ? [integration.directory] : []),
  ];

  const warnings = [
    ...(verifyWarning === null ? [] : [{ code: "installed-unverified", message: verifyWarning }]),
    ...integration.warnings,
    {
      code: "unrelated-preserved",
      message: "Unrelated dependencies, peers, and consumer source files are never modified.",
    },
  ];
  const compatibility = {
    blockers: [],
    warnings,
    coverage: coverageOf(usage, buildTokenIndex(installedSystem?.manifest ?? null)),
  };

  const planMaterial = buildRemovePlanMaterial({
    consumerRoot,
    options: { cssPath: integration.css === null ? null : integration.css.path },
    package: packageName,
    from: {
      package: packageName,
      version: installedVersion ?? null,
      manifest: manifestIdentity(installedSystem?.manifest ?? null),
    },
    dependency: { package: packageName, section: dependency.section, spec: dependency.spec },
    manager: detection.manager,
    command,
    plannedChanges,
    preserved: integration.preserved,
    directory: integration.directory,
  });

  if (expectedMaterial !== null) {
    const differences = diffLifecyclePlanMaterial(expectedMaterial, planMaterial);
    if (differences.length > 0) {
      return planDriftResult({
        failures: [
          "Refusing to remove: the supplied expected plan no longer matches the current plan.",
          ...differences,
          "No dependency or file changes were made; preview again and confirm the new plan.",
        ],
        extra: { package: packageName, version: installedVersion, usage, planMaterial },
      });
    }
  }

  const base = {
    consumerRoot,
    package: packageName,
    version: installedVersion ?? null,
    dependency,
    manager: detection.manager,
    managerSource: detection.source,
    command,
    usage,
    plannedChanges,
    preserved: integration.preserved,
    compatibility,
    planMaterial,
    dryRun,
  };

  if (dryRun) {
    return { ok: true, dryRun: true, changed: false, reason: "dry-run", failures: [], ...base };
  }
  if (confirmed !== true) {
    return {
      ok: false,
      boundary: "confirmation-required",
      reason: "confirmation-required",
      failures: [
        "remove requires explicit confirmation; re-run with --yes. No dependency or file " +
          "changes were made.",
      ],
      ...base,
    };
  }

  const preconditionFiles = fileChanges.map((change) => ({
    path: change.path,
    before: change.before,
  }));
  const preSpawnFailures = [];
  try {
    const current = readConsumerPackageJson(consumerRoot);
    const declared = dependencyOf(current.json, packageName);
    if (declared === null) {
      preSpawnFailures.push(
        `Dependency "${packageName}" is no longer declared in ${current.path}.`,
      );
    } else if (declared.spec !== dependency.spec || declared.section !== dependency.section) {
      preSpawnFailures.push(
        `Dependency "${packageName}" changed from ${dependency.section} "${dependency.spec}" to ` +
          `${declared.section} "${declared.spec}".`,
      );
    }
  } catch (error) {
    preSpawnFailures.push(error.message);
  }
  for (const file of preconditionFiles) {
    if (readFileOrNull(file.path) !== file.before) {
      preSpawnFailures.push(`Planned file changed after preview: ${file.path}.`);
    }
  }
  if (preSpawnFailures.length > 0) {
    return {
      ok: false,
      boundary: "precondition",
      reason: "drift",
      failures: [
        "Refusing to remove: consumer state changed after planning.",
        ...preSpawnFailures,
        "No dependency or file changes were made; preview again.",
      ],
      ...base,
    };
  }

  let spawnResult;
  try {
    spawnResult = spawnInstall({
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
      reason: "manager-spawn-failed",
      failures: [error.message],
      note: "No file changes were made; the package manager was not started.",
      ...base,
    };
  }
  if (spawnResult.status !== 0) {
    return {
      ok: false,
      boundary: "manager",
      reason: "manager-failed",
      failures: [`${detection.manager} exited with code ${spawnResult.status ?? "unknown"}.`],
      note:
        "The package manager exited non-zero before any file writes. No files were changed. " +
        "No rollback was attempted.",
      ...base,
    };
  }

  const absenceFailures = [];
  try {
    const current = readConsumerPackageJson(consumerRoot);
    if (dependencyOf(current.json, packageName) !== null) {
      absenceFailures.push(`"${packageName}" is still declared in ${current.path} after removal.`);
    }
  } catch (error) {
    absenceFailures.push(error.message);
  }
  const stillResolved = resolveInstalledPackageVersion({ consumerRoot, packageName });
  if (stillResolved.installed) {
    absenceFailures.push(
      `"${packageName}" still resolves in node_modules after removal` +
        `${stillResolved.version === null ? "" : ` (found ${stillResolved.version})`}; a stale ` +
        "pnpm symlink can cause this. Run the package manager install to prune it, then re-run remove.",
    );
  }
  if (absenceFailures.length > 0) {
    return {
      ok: false,
      boundary: "verify",
      reason: "dependency-still-present",
      failures: absenceFailures,
      note:
        `"${packageName}" was not verified absent after the manager exited; no generated files ` +
        "were removed. No rollback was attempted; fix the dependency state and re-run remove.",
      ...base,
    };
  }

  const preWriteFailures = preconditionFiles
    .filter((file) => readFileOrNull(file.path) !== file.before)
    .map((file) => `Planned file changed while the manager ran: ${file.path}.`);
  if (preWriteFailures.length > 0) {
    return {
      ok: false,
      boundary: "precondition",
      reason: "drift-after-remove",
      failures: [
        "Refusing to write files: consumer state changed while the manager ran.",
        ...preWriteFailures,
      ],
      note:
        `"${packageName}" was removed from the dependencies, but no generated files were ` +
        "touched. No rollback of the manager was attempted.",
      ...base,
    };
  }

  const applied = applyFileChanges({ consumerRoot, entries: fileChanges, writeImpl });
  if (!applied.ok) {
    return {
      ok: false,
      boundary: "write",
      reason: "write-failed",
      failures: [`File writes failed: ${applied.error.message}`],
      written: applied.written,
      rolledBack: applied.rolledBack,
      failed: applied.failed,
      remaining: applied.remaining,
      note:
        `"${packageName}" was removed from the dependencies. This command's file removals/writes ` +
        "were rolled back where possible. No rollback of the package manager was attempted.",
      ...base,
    };
  }

  let directoryRemoved = false;
  if (integration.directory !== null) {
    try {
      if (readdirSync(integration.directory.path).length === 0) {
        rmdirSync(integration.directory.path);
        directoryRemoved = true;
      }
    } catch {
      directoryRemoved = false;
    }
  }

  const postFailures = verifyWrittenBytes(fileChanges);
  try {
    const current = readConsumerPackageJson(consumerRoot);
    if (dependencyOf(current.json, packageName) !== null) {
      postFailures.push(`Dependency "${packageName}" is declared again after removal.`);
    }
  } catch (error) {
    postFailures.push(error.message);
  }
  if (postFailures.length > 0) {
    return {
      ok: false,
      boundary: "postcheck",
      reason: "postcheck-failed",
      failures: postFailures,
      written: applied.written,
      note:
        `"${packageName}" was removed and the planned files were written, but the post-check ` +
        "reported differences. Review the listed files; no automatic rollback was attempted.",
      ...base,
    };
  }

  return {
    ok: true,
    dryRun: false,
    changed: true,
    reason: null,
    failures: [],
    ...base,
    written: applied.written,
    directoryRemoved,
    removed: {
      dependency: true,
      config: integration.changes.some((change) => change.fileKind === "config"),
      agents: integration.changes.some((change) => change.fileKind === "agents"),
      rootAgents: integration.changes.some((change) => change.fileKind === "root-agents"),
      css: integration.css !== null && integration.css.changed,
    },
  };
}
