#!/usr/bin/env node
/**
 * Offline component catalog tests.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/components.test.mjs
 *
 * Two layers are covered:
 *
 *   1. `buildComponentCatalog` — the pure catalog rules, exercised directly
 *      against the real A/B V4 manifests and the V2 fixture (order, availability
 *      subsets, requested available/unavailable/unknown, metadata, route).
 *   2. `listDesignSystemComponents` — the end-to-end offline consumer path against
 *      disposable temp consumers, including "no writes" and "no network".
 *
 * No design-system or `@prism-system/ui-core` code is imported or executed; the
 * real manifests are read as JSON data and copied behind public `./manifest`
 * exports in temporary consumers.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  V2_REQUIRED_COMPONENTS,
  V4_COMPONENT_NAMES,
  V4_OPTIONAL_COMPONENTS,
  V4_REQUIRED_COMPONENTS,
} from "../src/constants.mjs";
import { buildComponentCatalog, listDesignSystemComponents } from "../src/components.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..", "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const v2Manifest = readJson(
  join(repoRoot, "schemas", "fixtures", "v2-valid", "design-system.json"),
);
const systemAManifest = readJson(join(repoRoot, "packages", "system-a", "design-system.json"));
const systemBManifest = readJson(join(repoRoot, "packages", "system-b", "design-system.json"));

const V4_MANIFESTS = [systemAManifest, systemBManifest];

/** Optionals a manifest actually declares, in canonical order. */
function declaredOptionals(manifest) {
  return V4_OPTIONAL_COMPONENTS.filter((name) => name in manifest.components);
}

/** Optionals a manifest leaves undeclared (unavailable), in canonical order. */
function undeclaredOptionals(manifest) {
  return V4_OPTIONAL_COMPONENTS.filter((name) => !(name in manifest.components));
}

