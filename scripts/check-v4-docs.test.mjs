#!/usr/bin/env node
/**
 * V4 documentation validation tests (Node built-in test runner, no dependency).
 *
 * Run directly:
 *   node --test scripts/check-v4-docs.test.mjs
 *
 * Every fixture root is a fresh unique directory under the OS temp directory and
 * is removed only by its own test. The repository, its `TEMP/` directory, and
 * the package sources are never mutated; the contract-drift cases copy a real
 * package into the temp root first.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { collectActiveDocs, runDocsCheck } from "./check-v4-docs.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "scripts", "check-v4-docs.mjs");

function tempRoot(t) {
  const dir = mkdtempSync(join(tmpdir(), "prism-docs-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, relPath, content) {
  const absolute = join(root, relPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function writeRegistry(root, entries) {
  write(
    root,
    "config/design-systems.json",
    `${JSON.stringify({ version: 2, designSystems: entries }, null, 2)}\n`,
  );
}

/** A minimal V4 registry entry; docs-only fixtures never need the package. */
function systemEntry(id) {
  return {
    id,
    name: id,
    packageName: `@prism-system/ui-${id}`,
    packagePath: `packages/${id}`,
    version: "1.0.0",
    uiClass: `maivand-${id}-ui`,
    tokensExport: `${id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}Tokens`,
    contract: "v4",
  };
}

/** A V4 system README with all four sections; `components` overrides its body. */
function systemReadme({ id, packageName, components, omit = null }) {
  const sections = [
    ["Quickstart", "Install once and render."],
    ["Foundations", "Semantic tokens live in this package."],
    ["Components", components ?? defaultComponentsBody(id, packageName)],
    ["Usage rules", "- Compose with props."],
  ];
  return (
    [
      `# ${packageName}`,
      ...sections
        .filter(([title]) => title !== omit)
        .map(([title, body]) => `## ${title}\n\n${body}`),
    ].join("\n\n") + "\n"
  );
}

function defaultComponentsBody(id, packageName) {
  return (
    `Browse the live catalog at [catalog](/showcase/${id}) and read the catalog ` +
    `source at \`${packageName}/manifest\`.`
  );
}

function templateReadme({ route = "/showcase/{{SYSTEM_ID}}" } = {}) {
  return (
    [
      "# {{SYSTEM_NAME}}",
      "## Quickstart\n\nInstall once and render.",
      "## Foundations\n\nSemantic tokens live in this package.",
      `## Components\n\nThe live catalog is ${route}; the generated \`design-system.json\` ` +
        "manifest (`{{PACKAGE_NAME}}/manifest`) is the catalog source.",
      "## Usage rules\n\n- Compose with props.",
    ].join("\n\n") + "\n"
  );
}

/** A minimal migration guide with every required section; `omit` drops one. */
function migrationGuide({ omit = null, extra = "" } = {}) {
  const sections = [
    ["Что меняется", "Контракт сохраняется, манифест строго различает пары схем."],
    ["Версии пакетов", "Текущие версии и цели плана."],
    ["Путь миграции", "Обновите систему явной командой upgrade."],
    ["CSS и Tailwind", "styles.css и мост /tailwind.css."],
    ["Примеры до и после", "Только публичные импорты."],
    ["Команды prism-ds и их границы", "Офлайн-чтение и явные изменения."],
    ["Версионирование и выпуск", "Changesets управляет человек."],
  ];
  const body = sections
    .filter(([title]) => title !== omit)
    .map(([title, text]) => `## ${title}\n\n${text}`)
    .join("\n\n");
  return `# Миграция V2 → V4\n\n${body}\n${extra}`;
}

/** Copy one real package plus its registry entry into a temp root. */
function copySystem(root, id) {
  const registry = JSON.parse(
    readFileSync(join(repoRoot, "config", "design-systems.json"), "utf8"),
  );
  writeRegistry(
    root,
    registry.designSystems.filter((entry) => entry.id === id),
  );
  const excluded = new Set(["node_modules", "dist", ".turbo", ".next"]);
  cpSync(join(repoRoot, "packages", id), join(root, "packages", id), {
    recursive: true,
    filter: (source) => !excluded.has(source.split(/[\\/]/).pop()),
  });
}

