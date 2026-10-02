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
 * schemaVersion (5) stays split from the package-owned source descriptor
 * schemaVersion (4). The final block cross-validates huge exact package
 * versions (numeric identifiers beyond `Number.MAX_SAFE_INTEGER`) between the
 * maintainer generator/parser, the shipped schema `version` regex, and the
 * `@prism-system/tools` public helpers; its explicit evidence limits are
 * documented at that block.
 */

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
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

test("assertContractMetadata accepts only schemaVersion 4 and contractVersion 4", () => {
  assert.doesNotThrow(() => assertContractMetadata({ schemaVersion: 4, contractVersion: 4 }));
  assert.throws(
    () => assertContractMetadata({ schemaVersion: 3, contractVersion: 4 }),
    /has schemaVersion 3; expected 4/,
  );
  assert.throws(
    () => assertContractMetadata({ schemaVersion: 4, contractVersion: 2 }),
    /has contractVersion 2; expected 4/,
  );
  assert.throws(
    () => assertContractMetadata({ schemaVersion: 4, contractVersion: "4" }),
    /has contractVersion "4"; expected 4/,
  );
});

test("the shipped manifest schema version is 5 while source descriptors are 4", () => {
  assert.equal(DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION, 5);
  assert.doesNotThrow(() =>
    assertContractMetadata(
      { schemaVersion: 5, contractVersion: 4 },
      "design-system.json",
      DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
    ),
  );
  assert.throws(
    () =>
      assertContractMetadata(
        { schemaVersion: 4, contractVersion: 4 },
        "design-system.json",
        DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
      ),
    /^Error: design-system\.json has schemaVersion 4; expected 5\.$/,
  );

  // Source descriptor validation is schemaVersion 4 only.
  const raw = readJson(fixturePath("valid", "design-system.source.json"));
  assert.doesNotThrow(() => parseSourceDescriptor(raw));
  assert.throws(
    () => parseSourceDescriptor({ ...raw, schemaVersion: 3 }),
    /has schemaVersion 3; expected 4/,
  );
});

