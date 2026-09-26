#!/usr/bin/env node
/**
 * Contract validation tests (Node built-in test runner, no dependency).
 *
 * Run directly:
 *   node --test scripts/validate-manifest.test.mjs
 *
 * These tests exercise the same exported validation helpers the manifest
 * generation path uses (`readSourceDescriptor`, `buildManifest`,
 * `parseSourceDescriptor`, `parseManifest`, `parseTokenSource`, and
 * `assertContractMetadata`), so the fixtures cover the real code path and not a
 * test-only reimplementation. They also lock the generated
 * `capabilities.categories` inventory to the shipped
 * `schemas/design-system.schema.json` and prove the shipped manifest
 * schemaVersion (4) stays split from the package-owned source descriptor
 * schemaVersion (3).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_KEYS,
  DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
  OPTIONAL_COMPONENTS,
  REQUIRED_COMPONENTS,
  buildManifest,
  assertContractMetadata,
  parseTokenSource,
  parseManifest,
  parseSourceDescriptor,
  readSourceDescriptor,
} from "./design-system-manifest.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "schemas", "fixtures");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fixturePath = (...segments) => join(fixturesRoot, ...segments);

test("assertContractMetadata accepts only schemaVersion 3 and contractVersion 4", () => {
  assert.doesNotThrow(() => assertContractMetadata({ schemaVersion: 3, contractVersion: 4 }));
  assert.throws(
    () => assertContractMetadata({ schemaVersion: 2, contractVersion: 4 }),
    /has schemaVersion 2; expected 3/,
  );
  assert.throws(
    () => assertContractMetadata({ schemaVersion: 3, contractVersion: 2 }),
    /has contractVersion 2; expected 4/,
  );
  assert.throws(
    () => assertContractMetadata({ schemaVersion: 3, contractVersion: "4" }),
    /has contractVersion "4"; expected 4/,
  );
});

test("the shipped manifest schema version is 4 while source descriptors stay at 3", () => {
  assert.equal(DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION, 4);
  assert.doesNotThrow(() =>
    assertContractMetadata(
      { schemaVersion: 4, contractVersion: 4 },
      "design-system.json",
      DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
    ),
  );
  assert.throws(
    () =>
      assertContractMetadata(
        { schemaVersion: 3, contractVersion: 4 },
        "design-system.json",
        DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
      ),
    /^Error: design-system\.json has schemaVersion 3; expected 4\.$/,
  );

  // Source descriptor validation is unchanged: schemaVersion 3 only.
  const raw = readJson(fixturePath("valid", "design-system.source.json"));
  assert.doesNotThrow(() => parseSourceDescriptor(raw));
  assert.throws(
    () => parseSourceDescriptor({ ...raw, schemaVersion: 4 }),
    /has schemaVersion 4; expected 3/,
  );
});

test("a shipped manifest with the source schemaVersion fails closed", () => {
  const manifest = buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });
  assert.equal(manifest.schemaVersion, 4);
  assert.throws(
    () => parseManifest({ ...manifest, schemaVersion: 3 }),
    /^Error: design-system\.json has schemaVersion 3; expected 4\.$/,
  );
});

/** The canonical capability inventory, restated here to catch canonical drift. */
const EXPECTED_CAPABILITY_CATEGORIES = Object.freeze({
  composition: Object.freeze({
    required: Object.freeze(["Container", "Stack", "Center", "Cluster", "Sidebar", "AspectRatio"]),
    optional: Object.freeze(["Grid", "Section"]),
  }),
  forms: Object.freeze({
    required: Object.freeze([
      "FormField",
      "Combobox",
      "DatePicker",
      "NumberField",
      "Slider",
      "FileUpload",
    ]),
    optional: Object.freeze([]),
  }),
  "data-display": Object.freeze({
    required: Object.freeze([]),
    optional: Object.freeze([
      "Table",
      "Pagination",
      "Progress",
      "Metric",
      "DescriptionList",
      "Timeline",
      "Meter",
      "EmptyState",
    ]),
  }),
});

