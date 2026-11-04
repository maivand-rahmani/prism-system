#!/usr/bin/env node
/**
 * Runtime regression tests for the unstyled core Select primitive.
 *
 * Radix requires two structural pieces that are easy to omit in a thin adapter:
 * `Select.Viewport` (the collection slot used by keyboard navigation and
 * typeahead) and `Select.ItemText` (the text/native-option bridge used by
 * `Select.Value` and the hidden form control). Core renders both automatically
 * so every design system gets a working listbox from the shared contract.
 *
 * These tests render the compiled package with `react-dom/server` and assert
 * the structural contract. Browser-level keyboard and controlled-value behavior
 * is verified against the Showcase; see the pull request for the Playwright
 * results.
 *
 * Run after a core build:
 *   pnpm --filter @prism-system/ui-core build
 *   node --test packages/core/src/primitives/select.runtime.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../dist/primitives/select.js";

const h = React.createElement;

function renderOpenSelect() {
  return renderToStaticMarkup(
    h(
      Select,
      { open: true, value: "alpha", name: "letter" },
      h(
        SelectTrigger,
        { "aria-label": "Letter" },
        h(SelectValue, { placeholder: "Choose a letter" }),
      ),
      h(
        SelectContent,
        null,
        h(SelectItem, { value: "alpha" }, "Alpha"),
        h(SelectItem, { value: "beta" }, "Beta"),
      ),
    ),
  );
}

test("SelectContent renders the Radix viewport collection slot", () => {
  const markup = renderOpenSelect();

  assert.match(markup, /data-slot="select-viewport"/);
  assert.match(markup, /role="listbox"/);
});

test("SelectItem routes its children through SelectItemText", () => {
  const markup = renderOpenSelect();
  const itemTexts = markup.match(/data-slot="select-item-text"/g) ?? [];

  assert.equal(itemTexts.length, 2);
  assert.match(markup, /data-slot="select-item-text"[^>]*>Alpha</);
  assert.match(markup, /data-slot="select-item-text"[^>]*>Beta</);
});

test("the selected item and the hidden form control are structurally linked", () => {
  const markup = renderOpenSelect();

  assert.match(markup, /data-state="checked"[^>]*data-slot="select-item"/);
  assert.match(markup, /<select[^>]*name="letter"/);
});