test("a shipped manifest with the source schemaVersion fails closed", () => {
  const manifest = buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });
  assert.equal(manifest.schemaVersion, 5);
  assert.throws(
    () => parseManifest({ ...manifest, schemaVersion: 4 }),
    /^Error: design-system\.json has schemaVersion 4; expected 5\.$/,
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
    /^Error: design-system\.source\.json has unknown field "capabilities"; allowed fields are \$schema, schemaVersion, contractVersion, name, components, design, rules, entrypoints, extensions, docs\.$/,
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
  assert.equal(a.schemaVersion, DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION);
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
  // The required entrypoint map always carries root/tokens with explicit,
  // package.json-derived requirements (empty for the neutral defaults).
  assert.deepEqual(a.entrypoints, {
    ".": { requirements: [] },
    "./tokens": { requirements: [] },
  });
  assert.ok(!("extensions" in a), "a neutral system omits the extensions section");
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
  assert.equal(descriptor.schemaVersion, 4);
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
    () => parseSourceDescriptor({ ...raw, schemaVersion: 3 }),
    /has schemaVersion 3; expected 4/,
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

/* -------------------------------------------------------------------------- */
/* Catalog: effects, entrypoints, extensions                                  */
/* -------------------------------------------------------------------------- */

const customFixture = () => fixturePath("valid-custom");

/** Clone the custom fixture into a temp dir, mutate it, and return the dir. */
function withCustomFixture(t, mutate) {
  const dir = mkdtempSync(join(tmpdir(), "prism-catalog-"));
  cpSync(customFixture(), dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (mutate) mutate(dir);
  return dir;
}

const readFixtureJson = (dir, name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const writeFixtureJson = (dir, name, value) =>
  writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

test("component effects are optional and copied into the manifest", () => {
  const neutral = buildManifest({ id: "v4-valid", packageDir: fixturePath("valid") });
  assert.ok(!("effects" in neutral.components.Button));
  const custom = buildManifest({ id: "valid-custom", packageDir: customFixture() });
  assert.deepEqual(custom.components.Button.effects, {
    features: ["depth", "motion"],
    rendering: "dom",
    reducedMotion: true,
  });
  assert.deepEqual(parseManifest(custom).components.Alert.effects, {
    features: ["motion"],
    rendering: "dom",
    reducedMotion: true,
  });
});

test("entrypoints, requirements, extensions, and computed publicApi are generated", () => {
  const manifest = buildManifest({ id: "valid-custom", packageDir: customFixture() });
  // Root/tokens keep the existing declared publicApi when they are not
  // explicitly declared in the source entrypoints map.
  assert.deepEqual(manifest.publicApi["."], [
    ...REQUIRED_COMPONENTS,
    "Grid",
    "Alert",
    "DesignSystem",
    "v4CustomTokens",
  ]);
  assert.deepEqual(manifest.publicApi["./tokens"], ["v4CustomTokens"]);
  assert.deepEqual(manifest.publicApi["./custom/reveal"], ["Reveal", "revealPresets"]);
  assert.deepEqual(manifest.publicApi["./custom/keyboard-scene"], [
    "KeyboardScene",
    "keyboardSceneUtils",
  ]);
  assert.deepEqual(manifest.entrypoints, {
    ".": { requirements: [] },
    "./tokens": { requirements: [] },
    "./custom/reveal": {
      requirements: [
        {
          name: "@prism-system/ui-core",
          kind: "dependency",
          range: "workspace:*",
          optional: false,
        },
        { name: "three", kind: "peer", range: ">=0.160.0", optional: true },
      ],
    },
    "./custom/keyboard-scene": {
      requirements: [{ name: "three", kind: "peer", range: ">=0.160.0", optional: true }],
    },
  });
  assert.deepEqual(Object.keys(manifest.extensions), ["Reveal", "KeyboardScene"]);
  assert.deepEqual(manifest.extensions.KeyboardScene.effects, {
    features: ["3d", "motion"],
    rendering: "webgl",
    reducedMotion: true,
    fallback: "static",
  });
  // The generated manifest round-trips its catalog unchanged.
  const parsed = parseManifest(manifest);
  assert.deepEqual(parsed.publicApi, manifest.publicApi);
  assert.deepEqual(parsed.entrypoints, manifest.entrypoints);
  assert.deepEqual(parsed.extensions, manifest.extensions);
});

test("an explicitly declared root entrypoint computes publicApi from actual source exports", (t) => {
  const dir = withCustomFixture(t, (target) => {
    writeFileSync(
      join(target, "src", "index.ts"),
      [
        'export * from "./custom/reveal/index.js";',
        'export { DesignSystem } from "./design-system.js";',
        'export type { DesignSystem as DesignSystemType } from "./design-system.js";',
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(target, "src", "design-system.ts"),
      'export const DesignSystem = { id: "valid-custom" };\n',
      "utf8",
    );
    const pkg = readFixtureJson(target, "package.json");
    pkg.exports["."] = {
      types: "./dist/index.d.ts",
      import: "./dist/index.mjs",
      require: "./dist/index.js",
    };
    writeFixtureJson(target, "package.json", pkg);
    const source = readFixtureJson(target, "design-system.source.json");
    source.entrypoints["."] = { source: "./src/index.ts", requires: [] };
    writeFixtureJson(target, "design-system.source.json", source);
  });
  const manifest = buildManifest({ id: "valid-custom", packageDir: dir });
  assert.deepEqual(manifest.publicApi["."], ["DesignSystem", "Reveal", "revealPresets"]);
  assert.deepEqual(manifest.entrypoints["."], { requirements: [] });
});

test("the static export collector follows re-exports and excludes types", () => {
  const descriptor = readSourceDescriptor(customFixture());
  assert.deepEqual(
    [...descriptor.catalog.exportsByEntrypoint.get("./custom/reveal")],
    ["Reveal", "revealPresets"],
  );
  assert.deepEqual(
    [...descriptor.catalog.exportsByEntrypoint.get("./custom/keyboard-scene")],
    ["KeyboardScene", "keyboardSceneUtils"],
  );
});

test("namespace re-exports of a missing module fail closed", (t) => {
  const dir = withCustomFixture(t, (target) => {
    writeFileSync(
      join(target, "src", "custom", "keyboard-scene", "index.ts"),
      [
        'export { KeyboardScene } from "./KeyboardScene.js";',
        'export * as keyboardSceneUtils from "./missing.js";',
        "",
      ].join("\n"),
      "utf8",
    );
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: dir }),
    /Cannot resolve module "\.\/missing\.js"/,
  );
});

test("effects structure and cross-field relationships fail closed", () => {
  const emptyFeatures = readJson(fixturePath("invalid-effects", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor(emptyFeatures),
    /Button\.effects\.features must be a nonempty subset of: depth, motion, 3d\./,
  );
  const domFallback = readJson(fixturePath("invalid-fallback", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor(domFallback),
    /Alert\.effects\.fallback is only meaningful for "webgl" or "mixed" rendering; "dom" rendering has no graphics fallback\./,
  );
  const threeDDom = readJson(fixturePath("invalid-3d-dom", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor(threeDDom),
    /Button\.effects declares the "3d" feature with "dom" rendering; a real 3D scene must declare "webgl" or "mixed" rendering \(CSS depth is not WebGL\)\./,
  );
  const source = structuredClone(validSource());
  source.components.Button.effects = {
    features: ["motion"],
    rendering: "dom",
    reducedMotion: true,
    fallback: "static",
  };
  assert.throws(
    () => parseSourceDescriptor(source),
    /fallback is only meaningful for "webgl" or "mixed" rendering/,
  );
  source.components.Button.effects = {
    features: ["motion"],
    rendering: "unknown",
    reducedMotion: true,
  };
  assert.throws(
    () => parseSourceDescriptor(source),
    /Button\.effects\.rendering must be one of: dom, webgl, mixed/,
  );
  source.components.Button.effects = { features: ["motion"], rendering: "dom" };
  assert.throws(
    () => parseSourceDescriptor(source),
    /Button\.effects\.reducedMotion must be a boolean\./,
  );
});

test("extension names must be PascalCase and never canonical component names", () => {
  const canonical = readJson(
    fixturePath("invalid-extension-canonical", "design-system.source.json"),
  );
  assert.throws(
    () => parseSourceDescriptor(canonical),
    /"extensions"\["Button"\] collides with the canonical component name "Button"; extensions are never canonical component names\./,
  );
  const source = structuredClone(validSource());
  source.extensions = {
    lowerCase: {
      apiVersion: 1,
      entrypoint: "./custom/reveal",
      description: "x",
      docs: "./docs/reveal.md",
      example: "./examples/reveal.tsx",
    },
  };
  assert.throws(
    () => parseSourceDescriptor(source),
    /must be keyed by a PascalCase named export \(received "lowerCase"\)\./,
  );
});

test("entrypoint keys are code subpaths, never asset exports", () => {
  const key = readJson(fixturePath("invalid-entrypoint-key", "design-system.source.json"));
  assert.throws(
    () => parseSourceDescriptor(key),
    /"entrypoints" key "\.\/styles\.css" must be "\." or a concrete lower-kebab "\.\/subpath"; CSS, manifest, and package\.json asset exports are never declared here\./,
  );
  const source = structuredClone(validSource());
  source.entrypoints = { "./custom/reveal": { source: "./src/custom/reveal/index.ts" } };
  assert.throws(
    () => parseSourceDescriptor(source),
    /"entrypoints"\["\.\/custom\/reveal"\] is missing required field "requires"\./,
  );
  source.entrypoints = { "./custom/reveal": { source: "./src/reveal.css", requires: [] } };
  assert.throws(() => parseSourceDescriptor(source), /source must be a package-relative/);
});

test("an empty entrypoints or extensions section is rejected on a neutral system", () => {
  const source = structuredClone(validSource());
  source.entrypoints = {};
  assert.throws(
    () => parseSourceDescriptor(source),
    /"entrypoints" must not be empty; omit the section on a neutral system/,
  );
  const emptyExtensions = readJson(
    fixturePath("invalid-empty-extensions", "design-system.source.json"),
  );
  assert.throws(
    () => parseSourceDescriptor(emptyExtensions),
    /"extensions" must not be empty; omit the section on a neutral system/,
  );
});

test("a declared entrypoint must exist in package.json exports", (t) => {
  const dir = withCustomFixture(t, (target) => {
    const pkg = readFixtureJson(target, "package.json");
    delete pkg.exports["./custom/reveal"];
    writeFixtureJson(target, "package.json", pkg);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: dir }),
    /Declared entrypoint "\.\/custom\/reveal" is missing from package\.json exports\./,
  );
});

test("additional public code exports must be declared", (t) => {
  const dir = withCustomFixture(t, (target) => {
    const pkg = readFixtureJson(target, "package.json");
    pkg.exports["./custom/undeclared"] = {
      types: "./dist/custom/undeclared/index.d.ts",
      import: "./dist/custom/undeclared/index.mjs",
    };
    writeFixtureJson(target, "package.json", pkg);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: dir }),
    /package\.json exports\["\.\/custom\/undeclared"\] is an additional public code entrypoint; declare it in design-system\.source\.json "entrypoints"/,
  );
});

test("CSS and manifest asset exports are never treated as code entrypoints", (t) => {
  const dir = withCustomFixture(t, (target) => {
    const pkg = readFixtureJson(target, "package.json");
    pkg.exports["./extra.css"] = "./dist/extra.css";
    pkg.exports["./extra.json"] = "./dist/extra.json";
    writeFixtureJson(target, "package.json", pkg);
  });
  // Asset exports are ignored by the catalog without any source declaration.
  const manifest = buildManifest({ id: "valid-custom", packageDir: dir });
  assert.deepEqual(Object.keys(manifest.entrypoints), [
    ".",
    "./tokens",
    "./custom/reveal",
    "./custom/keyboard-scene",
  ]);
});

test("a declared entrypoint source file must exist and stay contained", (t) => {
  const missing = withCustomFixture(t, (target) => {
    const source = readFixtureJson(target, "design-system.source.json");
    source.entrypoints["./custom/reveal"].source = "./src/custom/missing/index.ts";
    writeFixtureJson(target, "design-system.source.json", source);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: missing }),
    /Entrypoint "\.\/custom\/reveal" source does not exist: \.\/src\/custom\/missing\/index\.ts\./,
  );
  const escaped = withCustomFixture(t, (target) => {
    const source = readFixtureJson(target, "design-system.source.json");
    source.extensions.Reveal.docs = "./../outside.md";
    writeFixtureJson(target, "design-system.source.json", source);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: escaped }),
    /Extension "Reveal" docs escapes/,
  );
});

test("an extension must be a real runtime named export of its entrypoint", (t) => {
  const dir = withCustomFixture(t, (target) => {
    writeFileSync(
      join(target, "src", "custom", "reveal", "index.ts"),
      'export { Reveal as RevealInternal } from "./Reveal.js";\n',
      "utf8",
    );
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: dir }),
    /Extension "Reveal" is not a runtime named export of entrypoint "\.\/custom\/reveal"/,
  );
});

test("an extension with only type exports has no publishable entrypoint", (t) => {
  const dir = withCustomFixture(t, (target) => {
    writeFileSync(
      join(target, "src", "custom", "reveal", "index.ts"),
      'export type { Reveal } from "./Reveal.js";\n',
      "utf8",
    );
    const source = readFixtureJson(target, "design-system.source.json");
    delete source.extensions.Reveal;
    writeFixtureJson(target, "design-system.source.json", source);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: dir }),
    /Declared entrypoint "\.\/custom\/reveal" source \.\/src\/custom\/reveal\/index\.ts has no runtime named exports; empty subpath modules are never generated or declared\./,
  );
});

