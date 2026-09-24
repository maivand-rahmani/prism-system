#!/usr/bin/env node
/**
 * Offline token catalog tests.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/tokens-catalog.test.mjs
 *
 * Two layers are covered:
 *
 *   1. `buildTokenCatalog` — the pure mapping rules, exercised directly against
 *      the real A/B V4 manifests augmented with the required `tokens.names`
 *      prefixes, and against the real V2 fixture.
 *   2. `listDesignSystemTokens` — the end-to-end offline consumer path against
 *      disposable temp consumers, including "no writes" and "no network".
 *
 * No design-system or `@prism-system/ui-core` code is imported or executed; the
 * real manifests are read as JSON data and copied behind public `./manifest`
 * exports in temporary consumers.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { V4_TOKEN_GROUP_KEYS } from "../src/constants.mjs";
import { buildTokenCatalog, listDesignSystemTokens } from "../src/tokens.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..", "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const v2Manifest = readJson(
  join(repoRoot, "schemas", "fixtures", "v2-valid", "design-system.json"),
);
const systemAManifest = readJson(join(repoRoot, "packages", "system-a", "design-system.json"));
const systemBManifest = readJson(join(repoRoot, "packages", "system-b", "design-system.json"));

/** The prefixes the real systems' generated bridges use. */
const SYSTEM_A_PREFIXES = Object.freeze({
  cssVariablePrefix: "maivand-a",
  tailwindUtilityPrefix: "prism",
});

/** Clone a V4 manifest and add the required `tokens.names` metadata. */
function withTokenNames(manifest, names = SYSTEM_A_PREFIXES) {
  const clone = structuredClone(manifest);
  clone.tokens.names = { ...names };
  return clone;
}

const systemATokens = withTokenNames(systemAManifest);
const systemBTokens = withTokenNames(systemBManifest, {
  cssVariablePrefix: "maivand-b",
  tailwindUtilityPrefix: "prism",
});

/* -------------------------------------------------------------------------- */
/* Temp consumer fixtures                                                     */
/* -------------------------------------------------------------------------- */

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Create a disposable consumer with the manifest copied behind `./manifest`. */
function createConsumer(t, { manifest, withConfig = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-tokens-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    dependencies: { [manifest.package]: manifest.version },
  });

  if (withConfig) {
    writeJson(join(root, ".design-system", "config.json"), {
      $schema:
        "https://github.com/maivand-rahmani/prism-system/schemas/design-system-consumer.schema.json",
      schemaVersion: 1,
      package: manifest.package,
      version: manifest.version,
      manifest: "./manifest",
      strict: true,
    });
  }

  const packageDir = join(root, "node_modules", ...manifest.package.split("/"));
  writeJson(join(packageDir, "package.json"), {
    name: manifest.package,
    version: manifest.version,
    exports: { "./manifest": "./design-system.json" },
  });
  writeJson(join(packageDir, "design-system.json"), manifest);

  return { root, packageName: manifest.package };
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(root);
  return out;
}

function snapshot(root) {
  const map = new Map();
  for (const file of listFiles(root)) map.set(file, readFileSync(file, "utf8"));
  return map;
}

/** Find one token entry by group + manifest path. */
function findToken(catalog, group, path) {
  const bucket = catalog.groups.find((entry) => entry.group === group);
  assert.ok(bucket, `group ${group} exists`);
  const token = bucket.tokens.find((entry) => entry.path === path);
  assert.ok(token, `token ${group}/${path} exists`);
  return token;
}

/* -------------------------------------------------------------------------- */
/* Pure mapping rules — real V4 manifests                                     */
/* -------------------------------------------------------------------------- */

test("V4 catalog reports supported with the manifest prefixes and canonical group order", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  assert.equal(catalog.contract, "v4");
  assert.equal(catalog.supported, true);
  assert.equal(catalog.reason, null);
  assert.deepEqual(catalog.prefixes, { css: "maivand-a", tailwind: "prism" });
  assert.deepEqual(catalog.groupNames, [...V4_TOKEN_GROUP_KEYS]);
  assert.deepEqual(
    catalog.groups.map((entry) => entry.group),
    [...V4_TOKEN_GROUP_KEYS],
  );
  assert.equal(catalog.counts.groups, 9);
  assert.equal(catalog.counts.tokens, 108);
  assert.equal(catalog.requested, null);
});

