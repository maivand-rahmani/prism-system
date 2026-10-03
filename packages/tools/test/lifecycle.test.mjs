#!/usr/bin/env node
/**
 * Standalone tests for the switch/remove lifecycle lane.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/lifecycle.test.mjs
 *
 * Everything here is offline and in-memory: a fake registry serves generated
 * tarballs, a fake package manager records (and never executes) the fixed
 * command, and each test works on a disposable temp consumer. No real package
 * manager, network, or design-system code is used.
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

import {
  buildConsumerConfig,
  buildManagedBlock,
  applyManagedBlock,
  renderConsumerAgents,
} from "../src/consumer.mjs";
import {
  buildLifecyclePlanMaterial,
  inspectDesignSystemUsage,
  removeDesignSystem,
  switchDesignSystem,
} from "../src/lifecycle.mjs";
import { addSyntheticExtension, readJson, syntheticManifest } from "./manifest-fixture.mjs";

const OLD_PACKAGE = "@prism-system/ui-switch-old";
const TARGET_PACKAGE = "@prism-system/ui-switch-target";
const OLD_VERSION = "1.1.0";
const TARGET_VERSION = "2.0.0";
const CONTRACT_VERSION = 4;

/* -------------------------------------------------------------------------- */
/* Manifest fixtures                                                          */
/* -------------------------------------------------------------------------- */

function buildOldManifest() {
  const manifest = syntheticManifest({
    id: "switch-old",
    version: OLD_VERSION,
    packageName: OLD_PACKAGE,
  });
  manifest.components.Button = {
    variants: ["primary", "secondary"],
    sizes: ["sm", "md"],
    members: [],
  };
  manifest.components.Alert = { variants: ["info"], sizes: [], members: ["Title", "Description"] };
  manifest.components.Grid = { variants: [], sizes: [], members: [] };
  manifest.tokens.names = { cssVariablePrefix: "maivand", tailwindUtilityPrefix: "prism" };
  manifest.tokens.groups.spacing = ["scale.4"];
  manifest.tokens.groups.themes = ["light.color.text.primary"];
  manifest.publicApi = {
    ".": ["Button", "Alert", "Grid", "DesignSystem", "oldTokens"],
    "./tokens": ["oldTokens"],
  };
  addSyntheticExtension(manifest, {
    name: "KeyboardScene",
    entrypoint: "./custom/keyboard-scene",
    target: "./dist/keyboard-scene/index.mjs",
  });
  return manifest;
}

function buildTargetManifest({ version = TARGET_VERSION, mutate = null } = {}) {
  const manifest = syntheticManifest({
    id: "switch-target",
    version,
    packageName: TARGET_PACKAGE,
  });
  manifest.components.Button = {
    variants: ["primary", "secondary", "outline"],
    sizes: ["sm", "md", "lg"],
    members: [],
  };
  manifest.components.Alert = {
    variants: ["info", "warning"],
    sizes: [],
    members: ["Title", "Description"],
  };
  manifest.components.Grid = { variants: [], sizes: [], members: [] };
  manifest.tokens.names = { cssVariablePrefix: "maivand", tailwindUtilityPrefix: "prism" };
  manifest.tokens.groups.spacing = ["scale.4"];
  manifest.tokens.groups.themes = ["light.color.text.primary"];
  manifest.publicApi = {
    ".": ["Button", "Alert", "Grid", "DesignSystem", "targetTokens"],
    "./tokens": ["targetTokens"],
  };
  addSyntheticExtension(manifest, {
    name: "KeyboardScene",
    entrypoint: "./custom/keyboard-scene",
    target: "./dist/keyboard-scene/index.mjs",
  });
  if (mutate !== null) mutate(manifest);
  return manifest;
}

/* -------------------------------------------------------------------------- */
/* In-memory tarballs and a fake registry                                     */
/* -------------------------------------------------------------------------- */

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
/* Consumer fixtures                                                          */
/* -------------------------------------------------------------------------- */

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

/** Install a fake design-system package (manifest + resolvable exports). */
function writeInstalled(root, manifest, { bridge = true } = {}) {
  const dir = join(root, "node_modules", ...manifest.package.split("/"));
  const exportsMap = {
    ".": "./dist/index.mjs",
    "./tokens": "./dist/tokens/index.mjs",
    "./manifest": "./design-system.json",
    "./package.json": "./package.json",
  };
  if (bridge) {
    exportsMap["./tailwind.css"] = "./dist/tailwind.css";
    exportsMap["./styles.css"] = "./dist/index.css";
  }
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target === "string" && exportsMap[key] === undefined) exportsMap[key] = target;
  }
  writeJson(join(dir, "package.json"), {
    name: manifest.package,
    version: manifest.version,
    exports: exportsMap,
  });
  writeJson(join(dir, "design-system.json"), manifest);
  mkdirSync(join(dir, "dist", "tokens"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.mjs"), "export {};\n", "utf8");
  writeFileSync(join(dir, "dist", "tokens", "index.mjs"), "export {};\n", "utf8");
  if (bridge) {
    writeFileSync(join(dir, "dist", "tailwind.css"), "/* tailwind */\n", "utf8");
    writeFileSync(join(dir, "dist", "index.css"), "/* styles */\n", "utf8");
  }
  return dir;
}

function createConsumer(
  t,
  {
    oldManifest = buildOldManifest(),
    source = {},
    css = null,
    connected = true,
    configOverride,
    rootAgents = null,
    extraDependencies = {},
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "prism-lifecycle-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    packageManager: "npm@10.0.0",
    dependencies: { [oldManifest.package]: `^${oldManifest.version}`, ...extraDependencies },
  });

  if (connected) {
    if (typeof configOverride === "string") {
      writeFile(root, join(".design-system", "config.json"), configOverride);
    } else if (configOverride === null) {
      // no config file
    } else if (configOverride !== undefined) {
      writeJson(join(root, ".design-system", "config.json"), configOverride);
    } else {
      writeJson(
        join(root, ".design-system", "config.json"),
        buildConsumerConfig({
          packageName: oldManifest.package,
          version: oldManifest.version,
          strict: true,
          ignore: [],
        }),
      );
    }
  }

  writeInstalled(root, oldManifest, { bridge: true });
  for (const [relative, content] of Object.entries(source)) writeFile(root, relative, content);
  if (css !== null) writeFile(root, "src/app.css", css);
  if (rootAgents !== null) writeFile(root, "AGENTS.md", rootAgents);
  return root;
}

/** Generated `.design-system/AGENTS.md` content for the old system. */
function generatedConsumerAgents(manifest, strict = true) {
  return renderConsumerAgents({
    packageName: manifest.package,
    version: manifest.version,
    strict,
    contractVersion: CONTRACT_VERSION,
  });
}

function generatedRootAgents(userContent, manifest, strict = true) {
  return applyManagedBlock(
    userContent,
    buildManagedBlock({
      packageName: manifest.package,
      version: manifest.version,
      strict,
      contractVersion: CONTRACT_VERSION,
    }),
  );
}

/** A fake package manager that records calls and never executes anything. */
function makeManager({ onSpawn, status = 0 } = {}) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    if (onSpawn) onSpawn();
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

const APP_TSX = [
  `import { Button, Alert } from "${OLD_PACKAGE}";`,
  `import { KeyboardScene } from "${OLD_PACKAGE}/custom/keyboard-scene";`,
  "",
  "export function App() {",
  "  return (",
  "    <>",
  '      <Button variant="primary" size="sm" className="text-prism-text-primary" />',
  "      <KeyboardScene />",
  "      <Alert>",
  "        <Alert.Title>Hello</Alert.Title>",
  "      </Alert>",
  "    </>",
  "  );",
  "}",
  "",
].join("\n");

