#!/usr/bin/env node
/**
 * Manifest metadata and validation tests.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/manifest.test.mjs
 *
 * These exercise the published, self-contained helpers that the registry
 * `info` path uses. No design-system or `@prism-system/ui-core` code is
 * imported or executed; the real A/B manifests are read as JSON data.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  OPTIONAL_COMPONENTS,
  REQUIRED_COMPONENTS,
} from "../src/constants.mjs";
import {
  collectManifestFailures,
  detectManifestContract,
  validateDesignSystemManifest,
} from "../src/manifest.mjs";
import { buildInfoResult, validateRegistryMetadata } from "../src/registry.mjs";
import {
  canonicalCapabilities,
  capabilityCategories,
  currentManifest,
  readCurrentManifest,
  readJson,
  repoRoot,
} from "./manifest-fixture.mjs";

const systemAManifest = readCurrentManifest(
  join(repoRoot, "packages", "system-a", "design-system.json"),
);
const systemBManifest = readCurrentManifest(
  join(repoRoot, "packages", "system-b", "design-system.json"),
);

/** Remove every declared optional component so only the required set remains. */
function withoutOptionalComponents(manifest) {
  const clone = structuredClone(manifest);
  for (const name of OPTIONAL_COMPONENTS) delete clone.components[name];
  return clone;
}

/* -------------------------------------------------------------------------- */
/* Strict contract metadata dispatch                                          */
/* -------------------------------------------------------------------------- */

test("detectManifestContract accepts only (schemaVersion 4, contractVersion 4)", () => {
  for (const manifest of [systemAManifest, systemBManifest]) {
    assert.equal(detectManifestContract(manifest), CONTRACT_VERSION);
  }
  assert.equal(detectManifestContract({ schemaVersion: 3, contractVersion: 4 }), null);
  assert.equal(detectManifestContract({ schemaVersion: 4, contractVersion: "4" }), null);
  assert.equal(detectManifestContract({ schemaVersion: 3, contractVersion: "4" }), null);
  assert.equal(detectManifestContract({ schemaVersion: 4 }), null);
  assert.equal(detectManifestContract(null), null);
});

