#!/usr/bin/env node
/**
 * Standalone tests for the mutating catalog lifecycle foundations.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/catalog-lifecycle.test.mjs
 *
 * Everything here is offline and in-memory: a fake registry serves generated
 * tarballs, a fake package manager records (and never executes) the fixed
 * command, and each test works on a disposable temp consumer. The real System A
 * manifests are read as JSON data only; no design-system code is imported or run.
 *
 * Covered: install/use/upgrade dry runs (zero spawn, byte-identical consumer),
 * exact command construction, exact-version rejection, upgrade removals reported
 * before mutation, fail-closed registry/preflight with no manager call, unchanged
 * `--tailwind` prerequisite/preflight and
 * setup success/failure boundaries.
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
import { dirname, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import { installDesignSystem, runUseDesignSystem, upgradeDesignSystem } from "../src/catalog.mjs";
import { mergeBridgeImports } from "../src/tailwind-setup.mjs";
import { addSyntheticExtension, readJson, syntheticManifest } from "./manifest-fixture.mjs";

// A complete current (schema 5) synthetic manifest. The lifecycle tests add the
// few realistic optional/token values they exercise; no checked-in generated
// artifact is required, so these tests stay independent of the generator lane.
const systemAManifest = syntheticManifest();
systemAManifest.components.Grid = { variants: [], sizes: [], members: [] };
systemAManifest.tokens.groups.spacing = ["scale.24"];
/** The live V4 System A version; the fixture manifest version is authoritative. */
const V4_VERSION = systemAManifest.version;

const OTHER_BRIDGE = '@import "@prism-system/ui-system-b/tailwind.css";';

/* -------------------------------------------------------------------------- */
/* In-memory tarballs and a fake registry                                     */
/* -------------------------------------------------------------------------- */

