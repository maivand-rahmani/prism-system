#!/usr/bin/env node
/**
 * Direct CLI tests for the V4 command surface (`prism-ds` cli.mjs).
 *
 * Run (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/cli.test.mjs
 *
 * Strategy:
 *
 *   - Output-sensitive assertions run the real `bin/prism-ds.mjs` executable as
 *     an async subprocess, so stdout/stderr/exit codes are captured cleanly and
 *     the entry point itself is covered.
 *   - Registry-backed dry runs (`install`/`use`/`upgrade`) point the subprocess
 *     at an in-process fake registry bound to 127.0.0.1 — no public network. The
 *     package manager is never spawned because every case is a dry run.
 *   - The offline guarantee is additionally proven in-process by stubbing
 *     `globalThis.fetch` to record (and throw on) any network attempt while the
 *     exported `run*Command` functions run.
 *
 * Temp consumers are disposable and byte-snapshotted. No design-system or
 * `@prism-system/ui-core` code is imported or executed; manifests are read as
 * JSON data only.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import {
  checkHelpText,
  componentsHelpText,
  helpText,
  helpTextForUse,
  installHelpText,
  runCheckCommand,
  runComponentsCommand,
  runSetupTailwindCommand,
  runTokensCommand,
  runUpgradeCommand,
  setupTailwindHelpText,
  tokensHelpText,
  upgradeHelpText,
} from "../src/cli.mjs";
import { currentManifest, readJson, repoRoot } from "./manifest-fixture.mjs";

const binPath = join(repoRoot, "packages", "tools", "bin", "prism-ds.mjs");

const SYSTEM_A = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
);

const V4_PACKAGE = SYSTEM_A.package;
/** The live V4 System A version; the fixture manifest version is authoritative. */
const V4_VERSION = SYSTEM_A.version;
const V4_AVAILABLE_OPTIONAL = "Grid";
const V4_UNAVAILABLE_OPTIONAL = "Skeleton";

const managedCss = (packageName, extra = []) =>
  [
    '@import "tailwindcss";',
    `@import "${packageName}/tailwind.css";`,
    `@import "${packageName}/styles.css";`,
    ...extra,
    "",
  ].join("\n");

/* -------------------------------------------------------------------------- */
/* Subprocess runner                                                          */
/* -------------------------------------------------------------------------- */

/** Run the real CLI binary, resolving with captured streams and exit code. */
function runBin(args, { cwd = repoRoot } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env: { ...process.env },
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
/* In-memory tarballs and an in-process fake registry                         */
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
 * Start an in-process fake npm registry on 127.0.0.1 for one package. Each
 * version's manifest becomes a real tarball; the packument and tarball URLs are
 * served locally. Returns the base URL and a live request log.
 */
async function startRegistry(t, { packageName, versions }) {
  const tarballs = new Map();
  const versionsMeta = {};
  let latest = null;
  for (const [version, manifest] of Object.entries(versions)) {
    tarballs.set(version, makeTarball({ "package/design-system.json": JSON.stringify(manifest) }));
    versionsMeta[version] = {
      name: packageName,
      version,
      prismSystem: { contractVersion: manifest.contractVersion },
      exports: { "./manifest": "./design-system.json" },
      dist: { tarball: "" },
    };
    latest = version;
  }

  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    const tarball = /\/-\/([^/]+)\.tgz$/.exec(request.url ?? "");
    if (tarball !== null) {
      const bytes = tarballs.get(decodeURIComponent(tarball[1]));
      if (bytes === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(bytes);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ name: packageName, "dist-tags": { latest }, versions: versionsMeta }),
    );
  });

  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const registry = `http://127.0.0.1:${server.address().port}`;
  for (const version of Object.keys(versionsMeta)) {
    versionsMeta[version].dist.tarball =
      `${registry}/${encodeURIComponent(packageName)}/-/${version}.tgz`;
  }
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));

  return { registry, requests };
}

/* -------------------------------------------------------------------------- */
/* In-process offline guarantee                                               */
/* -------------------------------------------------------------------------- */