test("extension docs and examples must be contained real files", (t) => {
  const dir = withCustomFixture(t, (target) => {
    const source = readFixtureJson(target, "design-system.source.json");
    source.extensions.Reveal.example = "./examples/missing.tsx";
    writeFixtureJson(target, "design-system.source.json", source);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: dir }),
    /Extension "Reveal" example does not exist: \.\/examples\/missing\.tsx\./,
  );
});

test("requirements resolve ranges from package.json and fail closed when absent", (t) => {
  const missing = withCustomFixture(t, (target) => {
    const pkg = readFixtureJson(target, "package.json");
    delete pkg.peerDependencies.three;
    delete pkg.peerDependenciesMeta.three;
    writeFixtureJson(target, "package.json", pkg);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: missing }),
    /Entrypoint "\.\/custom\/reveal" requires "three", which is not declared in package\.json dependencies, optionalDependencies, or peerDependencies; ranges are never duplicated in design-system\.source\.json\./,
  );
  const ambiguous = withCustomFixture(t, (target) => {
    const pkg = readFixtureJson(target, "package.json");
    pkg.dependencies.three = "^0.186.0";
    writeFixtureJson(target, "package.json", pkg);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: ambiguous }),
    /Entrypoint "\.\/custom\/reveal" requires "three" more than once in package\.json dependencies\/optionalDependencies\/peerDependencies; declare it in exactly one place\./,
  );
  const emptyRange = withCustomFixture(t, (target) => {
    const pkg = readFixtureJson(target, "package.json");
    pkg.peerDependencies.three = "";
    writeFixtureJson(target, "package.json", pkg);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: emptyRange }),
    /Entrypoint "\.\/custom\/reveal" requires "three" has an empty range in package\.json\./,
  );
  const selfRequire = withCustomFixture(t, (target) => {
    const source = readFixtureJson(target, "design-system.source.json");
    source.entrypoints["./custom/reveal"].requires = ["@prism-system/ui-valid-custom"];
    writeFixtureJson(target, "design-system.source.json", source);
  });
  assert.throws(
    () => buildManifest({ id: "valid-custom", packageDir: selfRequire }),
    /requires itself \("@prism-system\/ui-valid-custom"\)/,
  );
});

