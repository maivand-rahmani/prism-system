import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import TuiApp from "../src/tui-app.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({
  id: "self-update-shortcuts-test",
  title: "Self update",
  component: () => null,
});
const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const project = {
  ok: true,
  status: "connected",
  cwd: "/consumer/demo-app",
  packageName: "@prism-system/ui-a",
  version: "1.2.3",
  contractVersion: 4,
  failures: [],
  config: { package: "@prism-system/ui-a", version: "1.2.3", strict: true },
};

function makeApp(services, columns = 80, rows = 40) {
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column" },
      h(
        FrameworkProvider,
        { registry, defaultScreen: "self-update-shortcuts-test" },
        h(TuiApp, { services }),
      ),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: columns });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: rows });
  app.stdout.emit("resize");
  return app;
}

async function waitFor(app, predicate, message, timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frame = app.lastFrame() ?? "";
    if (predicate(frame)) return frame;
    await pause();
  }
  assert.fail(`${message}\n${app.lastFrame() ?? ""}`);
}

async function press(app, key) {
  const input = { enter: "\r", escape: "\u001b", tab: "\t" }[key] ?? key;
  app.stdin.write(input);
  await pause();
}

const normalize = (value) => value.replace(/\s+/g, " ");

function makeCheck({
  kind = "local",
  manager = null,
  verified = true,
  available = true,
  skipped = false,
  current = "2.9.0",
  latest = available ? "3.0.0" : current,
} = {}) {
  return {
    ok: true,
    skipped,
    reason: skipped ? "disabled" : null,
    available,
    current,
    latest,
    installation: { kind, manager, verified, explicit: false },
    error: null,
    advice: skipped
      ? "PRISM_DS_UPDATE_CHECK=0 disabled the registry request."
      : available
        ? "A newer CLI release is ready to review."
        : "prism-ds is already up to date.",
  };
}

function makePreview(options, fallbackManager) {
  const manager = options.global ? options.manager : (options.manager ?? fallbackManager ?? "pnpm");
  const scope = options.global ? "global" : "local";
  const plan = {
    action: "self-update",
    scope,
    installation: { kind: scope, manager, verified: true },
    packageName: "@prism-system/tools",
    currentVersion: "2.9.0",
    targetVersion: "3.0.0",
    updateAvailable: true,
    command: {
      manager,
      verb: options.global ? "install" : "add",
      args: options.global
        ? ["install", "-g", "@prism-system/tools@3.0.0"]
        : ["add", "@prism-system/tools@3.0.0"],
    },
    postVerifySupported: true,
    failures: [],
    advice: "Review the exact package manager command before applying.",
  };
  const plannedChanges = [{ kind: "dependency", manager, command: plan.command }];
  return {
    ok: true,
    dryRun: true,
    kind: "self-update",
    state: "dry-run",
    plan,
    plannedChanges,
    material: { plan, plannedChanges },
    result: { ok: true, dryRun: true, state: "dry-run", plan, plannedChanges },
  };
}

function makeServices({ check, fallbackManager = "pnpm" }) {
  const calls = { checks: [], previews: [], executions: [] };
  const services = {
    cwd: "/consumer/demo-app",
    getProjectState: () => project,
    checkCliUpdate: async (options) => {
      calls.checks.push(options);
      return check;
    },
    previewCliUpdate: async (options) => {
      calls.previews.push(options);
      return makePreview(options, fallbackManager);
    },
    executeCliUpdate: async (options, preview) => {
      calls.executions.push({ options, preview });
      return { ok: true, applied: true, changed: true, failures: [] };
    },
  };
  return { services, calls };
}

async function openUpdate(app, marker = /2\.9\.0/) {
  await press(app, "m");
  await press(app, "u");
  await waitFor(app, (frame) => /Update prism-ds/.test(frame), "self-update page opens");
  await waitFor(app, (frame) => marker.test(frame), "startup update check result");
}

test("local preview stays blocked with no detected manager until npm is explicitly selected", async () => {
  const check = makeCheck({ kind: "local", manager: null, verified: true, available: true });
  const { services, calls } = makeServices({ check });
  const app = makeApp(services);
  await openUpdate(app, /No package manager was detected/);

  await press(app, "l");
  await waitFor(
    app,
    (frame) => /Choose npm or pnpm first/.test(frame),
    "blocked local shortcut notice",
  );
  assert.equal(calls.previews.length, 0, "a blocked local shortcut never previews");

  await press(app, "n");
  await waitFor(app, (frame) => /Selected manager:\s*npm/.test(frame), "npm selection");
  await press(app, "l");
  await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "local preview after explicit manager",
  );
  assert.deepEqual(calls.previews, [{ manager: "npm" }]);
  await press(app, "escape");
  await waitFor(app, (frame) => /Cancelled/.test(frame), "cancel feedback");
  assert.equal(calls.executions.length, 0);
  app.unmount();
});

