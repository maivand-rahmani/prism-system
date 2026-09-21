#!/usr/bin/env node
/**
 * Maintainer compatibility wrapper for `pnpm ds:connect` (not published).
 *
 * The consumer implementation is published in `@prism-system/tools` as
 * `prism-ds connect`. This wrapper invokes that exact CLI implementation so the
 * repository command and the external npm command can never drift.
 *
 * CLI: pnpm ds:connect [package] --cwd <consumer-root> [--strict|--no-strict]
 *      [--check] [--dry-run]
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { connectHelpText, runCli } from "../packages/tools/src/cli.mjs";

/** The connect help text (kept for backward-compatible imports). */
export function helpText() {
  return connectHelpText();
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await runCli(["connect", ...process.argv.slice(2)]);
}