/** A consumer source that imports only the custom extension. */
const SCENE_TSX = [
  `import { KeyboardScene } from "${OLD_PACKAGE}/custom/keyboard-scene";`,
  "",
  "export function Scene() {",
  "  return <KeyboardScene />;",
  "}",
  "",
].join("\n");

const SCENE_PEER = "three";
const SCENE_PEER_VERSION = "0.160.0";

/** Target manifest whose KeyboardScene entry declares one required peer. */
function buildScenePeerTarget({ range }) {
  return buildTargetManifest({
    mutate: (manifest) => {
      manifest.entrypoints["./custom/keyboard-scene"] = {
        requirements: [{ name: SCENE_PEER, kind: "peer", range, optional: false }],
      };
    },
  });
}

/** Install a fake peer package that Node resolution can find from the root. */
function writeInstalledPeer(root, name, version) {
  writeJson(join(root, "node_modules", ...name.split("/"), "package.json"), {
    name,
    version,
  });
}

/* -------------------------------------------------------------------------- */
/* switch -- dry run                                                          */
/* -------------------------------------------------------------------------- */

test("switch --dry-run plans exact dependency, source, and connect bytes without spawning or writing", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager();
  const before = snapshot(root);

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, "dry-run");
  assert.equal(result.from.package, OLD_PACKAGE);
  assert.equal(result.from.version, OLD_VERSION);
  assert.equal(result.to.package, TARGET_PACKAGE);
  assert.equal(result.to.version, TARGET_VERSION);
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(TARGET_PACKAGE, TARGET_VERSION, registry.registry),
  );
  assert.deepEqual(result.compatibility.blockers, []);

  const kinds = result.plannedChanges.map((change) => change.kind);
  assert.deepEqual(kinds, ["dependency", "source", "connect", "connect", "connect"]);

  const sourceChange = result.plannedChanges.find((change) => change.kind === "source");
  assert.equal(sourceChange.path, join(root, "src", "app.tsx"));
  assert.equal(sourceChange.before, APP_TSX);
  assert.ok(sourceChange.after.includes(`from "${TARGET_PACKAGE}"`));
  assert.ok(sourceChange.after.includes(`from "${TARGET_PACKAGE}/custom/keyboard-scene"`));
  assert.ok(!sourceChange.after.includes(OLD_PACKAGE));
  assert.equal(sourceChange.changed, true);

  const configChange = result.plannedChanges.find(
    (change) => change.kind === "connect" && change.fileKind === "config",
  );
  assert.match(configChange.before, /"version": "1\.1\.0"/);
  assert.match(configChange.after, /"version": "2\.0\.0"/);
  assert.match(configChange.after, new RegExp(TARGET_PACKAGE.replace(/[/@]/g, "\\$&")));

  // The old dependency is deliberately retained, and appearance is unknown.
  const warningCodes = result.compatibility.warnings.map((warning) => warning.code);
  assert.ok(warningCodes.includes("old-dependency-retained"));
  assert.ok(warningCodes.includes("appearance-unknown"));
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
});

test("switch --dry-run is byte-identical across runs", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager();

  const first = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });
  const second = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });
  assert.deepEqual(second.plannedChanges, first.plannedChanges);
});

/* -------------------------------------------------------------------------- */
/* switch -- real run                                                         */
/* -------------------------------------------------------------------------- */

test("switch installs the target, rewrites exact specifiers, reconnects, and keeps the old dependency", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager({ onSpawn: () => writeInstalled(root, target, { bridge: true }) });

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.changed, true);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(TARGET_PACKAGE, TARGET_VERSION, registry.registry),
  );

  const source = readFileSync(join(root, "src", "app.tsx"), "utf8");
  assert.ok(source.includes(`from "${TARGET_PACKAGE}"`));
  assert.ok(source.includes(`from "${TARGET_PACKAGE}/custom/keyboard-scene"`));
  assert.ok(!source.includes(OLD_PACKAGE));

  const config = readJson(join(root, ".design-system", "config.json"));
  assert.equal(config.package, TARGET_PACKAGE);
  assert.equal(config.version, TARGET_VERSION);

  const packageJson = readJson(join(root, "package.json"));
  assert.equal(packageJson.dependencies[OLD_PACKAGE], `^${OLD_VERSION}`);
  assert.equal(typeof packageJson.dependencies[TARGET_PACKAGE], "undefined");

  const rootAgents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.ok(rootAgents.includes(TARGET_PACKAGE));
  assert.ok(rootAgents.includes("## Design system (managed)"));
});

