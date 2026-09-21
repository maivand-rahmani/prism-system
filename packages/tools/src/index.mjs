/**
 * `@prism-system/tools` public entry point.
 *
 * Exposes the consumer helpers used by the `prism-ds` CLI so consumers and
 * focused tests can import the same implementation directly. This module never
 * installs packages, edits consumer dependencies, or accesses the
 * design-systems source repository.
 */

export * from "./consumer.mjs";
export * from "./doctor.mjs";
export * from "./usage.mjs";
