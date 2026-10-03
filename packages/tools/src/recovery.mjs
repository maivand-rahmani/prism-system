/**
 * Project-health recovery: structured diagnosis plus safe, explicit repairs.
 *
 * This module never invents a fix. It reads the existing structured state
 * (`doctor`, `check`, consumer discovery, explicit CSS/entry checks), maps each
 * diagnosed state to a suggestion, and executes only an applicable known repair
 * plan after an exact preview and explicit confirmation:
 *
 *   - `connect` repairs reuse {@link connectDesignSystem} (the existing
 *     contract writer with its own rollback and `expectedPlan` drift guard);
 *   - `setup-tailwind` repairs reuse {@link setupTailwind} (the existing
 *     single-file planner/writer), with an explicit drift guard on the
 *     previewed plan.
 *
 * Missing packages, malformed/schema-mismatched config, missing peers, and
 * unknown errors become guidance only: an exact safe `prism-ds` command and a
 * reason, never a blind upgrade/latest and never an arbitrary command string.
 * No target package, CSS path, or peer version is guessed.
 *
 * A successful repair command never implies the whole project is healthy:
 * `executeRecoveryAction` rechecks the targeted state and reports
 * `actionCompleted`, `repaired`, and `stillRemaining` separately.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { readJsonFile } from "./constants.mjs";
import {
  CONSUMER_CONFIG_FILENAME,
  CONSUMER_DIRECTORY,
  CONSUMER_SCHEMA_VERSION,
  connectDesignSystem,
  isSupportedPackageName,
  normalizeRequestedPackage,
  readConsumerConfig,
  resolveConsumerPath,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import { CHECK_IDS, CHECK_STATUS, checkDesignSystem } from "./check.mjs";
import { collectDoctorReport } from "./doctor.mjs";
import { collectEntryPrerequisites } from "./entry-scan.mjs";
import { detectManifestContract } from "./manifest.mjs";
import { exactSemverRange, isExactSemver } from "./semver.mjs";
import { planTailwindSetup, setupTailwind } from "./tailwind-setup.mjs";

/** Stable recovery suggestion ids the executor understands. */
export const RECOVERY_ACTION_IDS = Object.freeze({
  connect: "connect",
  setupTailwind: "setup-tailwind",
});

const DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);