/* -------------------------------------------------------------------------- */
/* Current documentation                                                      */
/* -------------------------------------------------------------------------- */

test("the current repository documentation and V4 contracts pass", () => {
  const result = runDocsCheck({ root: repoRoot });
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.deepEqual(result.stats.systems, ["system-a", "system-b"]);
  assert.deepEqual(result.stats.contracts, ["system-a", "system-b"]);
  assert.ok(result.documents.includes("README.md"));
  assert.ok(result.documents.includes("packages/system-a/README.md"));
  assert.ok(result.documents.includes("packages/system-b/AGENTS.md"));
  assert.ok(result.documents.includes("templates/design-system/README.md.template"));
  assert.ok(result.documents.includes("fixtures/consumer-product/README.md"));
  assert.ok(result.documents.includes("docs/v4/migration-v2-to-v4.md"));
  assert.equal(result.stats.migration, true);
  assert.ok(result.stats.links > 0);
});

/* -------------------------------------------------------------------------- */
/* README section contract                                                    */
/* -------------------------------------------------------------------------- */

test("a V4 system README missing a required heading fails with its path", (t) => {
  const root = tempRoot(t);
  writeRegistry(root, [systemEntry("system-a")]);
  write(
    root,
    "packages/system-a/README.md",
    systemReadme({
      id: "system-a",
      packageName: "@prism-system/ui-system-a",
      omit: "Usage rules",
    }),
  );

  const result = runDocsCheck({ root, verifyContracts: false });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some(
      (failure) =>
        failure.includes("packages/system-a/README.md") &&
        failure.includes('missing required heading "## Usage rules"'),
    ),
    result.failures.join("\n"),
  );
});

test("a manual variant inventory in Components is rejected", (t) => {
  const root = tempRoot(t);
  writeRegistry(root, [systemEntry("system-a")]);
  write(
    root,
    "packages/system-a/README.md",
    systemReadme({
      id: "system-a",
      packageName: "@prism-system/ui-system-a",
      components: `#### Variants\n\n- primary\n- secondary\n\n${defaultComponentsBody(
        "system-a",
        "@prism-system/ui-system-a",
      )}`,
    }),
  );

  const result = runDocsCheck({ root, verifyContracts: false });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => /manual variant inventory/.test(failure)),
    result.failures.join("\n"),
  );
});

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

test("a broken local Markdown link is reported with its line number", (t) => {
  const root = tempRoot(t);
  writeRegistry(root, [systemEntry("system-a")]);
  write(
    root,
    "packages/system-a/README.md",
    `${systemReadme({
      id: "system-a",
      packageName: "@prism-system/ui-system-a",
    })}\nSee [the missing guide](../docs/missing-guide.md).\n`,
  );

  const result = runDocsCheck({ root, verifyContracts: false });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) =>
      /packages\/system-a\/README\.md:\d+: local link target "\.\.\/docs\/missing-guide\.md" does not resolve\./.test(
        failure,
      ),
    ),
    result.failures.join("\n"),
  );
});