/** Build a minimal ustar header for one regular file. */
function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, "ascii");
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write("00000000000\0", 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write("0", 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  let sum = 0;
  for (let index = 0; index < 512; index += 1) sum += header[index];
  header.write(`${sum.toString(8).padStart(7, "0")}\0`, 148, "ascii");
  return header;
}

/** Build a gzip-compressed npm-style tarball with `package/...` entries. */
function makeTarball(files) {
  const chunks = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    chunks.push(tarHeader(name, data.length));
    chunks.push(data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

/**
 * Create a fake registry fetch for one package. Each version's manifest becomes
 * a real tarball; the packument and tarball URLs are served in memory.
 *
 * @returns {{ registry: string, fetchImpl: Function, requests: string[] }}
 */
function createRegistry({ packageName, versions }) {
  const tarballs = new Map();
  const requests = [];
  const versionsMeta = {};
  let latest = null;
  for (const [version, manifest] of Object.entries(versions)) {
    const bytes = makeTarball({ "package/design-system.json": JSON.stringify(manifest) });
    const tarballUrl = `https://registry.test/${encodeURIComponent(packageName)}/-/${version}.tgz`;
    tarballs.set(tarballUrl, bytes);
    versionsMeta[version] = {
      name: packageName,
      version,
      prismSystem: { contractVersion: manifest.contractVersion },
      exports: { "./manifest": "./design-system.json" },
      dist: { tarball: tarballUrl },
    };
    latest = version;
  }
  const fetchImpl = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    requests.push(url.href);
    if (tarballs.has(url.href)) {
      return new Response(tarballs.get(url.href), { status: 200 });
    }
    return new Response(
      JSON.stringify({ name: packageName, "dist-tags": { latest }, versions: versionsMeta }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { registry: "https://registry.test", fetchImpl, requests };
}

/* -------------------------------------------------------------------------- */
/* Temp consumer fixtures                                                     */
/* -------------------------------------------------------------------------- */

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCss(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

/** Write (or replace) an installed design system under the consumer root. */
function writeInstalled(root, manifest, { bridge = true } = {}) {
  const dir = join(root, "node_modules", ...manifest.package.split("/"));
  const exportsMap = { "./manifest": "./design-system.json" };
  if (bridge) {
    exportsMap["./tailwind.css"] = "./dist/tailwind.css";
    exportsMap["./styles.css"] = "./dist/index.css";
  }
  writeJson(join(dir, "package.json"), {
    name: manifest.package,
    version: manifest.version,
    exports: exportsMap,
  });
  writeJson(join(dir, "design-system.json"), manifest);
  if (bridge) {
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "tailwind.css"), "/* tailwind bridge */\n", "utf8");
    writeFileSync(join(dir, "dist", "index.css"), "/* styles */\n", "utf8");
  }
  return dir;
}

function createConsumer(
  t,
  {
    packageName,
    dependencyVersion = "1.1.0",
    manifest = null,
    connected = false,
    tailwind = null,
    bridge = true,
    css = null,
    packageManager = "npm@10.0.0",
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "prism-catalog-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const dependencies = { [packageName]: dependencyVersion };
  if (tailwind !== null) dependencies.tailwindcss = tailwind;
  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    packageManager,
    dependencies,
  });

  if (connected && manifest) {
    writeJson(join(root, ".design-system", "config.json"), {
      schemaVersion: 1,
      package: packageName,
      version: manifest.version,
      manifest: "./manifest",
      strict: true,
    });
  }

  if (manifest) writeInstalled(root, manifest, { bridge });

  if (tailwind !== null) {
    const dir = join(root, "node_modules", "tailwindcss");
    writeJson(join(dir, "package.json"), {
      name: "tailwindcss",
      version: tailwind,
      exports: { ".": "./index.css", "./package.json": "./package.json" },
    });
    writeFileSync(join(dir, "index.css"), "/* tailwind */\n", "utf8");
  }

  if (css !== null) writeCss(root, "src/app.css", css);

  return { root, packageName };
}

/** A fake package manager that records calls and never executes anything. */
function makeManager({ onSpawn, status = 0 } = {}) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    if (onSpawn) onSpawn({ command, args, options });
    return { status, error: null };
  };
  return { spawnImpl, calls };
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

function assertUnchanged(root, before) {
  assert.deepEqual([...snapshot(root).entries()], [...before.entries()]);
}

const INSTALL_ARGS = (packageName, version, registry) => [
  "install",
  "--save-prod",
  "--ignore-scripts",
  `--registry=${registry}`,
  `${packageName}@${version}`,
];

/* -------------------------------------------------------------------------- */
/* install                                                                    */
/* -------------------------------------------------------------------------- */

test("install --dry-run resolves the exact command without spawning or writing", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, { packageName: systemAManifest.package });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await installDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.package, systemAManifest.package);
  assert.equal(result.version, V4_VERSION);
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(systemAManifest.package, V4_VERSION, registry.registry),
  );
  assert.equal(result.plannedChanges.length, 1);
  assert.equal(result.plannedChanges[0].kind, "dependency");
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

/* -------------------------------------------------------------------------- */
/* use                                                                        */
/* -------------------------------------------------------------------------- */

test("use --dry-run plans without spawning or writing", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, { packageName: systemAManifest.package });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.tailwind, null);
  assert.deepEqual(
    result.install.command.args,
    INSTALL_ARGS(systemAManifest.package, V4_VERSION, registry.registry),
  );
  assert.deepEqual(
    result.plannedChanges.map((change) => change.kind),
    ["dependency", "connect", "connect", "connect"],
  );
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

/* -------------------------------------------------------------------------- */
/* use --tailwind                                                             */
/* -------------------------------------------------------------------------- */

test("use --tailwind --dry-run returns the exact CSS import diff without writing", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const cssBefore = ["/* product */", "body { margin: 0; }", ""].join("\n");
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: systemAManifest,
    connected: true,
    tailwind: "4.1.0",
    css: cssBefore,
  });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    tailwind: true,
    cssPath: "src/app.css",
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.tailwind.before, cssBefore);
  assert.equal(
    result.tailwind.after,
    mergeBridgeImports(cssBefore, { packageName: systemAManifest.package }),
  );
  assert.equal(result.tailwind.changed, true);
  const cssChange = result.plannedChanges.find((change) => change.kind === "css");
  assert.equal(cssChange.path, join(consumer.root, "src", "app.css"));
  assert.equal(cssChange.after, result.tailwind.after);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

