#!/usr/bin/env node
/**
 * Maintainer registry tests (Node built-in test runner, no dependency).
 *
 * Run directly:
 *   node --test scripts/register-design-system.test.mjs
 *
 * These cover the registry contract schema (the numeric `contractVersion: 4` is
 * the only accepted contract), that registration never relabels or downgrades a
 * package, and that version synchronization targets the canonical runtime
 * source file.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as manifestTooling from "./design-system-manifest.mjs";
import {
  CONTRACT_VERSION,
  buildEntry,
  normalizeManifest,
  readSourceContractVersion,
  registerDesignSystem,
} from "./register-design-system.mjs";
import { EXTENSION_LOADERS_FILENAME } from "./sync-design-system-apps.mjs";
import { RUNTIME_TARGET } from "./sync-design-system-versions.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "schemas", "fixtures");
const fixturePath = (...segments) => join(fixturesRoot, ...segments);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const ENTRY_BASE = Object.freeze({
  id: "pulse",
  name: "Pulse",
  packageName: "@prism-system/ui-pulse",
  packagePath: "packages/pulse",
  version: "0.1.0",
  uiClass: "maivand-pulse-ui",
  tokensExport: "pulseTokens",
  contractVersion: 4,
});

test("the registry schema accepts only the numeric contractVersion 4", () => {
  assert.equal(CONTRACT_VERSION, 4);
  assert.equal(buildEntry({ ...ENTRY_BASE }).contractVersion, 4);
  assert.throws(
    () => buildEntry({ ...ENTRY_BASE, contractVersion: 2 }),
    /must declare the numeric contractVersion: 4/,
  );
  assert.throws(
    () => buildEntry({ ...ENTRY_BASE, contractVersion: undefined }),
    /must declare the numeric contractVersion: 4/,
  );
});

test("normalizeManifest keeps the current entry shape", () => {
  const manifest = normalizeManifest({
    version: 3,
    designSystems: [{ ...ENTRY_BASE }],
  });
  assert.equal(manifest.version, 3);
  assert.equal(manifest.designSystems[0].contractVersion, 4);
  assert.throws(
    () => normalizeManifest({ version: 2, designSystems: [{ ...ENTRY_BASE }] }),
    /"version" must be 3/,
  );
});

test("runtime synchronization targets src/design-system.ts", () => {
  assert.equal(RUNTIME_TARGET, "src/design-system.ts");
});

function makePackage(root, { id, source, tokens }) {
  const dir = join(root, "packages", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: `@prism-system/ui-${id}`,
        version: "0.1.0",
        prismSystem: {
          name: id,
          uiClass: `maivand-${id}-ui`,
          tokensExport: `${id}Tokens`,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  // Packages must ship a full, valid descriptor and token source; the canonical
  // fixtures stand in for generated output. Callers can override either with an
  // invalid fixture to prove registration rejects it.
  const descriptor = source ?? readJson(fixturePath("valid", "design-system.source.json"));
  writeFileSync(
    join(dir, "design-system.source.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
    "utf8",
  );
  const tokenSource = tokens ?? readJson(fixturePath("valid", "tokens.source.json"));
  writeFileSync(
    join(dir, "tokens.source.json"),
    `${JSON.stringify(tokenSource, null, 2)}\n`,
    "utf8",
  );
  return dir;
}

/** Seed a preexisting registry manifest plus both app integration targets. */
function seedManifestAndApps(root) {
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "design-systems.json"),
    `${JSON.stringify({ version: 3, designSystems: [] }, null, 2)}\n`,
    "utf8",
  );
  for (const app of ["showcase", "reference-app"]) {
    const appRoot = join(root, "apps", app);
    mkdirSync(join(appRoot, "app"), { recursive: true });
    writeFileSync(
      join(appRoot, "app", "registry.ts"),
      `// @prism-system:tool-owned\n// preexisting ${app} registry\nexport const registeredSystems = [];\n`,
      "utf8",
    );
    writeFileSync(
      join(appRoot, "app", "layout.tsx"),
      `// preexisting ${app} layout\nexport default function RootLayout() { return null; }\n`,
      "utf8",
    );
    writeFileSync(
      join(appRoot, "package.json"),
      `${JSON.stringify({ name: `@prism-system/${app}`, version: "0.1.0", private: true }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(appRoot, "next.config.mjs"),
      `// preexisting ${app} config\nconst nextConfig = {};\nexport default nextConfig;\n`,
      "utf8",
    );
  }
}

