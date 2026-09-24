#!/usr/bin/env node
/**
 * Focused unit tests for the V4 Phase 5 lifecycle harness
 * (`scripts/check-v4-lifecycle.mjs`).
 *
 * Run directly:
 *   node --test scripts/check-v4-lifecycle.test.mjs
 *
 * These tests cover the harness's pure helpers and fail-closed directory
 * behavior only. They never build, pack, install, or touch `TEMP/`: every
 * fixture lives in a fresh unique OS temp directory removed by its own test.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  OPTIONAL_SETS,
  V4_REQUIRED_COMPONENT_NAMES,
  buildRuntimeProbeSource,
  buildTailwindProbeCss,
  buildTailwindProbeSource,
  buildTypecheckSource,
  collectRepoVersionState,
  createUniqueRunDirectory,
  cssVariableValue,
  semanticUtilityClass,
  semanticUtilityRule,
} from "./check-v4-lifecycle.mjs";

const REQUIRED = [
  "Button",
  "Input",
  "Textarea",
  "Card",
  "Badge",
  "Checkbox",
  "RadioGroup",
  "Switch",
  "Select",
  "Tabs",
  "Dialog",
  "DropdownMenu",
  "Tooltip",
  "Separator",
  "Heading",
  "Text",
  "Link",
  "Container",
  "Stack",
  "FormField",
];

const HARNESS_SOURCE = readFileSync(new URL("./check-v4-lifecycle.mjs", import.meta.url), "utf8");

const FIXTURE_SYSTEMS = [
  {
    namespace: "SystemA",
    id: "system-a",
    packageName: "@prism-system/ui-system-a",
    tokensExport: "systemATokens",
    optional: ["Grid", "Alert"],
  },
  {
    namespace: "SystemB",
    id: "system-b",
    packageName: "@prism-system/ui-system-b",
    tokensExport: "systemBTokens",
    optional: [],
  },
];

function tempRoot(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, relPath, content) {
  const absolute = join(root, relPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
  return absolute;
}

/* -------------------------------------------------------------------------- */
/* Contract catalogs                                                          */
/* -------------------------------------------------------------------------- */

test("the required V4 list is the canonical twenty in contract order", () => {
  assert.deepEqual([...V4_REQUIRED_COMPONENT_NAMES], REQUIRED);
  assert.equal(new Set(V4_REQUIRED_COMPONENT_NAMES).size, 20);
});

test("the declared optional sets match the V4 Phase 2 capability split", () => {
  assert.deepEqual(
    [...OPTIONAL_SETS["system-a"]],
    ["Grid", "Fieldset", "Alert", "Progress", "Accordion", "Pagination", "Table"],
  );
  assert.deepEqual(
    [...OPTIONAL_SETS["system-b"]],
    ["Section", "Alert", "Skeleton", "Toast", "Avatar", "Breadcrumbs"],
  );
  // Alert is the one optional both systems implement; the rest differ.
  const a = new Set(OPTIONAL_SETS["system-a"]);
  const b = new Set(OPTIONAL_SETS["system-b"]);
  assert.deepEqual(
    [...a].filter((name) => b.has(name)),
    ["Alert"],
  );
  assert.ok([...a, ...b].every((name) => REQUIRED.indexOf(name) === -1));
});

/* -------------------------------------------------------------------------- */
/* Tailwind probe helpers                                                     */
/* -------------------------------------------------------------------------- */

test("semanticUtilityClass maps a token name to its prefixed utility", () => {
  assert.equal(semanticUtilityClass("prism", "text", "text-primary"), "text-prism-text-primary");
  assert.equal(semanticUtilityClass("prism", "bg", "surface-raised"), "bg-prism-surface-raised");
});

