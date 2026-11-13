import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { AppShell, FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import { InlineTaskActions } from "../src/tui/components/InlineTaskActions.mjs";
import {
  renderLifecycleHome,
  renderManageHome,
  renderRecoveryHome,
  renderSelfUpdateHome,
  renderSkillsHome,
} from "../src/tui/views/manage-screens.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "manage-inline-test", title: "Manage actions", component: () => null });
const pauses = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const actionKeys = [
  "manage-lifecycle",
  "manage-skills",
  "manage-update",
  "manage-recovery",
  "switch-system",
  "remove-system",
  "lifecycle-css",
  "check-cli-update",
  "select-npm-manager",
  "select-pnpm-manager",
  "update-local-cli",
  "update-global-cli",
  "refresh-recovery",
  "recovery-css",
  "recovery-entry",
  "preview-recovery",
];
const selfUpdateKeys = new Set([
  "check-cli-update",
  "select-npm-manager",
  "select-pnpm-manager",
  "update-local-cli",
  "update-global-cli",
]);

function actionsFor(keys = actionKeys, onActivate = () => {}) {
  return keys.map((key) => ({
    key,
    label: key,
    shortcut: key.slice(0, 1),
    onActivate: () => onActivate(key),
  }));
}

function groupsIn(node, groups = []) {
  if (node == null || typeof node !== "object") return groups;
  if (Array.isArray(node)) {
    for (const child of node) groupsIn(child, groups);
    return groups;
  }
  if (node.type === InlineTaskActions)
    groups.push(node.props.keys ?? node.props.actions.map((item) => item.key));
  groupsIn(node.props?.children, groups);
  return groups;
}

function screenProps(screenActions = actionsFor()) {
  return {
    screenActions,
    focusedFooterAction: null,
    setFocusedFooterAction: () => {},
    operation: null,
    startupUpdate: { result: { ok: true, current: "1.0.0", latest: "1.1.0", available: true } },
    project: { packageName: "@prism-system/ui-a", version: "1.0.0" },
    compact: false,
    lifecycleCssPath: "styles/global.css",
    updateManager: null,
    recoveryResult: {
      ok: true,
      report: {
        ok: false,
        issues: [{ id: "missing-config", label: "Missing config", detail: "Connect the system." }],
      },
      suggestions: [
        {
          id: "connect",
          executable: true,
          label: "Connect system",
          reason: "Configuration is missing.",
        },
      ],
    },
    recoveryActionId: "connect",
    recoveryLoading: false,
    recoveryCssPath: "styles/global.css",
    recoveryEntry: "src/main.tsx",
    setRecoveryActionId: () => {},
    rows: 24,
  };
}

test("manage screens place each canonical action once beside its own task", () => {
  const props = screenProps();
  const rendered = [
    [
      renderManageHome(props),
      [["manage-lifecycle"], ["manage-skills"], ["manage-update"], ["manage-recovery"]],
    ],
    [renderLifecycleHome(props), [["switch-system"], ["remove-system"], ["lifecycle-css"]]],
    [
      renderRecoveryHome(props),
      [["refresh-recovery"], ["preview-recovery"], ["recovery-css"], ["recovery-entry"]],
    ],
  ];
  const seen = [];
  for (const [screen, expected] of rendered) {
    const groups = groupsIn(screen);
    assert.deepEqual(groups, expected);
    seen.push(...groups.flat());
  }
  assert.deepEqual([...seen].sort(), actionKeys.filter((key) => !selfUpdateKeys.has(key)).sort());
  assert.equal(new Set(seen).size, seen.length, "no action is duplicated across a screen");

  const localUpdate = renderSelfUpdateHome({
    ...props,
    startupUpdate: {
      result: {
        ok: true,
        available: true,
        current: "1.0.0",
        latest: "1.1.0",
        installation: { kind: "local", manager: "pnpm", verified: true },
      },
    },
  });
  assert.deepEqual(groupsIn(localUpdate), [
    ["update-local-cli"],
    ["select-npm-manager", "select-pnpm-manager"],
    ["check-cli-update"],
  ]);

  const localUpdateWithoutManager = renderSelfUpdateHome({
    ...props,
    startupUpdate: {
      result: {
        ok: true,
        available: true,
        current: "1.0.0",
        latest: "1.1.0",
        installation: { kind: "local", manager: null, verified: true },
      },
    },
  });
  const noManagerGroups = groupsIn(localUpdateWithoutManager);
  assert.deepEqual(noManagerGroups, [
    ["select-npm-manager", "select-pnpm-manager"],
    ["check-cli-update"],
  ]);
  assert.equal(
    noManagerGroups.flat().filter((key) => key === "select-npm-manager").length,
    1,
    "manager controls appear once when both local/global choices need an explicit manager",
  );

  const selectedLocalManager = renderSelfUpdateHome({
    ...props,
    updateManager: "pnpm",
    startupUpdate: {
      result: {
        ok: true,
        available: true,
        current: "1.0.0",
        latest: "1.1.0",
        installation: { kind: "local", manager: null, verified: true },
      },
    },
  });
  const selectedGroups = groupsIn(selectedLocalManager);
  assert.deepEqual(selectedGroups, [
    ["select-npm-manager", "select-pnpm-manager"],
    ["update-local-cli"],
    ["update-global-cli"],
    ["check-cli-update"],
  ]);
  assert.equal(
    selectedGroups.flat().filter((key) => key === "select-npm-manager").length,
    1,
    "manager selectors stay present after a choice without duplicate groups",
  );

  const globalUpdate = renderSelfUpdateHome({
    ...props,
    startupUpdate: {
      result: {
        ok: true,
        available: true,
        installation: { kind: "global", manager: null, verified: true },
      },
    },
  });
  assert.deepEqual(groupsIn(globalUpdate), [
    ["select-npm-manager", "select-pnpm-manager"],
    ["update-global-cli"],
    ["check-cli-update"],
  ]);

  const unknownUpdate = renderSelfUpdateHome({
    ...props,
    startupUpdate: {
      result: {
        ok: true,
        available: true,
        installation: { kind: "unknown", manager: null, verified: false },
      },
    },
  });
  assert.deepEqual(groupsIn(unknownUpdate), [
    ["select-npm-manager", "select-pnpm-manager"],
    ["check-cli-update"],
  ]);

  const recoveryChildren = renderRecoveryHome(props).props.children;
  const suggestionsIndex = recoveryChildren.findIndex(
    (child) => child?.key === "recovery-suggestions",
  );
  const previewIndex = recoveryChildren.findIndex((child) => child?.key === "preview-recovery");
  const cssIndex = recoveryChildren.findIndex((child) => child?.key === "recovery-css-controls");
  const entryIndex = recoveryChildren.findIndex(
    (child) => child?.key === "recovery-entry-controls",
  );
  assert.ok(suggestionsIndex < previewIndex && previewIndex < cssIndex && cssIndex < entryIndex);

  const skillScreen = renderSkillsHome({
    ...props,
    skillsResult: { ok: true, catalog: [], installed: [], failures: [] },
    skillSection: "prism",
    selectedSkillId: null,
    skillScope: "project",
    skillDialogOpen: false,
    skillsLoading: false,
    services: {},
  });
  assert.deepEqual(groupsIn(skillScreen), [], "Skills keeps its own dialog actions only");
});

function ActionHarness({ busy, events }) {
  const availableActions = [
    {
      key: "run",
      label: "Run health check",
      shortcut: "c",
      onActivate: () => events.push("run"),
    },
    {
      key: "blocked",
      label: "Unavailable repair",
      shortcut: "x",
      disabled: true,
      onActivate: () => events.push("blocked"),
    },
  ];
  return h(InlineTaskActions, {
    actions: availableActions,
    keys: ["run", "blocked"],
    focusedKey: "run",
    onFocusChange: (key) => events.push(`focus:${key}`),
    busy,
  });
}

function actionApp(busy, events, content = h(ActionHarness, { busy, events })) {
  const listeners = new Set();
  const diagnostics = [];
  const mouseEventSource = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, width: 80, height: 24, flexDirection: "column" },
      h(
        FrameworkProvider,
        {
          registry,
          defaultScreen: "manage-inline-test",
          mouseEventSource,
          mouseDiagnostics: (event) => diagnostics.push(event),
        },
        h(AppShell, null, content),
      ),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 80 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 24 });
  app.stdout.emit("resize");
  const publish = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  return { app, diagnostics, publish };
}

