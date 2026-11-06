#!/usr/bin/env node
/**
 * Regression guard for the Dialog + Select nested-layer bug (DS-8).
 *
 * `@radix-ui/react-dismissable-layer` owns the document-level Escape listener,
 * the DismissableLayer layer stack, and the body pointer-events snapshot.
 * Those are module-scoped. If Dialog and Select load different physical copies,
 * one Escape closes the outer layer, the inner layer stays logically open, and
 * the inner cleanup can restore body pointer-events to "none".
 *
 * Same version is not enough: npm can install two copies of the same version
 * at different paths. The guard therefore compares *real resolved module
 * paths* for every direct Radix layer consumer in core. This checks the
 * repository's installed dependency tree, not an arbitrary consumer graph.
 *
 * Run after `pnpm install`:
 *   node --test packages/core/src/primitives/layer-identity.runtime.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const coreRoot = fileURLToPath(new URL("../../", import.meta.url));
const LAYER_PACKAGE = "@radix-ui/react-dismissable-layer";
const RADIX_PACKAGES = ["react-dialog", "react-select", "react-dropdown-menu", "react-tooltip"];

// Coordinated 2026-10-12 Radix release. Bump all four together and update this
// guard in the same change; mixing generations reintroduces the DS-8 bug.
const COORDINATED_RADIX_VERSIONS = {
  "@radix-ui/react-dialog": "1.3.1",
  "@radix-ui/react-select": "2.4.1",
  "@radix-ui/react-dropdown-menu": "2.2.1",
  "@radix-ui/react-tooltip": "1.4.1",
};
const COORDINATED_LAYER_VERSION = "1.2.1";

function findPackageManifest(entry, expectedName) {
  let directory = dirname(entry);
  while (directory !== dirname(directory)) {
    try {
      const manifestPath = join(directory, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.name === expectedName) {
        return { manifestPath, manifest };
      }
    } catch {
      // Keep walking up until the package manifest is found.
    }
    directory = dirname(directory);
  }
  throw new Error(`Could not locate ${expectedName} manifest from ${entry}`);
}

function resolveLayer(packageName) {
  const requireFromCore = createRequire(join(coreRoot, "package.json"));
  const packageEntry = realpathSync(requireFromCore.resolve(`@radix-ui/${packageName}`));
  const packageManifest = findPackageManifest(packageEntry, `@radix-ui/${packageName}`);
  const requireFromPackage = createRequire(packageManifest.manifestPath);

  // DropdownMenu itself does not depend on DismissableLayer. It renders
  // @radix-ui/react-menu, which owns the actual layer dependency. Resolve that
  // real menu instance first, then resolve the layer from it; resolving from
  // DropdownMenu directly could pick up a hoisted layer it never imports.
  let layerOwnerName = packageName;
  let requireFromLayerOwner = requireFromPackage;
  let ownerEntry = null;

  if (packageName === "react-dropdown-menu") {
    const menuEntry = realpathSync(requireFromPackage.resolve("@radix-ui/react-menu"));
    const menuManifest = findPackageManifest(menuEntry, "@radix-ui/react-menu");
    layerOwnerName = "@radix-ui/react-menu";
    ownerEntry = menuEntry;
    requireFromLayerOwner = createRequire(menuManifest.manifestPath);
  }

  const entry = realpathSync(requireFromLayerOwner.resolve(LAYER_PACKAGE));
  const layerManifest = findPackageManifest(entry, LAYER_PACKAGE);

  return {
    entry,
    version: layerManifest.manifest.version,
    layerOwner: layerOwnerName,
    ownerEntry,
  };
}

function formatResolutions(resolutions) {
  return Object.entries(resolutions)
    .map(([packageName, resolution]) => {
      const owner = resolution.ownerEntry ? ` via ${resolution.ownerEntry}` : "";
      return `${packageName} [${resolution.layerOwner}]${owner} -> ${resolution.entry}`;
    })
    .join("\n");
}

test("Dialog, Select, DropdownMenu and Tooltip resolve one physical DismissableLayer", () => {
  const resolutions = Object.fromEntries(
    RADIX_PACKAGES.map((packageName) => [packageName, resolveLayer(packageName)]),
  );
  const entries = new Set(Object.values(resolutions).map((resolution) => resolution.entry));

  assert.equal(
    entries.size,
    1,
    `Expected one physical ${LAYER_PACKAGE} instance.\nResolved entries:\n${formatResolutions(
      resolutions,
    )}`,
  );
});

test("DropdownMenu resolves its layer through the real @radix-ui/react-menu", () => {
  const dropdown = resolveLayer("react-dropdown-menu");

  assert.equal(
    dropdown.layerOwner,
    "@radix-ui/react-menu",
    `Expected DropdownMenu to resolve through @radix-ui/react-menu; got ${JSON.stringify(dropdown, null, 2)}`,
  );
  assert.match(
    dropdown.ownerEntry ?? "",
    /react-menu[\\/]/,
    `Expected a real @radix-ui/react-menu path; got ${dropdown.ownerEntry ?? "<null>"}`,
  );
});

test("the shared DismissableLayer is the coordinated 1.2.1 generation", () => {
  const resolutions = RADIX_PACKAGES.map((packageName) => resolveLayer(packageName));
  const versions = new Set(resolutions.map((resolution) => resolution.version));

  assert.equal(
    versions.size,
    1,
    `Expected one ${LAYER_PACKAGE} version; got ${[...versions].join(", ")}`,
  );
  assert.equal(
    resolutions[0].version,
    COORDINATED_LAYER_VERSION,
    "Bump all Radix layer consumers together before changing this expectation",
  );
});

test("core pins the coordinated Radix release", () => {
  const corePackage = JSON.parse(readFileSync(join(coreRoot, "package.json"), "utf8"));

  for (const [packageName, expectedVersion] of Object.entries(COORDINATED_RADIX_VERSIONS)) {
    assert.equal(
      corePackage.dependencies?.[packageName],
      expectedVersion,
      `${packageName} must stay on the coordinated Radix release`,
    );
  }
});
