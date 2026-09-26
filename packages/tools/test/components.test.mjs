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
 *      against the real A/B manifests (order, availability subsets, requested
 *      available/unavailable/unknown, metadata, route).
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
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  COMPONENT_NAMES,
  CONTRACT_VERSION,
  OPTIONAL_COMPONENTS,
  REQUIRED_COMPONENTS,
} from "../src/constants.mjs";
import { buildComponentCatalog, listDesignSystemComponents } from "../src/components.mjs";
import { capabilityCategories, currentManifest, readJson, repoRoot } from "./manifest-fixture.mjs";

const systemAManifest = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
);
const systemBManifest = currentManifest(
  readJson(join(repoRoot, "packages", "system-b", "design-system.json")),
);

const MANIFESTS = [systemAManifest, systemBManifest];

/** Optionals a manifest actually declares, in canonical order. */
function declaredOptionals(manifest) {
  return OPTIONAL_COMPONENTS.filter((name) => name in manifest.components);
}

/** Optionals a manifest leaves undeclared (unavailable), in canonical order. */
function undeclaredOptionals(manifest) {
  return OPTIONAL_COMPONENTS.filter((name) => !(name in manifest.components));
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
/* Pure catalog rules                                                         */
/* -------------------------------------------------------------------------- */

test("catalog reports the 29 required plus 17 optional in canonical order", () => {
  for (const manifest of MANIFESTS) {
    const catalog = buildComponentCatalog({ manifest });
    assert.equal(catalog.contractVersion, CONTRACT_VERSION);
    assert.deepEqual(
      catalog.components.map((component) => component.name),
      [...COMPONENT_NAMES],
      `${manifest.id} preserves canonical order`,
    );
    assert.equal(catalog.components.length, 46);
    assert.deepEqual(catalog.counts, {
      required: 29,
      optional: 17,
      available: 29 + declaredOptionals(manifest).length,
      unavailable: undeclaredOptionals(manifest).length,
    });
  }
});

test("required components are always available and marked required", () => {
  for (const manifest of MANIFESTS) {
    const catalog = buildComponentCatalog({ manifest });
    for (const name of REQUIRED_COMPONENTS) {
      const entry = catalog.components.find((component) => component.name === name);
      assert.equal(entry.required, true, `${name} required`);
      assert.equal(entry.optional, false, `${name} not optional`);
      assert.equal(entry.available, true, `${name} available`);
    }
    assert.deepEqual(catalog.available.slice(0, REQUIRED_COMPONENTS.length), [
      ...REQUIRED_COMPONENTS,
    ]);
  }
});

test("availability subsets match the declared optionals of each system", () => {
  for (const manifest of MANIFESTS) {
    const catalog = buildComponentCatalog({ manifest });
    assert.deepEqual(catalog.available, [...REQUIRED_COMPONENTS, ...declaredOptionals(manifest)]);
    assert.deepEqual(catalog.unavailable, undeclaredOptionals(manifest));
  }
});

/* -------------------------------------------------------------------------- */
/* Capability categories and derived availability                             */
/* -------------------------------------------------------------------------- */

test("the catalog exposes the exact category inventory with derived availability", () => {
  for (const manifest of MANIFESTS) {
    const catalog = buildComponentCatalog({ manifest });
    assert.deepEqual(Object.keys(catalog.capabilities.categories), [
      "composition",
      "forms",
      "data-display",
    ]);
    for (const [key, expected] of Object.entries(capabilityCategories())) {
      const category = catalog.capabilities.categories[key];
      assert.deepEqual(category.required, expected.required, `${manifest.id} ${key} required`);
      assert.deepEqual(category.optional, expected.optional, `${manifest.id} ${key} optional`);
      const names = [...expected.required, ...expected.optional];
      assert.deepEqual(
        category.available,
        names.filter((name) => name in manifest.components),
        `${manifest.id} ${key} available`,
      );
      assert.deepEqual(
        category.unavailable,
        names.filter((name) => !(name in manifest.components)),
        `${manifest.id} ${key} unavailable`,
      );
    }
  }
});

test("category availability follows only the declared component map", () => {
  const withGrid = buildComponentCatalog({ manifest: systemAManifest });
  assert.ok(withGrid.capabilities.categories.composition.available.includes("Grid"));
  assert.ok(withGrid.capabilities.categories.composition.unavailable.includes("Section"));

  const withoutGrid = structuredClone(systemAManifest);
  delete withoutGrid.components.Grid;
  const catalog = buildComponentCatalog({ manifest: withoutGrid });
  assert.ok(!catalog.capabilities.categories.composition.available.includes("Grid"));
  assert.ok(catalog.capabilities.categories.composition.unavailable.includes("Grid"));
  assert.ok(!catalog.available.includes("Grid"));
  assert.ok(catalog.unavailable.includes("Grid"));
});

test("systems A and B derive different category availability from one inventory", () => {
  const a = buildComponentCatalog({ manifest: systemAManifest });
  const b = buildComponentCatalog({ manifest: systemBManifest });

  // The same fixed inventory; only the declared component map differs.
  assert.deepEqual(
    a.capabilities.categories.composition.required,
    b.capabilities.categories.composition.required,
  );
  assert.deepEqual(
    a.capabilities.categories.composition.optional,
    b.capabilities.categories.composition.optional,
  );
  assert.deepEqual(a.capabilities.categories.composition.available, [
    "Container",
    "Stack",
    "Center",
    "Cluster",
    "Sidebar",
    "AspectRatio",
    "Grid",
  ]);
  assert.deepEqual(a.capabilities.categories.composition.unavailable, ["Section"]);
  assert.deepEqual(b.capabilities.categories.composition.available, [
    "Container",
    "Stack",
    "Center",
    "Cluster",
    "Sidebar",
    "AspectRatio",
    "Section",
  ]);
  assert.deepEqual(b.capabilities.categories.composition.unavailable, ["Grid"]);

  for (const system of [a, b]) {
    assert.deepEqual(system.capabilities.categories.forms.available, [
      "FormField",
      "Combobox",
      "DatePicker",
      "NumberField",
      "Slider",
      "FileUpload",
    ]);
    assert.deepEqual(system.capabilities.categories.forms.unavailable, []);
  }

  assert.deepEqual(a.capabilities.categories["data-display"].available, [
    "Table",
    "Pagination",
    "Progress",
    "Metric",
    "DescriptionList",
    "Timeline",
    "Meter",
  ]);
  assert.deepEqual(a.capabilities.categories["data-display"].unavailable, ["EmptyState"]);
  assert.deepEqual(b.capabilities.categories["data-display"].available, [
    "Metric",
    "Timeline",
    "EmptyState",
  ]);
  assert.deepEqual(b.capabilities.categories["data-display"].unavailable, [
    "Table",
    "Pagination",
    "Progress",
    "DescriptionList",
    "Meter",
  ]);
});

test("a schema-4 manifest with malformed capabilities is rejected by the pure catalog", () => {
  const missingCategory = structuredClone(systemAManifest);
  delete missingCategory.capabilities.categories.composition;
  assert.throws(
    () => buildComponentCatalog({ manifest: missingCategory }),
    /capabilities\.categories\.composition is required/,
  );

  const separateAvailability = structuredClone(systemAManifest);
  separateAvailability.capabilities.available = ["Button"];
  assert.throws(
    () => buildComponentCatalog({ manifest: separateAvailability }),
    /capabilities\.available is not allowed/,
  );
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

test("an unsupported manifest metadata pair is rejected", () => {
  assert.throws(
    () => buildComponentCatalog({ manifest: { schemaVersion: 3, contractVersion: 4 } }),
    /expected schemaVersion 4 and contractVersion 4/,
  );
  assert.throws(
    () => buildComponentCatalog({ manifest: { schemaVersion: 4, contract: "v4" } }),
    /expected schemaVersion 4 and contractVersion 4/,
  );
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
});

test("catalog output is deterministic", () => {
  const first = buildComponentCatalog({ manifest: systemAManifest, name: "Card" });
  const second = buildComponentCatalog({ manifest: systemAManifest, name: "Card" });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

/* -------------------------------------------------------------------------- */
/* End-to-end consumer path                                                   */
/* -------------------------------------------------------------------------- */

test("listDesignSystemComponents reads an installed system end-to-end", (t) => {
  const { root, packageName } = createConsumer(t, { manifest: systemAManifest, withConfig: true });

  const result = listDesignSystemComponents({ cwd: root });

  assert.equal(result.ok, true);
  assert.equal(result.package, packageName);
  assert.equal(result.contractVersion, CONTRACT_VERSION);
  assert.equal(result.version, systemAManifest.version);
  assert.equal(result.id, "system-a");
  assert.equal(result.showcase.route, "/showcase/system-a");
  assert.deepEqual(result.available, [
    ...REQUIRED_COMPONENTS,
    ...declaredOptionals(systemAManifest),
  ]);

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

  const unavailable = listDesignSystemComponents({ cwd: root, name: "Section" });
  assert.equal(unavailable.requested.available, false);
  assert.equal(unavailable.requested.variants, null);
});

test("listDesignSystemComponents discovers an unconnected consumer via dependency", (t) => {
  const { root } = createConsumer(t, { manifest: systemBManifest, withConfig: false });
  const result = listDesignSystemComponents({ cwd: root });
  assert.equal(result.package, systemBManifest.package);
  assert.equal(result.version, systemBManifest.version);
});

test("listDesignSystemComponents writes nothing", (t) => {
  const { root } = createConsumer(t, { manifest: systemAManifest, withConfig: true });
  const before = snapshot(root);

  listDesignSystemComponents({ cwd: root, name: "Card" });

  const after = snapshot(root);
  assert.deepEqual([...after.entries()], [...before.entries()]);
});

test("listDesignSystemComponents makes no network access", (t) => {
  const { root } = createConsumer(t, { manifest: systemAManifest, withConfig: true });
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
