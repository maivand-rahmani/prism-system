#!/usr/bin/env node
/**
 * V4 contract validation tests (Node built-in test runner, no dependency).
 *
 * Run directly:
 *   node --test scripts/validate-v4-manifest.test.mjs
 *
 * These tests exercise the same exported validation helpers the manifest
 * generation path uses (`readSourceDescriptor`, `buildManifest`,
 * `parseV4SourceDescriptor`, `parseV4Manifest`, `parseTokenSource`, and
 * `dispatchSchemaContract`), so the fixtures cover the real code path and not a
 * test-only reimplementation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  V4_OPTIONAL_COMPONENTS,
  V4_REQUIRED_COMPONENTS,
  buildManifest,
  dispatchSchemaContract,
  parseTokenSource,
  parseV4Manifest,
  parseV4SourceDescriptor,
  readSourceDescriptor,
} from "./design-system-manifest.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "schemas", "fixtures");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fixturePath = (...segments) => join(fixturesRoot, ...segments);

test("dispatch accepts only (1, v2) and (2, v4)", () => {
  assert.equal(dispatchSchemaContract({ schemaVersion: 1, contract: "v2" }), "v2");
  assert.equal(dispatchSchemaContract({ schemaVersion: 2, contract: "v4" }), "v4");
  assert.throws(
    () => dispatchSchemaContract({ schemaVersion: 3, contract: "v2" }),
    /Unsupported schema\/contract pair \(3, "v2"\); expected \(1, "v2"\) or \(2, "v4"\)\./,
  );
  assert.throws(
    () => dispatchSchemaContract({ schemaVersion: 2, contract: "v2" }),
    /Unsupported schema\/contract pair \(2, "v2"\)/,
  );
  assert.throws(
    () => dispatchSchemaContract({ schemaVersion: 1 }),
    /Unsupported schema\/contract pair \(1, undefined\)/,
  );
});

test("a valid V4 manifest builds with multiple different optional subsets", () => {
  const a = buildManifest({ id: "v4-valid", packageDir: fixturePath("v4-valid") });
  assert.equal(a.schemaVersion, 2);
  assert.equal(a.contract, "v4");
  assert.equal(a.generated, "prism-system/design-system-manifest");
  assert.equal(a.package, "@prism-system/ui-v4-valid");
  for (const name of V4_REQUIRED_COMPONENTS) {
    assert.ok(name in a.components, `required component ${name} is present`);
  }
  assert.ok("Grid" in a.components && "Alert" in a.components);
  assert.ok(!("Toast" in a.components) && !("Table" in a.components));
  assert.deepEqual(a.publicApi["."], [
    ...V4_REQUIRED_COMPONENTS,
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
  // The generated output satisfies the V4 manifest validator.
  assert.equal(parseV4Manifest(a).contract, "v4");

  const b = buildManifest({ id: "v4-valid-b", packageDir: fixturePath("v4-valid-b") });
  assert.ok("Toast" in b.components && "Table" in b.components);
  assert.ok(!("Grid" in b.components) && !("Alert" in b.components));
  assert.deepEqual(
    V4_OPTIONAL_COMPONENTS.filter((name) => name in b.components),
    ["Toast", "Table"],
  );
  assert.equal(parseV4Manifest(b).contract, "v4");
});

test("readSourceDescriptor dispatches to V4 and reads tokens.source.json", () => {
  const descriptor = readSourceDescriptor(fixturePath("v4-valid"));
  assert.equal(descriptor.contract, "v4");
  assert.equal(descriptor.schemaVersion, 2);
  assert.equal(descriptor.name, "V4 Valid");
  assert.equal(Object.keys(descriptor.components).length, V4_REQUIRED_COMPONENTS.length + 2);
  assert.equal(descriptor.tokens.schemaVersion, 1);
});

test("a V4 descriptor missing a required component is rejected", () => {
  const raw = readJson(fixturePath("v4-invalid-missing-required", "design-system.source.json"));
  assert.throws(
    () => parseV4SourceDescriptor(raw),
    /^Error: design-system\.source\.json "components" must declare all twenty V4 required components and only implemented optional components\. Missing: Heading\.$/,
  );
});

test("a V4 descriptor with an unknown component is rejected", () => {
  const raw = readJson(fixturePath("v4-invalid-unknown-component", "design-system.source.json"));
  assert.throws(
    () => parseV4SourceDescriptor(raw),
    /must declare all twenty V4 required components and only implemented optional components\. Unknown: Widget\.$/,
  );
});

test("a boolean false optional component entry is rejected", () => {
  const raw = readJson(fixturePath("v4-invalid-false-optional", "design-system.source.json"));
  assert.throws(
    () => parseV4SourceDescriptor(raw),
    /^Error: Component "Grid" must be an object\.$/,
  );
});

test("an unsupported schema/contract pair fixture is rejected", () => {
  assert.throws(
    () => readSourceDescriptor(fixturePath("unsupported-pair")),
    /Unsupported schema\/contract pair \(3, "v2"\); expected \(1, "v2"\) or \(2, "v4"\)\./,
  );
});

test("V2 fixture source and manifest remain schema-1 v2", () => {
  const dir = fixturePath("v2-valid");
  const manifest = readJson(join(dir, "design-system.json"));
  assert.equal(dispatchSchemaContract(manifest, "manifest"), "v2");
  assert.equal(manifest.schemaVersion, 1);
  const descriptor = readSourceDescriptor(dir);
  assert.equal(descriptor.contract, "v2");
  assert.equal(Object.keys(descriptor.components).length, 14);
  // V2 generation output is unchanged and deep-identical to the fixture.
  const rebuilt = buildManifest({ id: "v2-valid", packageDir: dir });
  assert.deepEqual(rebuilt, manifest);
  // The V2 manifest carries no V4 token naming block at all.
  assert.ok(!("tokens" in rebuilt));
});

test("a generated V4 manifest publishes the canonical token naming contract", () => {
  const a = buildManifest({ id: "v4-valid", packageDir: fixturePath("v4-valid") });
  assert.deepEqual(a.tokens.names, {
    cssVariablePrefix: "maivand-valid",
    tailwindUtilityPrefix: "prism",
  });
  // The published names survive a full parse round-trip unchanged.
  assert.deepEqual(parseV4Manifest(a).tokens.names, a.tokens.names);

  const b = buildManifest({ id: "v4-valid-b", packageDir: fixturePath("v4-valid-b") });
  assert.deepEqual(b.tokens.names, {
    cssVariablePrefix: "maivand-valid-b",
    tailwindUtilityPrefix: "prism",
  });
});

test("a V4 manifest with missing, unknown, or malformed token names fails closed", () => {
  const base = () => buildManifest({ id: "v4-valid", packageDir: fixturePath("v4-valid") });

  const absent = base();
  delete absent.tokens.names;
  assert.throws(
    () => parseV4Manifest(absent),
    /^Error: design-system\.json "tokens" "names" must be an object\.$/,
  );

  const missing = base();
  delete missing.tokens.names.cssVariablePrefix;
  assert.throws(
    () => parseV4Manifest(missing),
    /^Error: design-system\.json "tokens" "names" is missing required field "cssVariablePrefix"\.$/,
  );

  const unknown = base();
  unknown.tokens.names.extra = "value";
  assert.throws(
    () => parseV4Manifest(unknown),
    /^Error: design-system\.json "tokens" "names" has unknown field "extra"; allowed fields are cssVariablePrefix, tailwindUtilityPrefix\.$/,
  );

  const malformedCss = base();
  malformedCss.tokens.names.cssVariablePrefix = "Maivand Valid";
  assert.throws(
    () => parseV4Manifest(malformedCss),
    /^Error: design-system\.json "tokens" "names"\.cssVariablePrefix must be a safe lower-kebab namespace \(received "Maivand Valid"\)\.$/,
  );

  const malformedTailwind = base();
  malformedTailwind.tokens.names.tailwindUtilityPrefix = "9prism";
  assert.throws(
    () => parseV4Manifest(malformedTailwind),
    /^Error: design-system\.json "tokens" "names"\.tailwindUtilityPrefix must be a safe lower-kebab namespace \(received "9prism"\)\.$/,
  );
});

test("valid token source with references is accepted", () => {
  const tokens = readJson(fixturePath("v4-valid", "tokens.source.json"));
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

const validSource = () => readJson(fixturePath("v4-valid", "design-system.source.json"));
const validTokens = () => readJson(fixturePath("v4-valid", "tokens.source.json"));

/** Assign `value` at a dot-separated path in a cloned fixture. */
function setPath(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) cursor = cursor[keys[index]];
  cursor[keys[keys.length - 1]] = value;
  return target;
}

test("a V4 component missing variants is rejected", () => {
  const source = structuredClone(validSource());
  delete source.components.Button.variants;
  assert.throws(
    () => parseV4SourceDescriptor(source),
    /^Error: Component "Button" is missing required field "variants"; "variants", "sizes", and "members" are required \(empty arrays are allowed\)\.$/,
  );
});

test("a V4 component missing sizes is rejected", () => {
  const source = structuredClone(validSource());
  delete source.components.Card.sizes;
  assert.throws(
    () => parseV4SourceDescriptor(source),
    /^Error: Component "Card" is missing required field "sizes"; "variants", "sizes", and "members" are required \(empty arrays are allowed\)\.$/,
  );
});

test("a V4 component missing members is rejected", () => {
  const source = structuredClone(validSource());
  delete source.components.Stack.members;
  assert.throws(
    () => parseV4SourceDescriptor(source),
    /^Error: Component "Stack" is missing required field "members"; "variants", "sizes", and "members" are required \(empty arrays are allowed\)\.$/,
  );
});

test("explicitly empty variants, sizes, and members stay valid", () => {
  const descriptor = parseV4SourceDescriptor(validSource());
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
