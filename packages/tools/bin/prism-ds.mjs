#!/usr/bin/env node
/**
 * Published `prism-ds` executable.
 *
 * A thin launcher: all behavior lives in the package source so the same
 * implementation is testable and reusable. No postinstall, no network calls,
 * no package installation, and no access to the design-systems source
 * repository.
 */

import { runCli } from "../src/cli.mjs";

await runCli(process.argv.slice(2));
