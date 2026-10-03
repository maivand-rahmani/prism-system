/**
 * Active design-system API usage scanning (offline, AST-based).
 *
 * This is deliberately separate from the strict *styling* checker in
 * `usage.mjs`: it answers "which design-system API does this consumer actually
 * reference?" so `switch` can prove a target system can carry the current usage
 * before any dependency or file mutation.
 *
 * It scans only the consumer's own JS/JSX/TS/TSX/MJS/CJS source (skipping
 * `node_modules`, build output, declaration/generated files, and the managed
 * `.design-system` directory) plus exactly one explicitly named CSS file. It
 * reads literal module references (static `import`, `export ... from`, literal
 * `import()`, literal `require()`, `import x = require()`), resolves import
 * aliases and namespace bindings, records JSX literal `variant`/`size` props and
 * compound-member usage, and matches known token CSS variables / Tailwind
 * utilities. Dynamic or computed expressions that reference the package are
 * reported as unverified — never silently treated as compatible.
 *
 * Limits are real and exposed through {@link ACTIVE_USAGE_LIMITATIONS}: computed
 * specifiers that cannot be attributed to the package are ignored, package code
 * is never executed, and token values cannot be compared (visual appearance is
 * unknown).
 *
 * TypeScript is a declared runtime dependency but is loaded lazily through
 * `getTypeScript()` only when a scan actually runs; importing this module never
 * loads it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { assertWithin } from "./constants.mjs";
import { buildTokenCatalog } from "./tokens.mjs";
import { getTypeScript, globToRegExp } from "./usage.mjs";

/** Stable, honest scanner limitation statement attached to every report. */
export const ACTIVE_USAGE_LIMITATIONS = [
  "Bounded literal scan: reads JS/JSX/TS/TSX/MJS/CJS source under the consumer root",
  "(skipping node_modules, build output, declaration and generated files) plus one explicitly",
  "named CSS file. Only literal import/export-from/dynamic-import()/require() specifiers,",
  "import aliases and namespace bindings, literal JSX variant/size props, compound members, and",
  "known token CSS variables/Tailwind utilities are verified. Unsupported framework source files",
  "(.vue/.svelte/.astro/.mdx/.html) that reference the package are reported as unverified rather",
  "than treated as compatible. Computed expressions that cannot be attributed to the package are",
  "ignored; dynamic expressions that do reference it are reported as unverified. Package code is",
  "never executed and token values cannot be compared, so visual appearance is unknown.",
].join(" ");

/** Source extensions scanned for active usage. */
const SOURCE_FILE_PATTERN = /\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;
/** Framework source files this bounded scanner cannot parse. */
const UNSUPPORTED_SOURCE_PATTERN = /\.(?:vue|svelte|astro|mdx|html)$/i;
/** Generated/declaration files never scanned. */
const GENERATED_FILE_PATTERN =
  /(?:\.d\.ts|\.generated\.(?:js|jsx|ts|tsx)|\.gen\.(?:js|jsx|ts|tsx))$/i;
