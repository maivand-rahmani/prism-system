#!/usr/bin/env node
/**
 * Direct CLI tests for `prism-ds self-update` and `prism-ds recover`.
 *
 * Run (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/cli-update-recovery.test.mjs
 *
 * Strategy:
 *
 *   - Help, dispatch, and validation run the real `bin/prism-ds.mjs` executable
 *     as a subprocess, so stdout/stderr/exit codes are captured cleanly.
 *   - `self-update` registry reads point at an in-process fake registry bound to
 *     127.0.0.1. No test ever spawns a real package manager: a fake npm/pnpm
 *     shim is placed first on PATH and records any spawn, and every mutation
 *     path under test is either `--check`, `--dry-run`, or a missing-consent
 *     refusal that returns before spawning.
 *   - `recover` cases use disposable temp consumers; only the explicit
 *     `--action ... --yes` cases write, and only inside the temp root.
 *   - The offline guarantee is proven in-process by stubbing `globalThis.fetch`
 *     to record (and throw on) any network attempt.
 *
 * No real user installation, skill, or repository state is touched.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";

import {
  helpText,
  recoverHelpText,
  runRecoverCommand,
  runSelfUpdateCommand,
  selfUpdateHelpText,
} from "../src/cli.mjs";
import { MANAGED_BLOCK_BEGIN } from "../src/consumer.mjs";
import { currentManifest, readJson, repoRoot } from "./manifest-fixture.mjs";

const binPath = join(repoRoot, "packages", "tools", "bin", "prism-ds.mjs");
const TOOLS_PACKAGE = "@prism-system/tools";

const SYSTEM_A = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
);

/* -------------------------------------------------------------------------- */
/* Subprocess runner                                                          */
/* -------------------------------------------------------------------------- */

/** Run the real CLI binary, resolving with captured streams and exit code. */
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
/* Fake registry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Start an in-process fake npm registry that answers the `@prism-system/tools`
 * packument. Only the version check is needed for self-update, so no tarball is
 * served. Returns the base URL and the live request log.
 */
async function startToolsRegistry(t, { latest = "99.0.0", status = 200 } = {}) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (status !== 200) {
      response.writeHead(status);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        name: TOOLS_PACKAGE,
        "dist-tags": { latest },
        versions: { [latest]: { name: TOOLS_PACKAGE, version: latest } },
      }),
    );
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const registry = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  return { registry, requests };
}

/* -------------------------------------------------------------------------- */
/* Fake package-manager shims (spawn detector)                                */
/* -------------------------------------------------------------------------- */

/**
 * Create a directory holding fake `npm`/`pnpm` executables that record a spawn.
 * Prepending it to PATH proves that a case never invoked a package manager
 * without risking a real installation.
 */
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
/* In-process invocation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Run an exported command in-process while capturing streams, exit code, and a
 * stubbed `globalThis.fetch`, so offline behavior can be proven without a real
 * network attempt.
 */
