#!/usr/bin/env node
/**
 * `prism-ds` — the published tooling for `@prism-system` design systems.
 *
 * Commands:
 *
 *   prism-ds search [query...] [--registry <url>] [--size <1..250>] [--json]
 *   prism-ds info <package-or-id> [version] [--registry <url>] [--json]
 *   prism-ds install <package-or-id> [version] --cwd <root> [--save-dev|--save-prod]
 *     [--exact] [--registry <url>]
 *   prism-ds use <package-or-id> [version] --cwd <root> [install options]
 *     [--strict|--no-strict] [--ignore <glob>...] [--check-usage]
 *   prism-ds connect [package] --cwd <root> [--strict|--no-strict] [--check] [--dry-run]
 *   prism-ds check-usage --cwd <root> [--ignore <glob>] [--strict|--no-strict]
 *   prism-ds doctor [package] --cwd <root>
 *
 * Boundaries: `search`/`info` are explicit network, read-only. `install`/`use`
 * are the only commands that mutate consumer dependencies (via a fixed npm/pnpm
 * command). `connect`/`check-usage`/`doctor` are offline and never edit
 * dependencies. No postinstall, no source copying, no publishing, and no hidden
 * package selection. TypeScript is lazy-loaded only for `check-usage`.
 */

import { readFileSync } from "node:fs";

import { connectDesignSystem } from "./consumer.mjs";
import { collectDoctorReport, doctorHelpText } from "./doctor.mjs";

/** Published executable name. */
export const CLI_NAME = "prism-ds";

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function helpText() {
  return [
    `${CLI_NAME} ${readPackageVersion()} — @prism-system design-system tools`,
    "",
    "Find, inspect, install, configure, and validate @prism-system design systems.",
    "",
    "Usage:",
    `  ${CLI_NAME} search [query...] [--registry <url>] [--size <1..250>] [--json]`,
    `  ${CLI_NAME} info <package-or-id> [version] [--registry <url>] [--json]`,
    `  ${CLI_NAME} install <package-or-id> [version] --cwd <root> [options]`,
    `  ${CLI_NAME} use <package-or-id> [version] --cwd <root> [options]`,
    `  ${CLI_NAME} connect [package] --cwd <root> [options]`,
    `  ${CLI_NAME} check-usage --cwd <root> [options]`,
    `  ${CLI_NAME} doctor [package] --cwd <root>`,
    `  ${CLI_NAME} --help`,
    "",
    "Commands:",
    "  search       Search the npm registry for supported @prism-system/ui-* styles.",
    "  info         Inspect a published style's manifest from the registry.",
    "  install      Explicitly install a style into a consumer (npm or pnpm).",
    "  use          Install, verify, and connect a style; optional strict usage check.",
    "  connect      Configure an already-installed style in a consumer.",
    "  check-usage  Deterministically validate strict usage with the TypeScript AST.",
    "  doctor       Read-only diagnostics: containment, discovery, manifest, config.",
    "",
    "Boundaries:",
    "  search/info              explicit network, read-only.",
    "  install/use              the only commands that mutate consumer dependencies;",
    "                           they run npm/pnpm with --ignore-scripts and fixed args.",
    "  connect/check-usage/doctor  offline; never edit dependencies.",
    "  No postinstall, no source copying, no publishing, no hidden package selection.",
    "",
    "Run a command with --help for its options.",
    "",
  ].join("\n");
}

export function connectHelpText() {
  return [
    `Usage: ${CLI_NAME} connect [package] --cwd <consumer-root> [options]`,
    "",
    "Configure an already-installed @prism-system design system in a consumer",
    "repository. Writes .design-system/config.json, .design-system/AGENTS.md, and an",
    "idempotent managed block in the consumer root AGENTS.md. Offline and",
    "configure-only: never installs packages, edits dependencies, copies source, or",
    "mutates the design-system repo.",
    "",
    "Arguments:",
    "  [package]             Optional package name or system id. When omitted, discovery",
    "                        uses .design-system/config.json, then package.json",
    '                        "designSystem" metadata, then a single dependency.',
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --strict              Enable strict mode (default true).",
    "  --no-strict           Disable strict mode.",
    "  --check               Report whether the consumer contract is up to date; write nothing.",
    "  --dry-run             Show planned writes without writing.",
    "  -h, --help            Show this help.",
    "",
    "Exit code is non-zero for every failed discovery, verification, or write.",
    "",
  ].join("\n");
}

