#!/usr/bin/env node
/**
 * Tests for installation-aware prism-ds self-update.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/self-update.test.mjs
 *
 * Every case uses a fake fetch implementation, a fake spawn implementation, or
 * injected package roots inside fresh temp directories. No test reaches the
 * network, spawns a real package manager, writes to a user installation, or
 * mutates the repository.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";

import { buildSpawnPlan } from "../src/package-manager.mjs";
import {
  CLI_PACKAGE_NAME,
  INSTALLATION_KINDS,
  UPDATE_CHECK_ENV,
  checkCliUpdate,
  detectCliInstallation,
  isUpdateCheckDisabled,
  planSelfUpdate,
  readCliPackageInfo,
  selfUpdate,
} from "../src/self-update.mjs";

const NEWER = "99.0.0";
const OLDER = "0.0.1";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

/** Recursively snapshot a directory as relative-path -> content. */
function snapshotTree(root) {
  const result = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) result[relative(root, full)] = readFileSync(full, "utf8");
    }
  };
  walk(root);
  return result;
}

function createConsumer(t, options = {}) {
  const {
    dependencies = {},
    devDependencies = {},
    packageManager,
    lockfile = "package-lock.json",
  } = options;
  const root = mkdtempSync(join(tmpdir(), "prism-self-update-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const pkg = { name: "consumer-app", version: "0.0.0", private: true };
  if (Object.keys(dependencies).length > 0) pkg.dependencies = dependencies;
  if (Object.keys(devDependencies).length > 0) pkg.devDependencies = devDependencies;
  if (packageManager) pkg.packageManager = packageManager;
  writeJson(join(root, "package.json"), pkg);
  if (lockfile) writeFileSync(join(root, lockfile), "", "utf8");
  return root;
}

/** Create a fake installed @prism-system/tools copy and return its root. */
function installFakeCli(root, version) {
  const dir = join(root, "node_modules", "@prism-system", "tools");
  writeJson(join(dir, "package.json"), {
    name: CLI_PACKAGE_NAME,
    version,
    exports: { ".": "./src/index.mjs", "./package.json": "./package.json" },
  });
  writeFile(dir, "src/index.mjs", "export {};\n");
  return dir;
}

function fakePackumentFetch(latest, { name = CLI_PACKAGE_NAME, record = [] } = {}) {
  return async (url, options) => {
    record.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () =>
        Buffer.from(
          JSON.stringify({
            name,
            "dist-tags": { latest },
            versions: { [latest]: { name, version: latest } },
          }),
        ),
    };
  };
}

function fakeResponse({ status = 200, ok = true, contentLength = null, bytes = "{}" } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => (name === "content-length" ? contentLength : null) },
    body: null,
    arrayBuffer: async () => Buffer.from(bytes),
  };
}

/* -------------------------------------------------------------------------- */
/* Package info and check                                                     */
/* -------------------------------------------------------------------------- */

test("readCliPackageInfo reads the running package version without a repo root", () => {
  const info = readCliPackageInfo();
  assert.equal(info.name, CLI_PACKAGE_NAME);
  assert.equal(typeof info.version, "string");
  assert.match(info.version, /^\d+\.\d+\.\d+/);
  assert.equal(info.packageJson.name, CLI_PACKAGE_NAME);
});