test("theme colors keep light/dark context and share one CSS variable and utility", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const light = findToken(catalog, "themes", "light.color.text.primary");
  const dark = findToken(catalog, "themes", "dark.color.text.primary");

  assert.equal(light.theme, "light");
  assert.equal(light.name, "color.text.primary");
  assert.equal(light.cssVariable, "--maivand-a-color-text-primary");
  assert.deepEqual(light.tailwind, {
    namespace: "color",
    variable: "--color-prism-text-primary",
    utility: "text-prism-text-primary",
    variant: null,
  });

  assert.equal(dark.theme, "dark");
  assert.equal(dark.name, "color.text.primary");
  // Dark overrides the same generated variable and bridge alias.
  assert.equal(dark.cssVariable, light.cssVariable);
  assert.equal(dark.tailwind.variable, light.tailwind.variable);
  assert.equal(dark.tailwind.utility, light.tailwind.utility);

  const lightCount = catalog.groups
    .find((entry) => entry.group === "themes")
    .tokens.filter((entry) => entry.theme === "light").length;
  const darkCount = catalog.groups
    .find((entry) => entry.group === "themes")
    .tokens.filter((entry) => entry.theme === "dark").length;
  assert.equal(lightCount, 21);
  assert.equal(darkCount, 21);
});

test("theme color roles map to their representative Tailwind color class", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const cases = [
    ["light.color.text.primary", "--color-prism-text-primary", "text-prism-text-primary"],
    ["light.color.text.inverse", "--color-prism-text-inverse", "text-prism-text-inverse"],
    ["light.color.surface.canvas", "--color-prism-surface-canvas", "bg-prism-surface-canvas"],
    ["light.color.surface.sunken", "--color-prism-surface-sunken", "bg-prism-surface-sunken"],
    ["light.color.border.default", "--color-prism-border-default", "border-prism-border-default"],
    ["light.color.border.focus", "--color-prism-border-focus", "border-prism-border-focus"],
    ["light.color.action.primary", "--color-prism-action-primary", "bg-prism-action-primary"],
    [
      "light.color.action.primaryHover",
      "--color-prism-action-primary-hover",
      "bg-prism-action-primary-hover",
    ],
    ["light.color.status.info", "--color-prism-status-info", "text-prism-status-info"],
    ["light.color.status.danger", "--color-prism-status-danger", "text-prism-status-danger"],
  ];
  for (const [path, variable, utility] of cases) {
    const token = findToken(catalog, "themes", path);
    assert.equal(token.tailwind.namespace, "color", path);
    assert.equal(token.tailwind.variable, variable, path);
    assert.equal(token.tailwind.utility, utility, path);
    assert.equal(token.tailwind.variant, null, path);
  }
});

test("every theme color reports a valid class and both themes share it", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const themes = catalog.groups.find((entry) => entry.group === "themes").tokens;

  for (const token of themes) {
    assert.equal(token.tailwind.namespace, "color", token.path);
    assert.match(token.tailwind.utility, /^(?:text|bg|border)-prism-[a-z0-9-]+$/, token.path);
    assert.equal(token.tailwind.variant, null, token.path);
  }

  const lights = themes.filter((entry) => entry.theme === "light");
  for (const light of lights) {
    const darkPath = `dark.${light.path.slice("light.".length)}`;
    const dark = themes.find((entry) => entry.path === darkPath);
    assert.ok(dark, `dark counterpart ${darkPath} exists`);
    assert.equal(dark.tailwind.variable, light.tailwind.variable, light.path);
    assert.equal(dark.tailwind.utility, light.tailwind.utility, light.path);
  }
});

test("a theme subtree with no color variable reports no fabricated class", () => {
  const manifest = withTokenNames(systemAManifest);
  manifest.tokens.groups.themes.push("light.elevation.raised");
  const catalog = buildTokenCatalog({ manifest });
  const token = findToken(catalog, "themes", "light.elevation.raised");
  assert.equal(token.tailwind, null);
});

test("typography maps to the generated font, text, leading, and tracking namespaces", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const cases = [
    ["family.sans", "font", "--font-prism-sans", "font-prism-sans"],
    ["size.lg", "text", "--text-prism-lg", "text-prism-lg"],
    ["weight.semibold", "font-weight", "--font-weight-prism-semibold", "font-prism-semibold"],
    ["lineHeight.tight", "leading", "--leading-prism-tight", "leading-prism-tight"],
    ["letterSpacing.wide", "tracking", "--tracking-prism-wide", "tracking-prism-wide"],
  ];
  for (const [path, namespace, variable, utility] of cases) {
    const token = findToken(catalog, "typography", path);
    assert.equal(token.tailwind.namespace, namespace, path);
    assert.equal(token.tailwind.variable, variable, path);
    assert.equal(token.tailwind.utility, utility, path);
  }
  assert.equal(
    findToken(catalog, "typography", "family.sans").cssVariable,
    "--maivand-a-typography-family-sans",
  );
  assert.equal(
    findToken(catalog, "typography", "lineHeight.tight").name,
    "typography.lineHeight.tight",
  );
});