test("use requires --css exactly when --tailwind is set", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, { packageName: systemAManifest.package });
  const manager = makeManager();

  const missingCss = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    tailwind: true,
  });
  assert.equal(missingCss.ok, false);
  assert.equal(missingCss.boundary, "arguments");
  assert.match(missingCss.failures.join(" "), /--tailwind requires --css/);

  const cssWithoutTailwind = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    cssPath: "src/app.css",
  });
  assert.equal(cssWithoutTailwind.ok, false);
  assert.equal(cssWithoutTailwind.boundary, "arguments");
  assert.match(cssWithoutTailwind.failures.join(" "), /--css requires --tailwind/);

  assert.equal(manager.calls.length, 0);
});

test("use --tailwind preflight rejects a non-v4 Tailwind before any manager call", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    tailwind: "3.4.0",
    css: "body {}\n",
  });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    tailwind: true,
    cssPath: "src/app.css",
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "preflight");
  assert.match(result.failures.join(" "), /requires Tailwind CSS v4/);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

test("use --tailwind preflight rejects a conflicting second bridge without writing", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    tailwind: "4.1.0",
    css: `${OTHER_BRIDGE}\nbody {}\n`,
  });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    tailwind: true,
    cssPath: "src/app.css",
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "preflight");
  assert.match(result.failures.join(" "), /one design-system bridge is supported/);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

test("use --tailwind preflight does not require the not-yet-installed bridge exports", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  // The currently installed (old) system has no ./tailwind.css export; a dry run
  // must not claim those files exist before the install.
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: systemAManifest,
    connected: true,
    tailwind: "4.1.0",
    bridge: false,
    css: "body {}\n",
  });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    tailwind: true,
    cssPath: "src/app.css",
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.tailwind.changed, true);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

test("use --tailwind installs, connects, then runs the Tailwind setup", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    tailwind: "4.1.0",
    css: "body { margin: 0; }\n",
  });
  const manager = makeManager({
    onSpawn: () => writeInstalled(consumer.root, systemAManifest, { bridge: true }),
  });

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    tailwind: true,
    cssPath: "src/app.css",
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.install.ok, true);
  assert.equal(result.connect.ok, true);
  assert.equal(result.tailwindSetup.ok, true);
  assert.equal(result.tailwindSetup.changed, true);
  assert.equal(manager.calls.length, 1);

  const css = readFileSync(join(consumer.root, "src", "app.css"), "utf8");
  assert.ok(css.includes('@import "tailwindcss";'));
  assert.ok(css.includes(`@import "${systemAManifest.package}/tailwind.css";`));
  assert.ok(css.includes(`@import "${systemAManifest.package}/styles.css";`));
});

test("a Tailwind setup failure after install/connect retains the earlier work", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    tailwind: "4.1.0",
    css: "body { margin: 0; }\n",
  });
  // The installed package is verified (manifest only) but exposes no bridge.
  const manager = makeManager({
    onSpawn: () => writeInstalled(consumer.root, systemAManifest, { bridge: false }),
  });

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    tailwind: true,
    cssPath: "src/app.css",
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "setup-tailwind");
  assert.equal(result.install.ok, true);
  assert.equal(result.connect.ok, true);
  assert.match(result.note, /No rollback was attempted/);
  assert.match(result.failures.join(" "), /does not expose "\.\/tailwind\.css"/);

  // The install and connect really persisted; the CSS file was untouched.
  assert.equal(
    readFileSync(join(consumer.root, ".design-system", "config.json"), "utf8").includes(V4_VERSION),
    true,
  );
  assert.equal(
    readFileSync(join(consumer.root, "src", "app.css"), "utf8"),
    "body { margin: 0; }\n",
  );
});

/* -------------------------------------------------------------------------- */
/* upgrade                                                                    */
/* -------------------------------------------------------------------------- */

const upgradeFrom = structuredClone(systemAManifest);
upgradeFrom.version = "1.1.0";

const upgradeTo = structuredClone(systemAManifest);
upgradeTo.version = "2.0.0";
delete upgradeTo.components.Grid;
upgradeTo.components.Section = { variants: [], sizes: [], members: [] };
upgradeTo.tokens.groups.spacing = [
  ...upgradeFrom.tokens.groups.spacing.filter((name) => name !== "scale.24"),
  "scale.32",
];

