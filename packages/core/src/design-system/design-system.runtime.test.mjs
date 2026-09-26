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
 * function and React exotic components) and rejects a `false` required value, a
 * `false` optional value, a `null` optional value, a plain object carrying an
 * unrelated `$$typeof` symbol, an unknown component name, a missing marker, and
 * a non-numeric marker. Optional omission stays allowed: an absent optional name
 * is not an error.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { forwardRef, lazy, memo } from "react";

import { REQUIRED_COMPONENTS } from "../../dist/design-system/components.js";
import { createDesignSystemRegistry } from "../../dist/design-system/design-system.js";

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

test("a valid required-only map registers", () => {
  const registry = createDesignSystemRegistry();
  const system = currentSystem();

  registry.register(system);

  assert.equal(registry.has("runtime-system"), true);
  assert.equal(registry.get("runtime-system"), system);
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
  components.Grid = component;
  delete components.Grid;

  const registry = createDesignSystemRegistry([currentSystem({ components })]);

  assert.equal(registry.has("runtime-system"), true);
});
