#!/usr/bin/env node
/**
 * Runtime tests for the V4 registry guard.
 *
 * Node's built-in test runner, no test-framework dependency. These tests import
 * the compiled package from `dist`, so they must run after a core build:
 *
 *   pnpm --filter @prism-system/ui-core build
 *   node --test packages/core/src/design-system/design-system.runtime.test.mjs
 *
 * They prove the V4 runtime guard accepts a valid required-only map (including
 * function and React exotic components) and rejects a `false` required value, a
 * `false` optional value, a `null` optional value, a plain object carrying an
 * unrelated `$$typeof` symbol, an unknown component name, and a V2-marker
 * system. The V2 registry guard is exercised separately and is not changed here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { forwardRef, lazy, memo } from "react";

import { REQUIRED_COMPONENTS_V4 } from "../../dist/design-system/components.js";
import { createDesignSystemRegistryV4 } from "../../dist/design-system/design-system.js";

/** A minimal function component. */
function component() {
  return null;
}

/** A V4 map with only the twenty required components. */
function requiredOnlyComponents() {
  const components = {};
  for (const name of REQUIRED_COMPONENTS_V4) {
    components[name] = component;
  }
  return components;
}

/** A V4 system fixture; `overrides` replace individual fields. */
function v4System(overrides = {}) {
  return {
    id: "runtime-v4",
    name: "Runtime V4",
    packageName: "@prism-system/runtime-v4",
    version: "0.0.0",
    componentContract: "v4",
    components: requiredOnlyComponents(),
    ...overrides,
  };
}

test("a valid required-only V4 map registers", () => {
  const registry = createDesignSystemRegistryV4();
  const system = v4System();

  registry.register(system);

  assert.equal(registry.has("runtime-v4"), true);
  assert.equal(registry.get("runtime-v4"), system);
});

test("function and React exotic components are accepted", () => {
  const components = requiredOnlyComponents();
  components.Button = forwardRef(() => null);
  components.Input = memo(component);
  components.Textarea = lazy(async () => ({ default: component }));

  const registry = createDesignSystemRegistryV4([v4System({ components })]);

  assert.equal(registry.has("runtime-v4"), true);
});

test("a false required component value is rejected", () => {
  const components = requiredOnlyComponents();
  components.Heading = false;

  assert.throws(
    () => createDesignSystemRegistryV4([v4System({ components })]),
    /Cannot register design system "runtime-v4": V4 component Heading \(boolean\) must be a React component\./,
  );
});

test("a false optional component value is rejected", () => {
  const components = requiredOnlyComponents();
  components.Grid = false;

  assert.throws(
    () => createDesignSystemRegistryV4([v4System({ components })]),
    /Cannot register design system "runtime-v4": V4 component Grid \(boolean\) must be a React component\./,
  );
});

test("an explicitly present null optional component is rejected", () => {
  const components = requiredOnlyComponents();
  components.Grid = null;

  assert.throws(
    () => createDesignSystemRegistryV4([v4System({ components })]),
    /Cannot register design system "runtime-v4": V4 component Grid \(null\) must be a React component\./,
  );
});

test("a required component explicitly present as null is rejected", () => {
  const components = requiredOnlyComponents();
  components.Button = null;

  assert.throws(
    () => createDesignSystemRegistryV4([v4System({ components })]),
    /Cannot register design system "runtime-v4": V4 component Button \(null\) must be a React component\./,
  );
});

test("a plain object with an unrelated $$typeof symbol is rejected", () => {
  const components = requiredOnlyComponents();
  components.Grid = { $$typeof: Symbol("not-react") };

  assert.throws(
    () => createDesignSystemRegistryV4([v4System({ components })]),
    /Cannot register design system "runtime-v4": V4 component Grid \(object\) must be a React component\./,
  );
});

test("an unknown component name is rejected", () => {
  const components = requiredOnlyComponents();
  components.NotAComponent = component;

  assert.throws(
    () => createDesignSystemRegistryV4([v4System({ components })]),
    /Cannot register design system "runtime-v4": unknown V4 component NotAComponent\./,
  );
});

test("a V2-marker system is rejected by the V4 registry", () => {
  const system = { ...v4System(), componentContract: "v2" };

  assert.throws(() => createDesignSystemRegistryV4([system]), /componentContract must be "v4"/);
});
