#!/usr/bin/env node
/**
 * `prism-ds` — the published consumer CLI for `@prism-system` design systems.
 *
 * Commands:
 *
 *   prism-ds connect [package] --cwd <consumer-root> [--strict|--no-strict]
 *     [--check] [--dry-run]
 *   prism-ds check-usage --cwd <consumer-root> [--ignore <glob>] [--strict|--no-strict]
 *   prism-ds doctor [package] --cwd <consumer-root>
 *
 * The CLI is configure-only and read-only: it never installs packages, edits
 * consumer dependencies, copies source, makes network calls, or accesses the
 * design-systems source repository. TypeScript is lazy-loaded only for
 * `check-usage`.
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
    `${CLI_NAME} ${readPackageVersion()} — @prism-system consumer tools`,
    "",
    "Configure and validate an already-installed @prism-system design system in a",
    "consumer repository. This tool is configure-only: it never installs packages,",
    "edits dependencies, copies source, or touches the design-systems repository.",
    "",
    "Usage:",
    `  ${CLI_NAME} connect [package] --cwd <consumer-root> [options]`,
    `  ${CLI_NAME} check-usage --cwd <consumer-root> [options]`,
    `  ${CLI_NAME} doctor [package] --cwd <consumer-root>`,
    `  ${CLI_NAME} --help`,
    "",
    "Commands:",
    "  connect       Write .design-system/config.json and AGENTS.md and an idempotent",
    "                managed block in the consumer root AGENTS.md.",
    "  check-usage   Deterministically validate strict design-system usage with the",
    "                TypeScript AST and the shipped manifest rules.",
    "  doctor        Read-only diagnostics: containment, discovery, installed version,",
    "                public manifest, invariants, and config state.",
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
    "idempotent managed block in the consumer root AGENTS.md. Never installs",
    "packages, edits dependencies, copies source, or mutates the design-system repo.",
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

/**
 * Parse shared CLI arguments. Throws on unknown options, missing values, or
 * extra positionals.
 */
function parseOptions(argv, { maxPositionals = 0 } = {}) {
  const options = {
    cwd: undefined,
    strict: undefined,
    check: false,
    dryRun: false,
    ignore: [],
    help: false,
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--no-strict") {
      options.strict = false;
      continue;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      let value;
      if (equals !== -1) {
        value = arg.slice(equals + 1);
      } else {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (key === "cwd") options.cwd = value;
      else if (key === "ignore") options.ignore.push(value);
      else throw new Error(`Unknown option: --${key}`);
      continue;
    }
    positionals.push(arg);
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
    parsed = parseOptions(argv, { maxPositionals: 1 });
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
    parsed = parseOptions(argv, { maxPositionals: 0 });
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
    parsed = parseOptions(argv, { maxPositionals: 1 });
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
