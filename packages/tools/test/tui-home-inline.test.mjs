import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, ScreenRegistry } from "runeframe";
import {
  renderConnectedSystem,
  renderEmptyHome,
  renderInstalledHome,
  renderSystemDetails,
} from "../src/tui/views/home-screens.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "home-inline-test", title: "Home", component: () => null });
const keys = [
  "browse-catalog",
  "retry-project",
  "search-catalog",
  "refresh-catalog",
  "inspect-selection",
  "install",
  "use",
  "use-no-skills",
  "use-agent",
  "connect",
  "refresh-project",
  "inspect-system",
  "reconnect",
  "upgrade",
  "preview-switch",
  "unrelated",
];
const actions = keys.map((key, index) => ({
  key,
  label: `Action ${key}`,
  shortcut: `F${index + 1}`,
  onActivate: () => {},
}));
function props(overrides = {}) {
  return {
    screenActions: actions,
    focusedFooterAction: null,
    setFocusedFooterAction() {},
    operation: null,
    project: { status: "empty" },
    catalogResults: [],
    catalogLoaded: true,
    selectedSystemId: null,
    compact: false,
    rows: 24,
    ...overrides,
  };
}
function frame(element) {
  const app = render(
    h(FrameworkProvider, { registry, defaultScreen: "home-inline-test" }, element),
  );
  const output = app.lastFrame();
  app.unmount();
  return output;
}
function expectActions(output, expected) {
  for (const key of expected)
    assert.equal(output.split(`Action ${key} (`).length - 1, 1, `${key} shown once`);
  for (const key of keys.filter((key) => !expected.includes(key)))
    assert.ok(!output.includes(`Action ${key} (`), `${key} omitted\n${output}`);
}

test("home inline controls are screen-specific and unique", () => {
  expectActions(frame(renderEmptyHome(props({ catalogLoaded: false }))), [
    "browse-catalog",
    "search-catalog",
  ]);
  expectActions(
    frame(renderEmptyHome(props({ project: { status: "error" }, projectError: "bad" }))),
    ["retry-project"],
  );
  expectActions(
    frame(
      renderEmptyHome(
        props({ catalogResults: [{ name: "prism", version: "1" }], selectedSystemId: "prism@1" }),
      ),
    ),
    ["inspect-selection", "search-catalog", "refresh-catalog"],
  );
  expectActions(
    frame(
      renderInstalledHome(
        props({ project: { status: "installed", packageName: "p", version: "1" } }),
      ),
    ),
    ["connect", "refresh-project"],
  );
  expectActions(
    frame(
      renderConnectedSystem(
        props({
          project: { status: "connected", packageName: "p", version: "1" },
          services: { cwd: "." },
        }),
      ),
    ),
    ["inspect-system", "reconnect", "upgrade", "refresh-project"],
  );
  expectActions(
    frame(
      renderSystemDetails(
        props({ project: { status: "empty" }, catalogResults: [], inspection: { manifest: {} } }),
      ),
    ),
    ["install", "use", "use-no-skills", "use-agent"],
  );
});

test("inline screen button invokes only its supplied callback on activation", async () => {
  let calls = 0;
  let previews = 0;
  const screenActions = [
    {
      key: "install",
      label: "Install",
      shortcut: "i",
      variant: "primary",
      onActivate: () => calls++,
    },
    { key: "preview-switch", label: "Preview switch", shortcut: "w", onActivate: () => previews++ },
  ];
  const app = render(
    h(
      FrameworkProvider,
      { registry, defaultScreen: "home-inline-test" },
      renderSystemDetails(
        props({
          screenActions,
          focusedFooterAction: "install",
          project: { status: "empty" },
          inspection: { manifest: {} },
        }),
      ),
    ),
  );
  assert.equal(calls, 0, "rendering does not perform the action");
  assert.equal(previews, 0, "rendering does not preview a switch");
  app.stdin.write("\r");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  assert.equal(previews, 0);
  app.unmount();
});

test("switch preview is beside the inspected target and activates only on input", async () => {
  let previews = 0;
  const result = { name: "@prism-system/ui-system-a", version: "2.4.0" };
  const app = render(
    h(
      FrameworkProvider,
      { registry, defaultScreen: "home-inline-test" },
      renderSystemDetails(
        props({
          screenActions: [
            {
              key: "preview-switch",
              label: "Preview switch",
              shortcut: "w",
              onActivate: () => previews++,
            },
            { key: "install", label: "Install", shortcut: "i", onActivate: () => {} },
          ],
          focusedFooterAction: "preview-switch",
          project: { status: "connected" },
          searchContext: "switch",
          selectedSystemId: `${result.name}@${result.version}`,
          catalogResults: [result],
          inspection: { manifest: {} },
        }),
      ),
    ),
  );
  const output = app.lastFrame();
  assert.equal(output.split("Preview switch").length - 1, 1);
  assert.ok(output.indexOf(`${result.name}@${result.version}`) < output.indexOf("Preview switch"));
  assert.ok(!output.includes("Action install"));
  assert.equal(previews, 0, "rendering does not preview or mutate");
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 46 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 14 });
  app.stdout.emit("resize");
  app.stdin.write("\r");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(previews, 1);
  app.unmount();
});
