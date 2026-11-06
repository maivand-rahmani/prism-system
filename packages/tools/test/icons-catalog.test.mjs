#!/usr/bin/env node
/**
 * Offline icon catalog tests.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/icons-catalog.test.mjs
 *
 * Two layers are covered:
 *
 *   1. `buildIconCatalog` — the pure catalog rules, exercised against synthetic
 *      current-contract manifests that declare (or omit) the reserved `./icons`
 *      entrypoint. Availability comes only from `publicApi["./icons"]`.
 *   2. `listDesignSystemIcons` — the end-to-end offline consumer path against a
 *      disposable temp consumer, including "writes nothing" and "no network".
 *
 * No design-system or `@prism-system/ui-core` code is imported or executed; the
 * manifest is synthetic JSON copied behind a public `./manifest` export.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT_VERSION,
  ICON_CATEGORIES,
  ICON_ENTRYPOINT,
  ICON_NAMES,
  iconExportName,
} from "../src/constants.mjs";
import { buildIconCatalog, iconNamesForManifest, listDesignSystemIcons } from "../src/icons.mjs";
import { syntheticManifest } from "./manifest-fixture.mjs";

const ICON_PACKAGE = "@prism-system/ui-icons-fixture";
const NO_ICON_PACKAGE = "@prism-system/ui-no-icons-fixture";

const ICON_REQUIREMENTS = Object.freeze([
  { name: "react", kind: "peer", range: "^18.0.0 || ^19.0.0", optional: false },
  { name: "@prism-system/ui-core", kind: "dependency", range: "^4.0.0", optional: false },
]);

function iconImportPath(packageName) {
  return `${packageName}/icons`;
}

function iconImportStatement(packageName, name) {
  return `import { ${iconExportName(name)} } from "${iconImportPath(packageName)}";`;
}

/** Add a real `./icons` code entrypoint and its declared public exports. */
function withIconCatalog(manifest, { names = ICON_NAMES, requirements = [] } = {}) {
  manifest.entrypoints[ICON_ENTRYPOINT] = {
    requirements: requirements.map((requirement) => ({ ...requirement })),
  };
  manifest.exports[ICON_ENTRYPOINT] = "./dist/icons/index.mjs";
  manifest.publicApi[ICON_ENTRYPOINT] = names.map((name) => iconExportName(name));
  return manifest;
}

function iconManifest({ names = ICON_NAMES, requirements = [] } = {}) {
  return withIconCatalog(
    syntheticManifest({
      id: "icons-fixture",
      version: "2.0.0",
      packageName: ICON_PACKAGE,
    }),
    { names, requirements },
  );
}

function noIconManifest() {
  return syntheticManifest({
    id: "no-icons-fixture",
    version: "1.0.0",
    packageName: NO_ICON_PACKAGE,
  });
}

