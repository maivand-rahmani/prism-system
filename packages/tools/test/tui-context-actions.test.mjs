import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { AppShell, FrameworkProvider, MouseLayout, ScreenRegistry, useKeyHandler } from "runeframe";
import { ContextActions } from "../src/tui/components/ContextActions.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "context-actions-test", title: "Context actions", component: () => null });
let setBusyForMouseTest;

function BusyMouseHost({ actions }) {
  const [busy, setBusy] = React.useState(false);
  setBusyForMouseTest = setBusy;
  return h(ContextActions, { actions, width: 80, height: 24, maxActionRows: 2, busy });
}
function mounted(actions, { columns = 80, rows = 24, body = null, ...props } = {}) {
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column", width: columns, height: rows },
      h(
        FrameworkProvider,
        { registry, defaultScreen: "context-actions-test" },
        h(
          React.Fragment,
          null,
          body && h(Text, null, body),
          h(ContextActions, { actions, width: columns, height: rows, ...props }),
        ),
      ),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: columns });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: rows });
  app.stdout.emit("resize");
  return app;
}

function lifecycleActions(spies = {}) {
  return [
    {
      key: "inspect",
      shortcut: "d",
      label: "Inspect manifest",
      compactLabel: "Inspect",
      onActivate: spies.inspect,
    },
    {
      key: "connect",
      shortcut: "c",
      label: "Reconnect",
      compactLabel: "Reconnect",
      variant: "primary",
      onActivate: spies.connect,
    },
    {
      key: "upgrade",
      shortcut: "g",
      label: "Preview exact-version upgrade",
      compactLabel: "Preview upgrade",
      onActivate: spies.upgrade,
    },
    {
      key: "refresh",
      shortcut: "p",
      label: "Refresh project state",
      compactLabel: "Refresh",
      onActivate: spies.refresh,
    },
    { key: "manage", shortcut: "m", label: "Manage", onActivate: spies.manage },
  ];
}

test("renders a clear action hierarchy and focus marker at normal terminal sizes", () => {
  for (const [columns, rows] of [
    [100, 30],
    [80, 24],
  ]) {
    const app = mounted(lifecycleActions(), { columns, rows, focusedKey: "upgrade" });
    const frame = app.lastFrame();
    assert.match(frame, /Actions/);
    assert.match(frame, /> Preview exact-version upgrade \(g\)/);
    assert.match(frame, /Reconnect \(c\)/);
    assert.match(frame, /Inspect manifest \(d\)/);
    app.unmount();
  }
});

test("short layouts keep focused primary and critical confirmation choices visible", () => {
  const actions = [
    { key: "review", label: "Review changes", shortcut: "v", critical: true },
    {
      key: "confirm",
      label: "Confirm and apply",
      shortcut: "y",
      variant: "primary",
      critical: true,
    },
    { key: "cancel", label: "Cancel", shortcut: "Esc", critical: true },
    ...Array.from({ length: 12 }, (_, index) => ({
      key: `extra-${index}`,
      label: `Extra action ${index + 1}`,
      shortcut: String(index + 1),
    })),
  ];
  for (const [columns, rows] of [
    [46, 14],
    [38, 12],
  ]) {
    const app = mounted(actions, {
      columns,
      rows,
      focusedKey: "confirm",
      body: "BODY: consumer project summary remains above the bounded action area",
    });
    const frame = app.lastFrame();
    assert.match(frame, /BODY: consumer project summary/);
    assert.match(frame, /> \* Confirm and apply \(y\)/, `${columns}x${rows} retains focus`);
    assert.match(frame, /Review changes \(v\)/);
    assert.match(frame, /Cancel \(Esc\)/);
    assert.match(frame, /More actions/);
    assert.match(frame, /1\//, "the disclosure indicates there are more actions");
    app.unmount();
  }
});

test("disabled and busy actions are visibly labeled and never invoke callbacks", async () => {
  let called = 0;
  const actions = [
    { key: "ready", label: "Ready action", shortcut: "r", onActivate: () => called++ },
    {
      key: "disabled",
      label: "Disabled action",
      shortcut: "x",
      disabled: true,
      onActivate: () => called++,
    },
  ];
  const app = mounted(actions, { focusedKey: "disabled" });
  assert.match(app.lastFrame(), /> Disabled action \(x\) \(disabled\)/);
  app.stdin.write("\r");
  await new Promise((resolve) => setTimeout(resolve, 10));
  app.unmount();
  const busyApp = mounted(actions, { busy: true, focusedKey: "ready" });
  assert.match(busyApp.lastFrame(), /Ready action/);
  assert.match(busyApp.lastFrame(), /Working · actions unavailable/);
  busyApp.stdin.write("\r");
  await new Promise((resolve) => setTimeout(resolve, 10));
  busyApp.unmount();
  assert.equal(called, 0);
});

test("only supplied callbacks run; preview control cannot bypass host confirmation", () => {
  const events = [];
  const app = mounted(
    [
      {
        key: "confirm",
        label: "Confirm and apply",
        shortcut: "y",
        variant: "primary",
        critical: true,
        onActivate: () => events.push("host-confirmation-request"),
      },
      {
        key: "cancel",
        label: "Cancel",
        shortcut: "Esc",
        critical: true,
        onActivate: () => events.push("host-cancel"),
      },
    ],
    { focusedKey: "confirm" },
  );
  // The host callback only records the user's confirmation intent. The action
  // control owns no mutation executor and cannot run one on its own.
  assert.match(app.lastFrame(), /Confirm and apply/);
  app.stdin.write("\r");
  assert.deepEqual(events, ["host-confirmation-request"]);
  app.unmount();
});

test("host-controlled focused action activates by Enter and runs only its supplied callback", async () => {
  const events = [];
  const actions = lifecycleActions({ inspect: () => events.push("inspect") });
  const app = mounted(actions, { focusedKey: "inspect" });
  assert.match(app.lastFrame(), /> Inspect manifest \(d\)/);
  app.stdin.write("\r");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, ["inspect"]);
  app.unmount();
});