test("spacing drops the scale/semantic subgroup in Tailwind but not in CSS", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const scale = findToken(catalog, "spacing", "scale.4");
  assert.equal(scale.name, "spacing.scale.4");
  assert.equal(scale.cssVariable, "--maivand-a-spacing-scale-4");
  assert.deepEqual(scale.tailwind, {
    namespace: "spacing",
    variable: "--spacing-prism-4",
    utility: "p-prism-4",
    variant: null,
  });

  const semantic = findToken(catalog, "spacing", "semantic.inline");
  assert.equal(semantic.cssVariable, "--maivand-a-spacing-semantic-inline");
  assert.equal(semantic.tailwind.variable, "--spacing-prism-inline");
  assert.equal(semantic.tailwind.utility, "p-prism-inline");
});

test("containers, radius, shadow, and easing use their matching named namespaces", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const cases = [
    [
      "containers",
      "content",
      "--maivand-a-containers-content",
      "--container-prism-content",
      "max-w-prism-content",
    ],
    ["radius", "md", "--maivand-a-radius-md", "--radius-prism-md", "rounded-prism-md"],
    ["shadow", "focus", "--maivand-a-shadow-focus", "--shadow-prism-focus", "shadow-prism-focus"],
    [
      "motion",
      "easing.standard",
      "--maivand-a-motion-easing-standard",
      "--ease-prism-standard",
      "ease-prism-standard",
    ],
  ];
  for (const [group, path, cssVariable, variable, utility] of cases) {
    const token = findToken(catalog, group, path);
    assert.equal(token.cssVariable, cssVariable, `${group}/${path} css`);
    assert.equal(token.tailwind.variable, variable, `${group}/${path} variable`);
    assert.equal(token.tailwind.utility, utility, `${group}/${path} utility`);
  }
});

test("breakpoints are reported as variants, never as fabricated utility classes", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const sm = findToken(catalog, "breakpoints", "sm");
  assert.equal(sm.cssVariable, "--maivand-a-breakpoints-sm");
  assert.deepEqual(sm.tailwind, {
    namespace: "breakpoint",
    variable: "--breakpoint-prism-sm",
    utility: null,
    variant: "prism-sm",
  });
});

test("layers and motion duration return no named Tailwind mapping (never fabricated)", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens });
  const layer = findToken(catalog, "layers", "modal");
  assert.equal(layer.cssVariable, "--maivand-a-layers-modal");
  assert.equal(layer.tailwind, null);

  const duration = findToken(catalog, "motion", "duration.fast");
  assert.equal(duration.cssVariable, "--maivand-a-motion-duration-fast");
  assert.equal(duration.tailwind, null);

  const serialized = JSON.stringify(catalog);
  assert.ok(!serialized.includes("--duration-prism"), serialized);
  assert.ok(!serialized.includes("--z-prism"), serialized);
});

test("group filtering returns the requested group and keeps the full catalog", () => {
  const catalog = buildTokenCatalog({ manifest: systemATokens, group: "radius" });
  assert.equal(catalog.requested.group, "radius");
  assert.equal(catalog.requested.tokens.length, 5);
  assert.deepEqual(
    catalog.requested.tokens.map((token) => token.path),
    ["none", "sm", "md", "lg", "full"],
  );
  assert.equal(catalog.groups.length, 9);

  const empty = buildTokenCatalog({ manifest: systemATokens, group: "layers" });
  assert.equal(empty.requested.tokens.length, 7);
});

test("an unknown token group is rejected with the known set", () => {
  assert.throws(
    () => buildTokenCatalog({ manifest: systemATokens, group: "colors" }),
    /Unknown token group "colors"; known groups are: themes, typography, spacing,/,
  );
  assert.throws(() => buildTokenCatalog({ manifest: systemATokens, group: "" }), /non-empty/);
});

test("the second system derives its own CSS prefix from its own manifest", () => {
  const catalog = buildTokenCatalog({ manifest: systemBTokens, group: "themes" });
  assert.equal(catalog.prefixes.css, "maivand-b");
  assert.equal(
    findToken(catalog, "themes", "light.color.text.primary").cssVariable,
    "--maivand-b-color-text-primary",
  );
  // The Tailwind utility prefix is independent of the CSS prefix.
  assert.equal(
    findToken(catalog, "themes", "light.color.text.primary").tailwind.variable,
    "--color-prism-text-primary",
  );
});

