import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import TuiApp from "../src/tui-app.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({
  id: "self-update-controller-test",
  title: "Self update",
  component: () => null,
});
const pause = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

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
        { registry, defaultScreen: "self-update-controller-test" },
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

function makePlan({ updateAvailable = true } = {}) {
  return {
    action: "self-update",
    scope: "local",
    installation: { kind: "local", manager: "pnpm", verified: true },
    packageName: "@prism-system/tools",
    currentVersion: "2.9.0",
    targetVersion: "3.0.0",
    updateAvailable,
    registry: "https://registry.npmjs.org/",
    cwd: "/consumer/demo-app",
    command: updateAvailable
      ? {
          manager: "pnpm",
          verb: "add",
          scope: "local",
          args: ["add", "@prism-system/tools@3.0.0"],
        }
      : null,
    preserveSection: "dependencies",
    postVerifySupported: true,
    globalRoot: null,
    failures: [],
    advice: updateAvailable
      ? "A newer CLI release is ready to review."
      : "prism-ds 2.9.0 is up to date.",
  };
}

/**
 * Production-shaped facade preview: availability lives on `plan`, and the
 * whole `result` object is nested. There is deliberately no top-level
 * `updateAvailable`, `currentVersion`, or `targetVersion`.
 */
function makePreview({ updateAvailable = true } = {}) {
  const plan = makePlan({ updateAvailable });
  const plannedChanges = updateAvailable
    ? [{ kind: "dependency", manager: "pnpm", command: plan.command }]
    : [];
  const raw = {
    ok: true,
    dryRun: true,
    changed: false,
    partial: false,
    state: updateAvailable ? "dry-run" : "up-to-date",
    packageName: "@prism-system/tools",
    failures: [],
    plan,
    plannedChanges,
  };
  return {
    ...raw,
    kind: "self-update",
    material: { plan, plannedChanges },
    result: raw,
  };
}

function checkResult(overrides = {}) {
  return {
    ok: true,
    available: true,
    current: "2.9.0",
    latest: "3.0.0",
    installation: { kind: "local", manager: "pnpm", verified: true },
    advice: "A newer CLI release is ready to review.",
    ...overrides,
  };
}

function makeServices({ preview = makePreview(), check = checkResult(), execute } = {}) {
  const calls = { checks: [], previews: [], executions: [] };
  const serviceExecute =
    execute ??
    (async () => ({
      ok: true,
      applied: true,
      changed: true,
      failures: [],
    }));
  const services = {
    cwd: "/consumer/demo-app",
    getProjectState: () => project,
    checkCliUpdate: async (options) => {
      calls.checks.push(options);
      return check;
    },
    previewCliUpdate: async (options) => {
      calls.previews.push(options);
      return preview;
    },
    executeCliUpdate: async (options, acceptedPreview) => {
      calls.executions.push({ options, acceptedPreview });
      return serviceExecute(options, acceptedPreview);
    },
  };
  return { services, calls, preview };
}

async function openUpdate(app) {
  await press(app, "m");
  await press(app, "u");
  await waitFor(app, (frame) => /Update prism-ds/.test(frame), "self-update page opens");
}

async function openPreview(app) {
  await press(app, "l");
  return waitFor(app, (frame) => /Confirm prism-ds CLI update/.test(frame), "update preview");
}

test("nested plan availability is accepted; cancel is inert and confirm executes the same preview once", async () => {
  const preview = makePreview();
  const { services, calls } = makeServices({ preview });
  const app = makeApp(services);
  await openUpdate(app);
  await waitFor(app, (frame) => /2\.9\.0/.test(frame) && /3\.0\.0/.test(frame), "versions appear");
  assert.equal(calls.previews.length, 0, "opening the page never previews or installs");

  await openPreview(app);
  assert.equal(calls.previews.length, 1, "one explicit review request");
  assert.deepEqual(calls.previews[0], {});

  await press(app, "escape");
  await waitFor(app, (frame) => /Cancelled/.test(frame), "cancel feedback");
  assert.equal(calls.executions.length, 0, "cancel never executes the preview");

  await openPreview(app);
  assert.equal(calls.previews.length, 2, "a fresh preview is requested after cancel");
  await press(app, "y");
  await waitFor(app, () => calls.executions.length === 1, "one confirmed execution");
  assert.deepEqual(calls.executions[0].options, {});
  assert.equal(
    calls.executions[0].acceptedPreview,
    preview,
    "the whole accepted preview is passed through untouched",
  );
  assert.equal(calls.executions.length, 1, "one confirmation produces exactly one execution");
  app.unmount();
});

test("a skipped explicit check is reported as skipped, never as up to date", async () => {
  const skipped = checkResult({
    ok: true,
    skipped: true,
    available: false,
    current: null,
    latest: null,
    advice: "PRISM_DS_UPDATE_CHECK=0 disabled the registry request.",
  });
  const { services, calls } = makeServices({ check: skipped });
  const app = makeApp(services);
  await openUpdate(app);
  await press(app, "c");
  const frame = await waitFor(
    app,
    (value) => /CLI update check skipped/.test(value),
    "explicit skipped-check feedback",
  );
  const text = normalize(frame);
  assert.match(text, /check skipped/i);
  assert.doesNotMatch(text, /CLI is up to date/);
  assert.match(text, /PRISM_DS_UPDATE_CHECK=0 disabled the registry request/);
  assert.deepEqual(calls.checks[0], { timeoutMs: 2500 });
  assert.equal(calls.executions.length, 0);
  app.unmount();
});

