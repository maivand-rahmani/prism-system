#!/usr/bin/env node
/**
 * Phase 3 manifest/catalog metadata foundation tests.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/manifest-v4.test.mjs
 *
 * These exercise the published, self-contained helpers that the registry
 * `info` path uses. No design-system or `@prism-system/ui-core` code is
 * imported or executed; the real A/B and V2 manifests are read as JSON data.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { V4_OPTIONAL_COMPONENTS, V4_REQUIRED_COMPONENTS } from "../src/constants.mjs";
import {
  collectManifestFailures,
  detectManifestContract,
  validateDesignSystemManifest,
} from "../src/manifest.mjs";
import { buildInfoResult, validateRegistryMetadata } from "../src/registry.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..", "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const v2Manifest = readJson(
  join(repoRoot, "schemas", "fixtures", "v2-valid", "design-system.json"),
);
const systemAManifest = readJson(join(repoRoot, "packages", "system-a", "design-system.json"));
const systemBManifest = readJson(join(repoRoot, "packages", "system-b", "design-system.json"));

/** Remove every declared V4 optional component so only the required set remains. */
function withoutOptionalComponents(manifest) {
  const clone = structuredClone(manifest);
  for (const name of V4_OPTIONAL_COMPONENTS) delete clone.components[name];
  return clone;
}

/* -------------------------------------------------------------------------- */
/* Strict (schemaVersion, contract) pair dispatch                             */
/* -------------------------------------------------------------------------- */

test("detectManifestContract accepts only (1, v2) and (2, v4)", () => {
  assert.equal(detectManifestContract(v2Manifest), "v2");
  assert.equal(detectManifestContract(systemAManifest), "v4");
  assert.equal(detectManifestContract({ schemaVersion: 2, contract: "v2" }), null);
  assert.equal(detectManifestContract({ schemaVersion: 1, contract: "v4" }), null);
  assert.equal(detectManifestContract({ schemaVersion: 3, contract: "v4" }), null);
  assert.equal(detectManifestContract({ schemaVersion: 1 }), null);
  assert.equal(detectManifestContract(null), null);
});

test("unknown schema/contract pairs fail closed with a single dispatch failure", () => {
  const pairs = [
    { schemaVersion: 2, contract: "v2" },
    { schemaVersion: 1, contract: "v4" },
    { schemaVersion: 3, contract: "v4" },
    { schemaVersion: 1 },
    { contract: "v2" },
  ];
  for (const manifest of pairs) {
    const failures = collectManifestFailures(manifest);
    assert.equal(
      failures.length,
      1,
      `expected a single dispatch failure for ${JSON.stringify(manifest)}`,
    );
    assert.match(
      failures[0],
      /^Unsupported schema\/contract pair \(.*\); expected \(1, "v2"\) or \(2, "v4"\)\.$/,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* V2 golden compatibility                                                    */
/* -------------------------------------------------------------------------- */

test("a valid V2 manifest keeps its exact parse and validation behavior", () => {
  assert.deepEqual(collectManifestFailures(v2Manifest), []);
  assert.deepEqual(
    collectManifestFailures(v2Manifest, {
      packageName: "@prism-system/ui-v2-valid",
      version: "1.1.0",
    }),
    [],
  );
  assert.equal(validateDesignSystemManifest(v2Manifest), v2Manifest);
});

test("a V2 manifest rejects unknown top-level fields fail-closed", () => {
  const manifest = structuredClone(v2Manifest);
  manifest.tokens = { groups: {}, artifacts: {} };
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("tokens is not allowed."), failures.join(" "));
});

test("V2 info output is byte-compatible with the original shape", () => {
  const result = buildInfoResult({
    package: "@prism-system/ui-v2-valid",
    version: "1.1.0",
    manifest: v2Manifest,
  });
  assert.deepEqual(Object.keys(result), [
    "package",
    "version",
    "name",
    "design",
    "components",
    "rules",
    "manifest",
  ]);
  assert.deepEqual(result, {
    package: "@prism-system/ui-v2-valid",
    version: "1.1.0",
    name: "V2 Valid",
    design: {
      density: "comfortable",
      theme: "light-first",
      radius: "small",
      keywords: ["calm", "minimal", "editorial", "fixture"],
    },
    components: v2Manifest.components,
    rules: v2Manifest.rules,
    manifest: v2Manifest,
  });
});

/* -------------------------------------------------------------------------- */
/* Valid V4 manifests                                                         */
/* -------------------------------------------------------------------------- */

test("the real A/B V4 manifests validate with no failures", () => {
  for (const manifest of [systemAManifest, systemBManifest]) {
    assert.equal(detectManifestContract(manifest), "v4");
    assert.deepEqual(collectManifestFailures(manifest), []);
    assert.deepEqual(
      collectManifestFailures(manifest, {
        packageName: manifest.package,
        version: manifest.version,
      }),
      [],
    );
    assert.equal(validateDesignSystemManifest(manifest), manifest);
    for (const name of V4_REQUIRED_COMPONENTS) {
      assert.ok(name in manifest.components, `${manifest.id} declares required ${name}`);
    }
  }
});

test("a V4 manifest with every optional omitted is valid (absence means unavailable)", () => {
  const requiredOnly = withoutOptionalComponents(systemAManifest);
  assert.deepEqual(collectManifestFailures(requiredOnly), []);
  assert.equal(Object.keys(requiredOnly.components).length, V4_REQUIRED_COMPONENTS.length);
  const result = buildInfoResult({
    package: requiredOnly.package,
    version: requiredOnly.version,
    manifest: requiredOnly,
  });
  assert.deepEqual(result.capabilities.optional, []);
  assert.deepEqual(result.availableComponents, [...V4_REQUIRED_COMPONENTS]);
});

test("V4 optional component metadata fields are accepted and validated", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.components.Button.description = "Primary action";
  manifest.components.Button.docs = "./docs/components.md";
  manifest.components.Button.example = "<Button>Save</Button>";
  assert.deepEqual(collectManifestFailures(manifest), []);
  manifest.components.Button.description = "";
  const failures = collectManifestFailures(manifest);
  assert.ok(
    failures.includes("components.Button.description must be a non-empty string."),
    failures.join(" "),
  );
});

/* -------------------------------------------------------------------------- */
/* Malformed V4 manifests                                                     */
/* -------------------------------------------------------------------------- */

test("a V4 manifest missing a required component fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  delete manifest.components.Heading;
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Heading is required."), failures.join(" "));
});

test("a V4 manifest with an unknown component fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.components.Widget = { variants: [], sizes: [], members: [] };
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Widget is not allowed."), failures.join(" "));
});

