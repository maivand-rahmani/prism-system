#!/usr/bin/env node
/**
 * Maintainer compatibility wrapper (not published).
 *
 * The V3 consumer implementation lives in the publishable `@prism-system/tools`
 * package (`packages/tools`), where it backs the `prism-ds` CLI. This module
 * re-exports that implementation so existing repository scripts and tests keep
 * importing `scripts/design-system-consumer.mjs` unchanged. There is a single
 * implementation; do not add consumer logic here.
 */

export * from "../packages/tools/src/consumer.mjs";