test("switch to the same package/version rewrites nothing", async (t) => {
  const oldManifest = buildOldManifest();
  const target = buildOldManifest();
  const registry = createRegistry({
    packageName: OLD_PACKAGE,
    versions: { [OLD_VERSION]: target },
  });
  const root = createConsumer(t, { oldManifest, source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager({ onSpawn: () => writeInstalled(root, target, { bridge: true }) });

  const result = await switchDesignSystem({
    cwd: root,
    package: OLD_PACKAGE,
    version: OLD_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.changed, true, "the manager still ran");
  assert.equal(readFileSync(join(root, "src", "app.tsx"), "utf8"), APP_TSX);
  assert.deepEqual(
    result.plannedChanges.filter((change) => change.kind === "source"),
    [],
    "a same-package switch plans no source rewrite",
  );
  assert.equal(
    readFileSync(join(root, ".design-system", "config.json"), "utf8").includes(OLD_VERSION),
    true,
  );
});

/* -------------------------------------------------------------------------- */
/* switch -- entries selected from verified active usage                      */
/* -------------------------------------------------------------------------- */

test("switch fails closed when an imported extension needs a missing non-exact peer", async (t) => {
  const target = buildScenePeerTarget({ range: ">=0.150.0 <1" });
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/scene.tsx": SCENE_TSX } });
  const manager = makeManager();
  const before = snapshot(root);

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "entry");
  assert.equal(result.reason, "entry-plan-failed");
  assert.match(result.failures.join(" "), /--peer three@<exact-version>/);
  assert.deepEqual(result.autoSelectedEntries, [
    {
      name: "KeyboardScene",
      entrypoint: "./custom/keyboard-scene",
      source: "active-usage",
      file: "src/scene.tsx",
      line: 4,
    },
  ]);
  assert.equal(manager.calls.length, 0, "no package manager is spawned");
  assertUnchanged(root, before);
});

test("switch auto-selects an imported extension and plans an exact --peer override", async (t) => {
  const target = buildScenePeerTarget({ range: ">=0.150.0 <1" });
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/scene.tsx": SCENE_TSX } });
  const manager = makeManager();

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    peers: [`${SCENE_PEER}@${SCENE_PEER_VERSION}`],
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  const peer = result.peers.find((entry) => entry.name === SCENE_PEER);
  assert.equal(peer.action, "install");
  assert.equal(peer.version, SCENE_PEER_VERSION);
  assert.equal(peer.source, "override");
  assert.deepEqual(
    result.command.args,
    [
      ...INSTALL_ARGS(TARGET_PACKAGE, TARGET_VERSION, registry.registry),
      `${SCENE_PEER}@${SCENE_PEER_VERSION}`,
    ],
    "the peer is installed through the fixed command with no user-supplied arguments",
  );
  assert.deepEqual(
    result.autoSelectedEntries.map((entry) => entry.name),
    ["KeyboardScene"],
  );
  assert.equal(result.autoSelectedEntries[0].source, "active-usage");
  assert.deepEqual(
    result.planMaterial.options.withEntry,
    [],
    "an automatic entry is never recorded as an explicit --with-entry option",
  );
  assert.equal(
    result.entrySelection.requested.filter((entry) => entry === "KeyboardScene").length,
    1,
    "the automatic entry appears exactly once",
  );
  assert.equal(
    result.entrySelection.entries.filter((entry) => entry.extension === "KeyboardScene").length,
    1,
    "the extension is selected exactly once",
  );
  assert.equal(manager.calls.length, 0);
});

test("switch retains an already installed peer satisfying the imported extension", async (t) => {
  const target = buildScenePeerTarget({ range: ">=0.150.0 <1" });
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/scene.tsx": SCENE_TSX } });
  writeInstalledPeer(root, SCENE_PEER, SCENE_PEER_VERSION);
  const manager = makeManager();

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  const peer = result.peers.find((entry) => entry.name === SCENE_PEER);
  assert.equal(peer.action, "retain");
  assert.equal(peer.version, SCENE_PEER_VERSION);
  assert.equal(peer.installed, SCENE_PEER_VERSION);
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(TARGET_PACKAGE, TARGET_VERSION, registry.registry),
  );
  assert.deepEqual(
    result.autoSelectedEntries.map((entry) => entry.name),
    ["KeyboardScene"],
  );
  assert.equal(manager.calls.length, 0);
});

test("switch plans an exact declared peer range for an imported extension", async (t) => {
  const target = buildScenePeerTarget({ range: SCENE_PEER_VERSION });
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/scene.tsx": SCENE_TSX } });
  const manager = makeManager();

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  const peer = result.peers.find((entry) => entry.name === SCENE_PEER);
  assert.equal(peer.action, "install");
  assert.equal(peer.source, "exact-range");
  assert.equal(peer.version, SCENE_PEER_VERSION);
  assert.deepEqual(result.command.args, [
    ...INSTALL_ARGS(TARGET_PACKAGE, TARGET_VERSION, registry.registry),
    `${SCENE_PEER}@${SCENE_PEER_VERSION}`,
  ]);
  assert.deepEqual(
    result.autoSelectedEntries.map((entry) => entry.name),
    ["KeyboardScene"],
  );
  assert.equal(manager.calls.length, 0);
});

test("switch honors explicit --with-entry without an import and never double-selects", async (t) => {
  const target = buildScenePeerTarget({ range: ">=0.150.0 <1" });
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });

  const explicitRoot = createConsumer(t, {
    source: { "src/app.tsx": "export const x = 1;\n" },
  });
  const explicitManager = makeManager();
  const explicitOnly = await switchDesignSystem({
    cwd: explicitRoot,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: explicitManager.spawnImpl,
    dryRun: true,
    withEntry: ["KeyboardScene", "KeyboardScene"],
    peers: [`${SCENE_PEER}@${SCENE_PEER_VERSION}`],
  });
  assert.equal(explicitOnly.ok, true, explicitOnly.failures?.join(" "));
  assert.deepEqual(
    explicitOnly.autoSelectedEntries,
    [],
    "an explicit entry is never claimed as automatic",
  );
  assert.deepEqual(explicitOnly.planMaterial.options.withEntry, ["KeyboardScene"]);
  assert.deepEqual(explicitOnly.entrySelection.requested, ["KeyboardScene"]);
  assert.equal(explicitOnly.entrySelection.entries.length, 1);
  assert.equal(explicitOnly.entrySelection.entries[0].kind, "extension");
  assert.equal(explicitManager.calls.length, 0);

  const mergedRoot = createConsumer(t, { source: { "src/scene.tsx": SCENE_TSX } });
  const mergedManager = makeManager();
  const merged = await switchDesignSystem({
    cwd: mergedRoot,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: mergedManager.spawnImpl,
    dryRun: true,
    withEntry: ["KeyboardScene"],
    peers: [`${SCENE_PEER}@${SCENE_PEER_VERSION}`],
  });
  assert.equal(merged.ok, true, merged.failures?.join(" "));
  assert.deepEqual(merged.autoSelectedEntries, []);
  assert.deepEqual(merged.entrySelection.requested, ["KeyboardScene"]);
  assert.equal(merged.entrySelection.entries.length, 1, "explicit and automatic selection merge");
  assert.equal(mergedManager.calls.length, 0);
});

test("switch expectedPlan rejects a removed imported extension before spawning", async (t) => {
  const target = buildScenePeerTarget({ range: SCENE_PEER_VERSION });
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/scene.tsx": SCENE_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });
  assert.deepEqual(
    preview.autoSelectedEntries.map((entry) => entry.name),
    ["KeyboardScene"],
  );
  assert.deepEqual(
    preview.peers.map((peer) => `${peer.name}:${peer.action}:${peer.version}`),
    [`${SCENE_PEER}:install:${SCENE_PEER_VERSION}`],
  );

  writeFileSync(join(root, "src", "scene.tsx"), "export const x = 1;\n", "utf8");
  const before = snapshot(root);
  const manager = makeManager();
  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });

  assertSwitchPlanDrift({ result, manager, root, before });
  assert.match(result.failures.join(" "), /selected entry changed/);
});

test("switch expectedPlan rejects changed peer state before spawning", async (t) => {
  const target = buildScenePeerTarget({ range: SCENE_PEER_VERSION });
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/scene.tsx": SCENE_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });
  assert.ok(
    preview.command.args.includes(`${SCENE_PEER}@${SCENE_PEER_VERSION}`),
    "the preview plans the exact peer install",
  );

  writeInstalledPeer(root, SCENE_PEER, SCENE_PEER_VERSION);
  const before = snapshot(root);
  const manager = makeManager();
  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });

  assertSwitchPlanDrift({ result, manager, root, before });
  assert.match(result.failures.join(" "), /planned peers changed|package-manager command changed/);
});

/* -------------------------------------------------------------------------- */
/* switch -- compatibility blockers                                           */
/* -------------------------------------------------------------------------- */

async function blockedSwitch(t, { target, source, css = null, oldManifest = buildOldManifest() }) {
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { oldManifest, source, css });
  const manager = makeManager();
  const before = snapshot(root);
  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    ...(css === null ? {} : { cssPath: "src/app.css" }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.boundary, "compatibility");
  assert.equal(result.reason, "incompatible-usage");
  assert.deepEqual(result.plannedChanges, []);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
  return result;
}

test("switch blocks a used optional component missing from the target", async (t) => {
  const result = await blockedSwitch(t, {
    target: buildTargetManifest({ mutate: (manifest) => delete manifest.components.Grid }),
    source: {
      "src/app.tsx": [
        `import { Grid } from "${OLD_PACKAGE}";`,
        "export const X = <Grid />;",
        "",
      ].join("\n"),
    },
  });
  assert.ok(result.compatibility.blockers.some((blocker) => blocker.code === "missing-component"));
  assert.match(result.failures.join(" "), /Grid/);
});

test("switch blocks used variants, sizes, and compound members missing from the target", async (t) => {
  const result = await blockedSwitch(t, {
    target: buildTargetManifest({
      mutate: (manifest) => {
        manifest.components.Button.variants = ["primary"];
        manifest.components.Button.sizes = ["sm"];
        manifest.components.Alert.members = ["Title"];
      },
    }),
    source: {
      "src/app.tsx": [
        `import { Button, Alert } from "${OLD_PACKAGE}";`,
        "export const X = (",
        '  <Button variant="secondary" size="md">',
        "    <Alert.Description />",
        "  </Button>",
        ");",
        "",
      ].join("\n"),
    },
  });
  const codes = result.compatibility.blockers.map((blocker) => blocker.code).sort();
  assert.deepEqual(codes, ["missing-member", "missing-size", "missing-variant"]);
});