test("a valid manifest builds with the canonical capability categories", () => {
  const a = buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });
  assert.deepEqual(Object.keys(a.capabilities.categories), [...CAPABILITY_CATEGORY_KEYS]);
  assert.deepEqual(a.capabilities.categories, EXPECTED_CAPABILITY_CATEGORIES);
  // The round-trip through the manifest validator preserves the inventory.
  assert.deepEqual(parseManifest(a).capabilities, a.capabilities);
  assert.equal(parseManifest(a).schemaVersion, DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION);

  // The inventory is generated, identical for every system, and independent of
  // which optional components the system actually declares.
  const b = buildManifest({ id: "v4-valid-b", packageDir: fixturePath("valid-b") });
  assert.deepEqual(b.capabilities, a.capabilities);
});

test("the shipped schema requires the generated inventory and agrees with the generator", () => {
  const schema = readJson(join(repoRoot, "schemas", "design-system.schema.json"));
  assert.equal(schema.properties.schemaVersion.const, DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION);
  assert.ok(schema.required.includes("capabilities"), "schema requires capabilities");

  const schemaCategories = schema.properties.capabilities.properties.categories;
  assert.deepEqual(schemaCategories.required, [...CAPABILITY_CATEGORY_KEYS]);
  assert.equal(schemaCategories.additionalProperties, false);

  const manifest = buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });
  assert.deepEqual(
    Object.keys(manifest.capabilities.categories),
    schemaCategories.required,
    "generated category keys match the shipped schema",
  );
  for (const key of CAPABILITY_CATEGORY_KEYS) {
    const schemaClass = schemaCategories.properties[key].properties;
    assert.deepEqual(
      manifest.capabilities.categories[key].required,
      schemaClass.required.const,
      `${key}.required matches the shipped schema`,
    );
    assert.deepEqual(
      manifest.capabilities.categories[key].optional,
      schemaClass.optional.const,
      `${key}.optional matches the shipped schema`,
    );
  }
});