test("upgrade requires an explicit exact version before touching the network", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { "2.0.0": upgradeTo },
  });
  const consumer = createConsumer(t, { packageName: systemAManifest.package });
  const manager = makeManager();

  for (const version of [undefined, "", "1.2", "^1.0.0", "latest"]) {
    const result = await upgradeDesignSystem({
      cwd: consumer.root,
      package: systemAManifest.package,
      version,
      registry: registry.registry,
      fetchImpl: registry.fetchImpl,
      spawnImpl: manager.spawnImpl,
    });
    assert.equal(result.ok, false, `version ${JSON.stringify(version)} rejected`);
    assert.equal(result.boundary, "arguments");
  }
  assert.equal(manager.calls.length, 0);
  assert.equal(registry.requests.length, 0);
});

test("upgrade --dry-run reports removals/additions and the exact command without writing", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { "2.0.0": upgradeTo },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: upgradeFrom,
    connected: true,
  });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.fromVersion, "1.1.0");
  assert.equal(result.toVersion, "2.0.0");
  assert.deepEqual(result.diff.components.removed, ["Grid"]);
  assert.deepEqual(result.diff.components.added, ["Section"]);
  assert.deepEqual(result.diff.components.changed, []);
  assert.deepEqual(result.diff.tokens.removed.spacing, ["scale.24"]);
  assert.deepEqual(result.diff.tokens.added.spacing, ["scale.32"]);
  assert.ok(
    result.preview.some((line) => line === "components removed: Grid"),
    result.preview.join("\n"),
  );
  assert.ok(
    result.preview.some((line) => line === "components added: Section"),
    result.preview.join("\n"),
  );
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(systemAManifest.package, "2.0.0", registry.registry),
  );
  assert.deepEqual(
    result.plannedChanges.map((change) => change.kind),
    ["dependency", "connect", "connect", "connect"],
  );
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);

  const again = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });
  assert.deepEqual(again, result);
});

test("upgrade diff reports component assortment, contract metadata, and public export changes", async (t) => {
  const from = structuredClone(upgradeFrom);
  const to = structuredClone(upgradeTo);
  from.components.Alert = { variants: ["info"], sizes: ["sm"], members: ["Title"] };
  to.components.Alert = {
    variants: ["warning", "info"],
    sizes: ["sm", "lg"],
    members: ["Title", "Action"],
  };
  // Reordering declared arrays is not a capability change.
  from.components.Stack.variants = ["vertical", "horizontal"];
  to.components.Stack.variants = ["horizontal", "vertical"];
  from.components.Stack.sizes = ["sm"];
  to.components.Stack.sizes = ["sm", "lg"];
  from.exports = {
    ".": "./dist/index.js",
    "./tokens": "./dist/tokens/index.js",
    "./manifest": "./design-system.json",
  };
  to.exports = {
    ".": "./dist/new-index.js",
    "./tokens": "./dist/tokens/index.js",
    "./manifest": "./design-system.json",
    "./styles.css": "./dist/index.css",
  };
  to.version = "2.1.0";

  const registry = createRegistry({ packageName: from.package, versions: { [to.version]: to } });
  const consumer = createConsumer(t, {
    packageName: from.package,
    manifest: from,
    connected: true,
  });
  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: from.package,
    version: to.version,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: makeManager().spawnImpl,
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.deepEqual(result.diff.components.changed, [
    { name: "Stack", fields: { sizes: { added: ["lg"], removed: [] } } },
    {
      name: "Alert",
      fields: {
        variants: { added: ["warning"], removed: [] },
        sizes: { added: ["lg"], removed: [] },
        members: { added: ["Action"], removed: [] },
      },
    },
  ]);
  assert.deepEqual(result.diff.metadata, {});
  assert.deepEqual(result.diff.exports, {
    added: [{ target: "./styles.css", value: "./dist/index.css" }],
    removed: [],
    changed: [{ target: ".", from: "./dist/index.js", to: "./dist/new-index.js" }],
  });
  assert.ok(
    result.preview.some((line) =>
      line.includes("components changed (Alert variants added): warning"),
    ),
  );
  assert.ok(result.preview.some((line) => line.includes("public export changed (.)")));
});

