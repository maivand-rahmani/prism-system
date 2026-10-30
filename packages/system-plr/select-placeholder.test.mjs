#!/usr/bin/env node
/**
 * Select root-placeholder fallback regression (headless).
 *
 * Regression: `SelectProps.placeholder` was destructured as `_placeholder` and
 * dropped, so `Select.Value` rendered Radix's empty default even when the root
 * received a placeholder.
 *
 * This package has no DOM harness. The test transpiles the real component source
 * and loads it against lightweight primitive mocks, so the wrapper's own logic is
 * exercised without a browser. The assertions cover:
 *
 *   1. the root placeholder is the fallback for `Select.Value`;
 *   2. an explicit `Select.Value` placeholder (including an empty string) wins;
 *   3. the root no longer forwards the non-Radix `placeholder` prop;
 *   4. controlled/uncontrolled selection props still pass through;
 *   5. label/hint wiring and the compound static members stay intact.
 *
 * Run with: node --test select-placeholder.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "src", "components", "select", "Select.tsx");
const require = createRequire(import.meta.url);
const h = React.createElement;

/** Capture the props the root wrapper hands to the core Select primitive. */
let lastRootProps;

/** A simple forwarded primitive that renders its children. */
function passthrough(displayName, element = "div") {
  return React.forwardRef(function MockPrimitive({ children }, ref) {
    return h(element, { ref, "data-mock": displayName }, children);
  });
}

/** Minimal stand-in for only the core exports Select.tsx consumes. */
const mockCore = {
  Select: function MockSelect(props) {
    lastRootProps = props;
    return h("div", { "data-mock": "root" }, props.children);
  },
  SelectTrigger: React.forwardRef(function MockTrigger(
    { children, id, "aria-describedby": describedBy },
    ref,
  ) {
    return h("button", { ref, type: "button", id, "aria-describedby": describedBy }, children);
  }),
  SelectValue: React.forwardRef(function MockValue({ children, placeholder, className }, ref) {
    return h(
      "span",
      { ref, className, "data-mock": "value" },
      children !== undefined ? children : (placeholder ?? null),
    );
  }),
  SelectContent: passthrough("content"),
  SelectGroup: passthrough("group"),
  SelectItem: passthrough("item"),
  SelectLabel: passthrough("label"),
  SelectSeparator: passthrough("separator"),
  cn: (...inputs) => inputs.filter(Boolean).join(" "),
};

/** Transpile and evaluate Select.tsx with the mock core. */
function loadSelect() {
  const source = readFileSync(sourcePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const filename = join(here, "select-placeholder.transpiled.cjs");
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(here);

  const originalRequire = loaded.require.bind(loaded);
  loaded.require = function requireSelectDependency(id) {
    return id === "@prism-system/ui-core" ? mockCore : originalRequire(id);
  };
  loaded._compile(outputText, filename);

  return loaded.exports;
}

const { Select } = loadSelect();

/** Read the text rendered by the Select.Value mock. */
function valueText(markup) {
  const match = markup.match(/<span[^>]*data-mock="value"[^>]*>([\s\S]*?)<\/span>/);
  assert.ok(match, "expected Select.Value to render");
  return match[1];
}

test("the root placeholder is the fallback for Select.Value", () => {
  const markup = renderToStaticMarkup(
    h(
      Select,
      { placeholder: "Choose a plan" },
      h(Select.Trigger, null, h(Select.Value)),
      h(Select.Content, null, h(Select.Item, { value: "daily" }, "Daily")),
    ),
  );

  assert.equal(valueText(markup), "Choose a plan");
});

test("an explicit Select.Value placeholder wins over the root placeholder", () => {
  const markup = renderToStaticMarkup(
    h(
      Select,
      { placeholder: "Choose a plan" },
      h(Select.Trigger, null, h(Select.Value, { placeholder: "Pick one" })),
    ),
  );

  assert.equal(valueText(markup), "Pick one");
});

test("an explicit empty Select.Value placeholder overrides the root fallback", () => {
  const markup = renderToStaticMarkup(
    h(
      Select,
      { placeholder: "Choose a plan" },
      h(Select.Trigger, null, h(Select.Value, { placeholder: "" })),
    ),
  );

  assert.equal(valueText(markup), "");
});

test("without either placeholder Select.Value stays empty", () => {
  const markup = renderToStaticMarkup(h(Select, null, h(Select.Trigger, null, h(Select.Value))));

  assert.equal(valueText(markup), "");
});

test("the root placeholder is not forwarded to the core Select primitive", () => {
  renderToStaticMarkup(h(Select, { placeholder: "Choose a plan" }, h(Select.Value)));

  assert.equal("placeholder" in lastRootProps, false);
});

test("controlled and uncontrolled selection props still pass through", () => {
  const onValueChange = () => {};

  renderToStaticMarkup(
    h(
      Select,
      { value: "daily", defaultValue: "weekly", onValueChange, disabled: true },
      h(Select.Value),
    ),
  );

  assert.equal(lastRootProps.value, "daily");
  assert.equal(lastRootProps.defaultValue, "weekly");
  assert.equal(lastRootProps.onValueChange, onValueChange);
  assert.equal(lastRootProps.disabled, true);
});

test("label, hint, and invalid wiring still reach the trigger", () => {
  const markup = renderToStaticMarkup(
    h(
      Select,
      { id: "plan", label: "Plan", hint: "Pick one", invalid: true },
      h(Select.Trigger, null, h(Select.Value, { placeholder: "Choose" })),
    ),
  );

  assert.match(markup, /<label[^>]*for="plan"[^>]*>Plan<\/label>/);
  assert.match(markup, /<button[^>]*id="plan"[^>]*aria-describedby="plan-message"/);
  assert.match(markup, /<span[^>]*id="plan-message"[^>]*>Pick one<\/span>/);
});

test("the compound API keeps every Select part attached", () => {
  for (const part of ["Trigger", "Value", "Content", "Group", "Label", "Item", "Separator"]) {
    assert.equal(typeof Select[part], "object", `Select.${part} should stay attached`);
  }
});
