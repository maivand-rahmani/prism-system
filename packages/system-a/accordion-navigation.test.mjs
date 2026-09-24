#!/usr/bin/env node
/**
 * Nested-accordion navigation regression (static guard).
 *
 * This package has no DOM test harness, so this guard asserts the two source
 * facts that make level-scoped keyboard navigation work in
 * `src/components/accordion/Accordion.tsx`:
 *
 *   1. the accordion root is marked with `data-maivand-accordion`, and
 *   2. the trigger list used by ArrowUp/ArrowDown/Home/End is filtered to the
 *      triggers whose closest accordion root is the current root.
 *
 * Removing either makes Arrow/Home/End escape into a nested accordion again.
 * Run with: node --test accordion-navigation.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "src", "components", "accordion", "Accordion.tsx"),
  "utf8",
);

test("accordion root is marked for level scoping", () => {
  assert.match(source, /data-maivand-accordion=""/);
});

test("trigger navigation is scoped to the current accordion level", () => {
  assert.match(
    source,
    /\.filter\(\(trigger\)\s*=>\s*trigger\.closest\(\s*["']\[data-maivand-accordion\]["']\s*\)\s*===\s*root\s*\)/,
  );
});

test("the level-scoped trigger list drives the roving keyboard navigation", () => {
  assert.match(source, /const triggers = Array\.from\(/);
  assert.match(source, /triggers\[nextIndex\]\?\.focus\(\)/);
});