test("upgrade diff treats reordered component and token names as unchanged sets", async (t) => {
  const from = structuredClone(systemAManifest);
  const to = structuredClone(from);
  from.version = "1.1.0";
  to.version = "2.1.0";
  from.components.Stack.variants = ["vertical", "horizontal"];
  to.components.Stack.variants = ["horizontal", "vertical"];
  from.tokens.groups.spacing = ["scale.4", "scale.8"];
  to.tokens.groups.spacing = ["scale.8", "scale.4"];
  const registry = createRegistry({ packageName: from.package, versions: { [to.version]: to } });
  const consumer = createConsumer(t, {
    packageName: from.package,
    manifest: from,
    connected: true,
  });
  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: from.package,
    version: to.version,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: makeManager().spawnImpl,
    dryRun: true,
  });
  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.deepEqual(result.diff.components.changed, []);
  assert.deepEqual(result.diff.tokens, { added: {}, removed: {} });
});

test("upgrade reports removals even when the manager later fails", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { "2.0.0": upgradeTo },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: upgradeFrom,
    connected: true,
  });
  const manager = makeManager({ status: 1 });
  const before = snapshot(consumer.root);

  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "manager");
  // The comparison happened before the manager ran and is still reported.
  assert.deepEqual(result.diff.components.removed, ["Grid"]);
  assert.ok(result.preview.some((line) => line === "components removed: Grid"));
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(systemAManifest.package, "2.0.0", registry.registry),
  );
  assert.equal(manager.calls.length, 1);
  assertUnchanged(consumer.root, before);
});

test("upgrade makes no manager call when registry resolution fails", async (t) => {
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: upgradeFrom,
    connected: true,
  });
  const manager = makeManager();
  const failingFetch = async () => {
    throw new Error("network down");
  };

  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: "https://registry.test",
    fetchImpl: failingFetch,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "registry");
  assert.equal(manager.calls.length, 0);
});

test("upgrade makes no manager call when the installed system cannot be verified", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { "2.0.0": upgradeTo },
  });
  const consumer = createConsumer(t, { packageName: systemAManifest.package });
  const manager = makeManager();

  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "installed");
  assert.equal(manager.calls.length, 0);
});

test("upgrade updates, verifies the exact version, and reconnects", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { "2.0.0": upgradeTo },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: upgradeFrom,
    connected: true,
  });
  const manager = makeManager({
    onSpawn: () => writeInstalled(consumer.root, upgradeTo, { bridge: false }),
  });

  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.changed, true);
  assert.equal(result.fromVersion, "1.1.0");
  assert.equal(result.toVersion, "2.0.0");
  assert.equal(result.connect.ok, true);
  assert.equal(manager.calls.length, 1);

  const config = JSON.parse(
    readFileSync(join(consumer.root, ".design-system", "config.json"), "utf8"),
  );
  assert.equal(config.version, "2.0.0");
  assert.equal(config.package, systemAManifest.package);
});

/* -------------------------------------------------------------------------- */
/* Target connect plan and the optional write precondition                    */
/* -------------------------------------------------------------------------- */

test("use --dry-run returns the exact target connect plan and the real run writes those bytes", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, { packageName: systemAManifest.package });
  const manager = makeManager();

  const preview = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });

  assert.equal(preview.ok, true, preview.failures?.join(" "));
  assert.deepEqual(
    preview.connectPlan.files.map((file) => file.kind),
    ["config", "agents", "root-agents"],
  );
  assert.deepEqual(
    preview.connectPlan.files.map((file) => file.path),
    [
      join(consumer.root, ".design-system", "config.json"),
      join(consumer.root, ".design-system", "AGENTS.md"),
      join(consumer.root, "AGENTS.md"),
    ],
  );
  const config = JSON.parse(preview.connectPlan.files[0].after);
  assert.equal(config.package, systemAManifest.package);
  assert.equal(config.version, V4_VERSION);
  assert.equal(config.strict, true);
  assert.equal(preview.connectPlan.files[0].before, null);

  // plannedChanges carries the same exact file material, not just paths.
  const connectChanges = preview.plannedChanges.filter((change) => change.kind === "connect");
  assert.equal(connectChanges.length, 3);
  for (const [index, change] of connectChanges.entries()) {
    const file = preview.connectPlan.files[index];
    assert.equal(change.path, file.path);
    assert.equal(change.fileKind, file.kind);
    assert.equal(change.before, file.before);
    assert.equal(change.after, file.after);
    assert.equal(change.changed, true);
  }
  assert.equal(manager.calls.length, 0);
  assert.equal(existsSync(join(consumer.root, ".design-system", "config.json")), false);

  // The real run uses the previewed plan as its write precondition and writes
  // exactly those bytes.
  const realManager = makeManager({
    onSpawn: () => writeInstalled(consumer.root, systemAManifest, { bridge: true }),
  });
  const real = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: realManager.spawnImpl,
    expectedConnectPlan: preview.connectPlan,
  });

  assert.equal(real.ok, true, real.failures?.join(" "));
  assert.equal(real.connect.ok, true);
  for (const file of preview.connectPlan.files) {
    assert.equal(readFileSync(file.path, "utf8"), file.after);
  }
  assert.equal(realManager.calls.length, 1);
});

