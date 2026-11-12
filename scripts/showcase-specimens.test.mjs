#!/usr/bin/env node
/**
 * Showcase optional-specimen coverage guard (Node built-in test runner).
 *
 * Run directly:
 *   node --test scripts/showcase-specimens.test.mjs
 *
 * Showcase renders optional components from two switch-based specimen modules,
 * and the Reference App renders the same catalog from one switch-based module.
 * This test is a structural guard: every canonical `OPTIONAL_COMPONENTS` name
 * must have exactly one switch case in the Showcase pair and in the Reference
 * App module, and each case must return a real non-null specimen. A future
 * catalog expansion therefore cannot silently fall through to a blank card.
 *
 * Canonical names are read from the maintainer generator
 * (`scripts/design-system-manifest.mjs`), never from a duplicated list or a
 * built core artifact. The TypeScript AST is parsed with the workspace parser;
 * the guard never relies on raw substring counts and never compiles or renders.
 * Both the Showcase and Reference App checks share the same AST checker.
 *
 * This is structural coverage only. It does not prove browser rendering,
 * layout, or system-specific availability behavior.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { OPTIONAL_COMPONENTS } from "./design-system-manifest.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SPECIMEN_SOURCES = Object.freeze([
  "apps/showcase/app/showcase-ui/optional-specimens.tsx",
  "apps/showcase/app/showcase-ui/optional-specimens-extra.tsx",
]);

const REFERENCE_SOURCE = "apps/reference-app/app/dashboard.tsx";

/** Read one live specimen module as checker input. */
function readSpecimenSource(file) {
  return {
    file,
    text: readFileSync(join(repoRoot, file), "utf8"),
  };
}

/** Read the live Showcase specimen modules as checker input. */
function loadSpecimenSources() {
  return SPECIMEN_SOURCES.map((file) => readSpecimenSource(file));
}

/** Remove expression wrappers that do not change the rendered value. */
function unwrapTransparentExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * A return expression that can only render a blank card: nullish values,
 * booleans (React renders nothing), an empty string, or an empty fragment.
 */
function isBlankSpecimenExpression(expression) {
  const node = unwrapTransparentExpression(expression);
  if (!node) return true;
  if (
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return true;
  }
  if (ts.isIdentifier(node) && node.text === "undefined") return true;
  if (ts.isVoidExpression(node)) return true;
  if (ts.isStringLiteral(node) && node.text.length === 0) return true;
  if (ts.isJsxFragment(node)) {
    return node.children.every((child) => ts.isJsxText(child) && child.text.trim().length === 0);
  }
  return false;
}

/** Function/class-like nodes whose inner returns are not this case's output. */
function isNestedScope(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  );
}

/**
 * Whether one case clause owns a real return. Returns are inspected through
 * blocks and conditionals but never through nested functions or classes, so an
 * `onClick={() => ...}` callback cannot stand in for a specimen.
 */
function caseReturnState(clause) {
  let hasReturn = false;
  let hasRealReturn = false;

  const inspect = (node) => {
    if (ts.isReturnStatement(node)) {
      hasReturn = true;
      if (node.expression && !isBlankSpecimenExpression(node.expression)) {
        hasRealReturn = true;
      }
      return;
    }
    if (isNestedScope(node)) return;
    ts.forEachChild(node, inspect);
  };

  for (const statement of clause.statements) inspect(statement);

  if (hasRealReturn) return "real";
  return hasReturn ? "blank" : "no-return";
}