const PEER_ISSUE_STATUSES = Object.freeze(["missing", "out-of-range", "unevaluable-range"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonSafe(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return readJsonFile(filePath);
  } catch {
    return null;
  }
}

function findCheck(report, id) {
  return report?.checks?.find((check) => check.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

function addState(states, id, status, detail, extra = {}) {
  states.push({ id, status, detail, ...extra });
}

function makeDiagnosis() {
  return {
    config: { status: "unknown", detail: null, package: null, version: null },
    selection: {
      status: "unknown",
      detail: null,
      packageName: null,
      source: null,
      candidates: [],
    },
    installed: { status: "not_checked", detail: null, packageName: null, version: null, dir: null },
    identity: { status: "not_checked", detail: null },
    contract: {
      status: "not_checked",
      detail: null,
      schemaVersion: null,
      contractVersion: null,
    },
    connection: { status: "not_checked", detail: null },
    stylesExport: { status: "not_checked", detail: null },
    tailwindBridge: { status: "not_checked", detail: null },
    css: { status: "not_checked", detail: null, cssPath: null, changes: [] },
    entry: { status: "not_checked", detail: null, target: null, failures: [], requirements: [] },
    usage: { status: "not_checked", detail: null },
    components: { status: "not_checked", detail: null },
    doctor: { status: "unknown", failures: [] },
  };
}

function finalizeReport({ consumerRoot, states, diagnosis, doctor, check }) {
  const issues = states
    .filter((state) => state.status === "issue")
    .map((state) => ({
      id: state.id,
      severity: state.severity ?? "warning",
      kind: state.kind ?? null,
      detail: state.detail,
    }));
  const remaining = issues.map((issue) => issue.id);
  const summary =
    `prism-ds recover: ${issues.length} issue(s) at ${consumerRoot ?? "unknown root"}` +
    (remaining.length > 0 ? ` — ${remaining.join(", ")}.` : " — healthy.");
  return {
    ok: issues.length === 0,
    generated: "recovery-report",
    cwd: consumerRoot,
    package: diagnosis.selection.packageName,
    states,
    issues,
    diagnosis,
    doctor,
    check,
    summary,
  };
}

/**
 * Collect a read-only recovery report.
 *
 * Every failure is captured as a structured state; the function never throws
 * for a bad consumer root, malformed config, missing package, or failing check.
 * `css` is an explicit consumer-relative CSS file (never guessed) and `entry`
 * an explicit extension/entrypoint/file (never guessed).
 */
export function collectRecoveryReport({
  cwd,
  packageName,
  package: packageAlias,
  css,
  entry,
  includeCheck = true,
} = {}) {
  const states = [];
  const diagnosis = makeDiagnosis();
  const explicit = packageName ?? packageAlias;

  let consumerRoot = null;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    addState(states, "consumer-root", "issue", error.message, { severity: "blocker" });
    return finalizeReport({ consumerRoot: null, states, diagnosis, doctor: null, check: null });
  }
  addState(states, "consumer-root", "ok", consumerRoot);

  try {
    resolveConsumerPath(consumerRoot, CONSUMER_DIRECTORY);
    resolveConsumerPath(consumerRoot, "AGENTS.md");
    resolveConsumerPath(consumerRoot, "package.json");
    addState(
      states,
      "containment",
      "ok",
      ".design-system, AGENTS.md, and package.json stay inside --cwd",
    );
  } catch (error) {
    addState(states, "containment", "issue", error.message, { severity: "blocker" });
  }

  const packageJsonPath = join(consumerRoot, "package.json");
  let consumerPackageJson = readJsonSafe(packageJsonPath);
  if (!existsSync(packageJsonPath)) {
    addState(states, "package-json", "issue", `Missing ${packageJsonPath}.`, {
      severity: "blocker",
    });
  } else if (consumerPackageJson === null) {
    addState(states, "package-json", "issue", `Invalid JSON in ${packageJsonPath}.`, {
      severity: "blocker",
    });
  } else {
    addState(states, "package-json", "ok", packageJsonPath);
  }
  if (!isPlainObject(consumerPackageJson)) consumerPackageJson = null;

  // Consumer config: distinguish absent, malformed, schema mismatch, and other
  // invalid states structurally (never by matching error text).
  const configPath = join(consumerRoot, CONSUMER_DIRECTORY, CONSUMER_CONFIG_FILENAME);
  const configExists = existsSync(configPath);
  const rawConfig = configExists ? readJsonSafe(configPath) : null;
  let config = null;
  let configError = null;
  try {
    config = readConsumerConfig(consumerRoot);
  } catch (error) {
    configError = error.message;
  }
  if (!configExists) {
    diagnosis.config = {
      status: "missing",
      detail: `Missing ${CONSUMER_DIRECTORY}/${CONSUMER_CONFIG_FILENAME}; run connect.`,
      package: null,
      version: null,
    };
    addState(states, "consumer-config", "issue", diagnosis.config.detail, {
      severity: "blocker",
      kind: "connection-missing",
    });
  } else if (rawConfig === null) {
    diagnosis.config = {
      status: "malformed",
      detail: configError ?? `Invalid JSON in ${configPath}.`,
      package: null,
      version: null,
    };
    addState(states, "consumer-config", "issue", diagnosis.config.detail, {
      severity: "blocker",
      kind: "config-malformed",
    });
  } else if (rawConfig.schemaVersion !== CONSUMER_SCHEMA_VERSION) {
    diagnosis.config = {
      status: "schema-mismatch",
      detail:
        `Consumer config schemaVersion ${JSON.stringify(rawConfig.schemaVersion ?? null)} is not ` +
        `the supported ${CONSUMER_SCHEMA_VERSION}.`,
      package: typeof rawConfig.package === "string" ? rawConfig.package : null,
      version: typeof rawConfig.version === "string" ? rawConfig.version : null,
    };
    addState(states, "consumer-config", "issue", diagnosis.config.detail, {
      severity: "blocker",
      kind: "config-schema-mismatch",
    });
  } else if (configError !== null) {
    diagnosis.config = { status: "invalid", detail: configError, package: null, version: null };
    addState(states, "consumer-config", "issue", configError, {
      severity: "blocker",
      kind: "config-invalid",
    });
  } else {
    diagnosis.config = {
      status: "ok",
      detail: `${config.package}@${config.version}`,
      package: config.package,
      version: config.version,
    };
    addState(states, "consumer-config", "ok", diagnosis.config.detail);
  }

  // Structured package selection (explicit option, config, or dependencies).
  const candidates = [];
  if (consumerPackageJson !== null) {
    for (const field of DEPENDENCY_FIELDS) {
      const dependencies = consumerPackageJson[field];
      if (!isPlainObject(dependencies)) continue;
      for (const name of Object.keys(dependencies)) {
        if (isSupportedPackageName(name) && !candidates.includes(name)) candidates.push(name);
      }
    }
    candidates.sort();
  }
  let selected = null;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== "") {
    try {
      selected = { packageName: normalizeRequestedPackage(explicit), source: "explicit" };
      diagnosis.selection = {
        status: "ok",
        detail: `${selected.packageName} (explicit)`,
        packageName: selected.packageName,
        source: selected.source,
        candidates,
      };
      addState(states, "package-selection", "ok", diagnosis.selection.detail);
    } catch (error) {
      diagnosis.selection = {
        status: "invalid",
        detail: error.message,
        packageName: null,
        source: "explicit",
        candidates,
      };
      addState(states, "package-selection", "issue", error.message, {
        severity: "blocker",
        kind: "selection-invalid",
      });
    }
  } else if (config !== null) {
    selected = { packageName: config.package, source: "config" };
    diagnosis.selection = {
      status: "ok",
      detail: `${config.package} (config)`,
      packageName: config.package,
      source: "config",
      candidates,
    };
    addState(states, "package-selection", "ok", diagnosis.selection.detail);
  } else if (candidates.length === 1) {
    selected = { packageName: candidates[0], source: "dependency" };
    diagnosis.selection = {
      status: "ok",
      detail: `${candidates[0]} (single dependency)`,
      packageName: candidates[0],
      source: "dependency",
      candidates,
    };
    addState(states, "package-selection", "ok", diagnosis.selection.detail);
  } else if (candidates.length > 1) {
    diagnosis.selection = {
      status: "multiple",
      detail:
        `Multiple supported @prism-system/ui-* packages found (${candidates.join(", ")}); ` +
        "select one explicitly or add .design-system/config.json.",
      packageName: null,
      source: null,
      candidates,
    };
    addState(states, "package-selection", "issue", diagnosis.selection.detail, {
      severity: "blocker",
      kind: "selection-multiple",
    });
  } else {
    diagnosis.selection = {
      status: "none",
      detail: "No supported @prism-system/ui-* package found in consumer dependencies.",
      packageName: null,
      source: null,
      candidates,
    };
    addState(states, "package-selection", "issue", diagnosis.selection.detail, {
      severity: "blocker",
      kind: "selection-none",
    });
  }

  // Installed package and identity/contract state.
  let installed = null;
  if (selected !== null) {
    try {
      installed = resolveInstalledDesignSystem({
        consumerRoot,
        packageName: selected.packageName,
      });
      const version =
        typeof installed.packageJson.version === "string" ? installed.packageJson.version : null;
      diagnosis.installed = {
        status: "ok",
        detail: `${selected.packageName}@${version ?? "?"} at ${installed.packageDir}`,
        packageName: selected.packageName,
        version,
        dir: installed.packageDir,
      };
      addState(states, "installed-package", "ok", diagnosis.installed.detail);
    } catch (error) {
      diagnosis.installed = {
        status: "error",
        detail: error.message,
        packageName: selected.packageName,
        version: null,
        dir: null,
      };
      addState(states, "installed-package", "issue", error.message, {
        severity: "blocker",
        kind: "installed-missing",
      });
    }
  }

  if (installed !== null && selected !== null) {
    const contractVersion = detectManifestContract(installed.manifest);
    diagnosis.contract = {
      status: contractVersion === null ? "unsupported" : "ok",
      detail:
        contractVersion === null
          ? `Installed manifest schemaVersion ${JSON.stringify(
              installed.manifest?.schemaVersion ?? null,
            )}/contractVersion ${JSON.stringify(
              installed.manifest?.contractVersion ?? null,
            )} is not the supported schemaVersion 5/contractVersion 4.`
          : `schemaVersion 5 / contractVersion ${contractVersion}`,
      schemaVersion: installed.manifest?.schemaVersion ?? null,
      contractVersion: installed.manifest?.contractVersion ?? null,
    };
    if (contractVersion === null) {
      addState(states, "contract", "issue", diagnosis.contract.detail, {
        severity: "blocker",
        kind: "contract-unsupported",
      });
    } else {
      addState(states, "contract", "ok", diagnosis.contract.detail);
    }
    try {
      verifyConsumerDesignSystem({
        packageName: selected.packageName,
        expectedVersion: null,
        installed,
      });
      diagnosis.identity = { status: "ok", detail: "exact identity/version/contract match" };
      addState(states, "identity", "ok", diagnosis.identity.detail);
    } catch (error) {
      diagnosis.identity = { status: "invalid", detail: error.message };
      addState(states, "identity", "issue", error.message, {
        severity: "blocker",
        kind: "identity-invalid",
      });
    }
  }

  // Connection state (config vs installed identity).
  if (selected !== null && installed !== null && diagnosis.identity.status === "ok") {
    if (diagnosis.config.status === "ok") {
      if (config.package !== selected.packageName) {
        diagnosis.connection = {
          status: "package-mismatch",
          detail: `Config selects ${config.package}, but the recovery target is ${selected.packageName}.`,
        };
        addState(states, "connection", "issue", diagnosis.connection.detail, {
          severity: "blocker",
          kind: "connection-package-mismatch",
        });
      } else if (config.version !== installed.packageJson.version) {
        diagnosis.connection = {
          status: "stale",
          detail:
            `Config version ${JSON.stringify(config.version)} does not match the installed ` +
            `version ${JSON.stringify(installed.packageJson.version)}.`,
        };
        addState(states, "connection", "issue", diagnosis.connection.detail, {
          severity: "blocker",
          kind: "connection-stale",
        });
      } else {
        diagnosis.connection = {
          status: "ok",
          detail: `Connected to ${config.package}@${config.version}.`,
        };
        addState(states, "connection", "ok", diagnosis.connection.detail);
      }
    } else if (diagnosis.config.status === "missing") {
      diagnosis.connection = {
        status: "missing",
        detail: `No ${CONSUMER_DIRECTORY}/${CONSUMER_CONFIG_FILENAME}; the installed package is not connected.`,
      };
      addState(states, "connection", "issue", diagnosis.connection.detail, {
        severity: "blocker",
        kind: "connection-missing",
      });
    } else {
      diagnosis.connection = { status: "invalid", detail: diagnosis.config.detail };
      addState(
        states,
        "connection",
        "issue",
        `Cannot verify the connection: ${diagnosis.config.detail}`,
        {
          severity: "blocker",
          kind: "connection-invalid",
        },
      );
    }
  }

  // Doctor diagnostics (read-only).
  let doctor = null;
  try {
    doctor = collectDoctorReport({
      cwd: consumerRoot,
      package: selected?.packageName ?? explicit,
      entry,
    });
  } catch (error) {
    addState(states, "doctor", "issue", error.message, { severity: "warning", kind: "doctor" });
  }
  if (doctor !== null) {
    const failures = doctor.checks.filter((check) => !check.ok);
    diagnosis.doctor = {
      status: failures.length === 0 ? "ok" : "issue",
      failures: failures.map((check) => ({ label: check.label, detail: check.detail })),
    };
  }

  // Aggregated check report (read-only; CSS only for an explicit path).
  let check = null;
  if (includeCheck) {
    try {
      check = checkDesignSystem({ cwd: consumerRoot, cssPath: css, entry });
    } catch (error) {
      addState(states, "check", "issue", error.message, { severity: "warning", kind: "check" });
    }
  }
  if (check !== null) {
    const styles = findCheck(check, CHECK_IDS.stylesExport);
    if (styles) {
      diagnosis.stylesExport = { status: styles.status, detail: styles.detail };
      addState(
        states,
        "styles-export",
        styles.status === CHECK_STATUS.PASSED ? "ok" : "issue",
        styles.detail,
        styles.status === CHECK_STATUS.PASSED ? {} : { severity: "blocker", kind: "styles-export" },
      );
    }
    const bridge = findCheck(check, CHECK_IDS.tailwindBridge);
    if (bridge) {
      diagnosis.tailwindBridge = { status: bridge.status, detail: bridge.detail };
      addState(
        states,
        "tailwind-bridge",
        bridge.status === CHECK_STATUS.PASSED ? "ok" : "issue",
        bridge.detail,
        bridge.status === CHECK_STATUS.PASSED
          ? {}
          : { severity: "blocker", kind: "tailwind-bridge" },
      );
    }
    const cssCheck = findCheck(check, CHECK_IDS.cssImports);
    if (cssCheck) {
      if (cssCheck.status === CHECK_STATUS.PASSED) {
        diagnosis.css = {
          status: "ok",
          detail: cssCheck.detail,
          cssPath: cssCheck.report?.cssPath ?? (typeof css === "string" ? css : null),
          changes: [],
        };
        addState(states, "css-imports", "ok", cssCheck.detail);
      } else if (
        cssCheck.status === CHECK_STATUS.FAILED &&
        Array.isArray(cssCheck.report?.changes)
      ) {
        diagnosis.css = {
          status: "needs-update",
          detail: cssCheck.detail,
          cssPath: cssCheck.report?.cssPath ?? (typeof css === "string" ? css : null),
          changes: cssCheck.report.changes,
        };
        addState(states, "css-imports", "issue", cssCheck.detail, {
          severity: "warning",
          kind: "css-imports",
        });
      } else if (cssCheck.status === CHECK_STATUS.FAILED) {
        diagnosis.css = {
          status: "failed",
          detail: cssCheck.detail,
          cssPath: typeof css === "string" ? css : null,
          changes: [],
        };
        addState(states, "css-imports", "issue", cssCheck.detail, {
          severity: "warning",
          kind: "css-prerequisite",
        });
      } else {
        diagnosis.css = {
          status: "not_checked",
          detail: cssCheck.detail,
          cssPath: typeof css === "string" ? css : null,
          changes: [],
        };
        addState(states, "css-imports", "not_checked", cssCheck.detail);
      }
    }
    const entryCheck = findCheck(check, CHECK_IDS.entry);
    if (entryCheck && entryCheck.status !== CHECK_STATUS.NOT_CHECKED) {
      const requirements = entryCheck.report?.requirements ?? [];
      const ok = entryCheck.status === CHECK_STATUS.PASSED;
      diagnosis.entry = {
        status: ok ? "ok" : "issue",
        detail: entryCheck.detail,
        target: entryCheck.report?.entry ?? entry ?? null,
        failures: ok ? [] : [entryCheck.detail],
        requirements,
      };
      addState(states, "entry-prerequisites", ok ? "ok" : "issue", entryCheck.detail, {
        ...(ok ? {} : { severity: "blocker", kind: "entry-prerequisites" }),
      });
    }
    const usage = findCheck(check, CHECK_IDS.usage);
    if (usage && usage.status !== CHECK_STATUS.NOT_CHECKED) {
      const ok = usage.status === CHECK_STATUS.PASSED;
      diagnosis.usage = { status: ok ? "ok" : "issue", detail: usage.detail };
      addState(states, "usage", ok ? "ok" : "issue", usage.detail, {
        ...(ok ? {} : { severity: "warning", kind: "usage" }),
      });
    }
    const components = findCheck(check, CHECK_IDS.components);
    if (components && components.status !== CHECK_STATUS.NOT_CHECKED) {
      const ok = components.status === CHECK_STATUS.PASSED;
      diagnosis.components = { status: ok ? "ok" : "issue", detail: components.detail };
      addState(states, "components", ok ? "ok" : "issue", components.detail, {
        ...(ok ? {} : { severity: "blocker", kind: "components" }),
      });
    }
  } else if (entry !== undefined && entry !== null && String(entry).trim() !== "" && installed) {
    // Fallback when the aggregated check is disabled: structured entry scan only.
    const result = collectEntryPrerequisites({
      consumerRoot,
      packageName: selected.packageName,
      manifest: installed.manifest,
      installed,
      entry,
    });
    const requirements = result.report?.requirements ?? [];
    diagnosis.entry = {
      status: result.ok ? "ok" : "issue",
      detail: result.ok ? "entry prerequisites satisfied" : result.failures.join(" "),
      target: result.report?.entry ?? String(entry).trim(),
      failures: result.failures,
      requirements,
    };
    addState(
      states,
      "entry-prerequisites",
      result.ok ? "ok" : "issue",
      diagnosis.entry.detail,
      result.ok ? {} : { severity: "blocker", kind: "entry-prerequisites" },
    );
  }

  return finalizeReport({ consumerRoot, states, diagnosis, doctor, check });
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                */
/* -------------------------------------------------------------------------- */

function suggestion({
  id,
  label,
  reason,
  args,
  kind,
  risk = "low",
  executable = false,
  requiresConfirmation = false,
  extra = {},
}) {
  return {
    id,
    label,
    reason,
    command: { bin: "prism-ds", args },
    kind,
    risk,
    executable,
    requiresConfirmation,
    ...extra,
  };
}

/**
 * Map a recovery report to deterministic, safe suggestions.
 *
 * Only `connect` and `setup-tailwind` are executable, and only for a known
 * installed package or an explicit CSS file. Everything else is guidance with
 * an exact safe command and a reason.
 */
export function buildRecoverySuggestions(report, context = {}) {
  if (!isPlainObject(report)) return [];
  const root = typeof report.cwd === "string" ? report.cwd : null;
  if (root === null) {
    return [
      suggestion({
        id: "manual-review",
        label: "Run recover from a valid consumer root",
        reason: report.issues?.[0]?.detail ?? "The consumer root could not be resolved.",
        args: ["doctor", "--cwd", "<consumer-root>"],
        kind: "manual",
      }),
    ];
  }
  const diagnosis = report.diagnosis ?? {};
  const selection = diagnosis.selection ?? {};
  const config = diagnosis.config ?? {};
  const connection = diagnosis.connection ?? {};
  const cssPath =
    typeof diagnosis.css?.cssPath === "string" && diagnosis.css.cssPath !== ""
      ? diagnosis.css.cssPath
      : typeof context.css === "string"
        ? context.css
        : null;
  const entryTarget =
    typeof diagnosis.entry?.target === "string" && diagnosis.entry.target !== ""
      ? diagnosis.entry.target
      : typeof context.entry === "string"
        ? context.entry
        : null;
  const suggestions = [];
  const installedOk =
    diagnosis.installed?.status === "ok" &&
    diagnosis.identity?.status === "ok" &&
    diagnosis.contract?.status === "ok";
  const connectable =
    installedOk &&
    selection.status === "ok" &&
    (connection.status === "missing" ||
      connection.status === "stale" ||
      (connection.status === "package-mismatch" && selection.source === "explicit"));
  if (connectable) {
    const args = ["connect"];
    if (selection.source === "explicit") args.push(selection.packageName);
    args.push("--cwd", root);
    suggestions.push(
      suggestion({
        id: RECOVERY_ACTION_IDS.connect,
        label: "Reconnect the consumer contract",
        reason: connection.detail ?? "The consumer contract needs to be written.",
        args,
        kind: "connect",
        executable: true,
        requiresConfirmation: true,
        extra: { packageName: selection.packageName },
      }),
    );
  }

  if (diagnosis.css?.status === "needs-update" && cssPath !== null) {
    suggestions.push(
      suggestion({
        id: RECOVERY_ACTION_IDS.setupTailwind,
        label: "Update the Tailwind bridge imports",
        reason:
          diagnosis.css.detail ??
          "The explicit CSS file needs the Tailwind bridge imports added or reordered.",
        args: ["setup-tailwind", "--cwd", root, "--css", cssPath],
        kind: "setup-tailwind",
        executable: true,
        requiresConfirmation: true,
        extra: { cssPath },
      }),
    );
  } else if (diagnosis.css?.status === "failed" && cssPath !== null) {
    suggestions.push(
      suggestion({
        id: "css-prerequisite",
        label: "Resolve the Tailwind/CSS prerequisite",
        reason:
          diagnosis.css.detail ??
          "The Tailwind bridge cannot be planned for this explicit CSS file.",
        args: ["setup-tailwind", "--cwd", root, "--css", cssPath],
        kind: "manual",
        extra: { cssPath },
      }),
    );
  }

  if (selection.status === "multiple" && selection.packageName === null) {
    suggestions.push(
      suggestion({
        id: "select-package",
        label: "Choose the design system explicitly",
        reason: selection.detail,
        args: ["doctor", "--cwd", root],
        kind: "manual",
      }),
    );
  }
  if (selection.status === "none" || selection.status === "invalid") {
    suggestions.push(
      suggestion({
        id: "install-design-system",
        label: "Install a design system explicitly",
        reason: selection.detail,
        args: ["search"],
        kind: "manual",
      }),
    );
  }

  if (config.status === "malformed" || config.status === "invalid") {
    suggestions.push(
      suggestion({
        id: "repair-config",
        label: "Repair the consumer config",
        reason:
          `${config.detail} Fix or remove ` +
          `${CONSUMER_DIRECTORY}/${CONSUMER_CONFIG_FILENAME} and run connect again.`,
        args: ["doctor", "--cwd", root],
        kind: "manual",
      }),
    );
  }
  if (config.status === "schema-mismatch") {
    suggestions.push(
      suggestion({
        id: "upgrade-cli",
        label: "Upgrade prism-ds in lockstep",
        reason: `${config.detail} Upgrade prism-ds to the version that matches this config schema.`,
        args: ["self-update", "--check", "--cwd", root],
        kind: "manual",
      }),
    );
  }

  if (diagnosis.installed?.status === "error" && selection.packageName !== null) {
    const args = ["install", selection.packageName];
    if (
      config.status === "ok" &&
      typeof config.version === "string" &&
      isExactSemver(config.version)
    ) {
      args.push(config.version);
    }
    args.push("--cwd", root);
    suggestions.push(
      suggestion({
        id: "install-package",
        label: `Install ${selection.packageName} explicitly`,
        reason: diagnosis.installed.detail,
        args,
        kind: "manual",
        risk: "medium",
        requiresConfirmation: true,
      }),
    );
  }

  if (diagnosis.contract?.status === "unsupported") {
    suggestions.push(
      suggestion({
        id: "upgrade-cli-contract",
        label: "Upgrade prism-ds for the installed manifest",
        reason: `${diagnosis.contract.detail} Upgrade prism-ds in lockstep with the installed design system.`,
        args: ["self-update", "--check", "--cwd", root],
        kind: "manual",
      }),
    );
  }

  if (diagnosis.identity?.status === "invalid") {
    suggestions.push(
      suggestion({
        id: "reinstall-package",
        label: "Repair the installed package",
        reason: diagnosis.identity.detail,
        args: ["doctor", "--cwd", root],
        kind: "manual",
        risk: "medium",
      }),
    );
  }

  const requirements = diagnosis.entry?.requirements ?? [];
  for (const requirement of requirements) {
    if (requirement.kind !== "peer") continue;
    if (!PEER_ISSUE_STATUSES.includes(requirement.status)) continue;
    const exact = exactSemverRange(requirement.range);
    const installed = requirement.installed ?? null;
    const targetArgs = ["doctor", "--cwd", root];
    if (entryTarget !== null) targetArgs.push("--entry", entryTarget);
    suggestions.push(
      suggestion({
        id: `peer-${requirement.name}`,
        label: `Resolve peer ${requirement.name} explicitly`,
        reason:
          `Entry ${entryTarget ?? "(explicit)"} requires peer ${requirement.name} ` +
          `(${requirement.range}); installed: ${installed ?? "none"}. ` +
          (exact !== null
            ? `Install the declared exact version explicitly (for example with --peer ` +
              `${requirement.name}@${exact}).`
            : "Choose an exact version satisfying the declared range and install it explicitly."),
        args: targetArgs,
        kind: "manual",
        risk: "medium",
        requiresConfirmation: true,
        extra: {
          peer: {
            name: requirement.name,
            range: requirement.range,
            installed,
            suggestedVersion: exact,
          },
        },
      }),
    );
  }
  const hasPeerSuggestion = suggestions.some((item) => item.id.startsWith("peer-"));
  if (diagnosis.entry?.status === "issue" && !hasPeerSuggestion && entryTarget !== null) {
    suggestions.push(
      suggestion({
        id: "entry-prerequisites",
        label: "Review entry prerequisites",
        reason: diagnosis.entry.detail,
        args: ["doctor", "--cwd", root, "--entry", entryTarget],
        kind: "manual",
      }),
    );
  }

  if (diagnosis.usage?.status === "issue") {
    suggestions.push(
      suggestion({
        id: "usage",
        label: "Review strict usage findings",
        reason: diagnosis.usage.detail,
        args: ["check-usage", "--cwd", root],
        kind: "manual",
      }),
    );
  }
  if (diagnosis.components?.status === "issue") {
    suggestions.push(
      suggestion({
        id: "components",
        label: "Review component availability",
        reason: diagnosis.components.detail,
        args: ["components", "--cwd", root],
        kind: "manual",
      }),
    );
  }
  if (diagnosis.stylesExport?.status === "issue") {
    suggestions.push(
      suggestion({
        id: "styles-export",
        label: "Review the stylesheet export",
        reason: diagnosis.stylesExport.detail,
        args: ["check", "--cwd", root],
        kind: "manual",
      }),
    );
  }
  if (diagnosis.tailwindBridge?.status === "issue") {
    suggestions.push(
      suggestion({
        id: "tailwind-bridge",
        label: "Review the Tailwind bridge export",
        reason: diagnosis.tailwindBridge.detail,
        args: ["doctor", "--cwd", root],
        kind: "manual",
      }),
    );
  }

  if (suggestions.length === 0 && report.ok === false) {
    const firstIssue = report.issues?.[0];
    suggestions.push(
      suggestion({
        id: "manual-review",
        label: "Review the project state manually",
        reason:
          firstIssue?.detail ?? "The recovery report found issues without an automatic repair.",
        args: ["doctor", "--cwd", root],
        kind: "manual",
      }),
    );
  }
  return suggestions;
}

/* -------------------------------------------------------------------------- */
/* Preview and execution                                                      */
/* -------------------------------------------------------------------------- */

function findSuggestion(cwd, actionId, { packageName, css, entry } = {}) {
  const report = collectRecoveryReport({ cwd, packageName, css, entry });
  const suggestions = buildRecoverySuggestions(report, { packageName, css, entry });
  const match = suggestions.find((item) => item.id === actionId);
  return { report, suggestions, match };
}

/**
 * Preview one suggested action without writing anything. Only executable
 * suggestions can be previewed; everything else fails closed with its reason.
 */
export function previewRecoveryAction({
  cwd,
  actionId,
  packageName,
  package: packageAlias,
  css,
  entry,
  strict,
} = {}) {
  const requested = typeof actionId === "string" ? actionId.trim() : "";
  if (requested === "") {
    return {
      ok: false,
      boundary: "action",
      actionId: actionId ?? null,
      failures: ["previewRecoveryAction requires an exact actionId."],
      suggestion: null,
      report: null,
      plan: null,
      changes: [],
    };
  }
  const explicit = packageName ?? packageAlias;
  const { report, match } = findSuggestion(cwd, requested, { packageName: explicit, css, entry });
  if (!match) {
    return {
      ok: false,
      boundary: "action",
      actionId: requested,
      failures: [
        `Unknown recovery action ${JSON.stringify(requested)}; it is not suggested for the ` +
          "current state.",
      ],
      suggestion: null,
      report,
      plan: null,
      changes: [],
    };
  }
  if (match.executable !== true) {
    return {
      ok: false,
      boundary: "not-executable",
      actionId: requested,
      failures: [`Recovery action "${match.id}" is guidance only: ${match.reason}`],
      suggestion: match,
      report,
      plan: null,
      changes: [],
    };
  }
  if (match.kind === "connect") {
    const result = connectDesignSystem({
      cwd: report.cwd,
      package: match.packageName,
      strict,
      check: true,
    });
    if (!result.ok) {
      return {
        ok: false,
        boundary: "preview",
        actionId: requested,
        failures: result.failures,
        suggestion: match,
        report,
        plan: null,
        changes: [],
      };
    }
    return {
      ok: true,
      actionId: requested,
      kind: "connect",
      risk: match.risk,
      requiresConfirmation: true,
      suggestion: match,
      report,
      plan: result.plan,
      changes: result.changes,
    };
  }
  if (match.kind === "setup-tailwind") {
    const result = setupTailwind({
      cwd: report.cwd,
      cssPath: match.cssPath ?? css,
      dryRun: true,
    });
    if (!result.ok) {
      return {
        ok: false,
        boundary: "preview",
        actionId: requested,
        failures: result.failures,
        suggestion: match,
        report,
        plan: null,
        changes: [],
      };
    }
    return {
      ok: true,
      actionId: requested,
      kind: "setup-tailwind",
      risk: match.risk,
      requiresConfirmation: true,
      suggestion: match,
      report,
      plan: result.plan,
      changes: result.changes,
    };
  }
  return {
    ok: false,
    boundary: "action",
    actionId: requested,
    failures: [`Recovery action "${match.id}" has no executable repair plan.`],
    suggestion: match,
    report,
    plan: null,
    changes: [],
  };
}

function tailwindPlanDifference(expected, actual) {
  const details = [];
  for (const field of ["consumerRoot", "cssPath", "packageName", "version"]) {
    if (expected?.[field] !== actual?.[field]) details.push(`${field} changed`);
  }
  if (expected?.before !== actual?.before) details.push("CSS content changed");
  if (expected?.after !== actual?.after) details.push("planned CSS content changed");
  return details;
}

function actionTargetIds(kind) {
  return kind === "connect" ? ["connection"] : ["css-imports"];
}

/**
 * Execute one suggested action after preview and explicit confirmation.
 *
 * The action is resolved by exact id against the current report; a missing or
 * non-executable suggestion fails closed. `expectedPlan` (from
 * {@link previewRecoveryAction}) is enforced before any write. After the
 * repair, targeted health is rechecked and reported separately from the overall
 * project health — a successful command never implies the project is healthy.
 */
export function executeRecoveryAction({
  cwd,
  actionId,
  confirmed = false,
  expectedPlan,
  packageName,
  package: packageAlias,
  css,
  entry,
  strict,
} = {}) {
  const requested = typeof actionId === "string" ? actionId.trim() : "";
  const base = {
    actionId: requested === "" ? (actionId ?? null) : requested,
    actionCompleted: false,
    repaired: false,
    healthy: false,
    stillRemaining: [],
    targetIssueIds: [],
    failures: [],
    preview: null,
    actionResult: null,
    reportBefore: null,
    reportAfter: null,
  };
  if (confirmed !== true) {
    return {
      ...base,
      ok: false,
      boundary: "consent",
      failures: [
        `Recovery action ${JSON.stringify(base.actionId)} requires explicit confirmation ` +
          "(--yes); no files were written.",
      ],
    };
  }
  const explicit = packageName ?? packageAlias;
  const preview = previewRecoveryAction({
    cwd,
    actionId: requested,
    packageName: explicit,
    css,
    entry,
    strict,
  });
  if (!preview.ok) {
    return {
      ...base,
      ok: false,
      boundary: preview.boundary,
      failures: preview.failures,
      preview,
      reportBefore: preview.report ?? null,
    };
  }
  const { suggestion } = preview;
  const targetIds = actionTargetIds(preview.kind);
  let actionResult;
  if (preview.kind === "connect") {
    actionResult = connectDesignSystem({
      cwd: preview.plan.consumerRoot,
      package: suggestion.packageName,
      strict,
      expectedPlan,
    });
  } else if (preview.kind === "setup-tailwind") {
    const cssPath = suggestion.cssPath ?? css;
    if (expectedPlan !== undefined && expectedPlan !== null) {
      let currentPlan;
      try {
        currentPlan = planTailwindSetup({ cwd: preview.plan.consumerRoot, cssPath });
      } catch (error) {
        return {
          ...base,
          ok: false,
          boundary: "precondition",
          failures: [
            `Refusing to write ${cssPath}: the plan can no longer be recomputed ` +
              `(${error.message}). No files were written.`,
          ],
          preview,
          reportBefore: preview.report,
        };
      }
      const differences = tailwindPlanDifference(expectedPlan, currentPlan);
      if (differences.length > 0) {
        return {
          ...base,
          ok: false,
          boundary: "precondition",
          failures: [
            "Refusing to write the CSS file: the current plan no longer matches the previewed " +
              `plan (${differences.join("; ")}). No files were written.`,
          ],
          preview,
          reportBefore: preview.report,
        };
      }
    }
    actionResult = setupTailwind({ cwd: preview.plan.consumerRoot, cssPath });
  } else {
    return {
      ...base,
      ok: false,
      boundary: "action",
      failures: [`Recovery action "${suggestion.id}" has no executable repair plan.`],
      preview,
      reportBefore: preview.report,
    };
  }

  const reportAfter = collectRecoveryReport({
    cwd: preview.plan.consumerRoot ?? cwd,
    packageName: suggestion.packageName ?? explicit,
    css,
    entry,
  });
  const actionCompleted = actionResult.ok === true;
  const targetStillFailed = reportAfter.issues.some((issue) => targetIds.includes(issue.id));
  const repaired = actionCompleted && !targetStillFailed;
  return {
    ...base,
    // `ok` reports whether the repair action completed; it never implies health.
    ok: actionCompleted,
    boundary: actionCompleted ? null : "action",
    kind: preview.kind,
    actionCompleted,
    repaired,
    healthy: reportAfter.ok,
    stillRemaining: reportAfter.issues.map((issue) => issue.id),
    targetIssueIds: targetIds,
    failures: actionResult.failures ?? [],
    preview,
    actionResult,
    reportBefore: preview.report,
    reportAfter,
  };
}

/** Human-readable help for the `prism-ds recover` command. */
export function recoverHelpText() {
  return [
    "Usage: prism-ds recover --cwd <consumer-root> [--package <name>] [--css <file>]",
    "                        [--entry <path-or-extension>] [--action <id> --yes]",
    "",
    "Read-only project-health recovery: collect a structured report and list safe,",
    "explicit suggestions. Nothing is written by default.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --package <name>      Optional explicit design-system package or system id.",
    "  --css <file>          Optional explicit CSS file to inspect (never guessed).",
    "  --entry <path-or-extension>  Optional explicit entry to scan (never guessed).",
    "  --action <id>         Preview one exact suggested action (executable only).",
    "  --yes                 Execute the previewed action; requires --action.",
    "  -h, --help            Show this help.",
    "",
    "Only connect and setup-tailwind repairs are executable, and only for a known",
    "installed package or an explicit CSS file. Everything else is guidance with an",
    "exact safe command. A successful repair never implies the whole project is",
    "healthy; the targeted state is rechecked and remaining issues are reported.",
    "",
  ].join("\n");
}
