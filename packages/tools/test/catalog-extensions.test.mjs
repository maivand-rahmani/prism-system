/**
 * Focused tests for the schema-5 entrypoints/extensions/effects contract and
 * the unified component catalog.
 *
 * Everything here is synthetic and offline: manifests are built from
 * `syntheticManifest()` and never read the checked-in generated artifacts, so
 * these tests are independent of the generator lane's migration.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { CONTRACT_VERSION, MANIFEST_SCHEMA_VERSION } from "../src/constants.mjs";
import { buildComponentCatalog } from "../src/components.mjs";
import { collectManifestFailures, detectManifestContract } from "../src/manifest.mjs";
import { buildInfoResult } from "../src/registry.mjs";
import { addSyntheticExtension, syntheticManifest } from "./manifest-fixture.mjs";

const SCENE_REQUIREMENTS = [
  { name: "three", kind: "peer", range: "^0.186.0", optional: true },
  { name: "@react-three/fiber", kind: "peer", range: "^8.18.0", optional: true },
];
const SCENE_EFFECTS = {
  features: ["depth", "3d"],
  rendering: "webgl",
  reducedMotion: true,
  fallback: "static",
};

function sceneManifest() {
  const manifest = syntheticManifest({ id: "scene", version: "2.0.0" });
  addSyntheticExtension(manifest, {
    requirements: SCENE_REQUIREMENTS.map((requirement) => ({ ...requirement })),
    effects: { ...SCENE_EFFECTS, features: [...SCENE_EFFECTS.features] },
  });
  return manifest;
}

/* -------------------------------------------------------------------------- */
/* Strict current-shape dispatch                                              */
/* -------------------------------------------------------------------------- */

test("only schemaVersion 5 with contractVersion 4 is dispatched", () => {
  const manifest = syntheticManifest();
  assert.equal(manifest.schemaVersion, MANIFEST_SCHEMA_VERSION);
  assert.equal(detectManifestContract(manifest), CONTRACT_VERSION);
  assert.deepEqual(collectManifestFailures(manifest), []);
  for (const stale of [
    { schemaVersion: 4, contractVersion: 4 },
    { schemaVersion: 5, contractVersion: 3 },
    { schemaVersion: 4, contractVersion: "4" },
  ]) {
    const failures = collectManifestFailures(stale);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /expected \(schemaVersion 5, contractVersion 4\)/);
  }
});

test("a missing or malformed entrypoints map fails closed", () => {
  const missing = syntheticManifest();
  delete missing.entrypoints;
  assert.ok(collectManifestFailures(missing).includes("entrypoints is required."));

  const noDefaults = syntheticManifest();
  noDefaults.entrypoints = { "./scene": { requirements: [] } };
  delete noDefaults.exports["./scene"];
  const failures = collectManifestFailures(noDefaults);
  assert.ok(failures.includes('entrypoints["."] is required.'), failures.join(" "));
  assert.ok(failures.includes('entrypoints["./tokens"] is required.'), failures.join(" "));
});

test("CSS, JSON, and manifest exports are never entrypoints", () => {
  for (const key of ["./styles.css", "./tailwind.css", "./manifest", "./package.json"]) {
    const manifest = syntheticManifest();
    manifest.entrypoints[key] = { requirements: [] };
    manifest.exports[key] = "./dist/x";
    manifest.publicApi[key] = [];
    const failures = collectManifestFailures(manifest);
    assert.ok(
      failures.some((failure) => failure.includes(`entrypoints[${JSON.stringify(key)}]`)),
      `${key} must be rejected: ${failures.join(" ")}`,
    );
  }
});

test("entrypoint requirements are exact and validated", () => {
  const manifest = syntheticManifest();
  manifest.entrypoints["."] = {
    requirements: [{ name: "react", kind: "peer", range: "^18.0.0 || ^19.0.0", optional: false }],
  };
  manifest.exports["."] = "./dist/index.mjs";
  manifest.publicApi["."] = [];
  assert.deepEqual(collectManifestFailures(manifest), []);

  const bad = syntheticManifest();
  bad.entrypoints["."] = {
    requirements: [{ name: "react; rm", kind: "runtime", range: "", optional: "yes" }],
  };
  const failures = collectManifestFailures(bad);
  assert.ok(
    failures.some((failure) => failure.includes(".requirements[0].name must be a valid package")),
    failures.join(" "),
  );
  assert.ok(failures.some((failure) => failure.includes(".requirements[0].kind must be one of")));
  assert.ok(
    failures.some((failure) => failure.includes(".requirements[0].range must be a non-empty")),
  );
  assert.ok(
    failures.some((failure) => failure.includes(".requirements[0].optional must be a boolean")),
  );

  // The range is copied verbatim from package.json (schema/generator parity):
  // workspace and other real range forms are valid data. Semver evaluation of a
  // peer range fails closed at use time instead (see the entry-scan tests).
  const workspaceRange = syntheticManifest();
  workspaceRange.entrypoints["."] = {
    requirements: [
      { name: "@prism-system/ui-core", kind: "dependency", range: "workspace:*", optional: false },
    ],
  };
  workspaceRange.exports["."] = "./dist/index.mjs";
  workspaceRange.publicApi["."] = [];
  assert.deepEqual(collectManifestFailures(workspaceRange), []);

  const duplicate = syntheticManifest();
  duplicate.entrypoints["."] = {
    requirements: [
      { name: "react", kind: "peer", range: "^18.0.0", optional: false },
      { name: "react", kind: "peer", range: "^19.0.0", optional: true },
    ],
  };
  assert.ok(
    collectManifestFailures(duplicate).some((failure) =>
      failure.includes('declares duplicate requirement "react"'),
    ),
  );
});

