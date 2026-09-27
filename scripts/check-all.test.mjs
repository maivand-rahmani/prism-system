#!/usr/bin/env node
/**
 * Focused unit tests for the lifecycle harness
 * (`scripts/check-all.mjs`).
 *
 * Run directly:
 *   node --test scripts/check-all.test.mjs
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
  FLAT_CARD_PARTS,
  OPTIONAL_SETS,
  REQUIRED_COMPONENT_NAMES,
  assertCapabilityInventory,
  assertClientEntryBoundary,
  buildRuntimeProbeSource,
  buildTailwindProbeCss,
  buildTailwindProbeSource,
  buildTypecheckSource,
  collectRepoVersionState,
  createUniqueRunDirectory,
  cssVariableValue,
  semanticUtilityClass,
  semanticUtilityRule,
  startsWithClientDirective,
} from "./check-all.mjs";
import { CAPABILITY_CATEGORIES } from "./design-system-manifest.mjs";

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
  "Center",
  "Cluster",
  "Sidebar",
  "AspectRatio",
  "Combobox",
  "DatePicker",
  "NumberField",
  "Slider",
  "FileUpload",
];

const HARNESS_SOURCE = readFileSync(new URL("./check-all.mjs", import.meta.url), "utf8");

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

test("the required list is the canonical twenty-nine in contract order", () => {
  assert.deepEqual([...REQUIRED_COMPONENT_NAMES], REQUIRED);
  assert.equal(new Set(REQUIRED_COMPONENT_NAMES).size, 29);
});

test("the declared optional sets match the capability split", () => {
  assert.deepEqual(
    [...OPTIONAL_SETS["system-a"]],
    [
      "Grid",
      "Fieldset",
      "Alert",
      "Progress",
      "Accordion",
      "Pagination",
      "Table",
      "Metric",
      "DescriptionList",
      "Timeline",
      "Meter",
    ],
  );
  assert.deepEqual(
    [...OPTIONAL_SETS["system-b"]],
    [
      "Section",
      "Alert",
      "Skeleton",
      "Toast",
      "Avatar",
      "Breadcrumbs",
      "Metric",
      "Timeline",
      "EmptyState",
    ],
  );
  // Alert, Metric, and Timeline are the optionals both systems implement; the rest differ.
  const a = new Set(OPTIONAL_SETS["system-a"]);
  const b = new Set(OPTIONAL_SETS["system-b"]);
  assert.deepEqual(
    [...a].filter((name) => b.has(name)),
    ["Alert", "Metric", "Timeline"],
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
/* Packed client boundary                                                     */
/* -------------------------------------------------------------------------- */

test("startsWithClientDirective accepts a leading directive in either quote style", () => {
  assert.equal(startsWithClientDirective('"use client";\nimport x from "y";\n'), true);
  assert.equal(startsWithClientDirective("'use client'\nexport {};\n"), true);
  assert.equal(
    startsWithClientDirective('\uFEFF\r\n"use client";\r\nmodule.exports = {};\n'),
    true,
  );
  assert.equal(startsWithClientDirective('"use client";\n"use client";\n'), true);
});

test("startsWithClientDirective rejects missing, trailing, and unrelated directives", () => {
  assert.equal(startsWithClientDirective(""), false);
  assert.equal(startsWithClientDirective("import x from 'y';\n"), false);
  assert.equal(startsWithClientDirective('"use strict";\n"use client";\n'), false);
  assert.equal(startsWithClientDirective('"use server";\n'), false);
  assert.equal(startsWithClientDirective('// comment\n"use client";\n'), false);
});