test("switch blocks a used extension missing from the target", async (t) => {
  const result = await blockedSwitch(t, {
    target: buildTargetManifest({
      mutate: (manifest) => {
        delete manifest.extensions;
      },
    }),
    source: {
      "src/scene.tsx": [
        `import { KeyboardScene } from "${OLD_PACKAGE}/custom/keyboard-scene";`,
        "export const X = <KeyboardScene />;",
        "",
      ].join("\n"),
    },
  });
  assert.ok(result.compatibility.blockers.some((blocker) => blocker.code === "missing-extension"));
});

test("switch blocks a used token missing from the target and a renamed token reference", async (t) => {
  const missing = await blockedSwitch(t, {
    target: buildTargetManifest({
      mutate: (manifest) => {
        manifest.tokens.groups.themes = [];
      },
    }),
    source: {
      "src/theme.ts": 'export const color = "var(--maivand-color-text-primary)";\n',
    },
  });
  assert.ok(missing.compatibility.blockers.some((blocker) => blocker.code === "missing-token"));

  const renamed = await blockedSwitch(t, {
    target: buildTargetManifest({
      mutate: (manifest) => {
        manifest.tokens.names.cssVariablePrefix = "other";
      },
    }),
    source: {
      "src/theme.ts": 'export const color = "var(--maivand-color-text-primary)";\n',
    },
  });
  assert.ok(
    renamed.compatibility.blockers.some((blocker) => blocker.code === "renamed-token-reference"),
  );
});

test("switch blocks a missing named export (token object renamed across systems)", async (t) => {
  const result = await blockedSwitch(t, {
    target: buildTargetManifest(),
    source: {
      "src/tokens.ts": [
        `import { oldTokens } from "${OLD_PACKAGE}/tokens";`,
        "export const spacing = oldTokens.spacing;",
        "",
      ].join("\n"),
    },
  });
  assert.ok(
    result.compatibility.blockers.some((blocker) => blocker.code === "missing-named-export"),
  );
});

test("switch blocks dynamic and spread usage instead of claiming compatibility", async (t) => {
  const result = await blockedSwitch(t, {
    target: buildTargetManifest(),
    source: {
      "src/dynamic.tsx": [
        `import { Button } from "${OLD_PACKAGE}";`,
        'const mode = "primary";',
        "const mod = import(`@prism-system/ui-switch-old/${mode}`);",
        "export const X = <Button variant={mode} {...props} />;",
        "",
      ].join("\n"),
    },
  });
  const codes = result.compatibility.blockers.map((blocker) => blocker.code).sort();
  assert.deepEqual(codes, ["dynamic-module", "dynamic-variant", "spread-props"]);
});

test("switch blocks an undeclared public path and a missing public path", async (t) => {
  const undeclared = await blockedSwitch(t, {
    target: buildTargetManifest(),
    source: {
      "src/app.ts": `import "${OLD_PACKAGE}/internal/secret";\n`,
    },
  });
  assert.ok(
    undeclared.compatibility.blockers.some((blocker) => blocker.code === "undeclared-public-path"),
  );

  const missing = await blockedSwitch(t, {
    target: buildTargetManifest({
      mutate: (manifest) => {
        delete manifest.entrypoints["./custom/keyboard-scene"];
        delete manifest.exports["./custom/keyboard-scene"];
        delete manifest.publicApi["./custom/keyboard-scene"];
        delete manifest.extensions;
      },
    }),
    source: {
      "src/scene.tsx": `import { KeyboardScene } from "${OLD_PACKAGE}/custom/keyboard-scene";\n`,
    },
  });
  assert.ok(
    missing.compatibility.blockers.some((blocker) => blocker.code === "missing-public-path"),
  );
});

test("switch blocks an unsupported framework file that references the package", async (t) => {
  const result = await blockedSwitch(t, {
    target: buildTargetManifest(),
    source: {
      "src/App.vue": `<script>import { Button } from "${OLD_PACKAGE}";</script>\n`,
    },
  });
  assert.ok(
    result.compatibility.blockers.some((blocker) => blocker.code === "unsupported-source-file"),
  );
});

test("switch blocks active usage in an explicitly named CSS file", async (t) => {
  const result = await blockedSwitch(t, {
    target: buildTargetManifest({
      mutate: (manifest) => {
        manifest.tokens.groups.themes = [];
      },
    }),
    source: {},
    css: ".x { color: var(--maivand-color-text-primary); }\n",
  });
  assert.ok(result.compatibility.blockers.some((blocker) => blocker.code === "missing-token"));
});

/* -------------------------------------------------------------------------- */
/* switch -- consent and preconditions                                        */
/* -------------------------------------------------------------------------- */

test("switch without confirmation returns the plan and never spawns or writes", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager();
  const before = snapshot(root);

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "confirmation-required");
  assert.equal(result.reason, "confirmation-required");
  assert.ok(result.plannedChanges.length > 1);
  assert.match(result.failures.join(" "), /--yes/);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
});

test("switch fails closed on drift while the manager runs and writes nothing", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const injected = `${APP_TSX}// injected while the manager ran\n`;
  const manager = makeManager({
    onSpawn: () => {
      writeInstalled(root, target, { bridge: true });
      writeFileSync(join(root, "src", "app.tsx"), injected, "utf8");
    },
  });

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "precondition");
  assert.equal(result.reason, "drift-after-install");
  assert.match(result.note, /no files were written/i);
  assert.equal(manager.calls.length, 1);
  assert.equal(readFileSync(join(root, "src", "app.tsx"), "utf8"), injected);
  assert.equal(existsSync(join(root, ".design-system", "config.json")), true);
  assert.match(
    readFileSync(join(root, ".design-system", "config.json"), "utf8"),
    /"version": "1\.1\.0"/,
  );
});

test("switch makes no file changes when the manager fails", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager({ status: 1 });
  const before = snapshot(root);

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "manager");
  assert.match(result.note, /No rollback was attempted/);
  assert.equal(manager.calls.length, 1);
  assertUnchanged(root, before);
});

test("switch makes no file changes when the target cannot be verified after install", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager();
  const before = snapshot(root);

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "verify");
  assert.equal(manager.calls.length, 1);
  assertUnchanged(root, before);
});

test("switch rolls back its own file writes when a write fails and keeps the install", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager({ onSpawn: () => writeInstalled(root, target, { bridge: true }) });
  let writes = 0;
  const writeImpl = (path, content) => {
    writes += 1;
    if (writes === 2) throw new Error("disk full");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  };

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    writeImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "write");
  assert.equal(result.written.length, 1);
  assert.deepEqual(result.rolledBack, result.written);
  assert.equal(readFileSync(join(root, "src", "app.tsx"), "utf8"), APP_TSX);
  assert.match(
    readFileSync(join(root, ".design-system", "config.json"), "utf8"),
    /"version": "1\.1\.0"/,
  );
  assert.match(result.note, /No rollback of the package manager was attempted/);
});

test("switch reports a postcheck failure when written bytes do not match the plan", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const manager = makeManager({ onSpawn: () => writeInstalled(root, target, { bridge: true }) });
  const writeImpl = (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${content}// corrupted after write\n`, "utf8");
  };

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: TARGET_VERSION,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    writeImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "postcheck");
  assert.equal(result.reason, "postcheck-failed");
  assert.ok(result.written.length >= 1);
  assert.match(result.failures.join(" "), /does not match the planned bytes/);
  assert.match(result.note, /no automatic rollback was attempted/i);
});