test("every entrypoint must be an export and a publicApi key", () => {
  const manifest = sceneManifest();
  delete manifest.exports["./keyboard-scene"];
  assert.ok(
    collectManifestFailures(manifest).includes(
      'exports["./keyboard-scene"] is required for the declared entrypoint.',
    ),
  );

  const noApi = sceneManifest();
  delete noApi.publicApi["./keyboard-scene"];
  assert.ok(
    collectManifestFailures(noApi).includes(
      'publicApi["./keyboard-scene"] is required for the declared entrypoint.',
    ),
  );

  const extra = sceneManifest();
  extra.publicApi["./unknown"] = [];
  assert.ok(
    collectManifestFailures(extra).includes('publicApi["./unknown"] is not a declared entrypoint.'),
  );
});

test("every public code export must declare an entrypoint (generator parity)", () => {
  const manifest = sceneManifest();
  assert.deepEqual(collectManifestFailures(manifest), []);

  // An additional code export omitted from entrypoints fails closed.
  manifest.exports["./custom/motion"] = "./dist/custom/motion.mjs";
  const failures = collectManifestFailures(manifest);
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes('exports["./custom/motion"]') &&
        failure.includes('declare it in "entrypoints"'),
    ),
    failures.join(" "),
  );

  // Known asset exports stay legal without an entrypoint.
  const neutral = syntheticManifest();
  neutral.exports["./fonts.css"] = "./dist/fonts.css";
  neutral.exports["./theme.json"] = "./dist/theme.json";
  assert.deepEqual(collectManifestFailures(neutral), []);

  // Conditional objects are code exports and must be declared.
  neutral.exports["./widgets"] = { import: "./dist/widgets.mjs" };
  assert.ok(
    collectManifestFailures(neutral).some((failure) => failure.includes('exports["./widgets"]')),
  );

  // Unknown target shapes cannot be proven to be assets and fail closed.
  neutral.exports["./broken"] = null;
  assert.ok(
    collectManifestFailures(neutral).some(
      (failure) =>
        failure.includes('exports["./broken"]') &&
        failure.includes("string or conditional export target object"),
    ),
  );

  // A declared entrypoint resolving to an asset fails closed.
  const assetEntry = syntheticManifest();
  assetEntry.entrypoints["./theme"] = { requirements: [] };
  assetEntry.exports["./theme"] = "./dist/theme.css";
  assetEntry.publicApi["./theme"] = [];
  assert.ok(
    collectManifestFailures(assetEntry).some(
      (failure) =>
        failure.includes('exports["./theme"]') &&
        failure.includes("only code entrypoints can be declared"),
    ),
  );
});

/* -------------------------------------------------------------------------- */
/* Extensions                                                                 */
/* -------------------------------------------------------------------------- */

test("declared extensions are non-empty, PascalCase, and collision-free", () => {
  const empty = syntheticManifest();
  empty.extensions = {};
  assert.ok(collectManifestFailures(empty).includes("extensions must be non-empty when declared."));

  const lowercase = sceneManifest();
  lowercase.extensions.keyboardScene = lowercase.extensions.KeyboardScene;
  delete lowercase.extensions.KeyboardScene;
  assert.ok(
    collectManifestFailures(lowercase).some((failure) =>
      failure.includes("must be a PascalCase named export"),
    ),
  );

  const collision = sceneManifest();
  collision.extensions.Button = { ...collision.extensions.KeyboardScene };
  assert.ok(
    collectManifestFailures(collision).some((failure) =>
      failure.includes("collides with the canonical component contract"),
    ),
  );
});

