#!/usr/bin/env node
/**
 * Maintainer compatibility wrapper (not published).
 *
 * The strict usage checker lives in the publishable `@prism-system/tools`
 * package (`packages/tools`), where it backs `prism-ds check-usage`. This module
 * re-exports that implementation so existing repository scripts and tests keep
 * importing `scripts/design-system-usage.mjs` unchanged. There is a single
 * implementation; do not add checker logic here.
 */

export * from "../packages/tools/src/usage.mjs";
