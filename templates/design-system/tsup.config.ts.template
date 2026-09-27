import { defineConfig } from "tsup";

/**
 * The package root is a client entry. Components create contexts at module
 * evaluation and use React hooks, so the published bundle must open with a
 * top-level `"use client"` directive for Next.js App Router: a React Server
 * Component may then import and render the components as client references.
 * The `banner` option is authoritative — esbuild drops directives when bundling
 * and its entry-directive preservation may change, so the directive is emitted
 * explicitly for both ESM and CJS.
 *
 * `./tokens` is plain generated data and must stay server-safe, so it builds
 * separately, without the banner. `dist/` is cleaned once by the build script:
 * a per-config `clean` would delete the other config's declaration files,
 * because the two configs build in parallel.
 */
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    banner: { js: '"use client";' },
  },
  {
    entry: { "tokens/index": "src/tokens/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
  },
]);