/* -------------------------------------------------------------------------- */
/* inspectDesignSystemUsage                                                   */
/* -------------------------------------------------------------------------- */

test("inspectDesignSystemUsage reports active usage read-only", (t) => {
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const before = snapshot(root);

  const result = inspectDesignSystemUsage({ cwd: root });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.package, OLD_PACKAGE);
  assert.equal(result.version, OLD_VERSION);
  assert.equal(result.usage.counts.components, 2);
  assert.equal(result.usage.counts.extensions, 1);
  assert.match(result.summary, /active usage/);
  assertUnchanged(root, before);
});

/* -------------------------------------------------------------------------- */
/* remove                                                                     */
/* -------------------------------------------------------------------------- */

const USER_CSS = [
  "/* product */",
  "body { margin: 0; }",
  `@import "${OLD_PACKAGE}/tailwind.css";`,
  `@import "${OLD_PACKAGE}/styles.css";`,
  '@import "tailwindcss";',
  "",
].join("\n");

/** User CSS without any selected-package bridge imports. */
const UNRELATED_CSS = ["/* product */", "body { margin: 0; }", '@import "tailwindcss";', ""].join(
  "\n",
);

function removeConsumer(t, options = {}) {
  const oldManifest = options.oldManifest ?? buildOldManifest();
  return createConsumer(t, {
    oldManifest,
    source: options.source ?? {},
    css: options.css ?? null,
    rootAgents:
      options.rootAgents === undefined
        ? generatedRootAgents("# Project\n\nSome user instructions.\n", oldManifest)
        : options.rootAgents,
    configOverride: options.configOverride,
    extraDependencies: options.extraDependencies ?? { react: "^19.0.0" },
  });
}

/** Fake manager that removes the dependency from package.json and node_modules. */
function removeOnSpawn(root, packageName) {
  return () => {
    const packageJson = readJson(join(root, "package.json"));
    delete packageJson.dependencies[packageName];
    writeJson(join(root, "package.json"), packageJson);
    rmSync(join(root, "node_modules", ...packageName.split("/")), {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  };
}

test("remove --dry-run fails closed on unmarked bridge imports without spawning or writing", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: USER_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const manager = makeManager();
  const before = snapshot(root);

  const result = removeDesignSystem({
    cwd: root,
    cssPath: "src/app.css",
    dryRun: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "css-ownership");
  assert.equal(result.reason, "unattributable-css-imports");
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.plannedChanges, []);
  assert.ok(
    result.compatibility.blockers.some((blocker) => blocker.code === "unattributable-css-imports"),
  );
  assert.match(result.failures.join(" "), /cannot be proven tool-managed/);
  assert.match(result.failures.join(" "), /manually/);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
});

test("remove --dry-run plans generated removals while leaving unrelated CSS byte-identical", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: UNRELATED_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const manager = makeManager();
  const before = snapshot(root);

  const result = removeDesignSystem({
    cwd: root,
    cssPath: "src/app.css",
    dryRun: true,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, "dry-run");
  assert.equal(result.package, OLD_PACKAGE);
  assert.deepEqual(result.command.args, ["uninstall", OLD_PACKAGE, "--ignore-scripts"]);
  assert.deepEqual(
    result.plannedChanges.map((change) => change.kind),
    ["dependency", "file", "file", "file", "css", "directory"],
  );
  const cssChange = result.plannedChanges.find((change) => change.kind === "css");
  assert.equal(cssChange.changed, false);
  assert.equal(cssChange.after, UNRELATED_CSS);
  assert.ok(
    result.compatibility.warnings.some((warning) => warning.code === "css-bridge-not-found"),
  );
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
});

test("remove refuses to uninstall while unmarked bridge imports remain in the named CSS file", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: USER_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const manager = makeManager({ onSpawn: removeOnSpawn(root, OLD_PACKAGE) });
  const before = snapshot(root);

  const result = removeDesignSystem({
    cwd: root,
    cssPath: "src/app.css",
    confirmed: true,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "css-ownership");
  assert.equal(result.reason, "unattributable-css-imports");
  assert.deepEqual(result.plannedChanges, []);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
  assert.equal(readFileSync(join(root, "src", "app.css"), "utf8"), USER_CSS);
});

test("remove without --css leaves a CSS file with bridge imports untouched and does not block", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: USER_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const manager = makeManager({ onSpawn: removeOnSpawn(root, OLD_PACKAGE) });

  const result = removeDesignSystem({ cwd: root, confirmed: true, spawnImpl: manager.spawnImpl });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(manager.calls.length, 1);
  assert.equal(readFileSync(join(root, "src", "app.css"), "utf8"), USER_CSS);
  assert.equal(result.removed.css, false);
  const coverageWarning = result.compatibility.warnings.find(
    (warning) => warning.code === "css-not-inspected",
  );
  assert.ok(coverageWarning, "remove without --css must report that CSS was not inspected");
  assert.match(coverageWarning.message, /No CSS file was inspected/);
  assert.match(coverageWarning.message, /CSS is left unchanged/);
  assert.match(coverageWarning.message, /--css <file>/);
});

test("remove uninstalls and deletes only generated files, preserving unrelated deps and CSS bytes", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: UNRELATED_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const manager = makeManager({ onSpawn: removeOnSpawn(root, OLD_PACKAGE) });

  const result = removeDesignSystem({
    cwd: root,
    cssPath: "src/app.css",
    confirmed: true,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.changed, true);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(result.command.args, ["uninstall", OLD_PACKAGE, "--ignore-scripts"]);
  assert.equal(result.directoryRemoved, true);

  assert.equal(existsSync(join(root, ".design-system")), false);
  assert.equal(
    readFileSync(join(root, "AGENTS.md"), "utf8"),
    "# Project\n\nSome user instructions.\n",
  );
  assert.equal(readFileSync(join(root, "src", "app.css"), "utf8"), UNRELATED_CSS);
  assert.equal(result.removed.css, false);

  const packageJson = readJson(join(root, "package.json"));
  assert.equal(typeof packageJson.dependencies[OLD_PACKAGE], "undefined");
  assert.equal(packageJson.dependencies.react, "^19.0.0");
  assert.deepEqual(result.preserved, []);
});

