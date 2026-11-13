#!/usr/bin/env node
/**
 * Maintainer-only static verification of the packed `@prism-system/tools` TUI
 * module graph.
 *
 * Given an already-extracted package directory, this checks that the literal
 * relative `.mjs`/`.js` modules reachable from `src/tui.mjs` are actually
 * present inside that directory. It follows static imports, re-exports, and
 * string-literal `import(...)` calls recursively. Bare and `node:` specifiers
 * are external and are never resolved.
 *
 * This is a presence check only:
 *   - nonliteral dynamic imports cannot be followed, so they are reported as
 *     unproven instead of being treated as verified;
 *   - nothing is executed, installed, or imported;
 *   - the check makes no claim about runtime rendering or behavior.
 *
 * Missing or escaping literal relative targets fail closed.
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import ts from "typescript";

/** The packed TUI entry point, relative to the extracted package root. */
export const TUI_ENTRY_PATH = "src/tui.mjs";

/** Only JavaScript module targets are parsed and traversed recursively. */
const TRAVERSED_EXTENSIONS = new Set([".mjs", ".js"]);

function toPosix(path) {
  return path.split(sep).join("/");
}

function isLiteralRelativeSpecifier(specifier) {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

/** Lexical containment check; also catches a different Windows drive. */
function isContained(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/**
 * Literal import/export specifiers and unproven nonliteral dynamic imports, in
 * source order. TypeScript's parser means commented-out code is never counted.
 */
function collectModuleReferences(sourceFile) {
  const references = [];
  const nonliteralDynamicImports = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        references.push({
          kind: "static-import",
          specifier: node.moduleSpecifier.text,
          line: lineOf(sourceFile, node),
        });
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        references.push({
          kind: "static-export",
          specifier: node.moduleSpecifier.text,
          line: lineOf(sourceFile, node),
        });
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument !== undefined && ts.isStringLiteral(argument)) {
        references.push({
          kind: "dynamic-import",
          specifier: argument.text,
          line: lineOf(sourceFile, node),
        });
      } else {
        nonliteralDynamicImports.push({ line: lineOf(sourceFile, node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { references, nonliteralDynamicImports };
}

/**
 * Inspect the relative module graph reachable from the TUI entry inside an
 * already-extracted package. Never executes a module.
 *
 * @param {{packageDir: string, entry?: string}} options
 * @returns {{
 *   ok: boolean,
 *   entry: string,
 *   files: string[],
 *   dynamicImports: {from: string, specifier: string, line: number}[],
 *   externalSpecifiers: string[],
 *   nonliteralDynamicImports: {from: string, line: number}[],
 *   skippedRelativeTargets: {from: string, specifier: string}[],
 *   failures: string[],
 * }}
 */
export function inspectTuiModuleGraph({ packageDir, entry = TUI_ENTRY_PATH } = {}) {
  if (typeof packageDir !== "string" || packageDir.trim().length === 0) {
    throw new TypeError("inspectTuiModuleGraph requires an extracted package directory");
  }
  if (typeof entry !== "string" || entry.trim().length === 0) {
    throw new TypeError("inspectTuiModuleGraph requires a nonempty entry path");
  }

  const entryRelative = toPosix(entry);
  const failures = [];
  const files = [];
  const dynamicImports = [];
  const externalSpecifiers = new Set();
  const nonliteralDynamicImports = [];
  const skippedRelativeTargets = [];
  const visited = new Set();
  const emptyResult = () => ({
    ok: failures.length === 0,
    entry: entryRelative,
    files: [],
    dynamicImports: [],
    externalSpecifiers: [],
    nonliteralDynamicImports: [],
    skippedRelativeTargets: [],
    failures,
  });

  const packageRootCandidate = resolve(packageDir);
  if (!existsSync(packageRootCandidate)) {
    failures.push(`extracted package root does not exist: ${toPosix(packageRootCandidate)}`);
    return emptyResult();
  }
  const packageRoot = realpathSync(packageRootCandidate);

  const entryPath = resolve(packageRoot, entry);
  if (!isContained(packageRoot, entryPath)) {
    failures.push(`TUI entry "${entryRelative}" escapes the extracted package root`);
    return emptyResult();
  }
  if (!isFile(entryPath)) {
    failures.push(`TUI entry is missing: ${entryRelative}`);
    return emptyResult();
  }
  if (!isContained(packageRoot, realpathSync(entryPath))) {
    failures.push(`TUI entry "${entryRelative}" escapes the extracted package root`);
    return emptyResult();
  }

  const pending = [{ absolute: entryPath, importedFrom: null, specifier: null }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current.absolute)) continue;
    visited.add(current.absolute);

    const currentRelative = toPosix(relative(packageRoot, current.absolute));
    if (!isFile(current.absolute)) {
      failures.push(
        current.importedFrom === null
          ? `TUI entry is missing: ${currentRelative}`
          : `${current.importedFrom}: relative target "${current.specifier}" does not exist`,
      );
      continue;
    }

    let text;
    try {
      text = readFileSync(current.absolute, "utf8");
    } catch (error) {
      failures.push(`${currentRelative}: cannot read module (${error.message})`);
      continue;
    }
    files.push(currentRelative);

    const sourceFile = ts.createSourceFile(
      current.absolute,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const references = collectModuleReferences(sourceFile);
    for (const unproven of references.nonliteralDynamicImports) {
      nonliteralDynamicImports.push({ from: currentRelative, line: unproven.line });
    }

    for (const reference of references.references) {
      const { specifier } = reference;
      if (!isLiteralRelativeSpecifier(specifier)) {
        externalSpecifiers.add(specifier);
        continue;
      }

      const target = resolve(dirname(current.absolute), specifier);
      if (!isContained(packageRoot, target)) {
        failures.push(
          `${currentRelative}: relative target "${specifier}" escapes the extracted package root`,
        );
        continue;
      }
      if (!isFile(target)) {
        failures.push(`${currentRelative}: relative target "${specifier}" does not exist`);
        continue;
      }
      if (!isContained(packageRoot, realpathSync(target))) {
        failures.push(
          `${currentRelative}: relative target "${specifier}" escapes the extracted package root through a symbolic link`,
        );
        continue;
      }
      if (!TRAVERSED_EXTENSIONS.has(extname(target).toLowerCase())) {
        skippedRelativeTargets.push({ from: currentRelative, specifier });
        continue;
      }
      if (reference.kind === "dynamic-import") {
        dynamicImports.push({
          from: currentRelative,
          specifier,
          line: reference.line,
        });
      }
      pending.push({
        absolute: target,
        importedFrom: currentRelative,
        specifier,
      });
    }
  }

  files.sort();
  dynamicImports.sort((left, right) =>
    `${left.from}:${left.line}:${left.specifier}`.localeCompare(
      `${right.from}:${right.line}:${right.specifier}`,
    ),
  );
  nonliteralDynamicImports.sort((left, right) =>
    `${left.from}:${left.line}`.localeCompare(`${right.from}:${right.line}`),
  );
  skippedRelativeTargets.sort((left, right) =>
    `${left.from}:${left.specifier}`.localeCompare(`${right.from}:${right.specifier}`),
  );

  return {
    ok: failures.length === 0,
    entry: entryRelative,
    files,
    dynamicImports,
    externalSpecifiers: [...externalSpecifiers].sort(),
    nonliteralDynamicImports,
    skippedRelativeTargets,
    failures,
  };
}

/**
 * Assert the packed TUI module graph for a harness. Throws a clear failure when
 * a literal relative target is missing or escapes the extracted package.
 */
export function assertPackedTuiModuleGraph({
  label = "@prism-system/tools",
  packageDir,
  entry = TUI_ENTRY_PATH,
} = {}) {
  const result = inspectTuiModuleGraph({ packageDir, entry });
  if (!result.ok) {
    throw new Error(`${label} TUI module graph is incomplete: ${result.failures.join("; ")}`);
  }
  return result;
}
