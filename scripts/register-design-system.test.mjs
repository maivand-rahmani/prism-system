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

import {
  CONTRACT_VERSION,
  buildEntry,
  normalizeManifest,
  readSourceContractVersion,
  registerDesignSystem,
} from "./register-design-system.mjs";
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
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 3, contractVersion: 4 }), "utf8");
    assert.equal(readSourceContractVersion(root), 4);
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 3, contractVersion: "4" }), "utf8");
    assert.throws(
      () => readSourceContractVersion(root),
      /must declare the numeric contractVersion 4/,
    );
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 2, contractVersion: 4 }), "utf8");
    assert.throws(() => readSourceContractVersion(root), /must declare schemaVersion 3/);
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
