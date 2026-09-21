#!/usr/bin/env node
/**
 * `pnpm ds:connect` — configure a consumer repository to use an installed
 * `@prism-system/ui-*` design system.
 *
 * Configure-only: it never installs packages, edits consumer dependencies,
 * copies package source, or mutates the design-system repository. See
 * `design-system-consumer.mjs` for discovery and verification rules.
 *
 * CLI: pnpm ds:connect [package] --cwd <consumer-root> [--strict|--no-strict]
 *      [--check] [--dry-run]
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { connectDesignSystem } from "./design-system-consumer.mjs";

export function helpText() {
  return [
    "Usage: pnpm ds:connect [package] --cwd <consumer-root> [options]",
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
    "  --cwd <path>          Consumer root (required; never defaults to the repo root).",
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

function parseArgs(argv) {
  const options = {
    package: undefined,
    cwd: undefined,
    strict: undefined,
    check: false,
    dryRun: false,
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
      else throw new Error(`Unknown option: --${key}`);
      continue;
    }
    positionals.push(arg);
  }
  if (positionals.length > 1) {
    throw new Error(`Expected at most one [package], received: ${positionals.join(", ")}.`);
  }
  options.package = positionals[0];
  return options;
}

function reportFailure(result) {
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

function reportSuccess(result) {
  const plan = result.plan;
  const label = `${plan.packageName}@${plan.version}`;
  if (result.check) {
    process.stdout.write(
      result.changed
        ? `Consumer contract is out of date for ${label} (run ds:connect to update).\n`
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

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const result = connectDesignSystem({
    cwd: options.cwd,
    package: options.package,
    strict: options.strict,
    check: options.check,
    dryRun: options.dryRun,
  });
  if (!result.ok) {
    reportFailure(result);
    return;
  }
  reportSuccess(result);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