test("archive and skill documents and fenced code are excluded", (t) => {
  const root = tempRoot(t);
  writeRegistry(root, [systemEntry("docs-demo")]);
  write(
    root,
    "packages/docs-demo/README.md",
    systemReadme({ id: "docs-demo", packageName: "@prism-system/ui-docs-demo" }),
  );
  write(root, "docs/guide.md", "# Guide\n");
  write(root, "docs/v4/notes.md", "# Notes\n\n[guide](../guide.md)\n");
  write(root, "docs/archive/legacy.md", "# Legacy\n\n[broken](../missing.md)\n");
  write(root, "docs/archive/v1/README", "# Archive\n\n## Quickstart\n");
  write(root, "skills/demo/SKILL.md", "# Skill\n\n[broken](../../missing.md)\n");
  write(root, "skills/demo/CHANGELOG.md", "[broken](../../missing.md)\n");
  write(
    root,
    "docs/v4/example.md",
    "# Example\n\n```md\n[broken](./missing.md)\n```\n\n[external](https://example.com)\n",
  );

  const documents = collectActiveDocs(root);
  assert.ok(!documents.some((doc) => doc.startsWith("docs/archive/")));
  assert.ok(!documents.some((doc) => doc.startsWith("skills/")));
  assert.ok(!documents.some((doc) => /changelog\.md$/i.test(doc)));
  assert.ok(documents.includes("docs/v4/notes.md"));
  assert.ok(documents.includes("docs/v4/example.md"));

  const result = runDocsCheck({ root, verifyContracts: false });
  assert.equal(result.ok, true, result.failures.join("\n"));
});

test("the migration guide keeps its essential headings and checked local links", (t) => {
  const root = tempRoot(t);
  writeRegistry(root, []);
  write(root, "docs/guide.md", "# Guide\n");
  write(
    root,
    "docs/v4/migration-v2-to-v4.md",
    migrationGuide({ extra: "Общий гайд: [guide](../guide.md)." }),
  );

  const passed = runDocsCheck({ root, verifyContracts: false });
  assert.equal(passed.ok, true, passed.failures.join("\n"));
  assert.ok(passed.documents.includes("docs/v4/migration-v2-to-v4.md"));
  assert.equal(passed.stats.migration, true);

  write(
    root,
    "docs/v4/migration-v2-to-v4.md",
    migrationGuide({ omit: "Команды prism-ds и их границы" }),
  );
  const headingFailure = runDocsCheck({ root, verifyContracts: false });
  assert.equal(headingFailure.ok, false);
  assert.ok(
    headingFailure.failures.some(
      (failure) =>
        failure.includes("docs/v4/migration-v2-to-v4.md") &&
        failure.includes('missing required heading "## Команды prism-ds и их границы"'),
    ),
    headingFailure.failures.join("\n"),
  );

  write(
    root,
    "docs/v4/migration-v2-to-v4.md",
    migrationGuide({ extra: "Битый импорт: [missing](../missing.md)." }),
  );
  const linkFailure = runDocsCheck({ root, verifyContracts: false });
  assert.equal(linkFailure.ok, false);
  assert.ok(
    linkFailure.failures.some((failure) =>
      /docs\/v4\/migration-v2-to-v4\.md:\d+: local link target "\.\.\/missing\.md" does not resolve\./.test(
        failure,
      ),
    ),
    linkFailure.failures.join("\n"),
  );
});

test("known Showcase routes are ignored while other root-absolute links fail", (t) => {
  const root = tempRoot(t);
  writeRegistry(root, [systemEntry("docs-demo")]);
  write(
    root,
    "packages/docs-demo/README.md",
    systemReadme({
      id: "docs-demo",
      packageName: "@prism-system/ui-docs-demo",
      components:
        "Browse [the catalog](/showcase/docs-demo) or [a component]" +
        "(/showcase/docs-demo?component=Button); the catalog source is " +
        "`@prism-system/ui-docs-demo/manifest`.",
    }),
  );

  const passed = runDocsCheck({ root, verifyContracts: false });
  assert.equal(passed.ok, true, passed.failures.join("\n"));
  assert.ok(passed.stats.ignored >= 2, JSON.stringify(passed.stats));

  write(root, "docs/v4/absolute.md", "# Absolute\n\n[absolute](/packages/docs-demo/README.md)\n");
  const failed = runDocsCheck({ root, verifyContracts: false });
  assert.equal(failed.ok, false);
  assert.ok(
    failed.failures.some((failure) =>
      /root-absolute link target "\/packages\/docs-demo\/README\.md"/.test(failure),
    ),
    failed.failures.join("\n"),
  );
});