/** Silence one command's stdout while it runs (contamination is irrelevant). */
function discardStdout() {
  const original = process.stdout.write;
  process.stdout.write = () => true;
  return () => {
    process.stdout.write = original;
  };
}

/**
 * Run an exported command with `globalThis.fetch` replaced by a recording fetch
 * that throws, so any hidden network attempt fails the test. Returns the exit
 * code plus the recorded network attempts.
 */
async function invokeOffline(runFn, argv) {
  const previousExit = process.exitCode;
  const previousFetch = globalThis.fetch;
  const networkAttempts = [];
  process.exitCode = undefined;
  globalThis.fetch = () => {
    networkAttempts.push("fetch");
    throw new Error("network must not be used by an offline command");
  };
  const restoreStdout = discardStdout();
  let thrown = null;
  try {
    await runFn(argv);
  } catch (error) {
    thrown = error;
  } finally {
    restoreStdout();
    globalThis.fetch = previousFetch;
  }
  const exitCode = process.exitCode;
  process.exitCode = previousExit;
  if (thrown !== null) throw thrown;
  return { exitCode, networkAttempts };
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

function createConsumer(
  t,
  { manifest, connected = false, tailwind = null, bridge = true, css = null } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "prism-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const dependencies = { [manifest.package]: manifest.version };
  if (tailwind !== null) dependencies.tailwindcss = tailwind;
  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    packageManager: "npm@10.0.0",
    dependencies,
  });

  if (connected) {
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
  const exportsMap = { "./manifest": "./design-system.json" };
  if (bridge) {
    exportsMap["./tailwind.css"] = "./dist/tailwind.css";
    exportsMap["./styles.css"] = "./dist/index.css";
  }
  writeJson(join(packageDir, "package.json"), {
    name: manifest.package,
    version: manifest.version,
    exports: exportsMap,
  });
  writeJson(join(packageDir, "design-system.json"), manifest);
  if (bridge) {
    writeFile(packageDir, "dist/tailwind.css", "/* tailwind bridge */\n");
    writeFile(packageDir, "dist/index.css", "/* styles */\n");
  }

  if (tailwind !== null) {
    const tailwindDir = join(root, "node_modules", "tailwindcss");
    writeJson(join(tailwindDir, "package.json"), {
      name: "tailwindcss",
      version: tailwind,
      exports: { ".": "./index.css", "./package.json": "./package.json" },
    });
    writeFile(tailwindDir, "index.css", "/* tailwind */\n");
  }

  if (css !== null) writeFile(root, "src/app.css", css);

  return { root, packageName: manifest.package };
}

function tailwindConsumer(t, css) {
  return createConsumer(t, { manifest: SYSTEM_A, connected: true, tailwind: "4.1.0", css });
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
  return out.sort();
}

function snapshot(root) {
  return listFiles(root).map((file) => [file, readFileSync(file, "utf8")]);
}

const INSTALL_ARGS = (packageName, version, registry) => [
  "install",
  "--save-prod",
  "--ignore-scripts",
  `--registry=${registry}`,
  `${packageName}@${version}`,
];

/* -------------------------------------------------------------------------- */
/* Help, dispatch, and argument parsing                                       */
/* -------------------------------------------------------------------------- */