test("unknown metadata fails closed with a single dispatch failure", () => {
  const pairs = [
    { schemaVersion: 3, contractVersion: 4 },
    { schemaVersion: 2, contractVersion: 4 },
    { schemaVersion: 4, contractVersion: "4" },
    { schemaVersion: 4, contractVersion: null },
    { schemaVersion: 4 },
    { contractVersion: 4 },
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
      /^Unsupported manifest metadata \(schemaVersion .*, contractVersion .*\); expected \(schemaVersion 4, contractVersion 4\)\.$/,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Valid manifests                                                            */
/* -------------------------------------------------------------------------- */

test("the real A/B manifests validate with no failures", () => {
  for (const manifest of [systemAManifest, systemBManifest]) {
    assert.equal(manifest.schemaVersion, MANIFEST_SCHEMA_VERSION);
    assert.equal(manifest.contractVersion, CONTRACT_VERSION);
    assert.equal(detectManifestContract(manifest), CONTRACT_VERSION);
    assert.deepEqual(collectManifestFailures(manifest), []);
    assert.deepEqual(
      collectManifestFailures(manifest, {
        packageName: manifest.package,
        version: manifest.version,
      }),
      [],
    );
    assert.equal(validateDesignSystemManifest(manifest), manifest);
    for (const name of REQUIRED_COMPONENTS) {
      assert.ok(name in manifest.components, `${manifest.id} declares required ${name}`);
    }
  }
});

test("a manifest with every optional omitted is valid (absence means unavailable)", () => {
  const requiredOnly = withoutOptionalComponents(systemAManifest);
  assert.deepEqual(collectManifestFailures(requiredOnly), []);
  assert.equal(Object.keys(requiredOnly.components).length, REQUIRED_COMPONENTS.length);
  const result = buildInfoResult({
    package: requiredOnly.package,
    version: requiredOnly.version,
    manifest: requiredOnly,
  });
  assert.deepEqual(result.capabilities.optional, []);
  assert.deepEqual(result.availableComponents, [...REQUIRED_COMPONENTS]);
});

/* -------------------------------------------------------------------------- */
/* capabilities.categories inventory                                          */
/* -------------------------------------------------------------------------- */

test("the A/B manifests carry exactly the approved category inventory", () => {
  for (const manifest of [systemAManifest, systemBManifest]) {
    assert.deepEqual(Object.keys(manifest.capabilities.categories), [
      "composition",
      "forms",
      "data-display",
    ]);
    assert.deepEqual(manifest.capabilities.categories, capabilityCategories());
    assert.deepEqual(collectManifestFailures(manifest), []);
  }
});

test("the checked-in manifests are already schema 4 with the exact inventory", () => {
  for (const id of ["system-a", "system-b"]) {
    const path = join(repoRoot, "packages", id, "design-system.json");
    const raw = readJson(path);
    assert.equal(
      raw.schemaVersion,
      MANIFEST_SCHEMA_VERSION,
      `${id} must already be schema 4, not stale`,
    );
    assert.deepEqual(raw.capabilities, canonicalCapabilities(), id);
    assert.deepEqual(collectManifestFailures(raw), [], id);
    assert.deepEqual(currentManifest(raw), raw, id);
  }
});

test("fixture loading rejects a stale raw manifest instead of projecting it", () => {
  const staleSchema = structuredClone(systemAManifest);
  staleSchema.schemaVersion = MANIFEST_SCHEMA_VERSION - 1;
  assert.throws(
    () => currentManifest(staleSchema),
    /Stale checked-in manifest: schemaVersion 3 is not the current 4\./,
  );

  const missingCapabilities = structuredClone(systemAManifest);
  delete missingCapabilities.capabilities;
  assert.throws(
    () => currentManifest(missingCapabilities),
    /Stale checked-in manifest: capabilities does not match the approved canonical inventory\./,
  );

  const driftedInventory = structuredClone(systemAManifest);
  driftedInventory.capabilities.categories["data-display"].optional =
    driftedInventory.capabilities.categories["data-display"].optional.slice(0, -1);
  assert.throws(
    () => currentManifest(driftedInventory),
    /Stale checked-in manifest: capabilities does not match the approved canonical inventory\./,
  );

  const accepted = structuredClone(systemAManifest);
  const loaded = currentManifest(accepted);
  assert.deepEqual(loaded, accepted);
  assert.notEqual(loaded, accepted, "fixture loading returns a fresh deep clone");
  assert.notEqual(loaded.capabilities, accepted.capabilities, "nested objects are cloned");

  const dir = mkdtempSync(join(tmpdir(), "prism-manifest-fixture-"));
  try {
    const stalePath = join(dir, "design-system.json");
    writeFileSync(stalePath, JSON.stringify(staleSchema), "utf8");
    assert.throws(
      () => readCurrentManifest(stalePath),
      /Stale checked-in manifest \(.*design-system\.json\): schemaVersion 3 is not the current 4\./,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a manifest missing capabilities fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  delete manifest.capabilities;
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("capabilities is required."), failures.join(" "));
});

test("unknown or reordered category keys fail closed", () => {
  const extra = structuredClone(systemAManifest);
  extra.capabilities.categories.misc = { required: [], optional: [] };
  assert.ok(
    collectManifestFailures(extra).includes("capabilities.categories.misc is not allowed."),
    "an unknown category is rejected",
  );

  const missing = structuredClone(systemAManifest);
  delete missing.capabilities.categories.forms;
  assert.ok(
    collectManifestFailures(missing).includes("capabilities.categories.forms is required."),
    "a missing category is rejected",
  );

  const reordered = structuredClone(systemAManifest);
  reordered.capabilities.categories = {
    forms: systemAManifest.capabilities.categories.forms,
    composition: systemAManifest.capabilities.categories.composition,
    "data-display": systemAManifest.capabilities.categories["data-display"],
  };
  const failures = collectManifestFailures(reordered);
  assert.ok(
    failures.includes(
      "capabilities.categories keys must be ordered: composition, forms, data-display.",
    ),
    failures.join(" "),
  );
});

test("a category with a missing or unknown field fails closed", () => {
  const missingField = structuredClone(systemAManifest);
  delete missingField.capabilities.categories.forms.optional;
  assert.ok(
    collectManifestFailures(missingField).includes(
      "capabilities.categories.forms.optional is required.",
    ),
    "a missing required/optional field is rejected",
  );

  const unknownField = structuredClone(systemAManifest);
  unknownField.capabilities.categories.composition.available = ["Container"];
  assert.ok(
    collectManifestFailures(unknownField).includes(
      "capabilities.categories.composition.available is not allowed.",
    ),
    "a separate availability declaration is rejected",
  );
});

test("unknown, duplicate, or misclassified category names fail closed", () => {
  const unknown = structuredClone(systemAManifest);
  unknown.capabilities.categories.forms.required.push("Widget");
  const unknownFailures = collectManifestFailures(unknown);
  assert.ok(
    unknownFailures.includes(
      'capabilities.categories.forms.required contains unknown component "Widget".',
    ),
    unknownFailures.join(" "),
  );

  const duplicate = structuredClone(systemAManifest);
  duplicate.capabilities.categories.composition.required.push("Stack");
  const duplicateFailures = collectManifestFailures(duplicate);
  assert.ok(
    duplicateFailures.includes(
      "capabilities.categories.composition.required must be an array of unique non-empty strings.",
    ),
    duplicateFailures.join(" "),
  );

  const misclassified = structuredClone(systemAManifest);
  misclassified.capabilities.categories.composition.optional =
    misclassified.capabilities.categories.composition.optional.filter((name) => name !== "Grid");
  misclassified.capabilities.categories.composition.required.push("Grid");
  const misclassifiedFailures = collectManifestFailures(misclassified);
  assert.ok(
    misclassifiedFailures.includes(
      'capabilities.categories.composition.required must contain only required components; "Grid" is optional.',
    ),
    misclassifiedFailures.join(" "),
  );

  const swapped = structuredClone(systemAManifest);
  swapped.capabilities.categories.forms.required = ["Table"];
  const swappedFailures = collectManifestFailures(swapped);
  assert.ok(
    swappedFailures.includes(
      'capabilities.categories.forms.required must contain only required components; "Table" is optional.',
    ),
    swappedFailures.join(" "),
  );
});

test("the exact required and optional arrays are enforced per category", () => {
  const missing = structuredClone(systemAManifest);
  missing.capabilities.categories.composition.required =
    missing.capabilities.categories.composition.required.slice(0, -1);
  assert.ok(
    collectManifestFailures(missing).includes(
      "capabilities.categories.composition.required must be exactly " +
        "[Container, Stack, Center, Cluster, Sidebar, AspectRatio].",
    ),
    collectManifestFailures(missing).join(" "),
  );

  const emptyOptional = structuredClone(systemAManifest);
  emptyOptional.capabilities.categories["data-display"].optional = [];
  assert.ok(
    collectManifestFailures(emptyOptional).includes(
      "capabilities.categories.data-display.optional must be exactly " +
        "[Table, Pagination, Progress, Metric, DescriptionList, Timeline, Meter, EmptyState].",
    ),
    collectManifestFailures(emptyOptional).join(" "),
  );

  // forms.optional is canonically empty: anything else is rejected.
  const nonEmpty = structuredClone(systemAManifest);
  nonEmpty.capabilities.categories.forms.optional = ["Button"];
  const failures = collectManifestFailures(nonEmpty);
  assert.ok(
    failures.includes("capabilities.categories.forms.optional must be an empty array."),
    failures.join(" "),
  );
  assert.ok(
    failures.includes(
      'capabilities.categories.forms.optional must contain only optional components; "Button" is required.',
    ),
    failures.join(" "),
  );
});

test("optional component metadata fields are accepted and validated", () => {
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
/* Malformed manifests                                                        */
/* -------------------------------------------------------------------------- */

test("a manifest missing a required component fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  delete manifest.components.Heading;
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Heading is required."), failures.join(" "));
});

test("a manifest with an unknown component fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.components.Widget = { variants: [], sizes: [], members: [] };
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Widget is not allowed."), failures.join(" "));
});

test("a component missing a required API field fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  delete manifest.components.Button.variants;
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Button.variants is required."), failures.join(" "));
});

test("a component with an unknown field fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.components.Button.extra = [];
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("components.Button.extra is not allowed."), failures.join(" "));
});

test("a manifest with unknown top-level fields fails closed", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.unexpected = true;
  const failures = collectManifestFailures(manifest);
  assert.ok(failures.includes("unexpected is not allowed."), failures.join(" "));
});

