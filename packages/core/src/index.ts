/**
 * @prism-system/ui-core — unstyled shared foundation for Maivand design systems.
 *
 * Exposes:
 * - the V1 component contracts (types only)
 * - the data-driven `DesignSystem` type and registry
 * - the unstyled shadcn/Radix foundation primitives
 * - shared utilities, accessibility helpers, and common hooks
 *
 * It contains no colors, tokens, or component styling. The visual language
 * belongs to each `@prism-system/ui-system-*` package.
 */
export * from "./a11y/index.js";
export * from "./contracts/index.js";
export * from "./design-system/index.js";
export * from "./hooks/index.js";
export * from "./primitives/index.js";
export * from "./types/common.js";
export * from "./utils/index.js";