test("root help lists every command and the dependency-mutating boundary", async () => {
  const result = await runBin(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  for (const command of [
    "search",
    "info",
    "install",
    "use",
    "connect",
    "check-usage",
    "doctor",
    "components",
    "tokens",
    "check",
    "setup-tailwind",
    "upgrade",
  ]) {
    assert.match(result.stdout, new RegExp(command), `help mentions ${command}`);
  }
  assert.match(result.stdout, /install\/use\/upgrade\s+mutate consumer dependencies/);
  assert.match(result.stdout, /upgrade does so only/);
  assert.match(helpText(), /setup-tailwind/);
});

test("root help states the read-only and CSS-mutating boundaries precisely", async () => {
  const result = await runBin(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  const help = result.stdout;
  assert.equal(help, helpText());

  // The six offline commands never edit dependencies; `connect` is named as the
  // only one that writes, and only its consumer config/AGENTS files.
  assert.match(
    help,
    /connect\/check-usage\/doctor\/\s+offline and never edit dependencies \(connect writes/,
  );
  assert.match(
    help,
    /components\/tokens\/check\/\s+only its consumer config\/AGENTS files; the others/,
  );
  assert.match(help, /the others\s+are read-only\)\./);

  // `setup-tailwind` is described separately as the only CSS-file editor.
  assert.match(
    help,
    /setup-tailwind\s+offline; the only command that edits its explicitly\s+named --css file, and it writes nothing in --dry-run\s+or --check\./,
  );
  assert.doesNotMatch(
    help,
    /connect\/check-usage\/doctor\/\s+components\/tokens\/check\/setup-tailwind/,
    "setup-tailwind must not be lumped into the read-only list",
  );

  // The dependency-mutating boundary text is preserved.
  assert.match(help, /install\/use\/upgrade\s+mutate consumer dependencies/);
  assert.match(help, /upgrade does so only\s+when explicitly invoked/);
});

test("upgrade help no longer advertises --save-dev, --save-prod, or --exact", async () => {
  const result = await runBin(["upgrade", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, upgradeHelpText());

  for (const flag of ["--save-dev", "--save-prod", "--exact"]) {
    assert.doesNotMatch(result.stdout, new RegExp(flag), `${flag} is not advertised for upgrade`);
    assert.doesNotMatch(upgradeHelpText(), new RegExp(flag), flag);
  }

  // `install`/`use` keep supporting and advertising the same flags.
  for (const help of [installHelpText(), helpTextForUse()]) {
    assert.match(help, /--save-dev/);
    assert.match(help, /--save-prod/);
    assert.match(help, /--exact/);
  }
});

test("every new command serves its own --help", async () => {
  const cases = [
    ["components", componentsHelpText],
    ["tokens", tokensHelpText],
    ["check", checkHelpText],
    ["setup-tailwind", setupTailwindHelpText],
    ["upgrade", upgradeHelpText],
  ];
  for (const [command, helpFn] of cases) {
    const result = await runBin([command, "--help"]);
    assert.equal(result.exitCode, 0, `${command} --help exits 0`);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, helpFn());
  }
});

test("install and use help document the new dry-run, JSON, and Tailwind options", () => {
  assert.match(installHelpText(), /--dry-run/);
  assert.match(installHelpText(), /--json/);
  assert.match(helpTextForUse(), /--tailwind --css <file>/);
  assert.match(helpTextForUse(), /--dry-run/);
  assert.match(helpTextForUse(), /--json/);
});

test("unknown commands and options fail closed", async () => {
  const unknown = await runBin(["frobnicate"]);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stderr, /Unknown command: frobnicate/);

  const badOption = await runBin(["components", "--bogus", "--cwd", repoRoot]);
  assert.equal(badOption.exitCode, 1);
  assert.match(badOption.stderr, /Unknown option: --bogus/);
});

test("offline commands require --cwd and setup-tailwind requires --css", async (t) => {
  const { root } = createConsumer(t, { manifest: SYSTEM_A });

  const components = await runBin(["components"]);
  assert.equal(components.exitCode, 1);
  assert.match(`${components.stdout}${components.stderr}`, /requires an explicit --cwd/);

  const tokens = await runBin(["tokens"]);
  assert.equal(tokens.exitCode, 1);
  assert.match(`${tokens.stdout}${tokens.stderr}`, /requires an explicit --cwd/);

  const setup = await runBin(["setup-tailwind", "--cwd", root]);
  assert.equal(setup.exitCode, 1);
  assert.match(setup.stdout, /Tailwind setup failed/);
  assert.match(setup.stdout, /requires an explicit --css/);

  const both = await runBin([
    "setup-tailwind",
    "--check",
    "--dry-run",
    "--cwd",
    root,
    "--css",
    "src/app.css",
  ]);
  assert.equal(both.exitCode, 1);
  assert.match(both.stderr, /--check and --dry-run are mutually exclusive/);

  const extra = await runBin(["components", "Button", "Input", "--cwd", root]);
  assert.equal(extra.exitCode, 1);
  assert.match(extra.stderr, /at most 1 positional/);
});

/* -------------------------------------------------------------------------- */
/* components                                                                 */
/* -------------------------------------------------------------------------- */

test("components reports the V4 catalog offline as stable JSON", async (t) => {
  const { root, packageName } = createConsumer(t, { manifest: SYSTEM_A });
  const before = snapshot(root);

  const result = await runBin(["components", "--cwd", root, "--json"]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.package, packageName);
  assert.equal(report.contractVersion, 4);
  assert.equal(report.showcase.route, `/showcase/${SYSTEM_A.id}`);
  assert.equal(report.components.length, report.counts.required + report.counts.optional);
  assert.ok(report.available.includes("Button"));
  assert.deepEqual(report.capabilities.categories.composition.required, [
    "Container",
    "Stack",
    "Center",
    "Cluster",
    "Sidebar",
    "AspectRatio",
  ]);
  assert.deepEqual(report.capabilities.categories.composition.optional, ["Grid", "Section"]);
  assert.ok(report.capabilities.categories.composition.available.includes("Grid"));
  assert.deepEqual(report.capabilities.categories.composition.unavailable, ["Section"]);
  assert.deepEqual(report.requested, null);
  assert.deepEqual(snapshot(root), before, "components must not write");
});

test("components resolves an available and an unavailable optional", async (t) => {
  const { root } = createConsumer(t, { manifest: SYSTEM_A });

  const available = await runBin(["components", V4_AVAILABLE_OPTIONAL, "--cwd", root, "--json"]);
  assert.equal(available.exitCode, 0);
  const availableReport = JSON.parse(available.stdout);
  assert.equal(availableReport.requested.name, V4_AVAILABLE_OPTIONAL);
  assert.equal(availableReport.requested.optional, true);
  assert.equal(availableReport.requested.available, true);

  const unavailable = await runBin([
    "components",
    V4_UNAVAILABLE_OPTIONAL,
    "--cwd",
    root,
    "--json",
  ]);
  assert.equal(unavailable.exitCode, 0);
  const unavailableReport = JSON.parse(unavailable.stdout);
  assert.equal(unavailableReport.requested.name, V4_UNAVAILABLE_OPTIONAL);
  assert.equal(unavailableReport.requested.available, false);
  assert.equal(unavailableReport.requested.variants, null);
});

test("components rejects an unknown name and prints a human catalog", async (t) => {
  const { root } = createConsumer(t, { manifest: SYSTEM_A });

  const unknown = await runBin(["components", "Nope", "--cwd", root]);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stdout, /Component catalog failed/);
  assert.match(unknown.stdout, /Unknown component "Nope"/);

  const text = await runBin(["components", "--cwd", root]);
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /component catalog \(contract version 4\)/);
  assert.match(text.stdout, /capability categories:/);
  assert.match(text.stdout, /composition: 7\/8 available; unavailable: Section/);
  assert.match(text.stdout, /forms: 6\/6 available/);
  assert.match(text.stdout, /Button\s+\[required\] available/);
});