test("use fails closed without overwriting a managed file changed during install", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { [V4_VERSION]: systemAManifest },
  });
  const consumer = createConsumer(t, { packageName: systemAManifest.package });
  const preview = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: makeManager().spawnImpl,
    dryRun: true,
  });
  assert.equal(preview.ok, true, preview.failures?.join(" "));

  const injected = "# injected while the package manager ran\n";
  const manager = makeManager({
    onSpawn: () => {
      writeInstalled(consumer.root, systemAManifest, { bridge: true });
      writeFileSync(join(consumer.root, "AGENTS.md"), injected, "utf8");
    },
  });

  const result = await runUseDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: V4_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    expectedConnectPlan: preview.connectPlan,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "connect-precondition");
  assert.equal(result.install.ok, true, "the dependency install did happen");
  assert.equal(result.connect.boundary, "precondition");
  assert.match(result.failures.join(" "), /No connect files were written/);
  assert.match(result.failures.join(" "), /not rolled back/);
  assert.match(result.note, /reconnect did not complete/);
  assert.match(result.note, /No rollback was attempted/);
  assert.equal(manager.calls.length, 1);

  // The injected file is untouched and reconnect created nothing.
  assert.equal(readFileSync(join(consumer.root, "AGENTS.md"), "utf8"), injected);
  assert.equal(existsSync(join(consumer.root, ".design-system", "config.json")), false);
  assert.equal(existsSync(join(consumer.root, ".design-system", "AGENTS.md")), false);
});

test("upgrade --dry-run returns the target connect plan and reconnects with those bytes when unchanged", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { "2.0.0": upgradeTo },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: upgradeFrom,
    connected: true,
  });

  const preview = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: makeManager().spawnImpl,
    dryRun: true,
  });

  assert.equal(preview.ok, true, preview.failures?.join(" "));
  const configChange = preview.plannedChanges.find(
    (change) => change.kind === "connect" && change.fileKind === "config",
  );
  assert.ok(configChange, "the planned config effect is reported with its file kind");
  assert.equal(configChange.path, join(consumer.root, ".design-system", "config.json"));
  assert.match(configChange.before, /"version": "1\.1\.0"/);
  assert.match(configChange.after, /"version": "2\.0\.0"/);
  assert.equal(configChange.changed, true);

  const realManager = makeManager({
    onSpawn: () => writeInstalled(consumer.root, upgradeTo, { bridge: false }),
  });
  const real = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: realManager.spawnImpl,
    expectedConnectPlan: preview.connectPlan,
  });

  assert.equal(real.ok, true, real.failures?.join(" "));
  assert.equal(real.connect.ok, true);
  for (const file of preview.connectPlan.files) {
    assert.equal(readFileSync(file.path, "utf8"), file.after);
  }
});

