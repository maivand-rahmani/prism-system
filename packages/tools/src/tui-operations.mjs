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
 *   listComponents()        offline public-manifest catalog.
 *   listTokens()            offline public-manifest token catalog.
 *   runCheck()              offline read-only consumer health report.
 *   runDoctor()             offline read-only diagnostics.
 *   runUsageCheck()         offline strict usage validation.
 *   runTailwindCheck()      offline read-only Tailwind planning for an
 *                           explicitly supplied CSS path; never writes.
 *   previewMutation()       runs the selected mutation operation with
 *                           `dryRun: true` and returns its structured plan.
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
export const TUI_ACTION_KINDS = Object.freeze(["install", "use", "connect", "upgrade"]);

/** Default operations: the real published implementations, nothing duplicated. */
const DEFAULT_OPERATIONS = Object.freeze({
  search: searchDesignSystems,
  inspect: inspectDesignSystem,
  install: installDesignSystem,
  use: runUseDesignSystem,
  connect: connectDesignSystem,
  upgrade: upgradeDesignSystem,
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
  if (kind === "upgrade" && version === null) {
    return {
      ok: false,
      failures: ['The "upgrade" action requires an explicit exact version.'],
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
  return {
    kind: typeof change.kind === "string" ? change.kind : "unknown",
    path: typeof change.path === "string" ? change.path : null,
  };
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
    diff: null,
    tailwind: null,
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
    return material;
  }

  material.package = typeof result?.package === "string" ? result.package : null;
  material.manager = typeof result?.manager === "string" ? result.manager : null;
  material.command = normalizeCommand(result?.command);
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
  if (result.ok !== true) return false;
  return typeof result.changed === "boolean" ? result.changed : true;
}

function mutationApplied(result) {
  if (!isPlainObject(result) || result.dryRun === true) return false;
  return result.ok === true || result.boundary === "connect-precondition";
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

  function runCheck({ cssPath } = {}) {
    try {
      return ops.check({ cwd: resolvedCwd, cssPath });
    } catch (error) {
      return { ...failure("check", error), checks: [] };
    }
  }

  function runDoctor() {
    try {
      return ops.doctor({ cwd: resolvedCwd });
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

  function invokeMutation(request, dryRun, precondition = null) {
    if (request.kind === "install") {
      return ops.install({
        cwd: resolvedCwd,
        package: request.packageName,
        version: request.version ?? undefined,
        saveDev: request.saveDev,
        exact: request.exact,
        registry: request.registry,
        fetchImpl,
        spawnImpl,
        dryRun,
      });
    }
    if (request.kind === "use") {
      return ops.use({
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
        fetchImpl,
        spawnImpl,
        ...(precondition !== null ? { expectedConnectPlan: precondition } : {}),
        dryRun,
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
    return ops.upgrade({
      cwd: resolvedCwd,
      package: request.packageName,
      version: request.version,
      strict: request.strict,
      registry: request.registry,
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
      result = await invokeMutation(request, false, connectPrecondition(fresh.result));
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
    const partial = isPlainObject(result) && result.boundary === "connect-precondition";
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
    getProjectState,
    searchSystems,
    inspectSystem,
    listComponents,
    listTokens,
    runCheck,
    runDoctor,
    runUsageCheck,
    runTailwindCheck,
    previewMutation,
    executeMutation,
  };
}