/* -------------------------------------------------------------------------- */
/* tokens                                                                     */
/* -------------------------------------------------------------------------- */

test("tokens reports the V4 catalog and a single group as stable JSON", async (t) => {
  const { root, packageName } = createConsumer(t, { manifest: SYSTEM_A });
  const before = snapshot(root);

  const full = await runBin(["tokens", "--cwd", root, "--json"]);
  assert.equal(full.exitCode, 0);
  const catalog = JSON.parse(full.stdout);
  assert.equal(catalog.ok, true);
  assert.equal(catalog.supported, true);
  assert.equal(catalog.package, packageName);
  assert.equal(catalog.prefixes.css, SYSTEM_A.tokens.names.cssVariablePrefix);
  assert.equal(catalog.prefixes.tailwind, SYSTEM_A.tokens.names.tailwindUtilityPrefix);
  assert.ok(catalog.counts.tokens > 0);
  assert.equal(catalog.requested, null);

  const group = await runBin(["tokens", "themes", "--cwd", root, "--json"]);
  assert.equal(group.exitCode, 0);
  const groupCatalog = JSON.parse(group.stdout);
  assert.equal(groupCatalog.requested.group, "themes");
  assert.ok(groupCatalog.requested.tokens.length > 0);
  assert.match(groupCatalog.requested.tokens[0].cssVariable, /^--/);

  assert.deepEqual(snapshot(root), before, "tokens must not write");
});