test("optional peers derive optional=true from peerDependenciesMeta", () => {
  const manifest = buildManifest({ id: "valid-custom", packageDir: customFixture() });
  const [core, three] = manifest.entrypoints["./custom/reveal"].requirements;
  assert.equal(core.optional, false);
  assert.equal(core.kind, "dependency");
  assert.equal(three.optional, true);
  assert.equal(three.kind, "peer");
});

test("a manifest with a bad requirement kind or publicApi mismatch fails closed", () => {
  const base = () =>
    structuredClone(buildManifest({ id: "valid-custom", packageDir: customFixture() }));

  const badKind = base();
  badKind.entrypoints["./custom/reveal"].requirements[1].kind = "runtime";
  assert.throws(
    () => parseManifest(badKind),
    /requirements\[1\]\.kind must be exactly "dependency" or "peer" \(received "runtime"\)\./,
  );

  const missingEntrypoint = base();
  delete missingEntrypoint.entrypoints["./custom/reveal"];
  assert.throws(
    () => parseManifest(missingEntrypoint),
    /"publicApi" must declare exactly the entrypoints\. Unknown: \.\/custom\/reveal\./,
  );

  const missingPublicName = base();
  missingPublicName.publicApi["./custom/reveal"] = ["revealPresets"];
  assert.throws(
    () => parseManifest(missingPublicName),
    /extension "Reveal" is not listed in "publicApi"/,
  );

  const missingRequiredRoot = base();
  delete missingRequiredRoot.entrypoints["./tokens"];
  assert.throws(
    () => parseManifest(missingRequiredRoot),
    /"entrypoints" is missing required entrypoint "\.\/tokens"\./,
  );

  const unknownExtensionEntrypoint = base();
  unknownExtensionEntrypoint.extensions.Reveal.entrypoint = "./not-declared";
  assert.throws(
    () => parseManifest(unknownExtensionEntrypoint),
    /extension "Reveal" entrypoint "\.\/not-declared" is not declared in "entrypoints"\./,
  );
});