test("an up-to-date execution is reported as no change, without restart guidance", async () => {
  const preview = makePreview();
  const noChange = {
    ok: true,
    applied: true,
    changed: false,
    partial: false,
    boundary: null,
    failures: [],
    preview,
    result: {
      ok: true,
      dryRun: false,
      changed: false,
      partial: false,
      state: "up-to-date",
      packageName: "@prism-system/tools",
      failures: [],
      currentVersion: "3.0.0",
      targetVersion: "3.0.0",
      plan: { ...preview.plan, currentVersion: "3.0.0" },
    },
  };
  const { services } = makeServices({ preview, execute: async () => noChange });
  const app = makeApp(services);
  await openUpdate(app);
  await openPreview(app);
  await press(app, "y");
  const frame = await waitFor(
    app,
    (value) => /already up to date · no change/.test(value),
    "no-change feedback",
  );
  const text = normalize(frame);
  assert.doesNotMatch(text, /Restart prism-ds to use the updated CLI/);
  assert.doesNotMatch(text, /CLI update verified/);
  assert.match(text, /3\.0\.0\s*→\s*3\.0\.0/);
  app.unmount();
});

test("a verified update reports the installed version and requires a restart", async () => {
  const preview = makePreview();
  const installed = {
    ok: true,
    applied: true,
    changed: true,
    partial: false,
    boundary: null,
    failures: [],
    preview,
    result: {
      ok: true,
      dryRun: false,
      changed: true,
      partial: false,
      state: "verified",
      packageName: "@prism-system/tools",
      failures: [],
      managerExit: 0,
      installedVersion: "3.0.0",
      currentVersion: "2.9.0",
      targetVersion: "3.0.0",
      postVerify: { supported: true, verified: true, installedVersion: "3.0.0" },
      plan: preview.plan,
    },
  };
  const { services } = makeServices({ preview, execute: async () => installed });
  const app = makeApp(services);
  await openUpdate(app);
  await openPreview(app);
  await press(app, "y");
  const frame = await waitFor(
    app,
    (value) => /Restart prism-ds to use the updated CLI/.test(value),
    "verified update reports restart guidance",
  );
  const text = normalize(frame);
  assert.match(text, /CLI update verified/);
  assert.match(text, /3\.0\.0\s*→\s*3\.0\.0/, "verified installed version replaces the old one");
  app.unmount();
});

test("an unverified update never claims a verified installation or a no-change result", async () => {
  const preview = makePreview();
  const unverified = {
    ok: true,
    applied: true,
    changed: false,
    partial: true,
    boundary: null,
    failures: [],
    preview,
    result: {
      ok: true,
      dryRun: false,
      changed: false,
      partial: true,
      state: "unverified",
      packageName: "@prism-system/tools",
      failures: [],
      managerExit: 0,
      currentVersion: "2.9.0",
      targetVersion: "3.0.0",
      note: "pnpm exited 0, but this installation cannot be verified from here; confirm the installed version manually.",
      plan: preview.plan,
    },
  };
  const { services } = makeServices({ preview, execute: async () => unverified });
  const app = makeApp(services);
  await openUpdate(app);
  await openPreview(app);
  await press(app, "y");
  const frame = await waitFor(
    app,
    (value) => /verification incomplete/.test(value),
    "unverified update feedback",
  );
  const text = normalize(frame);
  assert.doesNotMatch(text, /CLI update verified/);
  assert.doesNotMatch(text, /Restart prism-ds to use the updated CLI/);
  assert.doesNotMatch(text, /already up to date|no change/i);
  assert.match(text, /2\.9\.0\s*→\s*3\.0\.0/, "the prior available version stays visible");
  app.unmount();
});

test("a manager failure never claims a verified installation or a no-change result", async () => {
  const preview = makePreview();
  const failure =
    "pnpm exited with code 1; the installation state is unknown and was not rolled back.";
  const failed = {
    ok: false,
    applied: true,
    changed: false,
    partial: true,
    boundary: "manager",
    failures: [failure],
    preview,
    result: {
      ok: false,
      boundary: "manager",
      changed: false,
      partial: true,
      state: "manager-failed",
      packageName: "@prism-system/tools",
      failures: [failure],
      managerExit: 1,
      currentVersion: "2.9.0",
      targetVersion: "3.0.0",
      plan: preview.plan,
    },
  };
  const { services } = makeServices({ preview, execute: async () => failed });
  const app = makeApp(services);
  await openUpdate(app);
  await openPreview(app);
  await press(app, "y");
  const frame = await waitFor(
    app,
    (value) => /CLI update failed · installation state unknown/.test(value),
    "manager failure feedback",
  );
  const text = normalize(frame);
  assert.match(text, /pnpm exited with code 1/);
  assert.doesNotMatch(text, /CLI update verified/);
  assert.doesNotMatch(text, /Restart prism-ds to use the updated CLI/);
  assert.doesNotMatch(text, /already up to date|no change/i);
  assert.match(text, /2\.9\.0\s*→\s*3\.0\.0/, "the prior available version stays visible");
  app.unmount();
});
