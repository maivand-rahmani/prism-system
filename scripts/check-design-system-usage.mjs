#!/usr/bin/env node
/**
 * Maintainer compatibility wrapper for `pnpm ds:check-usage` (not published).
 *
 * The strict usage checker is published in `@prism-system/tools` as
 * `prism-ds check-usage`. This wrapper invokes that exact CLI implementation so
 * the repository command and the external npm command can never drift.
 *
 * CLI: pnpm ds:check-usage --cwd <consumer-root> [--ignore <glob>]
 *      [--strict|--no-strict]
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../packages/tools/src/cli.mjs";

/** The check-usage help text (kept for backward-compatible imports). */
export function helpText() {
  return [
    "Usage: pnpm ds:check-usage --cwd <consumer-root> [options]",
    "",
    "Deterministically validate strict design-system usage in a configured consumer",
    "repository. Discovers the design system through .design-system/config.json,",
    "reads strict rules from the shipped design-system.json manifest, and scans only",
    "TS/TSX files under the consumer root with the TypeScript AST.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --ignore <glob>       Additional root-relative ignore glob (repeatable).",
    "  --strict              Force strict mode (overrides consumer config).",
    "  --no-strict           Force non-strict mode (overrides consumer config).",
    "  -h, --help            Show this help.",
    "",
    "The published equivalent is: prism-ds check-usage --cwd <consumer-root>.",
    "",
  ].join("\n");
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await runCli(["check-usage", ...process.argv.slice(2)]);
}