test("a source descriptor must not declare the generated capability inventory", () => {
  const raw = readJson(fixturePath("valid", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor({ ...raw, capabilities: structuredClone(CAPABILITY_CATEGORIES) }),
    /^Error: design-system\.source\.json has unknown field "capabilities"; allowed fields are \$schema, schemaVersion, contractVersion, name, components, design, rules, docs\.$/,
  );
});

test("a generated manifest with a wrong capability inventory fails closed", () => {
  const base = () =>
    structuredClone(buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") }));

  const missingCapabilities = base();
  delete missingCapabilities.capabilities;
  assert.throws(
    () => parseManifest(missingCapabilities),
    /^Error: design-system\.json "capabilities" must be an object\.$/,
  );

  const unknownField = base();
  unknownField.capabilities.extra = true;
  assert.throws(
    () => parseManifest(unknownField),
    /^Error: design-system\.json "capabilities" has unknown field "extra"; allowed fields are categories\.$/,
  );

  const missingCategory = base();
  delete missingCategory.capabilities.categories.forms;
  assert.throws(
    () => parseManifest(missingCategory),
    /must declare exactly the canonical capability categories\. Missing: forms\.$/,
  );

  const unknownCategory = base();
  unknownCategory.capabilities.categories["data entry"] = { required: [], optional: [] };
  assert.throws(
    () => parseManifest(unknownCategory),
    /must declare exactly the canonical capability categories\. Unknown: data entry\.$/,
  );

  const missingClass = base();
  delete missingClass.capabilities.categories.forms.optional;
  assert.throws(
    () => parseManifest(missingClass),
    /^Error: design-system\.json "capabilities" "categories"\["forms"\] is missing required field "optional"\.$/,
  );

  const unknownName = base();
  unknownName.capabilities.categories.forms.required = [
    "FormField",
    "Combobox",
    "DatePicker",
    "NumberField",
    "Slider",
    "Widget",
  ];
  assert.throws(
    () => parseManifest(unknownName),
    /contains unknown component name\(s\): Widget\.$/,
  );

  const duplicate = base();
  duplicate.capabilities.categories.composition.required = [
    "Container",
    "Container",
    "Center",
    "Cluster",
    "Sidebar",
    "AspectRatio",
  ];
  assert.throws(() => parseManifest(duplicate), /Duplicate value "Container"/);

  const wrongClass = base();
  wrongClass.capabilities.categories.composition.optional = ["Grid", "Button"];
  assert.throws(
    () => parseManifest(wrongClass),
    /must list only optional components; wrong class: Button\.$/,
  );

  const wrongOrder = base();
  wrongOrder.capabilities.categories.composition.required = [
    "Stack",
    "Container",
    "Center",
    "Cluster",
    "Sidebar",
    "AspectRatio",
  ];
  assert.throws(
    () => parseManifest(wrongOrder),
    /must be exactly \["Container","Stack","Center","Cluster","Sidebar","AspectRatio"\] in canonical order/,
  );
});

test("a valid manifest builds with multiple different optional subsets", () => {
  const a = buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });
  assert.equal(a.schemaVersion, 4);
  assert.equal(a.contractVersion, 4);
  assert.equal(a.generated, "prism-system/design-system-manifest");
  assert.equal(a.package, "@prism-system/ui-v4-valid");
  for (const name of REQUIRED_COMPONENTS) {
    assert.ok(name in a.components, `required component ${name} is present`);
  }
  assert.ok("Grid" in a.components && "Alert" in a.components);
  assert.ok(!("Toast" in a.components) && !("Table" in a.components));
  assert.deepEqual(a.publicApi["."], [
    ...REQUIRED_COMPONENTS,
    "Grid",
    "Alert",
    "DesignSystem",
    "v4ValidTokens",
  ]);
  assert.deepEqual(a.tokens.artifacts, {
    typescript: "./tokens",
    css: "./styles.css",
    tailwind: "./tailwind.css",
  });
  assert.deepEqual(a.tokens.groups.radius, ["none", "sm", "md", "lg", "full"]);
  assert.ok(a.tokens.groups.themes.includes("light.color.text.primary"));
  assert.equal(a.docs.readme, "./README.md");
  assert.equal(a.docs.foundations, "./docs/foundations.md");
  // The generated output satisfies the manifest validator.
  assert.equal(parseManifest(a).contractVersion, 4);

  const b = buildManifest({ id: "v4-valid-b", packageDir: fixturePath("valid-b") });
  assert.ok("Toast" in b.components && "Table" in b.components);
  assert.ok(!("Grid" in b.components) && !("Alert" in b.components));
  assert.deepEqual(
    OPTIONAL_COMPONENTS.filter((name) => name in b.components),
    ["Toast", "Table"],
  );
  assert.equal(parseManifest(b).contractVersion, 4);
});

test("readSourceDescriptor reads the descriptor and its tokens.source.json", () => {
  const descriptor = readSourceDescriptor(fixturePath("valid"));
  assert.equal(descriptor.contractVersion, 4);
  assert.equal(descriptor.schemaVersion, 3);
  assert.equal(descriptor.name, "V4 Valid");
  assert.equal(Object.keys(descriptor.components).length, REQUIRED_COMPONENTS.length + 2);
  assert.equal(descriptor.tokens.schemaVersion, 1);
});