export function searchHelpText() {
  return [
    `Usage: ${CLI_NAME} search [query...] [options]`,
    "",
    "Search the npm registry for supported @prism-system/ui-* design systems.",
    "Explicit network, read-only: nothing is installed, written, or selected.",
    "",
    "Arguments:",
    "  [query...]            Optional words. When omitted, lists supported styles.",
    "",
    "Options:",
    "  --registry <url>      Registry base URL (default: public npm registry).",
    "  --size <1..250>       Maximum results to request (default 25).",
    "  --json                Emit stable JSON (name, version, description, keywords).",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function infoHelpText() {
  return [
    `Usage: ${CLI_NAME} info <package-or-id> [version] [options]`,
    "",
    "Fetch and validate a published design system's manifest from the registry.",
    "Explicit network, read-only: the tarball is read and parsed in memory only.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  [version]             Optional exact semver; defaults to dist-tags.latest.",
    "",
    "Options:",
    "  --registry <url>      Registry base URL (default: public npm registry).",
    "  --json                Emit stable JSON including the validated full manifest.",
    "  -h, --help            Show this help.",
    "",
    "Tags, ranges, aliases, and git/file/workspace specs are rejected.",
    "",
  ].join("\n");
}

export function installHelpText() {
  return [
    `Usage: ${CLI_NAME} install <package-or-id> [version] --cwd <consumer-root> [options]`,
    "",
    "Explicitly install a supported design system into a consumer using npm or pnpm.",
    "This is the only command that mutates consumer dependencies. The registry is",
    "resolved and validated first; if it fails the package manager is not invoked.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  [version]             Optional exact semver; defaults to dist-tags.latest.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --save-dev            Add as a devDependency (default: prod).",
    "  --save-prod           Add as a dependency (default).",
    "  --exact               Save the exact resolved version (--save-exact).",
    "  --registry <url>      Registry base URL used for resolution and install.",
    "  -h, --help            Show this help.",
    "",
    "The manager is detected from packageManager or exactly one supported lockfile;",
    "missing/ambiguous managers fail closed. Lifecycle scripts are always disabled.",
    "",
  ].join("\n");
}

export function helpTextForUse() {
  return [
    `Usage: ${CLI_NAME} use <package-or-id> [version] --cwd <consumer-root> [options]`,
    "",
    "Install, verify, and connect one explicit design system, then optionally run",
    "the strict usage check. The package is never discovered or selected for you.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  [version]             Optional exact semver; defaults to dist-tags.latest.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --save-dev            Add as a devDependency (default: prod).",
    "  --save-prod           Add as a dependency (default).",
    "  --exact               Save the exact resolved version (--save-exact).",
    "  --registry <url>      Registry base URL used for resolution and install.",
    "  --strict              Enable strict mode for connect/check-usage.",
    "  --no-strict           Disable strict mode.",
    "  --ignore <glob>       Extra root-relative ignore for --check-usage (repeatable;",
    "                        requires --check-usage).",
    "  --check-usage         Run the strict usage check after a successful connect.",
    "  -h, --help            Show this help.",
    "",
    "A failed package-manager install or verification stops before connect; a",
    "completed package-manager mutation is never rolled back automatically.",
    "",
  ].join("\n");
}

function toCamelFlag(key) {
  return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Parse shared CLI arguments with a per-command allowlist. Throws on unknown
 * options, missing values, boolean options given values, or extra positionals.
 */
function parseOptions(
  argv,
  { maxPositionals = 0, booleans = [], values = [], repeatable = [] } = {},
) {
  const options = {
    cwd: undefined,
    strict: undefined,
    check: false,
    dryRun: false,
    ignore: [],
    help: false,
    json: false,
    size: undefined,
    registry: undefined,
    saveDev: false,
    saveProd: false,
    exact: false,
    checkUsage: false,
  };
  const booleanSet = new Set(booleans);
  const valueSet = new Set(values);
  const repeatableSet = new Set(repeatable);
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const inlineValue = equals === -1 ? undefined : arg.slice(equals + 1);

    if (key === "strict" && booleanSet.has("strict")) {
      if (inlineValue !== undefined) throw new Error("Option --strict does not take a value.");
      options.strict = true;
      continue;
    }
    if (key === "no-strict" && booleanSet.has("strict")) {
      if (inlineValue !== undefined) throw new Error("Option --no-strict does not take a value.");
      options.strict = false;
      continue;
    }
    if (booleanSet.has(key)) {
      if (inlineValue !== undefined) throw new Error(`Option --${key} does not take a value.`);
      options[toCamelFlag(key)] = true;
      continue;
    }
    if (valueSet.has(key) || repeatableSet.has(key)) {
      let value = inlineValue;
      if (value === undefined) {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (repeatableSet.has(key)) options[toCamelFlag(key)].push(value);
      else options[toCamelFlag(key)] = value;
      continue;
    }
    throw new Error(`Unknown option: --${key}`);
  }

  if (positionals.length > maxPositionals) {
    throw new Error(
      `Expected at most ${maxPositionals} positional argument(s), received: ${positionals.join(", ")}.`,
    );
  }
  return { options, positionals };
}

/* -------------------------------------------------------------------------- */
/* connect                                                                    */
/* -------------------------------------------------------------------------- */

function reportConnectFailure(result) {
  const label = result.check
    ? "Consumer contract check failed"
    : result.dryRun
      ? "Consumer connect dry run failed"
      : "Consumer connect failed";
  process.stdout.write(`${label}\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write("\nNothing was installed or published.\n");
  process.exitCode = 1;
}

function reportConnectSuccess(result) {
  const plan = result.plan;
  const label = `${plan.packageName}@${plan.version}`;
  if (result.check) {
    process.stdout.write(
      result.changed
        ? `Consumer contract is out of date for ${label} (run connect to update).\n`
        : `Consumer contract is up to date for ${label}.\n`,
    );
    if (result.changed) process.exitCode = 1;
    return;
  }
  if (result.dryRun) {
    process.stdout.write(`Connect dry run for ${label} in ${plan.consumerRoot}\n\n`);
    if (result.changes.length === 0) {
      process.stdout.write("  no changes (already connected)\n");
    } else {
      for (const change of result.changes) {
        process.stdout.write(`  would write ${change.kind}: ${change.path}\n`);
      }
    }
    process.stdout.write("\nDry run: nothing was written.\n");
    return;
  }
  process.stdout.write(
    result.changed
      ? `Connected ${label} in ${plan.consumerRoot}.\n`
      : `Already connected ${label} in ${plan.consumerRoot} (no changes).\n`,
  );
}

export function runConnectCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["strict", "check", "dry-run"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(connectHelpText());
    return;
  }
  const result = connectDesignSystem({
    cwd: parsed.options.cwd,
    package: parsed.positionals[0],
    strict: parsed.options.strict,
    check: parsed.options.check,
    dryRun: parsed.options.dryRun,
  });
  if (!result.ok) {
    reportConnectFailure(result);
    return;
  }
  reportConnectSuccess(result);
}

/* -------------------------------------------------------------------------- */
/* check-usage                                                                */
/* -------------------------------------------------------------------------- */

function reportUsage(result) {
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      process.stdout.write(
        `${finding.file}:${finding.line}:${finding.column}  ${finding.severity}  ` +
          `${finding.ruleId}  ${finding.message}\n`,
      );
    }
    process.stdout.write("\n");
  }
  process.stdout.write(`${result.summary}\n`);
  if (result.ok) {
    process.stdout.write("Usage check passed.\n");
  } else {
    process.stdout.write("Usage check failed.\n");
    process.exitCode = 1;
  }
}

export async function runCheckUsageCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["strict"],
      values: ["cwd"],
      repeatable: ["ignore"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    const { helpText: usageHelp } = await import("./usage.mjs");
    process.stdout.write(usageHelp());
    return;
  }
  const { checkUsage } = await import("./usage.mjs");
  let result;
  try {
    result = checkUsage({
      cwd: parsed.options.cwd,
      ignore: parsed.options.ignore,
      strict: parsed.options.strict,
    });
  } catch (error) {
    process.stdout.write(`Usage check failed\n\n  ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  reportUsage(result);
}

/* -------------------------------------------------------------------------- */
/* doctor                                                                     */
/* -------------------------------------------------------------------------- */

export function runDoctorCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["check", "dry-run"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(doctorHelpText());
    return;
  }
  if (parsed.options.check || parsed.options.dryRun) {
    process.stderr.write("doctor is read-only and accepts neither --check nor --dry-run.\n");
    process.exitCode = 1;
    return;
  }
  const report = collectDoctorReport({
    cwd: parsed.options.cwd,
    package: parsed.positionals[0],
  });
  process.stdout.write(`${CLI_NAME} doctor\n`);
  if (report.consumerRoot) process.stdout.write(`Consumer root: ${report.consumerRoot}\n`);
  process.stdout.write("\n");
  for (const check of report.checks) {
    process.stdout.write(`${check.ok ? "[ok]" : "[FAIL]"} ${check.label}: ${check.detail}\n`);
  }
  process.stdout.write("\n");
  if (report.ok) {
    process.stdout.write("Doctor passed.\n");
  } else {
    const count = report.checks.filter((check) => !check.ok).length;
    process.stdout.write(`Doctor found ${count} problem(s).\n`);
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------------------- */
/* search                                                                     */
/* -------------------------------------------------------------------------- */

function reportCommandFailure(label, error) {
  process.stdout.write(`${label}\n\n  ${error.message}\n`);
  process.exitCode = 1;
}

export async function runSearchCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: Number.MAX_SAFE_INTEGER,
      booleans: ["json"],
      values: ["registry", "size"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(searchHelpText());
    return;
  }
  const { searchDesignSystems } = await import("./catalog.mjs");
  const { buildSearchResult } = await import("./registry.mjs");
  try {
    const result = await searchDesignSystems({
      query: parsed.positionals,
      registry: parsed.options.registry,
      size: parsed.options.size,
    });
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify(buildSearchResult(result), null, 2)}\n`);
      return;
    }
    process.stdout.write(
      `Supported design systems (registry: ${result.registry}, query: ${JSON.stringify(result.query)}):\n\n`,
    );
    if (result.results.length === 0) {
      process.stdout.write("  (none found)\n");
    }
    for (const entry of result.results) {
      process.stdout.write(`  ${entry.name}@${entry.version}\n`);
      if (entry.description) process.stdout.write(`    ${entry.description}\n`);
      if (entry.keywords.length > 0) {
        process.stdout.write(`    keywords: ${entry.keywords.join(", ")}\n`);
      }
    }
    process.stdout.write(`\n${result.results.length} result(s).\n`);
  } catch (error) {
    reportCommandFailure("Search failed", error);
  }
}

/* -------------------------------------------------------------------------- */
/* info                                                                       */
/* -------------------------------------------------------------------------- */

export async function runInfoCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["json"],
      values: ["registry"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(infoHelpText());
    return;
  }
  const target = parsed.positionals[0];
  if (target === undefined) {
    process.stderr.write("info requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  const { inspectDesignSystem } = await import("./catalog.mjs");
  const { buildInfoResult } = await import("./registry.mjs");
  try {
    const info = await inspectDesignSystem({
      package: target,
      version: parsed.positionals[1],
      registry: parsed.options.registry,
    });
    const result = buildInfoResult(info);
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const componentNames = Object.keys(result.components);
    process.stdout.write(`${result.package}@${result.version}\n`);
    process.stdout.write(`  name:      ${result.name}\n`);
    process.stdout.write(`  density:   ${result.design.density ?? "(unset)"}\n`);
    process.stdout.write(`  theme:     ${result.design.theme ?? "(unset)"}\n`);
    process.stdout.write(`  radius:    ${result.design.radius ?? "(unset)"}\n`);
    if (result.design.keywords.length > 0) {
      process.stdout.write(`  keywords:  ${result.design.keywords.join(", ")}\n`);
    }
    process.stdout.write(`  components: ${componentNames.join(", ")}\n`);
  } catch (error) {
    reportCommandFailure("Info failed", error);
  }
}

/* -------------------------------------------------------------------------- */
/* install / use                                                              */
/* -------------------------------------------------------------------------- */

function reportInstallFailure(result) {
  process.stdout.write(`Install failed (boundary: ${result.boundary ?? "unknown"})\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write("\nNo consumer dependencies were changed if the registry step failed.\n");
  process.exitCode = 1;
}

export async function runInstallCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["save-dev", "save-prod", "exact"],
      values: ["cwd", "registry"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(installHelpText());
    return;
  }
  const target = parsed.positionals[0];
  if (target === undefined) {
    process.stderr.write("install requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  if (parsed.options.saveDev && parsed.options.saveProd) {
    process.stderr.write("--save-dev and --save-prod are mutually exclusive.\n");
    process.exitCode = 1;
    return;
  }
  const { installDesignSystem } = await import("./catalog.mjs");
  const result = await installDesignSystem({
    cwd: parsed.options.cwd,
    package: target,
    version: parsed.positionals[1],
    saveDev: parsed.options.saveDev,
    exact: parsed.options.exact,
    registry: parsed.options.registry,
  });
  if (!result.ok) {
    reportInstallFailure(result);
    return;
  }
  process.stdout.write(
    `Installed ${result.package}@${result.version} with ${result.manager} in ${result.consumerRoot}.\n`,
  );
  process.stdout.write(`  registry: ${result.registry}\n`);
  process.stdout.write(`  verified: ${result.installedDir}\n`);
}

function reportUseFailure(result) {
  process.stdout.write(`Use failed (boundary: ${result.boundary ?? "unknown"})\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  if (result.install?.ok) {
    process.stdout.write(
      "\nThe package was installed and verified, but connect/check-usage did not complete; " +
        "no rollback was attempted.\n",
    );
  } else {
    process.stdout.write(
      "\nThe package was not installed; no consumer dependencies were changed.\n",
    );
  }
  process.exitCode = 1;
}

export async function runUseCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["strict", "save-dev", "save-prod", "exact", "check-usage"],
      values: ["cwd", "registry"],
      repeatable: ["ignore"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(helpTextForUse());
    return;
  }
  const target = parsed.positionals[0];
  if (target === undefined) {
    process.stderr.write("use requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  if (parsed.options.saveDev && parsed.options.saveProd) {
    process.stderr.write("--save-dev and --save-prod are mutually exclusive.\n");
    process.exitCode = 1;
    return;
  }
  const { runUseDesignSystem } = await import("./catalog.mjs");
  const result = await runUseDesignSystem({
    cwd: parsed.options.cwd,
    package: target,
    version: parsed.positionals[1],
    saveDev: parsed.options.saveDev,
    exact: parsed.options.exact,
    registry: parsed.options.registry,
    strict: parsed.options.strict,
    ignore: parsed.options.ignore,
    checkUsage: parsed.options.checkUsage,
  });
  if (!result.ok) {
    reportUseFailure(result);
    return;
  }
  process.stdout.write(
    `Used ${result.install.package}@${result.install.version} with ${result.install.manager} in ${result.install.consumerRoot}.\n`,
  );
  process.stdout.write(`  registry: ${result.install.registry}\n`);
  process.stdout.write(
    result.connect.changed
      ? "  connected: consumer contract written\n"
      : "  connected: already up to date\n",
  );
  if (result.usage) {
    process.stdout.write(`  usage: ${result.usage.summary}\n`);
  }
}

/* -------------------------------------------------------------------------- */
/* dispatch                                                                   */
/* -------------------------------------------------------------------------- */

export async function runCli(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(helpText());
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${readPackageVersion()}\n`);
    return;
  }
  if (command === "search") {
    await runSearchCommand(rest);
    return;
  }
  if (command === "info") {
    await runInfoCommand(rest);
    return;
  }
  if (command === "install") {
    await runInstallCommand(rest);
    return;
  }
  if (command === "use") {
    await runUseCommand(rest);
    return;
  }
  if (command === "connect") {
    runConnectCommand(rest);
    return;
  }
  if (command === "check-usage") {
    await runCheckUsageCommand(rest);
    return;
  }
  if (command === "doctor") {
    runDoctorCommand(rest);
    return;
  }
  process.stderr.write(`Unknown command: ${command}. Run "${CLI_NAME} --help".\n`);
  process.exitCode = 1;
}
