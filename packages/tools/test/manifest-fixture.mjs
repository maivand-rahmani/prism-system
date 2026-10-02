/**
 * Shared test fixtures for the current shipped-manifest schema.
 *
 * The checked-in A/B `design-system.json` manifests are generated artifacts
 * owned by the manifest generator. These tests exercise the real generated
 * values, so fixture loading never projects or rewrites them: a checked-in
 * manifest that is not already on `schemaVersion: 5` with exactly the approved
 * `capabilities` inventory fails the test run instead of being silently
 * upgraded to look current.
 *
 * This module is intentionally not a `*.test.mjs` file: it is a plain helper
 * imported by the test files and is never executed by the test runner itself.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_KEYS,
  CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  REQUIRED_COMPONENTS,
} from "../src/constants.mjs";
import { MANIFEST_GENERATED_MARKER } from "../src/manifest.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));

/** Repository root, resolved from `packages/tools/test`. */
export const repoRoot = resolve(testDir, "..", "..", "..");

/** Read and parse a JSON fixture file. */
export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The exact approved `capabilities.categories` inventory as a fresh object. */
export function capabilityCategories() {
  const categories = {};
  for (const key of CAPABILITY_CATEGORY_KEYS) {
    categories[key] = {
      required: [...CAPABILITY_CATEGORIES[key].required],
      optional: [...CAPABILITY_CATEGORIES[key].optional],
    };
  }
  return categories;
}

/** The exact approved `capabilities` block as a fresh object. */
export function canonicalCapabilities() {
  return { categories: capabilityCategories() };
}

function staleManifestError(source, reason) {
  const location = source === undefined ? "" : ` (${source})`;
  return new Error(
    `Stale checked-in manifest${location}: ${reason}. ` +
      'Regenerate the checked-in generated manifest with "pnpm ds:manifest <id> --write"; ' +
      "test fixtures never project older raw manifests onto the current schema.",
  );
}

/**
 * Load a checked-in manifest fixture without projecting it.
 *
 * Throws when the raw input is not already on `schemaVersion: 5` with exactly
 * the approved canonical `capabilities` inventory. Otherwise returns an
 * unchanged deep clone, so callers can freely mutate the result.
 */
export function currentManifest(raw, source) {
  const schemaVersion = raw?.schemaVersion;
  if (schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw staleManifestError(
      source,
      `schemaVersion ${JSON.stringify(schemaVersion)} is not the current ${MANIFEST_SCHEMA_VERSION}`,
    );
  }
  if (!isDeepStrictEqual(raw.capabilities, canonicalCapabilities())) {
    throw staleManifestError(
      source,
      "capabilities does not match the approved canonical inventory",
    );
  }
  return structuredClone(raw);
}

/** Read a checked-in manifest fixture without projecting it. */
export function readCurrentManifest(path) {
  return currentManifest(readJson(path), path);
}

/**
 * Build a complete valid current (schema 5 / contract 4) manifest for tests
 * that exercise the new entrypoints/extensions/effects surface without reading
 * the checked-in A/B generated artifacts. Returned fresh each call; callers may
 * mutate the result freely.
 */
export function syntheticManifest({
  id = "fixture",
  version = "1.0.0",
  packageName = `@prism-system/ui-${id}`,
} = {}) {
  const components = {};
  for (const name of REQUIRED_COMPONENTS) {
    components[name] = { variants: [], sizes: [], members: [] };
  }
  return {
    $schema: "https://example.test/schemas/design-system.schema.json",
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generated: MANIFEST_GENERATED_MARKER,
    contractVersion: CONTRACT_VERSION,
    id,
    name: `Fixture ${id}`,
    package: packageName,
    version,
    exports: {
      ".": "./dist/index.mjs",
      "./tokens": "./dist/tokens/index.mjs",
      "./styles.css": "./dist/index.css",
      "./tailwind.css": "./dist/tailwind.css",
      "./manifest": "./design-system.json",
    },
    entrypoints: {
      ".": { requirements: [] },
      "./tokens": { requirements: [] },
    },
    publicApi: { ".": [], "./tokens": [] },
    components,
    capabilities: canonicalCapabilities(),
    design: {
      density: "comfortable",
      theme: "light-first",
      radius: "medium",
      keywords: ["fixture"],
    },
    rules: {
      allowArbitraryColors: false,
      allowArbitraryRadius: false,
      allowArbitraryShadows: false,
      allowPrimitiveDuplication: false,
    },
    tokens: {
      groups: {
        themes: [],
        typography: [],
        spacing: [],
        containers: [],
        breakpoints: [],
        layers: [],
        radius: [],
        shadow: [],
        motion: [],
      },
      artifacts: {
        typescript: "./dist/tokens/index.d.ts",
        css: "./dist/tokens.css",
        tailwind: "./dist/tailwind.css",
      },
      names: { cssVariablePrefix: "prism", tailwindUtilityPrefix: "prism" },
    },
    docs: { readme: "./README.md", agents: "./AGENTS.md" },
  };
}

/**
 * Add one declarative custom extension to a synthetic manifest: a code
 * entrypoint, its export target, its publicApi export name, and the extension
 * block. The manifest object is mutated and returned.
 */
export function addSyntheticExtension(
  manifest,
  {
    name = "KeyboardScene",
    entrypoint = "./keyboard-scene",
    apiVersion = 1,
    target = "./dist/keyboard-scene/index.mjs",
    description = "Procedural keyboard scene",
    docs = "./docs/keyboard-scene.md",
    example = "<KeyboardScene />",
    requirements = [],
    effects,
  } = {},
) {
  manifest.entrypoints[entrypoint] = { requirements };
  manifest.exports[entrypoint] = target;
  manifest.publicApi[entrypoint] = [name];
  manifest.extensions = manifest.extensions ?? {};
  manifest.extensions[name] = {
    apiVersion,
    entrypoint,
    description,
    docs,
    example,
    ...(effects !== undefined ? { effects } : {}),
  };
  return manifest;
}
