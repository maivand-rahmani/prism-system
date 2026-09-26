#!/usr/bin/env node
/**
 * `prism-ds` — the published tooling for `@prism-system` design systems.
 *
 * Commands:
 *
 *   prism-ds search [query...] [--registry <url>] [--size <1..250>] [--json]
 *   prism-ds info <package-or-id> [version] [--registry <url>] [--json]
 *   prism-ds install <package-or-id> [version] --cwd <root> [--save-dev|--save-prod]
 *     [--exact] [--registry <url>] [--dry-run] [--json]
 *   prism-ds use <package-or-id> [version] --cwd <root> [install options]
 *     [--strict|--no-strict] [--ignore <glob>...] [--check-usage]
 *     [--tailwind --css <file>] [--dry-run] [--json]
 *   prism-ds connect [package] --cwd <root> [--strict|--no-strict] [--check] [--dry-run]
 *   prism-ds check-usage --cwd <root> [--ignore <glob>] [--strict|--no-strict]
 *   prism-ds doctor [package] --cwd <root>
 *   prism-ds components [name] --cwd <root> [--json]
 *   prism-ds tokens [group] --cwd <root> [--json]
 *   prism-ds check --cwd <root> [--css <file>] [--json]
 *   prism-ds setup-tailwind --cwd <root> --css <file> [--dry-run] [--check] [--json]
 *   prism-ds upgrade <package-or-id> <exact-version> --cwd <root>
 *     [--dry-run] [--json] [--registry <url>] [--strict|--no-strict]
 *
 * Boundaries: `search`/`info` are explicit network, read-only. `install`/`use`/
 * `upgrade` are the only commands that mutate consumer dependencies (via a fixed
 * npm/pnpm command), and `upgrade` only when explicitly invoked.
 * `connect`/`check-usage`/`doctor`/`components`/`tokens`/`check`/`setup-tailwind`
 * are offline; `setup-tailwind` edits only its explicit `--css` file (never on
 * `--dry-run`/`--check`). No postinstall, no source copying, no publishing, and
 * no hidden package selection. TypeScript is lazy-loaded only for `check-usage`
 * and `check` (which invokes the usage checker).
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
    `  ${CLI_NAME} components [name] --cwd <root> [--json]`,
    `  ${CLI_NAME} tokens [group] --cwd <root> [--json]`,
    `  ${CLI_NAME} check --cwd <root> [--css <file>] [--json]`,
    `  ${CLI_NAME} setup-tailwind --cwd <root> --css <file> [--dry-run] [--check] [--json]`,
    `  ${CLI_NAME} upgrade <package-or-id> <exact-version> --cwd <root> [options]`,
    `  ${CLI_NAME} --help`,
    "",
    "Commands:",
    "  search          Search the npm registry for supported @prism-system/ui-* styles.",
    "  info            Inspect a published style's manifest from the registry.",
    "  install         Explicitly install a style into a consumer (npm or pnpm).",
    "  use             Install, verify, connect a style; optional strict usage check.",
    "  connect         Configure an already-installed style in a consumer.",
    "  check-usage     Deterministically validate strict usage with the TypeScript AST.",
    "  doctor          Read-only diagnostics: containment, discovery, manifest, config.",
    "  components      Offline component catalog of the installed style.",
    "  tokens          Offline token catalog of the installed style.",
    "  check           One offline read-only health report for a connected consumer.",
    "  setup-tailwind  Write the Tailwind v4 bridge imports into one explicit CSS file.",
    "  upgrade         Explicitly upgrade an installed style to an exact version.",
    "",
    "Boundaries:",
    "  search/info                      explicit network, read-only.",
    "  install/use/upgrade              mutate consumer dependencies via a fixed npm/pnpm",
    "                                   command with --ignore-scripts; upgrade does so only",
    "                                   when explicitly invoked.",
    "  connect/check-usage/doctor/      offline and never edit dependencies (connect writes",
    "  components/tokens/check/         only its consumer config/AGENTS files; the others",
    "                                   are read-only).",
    "  setup-tailwind                   offline; the only command that edits its explicitly",
    "                                   named --css file, and it writes nothing in --dry-run",
    "                                   or --check.",
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
    "This is an explicit dependency-mutating command. The registry is",
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
    "  --dry-run             Resolve the exact target/command without spawning or writing.",
    "  --json                Emit the stable structured result.",
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
    "  --tailwind --css <file>  Require Tailwind v4 and preflight one contained CSS file",
    "                        before install; configure the bridge after connect.",
    "  --dry-run             Resolve and plan without spawning or writing.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
    "A failed package-manager install or verification stops before connect; a",
    "completed package-manager mutation is never rolled back automatically.",
    "",
  ].join("\n");
}

export function componentsHelpText() {
  return [
    `Usage: ${CLI_NAME} components [name] --cwd <consumer-root> [--json]`,
    "",
    "Offline, read-only component catalog for the design system installed in a",
    "consumer. It reports the components declared by the installed package's public",
    "./manifest export and the capability categories with availability derived",
    "only from those declared components. It never installs, executes package",
    "code, or reaches the network.",
    "",
    "Arguments:",
    "  [name]                Optional single component name. A known-but-unavailable",
    "                        optional is reported unavailable; an unknown name fails.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --json                Emit stable JSON.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function tokensHelpText() {
  return [
    `Usage: ${CLI_NAME} tokens [group] --cwd <consumer-root> [--json]`,
    "",
    "Offline, read-only token catalog for the design system installed in a consumer.",
    "It reports the semantic token groups and the generated CSS/Tailwind names.",
    "",
    "Arguments:",
    "  [group]               Optional token group: themes, typography, spacing,",
    "                        containers, breakpoints, layers, radius, shadow, motion.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --json                Emit stable JSON.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function checkHelpText() {
  return [
    `Usage: ${CLI_NAME} check --cwd <consumer-root> [--css <file>] [--json]`,
    "",
    "One offline, read-only health report for a connected consumer: config, doctor",
    "diagnostics, public stylesheet/bridge exports, strict usage, and component",
    "availability. The CSS import order is checked only when --css <file> is given;",
    "otherwise the report does not scan for or guess a CSS file. Nothing is written.",
    "",
    "With --css the file is checked read-only against the setup-tailwind planner: the",
    "report passes only when no import change would be written, and fails when imports",
    "need adding or reordering.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --css <file>          Optional explicit CSS file to check import order on.",
    "  --json                Emit stable JSON.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function setupTailwindHelpText() {
  return [
    `Usage: ${CLI_NAME} setup-tailwind --cwd <consumer-root> --css <file> [--dry-run] [--json]`,
    `       ${CLI_NAME} setup-tailwind --check --cwd <consumer-root> --css <file> [--json]`,
    "",
    "Offline Tailwind v4 setup for a connected consumer. It edits exactly the",
    'explicit --css file so it loads "tailwindcss", the design-system bridge, and the',
    "stylesheet in the required order. It never installs, runs scripts, edits",
    "dependencies, or touches any other file.",
    "",
    "Modes:",
    "  (default)             Write the managed imports into the --css file.",
    "  --dry-run             Preview: report the planned change without writing, and",
    "                        exit 0 whether or not changes are needed. A dry run is",
    "                        not a check and never fails on pending changes.",
    "  --check               Pass/fail gate: run the same planner read-only and succeed",
    "                        only when plan.changed === false; when import changes are",
    "                        needed, report them and exit non-zero. Unlike --dry-run,",
    "                        pending changes are a failure.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --css <file>          The one existing CSS file to update (required; must stay",
    "                        inside --cwd).",
    '  --json                Emit stable JSON with a "mode" of "write" | "dry-run" |',
    '                        "check"; --check still exits non-zero on pending changes.',
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function upgradeHelpText() {
  return [
    `Usage: ${CLI_NAME} upgrade <package-or-id> <exact-version> --cwd <consumer-root> [options]`,
    "",
    "Explicitly upgrade an installed design system to an exact registry version. This",
    "mutates consumer dependencies through a fixed npm/pnpm command with",
    "--ignore-scripts, only when invoked. The installed valid manifest is compared",
    "against the validated target. JSON keeps component/token added/removed fields",
    "and adds component assortment, manifest metadata, and public export changes.",
    "Token values are not present in the manifest and cannot be diffed.",
    "The diff is reported before any mutation.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  <exact-version>       Required exact semver of the target release.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --dry-run             Resolve and preview without spawning or writing.",
    "  --json                Emit stable JSON.",
    "  --registry <url>      Registry base URL used for resolution and install.",
    "  --strict              Enable strict mode for the reconnect.",
    "  --no-strict           Disable strict mode.",
    "  -h, --help            Show this help.",
    "",
    "Both positionals are required; tags, ranges, aliases, and git/file/workspace",
    "specs are rejected.",
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
    tailwind: false,
    css: undefined,
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

function reportInstallDryRun(result) {
  process.stdout.write(
    `Install dry run for ${result.package}@${result.version} (${result.manager}) in ` +
      `${result.consumerRoot}\n`,
  );
  if (result.command) {
    process.stdout.write(
      `  command: ${[result.command.manager, ...result.command.args].join(" ")}\n`,
    );
  }
  process.stdout.write("\nDry run: nothing was installed.\n");
}

export async function runInstallCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["save-dev", "save-prod", "exact", "dry-run", "json"],
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
    dryRun: parsed.options.dryRun,
  });
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    reportInstallFailure(result);
    return;
  }
  if (result.dryRun) {
    reportInstallDryRun(result);
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

function reportUseDryRun(result) {
  const install = result.install;
  process.stdout.write(
    `Use dry run for ${install.package}@${install.version} (${install.manager}) in ` +
      `${install.consumerRoot}\n\n`,
  );
  for (const change of result.plannedChanges) {
    if (change.kind === "dependency") {
      process.stdout.write(`  dependency: ${[change.manager, ...change.command.args].join(" ")}\n`);
    } else if (change.kind === "css") {
      process.stdout.write(
        `  css: ${change.path} (${change.changed ? "would update" : "unchanged"})\n`,
      );
    } else if (change.kind === "connect") {
      process.stdout.write(`  connect: ${change.path}\n`);
    }
  }
  process.stdout.write("\nDry run: nothing was installed, connected, or written.\n");
}

export async function runUseCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: [
        "strict",
        "save-dev",
        "save-prod",
        "exact",
        "check-usage",
        "tailwind",
        "dry-run",
        "json",
      ],
      values: ["cwd", "registry", "css"],
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
    dryRun: parsed.options.dryRun,
    tailwind: parsed.options.tailwind,
    cssPath: parsed.options.css,
  });
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    reportUseFailure(result);
    return;
  }
  if (result.dryRun) {
    reportUseDryRun(result);
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
  if (result.tailwindSetup) {
    process.stdout.write(
      result.tailwindSetup.changed
        ? "  tailwind: updated the Tailwind bridge imports\n"
        : "  tailwind: imports already up to date\n",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* components                                                                 */
