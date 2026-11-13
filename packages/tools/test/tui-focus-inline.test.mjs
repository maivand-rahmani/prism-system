import assert from "node:assert/strict";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import test from "node:test";
import { dispatchFocusedAction } from "../src/tui/hooks/use-navigation-keys.mjs";
import TuiApp from "../src/tui/TuiApp.mjs";
import { intersectVerticalClip } from "../src/tui/components/inline-action-geometry.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "focus-test", title: "Focus test", component: () => null });

function fixtureServices(calls) {
  return {
    cwd: "/consumer/demo-app",
    getProjectState: () => ({
      ok: true,
      status: "connected",
      cwd: "/consumer/demo-app",
      packageName: "@prism-system/ui-a",
      version: "1.2.3",
      contractVersion: 4,
      config: { package: "@prism-system/ui-a", version: "1.2.3", strict: true },
    }),
    checkCliUpdate: async () => ({ ok: true, updateAvailable: false }),
    inspectSystem: async ({ packageName, version }) => {
      calls.push({ packageName, version });
      return {
        ok: true,
        package: packageName,
        version,
        manifest: {
          package: packageName,
          name: "System A",
          version,
          contractVersion: 4,
          design: { density: "comfortable", theme: "night", radius: "soft" },
          components: { Button: {}, Input: {}, Card: {} },
          tokens: { groups: { themes: [] } },
        },
      };
    },
    listComponents: () => ({ ok: true, components: [] }),
    listTokens: () => ({ ok: true, groups: [] }),
    listIcons: () => ({ ok: true, icons: [] }),
    runCheck: () => ({ ok: true, checks: [], summary: "passed" }),
    runDoctor: () => ({ ok: true, checks: [], summary: "passed" }),
    runUsageCheck: () => ({ ok: true, findings: [], summary: "passed" }),
    runTailwindCheck: () => ({ ok: true, checks: [], summary: "passed" }),
  };
}

function startTui(services, columns, rows) {
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column" },
      h(FrameworkProvider, { registry, defaultScreen: "focus-test" }, h(TuiApp, { services })),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: columns });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: rows });
  app.stdout.emit("resize");
  return app;
}

async function key(app, value) {
  app.stdin.write({ tab: "\t", enter: "\r", down: "\u001b[B", up: "\u001b[A" }[value] ?? value);
  await new Promise((resolve) => setTimeout(resolve, 35));
}

test("inline-action clips exclude chrome and footer from scrollable content", () => {
  const chrome = { x: 0, y: 0, width: 80, height: 24 };
  const root = { x: 0, y: 0, width: 80, height: 24 };
  const topBar = { x: 0, y: 0, width: 80, height: 4 };
  const statusBar = { x: 0, y: 22, width: 80, height: 1 };
  const footer = { x: 0, y: 21, width: 80, height: 3 };
  assert.deepEqual(intersectVerticalClip(root, topBar, statusBar, footer, "scroll"), {
    x: 0,
    y: 4,
    width: 80,
    height: 17,
  });
  assert.deepEqual(intersectVerticalClip(root, topBar, statusBar, footer, "chrome"), {
    x: 0,
    y: 0,
    width: 80,
    height: 21,
  });
  assert.equal(intersectVerticalClip(chrome, null, null, null, "scroll"), null);
});

test("Tab only focuses measurable visible actions at 46x14 and 80x24", async (t) => {
  for (const [columns, rows] of [
    [46, 14],
    [80, 24],
  ]) {
    await t.test(`${columns}x${rows}`, async () => {
      const calls = [];
      const app = startTui(fixtureServices(calls), columns, rows);
      await new Promise((resolve) => setTimeout(resolve, 120));
      await key(app, "tab");
      assert.doesNotMatch(
        app.lastFrame(),
        />\s*Inspect manifest/,
        "initial offscreen target is not focused",
      );
      await key(app, "enter");
      assert.equal(calls.length, 0, "Enter cannot activate an unseen action");

      let focusedVisible = false;
      for (let index = 0; index < 60 && !focusedVisible; index += 1) {
        await key(app, "down");
        for (let tab = 0; tab < 6 && !focusedVisible; tab += 1) {
          await key(app, "tab");
          focusedVisible = />\s*Inspect manifest/.test(app.lastFrame());
        }
      }
      assert.equal(
        focusedVisible,
        true,
        `scrolling makes the visible Inspect control tabbable\n${app.lastFrame()}`,
      );
      for (let index = 0; index < 40; index += 1) await key(app, "up");
      assert.doesNotMatch(app.lastFrame(), />\s*Inspect manifest/);
      await key(app, "enter");
      assert.equal(calls.length, 0, "focused action clipped by scrolling is consumed safely");

      let focusedAgain = false;
      for (let index = 0; index < 60 && !focusedAgain; index += 1) {
        await key(app, "down");
        for (let tab = 0; tab < 6 && !focusedAgain; tab += 1) {
          await key(app, "tab");
          focusedAgain = />\s*Inspect manifest/.test(app.lastFrame());
        }
      }
      assert.equal(focusedAgain, true, "the action can be focused again after scrolling back");
      await key(app, "enter");
      assert.equal(calls.length, 1, "visible action activates exactly once");
      app.unmount();
    });
  }
});

test("focused stale and disabled confirmation actions consume Enter safely", () => {
  let applied = 0;
  const enter = { enter: true, key: "Enter" };
  for (const key of ["cancel", "inspect-files"]) {
    assert.equal(
      dispatchFocusedAction({
        focusedKey: key,
        actions: [{ key, disabled: true, onActivate: () => {} }],
        event: enter,
        inputView: false,
        confirmationView: true,
      }),
      true,
    );
  }
  assert.equal(
    dispatchFocusedAction({
      focusedKey: "cancel",
      actions: [],
      event: enter,
      inputView: false,
      confirmationView: true,
    }),
    true,
  );
  assert.equal(applied, 0);
});

test("only the enabled focused Apply action runs on Enter", () => {
  let applied = 0;
  const actions = [
    { key: "cancel", onActivate: () => assert.fail("Cancel must not run") },
    { key: "confirm", onActivate: () => (applied += 1) },
  ];
  assert.equal(
    dispatchFocusedAction({
      focusedKey: "confirm",
      actions,
      event: { enter: true, key: "Enter" },
      inputView: false,
      confirmationView: true,
    }),
    true,
  );
  assert.equal(applied, 1);
});