test("remove blocks when the package is still actively imported", (t) => {
  const root = removeConsumer(t, { source: { "src/app.tsx": APP_TSX }, css: UNRELATED_CSS });
  const manager = makeManager();
  const before = snapshot(root);

  const result = removeDesignSystem({
    cwd: root,
    cssPath: "src/app.css",
    confirmed: true,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "usage");
  assert.equal(result.reason, "active-usage");
  assert.ok(result.compatibility.blockers.some((blocker) => blocker.code === "active-import"));
  assert.match(result.failures.join(" "), /src\/app\.tsx/);
  assert.deepEqual(result.plannedChanges, []);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
});

test("remove blocks when a known token name is still referenced", (t) => {
  const root = removeConsumer(t, {
    source: { "src/theme.ts": 'export const color = "var(--maivand-color-text-primary)";\n' },
  });
  const manager = makeManager();

  const result = removeDesignSystem({
    cwd: root,
    confirmed: true,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "usage");
  assert.ok(
    result.compatibility.blockers.some((blocker) => blocker.code === "active-token-reference"),
  );
  assert.equal(manager.calls.length, 0);
});

test("remove preserves an edited generated config and reports the leftover", (t) => {
  const oldManifest = buildOldManifest();
  const edited = `${JSON.stringify(
    {
      ...buildConsumerConfig({
        packageName: OLD_PACKAGE,
        version: OLD_VERSION,
        strict: true,
        ignore: [],
      }),
      extra: true,
    },
    null,
    2,
  )}\n`;
  const root = removeConsumer(t, { configOverride: edited });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const manager = makeManager({ onSpawn: removeOnSpawn(root, OLD_PACKAGE) });

  const result = removeDesignSystem({ cwd: root, confirmed: true, spawnImpl: manager.spawnImpl });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(existsSync(join(root, ".design-system", "config.json")), true);
  assert.equal(readFileSync(join(root, ".design-system", "config.json"), "utf8"), edited);
  assert.equal(existsSync(join(root, ".design-system", "AGENTS.md")), false);
  assert.equal(existsSync(join(root, ".design-system")), true);
  assert.ok(result.preserved.some((entry) => entry.reason === "edited-generated-file"));
  assert.equal(result.directoryRemoved, false);
});

test("remove preserves an edited generated .design-system/AGENTS.md", (t) => {
  const oldManifest = buildOldManifest();
  const editedAgents = `${generatedConsumerAgents(oldManifest)}\n<!-- user note -->\n`;
  const root = removeConsumer(t);
  writeFile(root, join(".design-system", "AGENTS.md"), editedAgents);
  const manager = makeManager({ onSpawn: removeOnSpawn(root, OLD_PACKAGE) });

  const result = removeDesignSystem({ cwd: root, confirmed: true, spawnImpl: manager.spawnImpl });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(existsSync(join(root, ".design-system", "config.json")), false);
  assert.equal(readFileSync(join(root, ".design-system", "AGENTS.md"), "utf8"), editedAgents);
  assert.ok(result.preserved.some((entry) => entry.reason === "edited-generated-file"));
  assert.equal(result.directoryRemoved, false);
});

test("remove preserves malformed managed markers without guessing", (t) => {
  const root = removeConsumer(t, {
    rootAgents: "# User\n<!-- BEGIN @prism-system design system contract (managed) -->\nno end\n",
  });
  const manager = makeManager({ onSpawn: removeOnSpawn(root, OLD_PACKAGE) });

  const result = removeDesignSystem({ cwd: root, confirmed: true, spawnImpl: manager.spawnImpl });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(
    readFileSync(join(root, "AGENTS.md"), "utf8"),
    "# User\n<!-- BEGIN @prism-system design system contract (managed) -->\nno end\n",
  );
  assert.ok(result.preserved.some((entry) => entry.reason === "malformed-managed-markers"));
});

test("remove without confirmation returns the plan and never spawns or writes", (t) => {
  const root = removeConsumer(t);
  const manager = makeManager();
  const before = snapshot(root);

  const result = removeDesignSystem({ cwd: root, confirmed: false, spawnImpl: manager.spawnImpl });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "confirmation-required");
  assert.ok(result.plannedChanges.length > 1);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
});

test("remove makes no file changes when the manager fails", (t) => {
  const root = removeConsumer(t);
  const manager = makeManager({ status: 1 });
  const before = snapshot(root);

  const result = removeDesignSystem({ cwd: root, confirmed: true, spawnImpl: manager.spawnImpl });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "manager");
  assert.equal(manager.calls.length, 1);
  assertUnchanged(root, before);
});

test("remove reports a stale resolved dependency after the manager exits without writing files", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: UNRELATED_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const manager = makeManager({
    onSpawn: () => {
      const packageJson = readJson(join(root, "package.json"));
      delete packageJson.dependencies[OLD_PACKAGE];
      writeJson(join(root, "package.json"), packageJson);
      // node_modules is intentionally left behind (a stale pnpm symlink).
    },
  });
  const configBefore = readFileSync(join(root, ".design-system", "config.json"), "utf8");
  const cssBefore = readFileSync(join(root, "src", "app.css"), "utf8");

  const result = removeDesignSystem({ cwd: root, confirmed: true, spawnImpl: manager.spawnImpl });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "verify");
  assert.match(result.failures.join(" "), /stale pnpm symlink/);
  // No generated files were removed or written.
  assert.equal(readFileSync(join(root, ".design-system", "config.json"), "utf8"), configBefore);
  assert.equal(readFileSync(join(root, "src", "app.css"), "utf8"), cssBefore);
  assert.equal(existsSync(join(root, ".design-system", "AGENTS.md")), true);
});

test("remove fails closed on drift after the manager runs", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: UNRELATED_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const injected = "/* injected */\n";
  const manager = makeManager({
    onSpawn: () => {
      removeOnSpawn(root, OLD_PACKAGE)();
      writeFileSync(join(root, "src", "app.css"), injected, "utf8");
    },
  });

  const result = removeDesignSystem({
    cwd: root,
    cssPath: "src/app.css",
    confirmed: true,
    spawnImpl: manager.spawnImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "precondition");
  assert.equal(result.reason, "drift-after-remove");
  assert.equal(readFileSync(join(root, "src", "app.css"), "utf8"), injected);
  assert.equal(existsSync(join(root, ".design-system", "config.json")), true);
});

/* -------------------------------------------------------------------------- */
/* expectedPlan execution precondition                                        */
/* -------------------------------------------------------------------------- */

const OTHER_PACKAGE = "@prism-system/ui-switch-other";

async function previewSwitchPlan(t, { root, registry, options = {} }) {
  const manager = makeManager();
  const preview = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    dryRun: true,
    ...options,
  });
  assert.equal(preview.ok, true, preview.failures?.join(" "));
  assert.ok(preview.planMaterial, "a dry run returns stable plan material");
  assert.equal(manager.calls.length, 0);
  return preview;
}

function assertSwitchPlanDrift({ result, manager, root, before }) {
  assert.equal(result.ok, false);
  assert.equal(result.boundary, "plan-drift", result.failures?.join(" "));
  assert.equal(result.reason, "plan-drift");
  assert.deepEqual(result.plannedChanges, []);
  assert.equal(manager.calls.length, 0);
  if (before !== undefined) assertUnchanged(root, before);
}

function makeLaterTarget() {
  return buildTargetManifest({
    version: "3.0.0",
    mutate: (manifest) => {
      manifest.components.Button.variants = ["primary"];
    },
  });
}

test("switch expectedPlan freezes the previewed exact target when latest moves", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });
  assert.equal(preview.to.version, TARGET_VERSION);

  const laterRegistry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target, "3.0.0": makeLaterTarget() },
  });
  const manager = makeManager({ onSpawn: () => writeInstalled(root, target, { bridge: true }) });
  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: laterRegistry.registry,
    fetchImpl: laterRegistry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.to.version, TARGET_VERSION);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(
    result.command.args,
    INSTALL_ARGS(TARGET_PACKAGE, TARGET_VERSION, laterRegistry.registry),
  );
  assert.ok(laterRegistry.requests.some((url) => url.includes(TARGET_VERSION)));
});

test("switch expectedPlan rejects a conflicting requested version before network or spawn", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target, "3.0.0": makeLaterTarget() },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, {
    root,
    registry,
    options: { version: TARGET_VERSION },
  });
  const requestsBefore = registry.requests.length;
  const manager = makeManager();

  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    version: "3.0.0",
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });

  assertSwitchPlanDrift({ result, manager, root, before: snapshot(root) });
  assert.equal(
    registry.requests.length,
    requestsBefore,
    "conflict rejected before any network read",
  );
  assert.match(result.failures.join(" "), /conflicts with the expected plan/);
});

