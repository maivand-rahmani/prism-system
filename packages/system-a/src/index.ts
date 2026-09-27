// The published root bundle is a client entry: `tsup.config.ts` emits the
// top-level `"use client"` directive for both ESM and CJS. `./tokens` stays
// server-safe.
import "./styles/index.css";

export * from "./components/index.js";
export * from "./tokens/index.js";
export { DesignSystem } from "./design-system.js";
export type { DesignSystem as DesignSystemType } from "./design-system.js";