test("assertClientEntryBoundary requires root directives and server-safe tokens", () => {
  const good = {
    rootEsm: '"use client";\nexport const Button = 1;\n',
    rootCjs: '"use client";\n"use strict";\nmodule.exports = {};\n',
    tokensEsm: "export const tokens = {};\n",
    tokensCjs: '"use strict";\nmodule.exports = {};\n',
  };
  assert.doesNotThrow(() => assertClientEntryBoundary(good, "fixture"));

  assert.throws(
    () => assertClientEntryBoundary({ ...good, rootEsm: "export const Button = 1;\n" }, "fixture"),
    /fixture: root ESM must open with a top-level "use client" directive/,
  );
  assert.throws(
    () =>
      assertClientEntryBoundary(
        { ...good, rootCjs: '"use strict";\n"use client";\nmodule.exports = {};\n' },
        "fixture",
      ),
    /fixture: root CJS must open/,
  );
  assert.throws(
    () =>
      assertClientEntryBoundary(
        { ...good, tokensEsm: '"use client";\nexport const tokens = {};\n' },
        "fixture",
      ),
    /fixture: tokens ESM must not be a client entry/,
  );
  assert.throws(
    () => assertClientEntryBoundary({ ...good, tokensCjs: undefined }, "fixture"),
    /fixture: tokens CJS entry is missing/,
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
  for (const name of ["REQUIRED_COMPONENTS", "OPTIONAL_COMPONENTS", "defineDesignSystem"]) {
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

test("buildTypecheckSource references the flat Card parts for every system", () => {
  const source = buildTypecheckSource(FIXTURE_SYSTEMS);
  assert.match(
    source,
    /const flatCardParts = \["CardHeader","CardTitle","CardDescription","CardContent","CardFooter"\] as const;/,
  );
  for (const system of FIXTURE_SYSTEMS) {
    assert.match(
      source,
      new RegExp(
        `const ${system.namespace}FlatCardParts: Record<\\(typeof flatCardParts\\)\\[number\\], unknown> = \\{`,
      ),
      `${system.namespace}FlatCardParts record`,
    );
    for (const name of FLAT_CARD_PARTS) {
      assert.match(
        source,
        new RegExp(`${system.namespace}\\.${name},`),
        `${system.namespace}.${name} reference`,
      );
      assert.match(
        source,
        new RegExp(`<${system.namespace}\\.${name}>`),
        `${system.namespace}.${name} JSX usage`,
      );
      assert.match(
        source,
        new RegExp(`</${system.namespace}\\.${name}>`),
        `${system.namespace}.${name} JSX close tag`,
      );
    }
  }
  assert.match(source, /cardParts: \[SystemAFlatCardParts, SystemBFlatCardParts\]/);
  assert.match(source, /cardProbes: \[cardProbe0, cardProbe1\]/);
  // The flat parts are named imports; the compound static root stays in the
  // required record and must not be used for parts anywhere.
  assert.doesNotMatch(source, /Card\.Header|Card\.Title|Card\.Content/);
});

test("buildRuntimeProbeSource embeds the packages and the consumer node_modules guard", () => {
  const packages = [
    { packageName: "@prism-system/ui-system-a", version: "1.1.0", tokensExport: "systemATokens" },
  ];
  const source = buildRuntimeProbeSource(packages, "C:\\consumer");
  assert.match(source, /@prism-system\/ui-system-a/);
  assert.match(source, /systemATokens/);
  assert.match(source, /node_modules/);
  assert.match(source, /REQUIRED_COMPONENTS/);
  assert.match(source, /OPTIONAL_COMPONENTS/);
  // The runtime probe verifies the shipped manifest metadata and inventory.
  assert.match(source, /manifest\.schemaVersion !== 4/);
  assert.match(source, /manifest capabilities categories mismatch/);
  assert.match(source, /"data-display":/);
});

/* -------------------------------------------------------------------------- */
/* Shipped capability inventory                                               */
/* -------------------------------------------------------------------------- */

test("assertCapabilityInventory requires the exact canonical inventory", () => {
  const manifest = () => ({
    schemaVersion: 4,
    capabilities: { categories: structuredClone(CAPABILITY_CATEGORIES) },
  });

  assert.doesNotThrow(() => assertCapabilityInventory(manifest(), "fixture"));

  assert.throws(
    () => assertCapabilityInventory({ schemaVersion: 4 }, "fixture"),
    /fixture must declare capabilities\.categories/,
  );

  const unknownKey = manifest();
  unknownKey.capabilities.categories.extra = { required: [], optional: [] };
  assert.throws(
    () => assertCapabilityInventory(unknownKey, "fixture"),
    /capability category keys must be exactly composition, forms, data-display/,
  );

  const missingKey = manifest();
  delete missingKey.capabilities.categories.forms;
  assert.throws(
    () => assertCapabilityInventory(missingKey, "fixture"),
    /capability category keys must be exactly/,
  );

  // Wrong order (and therefore membership) is rejected.
  const wrongOrder = manifest();
  wrongOrder.capabilities.categories.composition.required = [
    "Stack",
    "Container",
    "Center",
    "Cluster",
    "Sidebar",
    "AspectRatio",
  ];
  assert.throws(
    () => assertCapabilityInventory(wrongOrder, "fixture"),
    /capability category "composition"\.required must be exactly/,
  );

  // A known name of the wrong class is rejected.
  const wrongClass = manifest();
  wrongClass.capabilities.categories.composition.optional = ["Grid", "Button"];
  assert.throws(
    () => assertCapabilityInventory(wrongClass, "fixture"),
    /capability category "composition"\.optional must be exactly/,
  );

  // Duplicate and unknown names are rejected.
  const duplicate = manifest();
  duplicate.capabilities.categories.forms.required = [
    "FormField",
    "FormField",
    "DatePicker",
    "NumberField",
    "Slider",
    "FileUpload",
  ];
  assert.throws(
    () => assertCapabilityInventory(duplicate, "fixture"),
    /capability category "forms"\.required must be exactly/,
  );

  const unknownName = manifest();
  unknownName.capabilities.categories["data-display"].optional = [
    "Table",
    "Pagination",
    "Progress",
    "Metric",
    "DescriptionList",
    "Timeline",
    "Meter",
    "Widget",
  ];
  assert.throws(
    () => assertCapabilityInventory(unknownName, "fixture"),
    /capability category "data-display"\.optional must be exactly/,
  );
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
    'runCheck("prepare unique TEMP/lifecycle/lifecycle-<uuid> run directory"',
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
