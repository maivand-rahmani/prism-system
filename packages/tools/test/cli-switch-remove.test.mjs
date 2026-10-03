#!/usr/bin/env node
/**
 * Direct CLI tests for `prism-ds switch` and `prism-ds remove`.
 *
 * Run (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/cli-switch-remove.test.mjs
 *
 * Strategy:
 *
 *   - The real `bin/prism-ds.mjs` executable runs as a subprocess for help,
 *     dispatch, validation, preview, and JSON output.
 *   - `switch` registry reads point at an in-process fake registry on
 *     127.0.0.1; `remove` is offline.
 *   - A fake npm/pnpm shim is first on PATH and records any spawn, so a
 *     `--yes` case can prove it reached the fixed command without ever
 *     running a real package manager or mutating a dependency.
 *   - Temp consumers are disposable and byte-snapshotted.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import { helpText, removeHelpText, switchHelpText } from "../src/cli.mjs";
import {
  addSyntheticExtension,
  currentManifest,
  readJson,
  repoRoot,
  syntheticManifest,
} from "./manifest-fixture.mjs";

const binPath = join(repoRoot, "packages", "tools", "bin", "prism-ds.mjs");

const SYSTEM_A = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
);
const SYSTEM_B = currentManifest(
  readJson(join(repoRoot, "packages", "system-b", "design-system.json")),
);

/* -------------------------------------------------------------------------- */
/* Subprocess runner                                                          */
/* -------------------------------------------------------------------------- */

function runBin(args, { cwd = repoRoot, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolvePromise({ stdout, stderr, exitCode }));
  });
}

/* -------------------------------------------------------------------------- */
/* Fake registry and manager shim                                             */
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

async function startRegistry(t, { packageName, manifest }) {
  const tarball = makeTarball({ "package/design-system.json": JSON.stringify(manifest) });
  const requests = [];
  const versions = {
    [manifest.version]: {
      name: packageName,
      version: manifest.version,
      prismSystem: { contractVersion: manifest.contractVersion },
      exports: { "./manifest": "./design-system.json" },
      dist: { tarball: "" },
    },
  };
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (/\/-\/([^/]+)\.tgz$/.test(request.url ?? "")) {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(tarball);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        name: packageName,
        "dist-tags": { latest: manifest.version },
        versions,
      }),
    );
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const registry = `http://127.0.0.1:${server.address().port}`;
  versions[manifest.version].dist.tarball =
    `${registry}/${encodeURIComponent(packageName)}/-/${manifest.version}.tgz`;
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  return { registry, requests };
}

function createFakeManagerDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "prism-fake-manager-"));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const marker = join(dir, "spawned.txt");
  const posix = `#!/bin/sh\nprintf spawned > "${dir}/spawned.txt"\nexit 0\n`;
  const windows = `@echo off\r\n> "${dir}\\spawned.txt" echo spawned\r\nexit /b 0\r\n`;
  for (const name of ["npm", "pnpm"]) {
    writeFileSync(join(dir, name), posix, { encoding: "utf8", mode: 0o755 });
    writeFileSync(join(dir, `${name}.cmd`), windows, "utf8");
  }
  return { dir, marker };
}

function managerEnv(fakeDir) {
  return { ...process.env, PATH: `${fakeDir}${delimiter}${process.env.PATH ?? ""}` };
}

/* -------------------------------------------------------------------------- */
/* Temp consumers                                                             */
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

function createConsumer(t, { source = null, sourceFile = "src/app.ts", system = SYSTEM_A } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-cli-lifecycle-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    packageManager: "npm@10.0.0",
    dependencies: { [system.package]: system.version },
  });
  writeJson(join(root, ".design-system", "config.json"), {
    $schema:
      "https://github.com/maivand-rahmani/prism-system/schemas/design-system-consumer.schema.json",
    schemaVersion: 1,
    package: system.package,
    version: system.version,
    manifest: "./manifest",
    strict: true,
  });
  const packageDir = join(root, "node_modules", ...system.package.split("/"));
  writeJson(join(packageDir, "package.json"), {
    name: system.package,
    version: system.version,
    exports: {
      "./manifest": "./design-system.json",
      "./tailwind.css": "./dist/tailwind.css",
      "./styles.css": "./dist/index.css",
    },
  });
  writeJson(join(packageDir, "design-system.json"), system);
  writeFile(packageDir, "dist/tailwind.css", "/* tailwind bridge */\n");
  writeFile(packageDir, "dist/index.css", "/* styles */\n");
  if (source !== null) writeFile(root, sourceFile, source);

  return { root };
}

function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push([full, readFileSync(full, "utf8")]);
    }
  };
  walk(root);
  return out.sort();
}

