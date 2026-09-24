/**
 * `@prism-system/tools` public entry point.
 *
 * Exposes the consumer, catalog, and registry helpers used by the `prism-ds`
 * CLI so consumers and focused tests can import the same implementation
 * directly. Importing this module performs no network, filesystem-mutation, or
 * package-manager work; `search`/`info` only fetch when called, and
 * `install`/`use` only spawn a manager when called with an explicit consumer.
 */

export * from "./consumer.mjs";
export * from "./doctor.mjs";
export * from "./usage.mjs";
export * from "./semver.mjs";
export * from "./manifest.mjs";
export * from "./tarball.mjs";
export * from "./registry.mjs";
export * from "./package-manager.mjs";
export * from "./catalog.mjs";
export * from "./components.mjs";
export * from "./tokens.mjs";
export * from "./tailwind-setup.mjs";
export * from "./check.mjs";
// `check.mjs` and `tailwind-setup.mjs` both define `STYLES_EXPORT_SUBPATH` with the
// same value; resolve the star-export ambiguity explicitly so the public surface
// stays stable and importable.
export { STYLES_EXPORT_SUBPATH } from "./tailwind-setup.mjs";
