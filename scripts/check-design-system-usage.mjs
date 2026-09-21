#!/usr/bin/env node
/**
 * `pnpm ds:check-usage` — deterministic strict usage validation for a configured
 * consumer repository. See `design-system-usage.mjs` for detection rules.
 *
 * CLI: pnpm ds:check-usage --cwd <consumer-root> [--ignore <glob>]
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkUsage, helpText } from "./design-system-usage.mjs";

function parseArgs(argv) {
  const options = { cwd: undefined, ignore: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
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
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
}

function report(result) {
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

function main(argv) {
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
  let result;
  try {
    result = checkUsage({ cwd: options.cwd, ignore: options.ignore });
  } catch (error) {
    process.stdout.write(`Usage check failed\n\n  ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  report(result);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2));
}