test("buildTailwindProbeCss emits the canonical import order and a scoped source", () => {
  const css = buildTailwindProbeCss("@prism-system/ui-system-a");
  assert.equal(
    css,
    [
      '@import "tailwindcss";',
      '@import "@prism-system/ui-system-a/tailwind.css";',
      '@import "@prism-system/ui-system-a/styles.css";',
      '@source "./Probe.tsx";',
      "",
    ].join("\n"),
  );
});

test("buildTailwindProbeSource uses the semantic utilities for the tailwind prefix", () => {
  const source = buildTailwindProbeSource("prism");
  assert.match(source, /text-prism-text-primary/);
  assert.match(source, /bg-prism-surface-raised/);
  assert.doesNotMatch(buildTailwindProbeSource("other"), /prism-text-primary/);
  assert.match(buildTailwindProbeSource("other"), /text-other-text-primary/);
});

test("cssVariableValue extracts the first declaration value and returns null when absent", () => {
  const css = [
    ":root {",
    "  --maivand-a-color-text-primary: #1d2925;",
    "  --maivand-a-spacing-scale-4:",
    "    1rem;",
    "}",
  ].join("\n");
  assert.equal(cssVariableValue(css, "--maivand-a-color-text-primary"), "#1d2925");
  assert.equal(cssVariableValue(css, "--maivand-a-spacing-scale-4"), "1rem");
  assert.equal(cssVariableValue(css, "--maivand-a-missing-token"), null);
});

test("semanticUtilityRule returns the compiled rule body, or null when absent", () => {
  const compiled = [
    "@layer utilities {",
    "  .text-prism-text-primary {",
    "    color: var(--maivand-a-color-text-primary);",
    "  }",
    "}",
  ].join("\n");
  assert.equal(
    semanticUtilityRule(compiled, "text-prism-text-primary"),
    "\n    color: var(--maivand-a-color-text-primary);\n  ",
  );
  assert.equal(semanticUtilityRule(compiled, "bg-prism-surface-raised"), null);
  // The dot is escaped, so a wildcard-looking name cannot match anything else.
  assert.equal(
    semanticUtilityRule(".text-prism-text-primary { color: red; }", "xtext-prism"),
    null,
  );
});

/* -------------------------------------------------------------------------- */
/* Consumer source builders                                                   */
/* -------------------------------------------------------------------------- */

test("buildTypecheckSource references every required export for every system", () => {
  const source = buildTypecheckSource(FIXTURE_SYSTEMS);
  for (const system of FIXTURE_SYSTEMS) {
    assert.match(
      source,
      new RegExp(`import \\* as ${system.namespace} from "${system.packageName}";`),
    );
    for (const name of REQUIRED) {
      assert.match(
        source,
        new RegExp(`${system.namespace}\\.${name},`),
        `${system.namespace}.${name}`,
      );
    }
    assert.match(source, new RegExp(`${system.packageName}/manifest`));
    assert.match(source, new RegExp(`import \\{ ${system.tokensExport} \\}`));
  }
  for (const optional of FIXTURE_SYSTEMS[0].optional) {
    assert.match(source, new RegExp(`SystemA\\.${optional},`), `SystemA.${optional}`);
  }
  // The system without optionals must not emit an empty optional record.
  assert.doesNotMatch(source, /SystemBOptional/);
  for (const name of ["REQUIRED_COMPONENTS_V4", "OPTIONAL_COMPONENTS_V4", "defineDesignSystemV4"]) {
    assert.ok(source.includes(name), name);
  }
  assert.match(source, /@prism-system\/ui-system-a\/styles\.css/);
  assert.match(source, /@prism-system\/ui-system-a\/tailwind\.css/);
});

test("buildTypecheckSource requires at least one system and a tokens export", () => {
  assert.throws(() => buildTypecheckSource([]), /at least one system/);
  assert.throws(
    () =>
      buildTypecheckSource([
        { namespace: "Broken", id: "broken", packageName: "@prism-system/ui-broken", optional: [] },
      ]),
    /tokensExport/,
  );
});