/* -------------------------------------------------------------------------- */
/* Huge numeric identifiers: lossless exact-version evidence                  */
/* -------------------------------------------------------------------------- */

/**
 * Gate A cross-validator evidence for exact package versions whose numeric
 * identifiers exceed Number.MAX_SAFE_INTEGER (2^53 - 1). A Number-coerced
 * validator collapses adjacent values such as 2^53 and 2^53 + 1, so the
 * generator, the shipped schema regex, and the consumer tooling must all keep
 * these versions as byte-exact strings.
 *
 * Evidence limits, stated explicitly:
 *  - The maintainer generator pattern is not exported, so generator acceptance
 *    is proven through `buildManifest` succeeding and preserving the exact
 *    version string, plus a JSON round-trip that would coerce a number.
 *  - The shipped-schema leg is a direct `properties.version.pattern` regex
 *    check only. No JSON Schema engine and no new dependency are used, so it
 *    proves the published pattern accepts the value, not full schema
 *    conformance.
 *  - The consumer-tooling leg calls the real `@prism-system/tools` public
 *    helpers and is expected to fail until the tools writer lands lossless
 *    numeric identifiers. It must never be worked around by narrowing the
 *    generator or schema pattern.
 */
const HUGE_VERSION = "9007199254740992.0.0"; // 2^53
const HUGE_NEXT_VERSION = "9007199254740993.0.0"; // 2^53 + 1, adjacent beyond safe integers
const HUGE_PRERELEASE_VERSION = `${HUGE_VERSION}-9007199254740993`;