/* -------------------------------------------------------------------------- */
/* Temp consumer fixture                                                      */
/* -------------------------------------------------------------------------- */

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Create a disposable consumer with the manifest copied behind `./manifest`. */
function createConsumer(t, { manifest }) {
  const root = mkdtempSync(join(tmpdir(), "prism-icons-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    dependencies: { [manifest.package]: manifest.version },
    designSystem: {
      schemaVersion: 1,
      package: manifest.package,
      version: manifest.version,
      strict: true,
    },
  });

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

test("a system that publishes all fifty icons is supported in canonical order", () => {
  // The generator emits publicApi deterministically, but the catalog itself
  // restores canonical order rather than trusting the manifest's array order.
  const declared = [...ICON_NAMES].reverse();
  const catalog = buildIconCatalog({
    manifest: iconManifest({ names: declared, requirements: ICON_REQUIREMENTS }),
  });

  assert.equal(catalog.contractVersion, CONTRACT_VERSION);
  assert.equal(catalog.supported, true);
  assert.equal(catalog.id, "icons-fixture");
  assert.equal(catalog.name, "Fixture icons-fixture");
  assert.equal(catalog.package, ICON_PACKAGE);
  assert.equal(catalog.showcase.route, "/showcase/icons-fixture/icons");
  assert.equal(catalog.entrypoint, ICON_ENTRYPOINT);
  assert.equal(catalog.importPath, iconImportPath(ICON_PACKAGE));
  assert.deepEqual(catalog.counts, { total: 50, available: 50, unavailable: 0 });
  assert.deepEqual(catalog.available, [...ICON_NAMES]);
  assert.deepEqual(catalog.unavailable, []);
  assert.deepEqual(
    catalog.icons.map((icon) => icon.name),
    [...ICON_NAMES],
  );
  assert.equal(catalog.requested, null);

  const first = catalog.icons[0];
  assert.equal(first.name, "ArrowLeft");
  assert.equal(first.exportName, "ArrowLeftIcon");
  assert.equal(first.category, "navigation");
  assert.equal(first.available, true);
  assert.equal(first.entrypoint, ICON_ENTRYPOINT);
  assert.equal(first.importPath, iconImportPath(ICON_PACKAGE));
  assert.equal(first.importStatement, iconImportStatement(ICON_PACKAGE, "ArrowLeft"));
  assert.deepEqual(first.requirements, ICON_REQUIREMENTS);

  const last = catalog.icons.at(-1);
  assert.equal(last.name, "LogOut");
  assert.equal(last.exportName, "LogOutIcon");
  assert.equal(last.category, "interface");
  assert.equal(last.importStatement, iconImportStatement(ICON_PACKAGE, "LogOut"));

  assert.deepEqual(Object.keys(catalog.categories), [
    "navigation",
    "actions",
    "files",
    "feedback",
    "interface",
  ]);
  for (const [category, names] of Object.entries(ICON_CATEGORIES)) {
    assert.deepEqual(catalog.categories[category], {
      names: [...names],
      available: [...names],
      unavailable: [],
    });
  }

  const second = buildIconCatalog({
    manifest: iconManifest({ names: declared, requirements: ICON_REQUIREMENTS }),
  });
  assert.deepEqual(second.icons[0], first);
  assert.equal(JSON.stringify(catalog), JSON.stringify(second), "the catalog is deterministic");
});

test("a partial catalog marks only the declared icons available", () => {
  const declared = ["Search", "Check", "Plus"];
  const catalog = buildIconCatalog({ manifest: iconManifest({ names: declared }) });

  assert.equal(catalog.supported, true);
  assert.deepEqual(catalog.counts, { total: 50, available: 3, unavailable: 47 });
  // Canonical order, not the manifest's declaration order.
  assert.deepEqual(catalog.available, ["Plus", "Check", "Search"]);
  assert.deepEqual(
    catalog.unavailable,
    ICON_NAMES.filter((name) => !declared.includes(name)),
  );
  assert.equal(catalog.unavailable.length, 47);

  for (const icon of catalog.icons) {
    const expected = declared.includes(icon.name);
    assert.equal(icon.available, expected, icon.name);
    assert.equal(icon.entrypoint, ICON_ENTRYPOINT, icon.name);
    assert.equal(icon.importPath, iconImportPath(ICON_PACKAGE), icon.name);
    assert.equal(
      icon.importStatement,
      expected ? iconImportStatement(ICON_PACKAGE, icon.name) : null,
      icon.name,
    );
  }

  const requested = buildIconCatalog({
    manifest: iconManifest({ names: declared }),
    name: "search",
  });
  assert.equal(requested.requested.name, "Search");
  assert.equal(requested.requested.available, true);
  assert.equal(requested.requested.reason, null);
  assert.equal(requested.requested.exportName, "SearchIcon");
  assert.equal(requested.requested.importStatement, iconImportStatement(ICON_PACKAGE, "Search"));

  const byExportName = buildIconCatalog({
    manifest: iconManifest({ names: declared }),
    name: "PlusIcon",
  });
  assert.equal(byExportName.requested.name, "Plus");
  assert.equal(byExportName.requested.available, true);
});

test("a known but undeclared icon is unavailable, never importable", () => {
  const catalog = buildIconCatalog({
    manifest: iconManifest({ names: ["Plus", "Check", "Search"] }),
    name: "Menu",
  });

  assert.equal(catalog.supported, true);
  assert.equal(catalog.requested.name, "Menu");
  assert.equal(catalog.requested.available, false);
  assert.equal(catalog.requested.reason, "not-declared");
  assert.equal(catalog.requested.entrypoint, ICON_ENTRYPOINT);
  assert.equal(catalog.requested.importPath, iconImportPath(ICON_PACKAGE));
  assert.equal(catalog.requested.importStatement, null);
  assert.ok(catalog.unavailable.includes("Menu"));
});

test("a system without a ./icons entrypoint has no available icons", () => {
  const catalog = buildIconCatalog({ manifest: noIconManifest(), name: "Search" });

  assert.equal(catalog.supported, false);
  assert.equal(catalog.entrypoint, null);
  assert.equal(catalog.importPath, null);
  assert.deepEqual(catalog.counts, { total: 50, available: 0, unavailable: 50 });
  assert.deepEqual(catalog.available, []);
  assert.deepEqual(catalog.unavailable, [...ICON_NAMES]);
  assert.equal(catalog.icons.length, 50);
  for (const icon of catalog.icons) {
    assert.equal(icon.available, false, icon.name);
    assert.equal(icon.entrypoint, null, icon.name);
    assert.equal(icon.importPath, null, icon.name);
    assert.equal(icon.importStatement, null, icon.name);
    assert.deepEqual(icon.requirements, [], icon.name);
  }
  for (const category of Object.values(catalog.categories)) {
    assert.deepEqual(category.available, []);
    assert.deepEqual(category.unavailable, category.names);
  }

  assert.equal(catalog.requested.name, "Search");
  assert.equal(catalog.requested.available, false);
  assert.equal(catalog.requested.reason, "no-icon-catalog");
  assert.equal(catalog.requested.entrypoint, null);
  assert.equal(catalog.requested.importPath, null);
  assert.equal(catalog.requested.importStatement, null);
});

test("an unknown or empty icon name fails closed with the known set", () => {
  assert.throws(
    () => buildIconCatalog({ manifest: iconManifest(), name: "Nope" }),
    /Unknown icon "Nope"; known icons are: ArrowLeft \(ArrowLeftIcon\), ArrowRight \(ArrowRightIcon\)/,
  );
  assert.throws(
    () => buildIconCatalog({ manifest: iconManifest(), name: "" }),
    /icon name is required/,
  );
});

test("malformed icon public APIs fail closed", () => {
  const nonCanonical = iconManifest();
  nonCanonical.publicApi[ICON_ENTRYPOINT] = ["Search"];
  assert.throws(
    () => buildIconCatalog({ manifest: nonCanonical }),
    /must contain only canonical "Icon"-suffixed icon exports; invalid: Search\./,
  );

  const empty = iconManifest();
  empty.publicApi[ICON_ENTRYPOINT] = [];
  assert.throws(() => buildIconCatalog({ manifest: empty }), /must publish at least one icon/);

  const missingApi = iconManifest();
  delete missingApi.publicApi[ICON_ENTRYPOINT];
  assert.throws(
    () => buildIconCatalog({ manifest: missingApi }),
    /publicApi\["\.\/icons"\] is required for the icon entrypoint/,
  );

  const misplaced = iconManifest({ names: ["Search"] });
  misplaced.publicApi["."] = ["Button", "SearchIcon"];
  assert.throws(
    () => buildIconCatalog({ manifest: misplaced }),
    /every icon export must come from the single reserved "\.\/icons" entrypoint/,
  );
});

test("iconNamesForManifest derives only declared canonical names in canonical order", () => {
  assert.deepEqual(iconNamesForManifest(iconManifest({ names: ["Search", "ArrowLeft", "Plus"] })), [
    "ArrowLeft",
    "Plus",
    "Search",
  ]);
  assert.deepEqual(iconNamesForManifest(noIconManifest()), []);
});

test("unsupported manifest metadata fails closed", () => {
  assert.throws(
    () => buildIconCatalog({ manifest: { schemaVersion: 4, contractVersion: 4 } }),
    /expected schemaVersion 5 and contractVersion 4/,
  );
  assert.throws(() => buildIconCatalog({ manifest: null }), /manifest object is required/);
});

/* -------------------------------------------------------------------------- */
/* End-to-end consumer path                                                   */
/* -------------------------------------------------------------------------- */

test("listDesignSystemIcons reads an installed system end-to-end", (t) => {
  const manifest = iconManifest({ names: ["Search", "ArrowLeft", "Plus"] });
  const { root, packageName } = createConsumer(t, { manifest });

  const result = listDesignSystemIcons({ cwd: root, name: "Search" });

  assert.equal(result.ok, true);
  assert.equal(result.package, packageName);
  assert.equal(result.version, manifest.version);
  assert.equal(result.contractVersion, CONTRACT_VERSION);
  assert.equal(result.supported, true);
  assert.equal(result.showcase.route, "/showcase/icons-fixture/icons");
  assert.deepEqual(result.counts, { total: 50, available: 3, unavailable: 47 });
  assert.deepEqual(result.available, ["ArrowLeft", "Plus", "Search"]);
  assert.equal(result.requested.name, "Search");
  assert.equal(result.requested.available, true);
  assert.equal(result.requested.importStatement, iconImportStatement(packageName, "Search"));
});

test("listDesignSystemIcons writes nothing and makes no network access", (t) => {
  const manifest = iconManifest({ names: ["Search", "Plus", "Check"] });
  const { root } = createConsumer(t, { manifest });
  const before = snapshot(root);

  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = () => {
    called = true;
    throw new Error("network access attempted");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  try {
    const result = listDesignSystemIcons({ cwd: root });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(called, false);
  assert.deepEqual([...snapshot(root).entries()], [...before.entries()]);
});

test("listDesignSystemIcons reports an installed system without icons", (t) => {
  const manifest = noIconManifest();
  const { root } = createConsumer(t, { manifest });

  const result = listDesignSystemIcons({ cwd: root, name: "Search" });

  assert.equal(result.ok, true);
  assert.equal(result.supported, false);
  assert.deepEqual(result.counts, { total: 50, available: 0, unavailable: 50 });
  assert.equal(result.importPath, null);
  assert.equal(result.requested.reason, "no-icon-catalog");
});

test("listDesignSystemIcons requires an explicit consumer root", () => {
  assert.throws(() => listDesignSystemIcons({}), /explicit --cwd/);
});
