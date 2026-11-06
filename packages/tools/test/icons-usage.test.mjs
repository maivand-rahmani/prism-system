#!/usr/bin/env node
/**
 * Focused tests for strict icon-import usage validation.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/icons-usage.test.mjs
 *
 * Icons are available only through the reserved `./icons` entrypoint, and the
 * only availability evidence is the installed manifest's real
 * `publicApi["./icons"]` list. These tests exercise the checker directly
 * (`checkSourceText`) and through a real temporary consumer (`checkUsage`)
 * whose installed manifest is read through its public `./manifest` export.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { ICON_ENTRYPOINT, iconNameFromExportName } from "../src/constants.mjs";
import { checkSourceText, checkUsage } from "../src/usage.mjs";
import { syntheticManifest } from "./manifest-fixture.mjs";

const PACKAGE_NAME = "@prism-system/ui-fixture";
const ICON_IMPORT_PATH = `${PACKAGE_NAME}/icons`;

const STRICT_RULES = Object.freeze({
  allowArbitraryColors: false,
  allowArbitraryRadius: false,
  allowArbitraryShadows: false,
  allowPrimitiveDuplication: false,
});

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

/**
 * The icon catalog metadata `loadUsageContext` passes to `checkSourceText`.
 * `declared: false` models a system with no `./icons` entrypoint, which ships
 * no icons even though the canonical vocabulary exists in core.
 */
function iconCatalog({ exports: exportList = ["SearchIcon", "HomeIcon"], declared = true } = {}) {
  const iconExports = new Set(declared ? exportList : []);
  const iconNames = new Set(
    [...iconExports].map((name) => iconNameFromExportName(name)).filter((name) => name !== null),
  );
  return {
    iconImportPath: ICON_IMPORT_PATH,
    iconEntrypoint: declared ? ICON_ENTRYPOINT : null,
    iconExports,
    iconNames,
  };
}

function checkText(text, options = {}) {
  const { strict = true, fileName = "src/icons.tsx", icons = iconCatalog() } = options;
  return checkSourceText({
    fileName,
    text,
    rules: STRICT_RULES,
    strict,
    componentNames: [],
    ...icons,
  });
}

function ruleIds(findings) {
  return findings.map((finding) => finding.ruleId);
}