test("checkCliUpdate reports an available update and installation-aware advice", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const result = await checkCliUpdate({
    cwd: root,
    packageRoot: installedDir,
    fetchImpl: fakePackumentFetch(NEWER),
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.equal(result.latest, NEWER);
  assert.equal(result.available, true);
  assert.equal(result.installation.kind, "local");
  assert.equal(result.installation.manager, "npm");
  assert.match(result.advice, /self-update --cwd/);
  assert.match(result.advice, /--save-dev/);
});

test("checkCliUpdate reports up to date without an update command", async (t) => {
  const root = createConsumer(t, { dependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const result = await checkCliUpdate({
    cwd: root,
    packageRoot: installedDir,
    fetchImpl: fakePackumentFetch(OLDER),
  });
  assert.equal(result.ok, true);
  assert.equal(result.available, false);
  assert.match(result.advice, /up to date/);
});

test("checkCliUpdate never throws and reports an invalid latest tag", async () => {
  const result = await checkCliUpdate({ fetchImpl: fakePackumentFetch("latest") });
  assert.equal(result.ok, false);
  assert.equal(result.latest, null);
  assert.match(result.error, /dist-tags\.latest/);
  assert.equal(result.available, false);
});

test("checkCliUpdate rejects a packument with the wrong package name", async () => {
  const result = await checkCliUpdate({
    fetchImpl: fakePackumentFetch(NEWER, { name: "@prism-system/ui-other" }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /does not match/);
});

test("checkCliUpdate rejects redirects, credentials, timeouts, and oversized bodies", async () => {
  const redirect = await checkCliUpdate({
    fetchImpl: async () => fakeResponse({ status: 302, ok: false }),
  });
  assert.equal(redirect.ok, false);
  assert.match(redirect.error, /302/);

  let fetched = false;
  const credentials = await checkCliUpdate({
    registryUrl: "https://user:secret@registry.npmjs.org",
    fetchImpl: async () => {
      fetched = true;
      return fakeResponse();
    },
  });
  assert.equal(credentials.ok, false);
  assert.match(credentials.error, /credentials/);
  assert.equal(fetched, false);

  const hangingFetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  const timeout = await checkCliUpdate({ fetchImpl: hangingFetch, timeoutMs: 5 });
  assert.equal(timeout.ok, false);
  assert.match(timeout.error, /timed out/);

  const oversized = await checkCliUpdate({
    fetchImpl: async () => fakeResponse({ contentLength: String(50 * 1024 * 1024) }),
    maxBytes: 1024,
  });
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /size limit/);
});

test("checkCliUpdate respects PRISM_DS_UPDATE_CHECK=0 and the offline option without fetching", async () => {
  assert.equal(isUpdateCheckDisabled({ [UPDATE_CHECK_ENV]: "0" }), true);
  assert.equal(isUpdateCheckDisabled({ [UPDATE_CHECK_ENV]: "false" }), true);
  assert.equal(isUpdateCheckDisabled({ [UPDATE_CHECK_ENV]: "1" }), false);
  assert.equal(isUpdateCheckDisabled({}), false);

  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse();
  };
  const disabled = await checkCliUpdate({
    env: { [UPDATE_CHECK_ENV]: "0" },
    fetchImpl,
  });
  assert.equal(disabled.skipped, true);
  assert.equal(disabled.reason, "disabled");
  assert.equal(disabled.available, false);
  assert.equal(calls, 0);

  const offline = await checkCliUpdate({ offline: true, fetchImpl });
  assert.equal(offline.skipped, true);
  assert.equal(offline.reason, "offline");
  assert.equal(calls, 0);
});

test("checkCliUpdate writes nothing to the consumer", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const before = snapshotTree(root);
  await checkCliUpdate({
    cwd: root,
    packageRoot: installedDir,
    fetchImpl: fakePackumentFetch(NEWER),
  });
  assert.deepEqual(snapshotTree(root), before);
});

/* -------------------------------------------------------------------------- */
/* Installation detection                                                     */
/* -------------------------------------------------------------------------- */

test("detectCliInstallation classifies local, global, ephemeral, workspace, source, and unknown", (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-install-kinds-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const consumer = join(root, "consumer");
  writeJson(join(consumer, "package.json"), {
    name: "consumer",
    dependencies: { [CLI_PACKAGE_NAME]: "1.0.0" },
  });
  writeFileSync(join(consumer, "package-lock.json"), "", "utf8");
  const localDir = installFakeCli(consumer, "1.0.0");
  const local = detectCliInstallation({ cwd: consumer, packageRoot: localDir });
  assert.equal(local.kind, "local");
  assert.equal(local.manager, "npm");
  assert.equal(local.section, "dependencies");

  const appdata = join(root, "appdata");
  const globalDir = join(appdata, "npm", "node_modules", "@prism-system", "tools");
  writeJson(join(globalDir, "package.json"), { name: CLI_PACKAGE_NAME, version: "1.0.0" });
  const global = detectCliInstallation({ packageRoot: globalDir, env: { APPDATA: appdata } });
  assert.equal(global.kind, "global");
  assert.equal(global.manager, "npm");
  assert.equal(global.verified, true);

  const ephemeralDir = join(
    root,
    "cache",
    "_npx",
    "abc123",
    "node_modules",
    "@prism-system",
    "tools",
  );
  mkdirSync(ephemeralDir, { recursive: true });
  const ephemeral = detectCliInstallation({ packageRoot: ephemeralDir });
  assert.equal(ephemeral.kind, "ephemeral");

  const workspaceDir = join(root, "ws", "packages", "tools");
  writeJson(join(workspaceDir, "package.json"), { name: CLI_PACKAGE_NAME, version: "1.0.0" });
  writeFileSync(join(root, "ws", "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  const workspace = detectCliInstallation({ packageRoot: workspaceDir });
  assert.equal(workspace.kind, "workspace");

  const sourceDir = join(root, "checkout", "packages", "tools");
  writeJson(join(sourceDir, "package.json"), { name: CLI_PACKAGE_NAME, version: "1.0.0" });
  const source = detectCliInstallation({ packageRoot: sourceDir });
  assert.equal(source.kind, "source");

  const unknownDir = join(root, "elsewhere", "node_modules", "@prism-system", "tools");
  mkdirSync(unknownDir, { recursive: true });
  const unknownConsumer = join(root, "unknown-consumer");
  writeJson(join(unknownConsumer, "package.json"), { name: "unknown-consumer" });
  const unknown = detectCliInstallation({ cwd: unknownConsumer, packageRoot: unknownDir });
  assert.equal(unknown.kind, "unknown");

  for (const kind of [local, global, ephemeral, workspace, source, unknown]) {
    assert.ok(INSTALLATION_KINDS.includes(kind.kind));
  }
});

test("detectCliInstallation never guesses a global manager", () => {
  const detection = detectCliInstallation({
    global: true,
    packageRoot: null,
    env: {},
  });
  assert.equal(detection.kind, "global");
  assert.equal(detection.manager, null);
  assert.equal(detection.verified, false);
});

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

test("planSelfUpdate builds the exact npm argv and preserves the dev section", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const plan = await planSelfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: NEWER,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.scope, "local");
  assert.equal(plan.packageName, CLI_PACKAGE_NAME);
  assert.equal(plan.targetVersion, NEWER);
  assert.equal(plan.preserveSection, "devDependencies");
  assert.deepEqual(plan.command.args, [
    "install",
    "--save-dev",
    "--save-exact",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    `${CLI_PACKAGE_NAME}@${NEWER}`,
  ]);
  assert.equal(plan.cwd, root);
});

test("planSelfUpdate preserves a production section and uses pnpm when declared", async (t) => {
  const npmRoot = createConsumer(t, { dependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const npmInstalled = installFakeCli(npmRoot, "1.0.0");
  const npmPlan = await planSelfUpdate({
    cwd: npmRoot,
    packageRoot: npmInstalled,
    targetVersion: NEWER,
  });
  assert.deepEqual(npmPlan.command.args, [
    "install",
    "--save-prod",
    "--save-exact",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    `${CLI_PACKAGE_NAME}@${NEWER}`,
  ]);

  const pnpmRoot = createConsumer(t, {
    dependencies: { [CLI_PACKAGE_NAME]: "1.0.0" },
    packageManager: "pnpm@10.34.5",
    lockfile: "pnpm-lock.yaml",
  });
  const pnpmInstalled = installFakeCli(pnpmRoot, "1.0.0");
  const pnpmPlan = await planSelfUpdate({
    cwd: pnpmRoot,
    packageRoot: pnpmInstalled,
    targetVersion: NEWER,
  });
  assert.equal(pnpmPlan.command.manager, "pnpm");
  assert.deepEqual(pnpmPlan.command.args, [
    "add",
    "--save-prod",
    "--save-exact",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    `${CLI_PACKAGE_NAME}@${NEWER}`,
  ]);
});

test("planSelfUpdate global requires an explicit manager when the root is unverified", async (t) => {
  const root = createConsumer(t, { dependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const withoutManager = await planSelfUpdate({
    cwd: root,
    global: true,
    packageRoot: installedDir,
    targetVersion: NEWER,
  });
  assert.equal(withoutManager.ok, false);
  assert.equal(withoutManager.boundary, "manager");
  assert.match(withoutManager.failures.join(" "), /--manager/);

  const npmPlan = await planSelfUpdate({
    cwd: root,
    global: true,
    manager: "npm",
    packageRoot: installedDir,
    targetVersion: NEWER,
  });
  assert.equal(npmPlan.ok, true);
  assert.equal(npmPlan.scope, "global");
  assert.deepEqual(npmPlan.command.args, [
    "install",
    "--global",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    `${CLI_PACKAGE_NAME}@${NEWER}`,
  ]);
  assert.equal(npmPlan.postVerifySupported, false);

  const pnpmPlan = await planSelfUpdate({
    cwd: root,
    global: true,
    manager: "pnpm",
    packageRoot: installedDir,
    targetVersion: NEWER,
  });
  assert.equal(pnpmPlan.command.manager, "pnpm");
  assert.deepEqual(pnpmPlan.command.args, [
    "add",
    "--global",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    `${CLI_PACKAGE_NAME}@${NEWER}`,
  ]);
});

test("planSelfUpdate verifies a conventional global root and supports post-verify", (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-global-root-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const appdata = join(root, "appdata");
  const globalDir = join(appdata, "npm", "node_modules", "@prism-system", "tools");
  writeJson(join(globalDir, "package.json"), { name: CLI_PACKAGE_NAME, version: "1.0.0" });
  return planSelfUpdate({
    packageRoot: globalDir,
    env: { APPDATA: appdata },
    targetVersion: NEWER,
  }).then((plan) => {
    assert.equal(plan.ok, true);
    assert.equal(plan.scope, "global");
    assert.equal(plan.installation.verified, true);
    assert.equal(plan.postVerifySupported, true);
    assert.equal(plan.globalRoot, join(appdata, "npm", "node_modules"));
  });
});

test("planSelfUpdate never assumes global for ephemeral, workspace, source, or unknown", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-no-guess-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const cases = [
    {
      name: "ephemeral",
      dir: join(root, "cache", "_npx", "abc", "node_modules", "@prism-system", "tools"),
      advice: /Do not assume a global install/,
    },
    {
      name: "workspace",
      dir: join(root, "ws", "packages", "tools"),
      advice: /workspace link/,
    },
    {
      name: "source",
      dir: join(root, "checkout", "packages", "tools"),
      advice: /source checkout/,
    },
    {
      name: "unknown",
      dir: join(root, "elsewhere", "node_modules", "@prism-system", "tools"),
      advice: /do not run a global install unless/,
    },
  ];
  for (const item of cases) {
    writeJson(join(item.dir, "package.json"), { name: CLI_PACKAGE_NAME, version: "1.0.0" });
    if (item.name === "workspace") {
      writeFileSync(join(root, "ws", "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
    }
    const plan = await planSelfUpdate({
      packageRoot: item.dir,
      targetVersion: NEWER,
      env: {},
    });
    assert.equal(plan.ok, false, `${item.name} must not be mutated`);
    assert.equal(plan.boundary, "installation");
    assert.equal(plan.command, undefined);
    assert.match(plan.advice, item.advice);
  }
});

test("planSelfUpdate fails closed offline and on invalid target versions", async (t) => {
  const root = createConsumer(t, { dependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const offline = await planSelfUpdate({ cwd: root, packageRoot: installedDir, offline: true });
  assert.equal(offline.ok, false);
  assert.equal(offline.boundary, "offline");

  const invalid = await planSelfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: "latest",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.boundary, "version");

  const registryError = await planSelfUpdate({
    cwd: root,
    packageRoot: installedDir,
    fetchImpl: async () => {
      throw new Error("offline test");
    },
  });
  assert.equal(registryError.ok, false);
  assert.equal(registryError.boundary, "registry");
});

/* -------------------------------------------------------------------------- */
/* Execution                                                                  */
/* -------------------------------------------------------------------------- */

function captureSpawn(record, { status = 0, onSpawn = null } = {}) {
  return (command, args, options) => {
    record.push({ command, args, options });
    if (onSpawn) onSpawn();
    return { status, error: null };
  };
}

test("selfUpdate refuses to mutate without explicit confirmation", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const before = snapshotTree(root);
  const spawnCalls = [];
  const result = await selfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: NEWER,
    confirmed: false,
    spawnImpl: captureSpawn(spawnCalls),
  });
  assert.equal(result.ok, false);
  assert.equal(result.boundary, "consent");
  assert.equal(spawnCalls.length, 0);
  assert.deepEqual(snapshotTree(root), before);
});

test("selfUpdate dry-run plans the exact command without spawning or writing", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const before = snapshotTree(root);
  const spawnCalls = [];
  const result = await selfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: NEWER,
    dryRun: true,
    spawnImpl: captureSpawn(spawnCalls),
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "dry-run");
  assert.equal(result.changed, false);
  assert.equal(spawnCalls.length, 0);
  assert.deepEqual(snapshotTree(root), before);
  assert.equal(result.plannedChanges[0].command.manager, "npm");
});

test("selfUpdate blocks on expected-plan drift before any spawn", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const expectedPlan = await planSelfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: "98.0.0",
  });
  const spawnCalls = [];
  const result = await selfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: NEWER,
    confirmed: true,
    expectedPlan,
    spawnImpl: captureSpawn(spawnCalls),
  });
  assert.equal(result.ok, false);
  assert.equal(result.boundary, "precondition");
  assert.equal(spawnCalls.length, 0);
  assert.match(result.failures.join(" "), /targetVersion changed/);
});