/* -------------------------------------------------------------------------- */
/* Catalog route and source                                                   */
/* -------------------------------------------------------------------------- */

test("a stale catalog route or a missing manifest source is rejected", (t) => {
  const root = tempRoot(t);
  writeRegistry(root, [systemEntry("system-a")]);
  write(
    root,
    "packages/system-a/README.md",
    systemReadme({
      id: "system-a",
      packageName: "@prism-system/ui-system-a",
      components: "The stale catalog is /showcase/system-b; the source is the package README.",
    }),
  );
  const stale = runDocsCheck({ root, verifyContracts: false });
  assert.equal(stale.ok, false);
  assert.ok(
    stale.failures.some((failure) =>
      failure.includes(
        "Components section must point at the live catalog route /showcase/system-a",
      ),
    ),
    stale.failures.join("\n"),
  );
  assert.ok(
    stale.failures.some((failure) =>
      failure.includes("must name the generated design-system.json manifest"),
    ),
    stale.failures.join("\n"),
  );

  const sourceRoot = tempRoot(t);
  writeRegistry(sourceRoot, [systemEntry("system-a")]);
  write(
    sourceRoot,
    "packages/system-a/README.md",
    systemReadme({
      id: "system-a",
      packageName: "@prism-system/ui-system-a",
      components: "[Catalog](/showcase/system-a); the source is config/design-systems.json.",
    }),
  );
  const wrongSource = runDocsCheck({ root: sourceRoot, verifyContracts: false });
  assert.equal(wrongSource.ok, false);
  assert.equal(wrongSource.failures.length, 1, wrongSource.failures.join("\n"));
  assert.ok(/must name the generated design-system\.json manifest/.test(wrongSource.failures[0]));
});

test("the template README must use {{SYSTEM_ID}} and a neutral manifest source", (t) => {
  const hardcodedRoot = tempRoot(t);
  writeRegistry(hardcodedRoot, []);
  write(
    hardcodedRoot,
    "templates/design-system/README.md.template",
    templateReadme({ route: "/showcase/system-a" }),
  );
  write(hardcodedRoot, "templates/design-system/AGENTS.md.template", "# Rules\n");
  const hardcoded = runDocsCheck({ root: hardcodedRoot, verifyContracts: false });
  assert.equal(hardcoded.ok, false);
  assert.ok(
    hardcoded.failures.some((failure) =>
      failure.includes('route "/showcase/system-a" must be written as /showcase/{{SYSTEM_ID}}'),
    ),
    hardcoded.failures.join("\n"),
  );

  const templateRoot = tempRoot(t);
  writeRegistry(templateRoot, []);
  write(templateRoot, "templates/design-system/README.md.template", templateReadme());
  write(templateRoot, "templates/design-system/AGENTS.md.template", "# Rules\n");
  const passing = runDocsCheck({ root: templateRoot, verifyContracts: false });
  assert.equal(passing.ok, true, passing.failures.join("\n"));
});

test("V2 registry entries are not treated as V4 documentation or contract targets", (t) => {
  const root = tempRoot(t);
  copySystem(root, "system-a");
  const registry = JSON.parse(readFileSync(join(root, "config", "design-systems.json"), "utf8"));
  registry.designSystems.push({
    id: "legacy",
    name: "Legacy",
    packageName: "@prism-system/ui-legacy",
    packagePath: "packages/legacy",
    version: "1.0.0",
    contract: "v2",
  });
  write(root, "config/design-systems.json", `${JSON.stringify(registry, null, 2)}\n`);
  write(root, "packages/legacy/README.md", "# Legacy\n\nNo V4 sections and no package here.\n");

  // The V4 package is verified; the V2 entry must not require V4 sections and
  // must not be routed through the V4 package contract checks.
  const result = runDocsCheck({ root });
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.deepEqual(result.stats.systems, ["system-a"]);
  assert.deepEqual(result.stats.contracts, ["system-a"]);
});