test("switch expectedPlan rejects import/file bytes changed after the preview", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });

  writeFileSync(join(root, "src", "app.tsx"), `${APP_TSX}// changed after preview\n`, "utf8");
  const before = snapshot(root);
  const manager = makeManager();
  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });

  assertSwitchPlanDrift({ result, manager, root, before });
  assert.match(result.failures.join(" "), /planned change/);
});

test("switch expectedPlan rejects changed dependency state", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });

  const packageJsonPath = join(root, "package.json");
  const packageJson = readJson(packageJsonPath);
  packageJson.dependencies[OLD_PACKAGE] = "^9.9.9";
  writeJson(packageJsonPath, packageJson);
  const before = snapshot(root);
  const manager = makeManager();
  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });

  assertSwitchPlanDrift({ result, manager, root, before });
  assert.match(result.failures.join(" "), /dependency state changed/);
});

test("switch expectedPlan rejects a changed package manager", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });

  const packageJsonPath = join(root, "package.json");
  const packageJson = readJson(packageJsonPath);
  packageJson.packageManager = "pnpm@10.34.5";
  writeJson(packageJsonPath, packageJson);
  const before = snapshot(root);
  const manager = makeManager();
  const result = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: manager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });

  assertSwitchPlanDrift({ result, manager, root, before });
  assert.match(result.failures.join(" "), /package manager changed/);
});

test("switch expectedPlan rejects changed connect-file bytes (config, AGENTS, CSS)", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });

  const configRoot = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const configPreview = await previewSwitchPlan(t, { root: configRoot, registry });
  const configPath = join(configRoot, ".design-system", "config.json");
  writeFileSync(configPath, `${readFileSync(configPath, "utf8")}\n`, "utf8");
  const configBefore = snapshot(configRoot);
  const configManager = makeManager();
  const configResult = await switchDesignSystem({
    cwd: configRoot,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: configManager.spawnImpl,
    confirmed: true,
    expectedPlan: configPreview,
  });
  assertSwitchPlanDrift({
    result: configResult,
    manager: configManager,
    root: configRoot,
    before: configBefore,
  });
  assert.match(configResult.failures.join(" "), /planned change/);

  const agentsRoot = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const agentsPreview = await previewSwitchPlan(t, { root: agentsRoot, registry });
  writeFileSync(join(agentsRoot, "AGENTS.md"), "# User instructions\n", "utf8");
  const agentsBefore = snapshot(agentsRoot);
  const agentsManager = makeManager();
  const agentsResult = await switchDesignSystem({
    cwd: agentsRoot,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: agentsManager.spawnImpl,
    confirmed: true,
    expectedPlan: agentsPreview,
  });
  assertSwitchPlanDrift({
    result: agentsResult,
    manager: agentsManager,
    root: agentsRoot,
    before: agentsBefore,
  });

  const cssRoot = createConsumer(t, { source: { "src/app.tsx": APP_TSX }, css: USER_CSS });
  const cssPreview = await previewSwitchPlan(t, {
    root: cssRoot,
    registry,
    options: { cssPath: "src/app.css" },
  });
  const cssPath = join(cssRoot, "src", "app.css");
  writeFileSync(cssPath, `${readFileSync(cssPath, "utf8")}/* changed after preview */\n`, "utf8");
  const cssBefore = snapshot(cssRoot);
  const cssManager = makeManager();
  const cssResult = await switchDesignSystem({
    cwd: cssRoot,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: cssManager.spawnImpl,
    confirmed: true,
    expectedPlan: cssPreview,
    cssPath: "src/app.css",
  });
  assertSwitchPlanDrift({
    result: cssResult,
    manager: cssManager,
    root: cssRoot,
    before: cssBefore,
  });
});

test("switch expectedPlan rejects a changed target manifest or target choice", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });

  const tampered = structuredClone(target);
  tampered.components.Button.variants = ["primary"];
  const tamperedRegistry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: tampered },
  });
  const manifestManager = makeManager();
  const manifestResult = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: tamperedRegistry.registry,
    fetchImpl: tamperedRegistry.fetchImpl,
    spawnImpl: manifestManager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });
  assertSwitchPlanDrift({
    result: manifestResult,
    manager: manifestManager,
    root,
    before: snapshot(root),
  });
  assert.match(manifestResult.failures.join(" "), /target manifest/);
  assert.ok(tamperedRegistry.requests.length > 0, "the changed release was actually resolved");

  const other = buildTargetManifest({ version: "1.0.0" });
  other.package = OTHER_PACKAGE;
  other.id = "switch-other";
  const otherRegistry = createRegistry({
    packageName: OTHER_PACKAGE,
    versions: { "1.0.0": other },
  });
  const choiceManager = makeManager();
  const choiceRequestsBefore = otherRegistry.requests.length;
  const choiceResult = await switchDesignSystem({
    cwd: root,
    package: OTHER_PACKAGE,
    registry: otherRegistry.registry,
    fetchImpl: otherRegistry.fetchImpl,
    spawnImpl: choiceManager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
  });
  assertSwitchPlanDrift({
    result: choiceResult,
    manager: choiceManager,
    root,
    before: snapshot(root),
  });
  assert.match(choiceResult.failures.join(" "), /conflicts with the expected plan's target/);
  assert.equal(otherRegistry.requests.length, choiceRequestsBefore);
});

test("switch expectedPlan rejects tampered commands, paths, and malformed previews", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });

  const commandTampered = structuredClone(preview.planMaterial);
  commandTampered.command.args = [...commandTampered.command.args, "--evil"];
  const commandManager = makeManager();
  const commandResult = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: commandManager.spawnImpl,
    confirmed: true,
    expectedPlan: commandTampered,
  });
  assertSwitchPlanDrift({
    result: commandResult,
    manager: commandManager,
    root,
    before: snapshot(root),
  });
  assert.match(commandResult.failures.join(" "), /command changed/);

  const pathTampered = structuredClone(preview.planMaterial);
  pathTampered.plannedChanges[0].path = join(root, "evil.ts");
  const pathManager = makeManager();
  const pathResult = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: pathManager.spawnImpl,
    confirmed: true,
    expectedPlan: pathTampered,
  });
  assertSwitchPlanDrift({ result: pathResult, manager: pathManager, root, before: snapshot(root) });
  assert.match(pathResult.failures.join(" "), /planned change 1/);

  const requestsBefore = registry.requests.length;
  const malformedManager = makeManager();
  const malformedResult = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: malformedManager.spawnImpl,
    confirmed: true,
    expectedPlan: { materialVersion: 1, action: "switch" },
  });
  assertSwitchPlanDrift({
    result: malformedResult,
    manager: malformedManager,
    root,
    before: snapshot(root),
  });
  assert.equal(
    registry.requests.length,
    requestsBefore,
    "malformed preview is rejected before the registry read",
  );
  assert.match(malformedResult.failures.join(" "), /cannot be used/);

  const wrongActionManager = makeManager();
  const wrongActionResult = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: wrongActionManager.spawnImpl,
    confirmed: true,
    expectedPlan: { materialVersion: 1, action: "remove" },
  });
  assertSwitchPlanDrift({
    result: wrongActionResult,
    manager: wrongActionManager,
    root,
    before: snapshot(root),
  });
});

test("buildLifecyclePlanMaterial accepts the preview result and the material itself", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX } });
  const preview = await previewSwitchPlan(t, { root, registry });

  assert.deepEqual(buildLifecyclePlanMaterial(preview), preview.planMaterial);
  assert.deepEqual(buildLifecyclePlanMaterial(preview.planMaterial), preview.planMaterial);
  assert.throws(
    () => buildLifecyclePlanMaterial({ ok: false, failures: [] }),
    /successful plan preview/,
  );
  assert.throws(
    () => buildLifecyclePlanMaterial({ materialVersion: 99, action: "switch" }),
    /unsupported plan material version/,
  );
});

