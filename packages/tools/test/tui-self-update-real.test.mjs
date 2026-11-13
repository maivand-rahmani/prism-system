/**
 * End-to-end TUI self-update integration against the real backend facade.
 *
 * A fresh temp consumer declares a fake installed `@prism-system/tools` copy at
 * the running version. The facade is wrapped only to supply that fake
 * `packageRoot` and an explicit newer `targetVersion`; preview and execution
 * are the real implementations. The fake manager spawn only rewrites the temp
 * installed package, and the injected fetch fails if anything tries the network.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import TuiApp from "../src/tui-app.mjs";
import { buildSpawnPlan } from "../src/package-manager.mjs";
import { CLI_PACKAGE_NAME, readCliPackageInfo } from "../src/self-update.mjs";
import { createTuiOperations } from "../src/tui-operations.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "self-update-real-test", title: "Self update", component: () => null });
const pause = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(app, predicate, message, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frame = app.lastFrame() ?? "";
    if (predicate(frame)) return frame;
    await pause();
  }
  assert.fail(`${message}\n${app.lastFrame() ?? ""}`);
}

async function press(app, key) {
  const input =
    {
      enter: "\r",
      escape: "\u001b",
      tab: "\t",
      down: "\u001b[B",
      up: "\u001b[A",
    }[key] ?? key;
  app.stdin.write(input);
  await pause();
}

async function collectUntil(app, pattern, limit = 40) {
  let frames = app.lastFrame() ?? "";
  for (let index = 0; index < limit && !pattern.test(normalize(frames)); index += 1) {
    await press(app, "down");
    frames += `\n${app.lastFrame() ?? ""}`;
  }
  assert.match(normalize(frames), pattern);
  return frames;
}

const normalize = (value) => value.replace(/\s+/g, " ").trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createRealUpdateFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "prism-tui-self-update-real-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const current = readCliPackageInfo().version;
  writeJsonFile(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    packageManager: "npm@10.0.0",
    devDependencies: { [CLI_PACKAGE_NAME]: current },
  });
  const installed = join(root, "node_modules", "@prism-system", "tools");
  writeJsonFile(join(installed, "package.json"), {
    name: CLI_PACKAGE_NAME,
    version: current,
    exports: { ".": "./src/index.mjs", "./package.json": "./package.json" },
  });
  mkdirSync(join(installed, "src"), { recursive: true });
  writeFileSync(join(installed, "src", "index.mjs"), "export {};\n", "utf8");
  const [major, minor, patch] = current.split(".").map(Number);
  return { root, installed, current, target: `${major}.${minor}.${patch + 1}` };
}

function expectedLocalArgs(version) {
  return [
    "install",
    "--save-dev",
    "--save-exact",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    `${CLI_PACKAGE_NAME}@${version}`,
  ];
}

function updateSpawn(installed, version, record) {
  return (command, args, options) => {
    record.push({ command, args, options });
    writeJsonFile(join(installed, "package.json"), {
      name: CLI_PACKAGE_NAME,
      version,
      exports: { ".": "./src/index.mjs", "./package.json": "./package.json" },
    });
    return { status: 0, error: null, stdout: Buffer.from("updated\n"), stderr: Buffer.alloc(0) };
  };
}

function makeApp(services, columns = 80, rows = 24) {
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column" },
      h(
        FrameworkProvider,
        { registry, defaultScreen: "self-update-real-test" },
        h(TuiApp, { services }),
      ),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: columns });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: rows });
  app.stdout.emit("resize");
  return app;
}

test("real TUI update: preview is inert, cancel is inert, confirm executes the reviewed plan once", async (t) => {
  const fixture = createRealUpdateFixture(t);
  const spawnCalls = [];
  const fetchCalls = [];
  const previews = [];
  const acceptedPreviews = [];
  const outcomes = [];
  const facade = createTuiOperations({
    cwd: fixture.root,
    spawnImpl: updateSpawn(fixture.installed, fixture.target, spawnCalls),
    fetchImpl: async () => {
      fetchCalls.push("fetch");
      throw new Error("the TUI integration test must stay offline");
    },
  });
  const services = {
    ...facade,
    // The version check is read-only and injected: this test never reads npm.
    checkCliUpdate: async () => ({
      ok: true,
      skipped: false,
      available: true,
      current: fixture.current,
      latest: fixture.target,
      installation: { kind: "local", manager: "npm", verified: true },
      advice: "A newer prism-ds release is ready to review.",
    }),
    previewCliUpdate: async (options = {}) => {
      const preview = await facade.previewCliUpdate({
        ...options,
        packageRoot: fixture.installed,
        targetVersion: fixture.target,
      });
      previews.push(preview);
      return preview;
    },
    executeCliUpdate: async (options = {}, acceptedPreview) => {
      acceptedPreviews.push(acceptedPreview);
      const outcome = await facade.executeCliUpdate(
        { ...options, packageRoot: fixture.installed, targetVersion: fixture.target },
        acceptedPreview,
      );
      outcomes.push(outcome);
      return outcome;
    },
  };

  const app = makeApp(services, 80, 24);
  await press(app, "m");
  await press(app, "u");
  const home = await waitFor(
    app,
    (frame) => /Update prism-ds/.test(frame) && /UPDATE THIS LOCAL INSTALL/.test(frame),
    "Manage → Update opens the self-update page",
  );
  const homeText = normalize(home);
  assert.match(
    homeText,
    new RegExp(`${escapeRegex(fixture.current)}\\s*→\\s*${escapeRegex(fixture.target)}`),
  );
  assert.equal(previews.length, 0, "opening the update page never previews");
  assert.equal(spawnCalls.length, 0, "opening the update page never spawns");

  await press(app, "l");
  const confirm = await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "local CLI update confirmation opens",
  );
  assert.match(normalize(confirm), /CURRENT VERSION/);
  const plannedCommand = ["npm", ...expectedLocalArgs(fixture.target)].join(" ");
  // At 80x24 the exact target and command require the shell's scroll region.
  const confirmText = normalize(await collectUntil(app, new RegExp(escapeRegex(plannedCommand))));
  assert.match(confirmText, /CURRENT VERSION/);
  assert.match(confirmText, new RegExp(escapeRegex(fixture.current)));
  assert.match(confirmText, /TARGET VERSION/);
  assert.match(confirmText, new RegExp(escapeRegex(fixture.target)));
  assert.ok(
    confirmText.includes(plannedCommand),
    `confirmation shows the exact planned command\n${confirmText}`,
  );
  assert.equal(previews.length, 1, "one explicit preview request");
  assert.equal(previews[0].ok, true);
  assert.equal(previews[0].updateAvailable, true);
  assert.equal(previews[0].currentVersion, fixture.current);
  assert.equal(previews[0].targetVersion, fixture.target);
  assert.deepEqual(previews[0].plan.command.args, expectedLocalArgs(fixture.target));
  assert.equal(spawnCalls.length, 0, "preview never spawns the manager");
  assert.equal(fetchCalls.length, 0, "an exact target version needs no registry read");

  await press(app, "escape");
  await waitFor(app, (frame) => /Cancelled/.test(frame), "cancel feedback");
  assert.equal(spawnCalls.length, 0, "cancel never spawns");
  assert.equal(acceptedPreviews.length, 0, "cancel never executes a preview");

  await press(app, "l");
  await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "a fresh local confirmation opens after cancel",
  );
  assert.equal(previews.length, 2, "a fresh preview is planned after cancel");
  assert.equal(spawnCalls.length, 0, "the fresh preview is still inert");

  await press(app, "y");
  const verified = await waitFor(
    app,
    (frame) =>
      /CLI update verified/.test(frame) && /Restart prism-ds to use the updated CLI/.test(frame),
    "the real verified update and its restart guidance appear",
  );
  assert.match(normalize(verified), /CLI update verified/);
  assert.equal(spawnCalls.length, 1, "confirm executes exactly one real backend update");
  assert.equal(fetchCalls.length, 0, "the whole flow stayed offline");
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].ok, true);
  assert.equal(outcomes[0].changed, true);
  assert.equal(outcomes[0].applied, true);
  assert.equal(outcomes[0].result.state, "verified");
  assert.equal(outcomes[0].result.installedVersion, fixture.target);
  assert.equal(outcomes[0].preview.material.plan.command.args.join(" "), plannedCommand.slice(4));

  const accepted = acceptedPreviews[0];
  assert.strictEqual(
    accepted,
    previews[1],
    "the whole accepted preview is passed through untouched",
  );
  assert.equal(accepted.kind, "self-update");
  assert.equal(accepted.dryRun, true);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.updateAvailable, true);
  assert.equal(accepted.currentVersion, fixture.current);
  assert.equal(accepted.targetVersion, fixture.target);
  assert.equal(accepted.plan.scope, "local");
  assert.equal(accepted.plan.command.args.includes("--global"), false);
  assert.equal(accepted.plan.updateAvailable, true);
  assert.deepEqual(accepted.plan.command.args, expectedLocalArgs(fixture.target));
  assert.deepEqual(accepted.material.plan, accepted.plan);
  assert.equal(accepted.material.plannedChanges.length, 1);

  const expectedSpawn = buildSpawnPlan({
    manager: "npm",
    args: expectedLocalArgs(fixture.target),
  });
  assert.equal(spawnCalls[0].command, expectedSpawn.command);
  assert.deepEqual(spawnCalls[0].args, expectedSpawn.args);
  assert.equal(spawnCalls[0].options.cwd, fixture.root);
  assert.notEqual(spawnCalls[0].options.stdio, "inherit");
  assert.equal(Array.isArray(spawnCalls[0].options.stdio), true);
  assert.equal(spawnCalls[0].options.stdio.includes("inherit"), false);
  assert.equal(spawnCalls[0].options.stdio[0], "ignore");

  const installedPackage = JSON.parse(
    readFileSync(join(fixture.installed, "package.json"), "utf8"),
  );
  assert.equal(installedPackage.version, fixture.target, "only the temp fake CLI was updated");
  app.unmount();
});
