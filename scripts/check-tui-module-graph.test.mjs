#!/usr/bin/env node
/**
 * Focused tests for the packed TUI module-graph verifier
 * (`scripts/check-tui-module-graph.mjs`).
 *
 * Run directly:
 *   node --test scripts/check-tui-module-graph.test.mjs
 *
 * Every fixture lives in its own fresh unique OS temp directory and is removed
 * by its test. The repository, `TEMP/`, and the tools package are never touched.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  TUI_ENTRY_PATH,
  assertPackedTuiModuleGraph,
  inspectTuiModuleGraph,
} from "./check-tui-module-graph.mjs";

function tempRoot(t) {
  const dir = mkdtempSync(join(tmpdir(), "prism-tui-module-graph-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, relPath, content) {
  const absolute = join(root, relPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
  return absolute;
}

function packageFixture(t) {
  const root = tempRoot(t);
  const packageDir = join(root, "package");
  mkdirSync(packageDir, { recursive: true });
  return { root, packageDir };
}

test("follows nested static imports, re-exports, and literal dynamic imports", (t) => {
  const { packageDir } = packageFixture(t);
  write(
    packageDir,
    TUI_ENTRY_PATH,
    [
      'import { helper } from "./tui/helper.mjs";',
      'import React from "react";',
      'import { readFile } from "node:fs/promises";',
      '// import("./commented-out.mjs");',
      "export async function start() {",
      '  const app = await import("./tui-app.mjs");',
      "  return app;",
      "}",
      "",
    ].join("\n"),
  );
  write(
    packageDir,
    "src/tui-app.mjs",
    ['export { helper } from "./tui/helper.mjs";', 'export * from "./tui/feature.js";', ""].join(
      "\n",
    ),
  );
  write(
    packageDir,
    "src/tui/helper.mjs",
    [
      'import { feature } from "./feature.js";',
      'export const loadFeature = () => import("./feature.js");',
      "export const helper = feature;",
      "",
    ].join("\n"),
  );
  write(packageDir, "src/tui/feature.js", "export const feature = true;\n");

  const result = inspectTuiModuleGraph({ packageDir });

  assert.equal(result.ok, true, result.failures.join("; "));
  assert.equal(result.entry, TUI_ENTRY_PATH);
  assert.deepEqual(result.files, [
    "src/tui-app.mjs",
    "src/tui.mjs",
    "src/tui/feature.js",
    "src/tui/helper.mjs",
  ]);
  assert.deepEqual(result.dynamicImports, [
    { from: "src/tui.mjs", specifier: "./tui-app.mjs", line: 6 },
    { from: "src/tui/helper.mjs", specifier: "./feature.js", line: 2 },
  ]);
  assert.deepEqual(result.externalSpecifiers, ["node:fs/promises", "react"]);
  assert.deepEqual(result.nonliteralDynamicImports, []);
  assert.doesNotThrow(() => assertPackedTuiModuleGraph({ label: "fixture", packageDir }));
});

test("ignores bare and node: external imports", (t) => {
  const { packageDir } = packageFixture(t);
  write(
    packageDir,
    TUI_ENTRY_PATH,
    [
      'import React from "react";',
      'import { readFile } from "node:fs";',
      'import { thing } from "@scope/package/subpath";',
      'export const load = () => import("ink");',
      "",
    ].join("\n"),
  );

  const result = inspectTuiModuleGraph({ packageDir });

  assert.equal(result.ok, true, result.failures.join("; "));
  assert.deepEqual(result.files, ["src/tui.mjs"]);
  assert.deepEqual(result.externalSpecifiers, [
    "@scope/package/subpath",
    "ink",
    "node:fs",
    "react",
  ]);
  assert.deepEqual(result.dynamicImports, []);
});

test("fails clearly when a literal relative target is missing", (t) => {
  const { packageDir } = packageFixture(t);
  write(packageDir, TUI_ENTRY_PATH, 'import "./missing-feature.mjs";\n');

  const result = inspectTuiModuleGraph({ packageDir });

  assert.equal(result.ok, false);
  assert.deepEqual(result.files, ["src/tui.mjs"]);
  assert.deepEqual(result.failures, [
    'src/tui.mjs: relative target "./missing-feature.mjs" does not exist',
  ]);
  assert.throws(
    () => assertPackedTuiModuleGraph({ label: "fixture", packageDir }),
    /fixture TUI module graph is incomplete: src\/tui\.mjs: relative target "\.\/missing-feature\.mjs" does not exist/,
  );
});

test("fails clearly when a literal relative target escapes the package root", (t) => {
  const { root, packageDir } = packageFixture(t);
  // The target exists outside the package; containment must still fail closed.
  write(root, "outside.mjs", "export const outside = true;\n");
  write(packageDir, TUI_ENTRY_PATH, 'import "../../outside.mjs";\n');

  const result = inspectTuiModuleGraph({ packageDir });

  assert.equal(result.ok, false);
  assert.deepEqual(result.files, ["src/tui.mjs"]);
  assert.deepEqual(result.failures, [
    'src/tui.mjs: relative target "../../outside.mjs" escapes the extracted package root',
  ]);
});

test("reports nonliteral dynamic imports as unproven instead of following them", (t) => {
  const { packageDir } = packageFixture(t);
  write(
    packageDir,
    TUI_ENTRY_PATH,
    ['const name = "./feature.mjs";', "export const load = () => import(name);", ""].join("\n"),
  );
  write(packageDir, "src/feature.mjs", "export const feature = true;\n");

  const result = inspectTuiModuleGraph({ packageDir });

  assert.equal(result.ok, true, result.failures.join("; "));
  assert.deepEqual(result.files, ["src/tui.mjs"]);
  assert.deepEqual(result.nonliteralDynamicImports, [{ from: "src/tui.mjs", line: 2 }]);
});