async function invokeInProcess(runFn, argv, { fetchImpl } = {}) {
  const previousExit = process.exitCode;
  const previousFetch = globalThis.fetch;
  const previousStdout = process.stdout.write;
  const previousStderr = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.exitCode = undefined;
  if (fetchImpl !== undefined) globalThis.fetch = fetchImpl;
  // Under `node --test`, the runner's child protocol pipes V8-serialized binary
  // events through `process.stdout`; only the command's text output belongs in
  // the captured stream.
  process.stdout.write = (chunk) => {
    if (typeof chunk === "string") stdout += chunk;
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += chunk;
    return true;
  };
  let thrown = null;
  try {
    await runFn(argv);
  } catch (error) {
    thrown = error;
  } finally {
    process.stdout.write = previousStdout;
    process.stderr.write = previousStderr;
    globalThis.fetch = previousFetch;
  }
  const exitCode = process.exitCode;
  process.exitCode = previousExit;
  if (thrown !== null) throw thrown;
  return { stdout, stderr, exitCode };
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
  { connected = false, tailwind = null, css = null, agents = null, rawConfig = null } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "prism-cli-recover-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const dependencies = { [SYSTEM_A.package]: SYSTEM_A.version };
  if (tailwind !== null) dependencies.tailwindcss = tailwind;
  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    packageManager: "npm@10.0.0",
    dependencies,
  });

  if (rawConfig !== null) {
    writeFile(root, ".design-system/config.json", rawConfig);
  } else if (connected) {
    writeJson(join(root, ".design-system", "config.json"), {
      $schema:
        "https://github.com/maivand-rahmani/prism-system/schemas/design-system-consumer.schema.json",
      schemaVersion: 1,
      package: SYSTEM_A.package,
      version: SYSTEM_A.version,
      manifest: "./manifest",
      strict: true,
    });
  }

  const packageDir = join(root, "node_modules", ...SYSTEM_A.package.split("/"));
  writeJson(join(packageDir, "package.json"), {
    name: SYSTEM_A.package,
    version: SYSTEM_A.version,
    exports: {
      "./manifest": "./design-system.json",
      "./tailwind.css": "./dist/tailwind.css",
      "./styles.css": "./dist/index.css",
    },
  });
  writeJson(join(packageDir, "design-system.json"), SYSTEM_A);
  writeFile(packageDir, "dist/tailwind.css", "/* tailwind bridge */\n");
  writeFile(packageDir, "dist/index.css", "/* styles */\n");

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
  if (agents !== null) writeFile(root, "AGENTS.md", agents);

  return { root, packageName: SYSTEM_A.package };
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
/* Help and dispatch                                                          */
/* -------------------------------------------------------------------------- */