/* -------------------------------------------------------------------------- */
/* Package catalog/export contract drift                                      */
/* -------------------------------------------------------------------------- */

test("V4 component barrel drift is reported with doc-check context", (t) => {
  const root = tempRoot(t);
  copySystem(root, "system-a");

  const baseline = runDocsCheck({ root });
  assert.equal(baseline.ok, true, baseline.failures.join("\n"));

  const barrelPath = join(root, "packages", "system-a", "src", "components", "index.ts");
  writeFileSync(
    barrelPath,
    readFileSync(barrelPath, "utf8").replace('export * from "./button/index";\n', ""),
    "utf8",
  );

  const drifted = runDocsCheck({ root });
  assert.equal(drifted.ok, false);
  assert.ok(
    drifted.failures.some(
      (failure) =>
        failure.startsWith("[system-a] catalog contract") &&
        failure.includes("component barrel exports") &&
        failure.includes("Button"),
    ),
    drifted.failures.join("\n"),
  );
});

test("V4 runtime component-map drift is reported with doc-check context", (t) => {
  const root = tempRoot(t);
  copySystem(root, "system-a");

  const baseline = runDocsCheck({ root });
  assert.equal(baseline.ok, true, baseline.failures.join("\n"));

  const runtimePath = join(root, "packages", "system-a", "src", "design-system.ts");
  const source = readFileSync(runtimePath, "utf8");
  assert.ok(source.includes("\n    Button,\n"), "runtime map contains the Button entry");
  writeFileSync(runtimePath, source.replace("\n    Button,\n", "\n"), "utf8");

  const drifted = runDocsCheck({ root });
  assert.equal(drifted.ok, false);
  assert.ok(
    drifted.failures.some(
      (failure) =>
        failure.startsWith("[system-a] catalog contract") &&
        failure.includes("runtime design system") &&
        failure.includes("Button"),
    ),
    drifted.failures.join("\n"),
  );
});

test("V4 generated-manifest drift is reported with doc-check context", (t) => {
  const root = tempRoot(t);
  copySystem(root, "system-a");

  const baseline = runDocsCheck({ root });
  assert.equal(baseline.ok, true, baseline.failures.join("\n"));

  const manifestPath = join(root, "packages", "system-a", "design-system.json");
  writeFileSync(
    manifestPath,
    readFileSync(manifestPath, "utf8").replace('"System A"', '"Drifted System"'),
    "utf8",
  );

  const drifted = runDocsCheck({ root });
  assert.equal(drifted.ok, false);
  assert.ok(
    drifted.failures.some(
      (failure) =>
        failure.startsWith("[system-a] catalog contract") && failure.includes("generated manifest"),
    ),
    drifted.failures.join("\n"),
  );
});

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

test("the CLI exits 0 on success and 1 on failures", (t) => {
  const passRoot = tempRoot(t);
  writeRegistry(passRoot, [systemEntry("docs-demo")]);
  write(
    passRoot,
    "packages/docs-demo/README.md",
    systemReadme({ id: "docs-demo", packageName: "@prism-system/ui-docs-demo" }),
  );
  const pass = spawnSync(process.execPath, [cliPath, "--root", passRoot, "--no-contracts"], {
    encoding: "utf8",
  });
  assert.equal(pass.status, 0, pass.stderr || pass.stdout);
  assert.match(pass.stdout, /V4 documentation validation passed/);

  const failRoot = tempRoot(t);
  writeRegistry(failRoot, [systemEntry("docs-demo")]);
  write(failRoot, "packages/docs-demo/README.md", "# No required sections\n");
  const fail = spawnSync(process.execPath, [cliPath, "--root", failRoot, "--no-contracts"], {
    encoding: "utf8",
  });
  assert.equal(fail.status, 1, fail.stderr || fail.stdout);
  assert.match(fail.stdout, /V4 documentation validation failed/);
  assert.match(fail.stdout, /missing required heading/);
});