/** Directories never scanned (the consumer's installed packages stay out). */
const SKIP_DIRECTORIES = Object.freeze(
  new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "out",
    "coverage",
    ".turbo",
    ".design-system",
  ]),
);
/** A single source file larger than this is skipped and reported. */
const MAX_SOURCE_BYTES = 1024 * 1024;
/** A single, pure `@import "<specifier>";` (or `url(...)`) line. */
const IMPORT_STATEMENT_PATTERN = /^\s*@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')\s*\)?\s*;\s*$/;
/** A CSS custom property name anywhere in a string or stylesheet. */
const CUSTOM_PROPERTY_PATTERN = /--[A-Za-z0-9][A-Za-z0-9-]*/g;
/** A whitespace-delimited class/utility token (with its position). */
const WHITESPACE_TOKEN_PATTERN = /\S+/g;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function positionAt(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) {
      line += 1;
      lineStart = cursor + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/* -------------------------------------------------------------------------- */
/* Token index                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Build the lookup maps used to recognize known token references. The catalog
 * is read from the manifest only (never from CSS/TypeScript artifacts) and the
 * function fails soft: a manifest without a readable token catalog returns null
 * so callers report the limitation instead of guessing.
 *
 * @returns {{ byName: Map<string, object>, byVariable: Map<string, object>, byUtility: Map<string, object> } | null}
 */
export function buildTokenIndex(manifest) {
  let catalog;
  try {
    catalog = buildTokenCatalog({ manifest });
  } catch {
    return null;
  }
  const byName = new Map();
  const byVariable = new Map();
  const byUtility = new Map();
  for (const group of catalog.groups) {
    for (const token of group.tokens) {
      if (!byName.has(token.name)) byName.set(token.name, token);
      byVariable.set(token.cssVariable, token);
      const tailwind = token.tailwind;
      if (isPlainObject(tailwind)) {
        if (typeof tailwind.variable === "string") byVariable.set(tailwind.variable, token);
        if (typeof tailwind.utility === "string") byUtility.set(tailwind.utility, token);
      }
    }
  }
  return { byName, byVariable, byUtility };
}

/* -------------------------------------------------------------------------- */
/* File collection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Collect the sorted list of scannable active-usage source files. Symlinks are
 * skipped, build/dependency directories are never entered, and generated or
 * declaration files are never read. Unsupported framework files (`.vue`,
 * `.svelte`, `.astro`, `.mdx`, `.html`) are returned separately so callers can
 * report them as unverified when they reference the package instead of
 * silently treating them as compatible. `skipped` reports oversized or
 * unreadable files instead of failing the whole scan.
 *
 * @returns {{ files: string[], skipped: { path: string, reason: string }[], unsupported: string[] }}
 */
export function collectActiveSourceFiles({ consumerRoot, ignoreGlobs = [] } = {}) {
  const matchers = ignoreGlobs.map(globToRegExp);
  const isIgnored = (relPath) => matchers.some((matcher) => matcher.test(relPath));
  const files = [];
  const unsupported = [];
  const skipped = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const relPath = toPosix(relative(consumerRoot, full));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        if (isIgnored(relPath) || isIgnored(`${relPath}/`)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (UNSUPPORTED_SOURCE_PATTERN.test(entry.name)) {
        if (isIgnored(relPath)) continue;
        unsupported.push(full);
        continue;
      }
      if (!SOURCE_FILE_PATTERN.test(entry.name)) continue;
      if (GENERATED_FILE_PATTERN.test(entry.name)) continue;
      if (isIgnored(relPath)) continue;
      files.push(full);
    }
  };
  walk(consumerRoot);
  files.sort();
  unsupported.sort();
  const scannable = [];
  for (const file of files) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      skipped.push({ path: file, reason: "unreadable" });
      continue;
    }
    if (size > MAX_SOURCE_BYTES) {
      skipped.push({ path: file, reason: "oversized" });
      continue;
    }
    scannable.push(file);
  }
  return { files: scannable, skipped, unsupported };
}

/* -------------------------------------------------------------------------- */
/* Token reference extraction                                                 */
/* -------------------------------------------------------------------------- */

/** Strip leading Tailwind variant prefixes (`hover:`, `md:`, `[&:hover]:`) and `!`. */
function utilityBase(token) {
  let base = token;
  const lastColon = base.lastIndexOf(":");
  if (lastColon !== -1) base = base.slice(lastColon + 1);
  if (base.startsWith("!")) base = base.slice(1);
  return base;
}

/**
 * Extract known token references from one text fragment. Only exact matches
 * against the token index are recorded, so unrelated `--custom` properties or
 * utility classes are never flagged. `line`/`column` locate the fragment start;
 * offsets are resolved relative to it.
 */