test("a descriptor missing a required component is rejected", () => {
  const raw = readJson(fixturePath("invalid-missing-required", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor(raw),
    /^Error: design-system\.source\.json "components" must declare all 29 required components and only implemented optional components\. Missing: Heading\.$/,
  );
});

test("a descriptor with an unknown component is rejected", () => {
  const raw = readJson(fixturePath("invalid-unknown-component", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor(raw),
    /must declare all 29 required components and only implemented optional components\. Unknown: Widget\.$/,
  );
});

test("a boolean false optional component entry is rejected", () => {
  const raw = readJson(fixturePath("invalid-false-optional", "design-system.source.json"));
  assert.throws(() => parseSourceDescriptor(raw), /^Error: Component "Grid" must be an object\.$/);
});

test("a descriptor with obsolete metadata fails closed", () => {
  const raw = readJson(fixturePath("valid", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor({ ...raw, schemaVersion: 2 }),
    /has schemaVersion 2; expected 3/,
  );
  const { contractVersion: _omitted, ...withoutContractVersion } = raw;
  assert.throws(
    () => parseSourceDescriptor(withoutContractVersion),
    /has contractVersion undefined; expected 4/,
  );
});

test("a generated manifest publishes the canonical token naming contract", () => {
  const a = buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });
  assert.deepEqual(a.tokens.names, {
    cssVariablePrefix: "maivand-valid",
    tailwindUtilityPrefix: "prism",
  });
  // The published names survive a full parse round-trip unchanged.
  assert.deepEqual(parseManifest(a).tokens.names, a.tokens.names);

  const b = buildManifest({ id: "v4-valid-b", packageDir: fixturePath("valid-b") });
  assert.deepEqual(b.tokens.names, {
    cssVariablePrefix: "maivand-valid-b",
    tailwindUtilityPrefix: "prism",
  });
});

test("a manifest with missing, unknown, or malformed token names fails closed", () => {
  const base = () => buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });

  const absent = base();
  delete absent.tokens.names;
  assert.throws(
    () => parseManifest(absent),
    /^Error: design-system\.json "tokens" "names" must be an object\.$/,
  );

  const missing = base();
  delete missing.tokens.names.cssVariablePrefix;
  assert.throws(
    () => parseManifest(missing),
    /^Error: design-system\.json "tokens" "names" is missing required field "cssVariablePrefix"\.$/,
  );

  const unknown = base();
  unknown.tokens.names.extra = "value";
  assert.throws(
    () => parseManifest(unknown),
    /^Error: design-system\.json "tokens" "names" has unknown field "extra"; allowed fields are cssVariablePrefix, tailwindUtilityPrefix\.$/,
  );

  const malformedCss = base();
  malformedCss.tokens.names.cssVariablePrefix = "Maivand Valid";
  assert.throws(
    () => parseManifest(malformedCss),
    /^Error: design-system\.json "tokens" "names"\.cssVariablePrefix must be a safe lower-kebab namespace \(received "Maivand Valid"\)\.$/,
  );

  const malformedTailwind = base();
  malformedTailwind.tokens.names.tailwindUtilityPrefix = "9prism";
  assert.throws(
    () => parseManifest(malformedTailwind),
    /^Error: design-system\.json "tokens" "names"\.tailwindUtilityPrefix must be a safe lower-kebab namespace \(received "9prism"\)\.$/,
  );
});

test("valid token source with references is accepted", () => {
  const tokens = readJson(fixturePath("valid", "tokens.source.json"));
  assert.equal(parseTokenSource(tokens).schemaVersion, 1);
});

test("a missing token group is rejected", () => {
  const tokens = readJson(fixturePath("tokens-invalid-groups", "tokens.source.json"));
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: tokens\.source\.json is missing required group "radius"\.$/,
  );
});

test("an unsupported token length unit is rejected", () => {
  const tokens = readJson(fixturePath("tokens-invalid-unit", "tokens.source.json"));
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: "spacing\.scale\.4" must be a valid length using px, rem, em, ch, vw, vh, or % \(received "4qu"\)\.$/,
  );
});

test("a token $ref to a missing target is rejected", () => {
  const tokens = readJson(fixturePath("tokens-invalid-ref-target", "tokens.source.json"));
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: "radius\.md" \$ref target "radius\.nope" does not exist in tokens\.source\.json\.$/,
  );
});