/* -------------------------------------------------------------------------- */
/* Temp consumer fixtures                                                     */
/* -------------------------------------------------------------------------- */

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Create a disposable consumer with the manifest copied behind `./manifest`. */
function createConsumer(t, { manifest, withConfig = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-components-"));
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

/* -------------------------------------------------------------------------- */
/* Pure catalog rules — real V4 manifests                                     */
/* -------------------------------------------------------------------------- */

test("V4 catalog reports the twenty required plus twelve optional in canonical order", () => {
  for (const manifest of V4_MANIFESTS) {
    const catalog = buildComponentCatalog({ manifest });
    assert.equal(catalog.contract, "v4");
    assert.deepEqual(
      catalog.components.map((component) => component.name),
      [...V4_COMPONENT_NAMES],
      `${manifest.id} preserves canonical order`,
    );
    assert.equal(catalog.components.length, 32);
    assert.deepEqual(catalog.counts, {
      required: 20,
      optional: 12,
      available: 20 + declaredOptionals(manifest).length,
      unavailable: undeclaredOptionals(manifest).length,
    });
  }
});

test("V4 required components are always available and marked required", () => {
  for (const manifest of V4_MANIFESTS) {
    const catalog = buildComponentCatalog({ manifest });
    for (const name of V4_REQUIRED_COMPONENTS) {
      const entry = catalog.components.find((component) => component.name === name);
      assert.equal(entry.required, true, `${name} required`);
      assert.equal(entry.optional, false, `${name} not optional`);
      assert.equal(entry.available, true, `${name} available`);
    }
    assert.deepEqual(catalog.available.slice(0, V4_REQUIRED_COMPONENTS.length), [
      ...V4_REQUIRED_COMPONENTS,
    ]);
  }
});

test("V4 availability subsets match the declared optionals of each system", () => {
  const catalogA = buildComponentCatalog({ manifest: systemAManifest });
  assert.deepEqual(catalogA.unavailable, ["Section", "Skeleton", "Toast", "Avatar", "Breadcrumbs"]);
  assert.deepEqual(catalogA.available, [
    ...V4_REQUIRED_COMPONENTS,
    "Grid",
    "Fieldset",
    "Alert",
    "Progress",
    "Accordion",
    "Pagination",
    "Table",
  ]);

  const catalogB = buildComponentCatalog({ manifest: systemBManifest });
  assert.deepEqual(catalogB.unavailable, [
    "Grid",
    "Fieldset",
    "Progress",
    "Accordion",
    "Pagination",
    "Table",
  ]);
  assert.deepEqual(catalogB.available, [
    ...V4_REQUIRED_COMPONENTS,
    "Section",
    "Alert",
    "Skeleton",
    "Toast",
    "Avatar",
    "Breadcrumbs",
  ]);
});

test("available components expose declared variants, sizes, and compound members", () => {
  const catalog = buildComponentCatalog({ manifest: systemAManifest });
  const byName = new Map(catalog.components.map((component) => [component.name, component]));

  assert.deepEqual(byName.get("Button").variants, [
    "primary",
    "secondary",
    "outline",
    "ghost",
    "destructive",
    "link",
  ]);
  assert.deepEqual(byName.get("Button").sizes, ["sm", "md", "lg", "icon"]);
  assert.deepEqual(byName.get("Card").members, [
    "Header",
    "Title",
    "Description",
    "Content",
    "Footer",
  ]);
  // direction is a Stack prop, not a variant. The shipped catalog must not
  // advertise a variant API that the component does not implement.
  assert.deepEqual(byName.get("Stack").variants, []);
  assert.deepEqual(byName.get("FormField").members, ["Label", "Control", "Description", "Error"]);
});

test("undeclared optionals carry no fabricated API metadata", () => {
  const catalog = buildComponentCatalog({ manifest: systemAManifest });
  const section = catalog.components.find((component) => component.name === "Section");
  assert.equal(section.available, false);
  assert.equal(section.required, false);
  assert.equal(section.optional, true);
  assert.equal(section.variants, null);
  assert.equal(section.sizes, null);
  assert.equal(section.members, null);
  assert.equal("description" in section, false);
  assert.equal("docs" in section, false);
  assert.equal("example" in section, false);
});

test("declared optional metadata fields are passed through unchanged", () => {
  const manifest = structuredClone(systemAManifest);
  manifest.components.Button.description = "Primary action";
  manifest.components.Button.docs = "./docs/components.md";
  manifest.components.Button.example = "<Button>Save</Button>";
  const catalog = buildComponentCatalog({ manifest });
  const button = catalog.components.find((component) => component.name === "Button");
  assert.equal(button.description, "Primary action");
  assert.equal(button.docs, "./docs/components.md");
  assert.equal(button.example, "<Button>Save</Button>");
});

test("requested known component returns its declared API metadata", () => {
  const catalog = buildComponentCatalog({ manifest: systemAManifest, name: "Button" });
  assert.equal(catalog.requested.name, "Button");
  assert.equal(catalog.requested.available, true);
  assert.equal(catalog.requested.required, true);
  assert.deepEqual(catalog.requested.sizes, ["sm", "md", "lg", "icon"]);
});

test("requested unavailable optional is reported unavailable without metadata", () => {
  const catalog = buildComponentCatalog({ manifest: systemAManifest, name: "Section" });
  assert.equal(catalog.requested.name, "Section");
  assert.equal(catalog.requested.available, false);
  assert.equal(catalog.requested.required, false);
  assert.equal(catalog.requested.optional, true);
  assert.equal(catalog.requested.variants, null);
  assert.equal(catalog.requested.sizes, null);
  assert.equal(catalog.requested.members, null);
});

test("requested unavailable optional from system B is symmetric", () => {
  const catalog = buildComponentCatalog({ manifest: systemBManifest, name: "Grid" });
  assert.equal(catalog.requested.available, false);
  assert.equal(catalog.requested.variants, null);
});

test("requested unknown component name is rejected with the known set", () => {
  assert.throws(
    () => buildComponentCatalog({ manifest: systemAManifest, name: "Widget" }),
    /Unknown component "Widget"; known components are: Button, Input,/,
  );
  assert.throws(() => buildComponentCatalog({ manifest: systemAManifest, name: "" }), /non-empty/);
});

test("showcase route derives only from the validated manifest id", () => {
  assert.equal(
    buildComponentCatalog({ manifest: systemAManifest }).showcase.route,
    "/showcase/system-a",
  );
  assert.equal(
    buildComponentCatalog({ manifest: systemBManifest }).showcase.route,
    "/showcase/system-b",
  );
  assert.equal(
    buildComponentCatalog({ manifest: v2Manifest }).showcase.route,
    "/showcase/v2-valid",
  );
});

test("catalog output is deterministic", () => {
  const first = buildComponentCatalog({ manifest: systemAManifest, name: "Card" });
  const second = buildComponentCatalog({ manifest: systemAManifest, name: "Card" });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

/* -------------------------------------------------------------------------- */
/* Pure catalog rules — V2 fixture                                            */
/* -------------------------------------------------------------------------- */

test("V2 catalog lists exactly the fourteen supported components in canonical order", () => {
  const catalog = buildComponentCatalog({ manifest: v2Manifest });
  assert.equal(catalog.contract, "v2");
  assert.deepEqual(
    catalog.components.map((component) => component.name),
    [...V2_REQUIRED_COMPONENTS],
  );
  assert.equal(catalog.components.length, 14);
  assert.deepEqual(catalog.counts, {
    required: 14,
    optional: 0,
    available: 14,
    unavailable: 0,
  });
  for (const entry of catalog.components) {
    assert.equal(entry.required, true);
    assert.equal(entry.optional, false);
    assert.equal(entry.available, true);
  }
  assert.deepEqual(catalog.requested, null);
});

test("V2 rejects a V4-only optional name as unknown", () => {
  assert.throws(
    () => buildComponentCatalog({ manifest: v2Manifest, name: "Grid" }),
    /Unknown component "Grid"/,
  );
});

/* -------------------------------------------------------------------------- */
/* End-to-end consumer path                                                   */
/* -------------------------------------------------------------------------- */

test("listDesignSystemComponents reads a real V2 consumer end-to-end", (t) => {
  const { root, packageName } = createConsumer(t, { manifest: v2Manifest, withConfig: true });

  const result = listDesignSystemComponents({ cwd: root });

  assert.equal(result.ok, true);
  assert.equal(result.package, packageName);
  assert.equal(result.contract, "v2");
  assert.equal(result.version, "1.1.0");
  assert.equal(result.id, "v2-valid");
  assert.equal(result.showcase.route, "/showcase/v2-valid");
  assert.deepEqual(
    result.components.map((component) => component.name),
    [...V2_REQUIRED_COMPONENTS],
  );

  const requested = listDesignSystemComponents({ cwd: root, name: "Button" });
  assert.equal(requested.requested.available, true);
  assert.deepEqual(requested.requested.variants, [
    "primary",
    "secondary",
    "outline",
    "ghost",
    "destructive",
    "link",
  ]);

  assert.throws(
    () => listDesignSystemComponents({ cwd: root, name: "Grid" }),
    /Unknown component "Grid"/,
  );
});

test("listDesignSystemComponents discovers an unconnected consumer via dependency", (t) => {
  const { root } = createConsumer(t, { manifest: v2Manifest, withConfig: false });
  const result = listDesignSystemComponents({ cwd: root });
  assert.equal(result.package, v2Manifest.package);
  assert.equal(result.version, v2Manifest.version);
});

test("listDesignSystemComponents writes nothing", (t) => {
  const { root } = createConsumer(t, { manifest: v2Manifest, withConfig: true });
  const before = snapshot(root);

  listDesignSystemComponents({ cwd: root, name: "Card" });

  const after = snapshot(root);
  assert.deepEqual([...after.entries()], [...before.entries()]);
});

test("listDesignSystemComponents makes no network access", (t) => {
  const { root } = createConsumer(t, { manifest: v2Manifest, withConfig: true });
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = () => {
    called = true;
    throw new Error("network access attempted");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = listDesignSystemComponents({ cwd: root });
  assert.equal(result.ok, true);
  assert.equal(called, false);
});

test("listDesignSystemComponents requires an explicit consumer root", () => {
  assert.throws(() => listDesignSystemComponents({}), /explicit --cwd/);
});

test("listDesignSystemComponents reads a real installed V4 system end-to-end", (t) => {
  const { root, packageName } = createConsumer(t, { manifest: systemAManifest, withConfig: true });

  const result = listDesignSystemComponents({ cwd: root });

  assert.equal(result.ok, true);
  assert.equal(result.package, packageName);
  assert.equal(result.contract, "v4");
  assert.equal(result.version, systemAManifest.version);
  assert.equal(result.showcase.route, "/showcase/system-a");
  assert.deepEqual(result.available, [
    ...V4_REQUIRED_COMPONENTS,
    "Grid",
    "Fieldset",
    "Alert",
    "Progress",
    "Accordion",
    "Pagination",
    "Table",
  ]);

  const unavailable = listDesignSystemComponents({ cwd: root, name: "Section" });
  assert.equal(unavailable.requested.available, false);
  assert.equal(unavailable.requested.variants, null);
});