test("extension linkage and metadata fail closed", () => {
  const undeclared = sceneManifest();
  undeclared.extensions.KeyboardScene.entrypoint = "./missing";
  assert.ok(
    collectManifestFailures(undeclared).some((failure) =>
      failure.includes('entrypoint "./missing" is not a declared entrypoint'),
    ),
  );

  const tokens = sceneManifest();
  tokens.entrypoints["./tokens"].requirements = [];
  tokens.extensions.KeyboardScene.entrypoint = "./tokens";
  assert.ok(
    collectManifestFailures(tokens).some((failure) =>
      failure.includes('must be a code entrypoint other than "./tokens"'),
    ),
  );

  const noExportName = sceneManifest();
  noExportName.publicApi["./keyboard-scene"] = [];
  assert.ok(
    collectManifestFailures(noExportName).some((failure) =>
      failure.includes('must include the extension export "KeyboardScene"'),
    ),
  );

  const badMeta = sceneManifest();
  badMeta.extensions.KeyboardScene.apiVersion = 0;
  badMeta.extensions.KeyboardScene.docs = "";
  const failures = collectManifestFailures(badMeta);
  assert.ok(failures.some((failure) => failure.includes("apiVersion must be a positive integer")));
  assert.ok(failures.some((failure) => failure.includes("docs must be a non-empty string")));
});

test("effects are closed and never inferred", () => {
  const manifest = sceneManifest();
  manifest.components.Button.effects = {
    features: ["motion"],
    rendering: "dom",
    reducedMotion: true,
  };
  assert.deepEqual(collectManifestFailures(manifest), []);

  const invalid = sceneManifest();
  invalid.extensions.KeyboardScene.effects = {
    features: ["depth", "hologram"],
    rendering: "canvas",
    reducedMotion: "yes",
    fallback: "static",
  };
  const failures = collectManifestFailures(invalid);
  assert.ok(
    failures.some((failure) => failure.includes('features contains unknown value "hologram"')),
  );
  assert.ok(
    failures.some((failure) => failure.includes("rendering must be one of dom, webgl, mixed")),
  );
  assert.ok(failures.some((failure) => failure.includes("reducedMotion must be a boolean")));

  const domFallback = sceneManifest();
  domFallback.components.Button.effects = {
    features: ["motion"],
    rendering: "dom",
    reducedMotion: true,
    fallback: "none",
  };
  assert.ok(
    collectManifestFailures(domFallback).some((failure) =>
      failure.includes('fallback is only meaningful for "webgl" or "mixed" rendering'),
    ),
  );
});

test("a 3d feature is never DOM-only (parity with the generator/schema)", () => {
  const domScene = sceneManifest();
  domScene.extensions.KeyboardScene.effects = {
    features: ["depth", "3d"],
    rendering: "dom",
    reducedMotion: true,
  };
  const failures = collectManifestFailures(domScene);
  assert.ok(
    failures.some((failure) =>
      failure.includes(
        'features declares "3d" with "dom" rendering; a real 3D scene must declare "webgl" or "mixed"',
      ),
    ),
    failures.join(" "),
  );

  for (const rendering of ["webgl", "mixed"]) {
    const manifest = sceneManifest();
    manifest.components.Button.effects = {
      features: ["3d"],
      rendering,
      reducedMotion: true,
      ...(rendering === "mixed" ? { fallback: "static" } : {}),
    };
    assert.deepEqual(
      collectManifestFailures(manifest),
      [],
      `3d with ${rendering} rendering is accepted`,
    );
  }
});