test("upgrade fails closed without overwriting a managed file changed during the upgrade", async (t) => {
  const registry = createRegistry({
    packageName: systemAManifest.package,
    versions: { "2.0.0": upgradeTo },
  });
  const consumer = createConsumer(t, {
    packageName: systemAManifest.package,
    manifest: upgradeFrom,
    connected: true,
  });

  const preview = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: makeManager().spawnImpl,
    dryRun: true,
  });
  assert.equal(preview.ok, true, preview.failures?.join(" "));

  const injected = "# injected while the upgrade ran\n";
  const manager = makeManager({
    onSpawn: () => {
      writeInstalled(consumer.root, upgradeTo, { bridge: false });
      writeFileSync(join(consumer.root, "AGENTS.md"), injected, "utf8");
    },
  });

  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: systemAManifest.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    expectedConnectPlan: preview.connectPlan,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "connect-precondition");
  assert.match(result.failures.join(" "), /No connect files were written/);
  assert.match(result.note, /reconnect did not complete/);
  assert.match(result.note, /No rollback was attempted/);
  assert.equal(manager.calls.length, 1);

  // The dependency upgrade happened, but reconnect wrote nothing: the injected
  // AGENTS.md and the old config both remain.
  assert.equal(
    readJson(
      join(consumer.root, "node_modules", ...systemAManifest.package.split("/"), "package.json"),
    ).version,
    "2.0.0",
  );
  assert.equal(readFileSync(join(consumer.root, "AGENTS.md"), "utf8"), injected);
  assert.equal(
    JSON.parse(readFileSync(join(consumer.root, ".design-system", "config.json"), "utf8")).version,
    "1.1.0",
  );
});

/* -------------------------------------------------------------------------- */
/* Entry/peer selection in mutations                                          */
/* -------------------------------------------------------------------------- */

function sceneTarget({ version = "2.0.0" } = {}) {
  const manifest = addSyntheticExtension(structuredClone(systemAManifest), {
    requirements: [
      { name: "three", kind: "peer", range: "^0.186.0", optional: true },
      { name: "@react-three/fiber", kind: "peer", range: "8.18.0", optional: true },
    ],
    effects: { features: ["depth", "3d"], rendering: "webgl", reducedMotion: true, fallback: "static" },
  });
  manifest.version = version;
  return manifest;
}