test("remove expectedPlan executes a frozen preview and cleans the reviewed integration", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t, { css: UNRELATED_CSS });
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));

  const preview = removeDesignSystem({ cwd: root, cssPath: "src/app.css", dryRun: true });
  assert.equal(preview.ok, true, preview.failures?.join(" "));
  assert.ok(preview.planMaterial);

  const manager = makeManager({ onSpawn: removeOnSpawn(root, OLD_PACKAGE) });
  const result = removeDesignSystem({
    cwd: root,
    cssPath: "src/app.css",
    confirmed: true,
    spawnImpl: manager.spawnImpl,
    expectedPlan: preview,
  });

  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(manager.calls.length, 1);
  assert.equal(existsSync(join(root, ".design-system")), false);
  const packageJson = readJson(join(root, "package.json"));
  assert.equal(typeof packageJson.dependencies[OLD_PACKAGE], "undefined");
});

test("remove expectedPlan rejects a cleanup file edited after the preview", (t) => {
  const oldManifest = buildOldManifest();
  const root = removeConsumer(t);
  writeFile(root, join(".design-system", "AGENTS.md"), generatedConsumerAgents(oldManifest));
  const preview = removeDesignSystem({ cwd: root, dryRun: true });
  assert.equal(preview.ok, true, preview.failures?.join(" "));

  writeFile(
    root,
    join(".design-system", "AGENTS.md"),
    `${generatedConsumerAgents(oldManifest)}\n<!-- edited after preview -->\n`,
  );
  const before = snapshot(root);
  const manager = makeManager();
  const result = removeDesignSystem({
    cwd: root,
    confirmed: true,
    spawnImpl: manager.spawnImpl,
    expectedPlan: preview,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "plan-drift");
  assert.equal(result.reason, "plan-drift");
  assert.deepEqual(result.plannedChanges, []);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
  assert.match(result.failures.join(" "), /planned file change count|preserved files/);
});

test("remove expectedPlan rejects changed dependency, CSS, and installed manifest state", (t) => {
  const dependencyRoot = removeConsumer(t);
  const dependencyPreview = removeDesignSystem({ cwd: dependencyRoot, dryRun: true });
  assert.equal(dependencyPreview.ok, true, dependencyPreview.failures?.join(" "));
  const dependencyPackageJsonPath = join(dependencyRoot, "package.json");
  const dependencyPackageJson = readJson(dependencyPackageJsonPath);
  dependencyPackageJson.dependencies[OLD_PACKAGE] = "^9.9.9";
  writeJson(dependencyPackageJsonPath, dependencyPackageJson);
  const dependencyBefore = snapshot(dependencyRoot);
  const dependencyManager = makeManager();
  const dependencyResult = removeDesignSystem({
    cwd: dependencyRoot,
    confirmed: true,
    spawnImpl: dependencyManager.spawnImpl,
    expectedPlan: dependencyPreview,
  });
  assert.equal(dependencyResult.ok, false);
  assert.equal(dependencyResult.boundary, "plan-drift");
  assert.equal(dependencyManager.calls.length, 0);
  assertUnchanged(dependencyRoot, dependencyBefore);
  assert.match(dependencyResult.failures.join(" "), /The dependency state for/);

  const cssRoot = removeConsumer(t, { css: UNRELATED_CSS });
  const cssPreview = removeDesignSystem({ cwd: cssRoot, cssPath: "src/app.css", dryRun: true });
  assert.equal(cssPreview.ok, true, cssPreview.failures?.join(" "));
  writeFileSync(join(cssRoot, "src", "app.css"), `${UNRELATED_CSS}/* changed */\n`, "utf8");
  const cssBefore = snapshot(cssRoot);
  const cssManager = makeManager();
  const cssResult = removeDesignSystem({
    cwd: cssRoot,
    cssPath: "src/app.css",
    confirmed: true,
    spawnImpl: cssManager.spawnImpl,
    expectedPlan: cssPreview,
  });
  assert.equal(cssResult.ok, false);
  assert.equal(cssResult.boundary, "plan-drift");
  assert.equal(cssManager.calls.length, 0);
  assertUnchanged(cssRoot, cssBefore);

  const manifestRoot = removeConsumer(t);
  const manifestPreview = removeDesignSystem({ cwd: manifestRoot, dryRun: true });
  assert.equal(manifestPreview.ok, true, manifestPreview.failures?.join(" "));
  const bumped = buildOldManifest();
  bumped.version = "1.2.0";
  writeInstalled(manifestRoot, bumped, { bridge: true });
  const manifestBefore = snapshot(manifestRoot);
  const manifestManager = makeManager();
  const manifestResult = removeDesignSystem({
    cwd: manifestRoot,
    confirmed: true,
    spawnImpl: manifestManager.spawnImpl,
    expectedPlan: manifestPreview,
  });
  assert.equal(manifestResult.ok, false);
  assert.equal(manifestResult.boundary, "plan-drift");
  assert.equal(manifestManager.calls.length, 0);
  assertUnchanged(manifestRoot, manifestBefore);
  assert.match(manifestResult.failures.join(" "), /version changed|manifest changed/);
});

test("remove expectedPlan rejects malformed previews without spawning", (t) => {
  const root = removeConsumer(t);
  const manager = makeManager();
  const before = snapshot(root);

  const result = removeDesignSystem({
    cwd: root,
    confirmed: true,
    spawnImpl: manager.spawnImpl,
    expectedPlan: { materialVersion: 1, action: "remove" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "plan-drift");
  assert.deepEqual(result.plannedChanges, []);
  assert.equal(manager.calls.length, 0);
  assertUnchanged(root, before);
  assert.match(result.failures.join(" "), /cannot be used/);

  const wrongActionManager = makeManager();
  const wrongActionResult = removeDesignSystem({
    cwd: root,
    confirmed: true,
    spawnImpl: wrongActionManager.spawnImpl,
    expectedPlan: { materialVersion: 1, action: "switch" },
  });
  assert.equal(wrongActionResult.boundary, "plan-drift");
  assert.equal(wrongActionManager.calls.length, 0);
});

test("switch expectedPlan rejects option conflicts (cssPath, selected entry)", async (t) => {
  const target = buildTargetManifest();
  const registry = createRegistry({
    packageName: TARGET_PACKAGE,
    versions: { [TARGET_VERSION]: target },
  });
  const root = createConsumer(t, { source: { "src/app.tsx": APP_TSX }, css: USER_CSS });
  const preview = await previewSwitchPlan(t, {
    root,
    registry,
    options: { cssPath: "src/app.css", withEntry: ["KeyboardScene"] },
  });

  const cssManager = makeManager();
  const cssResult = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: cssManager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
    withEntry: ["KeyboardScene"],
  });
  assertSwitchPlanDrift({ result: cssResult, manager: cssManager, root, before: snapshot(root) });
  assert.match(cssResult.failures.join(" "), /options changed/);

  const entryManager = makeManager();
  const entryResult = await switchDesignSystem({
    cwd: root,
    package: TARGET_PACKAGE,
    registry: registry.registry,
    fetchImpl: registry.fetchImpl,
    spawnImpl: entryManager.spawnImpl,
    confirmed: true,
    expectedPlan: preview,
    cssPath: "src/app.css",
  });
  assertSwitchPlanDrift({
    result: entryResult,
    manager: entryManager,
    root,
    before: snapshot(root),
  });
  assert.match(entryResult.failures.join(" "), /selected entry changed/);
});
