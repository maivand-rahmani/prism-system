#!/usr/bin/env node
/**
 * Runtime tests for the design-system registry guard.
 *
 * Node's built-in test runner, no test-framework dependency. These tests import
 * the compiled package from `dist`, so they must run after a core build:
 *
 *   pnpm --filter @prism-system/ui-core build
 *   node --test packages/core/src/design-system/design-system.runtime.test.mjs
 *
 * They prove the runtime guard accepts a valid required-only map (including
 * function and React exotic components) and rejects a `false` required value,
 * `false`/`null`/`undefined` optional values (including every appended
 * capability), a plain object carrying an unrelated `$$typeof` symbol, an
 * unknown component name, a missing marker, and a non-numeric marker. Optional
 * omission stays allowed: an absent optional name is not an error.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { forwardRef, lazy, memo } from "react";

import { OPTIONAL_COMPONENTS, REQUIRED_COMPONENTS } from "../../dist/design-system/components.js";
import { createDesignSystemRegistry } from "../../dist/design-system/design-system.js";

/** The canonical optional tuple: seventeen original names plus fourteen appended. */
const EXPECTED_OPTIONAL_COMPONENTS = [
  "Grid",
  "Section",
  "Fieldset",
  "Alert",
  "Progress",
  "Skeleton",
  "Toast",
  "Accordion",
  "Avatar",
  "Breadcrumbs",
  "Pagination",
  "Table",
  "Metric",
  "DescriptionList",
  "Timeline",
  "Meter",
  "EmptyState",
  "Popover",
  "AlertDialog",
  "ToggleGroup",
  "Toolbar",
  "TagGroup",
  "ListBox",
  "TreeView",
  "TimeField",
  "SearchField",
  "CheckboxGroup",
  "RangeSlider",
  "DateRangePicker",
  "Spinner",
  "FileDropzone",
];

/** The fourteen capability contracts appended to the optional tuple, in order. */
const APPENDED_OPTIONAL_COMPONENTS = EXPECTED_OPTIONAL_COMPONENTS.slice(17);

/** A minimal function component. */
function component() {
  return null;
}

/** A map with only the twenty-nine required components. */
function requiredOnlyComponents() {
  const components = {};
  for (const name of REQUIRED_COMPONENTS) {
    components[name] = component;
  }
  return components;
}

/** A current design system fixture; `overrides` replace individual fields. */
function currentSystem(overrides = {}) {
  return {
    id: "runtime-system",
    name: "Runtime System",
    packageName: "@prism-system/runtime-system",
    version: "0.0.0",
    contractVersion: 4,
    components: requiredOnlyComponents(),
    ...overrides,
  };
}

test("the compiled optional tuple is exactly the thirty-one canonical names", () => {
  assert.equal(REQUIRED_COMPONENTS.length, 29);
  assert.equal(OPTIONAL_COMPONENTS.length, 31);
  assert.deepEqual([...OPTIONAL_COMPONENTS], EXPECTED_OPTIONAL_COMPONENTS);
});

test("a valid required-only map registers", () => {
  const registry = createDesignSystemRegistry();
  const system = currentSystem();

  registry.register(system);

  assert.equal(registry.has("runtime-system"), true);
  assert.equal(registry.get("runtime-system"), system);
});

test("all fourteen appended optional components are accepted", () => {
  const components = requiredOnlyComponents();
  for (const name of APPENDED_OPTIONAL_COMPONENTS) {
    components[name] = component;
  }

  const registry = createDesignSystemRegistry([currentSystem({ components })]);

  assert.equal(registry.has("runtime-system"), true);
});

test("function and React exotic components are accepted", () => {
  const components = requiredOnlyComponents();
  components.Button = forwardRef(() => null);
  components.Input = memo(component);
  components.Textarea = lazy(async () => ({ default: component }));

  const registry = createDesignSystemRegistry([currentSystem({ components })]);

  assert.equal(registry.has("runtime-system"), true);
});

