#!/usr/bin/env node
/**
 * Runtime tests for the shared icon vocabulary.
 *
 * Node's built-in test runner; imports compiled core from `dist`, so run after
 * `pnpm --filter @prism-system/ui-core build`.
 *
 * Proves the catalog is exactly fifty unique canonical names, that the five
 * groups partition it in canonical order, that public export naming is stable,
 * that the component contract is twenty-nine required plus thirty-one optional
 * names, and that icons never leak into the component contract.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { OPTIONAL_COMPONENTS, REQUIRED_COMPONENTS } from "../../dist/design-system/components.js";
import {
  ICON_CATEGORIES,
  ICON_EXPORT_SUFFIX,
  ICON_NAMES,
  iconExportName,
  iconNameFromExportName,
  iconNamesInCategory,
  isCanonicalIconExportName,
  isIconName,
} from "../../dist/design-system/icons.js";

const CANONICAL_EXPECTED = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "ChevronLeft",
  "ChevronRight",
  "ChevronUp",
  "ChevronDown",
  "Menu",
  "Home",
  "Plus",
  "Minus",
  "Close",
  "Check",
  "Search",
  "Filter",
  "Settings",
  "Edit",
  "Trash",
  "Copy",
  "Download",
  "Upload",
  "Share",
  "Link",
  "ExternalLink",
  "File",
  "Folder",
  "Image",
  "Calendar",
  "Clock",
  "Info",
  "Help",
  "Warning",
  "Error",
  "Success",
  "Loading",
  "Eye",
  "EyeOff",
  "Lock",
  "Unlock",
  "User",
  "Users",
  "Mail",
  "Bell",
  "Heart",
  "Star",
  "MoreHorizontal",
  "MoreVertical",
  "Refresh",
  "LogOut",
];

test("the catalog is exactly fifty unique names in canonical order", () => {
  assert.equal(ICON_NAMES.length, 50);
  assert.equal(new Set(ICON_NAMES).size, 50);
  assert.deepEqual([...ICON_NAMES], CANONICAL_EXPECTED);
});

test("the five categories partition the catalog with ten names each", () => {
  assert.deepEqual(Object.keys(ICON_CATEGORIES), [
    "navigation",
    "actions",
    "files",
    "feedback",
    "interface",
  ]);
  const flattened = Object.values(ICON_CATEGORIES).flat();
  assert.deepEqual(flattened, CANONICAL_EXPECTED);
  for (const [category, names] of Object.entries(ICON_CATEGORIES)) {
    assert.equal(names.length, 10, `${category} must contain ten names`);
    assert.deepEqual([...iconNamesInCategory(category)], [...names]);
  }
});

test("public export naming is one stable suffix", () => {
  assert.equal(ICON_EXPORT_SUFFIX, "Icon");
  const exports = ICON_NAMES.map(iconExportName);
  assert.equal(new Set(exports).size, 50);
  assert.equal(exports[0], "ArrowLeftIcon");
  assert.equal(exports[49], "LogOutIcon");
  for (const name of ICON_NAMES) {
    assert.equal(iconExportName(name), `${name}Icon`);
    assert.equal(isCanonicalIconExportName(`${name}Icon`), true);
    assert.equal(iconNameFromExportName(`${name}Icon`), name);
  }
  assert.equal(isCanonicalIconExportName("Search"), false);
  assert.equal(isCanonicalIconExportName("Searchicon"), false);
  assert.equal(isCanonicalIconExportName("UnknownIcon"), false);
  assert.equal(iconNameFromExportName("UnknownIcon"), null);
  assert.equal(iconNameFromExportName(42), null);
});

test("isIconName accepts only canonical names", () => {
  assert.equal(isIconName("Search"), true);
  assert.equal(isIconName("search"), false);
  assert.equal(isIconName("SearchIcon"), false);
  assert.equal(isIconName(null), false);
  assert.equal(isIconName(7), false);
});

test("the component contract has twenty-nine required and thirty-one optional names", () => {
  assert.equal(REQUIRED_COMPONENTS.length, 29);
  assert.equal(OPTIONAL_COMPONENTS.length, 31);
  assert.equal(new Set([...REQUIRED_COMPONENTS, ...OPTIONAL_COMPONENTS]).size, 60);
});

test("icons never appear in the component contract", () => {
  const components = new Set([...REQUIRED_COMPONENTS, ...OPTIONAL_COMPONENTS]);
  assert.equal(components.size, 60);
  // A few semantic names intentionally overlap a component word (for example the
  // Link component and the Link icon). The contract is unchanged: no icon name
  // was added to either component tuple, and the `${Name}Icon` exports are never
  // component names.
  for (const name of ICON_NAMES) {
    assert.equal(components.has(`${name}Icon`), false, `${name}Icon must not be a component`);
  }
  assert.equal(REQUIRED_COMPONENTS.length + OPTIONAL_COMPONENTS.length, 60);
});