test("nested lower-kebab entrypoints are accepted and exposed with their full import path", () => {
  const manifest = syntheticManifest({ id: "custom", version: "1.0.0" });
  addSyntheticExtension(manifest, {
    name: "Reveal",
    entrypoint: "./custom/reveal",
    target: "./dist/custom/reveal/index.mjs",
    requirements: [{ name: "three", kind: "peer", range: "^0.186.0", optional: true }],
    effects: { features: ["depth", "motion"], rendering: "dom", reducedMotion: true },
  });
  assert.deepEqual(collectManifestFailures(manifest), []);

  const catalog = buildComponentCatalog({ manifest, name: "Reveal" });
  assert.equal(catalog.extensions[0].entrypoint, "./custom/reveal");
  assert.equal(catalog.extensions[0].importPath, `${manifest.package}/custom/reveal`);
  assert.equal(catalog.requested.name, "Reveal");
  assert.deepEqual(
    buildInfoResult({
      package: manifest.package,
      version: manifest.version,
      manifest,
    }).availableExtensions,
    ["Reveal"],
  );

  for (const key of ["./Custom/reveal", "./custom/reveal_v2", "./custom/reveal.css"]) {
    const invalid = syntheticManifest({ id: "custom", version: "1.0.0" });
    invalid.entrypoints[key] = { requirements: [] };
    invalid.exports[key] = "./dist/x.mjs";
    invalid.publicApi[key] = [];
    const failures = collectManifestFailures(invalid);
    assert.ok(
      failures.some(
        (failure) =>
          failure.includes(`entrypoints[${JSON.stringify(key)}]`) ||
          failure.includes(`exports[${JSON.stringify(key)}]`),
      ),
      `${key} must be rejected: ${failures.join(" ")}`,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Unified catalog and name lookup                                            */
/* -------------------------------------------------------------------------- */

test("the unified catalog exposes extensions with entrypoint, importPath, effects, requirements, and apiVersion", () => {
  const manifest = sceneManifest();
  const catalog = buildComponentCatalog({ manifest });

  assert.equal(catalog.counts.extensions, 1);
  const componentNames = catalog.components.map((component) => component.name);
  assert.equal(componentNames.length, 46);
  assert.deepEqual(componentNames.slice(0, 3), ["Button", "Input", "Textarea"]);
  assert.ok(componentNames.includes("FileUpload"));
  assert.equal(catalog.available.length, 29);
  assert.equal(catalog.extensions.length, 1);
  const [extension] = catalog.extensions;
  assert.equal(extension.kind, "extension");
  assert.equal(extension.name, "KeyboardScene");
  assert.equal(extension.apiVersion, 1);
  assert.equal(extension.entrypoint, "./keyboard-scene");
  assert.equal(extension.importPath, `${manifest.package}/keyboard-scene`);
  assert.deepEqual(extension.effects, SCENE_EFFECTS);
  assert.deepEqual(
    extension.requirements,
    SCENE_REQUIREMENTS.map((requirement) => ({ ...requirement })),
  );
  assert.equal(extension.available, true);

  const buttons = catalog.components.find((component) => component.name === "Button");
  assert.equal(buttons.effects, null, "missing effects are never inferred");
});

test("canonical catalog entries expose the declared root entrypoint metadata", () => {
  const manifest = sceneManifest();
  manifest.entrypoints["."] = {
    requirements: [{ name: "react", kind: "peer", range: "^18.0.0", optional: true }],
  };
  const catalog = buildComponentCatalog({ manifest });

  assert.equal(catalog.components.length, 46);
  for (const component of catalog.components) {
    assert.equal(component.entrypoint, ".");
    assert.equal(component.importPath, manifest.package);
    assert.deepEqual(component.requirements, [
      { name: "react", kind: "peer", range: "^18.0.0", optional: true },
    ]);
    assert.equal(component.effects, null, "absent canonical effects are never inferred");
  }
  assert.equal(catalog.components[0].available, true);
  assert.equal(catalog.components.find((entry) => entry.name === "Grid").available, false);

  // Requirements are fresh per entry, not shared mutable references.
  catalog.components[0].requirements[0].range = "^19.0.0";
  assert.equal(catalog.components[1].requirements[0].range, "^18.0.0");

  // Extension entries keep their own entrypoint metadata.
  assert.equal(catalog.extensions[0].entrypoint, "./keyboard-scene");
  assert.equal(catalog.extensions[0].importPath, `${manifest.package}/keyboard-scene`);

  assert.deepEqual(
    buildInfoResult({ package: manifest.package, version: manifest.version, manifest }).entrypoints[
      "."
    ],
    manifest.entrypoints["."],
  );
});

test("extension names resolve through the same name lookup as components", () => {
  const manifest = sceneManifest();
  const requested = buildComponentCatalog({ manifest, name: "KeyboardScene" }).requested;
  assert.equal(requested.kind, "extension");
  assert.equal(requested.name, "KeyboardScene");

  const component = buildComponentCatalog({ manifest, name: "Button" }).requested;
  assert.equal(component.name, "Button");
  assert.equal(component.effects, null);

  assert.throws(
    () => buildComponentCatalog({ manifest, name: "Nope" }),
    /known components are: Button, Input.*, KeyboardScene\./,
  );
});

test("a system with no extensions reports an empty extension catalog", () => {
  const catalog = buildComponentCatalog({ manifest: syntheticManifest() });
  assert.equal(catalog.counts.extensions, 0);
  assert.deepEqual(catalog.extensions, []);
});

/* -------------------------------------------------------------------------- */
/* info                                                                       */
/* -------------------------------------------------------------------------- */

test("info carries the declared entrypoints and verified extensions", () => {
  const manifest = sceneManifest();
  const result = buildInfoResult({
    package: manifest.package,
    version: manifest.version,
    manifest,
  });

  assert.equal(result.package, manifest.package);
  assert.deepEqual(result.availableExtensions, ["KeyboardScene"]);
  assert.deepEqual(
    result.extensions[0].requirements,
    manifest.entrypoints["./keyboard-scene"].requirements,
  );
  assert.equal(result.extensions[0].importPath, `${manifest.package}/keyboard-scene`);
  assert.deepEqual(result.entrypoints, manifest.entrypoints);
  assert.equal(result.manifest, manifest);
});