test("tokens rejects an unknown group", async (t) => {
  const { root } = createConsumer(t, { manifest: SYSTEM_A });
  const result = await runBin(["tokens", "nope", "--cwd", root]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Token catalog failed/);
  assert.match(result.stdout, /Unknown token group "nope"/);
});

test("tokens reports the catalog as stable JSON", async (t) => {
  const { root, packageName } = createConsumer(t, { manifest: SYSTEM_A });
  const before = snapshot(root);

  const json = await runBin(["tokens", "--cwd", root, "--json"]);
  assert.equal(json.exitCode, 0);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.package, packageName);
  assert.equal(report.contractVersion, 4);
  assert.equal(report.supported, true);
  assert.ok(report.prefixes.css.length > 0);

  assert.deepEqual(snapshot(root), before);
});

/* -------------------------------------------------------------------------- */
/* check                                                                      */
/* -------------------------------------------------------------------------- */

test("check produces a passing offline report and JSON health summary", async (t) => {
  const { root } = createConsumer(t, { manifest: SYSTEM_A, connected: true });
  const before = snapshot(root);

  const result = await runBin(["check", "--cwd", root, "--json"]);

  assert.equal(result.exitCode, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.contractVersion, 4);
  assert.ok(Array.isArray(report.checks) && report.checks.length > 0);
  assert.deepEqual(snapshot(root), before, "check must not write");

  const text = await runBin(["check", "--cwd", root]);
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /Check passed\./);
});