test("selfUpdate runs the exact planned argv, post-verifies, and reports verified", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const expectedArgs = [
    "install",
    "--save-dev",
    "--save-exact",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    `${CLI_PACKAGE_NAME}@${NEWER}`,
  ];
  const spawnCalls = [];
  const result = await selfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: NEWER,
    confirmed: true,
    spawnImpl: captureSpawn(spawnCalls, {
      onSpawn: () =>
        writeJson(join(installedDir, "package.json"), {
          name: CLI_PACKAGE_NAME,
          version: NEWER,
          exports: { "./package.json": "./package.json" },
        }),
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "verified");
  assert.equal(result.changed, true);
  assert.equal(result.partial, false);
  assert.equal(result.postVerify.installedVersion, NEWER);
  const expected = buildSpawnPlan({ manager: "npm", args: expectedArgs });
  assert.equal(spawnCalls[0].command, expected.command);
  assert.deepEqual(spawnCalls[0].args, expected.args);
  assert.equal(spawnCalls[0].options.cwd, root);
});

test("selfUpdate reports a manager failure and a post-verify mismatch without rollback promises", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");

  const failedCalls = [];
  const managerFailure = await selfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: NEWER,
    confirmed: true,
    spawnImpl: captureSpawn(failedCalls, { status: 2 }),
  });
  assert.equal(managerFailure.ok, false);
  assert.equal(managerFailure.boundary, "manager");
  assert.equal(managerFailure.state, "manager-failed");
  assert.equal(managerFailure.partial, true);
  assert.match(managerFailure.failures.join(" "), /not rolled back/);

  const mismatchCalls = [];
  const mismatch = await selfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: NEWER,
    confirmed: true,
    spawnImpl: captureSpawn(mismatchCalls),
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.boundary, "verify");
  assert.equal(mismatch.state, "verify-mismatch");
  assert.equal(mismatch.partial, true);
  assert.equal(mismatch.postVerify.installedVersion, "1.0.0");
  assert.match(mismatch.failures.join(" "), /No rollback was attempted/);
});