function PagingHost({ actions }) {
  const [page, setPage] = React.useState(0);
  useKeyHandler(
    (event) => {
      if (event.key === ".") {
        setPage((value) => value + 1);
        return true;
      }
      if (event.key === ",") {
        setPage((value) => Math.max(0, value - 1));
        return true;
      }
      return false;
    },
    "navigation",
    { deps: [] },
  );
  return h(ContextActions, {
    actions,
    page,
    onPageChange: setPage,
    width: 46,
    height: 14,
    maxActionRows: 2,
  });
}

test("host-controlled comma/period paging works by keyboard without arrow interception", async () => {
  const actions = Array.from({ length: 6 }, (_, index) => ({
    key: `action-${index}`,
    label: `Action ${index + 1}`,
    shortcut: String(index + 1),
  }));
  const app = render(
    h(
      FrameworkProvider,
      { registry, defaultScreen: "context-actions-test" },
      h(PagingHost, { actions }),
    ),
  );
  assert.match(app.lastFrame(), /Action 1/);
  app.stdin.write(".");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(app.lastFrame(), /Action 3/);
  app.stdin.write(",");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(app.lastFrame(), /Action 1/);
  app.unmount();
});

test("measured mouse controls page and disabled/busy controls never activate", async () => {
  const calls = [];
  const actions = [
    { key: "enabled", label: "Enabled", shortcut: "e", onActivate: () => calls.push("enabled") },
    {
      key: "disabled",
      label: "Disabled",
      shortcut: "x",
      disabled: true,
      onActivate: () => calls.push("disabled"),
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      key: `extra-${index}`,
      label: `Extra ${index}`,
      shortcut: String(index),
    })),
  ];
  const listeners = new Set();
  const mouseEventSource = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const diagnostics = [];
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column", width: 80, height: 24 },
      h(
        FrameworkProvider,
        {
          registry,
          defaultScreen: "context-actions-test",
          mouseEventSource,
          mouseDiagnostics: (event) => diagnostics.push(event),
        },
        h(AppShell, null, h(BusyMouseHost, { actions })),
      ),
    ),
  );
  const publish = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  const probe = () =>
    publish({ type: "move", x: 79, y: 0, button: "none", shift: false, alt: false, ctrl: false });
  const click = (bounds, send = publish) => {
    const x = bounds.x + Math.floor(bounds.width / 2);
    const y = bounds.y + Math.floor(bounds.height / 2);
    send({ type: "press", x, y, button: "left", shift: false, alt: false, ctrl: false });
    send({ type: "release", x, y, button: "left", shift: false, alt: false, ctrl: false });
  };
  await new Promise((resolve) => setTimeout(resolve, 30));
  probe();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const areas = diagnostics.at(-1)?.areas ?? [];
  const usable = areas.filter(
    (area) => !area.wheelOnly && area.eligible && area.hasHandler && area.bounds.width > 0,
  );
  assert.ok(usable.length > 0, `has an enabled measured mouse target: ${JSON.stringify(areas)}`);
  const enabled = usable[0];
  click(enabled.bounds);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, ["enabled"]);

  const moreArea = areas.find(
    (area) => area.bounds.y === Math.max(...areas.map((item) => item.bounds.y)) && !area.disabled,
  );
  assert.ok(moreArea, "More actions has a measured mouse hitbox");
  click(moreArea.bounds);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(app.lastFrame(), /Extra 0/, "mouse activation reveals the next page");

  const disabledArea = areas.find((area) => area.disabled);
  assert.ok(disabledArea, "disabled action exposes a measured disabled mouse area");
  click(disabledArea.bounds);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, ["enabled"], "disabled mouse control does not invoke its callback");

  setBusyForMouseTest(true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(app.lastFrame(), /Working · actions unavailable/);
  click(enabled.bounds);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, ["enabled"], "busy mouse control does not invoke its callback");
  app.unmount();
});