/** Only the specimen switches (`switch (name)`) are relevant to this guard. */
function isSpecimenSwitch(node) {
  return (
    ts.isSwitchStatement(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "name"
  );
}

function collectSpecimenSwitches(sourceFile) {
  const switches = [];
  const visit = (node) => {
    if (isSpecimenSwitch(node)) switches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return switches;
}

/**
 * Analyze in-memory sources against a canonical optional name list.
 *
 * Every canonical name must occur as exactly one case label, and that case must
 * have a real return. Unknown case labels fail too, so a renamed or removed
 * catalog entry cannot linger unnoticed.
 */
export function analyzeOptionalSpecimenSources(sources, canonicalNames = OPTIONAL_COMPONENTS) {
  const canonical = new Set(canonicalNames);
  const cases = [];
  const problems = [];

  for (const source of sources) {
    const sourceFile = ts.createSourceFile(
      source.file,
      source.text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const switches = collectSpecimenSwitches(sourceFile);
    if (switches.length === 0) {
      problems.push(`${source.file} has no switch (name) specimen switch.`);
      continue;
    }

    for (const switchNode of switches) {
      for (const clause of switchNode.caseBlock.clauses) {
        if (!ts.isCaseClause(clause)) continue; // `default` is not a component name.

        const position = sourceFile.getLineAndCharacterOfPosition(clause.getStart(sourceFile));
        const location = `${source.file}:${position.line + 1}`;
        if (!ts.isStringLiteral(clause.expression)) {
          problems.push(
            `${location} has a non-string case label; every case must name one canonical ` +
              `optional component.`,
          );
          continue;
        }

        const name = clause.expression.text;
        const state = caseReturnState(clause);
        cases.push({ name, file: source.file, line: position.line + 1, state });

        if (!canonical.has(name)) {
          problems.push(`${location} has unknown optional specimen case "${name}".`);
        } else if (state !== "real") {
          const reason =
            state === "blank"
              ? "the case returns only null/undefined/blank output"
              : "the case has no return statement";
          problems.push(`${location} handles "${name}" without a real specimen (${reason}).`);
        }
      }
    }
  }

  const byName = new Map();
  for (const entry of cases) {
    const entries = byName.get(entry.name) ?? [];
    entries.push(entry);
    byName.set(entry.name, entries);
  }

  for (const name of canonicalNames) {
    const entries = byName.get(name) ?? [];
    if (entries.length === 0) {
      problems.push(`Missing optional specimen switch case for canonical component "${name}".`);
    } else if (entries.length > 1) {
      problems.push(
        `Duplicate optional specimen switch cases for canonical component "${name}" at ` +
          `${entries.map((entry) => `${entry.file}:${entry.line}`).join(", ")}.`,
      );
    }
  }

  return { cases, byName, problems };
}

/** Assert the coverage invariant, throwing every diagnostic at once. */
export function assertOptionalSpecimenCoverage(sources, canonicalNames = OPTIONAL_COMPONENTS) {
  const report = analyzeOptionalSpecimenSources(sources, canonicalNames);
  if (report.problems.length > 0) {
    throw new Error(
      `Showcase optional specimen coverage failed:\n- ${report.problems.join("\n- ")}`,
    );
  }
  return report;
}

/** Small in-memory switch module used to exercise the checker itself. */
function createFixture(cases, fileName = "fixture-specimens.tsx") {
  return [
    {
      file: fileName,
      text: [
        "function Specimen({ name }: { name: string }) {",
        "  switch (name) {",
        cases,
        "  }",
        "}",
        "",
      ].join("\n"),
    },
  ];
}

test("the real Showcase modules cover every canonical optional component exactly once", () => {
  const report = assertOptionalSpecimenCoverage(loadSpecimenSources(), OPTIONAL_COMPONENTS);

  assert.equal(report.cases.length, OPTIONAL_COMPONENTS.length);
  assert.deepEqual(
    [...new Set(report.cases.map((entry) => entry.file))].sort(),
    [...SPECIMEN_SOURCES].sort(),
    "both specimen modules must contribute handled cases",
  );
  for (const name of OPTIONAL_COMPONENTS) {
    const entries = report.byName.get(name);
    assert.equal(entries?.length, 1, `"${name}" must have exactly one switch case`);
    assert.equal(entries[0].state, "real", `"${name}" must have a real non-null specimen`);
  }
});

test("the Reference App covers every canonical optional component exactly once", () => {
  const report = assertOptionalSpecimenCoverage(
    [readSpecimenSource(REFERENCE_SOURCE)],
    OPTIONAL_COMPONENTS,
  );

  assert.equal(report.cases.length, OPTIONAL_COMPONENTS.length);
  assert.deepEqual(
    [...new Set(report.cases.map((entry) => entry.file))],
    [REFERENCE_SOURCE],
    "the Reference App switch must be the handled source",
  );
  for (const name of OPTIONAL_COMPONENTS) {
    const entries = report.byName.get(name);
    assert.equal(entries?.length, 1, `"${name}" must have exactly one switch case`);
    assert.equal(entries[0].state, "real", `"${name}" must have a real non-null specimen`);
  }
});

test("the checker accepts a fixture where every name has one real case", () => {
  const sources = createFixture(
    [
      '    case "Alpha":',
      "      return <div>alpha</div>;",
      '    case "Beta": {',
      "      return <span>beta</span>;",
      "    }",
    ].join("\n"),
  );

  assert.doesNotThrow(() => assertOptionalSpecimenCoverage(sources, ["Alpha", "Beta"]));
});

test("the checker rejects a missing canonical case", () => {
  const sources = createFixture(['    case "Alpha":', "      return <div>alpha</div>;"].join("\n"));

  assert.throws(
    () => assertOptionalSpecimenCoverage(sources, ["Alpha", "Beta"]),
    /Missing optional specimen switch case for canonical component "Beta"/,
  );
});

test("the checker rejects a case that only returns a blank value", () => {
  const sources = createFixture(
    [
      '    case "Alpha":',
      "      return <div>alpha</div>;",
      '    case "Beta":',
      "      return null;",
    ].join("\n"),
  );

  assert.throws(
    () => assertOptionalSpecimenCoverage(sources, ["Alpha", "Beta"]),
    /handles "Beta" without a real specimen/,
  );
});

test("the checker rejects duplicate cases across specimen modules", () => {
  const first = createFixture(
    ['    case "Alpha":', "      return <div>alpha</div>;"].join("\n"),
    "one-specimens.tsx",
  );
  const second = createFixture(
    [
      '    case "Alpha":',
      "      return <span>alpha again</span>;",
      '    case "Beta":',
      "      return <span>beta</span>;",
    ].join("\n"),
    "two-specimens.tsx",
  );

  assert.throws(
    () => assertOptionalSpecimenCoverage([...first, ...second], ["Alpha", "Beta"]),
    /Duplicate optional specimen switch cases for canonical component "Alpha"/,
  );
});

test("the checker rejects an unknown case name", () => {
  const sources = createFixture(
    [
      '    case "Alpha":',
      "      return <div>alpha</div>;",
      '    case "Beta":',
      "      return <span>beta</span>;",
      '    case "Gamma":',
      "      return <span>gamma</span>;",
    ].join("\n"),
  );

  assert.throws(
    () => assertOptionalSpecimenCoverage(sources, ["Alpha", "Beta"]),
    /has unknown optional specimen case "Gamma"/,
  );
});

test("the checker rejects a source with no specimen switch at all", () => {
  const sources = [
    { file: "no-switch.tsx", text: "export function Specimen() { return null; }\n" },
  ];

  assert.throws(
    () => assertOptionalSpecimenCoverage(sources, ["Alpha"]),
    /has no switch \(name\) specimen switch/,
  );
});