/** Create a real temporary consumer with a synthetic installed manifest. */
function createConsumer(t, { iconExports = null, strict = true, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-icons-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const version = "1.0.0";
  const manifest = syntheticManifest({ id: "fixture", version, packageName: PACKAGE_NAME });
  if (iconExports !== null) {
    manifest.entrypoints[ICON_ENTRYPOINT] = { requirements: [] };
    manifest.exports[ICON_ENTRYPOINT] = "./dist/icons/index.mjs";
    manifest.publicApi[ICON_ENTRYPOINT] = [...iconExports];
  }

  writeJson(join(root, "package.json"), {
    name: "icons-consumer",
    version: "0.0.0",
    private: true,
    dependencies: { [PACKAGE_NAME]: version },
    designSystem: { schemaVersion: 1, package: PACKAGE_NAME, version, strict },
  });

  const systemDir = join(root, "node_modules", ...PACKAGE_NAME.split("/"));
  writeJson(join(systemDir, "package.json"), {
    name: PACKAGE_NAME,
    version,
    exports: { "./manifest": "./design-system.json" },
  });
  writeJson(join(systemDir, "design-system.json"), manifest);
  for (const [relative, content] of Object.entries(files)) writeFile(root, relative, content);

  return { root, manifest };
}

/* -------------------------------------------------------------------------- */
/* Named imports                                                              */
/* -------------------------------------------------------------------------- */

test("available named, aliased, and type-only icon imports pass", () => {
  const text = [
    `import { SearchIcon } from "${ICON_IMPORT_PATH}";`,
    `import { HomeIcon as Home } from "${ICON_IMPORT_PATH}";`,
    `import type { SearchIcon as SearchType } from "${ICON_IMPORT_PATH}";`,
    "",
    "export const search = SearchIcon;",
    "export const home = Home;",
    "export type Search = SearchType;",
    "",
  ].join("\n");

  assert.deepEqual(checkText(text), []);
});

test("a canonical icon the installed system does not publish fails as unknown-icon", () => {
  const text = `import { HomeIcon } from "${ICON_IMPORT_PATH}";\n`;

  const findings = checkText(text, {
    icons: iconCatalog({ exports: ["SearchIcon"] }),
  });

  assert.deepEqual(ruleIds(findings), ["unknown-icon"]);
  assert.equal(findings[0].token, "HomeIcon");
  assert.equal(findings[0].severity, "error");
  assert.match(findings[0].message, /canonical/);
  assert.match(findings[0].message, /does not publish/);
});

test("a non-canonical export name fails as unknown-icon", () => {
  const text = `import { RocketIcon } from "${ICON_IMPORT_PATH}";\n`;

  const findings = checkText(text);

  assert.deepEqual(ruleIds(findings), ["unknown-icon"]);
  assert.equal(findings[0].token, "RocketIcon");
  assert.match(findings[0].message, /not a canonical/);
});

test("a default import fails: the icon entrypoint has no default export", () => {
  const text = `import Icons from "${ICON_IMPORT_PATH}";\n\nexport const value = Icons;\n`;

  const findings = checkText(text);

  assert.deepEqual(ruleIds(findings), ["unknown-icon"]);
  assert.equal(findings[0].token, "Icons");
  assert.match(findings[0].message, /no default export/);
});

/* -------------------------------------------------------------------------- */
/* Missing catalog                                                            */
/* -------------------------------------------------------------------------- */

test("a system without ./icons fails imports with missing-icon-catalog only", () => {
  const named = checkText(`import { SearchIcon } from "${ICON_IMPORT_PATH}";\n`, {
    icons: iconCatalog({ declared: false }),
  });
  assert.deepEqual(ruleIds(named), ["missing-icon-catalog"]);
  assert.equal(named[0].token, ICON_IMPORT_PATH);
  assert.match(named[0].message, /declares no "\.\/icons" entrypoint/);

  // A namespace binding adds no second per-member finding: the catalog is absent.
  const namespace = checkText(
    [
      `import * as Icons from "${ICON_IMPORT_PATH}";`,
      "",
      "export const value = Icons.SearchIcon;",
      "",
    ].join("\n"),
    { icons: iconCatalog({ declared: false }) },
  );
  assert.deepEqual(ruleIds(namespace), ["missing-icon-catalog"]);
});

test("the core vocabulary is not treated as icon availability", () => {
  // Even a canonical name that core defines fails when the installed system
  // declares no icon catalog.
  const findings = checkText(`import { SearchIcon } from "${ICON_IMPORT_PATH}";\n`, {
    icons: iconCatalog({ declared: false, exports: [] }),
  });

  assert.deepEqual(ruleIds(findings), ["missing-icon-catalog"]);
});

/* -------------------------------------------------------------------------- */
/* Namespace imports                                                          */
/* -------------------------------------------------------------------------- */

test("namespace member usage passes for available icons", () => {
  const text = [
    `import * as Icons from "${ICON_IMPORT_PATH}";`,
    "",
    "export function Search() {",
    "  return <Icons.SearchIcon />;",
    "}",
    "",
    "export const home = Icons.HomeIcon;",
    'export const literal = Icons["SearchIcon"];',
    "",
  ].join("\n");

  assert.deepEqual(checkText(text), []);
});

test("unknown namespace members fail as unknown-icon", () => {
  const text = [
    `import * as Icons from "${ICON_IMPORT_PATH}";`,
    "",
    "export const value = Icons.RocketIcon;",
    "",
  ].join("\n");

  const findings = checkText(text, {
    icons: iconCatalog({ exports: ["SearchIcon"] }),
  });

  assert.deepEqual(ruleIds(findings), ["unknown-icon"]);
  assert.equal(findings[0].token, "RocketIcon");
});

test("computed namespace access is unverified, not silently accepted", () => {
  const text = [
    `import * as Icons from "${ICON_IMPORT_PATH}";`,
    "",
    "export function pick(name: string) {",
    "  return Icons[name];",
    "}",
    "",
  ].join("\n");

  const findings = checkText(text);

  assert.deepEqual(ruleIds(findings), ["unverified-icon-import"]);
  assert.match(findings[0].message, /Computed member access/);
});

/* -------------------------------------------------------------------------- */
/* Re-exports                                                                 */
/* -------------------------------------------------------------------------- */

test("named icon re-exports are validated; export * is unverified", () => {
  const valid = checkText(
    [
      `export { SearchIcon } from "${ICON_IMPORT_PATH}";`,
      `export type { HomeIcon } from "${ICON_IMPORT_PATH}";`,
      "",
    ].join("\n"),
  );
  assert.deepEqual(valid, []);

  const unknown = checkText([`export { HomeIcon } from "${ICON_IMPORT_PATH}";`, ""].join("\n"), {
    icons: iconCatalog({ exports: ["SearchIcon"] }),
  });
  assert.deepEqual(ruleIds(unknown), ["unknown-icon"]);
  assert.equal(unknown[0].token, "HomeIcon");

  const star = checkText(`export * from "${ICON_IMPORT_PATH}";\n`);
  assert.deepEqual(ruleIds(star), ["unverified-icon-import"]);
  assert.equal(star[0].token, "export *");

  const namespaceStar = checkText(`export * as Icons from "${ICON_IMPORT_PATH}";\n`);
  assert.deepEqual(ruleIds(namespaceStar), ["unverified-icon-import"]);
});

/* -------------------------------------------------------------------------- */
/* Dynamic forms                                                              */
/* -------------------------------------------------------------------------- */

test("dynamic import(), require(), and template specifiers are unverified", () => {
  const text = [
    "export async function load() {",
    `  return import("${ICON_IMPORT_PATH}");`,
    "}",
    "",
    `export const required = require("${ICON_IMPORT_PATH}");`,
    "",
    "export function loadNamed(name: string) {",
    `  return import(\`${ICON_IMPORT_PATH}/\${name}\`);`,
    "}",
    "",
  ].join("\n");

  const findings = checkText(text);

  assert.deepEqual(ruleIds(findings), [
    "unverified-icon-import",
    "unverified-icon-import",
    "unverified-icon-import",
  ]);
  for (const finding of findings) {
    assert.match(finding.message, /cannot be resolved statically/);
  }
});

test("dynamic imports are unverified even when no icon catalog is shipped", () => {
  const text = `export const mod = import("${ICON_IMPORT_PATH}");\n`;

  const findings = checkText(text, {
    icons: iconCatalog({ declared: false }),
  });

  assert.deepEqual(ruleIds(findings), ["missing-icon-catalog"]);
});

/* -------------------------------------------------------------------------- */
/* Severity semantics                                                         */
/* -------------------------------------------------------------------------- */

test("non-strict icon findings are warnings and strict findings are errors", () => {
  const text = `import { RocketIcon } from "${ICON_IMPORT_PATH}";\n`;

  const strictFindings = checkText(text, { strict: true });
  assert.equal(strictFindings[0].severity, "error");

  const nonStrictFindings = checkText(text, { strict: false });
  assert.equal(nonStrictFindings[0].severity, "warning");
  assert.equal(nonStrictFindings[0].ruleId, "unknown-icon");
});

/* -------------------------------------------------------------------------- */
/* checkUsage integration                                                     */
/* -------------------------------------------------------------------------- */

test("checkUsage reads the installed icon catalog through the manifest", (t) => {
  const { root } = createConsumer(t, {
    iconExports: ["SearchIcon", "HomeIcon"],
    files: {
      "src/app.tsx": [
        `import { SearchIcon, HomeIcon as Home } from "${ICON_IMPORT_PATH}";`,
        `import * as Icons from "${ICON_IMPORT_PATH}";`,
        "",
        "export const search = SearchIcon;",
        "export const home = Home;",
        "export const bell = Icons.BellIcon;",
        "",
      ].join("\n"),
    },
  });

  const result = checkUsage({ cwd: root });

  assert.equal(result.ok, false);
  assert.equal(result.errors, 1);
  assert.equal(result.warnings, 0);
  assert.deepEqual(ruleIds(result.findings), ["unknown-icon"]);
  assert.equal(result.findings[0].file, "src/app.tsx");
  assert.equal(result.findings[0].token, "BellIcon");
});

test("checkUsage reports a missing icon catalog for a system without ./icons", (t) => {
  const { root } = createConsumer(t, {
    files: {
      "src/app.tsx": `import { SearchIcon } from "${ICON_IMPORT_PATH}";\n`,
    },
  });

  const result = checkUsage({ cwd: root });

  assert.equal(result.ok, false);
  assert.deepEqual(ruleIds(result.findings), ["missing-icon-catalog"]);
  assert.equal(result.findings[0].severity, "error");

  const relaxed = checkUsage({ cwd: root, strict: false });
  assert.equal(relaxed.ok, true);
  assert.equal(relaxed.warnings, 1);
  assert.equal(relaxed.findings[0].severity, "warning");
});