test("check --css reports pending import changes without writing", async (t) => {
  const { root } = tailwindConsumer(t, "body { margin: 0; }\n");
  const before = snapshot(root);

  const result = await runBin(["check", "--css", "src/app.css", "--cwd", root, "--json"]);

  assert.equal(result.exitCode, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.deepEqual(snapshot(root), before);
});

test("check fails a missing consumer config", async (t) => {
  const { root } = createConsumer(t, { manifest: SYSTEM_A, connected: false });
  const result = await runBin(["check", "--cwd", root, "--json"]);
  assert.equal(result.exitCode, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

/* -------------------------------------------------------------------------- */
/* setup-tailwind                                                             */
/* -------------------------------------------------------------------------- */

test("setup-tailwind --check passes an already-ordered file", async (t) => {
  const { root } = tailwindConsumer(t, managedCss(V4_PACKAGE, ["body { margin: 0; }"]));
  const before = snapshot(root);

  const result = await runBin([
    "setup-tailwind",
    "--check",
    "--cwd",
    root,
    "--css",
    "src/app.css",
    "--json",
  ]);

  assert.equal(result.exitCode, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, "check");
  assert.equal(report.ok, true);
  assert.equal(report.plan.changed, false);
  assert.deepEqual(snapshot(root), before);
});

test("setup-tailwind --check fails when changes are pending and never writes", async (t) => {
  const { root } = tailwindConsumer(t, "body { margin: 0; }\n");
  const before = snapshot(root);

  const result = await runBin(["setup-tailwind", "--check", "--cwd", root, "--css", "src/app.css"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Tailwind setup check failed/);
  assert.match(result.stdout, /adding or reordering/);
  assert.doesNotMatch(result.stdout, /preview only/);
  assert.deepEqual(snapshot(root), before, "--check must not write");

  // The JSON form carries the same gate in its `mode`, and still exits non-zero.
  const json = await runBin([
    "setup-tailwind",
    "--check",
    "--cwd",
    root,
    "--css",
    "src/app.css",
    "--json",
  ]);
  assert.equal(json.exitCode, 1);
  const report = JSON.parse(json.stdout);
  assert.equal(report.mode, "check");
  assert.equal(report.plan.changed, true);
  assert.deepEqual(snapshot(root), before, "--check must not write");
});

test("setup-tailwind --check and --dry-run diverge on pending changes", async (t) => {
  const { root } = tailwindConsumer(t, "body { margin: 0; }\n");
  const before = snapshot(root);

  const check = await runBin(["setup-tailwind", "--check", "--cwd", root, "--css", "src/app.css"]);
  const dryRun = await runBin([
    "setup-tailwind",
    "--dry-run",
    "--cwd",
    root,
    "--css",
    "src/app.css",
  ]);

  // Same planner, same pending change, opposite exit semantics.
  assert.equal(check.exitCode, 1);
  assert.equal(dryRun.exitCode, 0);
  assert.match(dryRun.stdout, /a --check would fail/);
  assert.match(dryRun.stdout, /preview only; exit 0/);
  assert.doesNotMatch(check.stdout, /preview only/);
  assert.deepEqual(snapshot(root), before, "neither mode writes");
});

test("setup-tailwind --dry-run previews changes and never writes", async (t) => {
  const { root } = tailwindConsumer(t, "body { margin: 0; }\n");
  const before = snapshot(root);

  const result = await runBin([
    "setup-tailwind",
    "--dry-run",
    "--cwd",
    root,
    "--css",
    "src/app.css",
    "--json",
  ]);

  assert.equal(result.exitCode, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.changed, false);
  assert.equal(report.plan.changed, true);
  assert.deepEqual(snapshot(root), before, "dry run must not write");
});

test("setup-tailwind writes only the explicit CSS file", async (t) => {
  const { root } = tailwindConsumer(t, "body { margin: 0; }\n");
  const cssPath = join(root, "src", "app.css");
  const before = snapshot(root);

  const result = await runBin(["setup-tailwind", "--cwd", root, "--css", "src/app.css"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Updated .*app\.css/);
  const css = readFileSync(cssPath, "utf8");
  assert.ok(css.includes('@import "tailwindcss";'));
  assert.ok(css.includes(`@import "${V4_PACKAGE}/tailwind.css";`));
  assert.ok(css.includes(`@import "${V4_PACKAGE}/styles.css";`));

  const after = snapshot(root);
  const changed = after.filter(([file, content]) => {
    const previous = before.find(([beforeFile]) => beforeFile === file);
    return previous === undefined || previous[1] !== content;
  });
  assert.deepEqual(
    changed.map(([file]) => file),
    [cssPath],
    "only the CSS file changes",
  );
});

test("setup-tailwind is a no-op when imports are already ordered", async (t) => {
  const { root } = tailwindConsumer(t, managedCss(V4_PACKAGE));
  const before = snapshot(root);

  const result = await runBin(["setup-tailwind", "--cwd", root, "--css", "src/app.css"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /No changes needed/);
  assert.deepEqual(snapshot(root), before);
});

/* -------------------------------------------------------------------------- */
/* install / use / upgrade dry runs (local fake registry)                     */
/* -------------------------------------------------------------------------- */

test("install --dry-run --json resolves the exact command without mutating", async (t) => {
  const registry = await startRegistry(t, {
    packageName: V4_PACKAGE,
    versions: { [V4_VERSION]: SYSTEM_A },
  });
  const { root } = createConsumer(t, { manifest: SYSTEM_A });
  const before = snapshot(root);

  const result = await runBin([
    "install",
    "@prism-system/ui-system-a",
    V4_VERSION,
    "--cwd",
    root,
    "--registry",
    registry.registry,
    "--dry-run",
    "--json",
  ]);

  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.changed, false);
  assert.equal(report.package, V4_PACKAGE);
  assert.equal(report.version, V4_VERSION);
  assert.deepEqual(report.command.args, INSTALL_ARGS(V4_PACKAGE, V4_VERSION, registry.registry));
  assert.deepEqual(snapshot(root), before, "install dry run must not mutate");
  assert.ok(
    registry.requests.some((url) => url.endsWith(".tgz")),
    "the tarball was fetched",
  );
});

test("install --json surfaces a registry failure result and exits non-zero", async (t) => {
  const { root } = createConsumer(t, { manifest: SYSTEM_A });
  const result = await runBin([
    "install",
    "@prism-system/ui-system-a",
    V4_VERSION,
    "--cwd",
    root,
    "--registry",
    "http://127.0.0.1:1",
    "--json",
  ]);

  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "registry");
});

test("use --dry-run --json plans dependency and connect changes", async (t) => {
  const registry = await startRegistry(t, {
    packageName: V4_PACKAGE,
    versions: { [V4_VERSION]: SYSTEM_A },
  });
  const { root } = createConsumer(t, { manifest: SYSTEM_A });
  const before = snapshot(root);

  const result = await runBin([
    "use",
    "@prism-system/ui-system-a",
    V4_VERSION,
    "--cwd",
    root,
    "--registry",
    registry.registry,
    "--dry-run",
    "--json",
  ]);

  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.tailwind, null);
  assert.deepEqual(
    report.plannedChanges.map((change) => change.kind),
    ["dependency", "connect", "connect", "connect"],
  );
  assert.deepEqual(snapshot(root), before, "use dry run must not mutate");
});

test("use --tailwind --dry-run --json forwards the CSS import plan", async (t) => {
  const registry = await startRegistry(t, {
    packageName: V4_PACKAGE,
    versions: { [V4_VERSION]: SYSTEM_A },
  });
  const cssBefore = "body { margin: 0; }\n";
  const { root } = createConsumer(t, { manifest: SYSTEM_A, tailwind: "4.1.0", css: cssBefore });
  const before = snapshot(root);

  const result = await runBin([
    "use",
    "@prism-system/ui-system-a",
    V4_VERSION,
    "--cwd",
    root,
    "--registry",
    registry.registry,
    "--tailwind",
    "--css",
    "src/app.css",
    "--dry-run",
    "--json",
  ]);

  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.tailwind.before, cssBefore);
  assert.equal(report.tailwind.changed, true);
  const cssChange = report.plannedChanges.find((change) => change.kind === "css");
  assert.equal(cssChange.path, join(root, "src", "app.css"));
  assert.equal(cssChange.after, report.tailwind.after);
  assert.deepEqual(snapshot(root), before, "use tailwind dry run must not write");
});

const upgradeFrom = structuredClone(SYSTEM_A);
upgradeFrom.version = "1.1.0";

const upgradeTo = structuredClone(SYSTEM_A);
upgradeTo.version = "2.0.0";
delete upgradeTo.components.Grid;
upgradeTo.components.Section = { variants: [], sizes: [], members: [] };

test("upgrade --dry-run --json reports the manifest diff and exact command", async (t) => {
  const registry = await startRegistry(t, {
    packageName: V4_PACKAGE,
    versions: { "2.0.0": upgradeTo },
  });
  const { root } = createConsumer(t, { manifest: upgradeFrom, connected: true });
  const before = snapshot(root);

  const result = await runBin([
    "upgrade",
    "@prism-system/ui-system-a",
    "2.0.0",
    "--cwd",
    root,
    "--registry",
    registry.registry,
    "--dry-run",
    "--json",
  ]);

  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.fromVersion, "1.1.0");
  assert.equal(report.toVersion, "2.0.0");
  assert.deepEqual(report.diff.components.removed, ["Grid"]);
  assert.deepEqual(report.diff.components.added, ["Section"]);
  assert.deepEqual(report.command.args, INSTALL_ARGS(V4_PACKAGE, "2.0.0", registry.registry));
  assert.deepEqual(
    report.plannedChanges.map((change) => change.kind),
    ["dependency", "connect", "connect", "connect"],
  );
  assert.deepEqual(snapshot(root), before, "upgrade dry run must not mutate");
});

test("upgrade enforces paired positionals and an exact version", async (t) => {
  const { root } = createConsumer(t, { manifest: upgradeFrom, connected: true });

  const missingVersion = await runBin(["upgrade", "@prism-system/ui-system-a", "--cwd", root]);
  assert.equal(missingVersion.exitCode, 1);
  assert.match(missingVersion.stderr, /requires an explicit exact <version>/);

  const missingTarget = await runBin(["upgrade", "--cwd", root]);
  assert.equal(missingTarget.exitCode, 1);
  assert.match(missingTarget.stderr, /requires a package or system id/);

  for (const version of ["1.2", "latest", "^1.0.0"]) {
    const result = await runBin([
      "upgrade",
      "@prism-system/ui-system-a",
      version,
      "--cwd",
      root,
      "--json",
    ]);
    assert.equal(result.exitCode, 1, version);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.boundary, "arguments");
  }

  const extra = await runBin([
    "upgrade",
    "@prism-system/ui-system-a",
    "2.0.0",
    "extra",
    "--cwd",
    root,
  ]);
  assert.equal(extra.exitCode, 1);
  assert.match(extra.stderr, /at most 2 positional/);
});

test("upgrade fails closed on --save-dev/--save-prod/--exact as unknown options", async (t) => {
  const { root } = createConsumer(t, { manifest: upgradeFrom, connected: true });
  const before = snapshot(root);

  const flags = ["--save-dev", "--save-prod", "--exact"];
  const messages = [];
  const originalStderr = process.stderr.write;
  process.stderr.write = (chunk) => {
    messages.push(String(chunk));
    return true;
  };
  try {
    for (const flag of flags) {
      // The binary reports the unknown option and exits non-zero.
      const result = await runBin([
        "upgrade",
        "@prism-system/ui-system-a",
        "2.0.0",
        flag,
        "--cwd",
        root,
      ]);
      assert.equal(result.exitCode, 1, flag);
      assert.match(result.stderr, new RegExp(`Unknown option: ${flag}`), flag);

      // In-process: argument parsing fails before any network attempt.
      const offline = await invokeOffline(runUpgradeCommand, [
        "@prism-system/ui-system-a",
        "2.0.0",
        flag,
        "--cwd",
        root,
      ]);
      assert.equal(offline.exitCode, 1, flag);
      assert.deepEqual(offline.networkAttempts, [], flag);
    }
  } finally {
    process.stderr.write = originalStderr;
  }

  assert.deepEqual(
    messages.map((message) => message.trim()),
    flags.map((flag) => `Unknown option: ${flag}`),
    "each removed option is rejected as unknown",
  );
  assert.deepEqual(snapshot(root), before, "a rejected option mutates nothing");
});

/* -------------------------------------------------------------------------- */
/* Offline guarantee (in-process, fetch records and throws)                   */
/* -------------------------------------------------------------------------- */

test("offline commands never attempt the network", async (t) => {
  const v4 = createConsumer(t, { manifest: SYSTEM_A, connected: true, tailwind: "4.1.0" });
  const pending = tailwindConsumer(t, "body { margin: 0; }\n");
  const pendingBefore = snapshot(pending.root);

  const components = await invokeOffline(runComponentsCommand, ["--cwd", v4.root, "--json"]);
  assert.equal(components.exitCode, undefined);
  assert.deepEqual(components.networkAttempts, []);

  const tokens = await invokeOffline(runTokensCommand, ["--cwd", v4.root, "--json"]);
  assert.equal(tokens.exitCode, undefined);
  assert.deepEqual(tokens.networkAttempts, []);

  const check = await invokeOffline(runCheckCommand, ["--cwd", v4.root, "--json"]);
  assert.equal(check.exitCode, undefined);
  assert.deepEqual(check.networkAttempts, []);

  const setup = await invokeOffline(runSetupTailwindCommand, [
    "--dry-run",
    "--cwd",
    pending.root,
    "--css",
    "src/app.css",
  ]);
  assert.equal(setup.exitCode, undefined);
  assert.deepEqual(setup.networkAttempts, []);
  assert.deepEqual(snapshot(pending.root), pendingBefore, "dry run wrote nothing");
});

test("upgrade argument validation happens before any network", async (t) => {
  const { root } = createConsumer(t, { manifest: upgradeFrom, connected: true });
  const invalid = await invokeOffline(runUpgradeCommand, [
    "@prism-system/ui-system-a",
    "latest",
    "--cwd",
    root,
    "--json",
  ]);
  assert.equal(invalid.exitCode, 1);
  assert.deepEqual(invalid.networkAttempts, [], "no registry request for an invalid version");
});
