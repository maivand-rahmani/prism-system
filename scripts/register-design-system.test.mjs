#!/usr/bin/env node
/**
 * V2/V4 maintainer registry tests (Node built-in test runner, no dependency).
 *
 * Run directly:
 *   node --test scripts/register-design-system.test.mjs
 *
 * These cover the registry contract schema (only `v2`/`v4` are accepted), that a
 * V4 runtime is never relabeled as V2, and the runtime source path each
 * contract synchronizes through.
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
  CONTRACTS,
  buildEntry,
  normalizeManifest,
  readSourceContract,
  registerDesignSystem,
} from "./register-design-system.mjs";
import { runtimeTargetForContract } from "./sync-design-system-versions.mjs";

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
});

test("the registry schema accepts exactly v2 and v4", () => {
  assert.deepEqual([...CONTRACTS], ["v2", "v4"]);
  assert.equal(buildEntry({ ...ENTRY_BASE, contract: "v2" }).contract, "v2");
  assert.equal(buildEntry({ ...ENTRY_BASE, contract: "v4" }).contract, "v4");
  assert.throws(() => buildEntry({ ...ENTRY_BASE, contract: "v1" }), /Unsupported contract "v1"/);
  assert.throws(() => buildEntry({ ...ENTRY_BASE }), /Missing required "contract"/);
});

test("normalizeManifest keeps a v4 entry as v4", () => {
  const manifest = normalizeManifest({
    version: 2,
    designSystems: [{ ...ENTRY_BASE, contract: "v4" }],
  });
  assert.equal(manifest.designSystems[0].contract, "v4");
});

test("runtime target follows the contract: V2 index.ts, V4 design-system.ts", () => {
  assert.equal(runtimeTargetForContract("v2"), "src/index.ts");
  assert.equal(runtimeTargetForContract("v4"), "src/design-system.ts");
  assert.throws(() => runtimeTargetForContract("v1"), /expected "v2" or "v4"/);
});

function makePackage(root, { id, contract, prismSystemContract, source, tokens }) {
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
          contract: prismSystemContract ?? contract,
          uiClass: `maivand-${id}-ui`,
          tokensExport: `${id}Tokens`,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  // V4 packages must ship a full, valid descriptor and token source; the
  // canonical fixtures stand in for generated output. Callers can override
  // either with an invalid fixture to prove registration rejects it.
  const descriptor =
    source ??
    (contract === "v4"
      ? readJson(fixturePath("v4-valid", "design-system.source.json"))
      : { schemaVersion: 1, contract });
  writeFileSync(
    join(dir, "design-system.source.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
    "utf8",
  );
  if (contract === "v4") {
    const tokenSource = tokens ?? readJson(fixturePath("v4-valid", "tokens.source.json"));
    writeFileSync(
      join(dir, "tokens.source.json"),
      `${JSON.stringify(tokenSource, null, 2)}\n`,
      "utf8",
    );
  }
  return dir;
}

/** Seed a preexisting registry manifest plus both app integration targets. */
function seedManifestAndApps(root) {
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "design-systems.json"),
    `${JSON.stringify({ version: 2, designSystems: [] }, null, 2)}\n`,
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

test("registration records the source contract and never relabels V4 as V2", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    makePackage(root, { id: "pulse", contract: "v4" });
    const result = await registerDesignSystem({ id: "pulse", root });
    assert.equal(result.entry.contract, "v4");
    const written = JSON.parse(readFileSync(join(root, "config", "design-systems.json"), "utf8"));
    assert.equal(written.designSystems[0].contract, "v4");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registration records a V2 package as v2", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    makePackage(root, { id: "calm", contract: "v2" });
    const result = await registerDesignSystem({ id: "calm", root });
    assert.equal(result.entry.contract, "v2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a package whose prismSystem disagrees with its source descriptor is rejected", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    makePackage(root, { id: "pulse", contract: "v4", prismSystemContract: "v2" });
    await assert.rejects(
      registerDesignSystem({ id: "pulse", root }),
      /package contract and its source descriptor must agree/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readSourceContract accepts only the two canonical pairs", () => {
  const root = mkdtempSync(join(tmpdir(), "prism-source-"));
  try {
    const sourcePath = join(root, "design-system.source.json");
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 1, contract: "v2" }), "utf8");
    assert.equal(readSourceContract(root), "v2");
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 2, contract: "v4" }), "utf8");
    assert.equal(readSourceContract(root), "v4");
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 2, contract: "v2" }), "utf8");
    assert.throws(
      () => readSourceContract(root),
      /must declare \(schemaVersion 1, contract "v2"\)/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid V4 descriptor is rejected and mutates no registry or app bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    const packageDir = makePackage(root, {
      id: "pulse",
      contract: "v4",
      // A full descriptor missing a required component: the pair still looks
      // registrable, which is the gap the full V4 validation closes.
      source: readJson(fixturePath("v4-invalid-missing-required", "design-system.source.json")),
    });
    assert.equal(readSourceContract(packageDir), "v4");
    seedManifestAndApps(root);
    const before = snapshotFiles(root);

    await assert.rejects(
      registerDesignSystem({ id: "pulse", root }),
      /Cannot register "pulse": invalid V4 source in .*Missing: Heading\./,
    );

    assert.deepEqual(snapshotFiles(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid V4 token source is rejected and mutates no registry or app bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "prism-register-"));
  try {
    const packageDir = makePackage(root, {
      id: "pulse",
      contract: "v4",
      // A valid descriptor with a token source carrying an unsupported unit.
      tokens: readJson(fixturePath("tokens-invalid-unit", "tokens.source.json")),
    });
    assert.equal(readSourceContract(packageDir), "v4");
    seedManifestAndApps(root);
    const before = snapshotFiles(root);

    await assert.rejects(
      registerDesignSystem({ id: "pulse", root }),
      /Cannot register "pulse": invalid V4 source in .*"spacing\.scale\.4" must be a valid length/,
    );

    assert.deepEqual(snapshotFiles(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