test("a token $ref cycle is rejected", () => {
  const tokens = readJson(fixturePath("tokens-invalid-ref-cycle", "tokens.source.json"));
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: tokens\.source\.json token \$ref cycle detected: themes\.light\.color\.text\.primary -> themes\.dark\.color\.text\.primary -> themes\.light\.color\.text\.primary\.$/,
  );
});

test("a type-incompatible token $ref is rejected", () => {
  const tokens = readJson(fixturePath("tokens-invalid-ref-type", "tokens.source.json"));
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: "layers\.base" has an incompatible \$ref to "themes\.light\.color\.text\.primary": expected an integer, resolved to a color literal\.$/,
  );
});

const validSource = () => readJson(fixturePath("valid", "design-system.source.json"));
const validTokens = () => readJson(fixturePath("valid", "tokens.source.json"));

/** Assign `value` at a dot-separated path in a cloned fixture. */
function setPath(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) cursor = cursor[keys[index]];
  cursor[keys[keys.length - 1]] = value;
  return target;
}

test("a component missing variants is rejected", () => {
  const source = structuredClone(validSource());
  delete source.components.Button.variants;
  assert.throws(
    () => parseSourceDescriptor(source),
    /^Error: Component "Button" is missing required field "variants"; "variants", "sizes", and "members" are required \(empty arrays are allowed\)\.$/,
  );
});

test("a component missing sizes is rejected", () => {
  const source = structuredClone(validSource());
  delete source.components.Card.sizes;
  assert.throws(
    () => parseSourceDescriptor(source),
    /^Error: Component "Card" is missing required field "sizes"; "variants", "sizes", and "members" are required \(empty arrays are allowed\)\.$/,
  );
});

test("a component missing members is rejected", () => {
  const source = structuredClone(validSource());
  delete source.components.Stack.members;
  assert.throws(
    () => parseSourceDescriptor(source),
    /^Error: Component "Stack" is missing required field "members"; "variants", "sizes", and "members" are required \(empty arrays are allowed\)\.$/,
  );
});

test("explicitly empty variants, sizes, and members stay valid", () => {
  const descriptor = parseSourceDescriptor(validSource());
  assert.deepEqual(descriptor.components.Stack, { variants: [], sizes: [], members: [] });
});

test("a negative spacing dimension is rejected", () => {
  const tokens = setPath(structuredClone(validTokens()), "spacing.scale.4", "-1rem");
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: "spacing\.scale\.4" must be a valid length using px, rem, em, ch, vw, vh, or % \(received "-1rem"\)\.$/,
  );
});

test("a negative radius dimension is rejected", () => {
  const tokens = setPath(structuredClone(validTokens()), "radius.lg", "-0.25rem");
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: "radius\.lg" must be a valid length using px, rem, em, ch, vw, vh, or % \(received "-0\.25rem"\)\.$/,
  );
});

test("a negative line height length is rejected", () => {
  const tokens = setPath(structuredClone(validTokens()), "typography.lineHeight.tight", "-0.5rem");
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: "typography\.lineHeight\.tight" must be a positive number or a valid length \(received "-0\.5rem"\)\.$/,
  );
});

test("a negative breakpoint is rejected", () => {
  const tokens = setPath(structuredClone(validTokens()), "breakpoints.sm", "-40rem");
  assert.throws(
    () => parseTokenSource(tokens),
    /^Error: "breakpoints\.sm" must be a valid length using px, rem, or em \(received "-40rem"\)\.$/,
  );
});

test("a negative letterSpacing is accepted", () => {
  const tokens = setPath(
    structuredClone(validTokens()),
    "typography.letterSpacing.tight",
    "-0.05em",
  );
  assert.equal(parseTokenSource(tokens).typography.letterSpacing.tight, "-0.05em");
});
