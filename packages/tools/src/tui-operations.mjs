/**
 * UI-neutral business-operation facade for the interactive `prism-ds` TUI.
 *
 * This module is a thin adapter between a terminal UI and the published
 * `@prism-system/tools` operations. It owns no business logic of its own: every
 * method delegates to an existing operation, and all filesystem, registry,
 * manifest, package-manager, check, and write behavior stays in the modules it
 * calls. It never imports UI framework code and performs no work on
 * construction — creating an instance only resolves the display `cwd` and
 * captures the injected operations.
 *
 * Contract:
 *
 *   cwd                     the resolved target directory shown by the UI.
 *   getProjectState()       offline, read-only state for that directory:
 *                           `connected` (validated config + verified public
 *                           manifest), `installed` (unambiguous discovered
 *                           package + verified public manifest, no config),
 *                           `empty` (nothing selected/installed, with a
 *                           reason), or `error` (root, config, discovery, or
 *                           verification failure). Never guesses between
 *                           multiple packages and never reads installed
 *                           internals.
 *   searchSystems()         explicit read-only registry search (network only
 *                           when called).
 *   inspectSystem()         explicit read-only registry inspection (network
 *                           only when called).
 *   listComponents()        offline public-manifest catalog, including
 *                           extensions and their entrypoint requirements.
 *   listTokens()            offline public-manifest token catalog.
 *   runCheck()              offline read-only consumer health report; an
 *                           explicit `entry` selects entry prerequisites.
 *   runDoctor()             offline read-only diagnostics; an explicit
 *                           `entry` adds the same prerequisite scan.
 *   runUsageCheck()         offline strict usage validation.
 *   runTailwindCheck()      offline read-only Tailwind planning for an
 *                           explicitly supplied CSS path; never writes.
 *   previewMutation()       runs the selected mutation operation with
 *                           `dryRun: true` and returns its structured plan,
 *                           including the selected entries and the peer plan
 *                           (`entrySelection` and `peers`).
 *   executeMutation()       re-runs the dry run immediately before the change,
 *                           compares the material plan (target, version,
 *                           package manager, command, planned file effects
 *                           including each managed file's exact before/after
 *                           content, and upgrade diff) against the accepted
 *                           preview, fails closed without any mutation on drift,
 *                           then invokes the same operation exactly once with
 *                           `dryRun: false`. For `use`/`upgrade` the exact
 *                           connect plan from the final fresh preview is passed
 *                           along as the operation's optional write
 *                           precondition, so reconnect recomputes the plan and
 *                           fails closed instead of overwriting files that
 *                           changed after the preview.
 *
 * Every operation function can be replaced through `operations` (tests inject
 * fakes), and registry/package-manager dependencies through `fetchImpl` and
 * `spawnImpl`. Construction never calls any of them.
 */

import { resolve as resolvePath } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  inspectDesignSystem,
  installDesignSystem,
  runUseDesignSystem,
  searchDesignSystems,
  upgradeDesignSystem,
} from "./catalog.mjs";
import { runUseWithSkills } from "./use-skills.mjs";
import { checkDesignSystem } from "./check.mjs";
import { listDesignSystemComponents } from "./components.mjs";
import {
  connectDesignSystem,
  discoverConsumerPackage,
  readConsumerConfig,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import { collectDoctorReport } from "./doctor.mjs";
import { switchDesignSystem, removeDesignSystem } from "./lifecycle.mjs";
import { getSkillCatalogEntry, listSkillCatalog } from "./skill-catalog.mjs";
import { listInstalledSkills, SKILL_AGENT_IDS, SKILL_SCOPE_VALUES } from "./skill-inventory.mjs";
import { planSkillOperation, executeSkillOperation } from "./skills.mjs";
import { checkCliUpdate, selfUpdate } from "./self-update.mjs";
import {
  buildRecoverySuggestions,
  collectRecoveryReport,
  previewRecoveryAction as previewRecoveryBackend,
  executeRecoveryAction as executeRecoveryBackend,
} from "./recovery.mjs";
import { setupTailwind } from "./tailwind-setup.mjs";
import { listDesignSystemTokens } from "./tokens.mjs";
import { checkUsage } from "./usage.mjs";

/** Stable project states reported by {@link createTuiOperations}.getProjectState. */
export const PROJECT_STATES = Object.freeze({
  CONNECTED: "connected",
  INSTALLED: "installed",
  EMPTY: "empty",
  ERROR: "error",
});

/** Mutation kinds the facade previews and executes. */
export const TUI_ACTION_KINDS = Object.freeze([
  "install",
  "use",
  "connect",
  "upgrade",
  "switch",
  "remove",
]);

/** Default operations: the real published implementations, nothing duplicated. */
const DEFAULT_OPERATIONS = Object.freeze({
  search: searchDesignSystems,
  inspect: inspectDesignSystem,
  install: installDesignSystem,
  use: runUseDesignSystem,
  useWithSkills: runUseWithSkills,
  connect: connectDesignSystem,
  upgrade: upgradeDesignSystem,
  switch: switchDesignSystem,
  remove: removeDesignSystem,
  components: listDesignSystemComponents,
  tokens: listDesignSystemTokens,
  check: checkDesignSystem,
  doctor: collectDoctorReport,
  usage: checkUsage,
  tailwind: setupTailwind,
  resolveRoot: resolveConsumerRoot,
  readConfig: readConsumerConfig,
  discover: discoverConsumerPackage,
  resolveInstalled: resolveInstalledDesignSystem,
  verifyInstalled: verifyConsumerDesignSystem,
  skillCatalog: listSkillCatalog,
  skillInventory: listInstalledSkills,
  skillPlan: planSkillOperation,
  skillExecute: executeSkillOperation,
  updateCheck: checkCliUpdate,
  update: selfUpdate,
  recoveryReport: collectRecoveryReport,
  recoverySuggestions: buildRecoverySuggestions,
  recoveryPreview: previewRecoveryBackend,
  recoveryExecute: executeRecoveryBackend,
});

const OPERATION_KEYS = Object.freeze(Object.keys(DEFAULT_OPERATIONS));

/**
 * Discovery messages that mean "nothing is selected or installed yet". This is
 * the only discovery outcome reported as `empty`; every other discovery failure
 * (invalid or ambiguous selection) is reported as `error` and never guessed at.
 */
const EMPTY_DISCOVERY_REASONS = Object.freeze([
  "no .design-system/config.json and no consumer package.json",
  "No supported @prism-system/ui-* package found in consumer dependencies",
]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function failure(boundary, error) {
  return { ok: false, boundary, failures: [errorMessage(error)] };
}

/** Reject unknown or non-function operation overrides at construction. */
function resolveOperations(overrides) {
  if (!isPlainObject(overrides)) {
    throw new TypeError('"operations" must be a plain object of injectable operations.');
  }
  const resolved = { ...DEFAULT_OPERATIONS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_OPERATIONS, key)) {
      throw new TypeError(
        `Unknown operation ${JSON.stringify(key)}; supported operations are: ` +
          `${OPERATION_KEYS.join(", ")}.`,
      );
    }
    if (value === undefined) continue;
    if (typeof value !== "function") {
      throw new TypeError(`Operation ${JSON.stringify(key)} must be a function.`);
    }
    resolved[key] = value;
  }
  return resolved;
}