function collectTokenReferencesFromText({ text, file, line, column, tokens, out }) {
  if (tokens === null) return;
  CUSTOM_PROPERTY_PATTERN.lastIndex = 0;
  for (;;) {
    const match = CUSTOM_PROPERTY_PATTERN.exec(text);
    if (match === null) break;
    const token = tokens.byVariable.get(match[0]);
    if (token === undefined) continue;
    const position = positionAt(text, match.index);
    out.push({
      file,
      line: line + position.line - 1,
      column: position.line === 1 ? column + position.column - 1 : position.column,
      kind: "css-var",
      name: token.name,
      raw: match[0],
    });
  }
  WHITESPACE_TOKEN_PATTERN.lastIndex = 0;
  for (;;) {
    const match = WHITESPACE_TOKEN_PATTERN.exec(text);
    if (match === null) break;
    const base = utilityBase(match[0]);
    const token = tokens.byUtility.get(base);
    if (token === undefined) continue;
    const position = positionAt(text, match.index);
    out.push({
      file,
      line: line + position.line - 1,
      column: position.line === 1 ? column + position.column - 1 : position.column,
      kind: "tailwind-utility",
      name: token.name,
      raw: match[0],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Scanning                                                                   */
/* -------------------------------------------------------------------------- */

function scriptKindFor(fileName, ts) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * Scan a consumer repository's active design-system API usage.
 *
 * @param {{
 *   consumerRoot: string,
 *   packageName: string,
 *   manifest?: object | null,
 *   cssPath?: string | null,
 *   ignoreGlobs?: string[],
 *   targetPackage?: string | null,
 * }} options
 * @returns {object} A deterministic usage report with every site, unverified
 *   case, token reference, the scanner limitations, and — when `targetPackage`
 *   is supplied — the exact prefix-swap rewrites (before/after bytes) for every
 *   rewritable literal reference.
 */
export function scanActiveUsage({
  consumerRoot,
  packageName,
  manifest = null,
  cssPath = null,
  ignoreGlobs = [],
  targetPackage = null,
} = {}) {
  if (typeof consumerRoot !== "string" || consumerRoot.trim().length === 0) {
    throw new Error("scanActiveUsage requires an explicit consumer root.");
  }
  if (typeof packageName !== "string" || packageName.trim().length === 0) {
    throw new Error("scanActiveUsage requires a design-system package name.");
  }
  const root = resolve(consumerRoot);
  const model = buildUsageModel(manifest);
  const tokens = buildTokenIndex(manifest);
  const ts = getTypeScript();

  const { files, skipped, unsupported } = collectActiveSourceFiles({
    consumerRoot: root,
    ignoreGlobs,
  });

  const fileTexts = new Map();
  const moduleReferences = [];
  const components = [];
  const extensions = [];
  const variants = [];
  const sizes = [];
  const members = [];
  const unverified = [];
  const tokenReferences = [];
  const publicApiAccesses = [];

  const classify = (specifier) => {
    if (specifier === packageName) return { subpath: ".", entrypoint: "." };
    if (specifier.startsWith(`${packageName}/`)) {
      const subpath = `./${specifier.slice(packageName.length + 1)}`;
      return {
        subpath,
        entrypoint: model.entrypoints.has(subpath) ? subpath : null,
      };
    }
    return null;
  };

  for (const file of files) {
    const relFile = toPosix(relative(root, file));
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      skipped.push({ path: file, reason: "unreadable" });
      continue;
    }
    fileTexts.set(file, text);
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(file, ts),
    );
    const bindings = new Map();
    const namespaces = new Map();

    const positionOf = (pos) => {
      const lc = sourceFile.getLineAndCharacterOfPosition(pos);
      return { line: lc.line + 1, column: lc.character + 1 };
    };

    const makeReference = (literal, kind, match) => {
      const raw = literal.getText(sourceFile);
      const quote = raw[0];
      const quoteLike = quote === '"' || quote === "'" || quote === "`";
      const innerStart = literal.getStart(sourceFile) + (quoteLike ? 1 : 0);
      const innerEnd = literal.getEnd() - (quoteLike ? 1 : 0);
      const inner = text.slice(innerStart, innerEnd);
      const { line, column } = positionOf(literal.getStart(sourceFile));
      const reference = {
        file: relFile,
        absolutePath: file,
        line,
        column,
        specifier: literal.text,
        subpath: match.subpath,
        entrypoint: match.entrypoint,
        kind,
        declared: isPlainObject(manifest) && model.publicPaths.has(match.subpath),
        names: [],
        defaultName: null,
        namespaceName: null,
        star: false,
        css: false,
        rewritable: quoteLike && inner === literal.text,
        span: { start: innerStart, end: innerEnd },
      };
      moduleReferences.push(reference);
      return reference;
    };

    const recordUnverified = (code, message, node) => {
      const { line, column } = positionOf(node.getStart(sourceFile));
      unverified.push({ code, message, file: relFile, line, column });
    };

    /* ------------------------------ imports ------------------------------ */
    const visitImports = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const match = classify(node.moduleSpecifier.text);
        if (match !== null) {
          const reference = makeReference(node.moduleSpecifier, "import", match);
          const clause = node.importClause;
          if (clause) {
            const clauseTypeOnly = clause.isTypeOnly === true;
            if (clause.name) {
              reference.defaultName = clause.name.text;
              if (!clauseTypeOnly) {
                bindings.set(clause.name.text, {
                  imported: null,
                  entrypoint: match.entrypoint,
                  source: "default",
                });
              }
            }
            const namedBindings = clause.namedBindings;
            if (namedBindings && ts.isNamespaceImport(namedBindings)) {
              reference.namespaceName = namedBindings.name.text;
              if (!clauseTypeOnly) {
                namespaces.set(namedBindings.name.text, match.entrypoint);
                bindings.set(namedBindings.name.text, {
                  imported: null,
                  entrypoint: match.entrypoint,
                  source: "namespace",
                });
              }
            } else if (namedBindings && ts.isNamedImports(namedBindings)) {
              for (const element of namedBindings.elements) {
                const imported = (element.propertyName ?? element.name).text;
                const local = element.name.text;
                const typeOnly = clauseTypeOnly || element.isTypeOnly === true;
                reference.names.push({ imported, local, typeOnly });
                if (!typeOnly) {
                  bindings.set(local, {
                    imported,
                    entrypoint: match.entrypoint,
                    source: "named",
                  });
                }
              }
            }
          }
        }
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const match = classify(node.moduleSpecifier.text);
        if (match !== null) {
          const reference = makeReference(node.moduleSpecifier, "export-from", match);
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              const imported = (element.propertyName ?? element.name).text;
              reference.names.push({
                imported,
                local: element.name.text,
                typeOnly: element.isTypeOnly === true,
              });
            }
          } else {
            reference.star = true;
          }
        }
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression !== undefined &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        const match = classify(node.moduleReference.expression.text);
        if (match !== null) {
          const reference = makeReference(node.moduleReference.expression, "import-equals", match);
          reference.namespaceName = node.name.text;
          namespaces.set(node.name.text, match.entrypoint);
          bindings.set(node.name.text, {
            imported: null,
            entrypoint: match.entrypoint,
            source: "namespace",
          });
        }
      } else if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const dynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;
        const requireCall = ts.isIdentifier(expression) && expression.text === "require";
        if (!dynamicImport && !requireCall) {
          ts.forEachChild(node, visitImports);
          return;
        }
        const first = node.arguments[0];
        if (first !== undefined) {
          if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
            const match = classify(first.text);
            if (match !== null) {
              makeReference(first, dynamicImport ? "dynamic-import" : "require", match);
            }
          } else if (ts.isTemplateExpression(first)) {
            const fragments = [
              first.head.text,
              ...first.templateSpans.map((span) => span.literal.text),
            ];
            if (fragments.some((fragment) => fragment.includes(packageName))) {
              recordUnverified(
                "dynamic-module",
                `Computed ${dynamicImport ? "import()" : "require()"} expression references ` +
                  `"${packageName}" and cannot be verified.`,
                first,
              );
            }
          }
          // An identifier or arbitrary expression cannot be attributed to the
          // package without broad guessing, so it is ignored.
        }
        ts.forEachChild(node, visitImports);
        return;
      }
      ts.forEachChild(node, visitImports);
    };

    /* --------------------------- require bindings ------------------------ */
    const visitRequireBindings = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isCallExpression(node.initializer)
      ) {
        const call = node.initializer;
        const expression = call.expression;
        const requireCall = ts.isIdentifier(expression) && expression.text === "require";
        if (requireCall && call.arguments.length > 0) {
          const first = call.arguments[0];
          if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
            const match = classify(first.text);
            if (match !== null) {
              if (ts.isIdentifier(node.name)) {
                namespaces.set(node.name.text, match.entrypoint);
                bindings.set(node.name.text, {
                  imported: null,
                  entrypoint: match.entrypoint,
                  source: "namespace",
                });
              } else if (ts.isObjectBindingPattern(node.name)) {
                for (const element of node.name.elements) {
                  const imported = (element.propertyName ?? element.name).text;
                  if (ts.isIdentifier(element.name)) {
                    bindings.set(element.name.text, {
                      imported,
                      entrypoint: match.entrypoint,
                      source: "named",
                    });
                  }
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visitRequireBindings);
    };

    /* ------------------------------ usage -------------------------------- */
    const resolveLocal = (name) => {
      const binding = bindings.get(name);
      if (binding === undefined) return null;
      return {
        imported: binding.imported,
        entrypoint: binding.entrypoint,
        isNamespace: binding.source === "namespace",
      };
    };

    const recordComponent = (name, node) => {
      const { line, column } = positionOf(node.getStart(sourceFile));
      components.push({ name, file: relFile, line, column });
    };

    const recordExtension = (name, node) => {
      const { line, column } = positionOf(node.getStart(sourceFile));
      const entrypoint = model.extensions.get(name)?.entrypoint ?? null;
      extensions.push({ name, entrypoint, file: relFile, line, column });
    };

    const literalAttributeValue = (attribute) => {
      const initializer = attribute.initializer;
      if (initializer === undefined) return null;
      if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
        return initializer.text;
      }
      if (ts.isJsxExpression(initializer) && initializer.expression) {
        const expression = initializer.expression;
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
          return expression.text;
        }
      }
      return null;
    };

    const checkElementProps = (element, componentName) => {
      for (const property of element.attributes.properties) {
        if (ts.isJsxSpreadAttribute(property)) {
          recordUnverified(
            "spread-props",
            `Spread props on design-system component "${componentName}" cannot be verified ` +
              "against the target system.",
            property,
          );
          continue;
        }
        if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue;
        const attributeName = property.name.text;
        if (attributeName !== "variant" && attributeName !== "size") continue;
        const value = literalAttributeValue(property);
        const { line, column } = positionOf(property.getStart(sourceFile));
        if (value === null) {
          recordUnverified(
            `dynamic-${attributeName}`,
            `Dynamic "${attributeName}" on design-system component "${componentName}" cannot ` +
              "be verified against the target system.",
            property,
          );
          continue;
        }
        const list = attributeName === "variant" ? variants : sizes;
        list.push({
          component: componentName,
          value,
          file: relFile,
          line,
          column,
        });
      }
    };

    const handleComponentElement = (name, element) => {
      recordComponent(name, element);
      checkElementProps(element, name);
    };

    const handleJsxTag = (node) => {
      const tag = node.tagName;
      let baseName = null;
      let memberName = null;
      if (ts.isIdentifier(tag)) {
        baseName = tag.text;
      } else if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression)) {
        baseName = tag.expression.text;
        memberName = tag.name.text;
      } else {
        return;
      }
      const resolved = resolveLocal(baseName);
      if (resolved === null) return;
      if (resolved.isNamespace) {
        if (memberName === null) return;
        if (model.components.has(memberName)) {
          handleComponentElement(memberName, node);
        } else if (model.extensions.has(memberName)) {
          recordExtension(memberName, tag);
        }
        return;
      }
      if (memberName !== null) {
        // `Alert.Title`: a compound member of a component binding.
        if (model.components.has(resolved.imported)) {
          const { line, column } = positionOf(tag.getStart(sourceFile));
          members.push({
            component: resolved.imported,
            member: memberName,
            file: relFile,
            line,
            column,
          });
        }
        return;
      }
      if (model.components.has(resolved.imported)) {
        handleComponentElement(resolved.imported, node);
      } else if (model.extensions.has(resolved.imported)) {
        recordExtension(resolved.imported, tag);
      }
    };

    const isJsxTagName = (node) => {
      const parent = node.parent;
      return (
        parent !== undefined &&
        (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
        parent.tagName === node
      );
    };

    const visitUsage = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        handleJsxTag(node);
      } else if (ts.isPropertyAccessExpression(node) && !isJsxTagName(node)) {
        if (ts.isIdentifier(node.expression)) {
          const resolved = resolveLocal(node.expression.text);
          if (resolved !== null) {
            const memberName = node.name.text;
            if (resolved.isNamespace) {
              if (model.components.has(memberName)) {
                recordComponent(memberName, node);
              } else if (model.extensions.has(memberName)) {
                recordExtension(memberName, node);
              }
            } else if (model.components.has(resolved.imported)) {
              const { line, column } = positionOf(node.getStart(sourceFile));
              members.push({
                component: resolved.imported,
                member: memberName,
                file: relFile,
                line,
                column,
              });
            } else if (resolved.entrypoint === "./tokens") {
              const { line, column } = positionOf(node.getStart(sourceFile));
              publicApiAccesses.push({
                entrypoint: resolved.entrypoint,
                imported: resolved.imported,
                member: memberName,
                file: relFile,
                line,
                column,
              });
            }
          }
        }
      } else if (ts.isElementAccessExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          const resolved = resolveLocal(node.expression.text);
          if (resolved !== null && resolved.isNamespace) {
            recordUnverified(
              "computed-member",
              `Computed member access on design-system namespace "${node.expression.text}" ` +
                "cannot be verified against the target system.",
              node,
            );
          }
        }
      }
      ts.forEachChild(node, visitUsage);
    };

    /* ------------------------------ strings ------------------------------ */
    const visitStrings = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const start = node.getStart(sourceFile);
        const { line, column } = positionOf(start);
        collectTokenReferencesFromText({
          text: node.text,
          file: relFile,
          line,
          column: column + 1,
          tokens,
          out: tokenReferences,
        });
      } else if (ts.isTemplateExpression(node)) {
        const headStart = node.head.getStart(sourceFile);
        const headPosition = positionOf(headStart);
        collectTokenReferencesFromText({
          text: node.head.text,
          file: relFile,
          line: headPosition.line,
          column: headPosition.column + 1,
          tokens,
          out: tokenReferences,
        });
        for (const span of node.templateSpans) {
          const spanStart = span.literal.getStart(sourceFile);
          const spanPosition = positionOf(spanStart);
          collectTokenReferencesFromText({
            text: span.literal.text,
            file: relFile,
            line: spanPosition.line,
            column: spanPosition.column + 1,
            tokens,
            out: tokenReferences,
          });
        }
      }
      ts.forEachChild(node, visitStrings);
    };

    visitImports(sourceFile);
    visitRequireBindings(sourceFile);
    visitUsage(sourceFile);
    visitStrings(sourceFile);
  }

  /* ------------------------------ CSS file ------------------------------ */
  let cssFile = null;
  if (typeof cssPath === "string" && cssPath.trim().length > 0) {
    const requested = cssPath.trim();
    const cssTarget = assertWithin(
      root,
      isAbsolute(requested) ? resolve(requested) : join(root, requested),
      "CSS file",
    );
    if (!existsSync(cssTarget) || !statSync(cssTarget).isFile()) {
      throw new Error(
        `CSS file does not exist or is not a regular file: ${cssTarget}. ` +
          "Active usage only reads an explicitly named CSS file inside --cwd.",
      );
    }
    const text = readFileSync(cssTarget, "utf8");
    const relCss = toPosix(relative(root, cssTarget));
    const imports = [];
    const cssTokens = [];
    const lines = text.split(/(?<=\n)/);
    let offset = 0;
    for (const lineText of lines) {
      const match = IMPORT_STATEMENT_PATTERN.exec(lineText.replace(/\r?\n$/, ""));
      if (match !== null) {
        const specifier = match[1] ?? match[2];
        const specifierOffset = lineText.indexOf(specifier);
        const classified = classify(specifier);
        if (classified !== null) {
          const position = positionAt(text, offset + specifierOffset);
          imports.push({
            file: relCss,
            absolutePath: cssTarget,
            line: position.line,
            column: position.column,
            specifier,
            subpath: classified.subpath,
            entrypoint: classified.entrypoint,
            kind: "css-import",
            declared: isPlainObject(manifest) && model.publicPaths.has(classified.subpath),
            names: [],
            defaultName: null,
            namespaceName: null,
            star: false,
            css: true,
            rewritable: true,
            span: {
              start: offset + specifierOffset,
              end: offset + specifierOffset + specifier.length,
            },
          });
        }
      }
      offset += lineText.length;
    }
    collectTokenReferencesFromText({
      text,
      file: relCss,
      line: 1,
      column: 1,
      tokens,
      out: cssTokens,
    });
    cssFile = {
      path: cssTarget,
      relativePath: relCss,
      text,
      imports,
      tokenReferences: cssTokens,
    };
    moduleReferences.push(...imports);
    tokenReferences.push(...cssTokens);
  }

  /* --------------------------- unsupported files ------------------------ */
  // Framework source files this bounded scanner cannot parse are never treated
  // as compatible: when one literally references the package it is reported as
  // unverified so switch/remove fail closed instead of guessing.
  const unsupportedFiles = [];
  for (const file of unsupported) {
    const relFile = toPosix(relative(root, file));
    unsupportedFiles.push(relFile);
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      skipped.push({ path: file, reason: "unreadable" });
      continue;
    }
    if (size > MAX_SOURCE_BYTES) {
      skipped.push({ path: file, reason: "oversized" });
      continue;
    }
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      skipped.push({ path: file, reason: "unreadable" });
      continue;
    }
    const index = text.indexOf(packageName);
    if (index === -1) continue;
    const position = positionAt(text, index);
    unverified.push({
      code: "unsupported-source-file",
      message:
        `${relFile} is not a scanned JS/TS module but references "${packageName}" at ` +
        `${relFile}:${position.line}; it cannot be verified and fails closed.`,
      file: relFile,
      line: position.line,
      column: position.column,
    });
  }

  /* --------------------------- exact rewrites --------------------------- */
  // When a target package is supplied, produce the exact byte plan for the
  // only transform this scanner permits: a pure package-prefix swap of a
  // literal module specifier (or explicit-CSS import) to the same declared
  // public path. No other source transform is ever planned.
  let rewrites = null;
  if (typeof targetPackage === "string" && targetPackage.trim().length > 0) {
    const normalizedTarget = targetPackage.trim();
    const grouped = new Map();
    for (const reference of moduleReferences) {
      if (!reference.rewritable) continue;
      const list = grouped.get(reference.absolutePath) ?? [];
      list.push(reference);
      grouped.set(reference.absolutePath, list);
    }
    rewrites = [];
    for (const [path, references] of [...grouped.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    )) {
      const isCss = references[0].css === true;
      const before = isCss ? cssFile?.text : fileTexts.get(path);
      if (typeof before !== "string") continue;
      const edits = references
        .map((reference) => ({
          start: reference.span.start,
          end: reference.span.end,
          before: reference.specifier,
          after: targetSpecifierFor({
            targetPackage: normalizedTarget,
            subpath: reference.subpath,
          }),
        }))
        .sort((a, b) => b.start - a.start);
      let after = before;
      for (const edit of edits) {
        if (after.slice(edit.start, edit.end) !== edit.before) continue;
        after = `${after.slice(0, edit.start)}${edit.after}${after.slice(edit.end)}`;
      }
      if (after !== before) {
        rewrites.push({
          kind: isCss ? "css" : "source",
          path,
          before,
          after,
          edits: [...edits].reverse(),
        });
      }
    }
    rewrites.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  const counts = {
    sourceFiles: files.length,
    unsupportedFiles: unsupported.length,
    moduleReferences: moduleReferences.length,
    components: components.length,
    extensions: extensions.length,
    variants: variants.length,
    sizes: sizes.length,
    members: members.length,
    unverified: unverified.length,
    tokenReferences: tokenReferences.length,
    publicApiAccesses: publicApiAccesses.length,
    cssImports: cssFile === null ? 0 : cssFile.imports.length,
  };

  return {
    package: packageName,
    version: manifest?.version ?? null,
    files: files.map((file) => toPosix(relative(root, file))),
    unsupportedFiles,
    skipped: skipped.map((entry) => ({ ...entry, path: toPosix(relative(root, entry.path)) })),
    moduleReferences,
    components,
    extensions,
    variants,
    sizes,
    members,
    unverified,
    tokenReferences,
    publicApiAccesses,
    cssFile,
    tokensAvailable: tokens !== null,
    rewrites,
    counts,
    limitations: ACTIVE_USAGE_LIMITATIONS,
  };
}