test("a V4 component missing a required API field fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  delete manifest.components.Button.variants;
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Button.variants is required."), failures.join(" "));
});

test("a V4 component with an unknown field fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.components.Button.extra = [];
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Button.extra is not allowed."), failures.join(" "));
});

test("a V4 manifest with unknown top-level fields fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.unexpected = true;
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("unexpected is not allowed."), failures.join(" "));
});

test("a V4 manifest missing tokens/docs or a token group fails closed", () => {
  const missingTokens = structuredClone(systemAManifest);
  delete missingTokens.tokens;
  assert.ok(
    collectManifestFailures(missingTokens).includes("tokens is required."),
    "tokens required",
  );

  const missingDocs = structuredClone(systemAManifest);
  delete missingDocs.docs;
  assert.ok(collectManifestFailures(missingDocs).includes("docs is required."), "docs required");

  const missingGroup = structuredClone(systemAManifest);
  delete missingGroup.tokens.groups.radius;
  assert.ok(
    collectManifestFailures(missingGroup).includes("tokens.groups.radius is required."),
    "token group required",
  );
});

test("validateDesignSystemManifest aggregates V4 failures with context", () => {
  const manifest = structuredClone(systemAManifest);
  delete manifest.components.Stack;
  const versionPattern = manifest.version.replaceAll(".", "\\.");
  assert.throws(
    () =>
      validateDesignSystemManifest(manifest, {
        packageName: manifest.package,
        version: manifest.version,
      }),
    new RegExp(
      `Invalid design-system manifest for "${manifest.package}@${versionPattern}": .*components\\.Stack is required\\.`,
    ),
  );
});

/* -------------------------------------------------------------------------- */
/* Registry metadata validation and V4 info output                            */
/* -------------------------------------------------------------------------- */

test("validateRegistryMetadata accepts both v2 and v4 and rejects others", () => {
  const base = {
    name: "@prism-system/ui-system-a",
    version: "1.1.0",
    exports: { "./manifest": "./design-system.json" },
  };
  assert.doesNotThrow(() =>
    validateRegistryMetadata({
      packageName: "@prism-system/ui-system-a",
      version: "1.1.0",
      metadata: { ...base, prismSystem: { contract: "v2" } },
    }),
  );
  assert.doesNotThrow(() =>
    validateRegistryMetadata({
      packageName: "@prism-system/ui-system-a",
      version: "1.1.0",
      metadata: { ...base, prismSystem: { contract: "v4" } },
    }),
  );
  assert.throws(
    () =>
      validateRegistryMetadata({
        packageName: "@prism-system/ui-system-a",
        version: "1.1.0",
        metadata: { ...base, prismSystem: { contract: "v1" } },
      }),
    /prismSystem\.contract must be "v2" or "v4"/,
  );
});

test("V4 info exposes visual direction, capabilities, tokens, docs, and Showcase", () => {
  const result = buildInfoResult({
    package: systemAManifest.package,
    version: systemAManifest.version,
    manifest: systemAManifest,
  });

  assert.equal(result.contract, "v4");
  assert.equal(result.name, "System A");
  assert.equal(result.design.density, "comfortable");
  assert.equal(result.design.theme, "light-first");
  assert.ok(result.design.keywords.length > 0);

  const implementedOptional = V4_OPTIONAL_COMPONENTS.filter(
    (name) => name in systemAManifest.components,
  );
  assert.deepEqual(result.capabilities.required, [...V4_REQUIRED_COMPONENTS]);
  assert.deepEqual(result.capabilities.optional, implementedOptional);
  assert.deepEqual(result.availableComponents, [...V4_REQUIRED_COMPONENTS, ...implementedOptional]);
  assert.equal(Object.keys(result.components).length, 20 + implementedOptional.length);

  assert.deepEqual(result.tokens.groups, systemAManifest.tokens.groups);
  assert.deepEqual(result.tokens.artifacts, systemAManifest.tokens.artifacts);
  assert.ok(result.tokens.groups.radius.includes("md"));
  assert.ok(result.tokens.groups.typography.includes("family.sans"));

  assert.deepEqual(result.docs, systemAManifest.docs);
  assert.equal(result.docs.readme, "./README.md");
  assert.equal(result.showcase.route, "/showcase/system-a");
  assert.equal(result.manifest, systemAManifest);
});