test("a detected local pnpm manager is never overridden by the manager chosen for a global target", async () => {
  const check = makeCheck({ kind: "local", manager: "pnpm", verified: true, available: true });
  const { services, calls } = makeServices({ check, fallbackManager: "pnpm" });
  const app = makeApp(services);
  await openUpdate(app, /Detected manager: pnpm/);

  await press(app, "n");
  await pause();
  await press(app, "g");
  await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "explicit global preview",
  );
  assert.deepEqual(calls.previews, [{ global: true, manager: "npm" }]);
  await press(app, "escape");
  await waitFor(app, (frame) => /Cancelled/.test(frame), "global cancel feedback");

  await press(app, "l");
  await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "local preview with detected manager",
  );
  assert.deepEqual(calls.previews, [{ global: true, manager: "npm" }, {}]);
  assert.equal(calls.executions.length, 0);
  app.unmount();
});

test("an ephemeral npx copy never previews in place but can target a global install explicitly", async () => {
  const check = makeCheck({ kind: "ephemeral", manager: null, verified: false, available: true });
  const { services, calls } = makeServices({ check });
  const app = makeApp(services);
  await openUpdate(app, /OPTIONAL: TARGET A GLOBAL INSTALL/);

  await press(app, "l");
  await waitFor(
    app,
    (frame) => /cannot be updated in place/i.test(frame),
    "ephemeral local shortcut blocked",
  );
  assert.equal(calls.previews.length, 0, "an ephemeral copy never previews a local update");

  await press(app, "n");
  await pause();
  await press(app, "g");
  await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "explicit global preview from ephemeral context",
  );
  assert.deepEqual(calls.previews, [{ global: true, manager: "npm" }]);
  await press(app, "escape");
  await waitFor(app, (frame) => /Cancelled/.test(frame), "cancel feedback");
  assert.equal(calls.executions.length, 0);
  app.unmount();
});

test("no-update and skipped checks cannot preview, while the explicit check stays accessible", async () => {
  const upToDate = makeCheck({
    kind: "local",
    manager: "pnpm",
    verified: true,
    available: false,
    current: "3.0.0",
  });
  const available = makeServices({ check: upToDate });
  const app = makeApp(available.services);
  await openUpdate(app, /No update is available/);

  await press(app, "l");
  await waitFor(
    app,
    (frame) => /No CLI update is available to preview/.test(frame),
    "no-update local shortcut notice",
  );
  assert.equal(available.calls.previews.length, 0);
  await press(app, "g");
  assert.equal(available.calls.previews.length, 0, "global preview also requires an update");

  const checksBefore = available.calls.checks.length;
  await press(app, "c");
  await waitFor(
    app,
    () => available.calls.checks.length > checksBefore,
    "explicit check remains accessible",
  );
  app.unmount();

  const skipped = makeCheck({
    kind: "local",
    manager: "pnpm",
    verified: true,
    available: false,
    skipped: true,
    current: "2.9.0",
    latest: null,
  });
  const skippedServices = makeServices({ check: skipped });
  const skippedApp = makeApp(skippedServices.services);
  await openUpdate(skippedApp, /2\.9\.0/);
  await press(skippedApp, "l");
  await waitFor(
    skippedApp,
    (frame) => /No CLI update is available to preview/.test(frame),
    "skipped local shortcut notice",
  );
  assert.equal(skippedServices.calls.previews.length, 0);
  await press(skippedApp, "g");
  assert.equal(skippedServices.calls.previews.length, 0, "skipped check cannot target global");
  skippedApp.unmount();
});

test("canceling a shortcut preview never executes the update", async () => {
  const check = makeCheck({ kind: "local", manager: "pnpm", verified: true, available: true });
  const { services, calls } = makeServices({ check });
  const app = makeApp(services);
  await openUpdate(app, /Detected manager: pnpm/);
  await press(app, "l");
  const frame = await waitFor(
    app,
    (value) => /Confirm prism-ds CLI update/.test(value),
    "local preview",
  );
  assert.match(normalize(frame), /pnpm add @prism-system\/tools@3\.0\.0/);
  await press(app, "escape");
  await waitFor(app, (value) => /Cancelled/.test(value), "cancel feedback");
  assert.equal(calls.executions.length, 0);
  app.unmount();
});