test("buildRuntimeProbeSource embeds the packages and the consumer node_modules guard", () => {
  const packages = [
    { packageName: "@prism-system/ui-system-a", version: "1.1.0", tokensExport: "systemATokens" },
  ];
  const source = buildRuntimeProbeSource(packages, "C:\\consumer");
  assert.match(source, /@prism-system\/ui-system-a/);
  assert.match(source, /systemATokens/);
  assert.match(source, /node_modules/);
  assert.match(source, /REQUIRED_COMPONENTS_V4/);
  assert.match(source, /OPTIONAL_COMPONENTS_V4/);
});

/* -------------------------------------------------------------------------- */
/* Fail-closed run directory and repository state                             */
/* -------------------------------------------------------------------------- */

test("createUniqueRunDirectory fails closed instead of overwriting an existing path", (t) => {
  const base = tempRoot(t, "prism-lifecycle-");
  const first = createUniqueRunDirectory(base, "lifecycle-fixed");
  writeFileSync(join(first, "marker.txt"), "keep me\n", "utf8");

  assert.throws(
    () => createUniqueRunDirectory(base, "lifecycle-fixed"),
    (error) => error.code === "EEXIST",
  );
  assert.equal(readFileSync(join(first, "marker.txt"), "utf8"), "keep me\n");
  assert.ok(first.startsWith(base));
});

test("run-directory setup failure aborts before any later lifecycle checks", () => {
  const setup = HARNESS_SOURCE.indexOf(
    'runCheck("prepare unique TEMP/v4/lifecycle-<uuid> run directory"',
  );
  const abort = HARNESS_SOURCE.indexOf(
    "if (!runDirectoryReady) throw RUN_DIRECTORY_SETUP_ABORT;",
    setup,
  );
  const nextCheck = HARNESS_SOURCE.indexOf(
    'runCheck("snapshot repository version/config/manifest state (before)"',
    setup,
  );

  assert.notEqual(setup, -1, "the harness must prepare its unique run directory first");
  assert.notEqual(abort, -1, "the harness must stop after a failed run-directory setup");
  assert.notEqual(nextCheck, -1, "the repository snapshot is the next lifecycle check");
  assert.ok(setup < abort && abort < nextCheck, "the abort guard must precede all later checks");
});

test("collectRepoVersionState hashes version/config files and detects changes", (t) => {
  const root = tempRoot(t, "prism-repo-state-");
  write(root, "package.json", '{\n  "version": "0.3.0"\n}\n');
  write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(root, "config/design-systems.json", '{\n  "version": 2,\n  "designSystems": []\n}\n');
  write(root, "packages/demo/package.json", '{\n  "version": "1.0.0"\n}\n');
  write(root, "packages/demo/design-system.json", '{\n  "version": "1.0.0"\n}\n');
  write(
    root,
    "packages/demo/src/design-system.ts",
    'export const DesignSystem = { version: "1.0.0" };\n',
  );
  write(root, "apps/showcase/package.json", '{\n  "name": "showcase"\n}\n');
  write(root, ".changeset/fix.md", "---\n---\n\nA change.\n");

  const before = collectRepoVersionState(root);
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "config/design-systems.json",
    "packages/demo/package.json",
    "packages/demo/design-system.json",
    "packages/demo/src/design-system.ts",
    "apps/showcase/package.json",
    ".changeset/fix.md",
  ]) {
    assert.ok(before.has(file), `missing ${file}`);
    assert.match(before.get(file), /^[0-9a-f]{64}$/);
  }

  write(
    root,
    "config/design-systems.json",
    '{\n  "version": 2,\n  "designSystems": ["changed"]\n}\n',
  );
  const after = collectRepoVersionState(root);
  assert.notEqual(
    after.get("config/design-systems.json"),
    before.get("config/design-systems.json"),
  );
  assert.equal(after.get("package.json"), before.get("package.json"));
});