test("selfUpdate reports an unverified global install as an explicit partial state", async (t) => {
  const root = createConsumer(t, { dependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const spawnCalls = [];
  const result = await selfUpdate({
    cwd: root,
    global: true,
    manager: "npm",
    packageRoot: installedDir,
    targetVersion: NEWER,
    confirmed: true,
    spawnImpl: captureSpawn(spawnCalls),
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "unverified");
  assert.equal(result.changed, false);
  assert.equal(result.partial, true);
  assert.equal(result.postVerify.supported, false);
  assert.deepEqual(
    spawnCalls[0].args,
    buildSpawnPlan({
      manager: "npm",
      args: [
        "install",
        "--global",
        "--ignore-scripts",
        "--registry=https://registry.npmjs.org",
        `${CLI_PACKAGE_NAME}@${NEWER}`,
      ],
    }).args,
  );
});

test("selfUpdate verifies a conventional global install after the spawn", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-global-update-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const appdata = join(root, "appdata");
  const globalDir = join(appdata, "npm", "node_modules", "@prism-system", "tools");
  writeJson(join(globalDir, "package.json"), { name: CLI_PACKAGE_NAME, version: "1.0.0" });
  const spawnCalls = [];
  const result = await selfUpdate({
    packageRoot: globalDir,
    env: { APPDATA: appdata },
    targetVersion: NEWER,
    confirmed: true,
    spawnImpl: captureSpawn(spawnCalls, {
      onSpawn: () =>
        writeJson(join(globalDir, "package.json"), { name: CLI_PACKAGE_NAME, version: NEWER }),
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "verified");
  assert.equal(result.changed, true);
  assert.equal(result.postVerify.installedVersion, NEWER);
  assert.deepEqual(
    spawnCalls[0].args,
    buildSpawnPlan({
      manager: "npm",
      args: [
        "install",
        "--global",
        "--ignore-scripts",
        "--registry=https://registry.npmjs.org",
        `${CLI_PACKAGE_NAME}@${NEWER}`,
      ],
    }).args,
  );
});

test("selfUpdate is a no-op when the current version is already latest", async (t) => {
  const root = createConsumer(t, { devDependencies: { [CLI_PACKAGE_NAME]: "1.0.0" } });
  const installedDir = installFakeCli(root, "1.0.0");
  const spawnCalls = [];
  const result = await selfUpdate({
    cwd: root,
    packageRoot: installedDir,
    targetVersion: OLDER,
    confirmed: true,
    spawnImpl: captureSpawn(spawnCalls),
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "up-to-date");
  assert.equal(result.changed, false);
  assert.equal(spawnCalls.length, 0);
});