/* -------------------------------------------------------------------------- */
/* Help, dispatch, validation                                                 */
/* -------------------------------------------------------------------------- */

test("root help and the switch/remove helps are complete and offline", async () => {
  const root = await runBin(["--help"]);
  assert.equal(root.exitCode, 0);
  assert.equal(root.stdout, helpText());
  assert.match(root.stdout, /switch/);
  assert.match(root.stdout, /remove/);

  const switchHelp = await runBin(["switch", "--help"]);
  assert.equal(switchHelp.exitCode, 0);
  assert.equal(switchHelp.stderr, "");
  assert.equal(switchHelp.stdout, switchHelpText());
  for (const flag of [
    "--cwd",
    "--registry",
    "--css",
    "--with-entry",
    "--peer",
    "--dry-run",
    "--yes",
    "--json",
  ]) {
    assert.match(switchHelp.stdout, new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const removeHelp = await runBin(["remove", "--help"]);
  assert.equal(removeHelp.exitCode, 0);
  assert.equal(removeHelp.stderr, "");
  assert.equal(removeHelp.stdout, removeHelpText());
  for (const flag of ["--cwd", "--css", "--dry-run", "--yes", "--json"]) {
    assert.match(removeHelp.stdout, new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(removeHelp.stdout, /refused while active source imports or token references/);
  assert.match(removeHelp.stdout, /explicitly named --css file is checked/);
  assert.match(removeHelp.stdout, /When --css is omitted, CSS is not inspected/);
});

test("switch/remove validate required arguments before any work", async (t) => {
  const { root } = createConsumer(t);

  const switchNoCwd = await runBin(["switch", SYSTEM_B.package]);
  assert.equal(switchNoCwd.exitCode, 1);
  assert.match(switchNoCwd.stderr, /switch requires an explicit --cwd/);

  const switchNoTarget = await runBin(["switch", "--cwd", root]);
  assert.equal(switchNoTarget.exitCode, 1);
  assert.match(switchNoTarget.stderr, /switch requires a target/);

  const removeNoCwd = await runBin(["remove"]);
  assert.equal(removeNoCwd.exitCode, 1);
  assert.match(removeNoCwd.stderr, /remove requires an explicit --cwd/);

  const unknown = await runBin(["switch", "x", "--cwd", root, "--bogus"]);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stderr, /Unknown option: --bogus/);

  const extra = await runBin(["remove", "one", "two", "--cwd", root]);
  assert.equal(extra.exitCode, 1);
  assert.match(extra.stderr, /at most 1 positional/);
});

/* -------------------------------------------------------------------------- */
/* switch                                                                     */
/* -------------------------------------------------------------------------- */

test("switch without --yes prints the exact preview and changes nothing", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_B.package,
    manifest: SYSTEM_B,
  });
  const { root } = createConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const result = await runBin(
    ["switch", SYSTEM_B.package, "--cwd", root, "--registry", registry.registry],
    { env: managerEnv(dir) },
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Switch preview \(confirmation required\)/);
  assert.match(result.stdout, /requires --yes; nothing was changed/);
  assert.match(result.stdout, /dependency: npm install/);
  assert.deepEqual(snapshot(root), before, "a preview must not write");
  assert.equal(readdirSync(dir).includes("spawned.txt"), false, "a preview must not spawn");
});

test("switch --dry-run --json returns the exact plan without spawning or writing", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_B.package,
    manifest: SYSTEM_B,
  });
  const { root } = createConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const result = await runBin(
    [
      "switch",
      SYSTEM_B.package,
      "--cwd",
      root,
      "--registry",
      registry.registry,
      "--dry-run",
      "--json",
    ],
    { env: managerEnv(dir) },
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.to.package, SYSTEM_B.package);
  assert.equal(report.to.version, SYSTEM_B.version);
  assert.ok(report.plannedChanges.some((change) => change.kind === "dependency"));
  assert.equal(report.compatibility.blockers.length, 0);
  assert.equal(report.manager, "npm");
  assert.ok(report.planMaterial.action === "switch");
  assert.deepEqual(snapshot(root), before, "a dry run must not write");
  assert.equal(readdirSync(dir).includes("spawned.txt"), false);
});

test("switch --yes reaches only the fixed command and fails closed on verification", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_B.package,
    manifest: SYSTEM_B,
  });
  const { root } = createConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const result = await runBin(
    ["switch", SYSTEM_B.package, "--cwd", root, "--registry", registry.registry, "--yes", "--json"],
    { env: managerEnv(dir) },
  );

  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "verify");
  assert.equal(report.reason, "target-unverified");
  assert.equal(readdirSync(dir).includes("spawned.txt"), true, "the fixed command was invoked");
  assert.deepEqual(snapshot(root), before, "no source or connect file was written");
});