test("root help and the new command helps document self-update and recover", async (t) => {
  const { dir, marker } = createFakeManagerDir(t);

  const root = await runBin(["--help"], { env: managerEnv(dir) });
  assert.equal(root.exitCode, 0);
  assert.equal(root.stdout, helpText());
  assert.match(root.stdout, /self-update/);
  assert.match(root.stdout, /recover/);

  const selfUpdate = await runBin(["self-update", "--help"], { env: managerEnv(dir) });
  assert.equal(selfUpdate.exitCode, 0);
  assert.equal(selfUpdate.stderr, "");
  assert.equal(selfUpdate.stdout, selfUpdateHelpText());
  for (const flag of [
    "--check",
    "--cwd",
    "--global",
    "--manager",
    "--registry",
    "--dry-run",
    "--yes",
    "--json",
  ]) {
    assert.match(selfUpdate.stdout, new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(selfUpdate.stdout, /not `upgrade`/);
  assert.match(selfUpdate.stdout, /never touches a design system/);

  const recover = await runBin(["recover", "--help"], { env: managerEnv(dir) });
  assert.equal(recover.exitCode, 0);
  assert.equal(recover.stderr, "");
  assert.equal(recover.stdout, recoverHelpText());
  for (const flag of ["--cwd", "--css", "--entry", "--action", "--dry-run", "--yes", "--json"]) {
    assert.match(recover.stdout, new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(existsSync(marker), false, "help must never spawn a package manager");
});

test("index.mjs re-exports the completed self-update and recovery modules", async () => {
  const index = await import("../src/index.mjs");
  assert.equal(typeof index.selfUpdate, "function");
  assert.equal(typeof index.checkCliUpdate, "function");
  assert.equal(typeof index.planSelfUpdate, "function");
  assert.equal(typeof index.selfUpdateHelpText, "function");
  assert.equal(typeof index.executeRecoveryAction, "function");
  assert.equal(typeof index.previewRecoveryAction, "function");
  assert.equal(typeof index.collectRecoveryReport, "function");
  assert.equal(typeof index.recoverHelpText, "function");
});

test("self-update and recover backends stay lazily imported by the CLI", () => {
  const cli = readFileSync(join(repoRoot, "packages", "tools", "src", "cli.mjs"), "utf8");
  assert.match(cli, /await import\("\.\/self-update\.mjs"\)/u);
  assert.match(cli, /await import\("\.\/recovery\.mjs"\)/u);
  assert.doesNotMatch(cli, /^import\s[^\n]*from\s+["']\.\/self-update\.mjs["']/mu);
  assert.doesNotMatch(cli, /^import\s[^\n]*from\s+["']\.\/recovery\.mjs["']/mu);

  const index = readFileSync(join(repoRoot, "packages", "tools", "src", "index.mjs"), "utf8");
  assert.match(index, /export \* from "\.\/self-update\.mjs"/u);
  assert.match(index, /export \* from "\.\/recovery\.mjs"/u);
});

/* -------------------------------------------------------------------------- */
/* self-update                                                                */
/* -------------------------------------------------------------------------- */

test("self-update --check is read-only, bounded, and never spawns", async (t) => {
  const registry = await startToolsRegistry(t, { latest: "99.0.0" });
  const { dir, marker } = createFakeManagerDir(t);
  const env = managerEnv(dir);

  const json = await runBin(["self-update", "--check", "--registry", registry.registry, "--json"], {
    env,
  });
  assert.equal(json.exitCode, 0);
  assert.equal(json.stderr, "");
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.latest, "99.0.0");
  assert.equal(report.available, true);
  assert.equal(typeof report.current, "string");
  assert.ok(["workspace", "source"].includes(report.installation.kind));
  assert.equal(registry.requests.length, 1, "exactly one bounded registry read");
  assert.equal(existsSync(marker), false, "check must never spawn a manager");

  const human = await runBin(["self-update", "--check", "--registry", registry.registry], { env });
  assert.equal(human.exitCode, 0);
  assert.match(human.stdout, /update available: 99\.0\.0/);
  assert.match(human.stdout, /Read-only check: nothing was written or spawned\./);
  assert.equal(existsSync(marker), false);
});

test("self-update --check conflicts with mutation flags before any network", async (t) => {
  const registry = await startToolsRegistry(t);
  const { dir, marker } = createFakeManagerDir(t);
  const env = managerEnv(dir);

  for (const flag of ["--yes", "--dry-run"]) {
    const result = await runBin(["self-update", "--check", flag, "--registry", registry.registry], {
      env,
    });
    assert.equal(result.exitCode, 1, `--check ${flag} fails closed`);
    assert.match(result.stderr, /--check is read-only and cannot be combined/);
  }
  assert.equal(registry.requests.length, 0, "the conflict is rejected before the registry read");
  assert.equal(existsSync(marker), false);
});

test("self-update refuses to mutate without --yes and never spawns", async (t) => {
  const registry = await startToolsRegistry(t, { latest: "99.0.0" });
  const { dir, marker } = createFakeManagerDir(t);
  const env = managerEnv(dir);

  const json = await runBin(
    ["self-update", "--global", "--manager", "npm", "--registry", registry.registry, "--json"],
    { env },
  );
  assert.equal(json.exitCode, 1);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "consent");
  assert.equal(report.plan.ok, true);
  assert.equal(report.plan.updateAvailable, true);
  assert.equal(report.plan.command.manager, "npm");
  assert.ok(report.plan.command.args.includes("--global"));
  assert.ok(report.plan.command.args.includes(`${TOOLS_PACKAGE}@99.0.0`));
  assert.equal(existsSync(marker), false, "no-consent must never spawn");

  const human = await runBin(
    ["self-update", "--global", "--manager", "npm", "--registry", registry.registry],
    { env },
  );
  assert.equal(human.exitCode, 1);
  assert.match(human.stdout, /Self-update requires explicit confirmation/);
  assert.match(human.stdout, /Re-run with --yes/);
  assert.match(human.stdout, /planned command: npm install --global/);
  assert.match(human.stdout, /Nothing was spawned or written\./);
  assert.equal(existsSync(marker), false);
});

test("self-update --dry-run plans the fixed command even with --yes and never spawns", async (t) => {
  const registry = await startToolsRegistry(t, { latest: "99.0.0" });
  const { dir, marker } = createFakeManagerDir(t);
  const env = managerEnv(dir);

  const json = await runBin(
    [
      "self-update",
      "--global",
      "--manager",
      "npm",
      "--dry-run",
      "--yes",
      "--registry",
      registry.registry,
      "--json",
    ],
    { env },
  );
  assert.equal(json.exitCode, 0);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.state, "dry-run");
  assert.equal(report.changed, false);
  const planned = report.plannedChanges[0].command;
  assert.equal(planned.manager, "npm");
  assert.ok(planned.args.includes("--global"));
  assert.ok(planned.args.includes("--ignore-scripts"));
  assert.ok(planned.args.includes(`${TOOLS_PACKAGE}@99.0.0`));
  assert.equal(existsSync(marker), false, "--dry-run must never spawn even with --yes");

  const human = await runBin(
    [
      "self-update",
      "--global",
      "--manager",
      "npm",
      "--dry-run",
      "--yes",
      "--registry",
      registry.registry,
    ],
    { env },
  );
  assert.equal(human.exitCode, 0);
  assert.match(human.stdout, /Self-update dry run/);
  assert.match(human.stdout, /command: npm install --global/);
  assert.match(human.stdout, /Dry run: nothing was spawned or written\./);
  assert.equal(existsSync(marker), false);
});

test("self-update never assumes a source/workspace installation", async (t) => {
  const registry = await startToolsRegistry(t, { latest: "99.0.0" });
  const { dir, marker } = createFakeManagerDir(t);
  const consumer = createConsumer(t, { connected: true });

  const json = await runBin(
    ["self-update", "--cwd", consumer.root, "--registry", registry.registry, "--json"],
    { env: managerEnv(dir) },
  );
  assert.equal(json.exitCode, 1);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "installation");
  assert.ok(["workspace", "source"].includes(report.plan.installation.kind));
  assert.match(report.plan.advice, /workspace|source/);
  assert.equal(report.changed, false);
  assert.equal(existsSync(marker), false, "a source/workspace checkout is never mutated");
});

test("self-update rejects an unsupported manager before the network", async (t) => {
  const registry = await startToolsRegistry(t);
  const { dir, marker } = createFakeManagerDir(t);

  const result = await runBin(
    ["self-update", "--global", "--manager", "yarn", "--registry", registry.registry],
    { env: managerEnv(dir) },
  );
  assert.equal(result.exitCode, 1);
  assert.match(`${result.stdout}${result.stderr}`, /only npm and pnpm are supported/);
  assert.equal(registry.requests.length, 0);
  assert.equal(existsSync(marker), false);
});

test("self-update reports registry failures cleanly and spawns nothing", async (t) => {
  const failing = await startToolsRegistry(t, { status: 500 });
  const { dir, marker } = createFakeManagerDir(t);
  const env = managerEnv(dir);

  const check = await runBin(["self-update", "--check", "--registry", failing.registry], { env });
  assert.equal(check.exitCode, 1);
  assert.match(check.stdout, /update check failed/);
  assert.match(check.stdout, /Registry responded 500/);
  assert.match(check.stdout, /Read-only check: nothing was written or spawned\./);

  const plan = await runBin(
    ["self-update", "--global", "--manager", "npm", "--dry-run", "--registry", failing.registry],
    { env },
  );
  assert.equal(plan.exitCode, 1);
  assert.match(plan.stdout, /Self-update cannot proceed/);
  assert.match(plan.stdout, /Registry responded 500/);
  assert.match(plan.stdout, /Nothing was spawned or written\./);
  assert.equal(existsSync(marker), false);
});

test("in-process capture ignores binary test-runner protocol writes", async () => {
  const result = await invokeInProcess(async () => {
    // Mirrors the V8-serialized events Node's test runner pipes through
    // `process.stdout` in a test-file child process.
    process.stdout.write(Buffer.from([0xff, 0x0f, 0x00, 0x00, 0x00, 0x40]));
    process.stdout.write(JSON.stringify({ ok: true }));
  }, []);
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true });
  assert.equal(result.stderr, "");
});

test("self-update --check stays non-throwing offline in-process", async () => {
  let attempts = 0;
  const result = await invokeInProcess(runSelfUpdateCommand, ["--check"], {
    fetchImpl: () => {
      attempts += 1;
      throw new Error("network must not be used");
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(attempts, 1, "the check performs one bounded read and then degrades");
  assert.match(result.stdout, /update check failed/);
  assert.match(result.stdout, /network must not be used/);
  assert.match(result.stdout, /Read-only check: nothing was written or spawned\./);
});

test("self-update help never imports the backend or reads the network", async () => {
  let attempts = 0;
  const result = await invokeInProcess(runSelfUpdateCommand, ["--help"], {
    fetchImpl: () => {
      attempts += 1;
      throw new Error("help must not fetch");
    },
  });
  assert.equal(result.exitCode, undefined);
  assert.equal(attempts, 0);
  assert.equal(result.stdout, selfUpdateHelpText());
  assert.equal(result.stderr, "");
});

/* -------------------------------------------------------------------------- */
/* recover                                                                    */
/* -------------------------------------------------------------------------- */

test("recover is read-only by default and reports issues with suggestions", async (t) => {
  const { root } = createConsumer(t, { connected: false });
  const before = snapshot(root);

  const json = await runBin(["recover", "--cwd", root, "--json"]);
  assert.equal(json.exitCode, 1);
  assert.equal(json.stderr, "");
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.id === "connection"));
  const connect = report.suggestions.find((item) => item.id === "connect");
  assert.ok(connect, "a missing connection suggests connect");
  assert.equal(connect.executable, true);
  assert.equal(connect.requiresConfirmation, true);
  assert.deepEqual(connect.command, { bin: "prism-ds", args: ["connect", "--cwd", root] });
  assert.deepEqual(snapshot(root), before, "default recover must not write");

  const human = await runBin(["recover", "--cwd", root]);
  assert.equal(human.exitCode, 1);
  assert.match(human.stdout, /prism-ds recover: \d+ issue\(s\)/);
  assert.match(human.stdout, /connect\s+\[executable; requires --yes\]/);
  assert.match(human.stdout, /--action <id> --yes/);
  assert.deepEqual(snapshot(root), before);
});

test("recover reports a healthy consumer and exits zero", async (t) => {
  const { root } = createConsumer(t, { connected: true });
  const before = snapshot(root);

  const json = await runBin(["recover", "--cwd", root, "--json"]);
  assert.equal(json.exitCode, 0);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.suggestions, []);

  const human = await runBin(["recover", "--cwd", root]);
  assert.equal(human.exitCode, 0);
  assert.match(human.stdout, /healthy/);
  assert.match(human.stdout, /No issues found/);
  assert.deepEqual(snapshot(root), before);
});

test("recover requires --cwd and validates conflicting options", async (t) => {
  const { root } = createConsumer(t, { connected: false });

  const missing = await runBin(["recover"]);
  assert.equal(missing.exitCode, 1);
  assert.match(missing.stderr, /requires an explicit --cwd/);

  const yesAlone = await runBin(["recover", "--cwd", root, "--yes"]);
  assert.equal(yesAlone.exitCode, 1);
  assert.match(yesAlone.stderr, /require --action/);

  const dryAlone = await runBin(["recover", "--cwd", root, "--dry-run"]);
  assert.equal(dryAlone.exitCode, 1);
  assert.match(dryAlone.stderr, /require --action/);

  const bothPackages = await runBin([
    "recover",
    "--cwd",
    root,
    "--package",
    SYSTEM_A.package,
    "@prism-system/ui-other",
  ]);
  assert.equal(bothPackages.exitCode, 1);
  assert.match(bothPackages.stderr, /either positionally or with --package/);

  const unknown = await runBin(["recover", "--cwd", root, "--bogus"]);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stderr, /Unknown option: --bogus/);
});

test("recover previews a connect action and requires --yes for any write", async (t) => {
  const { root } = createConsumer(t, { connected: false });
  const before = snapshot(root);

  const previewJson = await runBin(["recover", "--cwd", root, "--action", "connect", "--json"]);
  assert.equal(previewJson.exitCode, 1);
  const preview = JSON.parse(previewJson.stdout);
  assert.equal(preview.mode, "preview");
  assert.equal(preview.ok, true);
  assert.equal(preview.kind, "connect");
  assert.equal(preview.requiresConfirmation, true);
  assert.ok(preview.changes.length > 0);
  assert.ok(preview.plan.files.some((file) => file.changed === true));
  assert.deepEqual(snapshot(root), before, "preview must not write");

  const previewHuman = await runBin(["recover", "--cwd", root, "--action", "connect"]);
  assert.equal(previewHuman.exitCode, 1);
  assert.match(previewHuman.stdout, /requires --yes; nothing was written/);
  assert.match(previewHuman.stdout, /next: prism-ds recover --cwd .* --action connect --yes/);
  assert.deepEqual(snapshot(root), before);

  const dryRun = await runBin([
    "recover",
    "--cwd",
    root,
    "--action",
    "connect",
    "--dry-run",
    "--yes",
    "--json",
  ]);
  assert.equal(dryRun.exitCode, 0);
  assert.equal(JSON.parse(dryRun.stdout).mode, "dry-run");
  assert.deepEqual(snapshot(root), before, "--dry-run must not write even with --yes");
});

test("recover executes a connect repair only with --yes and reports the recheck", async (t) => {
  const { root } = createConsumer(t, { connected: false });
  const before = snapshot(root);

  const result = await runBin(["recover", "--cwd", root, "--action", "connect", "--yes", "--json"]);
  assert.equal(result.exitCode, 0);
  const executed = JSON.parse(result.stdout);
  assert.equal(executed.mode, "execute");
  assert.equal(executed.actionCompleted, true);
  assert.equal(executed.repaired, true);
  assert.equal(executed.healthy, true);
  assert.deepEqual(executed.stillRemaining, []);
  assert.ok(existsSync(join(root, ".design-system", "config.json")));
  assert.ok(existsSync(join(root, "AGENTS.md")));
  assert.notDeepEqual(snapshot(root), before, "the confirmed repair writes the contract");

  const second = createConsumer(t, { connected: false });
  const human = await runBin(["recover", "--cwd", second.root, "--action", "connect", "--yes"]);
  assert.equal(human.exitCode, 0);
  assert.match(human.stdout, /actionCompleted: true/);
  assert.match(human.stdout, /repaired: true/);
  assert.match(human.stdout, /healthy: true/);
  assert.match(human.stdout, /The targeted issue was repaired/);
});

test("recover executes an applicable setup-tailwind repair and rechecks it", async (t) => {
  const { root } = createConsumer(t, {
    connected: true,
    tailwind: "4.1.0",
    css: "body { margin: 0; }\n",
  });

  const preview = await runBin([
    "recover",
    "--cwd",
    root,
    "--css",
    "src/app.css",
    "--action",
    "setup-tailwind",
    "--dry-run",
    "--json",
  ]);
  assert.equal(preview.exitCode, 0);
  const planned = JSON.parse(preview.stdout);
  assert.equal(planned.mode, "dry-run");
  assert.equal(planned.kind, "setup-tailwind");
  assert.ok(planned.changes.length > 0);

  const result = await runBin([
    "recover",
    "--cwd",
    root,
    "--css",
    "src/app.css",
    "--action",
    "setup-tailwind",
    "--yes",
    "--json",
  ]);
  assert.equal(result.exitCode, 0);
  const executed = JSON.parse(result.stdout);
  assert.equal(executed.actionCompleted, true);
  assert.equal(executed.repaired, true);
  assert.equal(executed.healthy, true);
  const css = readFileSync(join(root, "src", "app.css"), "utf8");
  assert.match(css, /@import "tailwindcss";/);
  assert.match(
    css,
    new RegExp(`@import "${SYSTEM_A.package.replace(/[/@]/g, "\\$&")}/tailwind\\.css";`),
  );
});

test("recover refuses unknown or non-executable actions and lists valid suggestions", async (t) => {
  const { root } = createConsumer(t, { connected: false });
  const before = snapshot(root);

  const result = await runBin([
    "recover",
    "--cwd",
    root,
    "--action",
    "does-not-exist",
    "--yes",
    "--json",
  ]);
  assert.equal(result.exitCode, 1);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.mode, "preview");
  assert.equal(preview.ok, false);
  assert.equal(preview.boundary, "action");
  assert.ok(preview.suggestions.some((item) => item.id === "connect"));
  assert.deepEqual(snapshot(root), before);

  const human = await runBin(["recover", "--cwd", root, "--action", "does-not-exist", "--yes"]);
  assert.equal(human.exitCode, 1);
  assert.match(human.stdout, /Unknown recovery action/);
  assert.match(human.stdout, /Applicable suggestions for the current state:/);
  assert.match(human.stdout, /connect\s+\[executable; requires --yes\]/);
  assert.deepEqual(snapshot(root), before);
});