test("catalog output is deterministic", () => {
  const first = buildTokenCatalog({ manifest: systemATokens, group: "spacing" });
  const second = buildTokenCatalog({ manifest: systemATokens, group: "spacing" });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

/* -------------------------------------------------------------------------- */
/* Fail-closed manifest metadata                                              */
/* -------------------------------------------------------------------------- */

test("missing or invalid tokens.names prefixes fail closed", () => {
  const noNames = structuredClone(systemAManifest);
  delete noNames.tokens.names;
  assert.throws(() => buildTokenCatalog({ manifest: noNames }), /missing "tokens\.names"/);

  const noCss = withTokenNames(systemAManifest);
  delete noCss.tokens.names.cssVariablePrefix;
  assert.throws(
    () => buildTokenCatalog({ manifest: noCss }),
    /tokens\.names\.cssVariablePrefix must be a non-empty string/,
  );

  const noTailwind = withTokenNames(systemAManifest);
  delete noTailwind.tokens.names.tailwindUtilityPrefix;
  assert.throws(
    () => buildTokenCatalog({ manifest: noTailwind }),
    /tokens\.names\.tailwindUtilityPrefix must be a non-empty string/,
  );

  const badCss = withTokenNames(systemAManifest, {
    cssVariablePrefix: "Bad Prefix",
    tailwindUtilityPrefix: "prism",
  });
  assert.throws(
    () => buildTokenCatalog({ manifest: badCss }),
    /cssVariablePrefix "Bad Prefix" is not a safe lower-kebab namespace/,
  );

  const badTailwind = withTokenNames(systemAManifest, {
    cssVariablePrefix: "maivand-a",
    tailwindUtilityPrefix: "-prism-",
  });
  assert.throws(
    () => buildTokenCatalog({ manifest: badTailwind }),
    /tailwindUtilityPrefix "-prism-" is not a safe lower-kebab namespace/,
  );
});

test("an unsupported schema/contract pair fails closed", () => {
  assert.throws(
    () => buildTokenCatalog({ manifest: { schemaVersion: 3, contract: "v5" } }),
    /Unsupported design-system manifest/,
  );
  assert.throws(() => buildTokenCatalog({ manifest: null }), /manifest object is required/);
});

/* -------------------------------------------------------------------------- */
/* V2 handling                                                                */
/* -------------------------------------------------------------------------- */

test("V2 manifests report a clear no-token-catalog result instead of throwing", () => {
  const catalog = buildTokenCatalog({ manifest: v2Manifest });
  assert.equal(catalog.contract, "v2");
  assert.equal(catalog.supported, false);
  assert.match(catalog.reason, /V2 design systems declare no token catalog/);
  assert.equal(catalog.prefixes, null);
  assert.deepEqual(catalog.groups, []);
  assert.deepEqual(catalog.groupNames, []);
  assert.deepEqual(catalog.counts, { groups: 0, tokens: 0 });
  assert.equal(catalog.requested, null);
  assert.equal(catalog.id, "v2-valid");
});

test("V2 ignores a requested group rather than rejecting V2", () => {
  const catalog = buildTokenCatalog({ manifest: v2Manifest, group: "themes" });
  assert.equal(catalog.supported, false);
  assert.equal(catalog.requested, null);
});

/* -------------------------------------------------------------------------- */
/* End-to-end consumer path                                                   */
/* -------------------------------------------------------------------------- */

test("listDesignSystemTokens reads a real V2 consumer and never throws", (t) => {
  const { root, packageName } = createConsumer(t, { manifest: v2Manifest, withConfig: true });

  const result = listDesignSystemTokens({ cwd: root });

  assert.equal(result.ok, true);
  assert.equal(result.supported, false);
  assert.equal(result.contract, "v2");
  assert.equal(result.package, packageName);
  assert.equal(result.version, "1.1.0");
  assert.match(result.reason, /no token catalog/);
  assert.deepEqual(result.groups, []);
});

test("listDesignSystemTokens reads a real V4 consumer end-to-end", (t) => {
  const { root, packageName } = createConsumer(t, { manifest: systemATokens, withConfig: true });

  const result = listDesignSystemTokens({ cwd: root, group: "radius" });

  assert.equal(result.ok, true);
  assert.equal(result.supported, true);
  assert.equal(result.contract, "v4");
  assert.equal(result.package, packageName);
  assert.equal(result.version, systemATokens.version);
  assert.deepEqual(result.prefixes, { css: "maivand-a", tailwind: "prism" });
  assert.equal(result.requested.group, "radius");
  assert.equal(result.requested.tokens.length, 5);
});

test("listDesignSystemTokens writes nothing", (t) => {
  const { root } = createConsumer(t, { manifest: systemATokens, withConfig: true });
  const before = snapshot(root);

  listDesignSystemTokens({ cwd: root, group: "spacing" });

  const after = snapshot(root);
  assert.deepEqual([...after.entries()], [...before.entries()]);
});

test("listDesignSystemTokens makes no network access", (t) => {
  const { root } = createConsumer(t, { manifest: systemATokens, withConfig: true });
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = () => {
    called = true;
    throw new Error("network access attempted");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = listDesignSystemTokens({ cwd: root });
  assert.equal(result.ok, true);
  assert.equal(called, false);
});

test("listDesignSystemTokens requires an explicit consumer root", () => {
  assert.throws(() => listDesignSystemTokens({}), /explicit --cwd/);
});
