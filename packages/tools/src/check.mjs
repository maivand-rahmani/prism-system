#!/usr/bin/env node
/**
 * `prism-ds check` — one offline read-only report for a configured consumer.
 *
 * This is the reusable implementation behind the future `check` CLI command. It
 * answers one question for CI and agents: *is this consumer healthy?* without
 * ever installing, executing package code, accessing the network, or writing.
 *
 * It aggregates, in a deterministic order:
 *
 *   1. the consumer `.design-system/config.json` (missing or invalid fails, with
 *      an actionable `connect` hint, even though `doctor` treats absent config
 *      as informational);
 *   2. the full read-only `doctor` diagnostics (identity, installed package,
 *      manifest, contract metadata, and the Tailwind v4 bridge
 *      advertisement/export/file);
 *   3. the public `./styles.css` export: the shipped manifest target must equal
 *      the installed `package.json` export and point to a contained regular file;
 *   4. the Tailwind v4 prerequisite: if Tailwind is declared in the
 *      consumer `package.json` or resolvable as installed, the installed major
 *      must be v4; neither declared nor installed is information, not a failure;
 *   5. the CSS import order, and only when an explicit optional `cssPath` is
 *      supplied. With no `cssPath` the report never scans or guesses which CSS
 *      file is built and reports the imports `not_checked`. With a `cssPath` it
 *      performs a read-only `setupTailwind({ dryRun: true })` check: `passed`
 *      when the planner would change nothing, `failed` when imports need adding
 *      or reordering (or a setup prerequisite/path fails). It never writes.
 *   6. strict usage findings (`checkUsage({ strict: true })`);
 *   7. required/optional component availability (absent optional capabilities
 *      are reported, never treated as a failure).
 *
 * Every check is captured independently: a failure in one never aborts the
 * report, and each returns a stable status — `passed`, `failed`, `not_checked`,
 * or `not_applicable`. The top-level `ok` is false only when a required check
 * `failed`. The result is JSON-ready and deterministic.
 */

import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { CONTRACT_VERSION, assertWithin, readJsonFile } from "./constants.mjs";
import {
  CONSUMER_CONFIG_FILENAME,
  CONSUMER_DIRECTORY,
  discoverConsumerPackage,
  readConsumerConfig,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
} from "./consumer.mjs";
import { collectDoctorReport } from "./doctor.mjs";
import { checkUsage } from "./usage.mjs";
import { buildComponentCatalog } from "./components.mjs";
import { TAILWIND_PACKAGE, setupTailwind } from "./tailwind-setup.mjs";
import { detectManifestContract } from "./manifest.mjs";
import { parseExactSemver } from "./semver.mjs";

/** Stable check statuses. */
export const CHECK_STATUS = Object.freeze({
  PASSED: "passed",
  FAILED: "failed",
  NOT_CHECKED: "not_checked",
  NOT_APPLICABLE: "not_applicable",
});

/** Stable check ids, in report order. */
export const CHECK_IDS = Object.freeze({
  config: "config",
  doctor: "doctor",
  stylesExport: "styles-export",
  tailwindBridge: "tailwind-bridge",
  tailwindPrerequisite: "tailwind-prerequisite",
  cssImports: "css-imports",
  usage: "usage",
  components: "components",
});

/** Public subpath every design system exposes its ordinary stylesheet on. */
export const STYLES_EXPORT_SUBPATH = "./styles.css";

/** Required Tailwind CSS major for the bridge. */
export const TAILWIND_REQUIRED_MAJOR = 4;

const CONNECT_HINT = `Run "prism-ds connect --cwd <root>" to configure or repair this consumer.`;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read and parse JSON, returning null on any read/parse error. */
function readJsonSafe(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return readJsonFile(filePath);
  } catch {
    return null;
  }
}

function makeCheck({ id, label, status, required = false, detail, report }) {
  const check = { id, label, status, required, detail };
  if (report !== undefined) check.report = report;
  return check;
}

function passed(options) {
  return makeCheck({ ...options, status: CHECK_STATUS.PASSED });
}

function failed(options) {
  return makeCheck({ ...options, status: CHECK_STATUS.FAILED });
}

function notChecked(options) {
  return makeCheck({ ...options, status: CHECK_STATUS.NOT_CHECKED });
}

/* -------------------------------------------------------------------------- */
/* Read-only helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Read the consumer `package.json`, or null when absent/malformed. */
function readConsumerPackageJson(consumerRoot) {
  if (consumerRoot === null) return null;
  return readJsonSafe(join(consumerRoot, "package.json"));
}

const DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);

/** True when the consumer `package.json` declares the dependency in any field. */
function declaresDependency(packageJson, packageName) {
  if (!isPlainObject(packageJson)) return false;
  return DEPENDENCY_FIELDS.some(
    (field) =>
      isPlainObject(packageJson[field]) &&
      Object.prototype.hasOwnProperty.call(packageJson[field], packageName),
  );
}

/**
 * Resolve an installed package's `package.json` through public Node package
 * resolution from the consumer root, without executing package code: first the
 * `./package.json` subpath, then the package entry with a walk up to the
 * nearest `package.json` whose `name` matches. Read-only; no scripts, no
 * network.
 */
function resolveInstalledPackage({ consumerRoot, packageName }) {
  if (consumerRoot === null) return null;
  const requireFromConsumer = createRequire(join(consumerRoot, "package.json"));

  let packageJsonPath = null;
  try {
    packageJsonPath = requireFromConsumer.resolve(`${packageName}/package.json`);
  } catch {
    packageJsonPath = null;
  }
  if (packageJsonPath !== null) {
    const json = readJsonSafe(packageJsonPath);
    if (json !== null && json.name === packageName) {
      return { dir: dirname(packageJsonPath), packageJsonPath, json };
    }
  }

  let entryPath;
  try {
    entryPath = requireFromConsumer.resolve(packageName);
  } catch {
    return null;
  }
  let current = dirname(entryPath);
  for (;;) {
    const candidate = join(current, "package.json");
    const json = readJsonSafe(candidate);
    if (json !== null && json.name === packageName) {
      return { dir: current, packageJsonPath: candidate, json };
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Verify the public `./styles.css` export for the current contract: the shipped
 * manifest target must equal the installed `package.json` export and point to a
 * contained regular file inside the package directory. Returns the resolved
 * target path.
 */
function verifyStylesExport({ installed, packageName }) {
  const manifestExports = isPlainObject(installed.manifest?.exports)
    ? installed.manifest.exports
    : {};
  const declared = manifestExports[STYLES_EXPORT_SUBPATH];
  if (declared === undefined) {
    throw new Error(
      `Shipped manifest does not advertise ${JSON.stringify(
        STYLES_EXPORT_SUBPATH,
      )} in its exports map; every design system must publish its stylesheet.`,
    );
  }
  if (
    typeof declared !== "string" ||
    declared.trim().length === 0 ||
    !declared.trim().startsWith("./")
  ) {
    throw new Error(
      `Shipped manifest exports[${JSON.stringify(
        STYLES_EXPORT_SUBPATH,
      )}] must be a "./"-relative string target (received ${JSON.stringify(declared ?? null)}).`,
    );
  }
  const normalized = declared.trim();
  const packageExports = isPlainObject(installed.packageJson.exports)
    ? installed.packageJson.exports
    : {};
  const publicTarget = packageExports[STYLES_EXPORT_SUBPATH];
  if (publicTarget !== normalized) {
    throw new Error(
      `Installed "${packageName}" must expose ${JSON.stringify(
        STYLES_EXPORT_SUBPATH,
      )} as the manifest target ${JSON.stringify(normalized)} (received ${JSON.stringify(
        publicTarget ?? null,
      )}).`,
    );
  }
  const targetPath = assertWithin(
    installed.packageDir,
    join(installed.packageDir, normalized),
    `Stylesheet target for "${packageName}"`,
  );
  if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
    throw new Error(
      `Installed "${packageName}" exposes ${JSON.stringify(
        STYLES_EXPORT_SUBPATH,
      )} -> ${JSON.stringify(normalized)}, but that target is not a contained regular file.`,
    );
  }
  return targetPath;
}

/* -------------------------------------------------------------------------- */
/* Individual checks                                                          */
/* -------------------------------------------------------------------------- */

function checkConfig(state, rootErrorMessage) {
  if (state.consumerRoot === null) {
    return failed({
      id: CHECK_IDS.config,
      label: "consumer config",
      required: true,
      detail: `${rootErrorMessage ?? "Consumer root could not be resolved."} ${CONNECT_HINT}`,
    });
  }
  try {
    const config = readConsumerConfig(state.consumerRoot);
    if (config === null) {
      return failed({
        id: CHECK_IDS.config,
        label: "consumer config",
        required: true,
        detail:
          `Missing ${CONSUMER_DIRECTORY}/${CONSUMER_CONFIG_FILENAME}. ` +
          "`prism-ds check` requires a connected consumer. " +
          CONNECT_HINT,
      });
    }
    state.config = config;
    state.packageName = config.package;
    return passed({
      id: CHECK_IDS.config,
      label: "consumer config",
      required: true,
      detail: `connected to ${config.package}@${config.version} (strict ${config.strict})`,
    });
  } catch (error) {
    return failed({
      id: CHECK_IDS.config,
      label: "consumer config",
      required: true,
      detail:
        `Invalid ${CONSUMER_DIRECTORY}/${CONSUMER_CONFIG_FILENAME}: ${error.message} ` +
        CONNECT_HINT,
    });
  }
}

function checkDoctor(state, rootErrorMessage) {
  if (state.consumerRoot === null) {
    return notChecked({
      id: CHECK_IDS.doctor,
      label: "doctor diagnostics",
      detail: rootErrorMessage ?? "Consumer root could not be resolved.",
    });
  }
  try {
    const report = collectDoctorReport({ cwd: state.consumerRoot });
    state.doctorReport = report;
    const failures = report.checks.filter((check) => !check.ok);
    return makeCheck({
      id: CHECK_IDS.doctor,
      label: "doctor diagnostics",
      status: report.ok ? CHECK_STATUS.PASSED : CHECK_STATUS.FAILED,
      required: true,
      detail: report.ok
        ? "all read-only diagnostics passed"
        : failures.map((check) => `${check.label}: ${check.detail}`).join(" | "),
      report,
    });
  } catch (error) {
    return failed({
      id: CHECK_IDS.doctor,
      label: "doctor diagnostics",
      required: true,
      detail: error.message,
    });
  }
}

/** Resolve the installed design system once for the later checks. */
function resolveInstalled(state) {
  if (state.consumerRoot === null) return;
  try {
    const discovered = discoverConsumerPackage({ consumerRoot: state.consumerRoot });
    state.discovered = discovered;
    if (state.packageName === null) state.packageName = discovered.packageName;
    const installed = resolveInstalledDesignSystem({
      consumerRoot: state.consumerRoot,
      packageName: discovered.packageName,
    });
    state.installed = installed;
    state.contractVersion = detectManifestContract(installed.manifest);
    if (typeof installed.packageJson.version === "string") {
      state.version = installed.packageJson.version;
    }
  } catch (error) {
    state.resolveError = error.message;
  }
}

function checkStylesExport(state) {
  if (state.consumerRoot === null) {
    return notChecked({
      id: CHECK_IDS.stylesExport,
      label: "stylesheet export",
      detail: "Consumer root could not be resolved.",
    });
  }
  if (state.installed === null) {
    return failed({
      id: CHECK_IDS.stylesExport,
      label: "stylesheet export",
      required: true,
      detail: state.resolveError ?? "The installed design system could not be resolved.",
    });
  }
  try {
    const targetPath = verifyStylesExport({
      installed: state.installed,
      packageName: state.packageName,
    });
    return passed({
      id: CHECK_IDS.stylesExport,
      label: "stylesheet export",
      required: true,
      detail: `${STYLES_EXPORT_SUBPATH} -> ${targetPath}`,
    });
  } catch (error) {
    return failed({
      id: CHECK_IDS.stylesExport,
      label: "stylesheet export",
      required: true,
      detail: error.message,
    });
  }
}

function checkTailwindBridge(state) {
  if (state.contractVersion !== CONTRACT_VERSION) {
    return notChecked({
      id: CHECK_IDS.tailwindBridge,
      label: "tailwind bridge",
      detail: state.resolveError ?? "The manifest contract could not be determined.",
    });
  }
  const bridge = state.doctorReport?.checks?.find((check) => check.label === "tailwind bridge");
  if (!bridge) {
    return notChecked({
      id: CHECK_IDS.tailwindBridge,
      label: "tailwind bridge",
      detail: "doctor did not report a Tailwind bridge check to rely on.",
    });
  }
  return makeCheck({
    id: CHECK_IDS.tailwindBridge,
    label: "tailwind bridge",
    status: bridge.ok ? CHECK_STATUS.PASSED : CHECK_STATUS.FAILED,
    required: true,
    detail: bridge.detail,
  });
}

function checkTailwindPrerequisite(state) {
  if (state.contractVersion !== CONTRACT_VERSION) {
    return notChecked({
      id: CHECK_IDS.tailwindPrerequisite,
      label: "tailwind prerequisite",
      detail: state.resolveError ?? "The manifest contract could not be determined.",
    });
  }

  const consumerPackageJson = readConsumerPackageJson(state.consumerRoot);
  const declared = declaresDependency(consumerPackageJson, TAILWIND_PACKAGE);
  const installed = resolveInstalledPackage({
    consumerRoot: state.consumerRoot,
    packageName: TAILWIND_PACKAGE,
  });
  const installedVersion =
    installed !== null && typeof installed.json?.version === "string"
      ? installed.json.version
      : null;

  if (!declared && installed === null) {
    return notChecked({
      id: CHECK_IDS.tailwindPrerequisite,
      label: "tailwind prerequisite",
      detail:
        `${TAILWIND_PACKAGE} is neither declared nor installed; not detected ` +
        "(a normal CSS consumer does not need a Tailwind bridge).",
    });
  }
  if (installed === null) {
    return failed({
      id: CHECK_IDS.tailwindPrerequisite,
      label: "tailwind prerequisite",
      required: true,
      detail:
        `${TAILWIND_PACKAGE} is declared in the consumer package.json but is not ` +
        "installed; install Tailwind CSS v4 or remove the declaration (this command " +
        "never installs).",
    });
  }
  const parsed = parseExactSemver(installedVersion);
  if (parsed === null) {
    return failed({
      id: CHECK_IDS.tailwindPrerequisite,
      label: "tailwind prerequisite",
      required: true,
      detail:
        `Installed "${TAILWIND_PACKAGE}" has an unrecognized version ` +
        `${JSON.stringify(installedVersion)}; expected Tailwind CSS ` +
        `v${TAILWIND_REQUIRED_MAJOR}.`,
    });
  }
  if (parsed.major !== TAILWIND_REQUIRED_MAJOR) {
    return failed({
      id: CHECK_IDS.tailwindPrerequisite,
      label: "tailwind prerequisite",
      required: true,
      detail:
        `Installed "${TAILWIND_PACKAGE}" is v${installedVersion}; the design-system ` +
        `bridge requires Tailwind CSS v${TAILWIND_REQUIRED_MAJOR}.`,
    });
  }
  return passed({
    id: CHECK_IDS.tailwindPrerequisite,
    label: "tailwind prerequisite",
    required: true,
    detail: `${TAILWIND_PACKAGE} v${installedVersion} (major v${TAILWIND_REQUIRED_MAJOR})`,
  });
}

function checkCssImports(state, cssPath) {
  if (typeof cssPath !== "string" || cssPath.trim().length === 0) {
    return notChecked({
      id: CHECK_IDS.cssImports,
      label: "css imports",
      detail:
        "No explicit cssPath supplied; check does not scan for or guess which CSS " +
        "file is built.",
    });
  }
  if (state.consumerRoot === null) {
    return failed({
      id: CHECK_IDS.cssImports,
      label: "css imports",
      required: true,
      detail: "Consumer root could not be resolved.",
    });
  }

  // Read-only: a dry run never writes.
  const result = setupTailwind({
    cwd: state.consumerRoot,
    cssPath,
    dryRun: true,
  });
  if (!result.ok) {
    return failed({
      id: CHECK_IDS.cssImports,
      label: "css imports",
      required: true,
      detail: result.failures.join(" ") || "Tailwind setup check failed.",
    });
  }
  const report = {
    cssPath: result.plan?.cssPath ?? null,
    changes: result.changes,
  };
  // A dry run never writes, so `result.changed` is always false; the planner's
  // intent is on `plan.changed`.
  if (result.plan?.changed === true || result.changes.length > 0) {
    return failed({
      id: CHECK_IDS.cssImports,
      label: "css imports",
      required: true,
      detail:
        "CSS imports need adding or reordering; run setup-tailwind to write the " +
        "managed import block (this check changed nothing).",
      report,
    });
  }
  return passed({
    id: CHECK_IDS.cssImports,
    label: "css imports",
    required: true,
    detail:
      'CSS imports already load "tailwindcss", the Tailwind bridge, and the ' +
      "stylesheet in the required order.",
    report,
  });
}

function checkUsageCheck(state) {
  if (state.consumerRoot === null) {
    return notChecked({
      id: CHECK_IDS.usage,
      label: "strict usage",
      detail: "Consumer root could not be resolved.",
    });
  }
  try {
    const report = checkUsage({ cwd: state.consumerRoot, strict: true });
    return makeCheck({
      id: CHECK_IDS.usage,
      label: "strict usage",
      status: report.ok ? CHECK_STATUS.PASSED : CHECK_STATUS.FAILED,
      required: true,
      detail: report.summary,
      report,
    });
  } catch (error) {
    return failed({
      id: CHECK_IDS.usage,
      label: "strict usage",
      required: true,
      detail: error.message,
    });
  }
}

function checkComponents(state) {
  if (state.consumerRoot === null) {
    return notChecked({
      id: CHECK_IDS.components,
      label: "component availability",
      detail: "Consumer root could not be resolved.",
    });
  }
  if (state.installed === null) {
    return failed({
      id: CHECK_IDS.components,
      label: "component availability",
      required: true,
      detail: state.resolveError ?? "The installed design system could not be resolved.",
    });
  }
  try {
    const catalog = buildComponentCatalog({ manifest: state.installed.manifest });
    const missingRequired = catalog.components
      .filter((component) => component.required && !component.available)
      .map((component) => component.name);
    const availableOptional = catalog.components
      .filter((component) => component.optional && component.available)
      .map((component) => component.name);
    const status = missingRequired.length === 0 ? CHECK_STATUS.PASSED : CHECK_STATUS.FAILED;
    const detail =
      missingRequired.length === 0
        ? `all ${catalog.counts.required} required components are available; ` +
          `${availableOptional.length}/${catalog.counts.optional} optional available` +
          (availableOptional.length > 0 ? ` (${availableOptional.join(", ")})` : "")
        : `missing required component(s): ${missingRequired.join(", ")}`;
    return makeCheck({
      id: CHECK_IDS.components,
      label: "component availability",
      status,
      required: true,
      detail,
      report: catalog,
    });
  } catch (error) {
    return failed({
      id: CHECK_IDS.components,
      label: "component availability",
      required: true,
      detail: error.message,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Collect the offline `check` report for a connected consumer.
 *
 * @param {{ cwd?: string, cssPath?: string }} [options] `cwd` is the required
 *   consumer root (never falls back to a repository root). `cssPath` is the
 *   optional explicit CSS file to check import order on; when omitted the report
 *   never scans for a CSS file and marks the imports `not_checked`.
 * @returns {{
 *   ok: boolean,
 *   cwd: string | null,
 *   package: string | null,
 *   contractVersion: 4 | null,
 *   version: string | null,
 *   status: "passed" | "failed",
 *   counts: { passed: number, failed: number, not_checked: number, not_applicable: number },
 *   checks: object[],
 *   summary: string,
 * }}
 */
export function checkDesignSystem({ cwd, cssPath } = {}) {
  const state = {
    consumerRoot: null,
    packageName: null,
    contractVersion: null,
    version: null,
    config: null,
    discovered: null,
    installed: null,
    doctorReport: null,
    resolveError: null,
  };

  let rootErrorMessage = null;
  try {
    state.consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    rootErrorMessage = error.message;
  }

  const checks = [];
  checks.push(checkConfig(state, rootErrorMessage));
  checks.push(checkDoctor(state, rootErrorMessage));
  resolveInstalled(state);
  checks.push(checkStylesExport(state));
  checks.push(checkTailwindBridge(state));
  checks.push(checkTailwindPrerequisite(state));
  checks.push(checkCssImports(state, cssPath));
  checks.push(checkUsageCheck(state));
  checks.push(checkComponents(state));

  const counts = {
    passed: 0,
    failed: 0,
    not_checked: 0,
    not_applicable: 0,
  };
  for (const check of checks) counts[check.status] += 1;

  const ok = !checks.some((check) => check.required && check.status === CHECK_STATUS.FAILED);
  const identity = `${state.packageName ?? "no package"}${
    state.version ? `@${state.version}` : ""
  } (${state.contractVersion ?? "unknown contract version"})`;
  const summary =
    `prism-ds check: ${counts.passed} passed, ${counts.failed} failed, ` +
    `${counts.not_checked} not checked, ${counts.not_applicable} not applicable — ` +
    identity +
    ".";

  return {
    ok,
    cwd: state.consumerRoot,
    package: state.packageName,
    contractVersion: state.contractVersion,
    version: state.version,
    status: ok ? CHECK_STATUS.PASSED : CHECK_STATUS.FAILED,
    counts,
    checks,
    summary,
  };
}

/** Human-readable help for the future `prism-ds check` CLI command. */
export function checkHelpText() {
  return [
    "Usage: prism-ds check --cwd <consumer-root> [--css <file>]",
    "",
    "One offline, read-only health report for a connected consumer: config, doctor",
    "diagnostics, public stylesheet/bridge exports, strict usage, and component",
    "availability. The CSS import order is checked only when --css <file> is given;",
    "otherwise the report does not scan for or guess a CSS file. Nothing is written.",
    "",
    "Arguments:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --css <file>          Optional explicit CSS file to check import order on.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}