test("recover reports a failed repair instead of hiding it", async (t) => {
  const { root } = createConsumer(t, {
    connected: false,
    agents: `${MANAGED_BLOCK_BEGIN}\nbroken\n${MANAGED_BLOCK_BEGIN}\n`,
  });
  const before = snapshot(root);

  const result = await runBin(["recover", "--cwd", root, "--action", "connect", "--yes", "--json"]);
  assert.equal(result.exitCode, 1);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.mode, "preview");
  assert.equal(preview.ok, false);
  assert.equal(preview.boundary, "preview");
  assert.ok(preview.failures.length > 0);
  assert.equal(existsSync(join(root, ".design-system", "config.json")), false);
  assert.deepEqual(snapshot(root), before);

  const human = await runBin(["recover", "--cwd", root, "--action", "connect", "--yes"]);
  assert.equal(human.exitCode, 1);
  assert.match(human.stdout, /cannot be executed \(boundary: preview\)/);
  assert.match(human.stdout, /malformed or partial/);
});

test("recover stays offline and help never loads the backend", async (t) => {
  const { root } = createConsumer(t, { connected: false });
  let attempts = 0;
  const fetchImpl = () => {
    attempts += 1;
    throw new Error("network must not be used by recover");
  };

  const readOnly = await invokeInProcess(runRecoverCommand, ["--cwd", root, "--json"], {
    fetchImpl,
  });
  assert.equal(readOnly.exitCode, 1);
  assert.equal(attempts, 0);
  assert.equal(JSON.parse(readOnly.stdout).ok, false);

  const help = await invokeInProcess(runRecoverCommand, ["--help"], { fetchImpl });
  assert.equal(help.exitCode, undefined);
  assert.equal(attempts, 0);
  assert.equal(help.stdout, recoverHelpText());
});

/* -------------------------------------------------------------------------- */
/* doctor / check recovery pointers                                           */
/* -------------------------------------------------------------------------- */

test("failed doctor and check point at recover without writing", async (t) => {
  const { root } = createConsumer(t, { rawConfig: "{ not json\n" });
  const before = snapshot(root);

  const doctor = await runBin(["doctor", "--cwd", root]);
  assert.equal(doctor.exitCode, 1);
  assert.match(doctor.stdout, /Doctor found \d+ problem\(s\)/);
  assert.match(doctor.stdout, /recover --cwd .* for applicable recovery suggestions/);

  const check = await runBin(["check", "--cwd", root]);
  assert.equal(check.exitCode, 1);
  assert.match(check.stdout, /Check failed\./);
  assert.match(check.stdout, /recover --cwd .* for applicable recovery suggestions/);

  assert.deepEqual(snapshot(root), before, "the pointer must not mutate the consumer");
});
