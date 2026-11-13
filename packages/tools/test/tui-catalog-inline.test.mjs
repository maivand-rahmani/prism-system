import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import {
  renderChecks,
  renderComponents,
  renderIcons,
  renderTokens,
} from "../src/tui/views/catalog-screens.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "catalog-inline-test", title: "Catalog test", component: () => null });
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

const actionKeys = {
  components: [
    "required",
    "optional",
    "categories",
    "extensions",
    "reload-components",
    "refresh-project",
  ],
  tokens: ["previous-group", "next-group", "search-tokens", "reload-tokens", "refresh-project"],
  icons: ["search-icons", "reload-icons", "refresh-project"],
  checks: ["run-check", "run-doctor", "run-usage", "check-css", "refresh-project"],
};
const unrelatedKeys = {
  components: ["search-icons", "search-tokens", "run-check", "reload-tokens"],
  tokens: ["search-icons", "required", "reload-icons", "run-check"],
  icons: ["search-tokens", "required", "reload-components", "run-check"],
  checks: ["search-icons", "required", "reload-components", "reload-icons"],
};

function actions(calls) {
  return [...new Set(Object.values(actionKeys).flat())].map((key) => ({
    key,
    label: `Action ${key}`,
    shortcut: "x",
    onActivate: () => calls.push(key),
  }));
}

function catalogProps(screen, { error = false, calls = [] } = {}) {
  const base = {
    screenActions: actions(calls),
    focusedFooterAction: "reload-components",
    setFocusedFooterAction: () => {},
    operation: null,
    compact: false,
    rows: 30,
  };
  if (screen === "components")
    return {
      ...base,
      componentError: error ? "catalog failed" : null,
      componentCatalog: error
        ? null
        : {
            components: [{ name: "Button", required: true }],
            available: ["Button"],
            unavailable: [],
            capabilities: { categories: {} },
            extensions: [],
          },
      componentSection: "required",
      selectedExtensionName: null,
      selectedComponentName: "Button",
      setSelectedExtensionName: () => {},
      setSelectedComponentName: () => {},
    };
  if (screen === "tokens")
    return {
      ...base,
      tokenError: error ? "catalog failed" : null,
      tokenCatalog: error
        ? null
        : {
            groups: [{ group: "colors", tokens: [{ name: "surface", path: "surface" }] }],
            groupNames: ["colors"],
          },
      tokenGroup: "colors",
      tokenQuery: "",
      setTokenGroup: () => {},
    };
  if (screen === "icons")
    return {
      ...base,
      iconError: error ? "catalog failed" : null,
      iconCatalog: error
        ? null
        : {
            supported: true,
            icons: [
              {
                name: "Arrow",
                exportName: "ArrowIcon",
                available: true,
                category: "arrows",
                importPath: "@system/icons",
              },
            ],
          },
      iconQuery: "",
      selectedIconName: "Arrow",
      setSelectedIconName: () => {},
    };
  return { ...base, checkKind: "check", checkResult: null, checkError: null };
}

function mount(screen, props) {
  const renderer = {
    components: renderComponents,
    tokens: renderTokens,
    icons: renderIcons,
    checks: renderChecks,
  }[screen];
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column" },
      h(
        FrameworkProvider,
        { registry, defaultScreen: "catalog-inline-test" },
        h(React.Fragment, null, renderer(props)),
      ),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 100 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 30 });
  app.stdout.emit("resize");
  return app;
}

for (const screen of ["components", "tokens", "icons"]) {
  for (const error of [false, true]) {
    test(`${screen} ${error ? "error" : "normal"} state shows only contextual canonical actions`, () => {
      const calls = [];
      const app = mount(screen, catalogProps(screen, { error, calls }));
      const frame = app.lastFrame() ?? "";
      const applicable = error
        ? [
            screen === "components"
              ? "reload-components"
              : screen === "tokens"
                ? "reload-tokens"
                : "reload-icons",
            "refresh-project",
          ]
        : actionKeys[screen];
      for (const key of applicable) {
        const occurrences = frame.split(`Action ${key}`).length - 1;
        assert.equal(occurrences, 1, `${key} appears exactly once`);
      }
      for (const key of unrelatedKeys[screen])
        assert.doesNotMatch(frame, new RegExp(`Action ${key.replaceAll("-", "\\-")}`));
      assert.deepEqual(calls, [], "rendering does not invoke operations");
      app.unmount();
    });
  }
}

test("Checks exposes refresh alongside its existing task actions", () => {
  const app = mount("checks", catalogProps("checks"));
  const frame = app.lastFrame() ?? "";
  for (const key of actionKeys.checks) assert.equal(frame.split(`Action ${key}`).length - 1, 1);
  app.unmount();
});

test("activating one injected catalog action invokes only its own callback once", async () => {
  const calls = [];
  const props = catalogProps("tokens", { calls });
  props.focusedFooterAction = "search-tokens";
  const app = mount("tokens", props);
  assert.match(app.lastFrame() ?? "", /Action search-tokens/);
  assert.deepEqual(calls, []);
  app.stdin.write("\r");
  await pause();
  assert.deepEqual(calls, ["search-tokens"]);
  app.unmount();
});