test("install --with-entry --peer plans the full fixed command without spawning or writing", async (t) => {
  const target = sceneTarget();
  const registry = createRegistry({
    packageName: target.package,
    versions: { "2.0.0": target },
  });
  const consumer = createConsumer(t, { packageName: target.package });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await installDesignSystem({
    cwd: consumer.root,
    package: target.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    withEntry: ["KeyboardScene"],
    peers: ["three@0.186.1"],
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.entrySelection.entries[0].extension, "KeyboardScene");
  assert.equal(result.entrySelection.entries[0].entrypoint, "./keyboard-scene");
  assert.deepEqual(
    result.peers.map((peer) => [peer.name, peer.action, peer.version, peer.source]),
    [
      ["three", "install", "0.186.1", "override"],
      ["@react-three/fiber", "install", "8.18.0", "exact-range"],
    ],
  );
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(target.package, "2.0.0", registry.registry).concat([
      "three@0.186.1",
      "@react-three/fiber@8.18.0",
    ]),
  );
  assert.deepEqual(result.plannedChanges[0].command.args, result.command.args);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

test("a missing non-exact selected peer fails closed before any spawn", async (t) => {
  const target = sceneTarget();
  const registry = createRegistry({
    packageName: target.package,
    versions: { "2.0.0": target },
  });
  const consumer = createConsumer(t, { packageName: target.package });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await installDesignSystem({
    cwd: consumer.root,
    package: target.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    withEntry: ["KeyboardScene"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "entry");
  assert.match(result.failures.join(" "), /pass --peer three@<exact-version>/);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

test("upgrade carries extension and entry requirement changes with selected peers", async (t) => {
  const from = structuredClone(systemAManifest);
  from.version = "1.1.0";
  addSyntheticExtension(from, {
    requirements: [{ name: "three", kind: "peer", range: "^0.180.0", optional: true }],
    effects: { features: ["3d"], rendering: "webgl", reducedMotion: true },
  });
  const to = structuredClone(from);
  to.version = "2.0.0";
  to.extensions.KeyboardScene.apiVersion = 2;
  to.extensions.KeyboardScene.effects = {
    features: ["3d", "motion"],
    rendering: "mixed",
    reducedMotion: true,
    fallback: "static",
  };
  to.entrypoints["./keyboard-scene"].requirements = [
    { name: "three", kind: "peer", range: "^0.186.0", optional: true },
    { name: "@react-three/fiber", kind: "peer", range: "8.18.0", optional: true },
  ];
  addSyntheticExtension(to, {
    name: "InteractiveWorkflowMap",
    entrypoint: "./workflow-map",
    requirements: [],
  });

  const registry = createRegistry({ packageName: from.package, versions: { "2.0.0": to } });
  const consumer = createConsumer(t, {
    packageName: from.package,
    manifest: from,
    connected: true,
  });
  const manager = makeManager();

  const result = await upgradeDesignSystem({
    cwd: consumer.root,
    package: from.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    withEntry: ["KeyboardScene"],
    peers: ["three@0.186.1"],
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.deepEqual(result.diff.extensions.added, ["InteractiveWorkflowMap"]);
  const extensionChange = result.diff.extensions.changed.find(
    (entry) => entry.name === "KeyboardScene",
  );
  assert.deepEqual(extensionChange.fields.apiVersion, { from: 1, to: 2 });
  assert.deepEqual(extensionChange.effects, {
    from: { features: ["3d"], rendering: "webgl", reducedMotion: true },
    to: { features: ["3d", "motion"], rendering: "mixed", reducedMotion: true, fallback: "static" },
  });
  assert.ok(result.diff.entrypoints.added.includes("./workflow-map"));
  const requirementChange = result.diff.entrypoints.changed.find(
    (entry) => entry.entrypoint === "./keyboard-scene",
  );
  assert.deepEqual(requirementChange.requirements.added, ["@react-three/fiber"]);
  assert.deepEqual(requirementChange.requirements.changed[0].name, "three");
  assert.ok(result.preview.some((line) => line === "extensions added: InteractiveWorkflowMap"));
  assert.ok(
    result.preview.some((line) => line === "entrypoint added: ./workflow-map"),
    result.preview.join("\n"),
  );
  assert.deepEqual(
    result.peers.map((peer) => [peer.name, peer.action, peer.version]),
    [
      ["three", "install", "0.186.1"],
      ["@react-three/fiber", "install", "8.18.0"],
    ],
  );
  assert.equal(result.entrySelection.entries[0].extension, "KeyboardScene");
  assert.equal(manager.calls.length, 0);
});

test("pnpm --with-entry dry-run appends peer specs to the fixed add command", async (t) => {
  const target = sceneTarget();
  const registry = createRegistry({
    packageName: target.package,
    versions: { "2.0.0": target },
  });
  const consumer = createConsumer(t, {
    packageName: target.package,
    packageManager: "pnpm@10.34.5",
  });
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await installDesignSystem({
    cwd: consumer.root,
    package: target.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    withEntry: ["KeyboardScene"],
    peers: ["three@0.186.1"],
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.manager, "pnpm");
  assert.deepEqual(result.command.args, [
    "add",
    "--save-prod",
    "--ignore-scripts",
    `--registry=${registry.registry}`,
    `${target.package}@2.0.0`,
    "three@0.186.1",
    "@react-three/fiber@8.18.0",
  ]);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});

test("--with-entry accepts a contained consumer file and selects the referenced extension", async (t) => {
  const target = sceneTarget();
  const registry = createRegistry({
    packageName: target.package,
    versions: { "2.0.0": target },
  });
  const consumer = createConsumer(t, { packageName: target.package });
  mkdirSync(join(consumer.root, "src"), { recursive: true });
  writeFileSync(
    join(consumer.root, "src", "scene.tsx"),
    `import { KeyboardScene } from "${target.package}/keyboard-scene";\n`,
    "utf8",
  );
  const manager = makeManager();
  const before = snapshot(consumer.root);

  const result = await installDesignSystem({
    cwd: consumer.root,
    package: target.package,
    version: "2.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    withEntry: ["src/scene.tsx"],
    peers: ["three@0.186.1"],
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.entrySelection.entries[0].kind, "path");
  assert.equal(result.entrySelection.entries[0].extension, "KeyboardScene");
  assert.deepEqual(
    result.peers.map((peer) => [peer.name, peer.action, peer.version]),
    [
      ["three", "install", "0.186.1"],
      ["@react-three/fiber", "install", "8.18.0"],
    ],
  );
  assert.equal(manager.calls.length, 0);
  assertUnchanged(consumer.root, before);
});