/* -------------------------------------------------------------------------- */
/* Usage model                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Build the manifest-derived model the scanner resolves bindings against.
 * `manifest: null` yields an empty model: module references are still detected,
 * but component/extension/token usage cannot be attributed.
 */
export function buildUsageModel(manifest) {
  const components = new Map();
  const extensions = new Map();
  const entrypoints = new Set();
  const publicPaths = new Set(["."]);
  const publicApi = new Map();
  if (isPlainObject(manifest)) {
    const rawComponents = isPlainObject(manifest.components) ? manifest.components : {};
    for (const [name, entry] of Object.entries(rawComponents)) {
      components.set(name, {
        variants: stringArray(entry?.variants),
        sizes: stringArray(entry?.sizes),
        members: stringArray(entry?.members),
      });
    }
    const rawExtensions = isPlainObject(manifest.extensions) ? manifest.extensions : {};
    for (const [name, extension] of Object.entries(rawExtensions)) {
      extensions.set(name, extension);
    }
    const rawEntrypoints = isPlainObject(manifest.entrypoints) ? manifest.entrypoints : {};
    for (const key of Object.keys(rawEntrypoints)) {
      entrypoints.add(key);
      publicPaths.add(key);
    }
    const rawExports = isPlainObject(manifest.exports) ? manifest.exports : {};
    for (const key of Object.keys(rawExports)) publicPaths.add(key);
    const rawPublicApi = isPlainObject(manifest.publicApi) ? manifest.publicApi : {};
    for (const [key, names] of Object.entries(rawPublicApi)) {
      publicApi.set(key, stringArray(names));
    }
  }
  return { components, extensions, entrypoints, publicPaths, publicApi };
}

/**
 * Compute the target package specifier for one current specifier/subpath. The
 * replacement is a pure package-prefix swap to the same declared public path.
 */
export function targetSpecifierFor({ targetPackage, subpath }) {
  return subpath === "." ? targetPackage : `${targetPackage}${subpath.slice(1)}`;
}