/* -------------------------------------------------------------------------- */
/* switch: auto-selected extensions and peer visibility                       */
/* -------------------------------------------------------------------------- */

const KEYBOARD_SCENE_ENTRYPOINT = "./custom/keyboard-scene";
const KEYBOARD_SCENE_SOURCE =
  `import { KeyboardScene } from "${SYSTEM_B.package}${KEYBOARD_SCENE_ENTRYPOINT.slice(1)}";\n\n` +
  "export const scene = <KeyboardScene />;\n";

/**
 * Synthetic switch target that declares the same KeyboardScene extension the
 * installed system exposes, with one non-exact peer requirement so the plan
 * needs an explicit exact `--peer` (or blocks with guidance).
 */
function extensionTargetManifest() {
  const manifest = syntheticManifest({
    id: "fixture-switch-target",
    version: "2.0.0",
    packageName: "@prism-system/ui-fixture-switch-target",
  });
  return addSyntheticExtension(manifest, {
    name: "KeyboardScene",
    entrypoint: KEYBOARD_SCENE_ENTRYPOINT,
    requirements: [{ name: "three", kind: "peer", range: "^0.186.1", optional: true }],
  });
}

function createExtensionConsumer(t) {
  return createConsumer(t, {
    system: SYSTEM_B,
    sourceFile: "src/app.tsx",
    source: KEYBOARD_SCENE_SOURCE,
  });
}

test("switch auto-selects an imported extension and blocks a non-exact peer until --peer", async (t) => {
  const target = extensionTargetManifest();
  const registry = await startRegistry(t, { packageName: target.package, manifest: target });
  const { root } = createExtensionConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const result = await runBin(
    ["switch", target.package, "--cwd", root, "--registry", registry.registry],
    { env: managerEnv(dir) },
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Switch failed \(boundary: entry, reason: entry-plan-failed\)/);
  assert.match(result.stdout, /pass --peer three@<exact-version>/);
  assert.match(
    result.stdout,
    /automatically selected from usage: KeyboardScene \(\.\/custom\/keyboard-scene\)/,
  );
  assert.doesNotMatch(result.stdout, /command: npm/, "the plan must block before a command exists");
  assert.deepEqual(snapshot(root), before, "a blocked switch must not write");
  assert.equal(readdirSync(dir).includes("spawned.txt"), false, "a blocked switch must not spawn");
});

test("switch preview with an exact --peer shows the auto-selected extension and peer install", async (t) => {
  const target = extensionTargetManifest();
  const registry = await startRegistry(t, { packageName: target.package, manifest: target });
  const { root } = createExtensionConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);
  const env = managerEnv(dir);

  const preview = await runBin(
    [
      "switch",
      target.package,
      "--cwd",
      root,
      "--registry",
      registry.registry,
      "--peer",
      "three@0.186.1",
    ],
    { env },
  );

  assert.equal(preview.exitCode, 1);
  assert.match(preview.stdout, /Switch preview \(confirmation required\)/);
  assert.match(
    preview.stdout,
    /automatically selected from usage: KeyboardScene \(\.\/custom\/keyboard-scene\)/,
  );
  assert.match(preview.stdout, /peer actions:/);
  assert.match(preview.stdout, /three \[peer\] \^0\.186\.1 optional -> install 0\.186\.1/);
  assert.match(preview.stdout, /command: npm install [^\n]*three@0\.186\.1/);
  assert.match(preview.stdout, /requires --yes; nothing was changed/);
  assert.deepEqual(snapshot(root), before, "a preview must not write");
  assert.equal(readdirSync(dir).includes("spawned.txt"), false, "a preview must not spawn");

  // The JSON contract stays unchanged: the same selections and peer plan are
  // visible without any human formatting.
  const json = await runBin(
    [
      "switch",
      target.package,
      "--cwd",
      root,
      "--registry",
      registry.registry,
      "--peer",
      "three@0.186.1",
      "--dry-run",
      "--json",
    ],
    { env },
  );
  assert.equal(json.exitCode, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.deepEqual(
    report.autoSelectedEntries.map((entry) => [entry.name, entry.entrypoint, entry.source]),
    [["KeyboardScene", KEYBOARD_SCENE_ENTRYPOINT, "active-usage"]],
  );
  assert.ok(report.entrySelection.requested.includes("KeyboardScene"));
  assert.ok(
    report.peers.some(
      (peer) => peer.name === "three" && peer.action === "install" && peer.version === "0.186.1",
    ),
  );
  assert.deepEqual(snapshot(root), before, "a dry run must not write");
  assert.equal(readdirSync(dir).includes("spawned.txt"), false, "a dry run must not spawn");
});