function RecoveryHarness() {
  return renderRecoveryHome(screenProps());
}

test("recovery guidance and selected repair appear before optional targets at a normal viewport", async () => {
  const app = actionApp(false, [], h(RecoveryHarness));
  await pauses(50);
  const frame = app.app.lastFrame() ?? "";
  assert.match(frame, /Connect the system/);
  assert.match(frame, /Connect system/);
  assert.ok(frame.indexOf("Connect system") < frame.indexOf("Set a CSS target"));
  const entryTargetIndex = frame.indexOf("Set an entry target");
  if (entryTargetIndex !== -1) assert.ok(frame.indexOf("Connect system") < entryTargetIndex);
  app.app.unmount();
});

test("inline actions are inert on render, activate the supplied callback, and respect disabled/busy", async () => {
  const events = [];
  const harness = actionApp(false, events);
  assert.deepEqual(events, [], "rendering the actions performs no operation");
  const lines = (harness.app.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes("Run health check (c)"));
  const column = lines[row].indexOf("Run health check") + 4;
  await pauses(40);
  harness.publish({
    type: "move",
    x: 79,
    y: 0,
    button: "none",
    shift: false,
    alt: false,
    ctrl: false,
  });
  await pauses();
  harness.publish({
    type: "move",
    x: column,
    y: row,
    button: "none",
    shift: false,
    alt: false,
    ctrl: false,
  });
  await pauses();
  const targetId = harness.diagnostics.at(-1)?.targetId;
  assert.notEqual(
    targetId,
    null,
    `the actual inline task button is the pointer target:\n${harness.app.lastFrame()}\n${JSON.stringify(harness.diagnostics.at(-1))}`,
  );
  harness.publish({
    type: "press",
    x: column,
    y: row,
    button: "left",
    shift: false,
    alt: false,
    ctrl: false,
  });
  harness.publish({
    type: "release",
    x: column,
    y: row,
    button: "left",
    shift: false,
    alt: false,
    ctrl: false,
  });
  await pauses();
  assert.deepEqual(events, ["focus:run", "run"]);
  harness.app.unmount();

  const disabledEvents = [];
  const disabled = actionApp(false, disabledEvents);
  const disabledLines = (disabled.app.lastFrame() ?? "").split("\n");
  const disabledRow = disabledLines.findIndex((line) => line.includes("Unavailable repair (x)"));
  assert.notEqual(disabledRow, -1);
  const disabledColumn = disabledLines[disabledRow].indexOf("Unavailable repair") + 4;
  disabled.publish({
    type: "press",
    x: disabledColumn,
    y: disabledRow,
    button: "left",
    shift: false,
    alt: false,
    ctrl: false,
  });
  disabled.publish({
    type: "release",
    x: disabledColumn,
    y: disabledRow,
    button: "left",
    shift: false,
    alt: false,
    ctrl: false,
  });
  await pauses();
  assert.deepEqual(disabledEvents, []);
  disabled.app.unmount();

  const busyEvents = [];
  const busy = actionApp(true, busyEvents);
  const busyLines = (busy.app.lastFrame() ?? "").split("\n");
  const busyRow = busyLines.findIndex((line) => line.includes("Run health check (c)"));
  const busyColumn = busyLines[busyRow].indexOf("Run health check") + 4;
  busy.publish({
    type: "press",
    x: busyColumn,
    y: busyRow,
    button: "left",
    shift: false,
    alt: false,
    ctrl: false,
  });
  busy.publish({
    type: "release",
    x: busyColumn,
    y: busyRow,
    button: "left",
    shift: false,
    alt: false,
    ctrl: false,
  });
  await pauses();
  assert.deepEqual(busyEvents, []);
  busy.app.unmount();
});
