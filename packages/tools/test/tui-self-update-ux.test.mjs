import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import TuiApp from "../src/tui-app.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "self-update-test", title: "Self update", component: () => null });
const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(app, predicate, message) {
  const start = Date.now();
  while (Date.now() - start < 1500) {
    if (predicate(app.lastFrame() ?? "")) return app.lastFrame() ?? "";
    await pause();
  }
  assert.fail(`${message}\n${app.lastFrame()}`);
}

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

function makeApp(services, columns = 80, rows = 24, mouseEventSource) {
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column" },
      h(
        FrameworkProvider,
        { registry, defaultScreen: "self-update-test", mouseEventSource },
        h(TuiApp, { services }),
      ),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: columns });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: rows });
  app.stdout.emit("resize");
  return app;
}

function createMouseSource() {
  const listeners = new Set();
  return {
    publish(event) {
      for (const listener of [...listeners]) listener(event);
    },
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}

async function clickLabel(app, mouse, label) {
  const lines = (app.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  assert.notEqual(row, -1, `visible control ${label}`);
  const column = lines[row].indexOf(label) + 2;
  const packet = (type, x, y) => ({
    type,
    x,
    y,
    button: type === "move" ? "none" : "left",
    shift: false,
    alt: false,
    ctrl: false,
  });
  mouse.publish(packet("move", 79, 0));
  await pause();
  mouse.publish(packet("move", column, row));
  await pause();
  mouse.publish(packet("press", column, row));
  mouse.publish(packet("release", column, row));
  await pause();
}

async function press(app, key) {
  const input = { enter: "\r", escape: "\u001b", tab: "\t" }[key] ?? key;
  app.stdin.write(input);
  await pause();
  return app.lastFrame() ?? "";
}

function updateServices(
  kind,
  {
    manager = null,
    failure = null,
    checkResult = {},
    verified = kind === "local" || kind === "global",
  } = {},
) {
  const previews = [];
  const acceptedPreviews = [];
  const executions = [];
  const checks = [];
  const accepted = {
    ok: true,
    dryRun: true,
    kind: "self-update",
    updateAvailable: true,
    currentVersion: "2.9.0",
    targetVersion: "3.0.0",
    plan: {
      packageName: "@prism-system/tools",
      currentVersion: "2.9.0",
      targetVersion: "3.0.0",
      scope: kind,
      installation: { kind, manager, verified },
      command: {
        manager: kind === "global" ? "npm" : "pnpm",
        verb: "install",
        args:
          kind === "global"
            ? ["install", "-g", "@prism-system/tools@3.0.0"]
            : ["add", "@prism-system/tools@3.0.0"],
      },
      postVerifySupported: true,
    },
    material: { source: "fake-registry", reviewed: true },
  };
  const services = {
    cwd: "/consumer/demo-app",
    getProjectState: () => project,
    checkCliUpdate: async (options) => {
      checks.push(options);
      return {
        ok: true,
        available: true,
        current: "2.9.0",
        latest: "3.0.0",
        installation: { kind, manager, verified },
        advice: "A newer CLI release is ready to review.",
        ...checkResult,
      };
    },
    previewCliUpdate: async (options) => {
      previews.push(options);
      if (failure) return failure;
      if (!options.global && kind === "local" && !options.manager && !manager) {
        return {
          ok: false,
          failures: ["No package manager was explicitly selected."],
          advice: "Choose npm or pnpm, then preview again.",
        };
      }
      const selectedManager = options.manager ?? manager ?? "pnpm";
      const preview = {
        ...accepted,
        plan: {
          ...accepted.plan,
          scope: options.global ? "global" : "local",
          installation: {
            kind: options.global ? "global" : kind,
            manager: selectedManager,
            verified: true,
          },
          command: {
            manager: selectedManager,
            verb: options.global ? "install" : "add",
            args: options.global
              ? ["install", "-g", "@prism-system/tools@3.0.0"]
              : ["add", "@prism-system/tools@3.0.0"],
          },
        },
      };
      acceptedPreviews.push(preview);
      return preview;
    },
    executeCliUpdate: async (options, preview) => {
      executions.push({ options, preview });
      return { ok: true, applied: true, changed: true, failures: [] };
    },
  };
  return { services, previews, acceptedPreviews, executions, checks };
}

async function openUpdate(app) {
  await press(app, "m");
  await press(app, "u");
  await waitFor(app, (frame) => /Update prism-ds/.test(frame), "self-update page opens");
}

test("local TUI update requires an explicit manager, then previews/cancels/confirms that exact plan", async () => {
  const fake = updateServices("local");
  const app = makeApp(fake.services, 80, 40);
  await openUpdate(app);
  await waitFor(app, (frame) => /2\.9\.0/.test(frame) && /3\.0\.0/.test(frame), "versions appear");
  assert.match(app.lastFrame(), /INSTALL CONTEXT/);
  assert.match(app.lastFrame(), /No package manager was detected/);
  assert.equal(fake.executions.length, 0, "opening the page is read-only");

  await press(app, "c");
  await waitFor(app, () => fake.checks.length >= 2, "explicit read-only update check");
  await press(app, "l");
  await waitFor(
    app,
    (frame) => /Choose npm or pnpm first/.test(frame),
    "missing manager is refused",
  );
  assert.equal(fake.previews.length, 0, "the shortcut cannot preview without an explicit manager");
  assert.equal(fake.executions.length, 0);
  await press(app, "n");
  assert.match(app.lastFrame(), /Use npm/);
  assert.match(app.lastFrame(), /Use pnpm/);
  assert.match(app.lastFrame(), /Selected manager: npm/);
  await press(app, "p");
  assert.match(app.lastFrame(), /Selected manager: pnpm/);
  await press(app, "n");
  await press(app, "l");
  await waitFor(app, (frame) => /Confirm prism-ds CLI update/.test(frame), "local update preview");
  assert.deepEqual(fake.previews.at(-1), { manager: "npm" });
  assert.match(
    fake.acceptedPreviews.at(-1).plan.command.args.join(" "),
    /add @prism-system\/tools@3\.0\.0/,
  );
  assert.equal(fake.executions.length, 0);
  await press(app, "escape");
  assert.equal(fake.executions.length, 0, "cancel never executes the preview");

  await press(app, "l");
  await waitFor(app, (frame) => /Confirm prism-ds CLI update/.test(frame), "second local preview");
  const preview = fake.acceptedPreviews.at(-1);
  await press(app, "y");
  await waitFor(app, () => fake.executions.length === 1, "one confirmed local update");
  assert.deepEqual(fake.executions, [{ options: { manager: "npm" }, preview }]);
  app.unmount();
});

test("detected local manager stays separate from a deliberate global manager selection", async () => {
  const fake = updateServices("local", { manager: "pnpm" });
  const mouse = createMouseSource();
  const app = makeApp(fake.services, 80, 40, mouse.source);
  await openUpdate(app);
  await waitFor(
    app,
    (frame) => /OPTIONAL: TARGET A GLOBAL INSTALL/.test(frame),
    "separate global target",
  );
  assert.match(app.lastFrame(), /Detected pnpm is for the local install only/);
  assert.equal(fake.previews.length, 0, "the page does not preview either target automatically");

  await clickLabel(app, mouse, "Use npm");
  assert.match(app.lastFrame(), /Global target manager: npm/);
  assert.match(app.lastFrame(), /Use pnpm/, "manager options remain visible after selection");
  await clickLabel(app, mouse, "Use pnpm");
  assert.match(app.lastFrame(), /Global target manager: pnpm/);
  await clickLabel(app, mouse, "Use npm");
  assert.match(app.lastFrame(), /Global target manager: npm/);
  await clickLabel(app, mouse, "Preview global update");
  await waitFor(app, (frame) => /Confirm prism-ds CLI update/.test(frame), "explicit global plan");
  assert.deepEqual(fake.previews, [{ global: true, manager: "npm" }]);
  assert.equal(fake.executions.length, 0, "the selected global target still requires confirmation");
  await press(app, "escape");
  assert.equal(fake.executions.length, 0);
  assert.match(app.lastFrame(), /Use npm/);
  assert.match(app.lastFrame(), /Use pnpm/);
  await press(app, "p");
  assert.match(app.lastFrame(), /Use npm/);
  assert.match(app.lastFrame(), /Use pnpm/);
  await press(app, "n");
  assert.match(app.lastFrame(), /Use npm/);
  assert.match(app.lastFrame(), /Use pnpm/);
  app.unmount();
});

test("unverified global context can explicitly preview a global target only after manager choice", async () => {
  const fake = updateServices("global", { verified: false });
  const app = makeApp(fake.services);
  await openUpdate(app);
  await waitFor(
    app,
    (frame) => /OPTIONAL: TARGET A GLOBAL INSTALL/.test(frame),
    "explicit global-target option for unverified context",
  );
  assert.doesNotMatch(app.lastFrame(), /UPDATE THIS GLOBAL INSTALL/);
  assert.equal(fake.previews.length, 0, "opening the page does not select or preview a target");
  await press(app, "g");
  assert.equal(fake.previews.length, 0, "global preview requires an explicit manager");

  await press(app, "n");
  assert.match(app.lastFrame(), /Use npm/);
  assert.match(app.lastFrame(), /Use pnpm/);
  assert.match(app.lastFrame(), /Global target manager: npm/);
  await press(app, "p");
  assert.match(app.lastFrame(), /Global target manager: pnpm/);
  await press(app, "n");
  await press(app, "g");
  await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "unverified global plan preview",
  );
  assert.deepEqual(fake.previews, [{ global: true, manager: "npm" }]);
  assert.equal(fake.acceptedPreviews.at(-1).plan.scope, "global");
  assert.equal(fake.executions.length, 0, "the exact plan still waits for confirmation");
  await press(app, "escape");
  assert.equal(fake.executions.length, 0);
  app.unmount();
});

test("global TUI update requires explicit manager selection and confirms only the accepted plan", async () => {
  const fake = updateServices("global", { manager: null });
  const app = makeApp(fake.services, 80, 40);
  await openUpdate(app);
  await waitFor(app, (frame) => /UPDATE THIS GLOBAL INSTALL/.test(frame), "global update guidance");
  assert.match(app.lastFrame(), /Choose npm or pnpm explicitly/);
  await press(app, "g");
  assert.equal(fake.previews.length, 0, "global update is not guessed");
  await press(app, "n");
  await press(app, "g");
  await waitFor(app, (frame) => /Confirm prism-ds CLI update/.test(frame), "global preview");
  assert.deepEqual(fake.previews, [{ global: true, manager: "npm" }]);
  assert.match(
    fake.acceptedPreviews.at(-1).plan.command.args.join(" "),
    /install -g @prism-system\/tools@3\.0\.0/,
  );
  await press(app, "escape");
  assert.equal(fake.executions.length, 0);

  await press(app, "n");
  await press(app, "g");
  await waitFor(app, (frame) => /Confirm prism-ds CLI update/.test(frame), "second global preview");
  const preview = fake.acceptedPreviews.at(-1);
  await press(app, "y");
  await waitFor(app, () => fake.executions.length === 1, "one confirmed global update");
  assert.deepEqual(fake.executions, [{ options: { global: true, manager: "npm" }, preview }]);
  app.unmount();
});

test("ephemeral CLI offers an explicit global target, never an in-place update", async () => {
  const fake = updateServices("ephemeral");
  const app = makeApp(fake.services, 46, 14);
  await openUpdate(app);
  await waitFor(app, (frame) => /GLOBAL/.test(frame), "optional global target");
  assert.match(app.lastFrame(), /THIS COPY/);
  assert.match(app.lastFrame(), /MAY INSTALL/);
  assert.match(app.lastFrame(), /VERIFY/);
  assert.match(app.lastFrame(), /Use npm/);
  assert.equal(fake.previews.length, 0);

  await press(app, "n");
  await press(app, "g");
  await waitFor(
    app,
    (frame) => /Confirm prism-ds CLI update/.test(frame),
    "explicit global preview",
  );
  assert.deepEqual(fake.previews, [{ global: true, manager: "npm" }]);
  const acceptedPreview = fake.acceptedPreviews.at(-1);
  assert.equal(acceptedPreview.plan.scope, "global");
  assert.match(
    acceptedPreview.plan.command.args.join(" "),
    /install -g @prism-system\/tools@3\.0\.0/,
  );
  assert.equal(fake.executions.length, 0, "preview alone does not mutate the global installation");

  await press(app, "escape");
  assert.equal(fake.executions.length, 0, "cancel leaves the installation untouched");
  await press(app, "g");
  await waitFor(app, (frame) => /Confirm prism-ds CLI update/.test(frame), "repeat global preview");
  const samePreview = fake.acceptedPreviews.at(-1);
  await press(app, "y");
  await waitFor(app, () => fake.executions.length === 1, "confirmed global installation");
  assert.deepEqual(fake.executions, [
    { options: { global: true, manager: "npm" }, preview: samePreview },
  ]);
  app.unmount();
});

test("unknown context offers only a deliberate global target; failed previews stay non-mutating", async () => {
  const unknown = updateServices("unknown", {
    failure: {
      ok: false,
      failures: ["Global installation is not available."],
      advice: "Choose another target.",
    },
  });
  const app = makeApp(unknown.services);
  await openUpdate(app);
  await waitFor(
    app,
    (frame) => /Cannot safely update this copy/.test(frame),
    "unknown-context remedy",
  );
  assert.doesNotMatch(app.lastFrame(), /UPDATE THIS LOCAL INSTALL/);
  assert.match(app.lastFrame().replace(/\s+/g, " "), /prism-ds self-update --check/);
  assert.match(app.lastFrame(), /OPTIONAL: TARGET A GLOBAL INSTALL/);
  assert.equal(
    unknown.previews.length,
    0,
    "no target is planned before explicit manager/scope choice",
  );
  await press(app, "n");
  await press(app, "g");
  await waitFor(app, () => unknown.previews.length === 1, "explicit global plan failure");
  assert.deepEqual(unknown.previews, [{ global: true, manager: "npm" }]);
  assert.equal(unknown.executions.length, 0);
  app.unmount();

  const failed = updateServices("local", {
    manager: "pnpm",
    failure: {
      ok: false,
      failures: ["Install context is no longer verified."],
      advice: "Reinstall prism-ds in the intended location.",
    },
  });
  const failedApp = makeApp(failed.services);
  await openUpdate(failedApp);
  await press(failedApp, "l");
  await waitFor(failedApp, () => failed.previews.length === 1, "failed preview attempt");
  assert.equal(failed.executions.length, 0);
  failedApp.unmount();
});

test("a skipped read-only check is not reported as current and can be retried", async () => {
  const fake = updateServices("local", {
    manager: "pnpm",
    checkResult: {
      ok: true,
      available: false,
      skipped: true,
      latest: null,
      advice: "The registry check was skipped by settings.",
    },
  });
  const app = makeApp(fake.services);
  await openUpdate(app);
  await waitFor(app, (frame) => /CHECK SKIPPED/.test(frame), "honest skipped status");
  assert.doesNotMatch(app.lastFrame(), /UP TO DATE|No update is available/i);
  assert.match(app.lastFrame(), /registry check was skipped by settings/i);
  assert.equal(fake.previews.length, 0);
  assert.equal(fake.executions.length, 0);

  await press(app, "c");
  await waitFor(app, () => fake.checks.length >= 2, "explicit check retry");
  assert.equal(fake.previews.length, 0, "retrying the version check is read-only");
  assert.equal(fake.executions.length, 0);
  app.unmount();
});

test("update controls remain reachable at standard and compact terminal sizes", async () => {
  for (const [columns, rows] of [
    [80, 24],
    [46, 14],
  ]) {
    const fake = updateServices("local");
    const app = makeApp(fake.services, columns, rows);
    await openUpdate(app);
    const frame = await waitFor(
      app,
      (value) => /Update prism-ds/.test(value),
      `${columns}x${rows} page`,
    );
    assert.match(frame, /Update prism-ds/);
    assert.match(frame, /UPDATE THIS LOCAL INSTALL/);
    await press(app, "n");
    await press(app, "l");
    await waitFor(
      app,
      (value) => /Confirm prism-ds CLI update/.test(value),
      `${columns}x${rows} preview`,
    );
    assert.equal(fake.executions.length, 0);
    assert.deepEqual(fake.previews, [{ manager: "npm" }]);
    app.unmount();
  }
});