/* -------------------------------------------------------------------------- */
/* remove                                                                     */
/* -------------------------------------------------------------------------- */

test("remove without --yes prints the exact preview and changes nothing", async (t) => {
  const { root } = createConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const result = await runBin(["remove", "--cwd", root], { env: managerEnv(dir) });

  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Remove preview \(confirmation required\)/);
  assert.match(result.stdout, /requires --yes; nothing was changed/);
  assert.match(result.stdout, /dependency: npm uninstall/);
  assert.match(result.stdout, /warning \[css-not-inspected\]/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(readdirSync(dir).includes("spawned.txt"), false);
});

test("remove --dry-run --json plans the exact removal without writing", async (t) => {
  const { root } = createConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const result = await runBin(["remove", "--cwd", root, "--dry-run", "--json"], {
    env: managerEnv(dir),
  });

  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.package, SYSTEM_A.package);
  assert.ok(report.plannedChanges.some((change) => change.kind === "dependency"));
  assert.ok(report.planMaterial.action === "remove");
  assert.ok(
    report.compatibility.warnings.some((warning) => warning.code === "css-not-inspected"),
    "the JSON result must carry the CSS-not-inspected coverage warning",
  );
  assert.deepEqual(snapshot(root), before);
  assert.equal(readdirSync(dir).includes("spawned.txt"), false);
});

test("remove reports precise active-usage blockers and exits 1", async (t) => {
  const { root } = createConsumer(t, {
    source: `import { Button } from "${SYSTEM_A.package}";\n\nexport const x = Button;\n`,
  });
  const before = snapshot(root);

  const json = await runBin(["remove", "--cwd", root, "--dry-run", "--json"]);
  assert.equal(json.exitCode, 1);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "usage");
  assert.equal(report.reason, "active-usage");
  assert.ok(report.compatibility.blockers.some((blocker) => blocker.file === "src/app.ts"));
  assert.match(report.failures.join(" "), /src[/\\]app\.ts:1/);

  const human = await runBin(["remove", "--cwd", root, "--dry-run"]);
  assert.equal(human.exitCode, 1);
  assert.match(human.stdout, /blocker \[active-import\]/);
  assert.match(human.stdout, /src[/\\]app\.ts:1/);
  assert.deepEqual(snapshot(root), before, "blocked removal must not write");
});

test("remove fails closed on unmarked bridge imports in the named CSS file", async (t) => {
  const { root } = createConsumer(t);
  const css = [
    "/* user styles */",
    `@import "${SYSTEM_A.package}/tailwind.css";`,
    `@import "${SYSTEM_A.package}/styles.css";`,
    "",
  ].join("\n");
  const cssPath = writeFile(root, "src/app.css", css);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const dryRun = await runBin(
    ["remove", "--cwd", root, "--css", "src/app.css", "--dry-run", "--json"],
    { env: managerEnv(dir) },
  );
  assert.equal(dryRun.exitCode, 1);
  const report = JSON.parse(dryRun.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "css-ownership");
  assert.equal(report.reason, "unattributable-css-imports");
  assert.deepEqual(report.plannedChanges, []);
  assert.ok(
    report.compatibility.blockers.some((blocker) => blocker.code === "unattributable-css-imports"),
  );
  assert.match(report.failures.join(" "), /cannot be proven tool-managed/);
  assert.match(report.failures.join(" "), /manually/);

  const human = await runBin(["remove", "--cwd", root, "--css", "src/app.css"], {
    env: managerEnv(dir),
  });
  assert.equal(human.exitCode, 1);
  assert.match(human.stdout, /Remove failed \(boundary: css-ownership/);
  assert.match(human.stdout, /blocker \[unattributable-css-imports\]/);

  const confirmed = await runBin(["remove", "--cwd", root, "--css", "src/app.css", "--yes"], {
    env: managerEnv(dir),
  });
  assert.equal(confirmed.exitCode, 1);
  assert.equal(readdirSync(dir).includes("spawned.txt"), false, "no manager was spawned");
  assert.equal(readFileSync(cssPath, "utf8"), css, "the CSS bytes are preserved exactly");
  assert.deepEqual(snapshot(root), before, "no file was written");
});

test("remove --yes runs the fixed command and reports the residual dependency honestly", async (t) => {
  const { root } = createConsumer(t);
  const before = snapshot(root);
  const { dir } = createFakeManagerDir(t);

  const result = await runBin(["remove", "--cwd", root, "--yes", "--json"], {
    env: managerEnv(dir),
  });

  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "verify");
  assert.equal(report.reason, "dependency-still-present");
  assert.equal(readdirSync(dir).includes("spawned.txt"), true, "the fixed command was invoked");
  assert.deepEqual(snapshot(root), before, "no generated files were removed");
});