function assertOptionalFunction(value, label) {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${label} must be a function when provided.`);
  }
}

function isEmptyDiscoveryReason(message) {
  return EMPTY_DISCOVERY_REASONS.some((reason) => message.includes(reason));
}

/* -------------------------------------------------------------------------- */
/* Project state                                                              */
/* -------------------------------------------------------------------------- */

function baseProjectState(cwd) {
  return {
    ok: false,
    status: PROJECT_STATES.ERROR,
    cwd,
    consumerRoot: null,
    connected: false,
    config: null,
    packageName: null,
    version: null,
    contractVersion: null,
    source: null,
    reason: null,
    failures: [],
  };
}

function failProjectState(state, error) {
  const reason = errorMessage(error);
  state.status = PROJECT_STATES.ERROR;
  state.reason = reason;
  state.failures = [reason];
  return state;
}

/* -------------------------------------------------------------------------- */
/* Mutation request/plan material                                             */
/* -------------------------------------------------------------------------- */

/** Validate and map one UI action onto the exact underlying operation options. */
function requestFromAction(action) {
  if (!isPlainObject(action) || typeof action.kind !== "string") {
    return { ok: false, failures: ['Mutation actions must be objects with a string "kind".'] };
  }
  const kind = action.kind;
  if (!TUI_ACTION_KINDS.includes(kind)) {
    return {
      ok: false,
      failures: [
        `Unsupported action kind ${JSON.stringify(kind)}; supported kinds are: ` +
          `${TUI_ACTION_KINDS.join(", ")}.`,
      ],
    };
  }

  const packageName =
    typeof action.packageName === "string" && action.packageName.trim() !== ""
      ? action.packageName.trim()
      : null;
  if (kind !== "connect" && packageName === null) {
    return {
      ok: false,
      failures: [`The ${JSON.stringify(kind)} action requires an explicit packageName.`],
    };
  }

  const version =
    typeof action.version === "string" && action.version.trim() !== ""
      ? action.version.trim()
      : null;
  if ((kind === "upgrade" || kind === "switch") && version === null) {
    return {
      ok: false,
      failures: [`The ${JSON.stringify(kind)} action requires an explicit exact version.`],
    };
  }
  if ((kind === "upgrade" || kind === "switch") && !EXACT_VERSION.test(version)) {
    return {
      ok: false,
      failures: [`The ${JSON.stringify(kind)} action requires a valid exact version.`],
    };
  }

  const tailwind = action.tailwind === true;
  const cssPath =
    typeof action.cssPath === "string" && action.cssPath.trim() !== ""
      ? action.cssPath.trim()
      : null;
  if (kind === "use" && tailwind && cssPath === null) {
    return {
      ok: false,
      failures: ['The "use" action with tailwind: true requires an explicit cssPath.'],
    };
  }

  const ignore = Array.isArray(action.ignore)
    ? action.ignore.filter((entry) => typeof entry === "string")
    : [];
  const checkUsage = action.checkUsage === true;
  if (kind === "use" && ignore.length > 0 && !checkUsage) {
    return {
      ok: false,
      failures: ['The "use" action requires checkUsage: true when ignore globs are provided.'],
    };
  }

  const entries = (
    Array.isArray(action.withEntry)
      ? action.withEntry
      : typeof action.withEntry === "string"
        ? [action.withEntry]
        : []
  )
    .filter((entry) => typeof entry === "string" && entry.trim() !== "")
    .map((entry) => entry.trim());
  const peerSpecs = (
    Array.isArray(action.peers)
      ? action.peers
      : typeof action.peers === "string"
        ? [action.peers]
        : []
  )
    .filter((peer) => typeof peer === "string" && peer.trim() !== "")
    .map((peer) => peer.trim());
  const skillAgents = Array.isArray(action.skillAgents)
    ? action.skillAgents.filter((agent) => typeof agent === "string" && agent.trim() !== "")
    : [];

  return {
    ok: true,
    kind,
    packageName,
    version,
    saveDev: action.saveDev === true,
    exact: action.exact === true,
    strict: typeof action.strict === "boolean" ? action.strict : undefined,
    ignore,
    checkUsage,
    tailwind,
    cssPath,
    skills: action.skills === true,
    skillAgents,
    entries,
    peers: peerSpecs,
    registry:
      typeof action.registry === "string" && action.registry.trim() !== ""
        ? action.registry.trim()
        : null,
  };
}

function normalizeCommand(command) {
  if (!isPlainObject(command) || !Array.isArray(command.args)) return null;
  return {
    manager: typeof command.manager === "string" ? command.manager : null,
    verb: typeof command.verb === "string" ? command.verb : null,
    args: command.args.filter((arg) => typeof arg === "string"),
  };
}

function normalizePlannedChange(change) {
  if (!isPlainObject(change)) return null;
  if (change.kind === "dependency") {
    return {
      kind: "dependency",
      manager: typeof change.manager === "string" ? change.manager : null,
      command: normalizeCommand(change.command),
    };
  }
  if (change.kind === "css") {
    return {
      kind: "css",
      path: typeof change.path === "string" ? change.path : null,
      changed: change.changed === true,
      before: typeof change.before === "string" ? change.before : null,
      after: typeof change.after === "string" ? change.after : null,
    };
  }
  if (change.kind === "connect") {
    const before = typeof change.before === "string" ? change.before : null;
    const after = typeof change.after === "string" ? change.after : null;
    return {
      kind: "connect",
      fileKind: typeof change.fileKind === "string" ? change.fileKind : null,
      path: typeof change.path === "string" ? change.path : null,
      changed: typeof change.changed === "boolean" ? change.changed : before !== after,
      before,
      after,
    };
  }
  const normalized = {
    kind: typeof change.kind === "string" ? change.kind : "unknown",
    path: typeof change.path === "string" ? change.path : null,
  };
  for (const key of ["fileKind", "changed", "before", "after", "manager", "section", "reason"]) {
    if (Object.prototype.hasOwnProperty.call(change, key)) normalized[key] = change[key];
  }
  if (isPlainObject(change.command)) normalized.command = normalizeCommand(change.command);
  return normalized;
}

/** One planned connect/config file effect, with its exact before/after content. */
function normalizePlannedFile(file) {
  if (!isPlainObject(file)) return null;
  return {
    kind: typeof file.kind === "string" ? file.kind : null,
    path: typeof file.path === "string" ? file.path : null,
    changed: file.before !== file.after,
    before: typeof file.before === "string" ? file.before : null,
    after: typeof file.after === "string" ? file.after : null,
  };
}

/** Normalize a requirement list to a stable, JSON-safe comparison shape. */
function normalizeRequirements(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((requirement) => isPlainObject(requirement) && typeof requirement.name === "string")
    .map((requirement) => ({
      name: requirement.name,
      kind: typeof requirement.kind === "string" ? requirement.kind : null,
      range: typeof requirement.range === "string" ? requirement.range : null,
      optional: requirement.optional === true,
    }));
}

/** Normalize the selected-entry material (extensions, entrypoints, paths). */
function normalizeEntrySelection(value) {
  if (!isPlainObject(value)) return null;
  return {
    requested: Array.isArray(value.requested)
      ? value.requested.filter((entry) => typeof entry === "string")
      : [],
    entries: (Array.isArray(value.entries) ? value.entries : [])
      .filter((entry) => isPlainObject(entry))
      .map((entry) => ({
        requested: typeof entry.requested === "string" ? entry.requested : null,
        kind: typeof entry.kind === "string" ? entry.kind : null,
        extension: typeof entry.extension === "string" ? entry.extension : null,
        entrypoint: typeof entry.entrypoint === "string" ? entry.entrypoint : null,
        selectedEntrypoints: Array.isArray(entry.selectedEntrypoints)
          ? entry.selectedEntrypoints.filter((value) => typeof value === "string")
          : [],
        selectedExtensions: Array.isArray(entry.selectedExtensions)
          ? entry.selectedExtensions.filter((value) => typeof value === "string")
          : [],
        file: typeof entry.file === "string" ? entry.file : null,
        requirements: normalizeRequirements(entry.requirements),
      })),
    requirements: normalizeRequirements(value.requirements),
  };
}

/** Normalize the selected peer plan so preview drift comparison cannot bypass it. */
function normalizePeerPlan(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((peer) => isPlainObject(peer))
    .map((peer) => ({
      name: typeof peer.name === "string" ? peer.name : null,
      kind: typeof peer.kind === "string" ? peer.kind : null,
      range: typeof peer.range === "string" ? peer.range : null,
      optional: peer.optional === true,
      action: typeof peer.action === "string" ? peer.action : null,
      version: typeof peer.version === "string" ? peer.version : null,
      installed: typeof peer.installed === "string" ? peer.installed : null,
      source: typeof peer.source === "string" ? peer.source : null,
    }));
}

/**
 * Extract the material plan of a successful dry run in a deterministic,
 * JSON-safe shape. Only successful runs are ever accepted by
 * {@link createTuiOperations}.executeMutation, so this never serializes failure
 * strings: it compares targets, versions, managers, commands, planned file
 * effects, the Tailwind CSS plan, and the upgrade manifest diff.
 */
function buildPlanMaterial(request, result) {
  const material = {
    kind: request.kind,
    requested: {
      package: request.packageName,
      version: request.version,
      saveDev: request.saveDev,
      exact: request.exact,
      strict: request.strict === undefined ? null : request.strict,
      ignore: [...request.ignore],
      checkUsage: request.checkUsage,
      tailwind: request.tailwind,
      cssPath: request.cssPath,
      skills: request.skills,
      skillAgents: [...request.skillAgents],
      withEntry: [...request.entries],
      peers: [...request.peers],
      registry: request.registry,
    },
    consumerRoot:
      isPlainObject(result) && typeof result.consumerRoot === "string" ? result.consumerRoot : null,
    package: null,
    version: null,
    fromVersion: null,
    toVersion: null,
    manager: null,
    command: null,
    effects: [],
    entrySelection: null,
    peers: [],
    diff: null,
    tailwind: null,
    lifecyclePlan: null,
    skillPlan: null,
  };

  if (request.kind === "connect") {
    const plan = isPlainObject(result?.plan) ? result.plan : {};
    material.consumerRoot =
      typeof plan.consumerRoot === "string" ? plan.consumerRoot : material.consumerRoot;
    material.package = typeof plan.packageName === "string" ? plan.packageName : null;
    material.version = typeof plan.version === "string" ? plan.version : null;
    material.effects = (Array.isArray(plan.files) ? plan.files : [])
      .map(normalizePlannedFile)
      .filter((effect) => effect !== null);
    return material;
  }

  if (request.kind === "use") {
    const install = isPlainObject(result?.install) ? result.install : {};
    if (typeof install.consumerRoot === "string") material.consumerRoot = install.consumerRoot;
    material.package = typeof install.package === "string" ? install.package : null;
    material.version = typeof install.version === "string" ? install.version : null;
    material.manager = typeof install.manager === "string" ? install.manager : null;
    material.command = normalizeCommand(install.command);
    material.entrySelection = normalizeEntrySelection(install.entrySelection);
    material.peers = normalizePeerPlan(install.peers);
    material.effects = (Array.isArray(result?.plannedChanges) ? result.plannedChanges : [])
      .map(normalizePlannedChange)
      .filter((effect) => effect !== null);
    if (isPlainObject(result?.tailwind)) {
      material.tailwind = {
        cssPath: typeof result.tailwind.cssPath === "string" ? result.tailwind.cssPath : null,
        package:
          typeof result.tailwind.packageName === "string" ? result.tailwind.packageName : null,
        version: typeof result.tailwind.version === "string" ? result.tailwind.version : null,
        changed: result.tailwind.changed === true,
        before: typeof result.tailwind.before === "string" ? result.tailwind.before : null,
        after: typeof result.tailwind.after === "string" ? result.tailwind.after : null,
      };
    }
    material.skillPlan = isPlainObject(result?.skillPlan)
      ? result.skillPlan
      : isPlainObject(result?.skillSetup?.plan)
        ? result.skillSetup.plan
        : null;
    return material;
  }

  if (request.kind === "switch") {
    material.package = typeof result?.to?.package === "string" ? result.to.package : null;
    material.version = typeof result?.to?.version === "string" ? result.to.version : null;
    material.fromVersion = typeof result?.from?.version === "string" ? result.from.version : null;
    material.toVersion = material.version;
    material.manager = typeof result?.manager === "string" ? result.manager : null;
    material.command = normalizeCommand(result?.command);
    material.entrySelection = normalizeEntrySelection(result?.entrySelection);
    material.peers = normalizePeerPlan(result?.peers);
    material.effects = (Array.isArray(result?.plannedChanges) ? result.plannedChanges : [])
      .map(normalizePlannedChange)
      .filter((effect) => effect !== null);
    material.lifecyclePlan = isPlainObject(result?.planMaterial) ? result.planMaterial : null;
    return material;
  }

  if (request.kind === "remove") {
    material.package = typeof result?.package === "string" ? result.package : request.packageName;
    material.version = typeof result?.version === "string" ? result.version : null;
    material.fromVersion = material.version;
    material.manager = typeof result?.manager === "string" ? result.manager : null;
    material.command = normalizeCommand(result?.command);
    material.effects = (Array.isArray(result?.plannedChanges) ? result.plannedChanges : [])
      .map(normalizePlannedChange)
      .filter((effect) => effect !== null);
    material.lifecyclePlan = isPlainObject(result?.planMaterial) ? result.planMaterial : null;
    return material;
  }

  material.package = typeof result?.package === "string" ? result.package : null;
  material.manager = typeof result?.manager === "string" ? result.manager : null;
  material.command = normalizeCommand(result?.command);
  material.entrySelection = normalizeEntrySelection(result?.entrySelection);
  material.peers = normalizePeerPlan(result?.peers);
  material.effects = (Array.isArray(result?.plannedChanges) ? result.plannedChanges : [])
    .map(normalizePlannedChange)
    .filter((effect) => effect !== null);
  if (request.kind === "upgrade") {
    material.version = typeof result?.toVersion === "string" ? result.toVersion : null;
    material.fromVersion = typeof result?.fromVersion === "string" ? result.fromVersion : null;
    material.toVersion = typeof result?.toVersion === "string" ? result.toVersion : null;
    material.diff = isPlainObject(result?.diff) ? result.diff : null;
  } else {
    material.version = typeof result?.version === "string" ? result.version : null;
  }
  return material;
}

function buildPreview(cwd, request, result) {
  const material = buildPlanMaterial(request, result);
  return {
    ok: isPlainObject(result) && result.ok === true,
    kind: request.kind,
    cwd,
    dryRun: true,
    boundary: typeof result?.boundary === "string" ? result.boundary : null,
    failures: Array.isArray(result?.failures) ? [...result.failures] : [],
    packageName: material.package ?? request.packageName,
    version: material.version ?? request.version,
    manager: material.manager,
    command: material.command,
    plannedChanges: material.effects,
    diff: material.diff,
    tailwind: material.tailwind,
    from: isPlainObject(result?.from) ? result.from : null,
    to: isPlainObject(result?.to) ? result.to : null,
    compatibility: isPlainObject(result?.compatibility) ? result.compatibility : null,
    usage: isPlainObject(result?.usage) ? result.usage : null,
    warnings: Array.isArray(result?.warnings) ? [...result.warnings] : [],
    preserved: Array.isArray(result?.preserved) ? [...result.preserved] : [],
    skillSetup: isPlainObject(result?.skillSetup) ? result.skillSetup : null,
    partial: result?.partial === true,
    note: typeof result?.note === "string" ? result.note : null,
    material,
    result,
  };
}

function failedPreview(cwd, kind, boundary, failures) {
  return {
    ok: false,
    kind: typeof kind === "string" ? kind : null,
    cwd,
    dryRun: true,
    boundary,
    failures,
    packageName: null,
    version: null,
    manager: null,
    command: null,
    plannedChanges: [],
    diff: null,
    tailwind: null,
    material: null,
    result: null,
  };
}

/**
 * True when a successful, non-dry mutation actually changed the consumer. An
 * operation that reports `changed` keeps that value; a successful mutation that
 * does not report one (for example `install`) is still an applied change.
 */
function mutationChanged(result) {
  if (!isPlainObject(result) || result.dryRun === true) return false;
  // A connect-precondition failure is returned only after use/upgrade has
  // installed and verified the dependency; reconnect is refused, but that
  // earlier mutation remains applied.
  if (result.boundary === "connect-precondition") return true;
  if (result.partial === true) return true;
  if (result.ok !== true) return false;
  return typeof result.changed === "boolean" ? result.changed : true;
}

function mutationApplied(result) {
  if (!isPlainObject(result) || result.dryRun === true) return false;
  return (
    result.ok === true ||
    result.boundary === "connect-precondition" ||
    result.partial === true ||
    result.changed === true
  );
}

/**
 * The exact connect plan a successful `use`/`upgrade` dry run produced, when the
 * operation exposes one. It is handed to the real invocation as the optional
 * write precondition so reconnect can recompute the plan and refuse to write if
 * the managed files changed after the preview. Operations that do not expose a
 * plan keep the previous behavior (no precondition).
 */
function connectPrecondition(result) {
  if (!isPlainObject(result)) return null;
  const plan = result.connectPlan;
  if (!isPlainObject(plan) || !Array.isArray(plan.files) || plan.files.length === 0) return null;
  return plan;
}

/**
 * Create the UI-neutral operations facade.
 *
 * @param {{
 *   cwd?: string,
 *   operations?: Record<string, Function>,
 *   fetchImpl?: Function,
 *   spawnImpl?: Function,
 * }} [options] `cwd` is the directory the UI targets and is resolved but not
 *   validated here (validation happens per call and is reported as state).
 *   `operations` overrides individual operation implementations; unknown keys
 *   throw. `fetchImpl`/`spawnImpl` are forwarded to the catalogue operations so
 *   tests can inject fakes.
 */
export function createTuiOperations({
  cwd = process.cwd(),
  operations = {},
  fetchImpl,
  spawnImpl,
} = {}) {
  if (typeof cwd !== "string" || cwd.trim().length === 0) {
    throw new TypeError("createTuiOperations requires a non-empty cwd string.");
  }
  assertOptionalFunction(fetchImpl, "fetchImpl");
  assertOptionalFunction(spawnImpl, "spawnImpl");

  const resolvedCwd = resolvePath(cwd.trim());
  const ops = resolveOperations(operations);

  function getProjectState() {
    const state = baseProjectState(resolvedCwd);

    let consumerRoot;
    try {
      consumerRoot = ops.resolveRoot({ cwd: resolvedCwd });
    } catch (error) {
      return failProjectState(state, error);
    }
    state.consumerRoot = consumerRoot;

    let config;
    try {
      config = ops.readConfig(consumerRoot);
    } catch (error) {
      return failProjectState(state, error);
    }
    state.config = config ?? null;

    let discovered;
    try {
      discovered = ops.discover({ consumerRoot });
    } catch (error) {
      const reason = errorMessage(error);
      state.reason = reason;
      if (config === null && isEmptyDiscoveryReason(reason)) {
        state.status = PROJECT_STATES.EMPTY;
        return state;
      }
      return failProjectState(state, reason);
    }

    state.packageName = typeof discovered?.packageName === "string" ? discovered.packageName : null;
    state.source =
      typeof discovered?.source === "string" ? discovered.source : state.config ? "config" : null;

    let verified;
    try {
      const installed = ops.resolveInstalled({
        consumerRoot,
        packageName: discovered.packageName,
      });
      verified = ops.verifyInstalled({
        packageName: discovered.packageName,
        expectedVersion: discovered.expectedVersion,
        installed,
      });
    } catch (error) {
      return failProjectState(state, error);
    }

    state.version = typeof verified?.version === "string" ? verified.version : null;
    state.contractVersion =
      typeof verified?.contractVersion === "number" ? verified.contractVersion : null;
    state.connected = state.config !== null;
    state.status = state.connected ? PROJECT_STATES.CONNECTED : PROJECT_STATES.INSTALLED;
    state.ok = true;
    return state;
  }

  async function searchSystems({ query, size } = {}) {
    try {
      const result = await ops.search({ query, size, fetchImpl });
      return { ok: true, ...(result ?? {}) };
    } catch (error) {
      return failure("registry", error);
    }
  }

  async function inspectSystem({ packageName, version } = {}) {
    try {
      const result = await ops.inspect({ package: packageName, version, fetchImpl });
      return { ok: true, ...(result ?? {}) };
    } catch (error) {
      return failure("registry", error);
    }
  }

  function listComponents({ name } = {}) {
    try {
      return ops.components({ cwd: resolvedCwd, name });
    } catch (error) {
      return failure("components", error);
    }
  }

  function listTokens({ group } = {}) {
    try {
      return ops.tokens({ cwd: resolvedCwd, group });
    } catch (error) {
      return failure("tokens", error);
    }
  }

  function runCheck({ cssPath, entry } = {}) {
    try {
      return ops.check({ cwd: resolvedCwd, cssPath, entry });
    } catch (error) {
      return { ...failure("check", error), checks: [] };
    }
  }

  function runDoctor({ entry } = {}) {
    try {
      return ops.doctor({ cwd: resolvedCwd, entry });
    } catch (error) {
      return { ...failure("doctor", error), checks: [] };
    }
  }

  function runUsageCheck() {
    try {
      return ops.usage({ cwd: resolvedCwd });
    } catch (error) {
      return { ...failure("usage", error), findings: [] };
    }
  }

  function runTailwindCheck({ cssPath } = {}) {
    if (typeof cssPath !== "string" || cssPath.trim().length === 0) {
      return {
        ok: false,
        boundary: "arguments",
        failures: [
          "runTailwindCheck requires an explicit cssPath; it never scans for or guesses a CSS file.",
        ],
        plan: null,
        changes: [],
      };
    }
    try {
      // Read-only: the plan is computed with an explicit dry run and never written.
      return ops.tailwind({ cwd: resolvedCwd, cssPath: cssPath.trim(), dryRun: true });
    } catch (error) {
      return { ...failure("tailwind", error), plan: null, changes: [] };
    }
  }

  async function listSkills({ scope = "all" } = {}) {
    if (!SKILL_SCOPE_VALUES.includes(scope)) {
      return {
        ok: false,
        boundary: "arguments",
        scope,
        catalog: [],
        installed: [],
        failures: [`scope must be one of ${SKILL_SCOPE_VALUES.join(", ")}.`],
      };
    }
    try {
      const catalog = ops.skillCatalog();
      const inventory = await ops.skillInventory({ cwd: resolvedCwd, scope });
      return {
        ok: inventory?.ok === true,
        scope,
        catalog: Array.isArray(catalog) ? catalog : [],
        installed: Array.isArray(inventory?.skills) ? inventory.skills : [],
        failures: Array.isArray(inventory?.failures) ? [...inventory.failures] : [],
        inventory,
      };
    } catch (error) {
      return {
        ok: false,
        boundary: "skills-list",
        scope,
        catalog: [],
        installed: [],
        failures: [errorMessage(error)],
      };
    }
  }

  function skillRequestFromAction(action) {
    if (!isPlainObject(action)) {
      return { ok: false, failures: ["Skill actions must be objects."] };
    }
    if (!["add", "update", "remove"].includes(action.action)) {
      return { ok: false, failures: ['Skill action must be "add", "update", or "remove".'] };
    }
    if (typeof action.skillId !== "string" || !getSkillCatalogEntry(action.skillId)) {
      return { ok: false, failures: ["Choose a skill from the published Prism skill catalog."] };
    }
    const scope = action.scope;
    if (!SKILL_SCOPE_VALUES.includes(scope) || scope === "all") {
      return { ok: false, failures: ['Skill scope must be explicitly "project" or "global".'] };
    }
    const agents = Array.isArray(action.agents)
      ? [...new Set(action.agents.filter((agent) => typeof agent === "string"))]
      : typeof action.agent === "string"
        ? [action.agent]
        : [];
    if (agents.length === 0 || agents.some((agent) => !SKILL_AGENT_IDS.includes(agent))) {
      return {
        ok: false,
        failures: [`Choose at least one supported agent: ${SKILL_AGENT_IDS.join(", ")}.`],
      };
    }
    return { ok: true, action: action.action, skillId: action.skillId, scope, agents };
  }

  function skillOperationOptions(request, extra = {}) {
    return {
      action: request.action,
      skillId: request.skillId,
      cwd: resolvedCwd,
      scope: request.scope,
      agents: [...request.agents],
      fetchImpl,
      spawnImpl,
      ...extra,
    };
  }

  function skillPlanMaterial(request, result) {
    return {
      action: request.action,
      skillId: request.skillId,
      scope: request.scope,
      agents: [...request.agents],
      expectedPlan: isPlainObject(result?.expectedPlan) ? result.expectedPlan : null,
      command: isPlainObject(result?.command) ? result.command : null,
      targets: Array.isArray(result?.targets) ? result.targets : [],
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    };
  }

  async function previewSkillMutation(action) {
    const request = skillRequestFromAction(action);
    if (!request.ok) {
      return {
        ok: false,
        dryRun: true,
        boundary: "action",
        failures: request.failures,
        action: null,
        material: null,
        result: null,
      };
    }
    try {
      const result = await ops.skillPlan(skillOperationOptions(request));
      return {
        ...(isPlainObject(result) ? result : {}),
        ok: result?.ok === true,
        dryRun: true,
        kind: "skill",
        cwd: resolvedCwd,
        action: request.action,
        skillId: request.skillId,
        scope: request.scope,
        agents: [...request.agents],
        failures: Array.isArray(result?.failures) ? [...result.failures] : [],
        material: result?.ok === true ? skillPlanMaterial(request, result) : null,
        result,
      };
    } catch (error) {
      return {
        ok: false,
        dryRun: true,
        kind: "skill",
        boundary: "planning",
        action: request.action,
        skillId: request.skillId,
        scope: request.scope,
        agents: [...request.agents],
        failures: [errorMessage(error)],
        material: null,
        result: null,
      };
    }
  }

  async function executeSkillMutation(action, acceptedPreview) {
    const request = skillRequestFromAction(action);
    if (!request.ok) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: "action",
        failures: request.failures,
        preview: null,
        result: null,
      };
    }
    if (
      !isPlainObject(acceptedPreview) ||
      acceptedPreview.dryRun !== true ||
      acceptedPreview.ok !== true ||
      acceptedPreview.kind !== "skill" ||
      !isPlainObject(acceptedPreview.material)
    ) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: "preview",
        failures: ["executeSkillMutation requires a successful preview for the same action."],
        preview: null,
        result: null,
      };
    }
    const fresh = await previewSkillMutation(action);
    if (fresh.ok !== true) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: fresh.boundary ?? "preview",
        failures: [...fresh.failures, "The skill change was not applied."],
        preview: fresh,
        result: null,
      };
    }
    if (!isDeepStrictEqual(fresh.material, acceptedPreview.material)) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: "preview-drift",
        failures: ["The skill plan changed after review; nothing was installed or removed."],
        preview: fresh,
        result: null,
      };
    }
    let result;
    try {
      result = await ops.skillExecute(
        skillOperationOptions(request, { plan: fresh.result, confirmed: true }),
      );
    } catch (error) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: "operation",
        failures: [errorMessage(error)],
        preview: fresh,
        result: null,
      };
    }
    return {
      ok: result?.ok === true,
      applied: result?.executed === true || result?.ok === true,
      changed: result?.executed === true,
      partial: result?.executed === true && result?.ok !== true,
      boundary: typeof result?.boundary === "string" ? result.boundary : null,
      failures: Array.isArray(result?.failures) ? [...result.failures] : [],
      preview: fresh,
      result,
    };
  }

  async function checkCliUpdate(options = {}) {
    try {
      return await ops.updateCheck({ ...options, cwd: resolvedCwd, fetchImpl });
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        available: false,
        current: null,
        latest: null,
        error: errorMessage(error),
        advice: `The prism-ds update check could not finish: ${errorMessage(error)}`,
      };
    }
  }

  function updateOptions(options = {}) {
    return { ...options, cwd: resolvedCwd, fetchImpl, spawnImpl };
  }

  async function previewCliUpdate(options = {}) {
    try {
      const result = await ops.update(
        updateOptions({ ...options, dryRun: true, confirmed: false }),
      );
      const plan = isPlainObject(result?.plan) ? result.plan : null;
      return {
        ...(isPlainObject(result) ? result : {}),
        ok: result?.ok === true,
        dryRun: true,
        kind: "self-update",
        failures: Array.isArray(result?.failures) ? [...result.failures] : [],
        material:
          result?.ok === true ? { plan, plannedChanges: result.plannedChanges ?? [] } : null,
        result,
      };
    } catch (error) {
      return {
        ok: false,
        dryRun: true,
        kind: "self-update",
        failures: [errorMessage(error)],
        material: null,
        result: null,
      };
    }
  }

  async function executeCliUpdate(options, acceptedPreview) {
    if (
      !isPlainObject(acceptedPreview) ||
      acceptedPreview.kind !== "self-update" ||
      acceptedPreview.dryRun !== true ||
      acceptedPreview.ok !== true ||
      !isPlainObject(acceptedPreview.material)
    ) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: "preview",
        failures: ["executeCliUpdate requires a successful, reviewed preview."],
        preview: null,
        result: null,
      };
    }
    const fresh = await previewCliUpdate(options);
    if (fresh.ok !== true) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: fresh.boundary ?? "preview",
        failures: [...fresh.failures, "The CLI update was not applied."],
        preview: fresh,
        result: null,
      };
    }
    if (!isDeepStrictEqual(fresh.material, acceptedPreview.material)) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: "preview-drift",
        failures: ["The self-update plan changed after review; prism-ds was not updated."],
        preview: fresh,
        result: null,
      };
    }
    let result;
    try {
      result = await ops.update(
        updateOptions({
          ...options,
          dryRun: false,
          confirmed: true,
          expectedPlan: fresh.plan,
        }),
      );
    } catch (error) {
      return {
        ok: false,
        applied: false,
        changed: false,
        boundary: "operation",
        failures: [errorMessage(error)],
        preview: fresh,
        result: null,
      };
    }
    const partial = result?.partial === true || result?.state === "unverified";
    return {
      ok: result?.ok === true,
      applied: result?.changed === true || partial,
      changed: result?.changed === true,
      partial,
      boundary: typeof result?.boundary === "string" ? result.boundary : null,
      failures: Array.isArray(result?.failures) ? [...result.failures] : [],
      preview: fresh,
      result,
    };
  }

  function recoveryOptions(options = {}) {
    const { cssPath, ...rest } = options;
    return {
      cwd: resolvedCwd,
      ...rest,
      ...(typeof cssPath === "string" && cssPath.trim() !== "" ? { css: cssPath.trim() } : {}),
    };
  }

  function runRecovery(options = {}) {
    try {
      const report = ops.recoveryReport(recoveryOptions(options));
      const suggestions = ops.recoverySuggestions(report, {
        packageName: options.packageName,
        css: options.cssPath,
        entry: options.entry,
      });
      return {
        ok: report?.ok === true,
        report,
        suggestions: Array.isArray(suggestions) ? suggestions : [],
        failures: Array.isArray(report?.failures) ? [...report.failures] : [],
      };
    } catch (error) {
      return {
        ok: false,
        boundary: "recovery",
        failures: [errorMessage(error)],
        report: null,
        suggestions: [],
      };
    }
  }

  function recoveryRequest(action) {
    if (
      !isPlainObject(action) ||
      typeof action.actionId !== "string" ||
      action.actionId.trim() === ""
    ) {
      return {
        ok: false,
        failures: ["Choose an exact recovery action id from the current report."],
      };
    }
    return {
      ok: true,
      actionId: action.actionId.trim(),
      ...(typeof action.packageName === "string" ? { packageName: action.packageName } : {}),
      ...(typeof action.cssPath === "string" && action.cssPath.trim() !== ""
        ? { cssPath: action.cssPath.trim() }
        : {}),
      ...(typeof action.entry === "string" && action.entry.trim() !== ""
        ? { entry: action.entry.trim() }
        : {}),
      ...(typeof action.strict === "boolean" ? { strict: action.strict } : {}),
    };
  }

  function recoveryPlanMaterial(result) {
    return {
      actionId: result.actionId,
      kind: result.kind ?? result.suggestion?.kind ?? null,
      suggestion: result.suggestion ?? null,
      plan: result.plan ?? null,
      changes: Array.isArray(result.changes) ? result.changes : [],
    };
  }

  function previewRecoveryAction(action) {
    const request = recoveryRequest(action);
    if (!request.ok) {
      return { ok: false, boundary: "action", failures: request.failures, plan: null, changes: [] };
    }
    try {
      const result = ops.recoveryPreview(recoveryOptions(request));
      return {
        ...(isPlainObject(result) ? result : {}),
        kind: result?.kind ?? "recovery",
        dryRun: true,
        material: result?.ok === true ? recoveryPlanMaterial(result) : null,
        result,
      };
    } catch (error) {
      return {
        ok: false,
        boundary: "preview",
        failures: [errorMessage(error)],
        plan: null,
        changes: [],
        result: null,
      };
    }
  }

  function executeRecoveryAction(action, acceptedPreview) {
    const request = recoveryRequest(action);
    if (!request.ok) {
      return {
        ok: false,
        actionCompleted: false,
        repaired: false,
        healthy: false,
        boundary: "action",
        failures: request.failures,
      };
    }
    if (
      !isPlainObject(acceptedPreview) ||
      acceptedPreview.dryRun !== true ||
      acceptedPreview.ok !== true ||
      !isPlainObject(acceptedPreview.material)
    ) {
      return {
        ok: false,
        actionCompleted: false,
        repaired: false,
        healthy: false,
        boundary: "preview",
        failures: ["executeRecoveryAction requires a successful preview for this action."],
      };
    }
    const fresh = previewRecoveryAction(action);
    if (fresh.ok !== true) {
      return {
        ok: false,
        actionCompleted: false,
        repaired: false,
        healthy: false,
        boundary: fresh.boundary ?? "preview",
        failures: [...(fresh.failures ?? []), "The recovery action was not applied."],
        preview: fresh,
      };
    }
    if (!isDeepStrictEqual(fresh.material, acceptedPreview.material)) {
      return {
        ok: false,
        actionCompleted: false,
        repaired: false,
        healthy: false,
        boundary: "preview-drift",
        failures: ["The recovery plan changed after review; no repair was applied."],
        preview: fresh,
      };
    }
    try {
      return ops.recoveryExecute(
        recoveryOptions({ ...request, confirmed: true, expectedPlan: fresh.plan }),
      );
    } catch (error) {
      return {
        ok: false,
        actionCompleted: false,
        repaired: false,
        healthy: false,
        boundary: "operation",
        failures: [errorMessage(error)],
        preview: fresh,
      };
    }
  }

  function invokeMutation(request, dryRun, precondition = null, acceptedResult = null) {
    if (request.kind === "install") {
      return ops.install({
        cwd: resolvedCwd,
        package: request.packageName,
        version: request.version ?? undefined,
        saveDev: request.saveDev,
        exact: request.exact,
        registry: request.registry,
        withEntry: [...request.entries],
        peers: [...request.peers],
        fetchImpl,
        spawnImpl,
        dryRun,
      });
    }
    if (request.kind === "use") {
      const options = {
        cwd: resolvedCwd,
        package: request.packageName,
        version: request.version ?? undefined,
        saveDev: request.saveDev,
        exact: request.exact,
        strict: request.strict,
        ignore: [...request.ignore],
        checkUsage: request.checkUsage,
        tailwind: request.tailwind,
        cssPath: request.cssPath,
        registry: request.registry,
        withEntry: [...request.entries],
        peers: [...request.peers],
        fetchImpl,
        spawnImpl,
        dryRun,
      };
      if (request.skills) {
        return ops.useWithSkills({
          ...options,
          skills: true,
          skillAgents: [...request.skillAgents],
          confirmed: dryRun !== true,
          ...(!dryRun && acceptedResult !== null
            ? {
                preview: {
                  use: acceptedResult.use ?? acceptedResult,
                  skillPlan: acceptedResult.skillPlan ?? null,
                },
              }
            : {}),
          ...(precondition !== null ? { expectedConnectPlan: precondition } : {}),
        });
      }
      return ops.use({
        ...options,
        ...(precondition !== null ? { expectedConnectPlan: precondition } : {}),
      });
    }
    if (request.kind === "connect") {
      // Configure-only: never a dependency mutation and never `check: true`.
      return ops.connect({
        cwd: resolvedCwd,
        package: request.packageName ?? undefined,
        strict: request.strict,
        dryRun,
      });
    }
    if (request.kind === "switch") {
      return ops.switch({
        cwd: resolvedCwd,
        package: request.packageName,
        version: request.version,
        registry: request.registry ?? undefined,
        cssPath: request.cssPath ?? undefined,
        withEntry: [...request.entries],
        peers: [...request.peers],
        strict: request.strict,
        ignore: [...request.ignore],
        fetchImpl,
        spawnImpl,
        dryRun,
        confirmed: dryRun !== true,
        ...(acceptedResult !== null ? { expectedPlan: acceptedResult } : {}),
      });
    }
    if (request.kind === "remove") {
      return ops.remove({
        cwd: resolvedCwd,
        package: request.packageName,
        cssPath: request.cssPath ?? undefined,
        spawnImpl,
        dryRun,
        confirmed: dryRun !== true,
        ...(acceptedResult !== null ? { expectedPlan: acceptedResult } : {}),
      });
    }
    return ops.upgrade({
      cwd: resolvedCwd,
      package: request.packageName,
      version: request.version,
      strict: request.strict,
      registry: request.registry,
      withEntry: [...request.entries],
      peers: [...request.peers],
      fetchImpl,
      spawnImpl,
      ...(precondition !== null ? { expectedConnectPlan: precondition } : {}),
      dryRun,
    });
  }

  async function previewMutation(action) {
    const request = requestFromAction(action);
    if (!request.ok) {
      return failedPreview(
        resolvedCwd,
        isPlainObject(action) ? action.kind : null,
        "action",
        request.failures,
      );
    }
    let result;
    try {
      result = await invokeMutation(request, true);
    } catch (error) {
      return failedPreview(resolvedCwd, request.kind, "operation", [errorMessage(error)]);
    }
    return buildPreview(resolvedCwd, request, result);
  }

  async function executeMutation(action, acceptedPreview) {
    const request = requestFromAction(action);
    if (!request.ok) {
      return {
        ok: false,
        applied: false,
        changed: false,
        kind: null,
        boundary: "action",
        failures: request.failures,
        preview: null,
        result: null,
      };
    }
    if (
      !isPlainObject(acceptedPreview) ||
      acceptedPreview.dryRun !== true ||
      acceptedPreview.ok !== true ||
      acceptedPreview.kind !== request.kind ||
      !isPlainObject(acceptedPreview.material)
    ) {
      return {
        ok: false,
        applied: false,
        changed: false,
        kind: request.kind,
        boundary: "preview",
        failures: [
          "executeMutation requires the successful preview returned by previewMutation " +
            "for the same action; nothing was changed.",
        ],
        preview: null,
        result: null,
      };
    }

    // Re-run the dry run immediately before any change and compare the material
    // plan, not its presentation.
    const fresh = await previewMutation(action);
    if (fresh.ok !== true) {
      return {
        ok: false,
        applied: false,
        changed: false,
        kind: request.kind,
        boundary: fresh.boundary ?? "preview",
        failures: [...fresh.failures, "The change was not applied."],
        preview: fresh,
        result: null,
      };
    }
    if (!isDeepStrictEqual(fresh.material, acceptedPreview.material)) {
      return {
        ok: false,
        applied: false,
        changed: false,
        kind: request.kind,
        boundary: "preview-drift",
        failures: [
          "The plan changed after it was previewed; nothing was changed. " +
            "Preview again and confirm the new plan.",
        ],
        preview: fresh,
        result: null,
      };
    }

    let result;
    try {
      // The exact plan from the final fresh preview is the optional write
      // precondition of the real invocation; when the operation exposes no plan
      // (for example an injected fake), behavior is unchanged.
      result = await invokeMutation(
        request,
        false,
        connectPrecondition(fresh.result),
        fresh.result,
      );
    } catch (error) {
      return {
        ok: false,
        applied: false,
        changed: false,
        kind: request.kind,
        boundary: "operation",
        failures: [errorMessage(error)],
        preview: fresh,
        result: null,
      };
    }
    const partial =
      isPlainObject(result) &&
      (result.partial === true || result.boundary === "connect-precondition");
    return {
      ok: isPlainObject(result) && result.ok === true,
      applied: mutationApplied(result),
      changed: mutationChanged(result),
      ...(partial ? { partial: true } : {}),
      kind: request.kind,
      boundary: typeof result?.boundary === "string" ? result.boundary : null,
      failures: Array.isArray(result?.failures) ? [...result.failures] : [],
      preview: fresh,
      result,
    };
  }

  return {
    cwd: resolvedCwd,
    skillAgentIds: SKILL_AGENT_IDS,
    getProjectState,
    searchSystems,
    inspectSystem,
    listComponents,
    listTokens,
    runCheck,
    runDoctor,
    runUsageCheck,
    runTailwindCheck,
    listSkills,
    previewMutation,
    executeMutation,
    previewSkillMutation,
    executeSkillMutation,
    checkCliUpdate,
    previewCliUpdate,
    executeCliUpdate,
    runRecovery,
    previewRecoveryAction,
    executeRecoveryAction,
  };
}