/* -------------------------------------------------------------------------- */

function reportComponentCatalog(result) {
  const lines = [
    `${result.package}@${result.version} — component catalog (contract version ${result.contractVersion})`,
    `  showcase: ${result.showcase.route}`,
    `  ${result.counts.required} required, ${result.counts.optional} optional; ` +
      `${result.counts.available} available, ${result.counts.unavailable} unavailable`,
    "  capability categories:",
  ];
  for (const [category, entry] of Object.entries(result.capabilities.categories)) {
    const total = entry.required.length + entry.optional.length;
    lines.push(
      `    ${category}: ${entry.available.length}/${total} available` +
        (entry.unavailable.length > 0 ? `; unavailable: ${entry.unavailable.join(", ")}` : ""),
    );
  }
  lines.push("");
  for (const component of result.components) {
    const kind = component.required ? "required" : "optional";
    const state = component.available ? "available" : "unavailable";
    lines.push(`  ${component.name}  [${kind}] ${state}`);
  }
  if (result.requested) {
    const requested = result.requested;
    lines.push("");
    lines.push(
      `Requested ${requested.name}: ${requested.required ? "required" : "optional"}, ` +
        `${requested.available ? "available" : "unavailable"}`,
    );
    if (requested.available) {
      lines.push(`  variants: ${requested.variants.join(", ") || "(none)"}`);
      lines.push(`  sizes:    ${requested.sizes.join(", ") || "(none)"}`);
      lines.push(`  members:  ${requested.members.join(", ") || "(none)"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function runComponentsCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["json"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(componentsHelpText());
    return;
  }
  let result;
  try {
    const { listDesignSystemComponents } = await import("./components.mjs");
    result = listDesignSystemComponents({
      cwd: parsed.options.cwd,
      name: parsed.positionals[0],
    });
  } catch (error) {
    reportCommandFailure("Component catalog failed", error);
    return;
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${reportComponentCatalog(result)}\n`);
}

/* -------------------------------------------------------------------------- */
/* tokens                                                                     */
/* -------------------------------------------------------------------------- */

function reportTokenCatalog(result) {
  const lines = [
    `${result.package}@${result.version} — token catalog (contract version ${result.contractVersion})`,
  ];
  lines.push(`  css prefix:      ${result.prefixes.css}`);
  lines.push(`  tailwind prefix: ${result.prefixes.tailwind}`);
  lines.push(`  ${result.counts.groups} group(s), ${result.counts.tokens} token(s)`);
  lines.push("");
  for (const group of result.groups) {
    lines.push(`  ${group.group} (${group.tokens.length})`);
    for (const token of group.tokens) {
      const mapped = token.tailwind
        ? (token.tailwind.utility ?? token.tailwind.variant ?? "(bridge variable)")
        : "(none)";
      lines.push(`    ${token.name}  css: ${token.cssVariable}  tailwind: ${mapped}`);
    }
  }
  if (result.requested) {
    lines.push("");
    lines.push(
      `Requested group ${result.requested.group}: ${result.requested.tokens.length} token(s)`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function runTokensCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["json"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(tokensHelpText());
    return;
  }
  let result;
  try {
    const { listDesignSystemTokens } = await import("./tokens.mjs");
    result = listDesignSystemTokens({
      cwd: parsed.options.cwd,
      group: parsed.positionals[0],
    });
  } catch (error) {
    reportCommandFailure("Token catalog failed", error);
    return;
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${reportTokenCatalog(result)}\n`);
}

/* -------------------------------------------------------------------------- */
/* check                                                                      */
/* -------------------------------------------------------------------------- */

function reportCheck(result) {
  const lines = [result.summary, ""];
  for (const check of result.checks) {
    lines.push(`  [${check.status}] ${check.label}: ${check.detail}`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function runCheckCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["json"],
      values: ["cwd", "css"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(checkHelpText());
    return;
  }
  let result;
  try {
    const { checkDesignSystem } = await import("./check.mjs");
    result = checkDesignSystem({ cwd: parsed.options.cwd, cssPath: parsed.options.css });
  } catch (error) {
    reportCommandFailure("Check failed", error);
    return;
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  process.stdout.write(`${reportCheck(result)}`);
  if (result.ok) {
    process.stdout.write("Check passed.\n");
  } else {
    process.stdout.write("Check failed.\n");
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------------------- */
/* setup-tailwind                                                             */
/* -------------------------------------------------------------------------- */

export async function runSetupTailwindCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["dry-run", "check", "json"],
      values: ["cwd", "css"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(setupTailwindHelpText());
    return;
  }
  if (parsed.options.check && parsed.options.dryRun) {
    process.stderr.write("--check and --dry-run are mutually exclusive.\n");
    process.exitCode = 1;
    return;
  }
  const mode = parsed.options.check ? "check" : parsed.options.dryRun ? "dry-run" : "write";
  const { setupTailwind } = await import("./tailwind-setup.mjs");
  const result = setupTailwind({
    cwd: parsed.options.cwd,
    cssPath: parsed.options.css,
    dryRun: mode !== "write",
  });
  // `--check` passes iff the planner would change nothing; a plain `--dry-run`
  // is only a preview and never fails on pending changes; the dry run itself
  // never writes, so `result.changed` is always false.
  const pending = result.ok && (result.plan?.changed === true || result.changes.length > 0);
  const passed = result.ok && (mode !== "check" || !pending);
  if (parsed.options.json) {
    // `mode` makes the read-only gate (`--check`) distinguishable from the
    // preview (`--dry-run`) and the write mode, whose helper result is otherwise
    // identical. `--check` still exits non-zero when changes are pending.
    process.stdout.write(`${JSON.stringify({ mode, ...result }, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    process.stdout.write("Tailwind setup failed\n\n");
    for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
    process.exitCode = 1;
    return;
  }
  if (mode === "check") {
    if (pending) {
      process.stdout.write(
        `Tailwind setup check failed: CSS imports need adding or reordering in ` +
          `${result.plan.cssPath} (this check changed nothing).\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Tailwind setup check passed: ${result.plan.cssPath} already loads the required imports.\n`,
    );
    return;
  }
  if (mode === "dry-run") {
    process.stdout.write(
      pending
        ? `Tailwind setup dry run: CSS imports need adding or reordering in ` +
            `${result.plan.cssPath}; a --check would fail and exit non-zero.\n`
        : `Tailwind setup dry run: no changes needed; ${result.plan.cssPath} already ` +
            "loads the required imports.\n",
    );
    process.stdout.write("Dry run: nothing was written (preview only; exit 0).\n");
    return;
  }
  process.stdout.write(
    result.changed
      ? `Updated ${result.plan.cssPath} to load the required imports.\n`
      : `No changes needed; ${result.plan.cssPath} already loads the required imports.\n`,
  );
}

/* -------------------------------------------------------------------------- */
/* upgrade                                                                    */
/* -------------------------------------------------------------------------- */

function reportUpgradeFailure(result) {
  process.stdout.write(`Upgrade failed (boundary: ${result.boundary ?? "unknown"})\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  if (Array.isArray(result.preview) && result.preview.length > 0) {
    process.stdout.write("\n");
    for (const line of result.preview) process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write("\nA failed registry step changed no dependencies.\n");
  process.exitCode = 1;
}

function reportUpgradeDryRun(result) {
  process.stdout.write(
    `Upgrade dry run: ${result.package} ${result.fromVersion} -> ${result.toVersion}\n\n`,
  );
  for (const line of result.preview) process.stdout.write(`  ${line}\n`);
  process.stdout.write("\n  planned changes:\n");
  for (const change of result.plannedChanges) {
    if (change.kind === "dependency") {
      process.stdout.write(
        `    dependency: ${[change.command.manager, ...change.command.args].join(" ")}\n`,
      );
    } else {
      process.stdout.write(`    ${change.kind}: ${change.path}\n`);
    }
  }
  process.stdout.write("\nDry run: nothing was installed or written.\n");
}

export async function runUpgradeCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["strict", "dry-run", "json"],
      values: ["cwd", "registry"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(upgradeHelpText());
    return;
  }
  const target = parsed.positionals[0];
  const version = parsed.positionals[1];
  if (target === undefined || target.trim() === "") {
    process.stderr.write("upgrade requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  if (version === undefined || version.trim() === "") {
    process.stderr.write("upgrade requires an explicit exact <version>.\n");
    process.exitCode = 1;
    return;
  }
  const { upgradeDesignSystem } = await import("./catalog.mjs");
  const result = await upgradeDesignSystem({
    cwd: parsed.options.cwd,
    package: target,
    version,
    strict: parsed.options.strict,
    registry: parsed.options.registry,
    dryRun: parsed.options.dryRun,
  });
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    reportUpgradeFailure(result);
    return;
  }
  if (result.dryRun) {
    reportUpgradeDryRun(result);
    return;
  }
  process.stdout.write(
    `Upgraded ${result.package} ${result.fromVersion} -> ${result.toVersion} with ` +
      `${result.manager} in ${result.consumerRoot}.\n`,
  );
  process.stdout.write(`  registry: ${result.registry}\n`);
  process.stdout.write(
    result.connect?.changed
      ? "  connected: consumer contract written\n"
      : "  connected: already up to date\n",
  );
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
  if (command === "components") {
    await runComponentsCommand(rest);
    return;
  }
  if (command === "tokens") {
    await runTokensCommand(rest);
    return;
  }
  if (command === "check") {
    await runCheckCommand(rest);
    return;
  }
  if (command === "setup-tailwind") {
    await runSetupTailwindCommand(rest);
    return;
  }
  if (command === "upgrade") {
    await runUpgradeCommand(rest);
    return;
  }
  process.stderr.write(`Unknown command: ${command}. Run "${CLI_NAME} --help".\n`);
  process.exitCode = 1;
}