test("a false required component value is rejected", () => {
  const components = requiredOnlyComponents();
  components.Heading = false;

  assert.throws(
    () => createDesignSystemRegistry([currentSystem({ components })]),
    /Cannot register design system "runtime-system": component Heading \(boolean\) must be a React component\./,
  );
});

test("a false optional component value is rejected", () => {
  const components = requiredOnlyComponents();
  components.Grid = false;

  assert.throws(
    () => createDesignSystemRegistry([currentSystem({ components })]),
    /Cannot register design system "runtime-system": component Grid \(boolean\) must be a React component\./,
  );
});

test("an explicitly present null optional component is rejected", () => {
  const components = requiredOnlyComponents();
  components.Grid = null;

  assert.throws(
    () => createDesignSystemRegistry([currentSystem({ components })]),
    /Cannot register design system "runtime-system": component Grid \(null\) must be a React component\./,
  );
});

test("an explicitly null appended optional component is rejected for every appended name", () => {
  for (const name of APPENDED_OPTIONAL_COMPONENTS) {
    const components = requiredOnlyComponents();
    components[name] = null;

    assert.throws(
      () => createDesignSystemRegistry([currentSystem({ components })]),
      new RegExp(
        `Cannot register design system "runtime-system": component ${name} \\(null\\) must be a React component\\.`,
      ),
      name,
    );
  }
});

test("an explicitly undefined appended optional component is rejected for every appended name", () => {
  for (const name of APPENDED_OPTIONAL_COMPONENTS) {
    const components = requiredOnlyComponents();
    components[name] = undefined;

    assert.throws(
      () => createDesignSystemRegistry([currentSystem({ components })]),
      new RegExp(
        `Cannot register design system "runtime-system": component ${name} \\(undefined\\) must be a React component\\.`,
      ),
      name,
    );
  }
});

test("a required component explicitly present as null is rejected", () => {
  const components = requiredOnlyComponents();
  components.Button = null;

  assert.throws(
    () => createDesignSystemRegistry([currentSystem({ components })]),
    /Cannot register design system "runtime-system": component Button \(null\) must be a React component\./,
  );
});

test("a plain object with an unrelated $$typeof symbol is rejected", () => {
  const components = requiredOnlyComponents();
  components.Grid = { $$typeof: Symbol("not-react") };

  assert.throws(
    () => createDesignSystemRegistry([currentSystem({ components })]),
    /Cannot register design system "runtime-system": component Grid \(object\) must be a React component\./,
  );
});

test("an unknown component name is rejected", () => {
  const components = requiredOnlyComponents();
  components.NotAComponent = component;

  assert.throws(
    () => createDesignSystemRegistry([currentSystem({ components })]),
    /Cannot register design system "runtime-system": unknown component NotAComponent\./,
  );
});

test("a missing contractVersion marker is rejected", () => {
  const system = { ...currentSystem(), contractVersion: undefined };

  assert.throws(
    () => createDesignSystemRegistry([system]),
    /Cannot register design system "runtime-system": contractVersion must be 4\./,
  );
});

test("a string or other numeric marker is rejected", () => {
  assert.throws(
    () => createDesignSystemRegistry([{ ...currentSystem(), contractVersion: "4" }]),
    /contractVersion must be 4/,
  );
  assert.throws(
    () => createDesignSystemRegistry([{ ...currentSystem(), contractVersion: 5 }]),
    /contractVersion must be 4/,
  );
});

test("omitting an optional component is allowed", () => {
  const components = requiredOnlyComponents();
  for (const name of ["Grid", ...APPENDED_OPTIONAL_COMPONENTS]) {
    components[name] = component;
  }
  for (const name of ["Grid", ...APPENDED_OPTIONAL_COMPONENTS]) {
    delete components[name];
  }

  const registry = createDesignSystemRegistry([currentSystem({ components })]);

  assert.equal(registry.has("runtime-system"), true);
});