test("a manifest missing tokens/docs or a token group fails closed", () => {
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

test("validateDesignSystemManifest aggregates failures with context", () => {
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
/* Registry metadata validation and info output                               */
/* -------------------------------------------------------------------------- */

test("validateRegistryMetadata requires the numeric contractVersion 4", () => {
  const base = {
    name: "@prism-system/ui-system-a",
    version: "1.1.0",
    exports: { "./manifest": "./design-system.json" },
  };
  assert.doesNotThrow(() =>
    validateRegistryMetadata({
      packageName: "@prism-system/ui-system-a",
      version: "1.1.0",
      metadata: { ...base, prismSystem: { contractVersion: 4 } },
    }),
  );
  assert.throws(
    () =>
      validateRegistryMetadata({
        packageName: "@prism-system/ui-system-a",
        version: "1.1.0",
        metadata: { ...base, prismSystem: { contract: "v4" } },
      }),
    /prismSystem\.contractVersion must be the numeric 4/,
  );
});

test("info exposes visual direction, capabilities, tokens, docs, and Showcase", () => {
  const result = buildInfoResult({
    package: systemAManifest.package,
    version: systemAManifest.version,
    manifest: systemAManifest,
  });

  assert.equal(result.contractVersion, CONTRACT_VERSION);
  assert.equal(result.name, "System A");
  assert.equal(result.design.density, "comfortable");
  assert.equal(result.design.theme, "light-first");
  assert.ok(result.design.keywords.length > 0);

  const implementedOptional = OPTIONAL_COMPONENTS.filter(
    (name) => name in systemAManifest.components,
  );
  assert.deepEqual(result.capabilities.required, [...REQUIRED_COMPONENTS]);
  assert.deepEqual(result.capabilities.optional, implementedOptional);
  assert.deepEqual(result.availableComponents, [...REQUIRED_COMPONENTS, ...implementedOptional]);
  assert.equal(Object.keys(result.components).length, 29 + implementedOptional.length);

  assert.deepEqual(result.tokens.groups, systemAManifest.tokens.groups);
  assert.deepEqual(result.tokens.artifacts, systemAManifest.tokens.artifacts);
  assert.ok(result.tokens.groups.radius.includes("md"));
  assert.ok(result.tokens.groups.typography.includes("family.sans"));

  assert.deepEqual(result.docs, systemAManifest.docs);
  assert.equal(result.docs.readme, "./README.md");
  assert.equal(result.showcase.route, "/showcase/system-a");
  assert.equal(result.manifest, systemAManifest);
});