/** Recursively capture every file's exact bytes under `dir`. */
function snapshotFiles(dir) {
  const files = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(full, readFileSync(full, "utf8"));
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

test("registration records the current contract and canonical metadata", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    makePackage(root, { id: "pulse" });
    const result = await registerDesignSystem({ id: "pulse", root });
    assert.equal(result.entry.contractVersion, 4);
    const written = JSON.parse(readFileSync(join(root, "config", "design-systems.json"), "utf8"));
    assert.equal(written.version, 3);
    assert.equal(written.designSystems[0].contractVersion, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a package with an incomplete prismSystem block is rejected", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    const packageDir = makePackage(root, { id: "pulse" });
    const pkgPath = join(packageDir, "package.json");
    const pkg = readJson(pkgPath);
    delete pkg.prismSystem.tokensExport;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    await assert.rejects(
      registerDesignSystem({ id: "pulse", root }),
      /"prismSystem" in .* is incomplete \(missing tokensExport\)/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readSourceContractVersion accepts only the numeric contractVersion 4", () => {
  const root = mkdtempSync(join(tmpdir(), "prism-source-"));
  try {
    const sourcePath = join(root, "design-system.source.json");
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 4, contractVersion: 4 }), "utf8");
    assert.equal(readSourceContractVersion(root), 4);
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 4, contractVersion: "4" }), "utf8");
    assert.throws(
      () => readSourceContractVersion(root),
      /must declare the numeric contractVersion 4/,
    );
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 3, contractVersion: 4 }), "utf8");
    assert.throws(() => readSourceContractVersion(root), /must declare schemaVersion 4/);
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 2, contractVersion: 4 }), "utf8");
    assert.throws(() => readSourceContractVersion(root), /must declare schemaVersion 4/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid descriptor is rejected and mutates no registry or app bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    const packageDir = makePackage(root, {
      id: "pulse",
      // A full descriptor missing a required component.
      source: readJson(fixturePath("invalid-missing-required", "design-system.source.json")),
    });
    assert.equal(readSourceContractVersion(packageDir), 4);
    seedManifestAndApps(root);
    const before = snapshotFiles(root);

    await assert.rejects(
      registerDesignSystem({ id: "pulse", root }),
      /Cannot register "pulse": invalid source in .*Missing: Heading\./,
    );

    assert.deepEqual(snapshotFiles(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid token source is rejected and mutates no registry or app bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    const packageDir = makePackage(root, {
      id: "pulse",
      // A valid descriptor with a token source carrying an unsupported unit.
      tokens: readJson(fixturePath("tokens-invalid-unit", "tokens.source.json")),
    });
    assert.equal(readSourceContractVersion(packageDir), 4);
    seedManifestAndApps(root);
    const before = snapshotFiles(root);

    await assert.rejects(
      registerDesignSystem({ id: "pulse", root }),
      /Cannot register "pulse": invalid source in .*"spacing\.scale\.4" must be a valid length/,
    );

    assert.deepEqual(snapshotFiles(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registration rejects a descriptor whose declared entrypoint has no package exports map", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    makePackage(root, {
      id: "pulse",
      source: readJson(fixturePath("valid-custom", "design-system.source.json")),
    });
    seedManifestAndApps(root);
    const before = snapshotFiles(root);

    await assert.rejects(
      registerDesignSystem({ id: "pulse", root }),
      /Cannot register "pulse": invalid source in .*package\.json is missing the "exports" map required by the declared source entrypoints/,
    );

    assert.deepEqual(snapshotFiles(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* CLI subprocess regression: real declared extensions                        */
/* -------------------------------------------------------------------------- */

const EXTENSION_FIXTURE_ID = "cli-extension-fixture";
const EXTENSION_FIXTURE_NAME = "KeyboardScene";
const EXTENSION_ENTRYPOINT = "./keyboard-scene";

/**
 * A real declared-extension package under a temporary root, mirroring the app
 * sync fixture: both app targets, a config directory, and a schema-current
 * source descriptor (all required components plus one validated extension)
 * whose contained source, docs, and example files really exist.
 */
function createExtensionCliRoot(root, { dropEntrypointExport = false } = {}) {
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "design-systems.json"),
    `${JSON.stringify({ version: 3, designSystems: [] }, null, 2)}\n`,
    "utf8",
  );
  for (const app of ["showcase", "reference-app"]) {
    mkdirSync(join(root, "apps", app, "app"), { recursive: true });
  }

  const packageDir = join(root, "packages", EXTENSION_FIXTURE_ID);
  mkdirSync(join(packageDir, "src", "keyboard-scene"), { recursive: true });
  mkdirSync(join(packageDir, "docs"), { recursive: true });
  mkdirSync(join(packageDir, "examples"), { recursive: true });
  writeFileSync(
    join(packageDir, "src", "keyboard-scene", "index.ts"),
    `export function ${EXTENSION_FIXTURE_NAME}() {\n  return null;\n}\n`,
    "utf8",
  );
  writeFileSync(join(packageDir, "docs", "keyboard-scene.md"), "# KeyboardScene\n", "utf8");
  writeFileSync(join(packageDir, "examples", "keyboard-scene.tsx"), "export {};\n", "utf8");

  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: `@prism-system/ui-${EXTENSION_FIXTURE_ID}`,
        version: "0.1.0",
        prismSystem: {
          name: "CLI Extension Fixture",
          uiClass: "maivand-cli-extension-fixture-ui",
          tokensExport: "cliExtensionFixtureTokens",
        },
        exports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.mjs" },
          "./styles.css": "./dist/index.css",
          "./manifest": "./design-system.json",
          ...(dropEntrypointExport
            ? {}
            : {
                [EXTENSION_ENTRYPOINT]: {
                  types: "./dist/keyboard-scene/index.d.ts",
                  import: "./dist/keyboard-scene/index.mjs",
                },
              }),
        },
        peerDependencies: { three: ">=0.186.0 <1" },
        peerDependenciesMeta: { three: { optional: true } },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const components = {};
  for (const name of manifestTooling.REQUIRED_COMPONENTS) {
    components[name] = { variants: [], sizes: [], members: [] };
  }
  writeFileSync(
    join(packageDir, "design-system.source.json"),
    `${JSON.stringify(
      {
        schemaVersion: manifestTooling.DESIGN_SYSTEM_SCHEMA_VERSION,
        contractVersion: 4,
        name: "CLI Extension Fixture",
        components,
        design: { density: "comfortable", theme: "light-first", radius: "small", keywords: [] },
        rules: {
          allowArbitraryColors: false,
          allowArbitraryRadius: false,
          allowArbitraryShadows: false,
          allowPrimitiveDuplication: false,
        },
        entrypoints: {
          [EXTENSION_ENTRYPOINT]: {
            source: "./src/keyboard-scene/index.ts",
            requires: ["three"],
          },
        },
        extensions: {
          [EXTENSION_FIXTURE_NAME]: {
            apiVersion: 1,
            entrypoint: EXTENSION_ENTRYPOINT,
            description: "Keyboard scene extension",
            docs: "./docs/keyboard-scene.md",
            example: "./examples/keyboard-scene.tsx",
            effects: {
              features: ["3d", "motion"],
              rendering: "webgl",
              reducedMotion: true,
              fallback: "static",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageDir, "tokens.source.json"),
    readFileSync(fixturePath("valid", "tokens.source.json"), "utf8"),
    "utf8",
  );
  return root;
}

/** Run the real register CLI against `root` with a finite deadlock timeout. */
function runRegisterCli(root, id = EXTENSION_FIXTURE_ID) {
  return spawnSync(
    process.execPath,
    [
      join(repoRoot, "scripts", "register-design-system.mjs"),
      id,
      "--root",
      root,
      "--manifest",
      join(root, "config", "design-systems.json"),
    ],
    { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
  );
}

test("the register CLI completes with real declared extensions instead of deadlocking", () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-cli-"));
  try {
    createExtensionCliRoot(root);
    const first = runRegisterCli(root);
    assert.equal(first.error, undefined, first.error?.message);
    assert.equal(first.status, 0, `first run stderr: ${first.stderr}`);
    assert.match(first.stdout, /as added/);
    assert.doesNotMatch(
      `${first.stdout}${first.stderr}`,
      /unsettled top-level await|Detected unsettled/i,
    );

    const registry = JSON.parse(readFileSync(join(root, "config", "design-systems.json"), "utf8"));
    assert.deepEqual(
      registry.designSystems.map((system) => system.id),
      [EXTENSION_FIXTURE_ID],
    );

    const loaderPath = join(root, "apps", "showcase", "app", EXTENSION_LOADERS_FILENAME);
    const loader = readFileSync(loaderPath, "utf8");
    assert.match(loader, /KeyboardScene: \(\) =>/);
    assert.ok(
      loader.includes(`import("@prism-system/ui-${EXTENSION_FIXTURE_ID}/keyboard-scene")`),
      "the declared extension becomes one literal lazy import",
    );
    assert.ok(
      !existsSync(join(root, "apps", "reference-app", "app", EXTENSION_LOADERS_FILENAME)),
      "the Reference App never receives an extension loader",
    );

    const second = runRegisterCli(root);
    assert.equal(second.error, undefined, second.error?.message);
    assert.equal(second.status, 0, `second run stderr: ${second.stderr}`);
    assert.match(second.stdout, /as unchanged/);
    assert.doesNotMatch(
      `${second.stdout}${second.stderr}`,
      /unsettled top-level await|Detected unsettled/i,
    );
    assert.equal(readFileSync(loaderPath, "utf8"), loader, "the second run is idempotent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the register CLI reports invalid and missing packages with status 1", () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-cli-"));
  try {
    createExtensionCliRoot(root, { dropEntrypointExport: true });

    const invalid = runRegisterCli(root);
    assert.equal(invalid.error, undefined, invalid.error?.message);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Cannot register/);
    assert.match(invalid.stderr, /exports|entrypoint/i);

    const missing = runRegisterCli(root, "missing-system");
    assert.equal(missing.error, undefined, missing.error?.message);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Cannot register "missing-system"/);
    assert.match(missing.stderr, /package directory not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