/** Copy the neutral valid fixture and rewrite only `package.json.version`. */
function makeHugeVersionFixture(t, version) {
  const dir = mkdtempSync(join(tmpdir(), "prism-huge-version-"));
  cpSync(fixturePath("valid"), dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const packageJsonPath = join(dir, "package.json");
  const pkg = readJson(packageJsonPath);
  pkg.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return dir;
}

/**
 * Load the consumer-tooling contract for cross-validation. A bare
 * `@prism-system/tools` import can resolve to an unrelated (possibly stale)
 * npm install in an ancestor `node_modules` outside this repository, which
 * would not evidence this repository's implementation. Use the public
 * specifier only when it resolves inside the repository; otherwise load the
 * workspace package entry, which is the module the published root re-exports.
 * Loaded lazily so a transiently broken tools package fails only these
 * cross-validator tests.
 */
async function loadToolsContract() {
  try {
    const resolved = import.meta.resolve("@prism-system/tools");
    const resolvedPath = fileURLToPath(resolved);
    if (resolvedPath.startsWith(`${repoRoot}${sep}`)) return await import(resolved);
  } catch {
    // Fall through to the workspace entry when the public specifier is absent.
  }
  return import("../packages/tools/src/index.mjs");
}

/** The shipped manifest `version` regex, read from the schema file. */
function shippedVersionPattern() {
  const schema = readJson(join(repoRoot, "schemas", "design-system.schema.json"));
  return new RegExp(schema.properties.version.pattern);
}

test("a huge exact package version is generated, parsed, and schema-accepted byte-exactly", (t) => {
  const dir = makeHugeVersionFixture(t, HUGE_VERSION);
  const manifest = buildManifest({ id: "v4-valid", packageDir: dir });
  assert.equal(manifest.version, HUGE_VERSION, "generation must preserve the exact version string");
  assert.equal(parseManifest(manifest).version, HUGE_VERSION, "maintainer parsing must not coerce");
  assert.equal(
    JSON.parse(JSON.stringify(manifest)).version,
    HUGE_VERSION,
    "JSON round-trips must keep the version a byte-exact string",
  );
  assert.equal(
    shippedVersionPattern().test(HUGE_VERSION),
    true,
    "shipped schema version pattern must accept the huge exact version",
  );
});

test("a huge numeric prerelease identifier is generated, parsed, and schema-accepted byte-exactly", (t) => {
  const dir = makeHugeVersionFixture(t, HUGE_PRERELEASE_VERSION);
  const manifest = buildManifest({ id: "v4-valid", packageDir: dir });
  assert.equal(manifest.version, HUGE_PRERELEASE_VERSION);
  assert.equal(parseManifest(manifest).version, HUGE_PRERELEASE_VERSION);
  assert.equal(shippedVersionPattern().test(HUGE_PRERELEASE_VERSION), true);
});

test("consumer tooling accepts huge exact versions without rejection or coercion", async (t) => {
  const tools = await loadToolsContract();
  const dir = makeHugeVersionFixture(t, HUGE_VERSION);
  const manifest = buildManifest({ id: "v4-valid", packageDir: dir });

  assert.equal(
    tools.isExactSemver(HUGE_VERSION),
    true,
    "tools must accept a huge exact version instead of rejecting beyond MAX_SAFE_INTEGER",
  );
  const failures = tools.collectManifestFailures(manifest, {
    packageName: manifest.package,
    version: manifest.version,
  });
  assert.deepEqual(failures, [], failures.join("\n"));
  assert.doesNotThrow(() =>
    tools.validateDesignSystemManifest(manifest, {
      packageName: manifest.package,
      version: manifest.version,
    }),
  );
  assert.equal(tools.isExactSemver(HUGE_PRERELEASE_VERSION), true);
  assert.ok(
    tools.compareExactSemver(HUGE_PRERELEASE_VERSION, `${HUGE_VERSION}-9007199254740992`) > 0,
    "adjacent numeric prerelease identifiers must compare losslessly",
  );
});

test("adjacent out-of-range big peer versions are never falsely satisfied", async () => {
  const tools = await loadToolsContract();
  // 2^53 and 2^53 + 1 collapse to the same IEEE-754 double, so a Number-based
  // comparison would report the first range result below as satisfied.
  assert.equal(
    tools.satisfiesSemverRange(HUGE_VERSION, `>=${HUGE_NEXT_VERSION}`),
    false,
    "2^53 must not satisfy >= 2^53 + 1",
  );
  assert.equal(
    tools.satisfiesSemverRange(HUGE_NEXT_VERSION, `>${HUGE_VERSION}`),
    true,
    "2^53 + 1 must satisfy > 2^53 (discriminates lossless comparison)",
  );
  assert.equal(
    tools.satisfiesSemverRange(
      `${HUGE_VERSION}-9007199254740992`,
      `>=${HUGE_VERSION}-9007199254740993`,
    ),
    false,
    "adjacent huge numeric prerelease identifiers must not collapse",
  );
});
