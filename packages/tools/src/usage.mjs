#!/usr/bin/env node
/**
 * V3 strict usage validation (published implementation).
 *
 * Deterministic, AST-based checking of a configured consumer repository. It
 * discovers the consumer contract through the config-first consumer tooling,
 * reads the design system's strict rules from the shipped `design-system.json`
 * manifest (resolved through the public `./manifest` export), and scans only
 * TS/TSX files under the consumer root. It never imports package source or core
 * and never uses repository-wide regex scanning.
 *
 * Detections:
 *   - arbitrary visual values in Tailwind-like class tokens (colors, radii,
 *     shadows, including variant prefixes);
 *   - static visual overrides and unverifiable/dynamic/spread inline `style`
 *     values;
 *   - obvious local primitive replacements when duplication is disallowed.
 *
 * Strict-mode findings are errors (non-zero exit); non-strict findings are
 * warnings (zero exit). A clean run exits zero.
 *
 * This module is both a library and the implementation behind the `prism-ds`
 * CLI. The TypeScript dependency is declared by `@prism-system/tools`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";

import { CONTRACT_V4, V2_REQUIRED_COMPONENTS, V4_COMPONENT_NAMES } from "./constants.mjs";
import { detectManifestContract } from "./manifest.mjs";
import {
  CONSUMER_DIRECTORY,
  discoverConsumerPackage,
  normalizeIgnoreGlobs,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";

/**
 * TypeScript is a declared runtime dependency, but it is heavy and only the
 * `check-usage` command needs it. It is loaded lazily (and cached) the first
 * time an actual usage check runs, so importing this module — or running
 * `connect`/`doctor` — never loads TypeScript. The load is synchronous and
 * cached because the public checker helpers are synchronous.
 */
const requireFromHere = createRequire(import.meta.url);
let cachedTypeScript = null;

/** Load and cache the TypeScript module on first use. */
export function getTypeScript() {
  if (cachedTypeScript === null) {
    cachedTypeScript = requireFromHere("typescript");
  }
  return cachedTypeScript;
}

/** Rule identifiers emitted by the checker. */
export const RULE_IDS = Object.freeze({
  arbitraryColor: "no-arbitrary-color",
  arbitraryRadius: "no-arbitrary-radius",
  arbitraryShadow: "no-arbitrary-shadow",
  visualStyleOverride: "no-visual-style-override",
  dynamicVisualStyle: "no-dynamic-visual-style",
  styleSpread: "no-style-spread",
  styleExpression: "no-style-expression",
  unverifiableStyle: "no-unverifiable-style",
  primitiveDuplication: "no-primitive-duplication",
});

/** Directories never scanned. */
const SKIP_DIRECTORIES = Object.freeze(
  new Set([
    "node_modules",
    ".next",
    "dist",
    "build",
    "out",
    "coverage",
    ".turbo",
    CONSUMER_DIRECTORY,
  ]),
);

/** Generated/declaration files never scanned. */
const GENERATED_FILE_PATTERN = /(?:\.d\.ts|\.generated\.(?:ts|tsx)|\.gen\.(?:ts|tsx))$/i;

const SOURCE_FILE_PATTERN = /\.(?:ts|tsx)$/i;

const COLOR_UTILITY_HEADS = Object.freeze(
  new Set([
    "bg",
    "text",
    "border",
    "ring",
    "outline",
    "fill",
    "stroke",
    "divide",
    "from",
    "via",
    "to",
    "accent",
    "caret",
    "decoration",
    "placeholder",
    "selection",
  ]),
);

const COLOR_STYLE_PROPERTIES = Object.freeze(
  new Set([
    "color",
    "background",
    "background-color",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-block-color",
    "border-inline-color",
    "outline-color",
    "text-decoration-color",
    "caret-color",
    "accent-color",
    "column-rule-color",
    "fill",
    "stroke",
  ]),
);

const RADIUS_STYLE_PROPERTIES = Object.freeze(
  new Set([
    "border-radius",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "border-start-start-radius",
    "border-start-end-radius",
    "border-end-start-radius",
    "border-end-end-radius",
  ]),
);

const SHADOW_STYLE_PROPERTIES = Object.freeze(new Set(["box-shadow", "text-shadow"]));

const OTHER_VISUAL_STYLE_PROPERTIES = Object.freeze(
  new Set([
    "font",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "font-stretch",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-transform",
    "text-decoration",
    "text-decoration-line",
    "text-decoration-style",
    "text-decoration-thickness",
    "text-underline-offset",
    "text-emphasis",
    "text-emphasis-color",
    "text-rendering",
    "opacity",
    "filter",
    "backdrop-filter",
    "mix-blend-mode",
    "transform",
    "transform-origin",
    "transition",
    "transition-property",
    "transition-duration",
    "transition-timing-function",
    "animation",
    "animation-name",
    "animation-duration",
    "animation-timing-function",
    "outline",
    "outline-offset",
    "border",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "border-block",
    "border-inline",
    "border-start",
    "border-end",
    "border-x",
    "border-y",
    "-webkit-text-fill-color",
  ]),
);

/** Layout properties that are always allowed, regardless of value form. */
const LAYOUT_STYLE_PROPERTIES = Object.freeze(
  new Set([
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "inset",
    "inset-block",
    "inset-inline",
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "max-height",
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "margin-block",
    "margin-inline",
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "padding-block",
    "padding-inline",
    "gap",
    "row-gap",
    "column-gap",
    "flex",
    "flex-direction",
    "flex-wrap",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "order",
    "grid",
    "grid-area",
    "grid-template",
    "grid-template-areas",
    "grid-template-columns",
    "grid-template-rows",
    "grid-column",
    "grid-row",
    "grid-auto-flow",
    "grid-auto-columns",
    "grid-auto-rows",
    "align-items",
    "align-content",
    "align-self",
    "justify-items",
    "justify-content",
    "justify-self",
    "place-items",
    "place-content",
    "place-self",
    "overflow",
    "overflow-x",
    "overflow-y",
    "box-sizing",
    "aspect-ratio",
    "object-fit",
    "object-position",
    "z-index",
    "float",
    "clear",
    "resize",
    "columns",
    "column-count",
    "column-width",
    "break-after",
    "break-before",
    "break-inside",
    "white-space",
    "word-break",
    "overflow-wrap",
    "word-wrap",
    "vertical-align",
    "direction",
    "writing-mode",
    "text-align",
    "text-indent",
    "text-overflow",
    "table-layout",
    "border-collapse",
    "border-spacing",
    "border-width",
    "border-style",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-block-width",
    "border-inline-width",
    "pointer-events",
    "touch-action",
    "user-select",
    "scroll-behavior",
    "scroll-margin",
    "scroll-padding",
    "contain",
    "content-visibility",
    "list-style",
    "list-style-type",
    "list-style-position",
  ]),
);

const CANONICAL_COMPONENTS = new Set(V2_REQUIRED_COMPONENTS);

/**
 * The canonical component names a manifest makes available, used by duplication
 * detection. A V2 manifest provides the fourteen V2 names; a V4 manifest
 * provides the twenty V4 required names plus only the optional capabilities the
 * manifest actually declares (an omitted optional is not a system-provided
 * primitive).
 *
 * @param {unknown} manifest
 * @returns {string[]}
 */
export function componentNamesForManifest(manifest) {
  if (detectManifestContract(manifest) !== CONTRACT_V4) {
    return [...V2_REQUIRED_COMPONENTS];
  }
  const components = isPlainObject(manifest?.components) ? manifest.components : {};
  return V4_COMPONENT_NAMES.filter((name) =>
    Object.prototype.hasOwnProperty.call(components, name),
  );
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPosix(path) {
  return path.split(sep).join("/");
}

/** Convert a root-relative glob to an anchored RegExp. */
export function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        // `**/` matches zero or more path segments; a trailing `**` matches all.
        if (glob[index + 2] === "/") {
          pattern += "(?:.*/)?";
          index += 2;
        } else {
          pattern += ".*";
          index += 1;
        }
      } else {
        pattern += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      pattern += "[^/]";
      continue;
    }
    if ("\\^$+.()|{}[]".includes(char)) {
      pattern += `\\${char}`;
      continue;
    }
    pattern += char;
  }
  return new RegExp(`^${pattern}$`);
}

/** Normalize a config `rules` block; missing rules are treated as disallowed. */
export function normalizeRules(rules) {
  const source = isPlainObject(rules) ? rules : {};
  return {
    allowArbitraryColors: source.allowArbitraryColors === true,
    allowArbitraryRadius: source.allowArbitraryRadius === true,
    allowArbitraryShadows: source.allowArbitraryShadows === true,
    allowPrimitiveDuplication: source.allowPrimitiveDuplication === true,
  };
}

/* -------------------------------------------------------------------------- */
/* Class token analysis                                                       */
/* -------------------------------------------------------------------------- */

/** Strip leading variant prefixes (`hover:`, `md:`, `data-[x]:`) from a token. */
export function stripVariants(token) {
  let depth = 0;
  let lastColon = -1;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;
    else if (char === ":" && depth === 0) lastColon = index;
  }
  return lastColon === -1 ? token : token.slice(lastColon + 1);
}

function arbitraryValueOf(token) {
  const open = token.indexOf("[");
  const close = token.lastIndexOf("]");
  if (open === -1 || close === -1 || close < open) return null;
  return token.slice(open + 1, close);
}

/** True for a raw value that is clearly a color (hex, color function, or variable). */
function looksLikeColorValue(value) {
  const text = value.trim().toLowerCase();
  if (text.startsWith("#") || text.startsWith("--")) return true;
  if (/^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\(/.test(text)) return true;
  if (text.startsWith("var(")) return true;
  return false;
}

/**
 * Recognized non-visual/layout Tailwind type hints. When one of these is present
 * it is authoritative: the value is not a visual override, even if it uses a CSS
 * variable (`text-[length:var(--size)]`, `bg-[length:--width]`).
 */
const NON_VISUAL_TYPE_HINTS = Object.freeze(
  new Set([
    "length",
    "line-width",
    "angle",
    "time",
    "percentage",
    "number",
    "integer",
    "url",
    "image",
    "position",
    "family-name",
    "generic-name",
    "absolute-size",
    "relative-size",
    "size",
    "bg-size",
    "flex",
    "grid",
  ]),
);

/**
 * Classify an arbitrary value inside `[...]`, honoring an optional Tailwind type
 * hint (`color:`, `length:`, `shadow:`, ...) and CSS-variable forms (`--brand`).
 * Explicit `color`/`shadow` hints classify; recognized non-visual hints such as
 * `length` are authoritative and return no category; unknown hints and untyped
 * values fall back to value-based color detection.
 * Returns "color" | "shadow" | null.
 */
export function classifyArbitraryVisualValue(rawValue) {
  const typed = /^([a-z-]+):([\s\S]*)$/.exec(rawValue.trim());
  if (typed) {
    if (typed[1] === "color") return "color";
    if (typed[1] === "shadow") return "shadow";
    if (NON_VISUAL_TYPE_HINTS.has(typed[1])) return null;
    return looksLikeColorValue(typed[2]) ? "color" : null;
  }
  return looksLikeColorValue(rawValue) ? "color" : null;
}

/**
 * Classify an arbitrary Tailwind-like token as a disallowed visual category.
 * Returns "color" | "radius" | "shadow" | null.
 */
export function classifyClassToken(token) {
  const base = stripVariants(token);
  if (!base.includes("[")) return null;
  if (/^rounded(?:-[a-z0-9]+)*-?\[/.test(base)) return "radius";
  if (/^(?:shadow|drop-shadow|inset-shadow|text-shadow)(?:-[a-z0-9]+)*-?\[/.test(base))
    return "shadow";
  const match = /^([a-z-]+)-\[/.exec(base);
  if (!match) return null;
  const head = match[1].split("-")[0];
  if (!COLOR_UTILITY_HEADS.has(head)) return null;
  const value = arbitraryValueOf(base);
  if (value === null) return null;
  return classifyArbitraryVisualValue(value);
}

/* -------------------------------------------------------------------------- */
/* Style property analysis                                                    */
/* -------------------------------------------------------------------------- */

function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

/** Returns "color" | "radius" | "shadow" | "visual" | null for a style property. */
export function visualCategoryForStyleProperty(kebab) {
  if (kebab.startsWith("--")) return "visual";
  if (COLOR_STYLE_PROPERTIES.has(kebab)) return "color";
  if (RADIUS_STYLE_PROPERTIES.has(kebab) || kebab.startsWith("border-radius")) return "radius";
  if (SHADOW_STYLE_PROPERTIES.has(kebab)) return "shadow";
  if (OTHER_VISUAL_STYLE_PROPERTIES.has(kebab)) return "visual";
  if (kebab.startsWith("font-") || kebab.startsWith("text-decoration")) return "visual";
  if (kebab.startsWith("background-")) return "color";
  if (kebab.startsWith("border-") && kebab.endsWith("-color")) return "color";
  if (kebab.startsWith("transition-") || kebab.startsWith("animation-")) return "visual";
  if (kebab.startsWith("transform-")) return "visual";
  if (kebab.endsWith("-shadow")) return "shadow";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Consumer context                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Discover the consumer contract (config-first) and read strict rules.
 *
 * @param {{ cwd?: string, ignore?: string[], strict?: boolean }} [options]
 */
export function loadUsageContext({ cwd, ignore, strict } = {}) {
  const consumerRoot = resolveConsumerRoot({ cwd });
  const discovered = discoverConsumerPackage({ consumerRoot });
  const installed = resolveInstalledDesignSystem({
    consumerRoot,
    packageName: discovered.packageName,
  });
  const { version } = verifyConsumerDesignSystem({
    packageName: discovered.packageName,
    expectedVersion: discovered.expectedVersion,
    installed,
  });
  const effectiveStrict = strict ?? (discovered.config ? discovered.config.strict : true);
  const configIgnore = discovered.config ? discovered.config.ignore : [];
  const cliIgnore = normalizeIgnoreGlobs(consumerRoot, ignore, "cli");
  const ignoreGlobs = [...new Set([...configIgnore, ...cliIgnore])];
  return {
    consumerRoot,
    packageName: discovered.packageName,
    version,
    strict: effectiveStrict,
    rules: normalizeRules(installed.manifest?.rules),
    ignoreGlobs,
    manifest: installed.manifest,
    componentNames: componentNamesForManifest(installed.manifest),
  };
}

/** Collect the sorted list of scannable TS/TSX files. */
export function collectSourceFiles({ consumerRoot, ignoreGlobs = [] } = {}) {
  const matchers = ignoreGlobs.map(globToRegExp);
  const isIgnored = (relPath) => matchers.some((matcher) => matcher.test(relPath));
  const files = [];
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
      if (!SOURCE_FILE_PATTERN.test(entry.name)) continue;
      if (GENERATED_FILE_PATTERN.test(entry.name)) continue;
      if (isIgnored(relPath)) continue;
      files.push(full);
    }
  };
  walk(consumerRoot);
  files.sort();
  return files;
}

/* -------------------------------------------------------------------------- */
/* AST checking                                                               */
/* -------------------------------------------------------------------------- */

function staticValueKind(node, tsModule) {
  if (tsModule.isStringLiteral(node) || tsModule.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: "static", text: node.text };
  }
  if (tsModule.isNumericLiteral(node)) {
    return { kind: "static", text: node.text };
  }
  if (
    tsModule.isPrefixUnaryExpression(node) &&
    node.operator === tsModule.SyntaxKind.MinusToken &&
    tsModule.isNumericLiteral(node.operand)
  ) {
    return { kind: "static", text: `-${node.operand.text}` };
  }
  return { kind: "dynamic" };
}

function readPropertyName(name, tsModule) {
  if (tsModule.isIdentifier(name)) return { static: true, name: name.text };
  if (tsModule.isStringLiteral(name) || tsModule.isNoSubstitutionTemplateLiteral(name)) {
    return { static: true, name: name.text };
  }
  if (tsModule.isComputedPropertyName(name)) {
    const expr = name.expression;
    if (tsModule.isStringLiteral(expr) || tsModule.isNoSubstitutionTemplateLiteral(expr)) {
      return { static: true, name: expr.text };
    }
    return { static: false, name: null };
  }
  return { static: false, name: null };
}

/**
 * Check one source text and return findings (without file-relative metadata
 * beyond positions). Exported for focused tests.
 *
 * `componentNames` is the set of canonical component names a local declaration
 * or relative import must not duplicate. When omitted it defaults to the
 * fourteen V2 names, preserving the original behavior for direct callers; the
 * consumer checker passes the contract-appropriate set derived from the
 * installed manifest.
 */
export function checkSourceText({ fileName, text, rules, strict, componentNames }) {
  const ts = getTypeScript();
  const canonical = componentNames === undefined ? CANONICAL_COMPONENTS : new Set(componentNames);
  const scriptKind = fileName.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind);
  const findings = [];

  const positionOf = (pos) => {
    const lc = sourceFile.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
  };
  const report = ({ pos, ruleId, message, token }) => {
    const { line, column } = positionOf(pos);
    findings.push({
      file: fileName,
      line,
      column,
      ruleId,
      severity: strict ? "error" : "warning",
      message,
      token,
    });
  };

  const checkClassFragment = (fragmentText, fragmentStart) => {
    const tokens = fragmentText.split(/\s+/).filter((token) => token.length > 0);
    for (const token of tokens) {
      const category = classifyClassToken(token);
      if (category === null) continue;
      if (category === "color" && rules.allowArbitraryColors) continue;
      if (category === "radius" && rules.allowArbitraryRadius) continue;
      if (category === "shadow" && rules.allowArbitraryShadows) continue;
      const ruleId =
        category === "color"
          ? RULE_IDS.arbitraryColor
          : category === "radius"
            ? RULE_IDS.arbitraryRadius
            : RULE_IDS.arbitraryShadow;
      const offset = fragmentText.indexOf(token);
      report({
        pos: fragmentStart + Math.max(offset, 0),
        ruleId,
        message: `Arbitrary ${category} value in class token "${token}" bypasses the design system's visual language.`,
        token,
      });
    }
  };

  const collectClassFragments = (expr) => {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      checkClassFragment(expr.text, expr.getStart(sourceFile) + 1);
      return;
    }
    if (ts.isTemplateExpression(expr)) {
      checkClassFragment(expr.head.text, expr.head.getStart(sourceFile) + 1);
      for (const span of expr.templateSpans) {
        checkClassFragment(span.literal.text, span.literal.getStart(sourceFile));
      }
      return;
    }
    if (ts.isParenthesizedExpression(expr)) {
      collectClassFragments(expr.expression);
      return;
    }
    if (ts.isConditionalExpression(expr)) {
      collectClassFragments(expr.whenTrue);
      collectClassFragments(expr.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(expr)) {
      collectClassFragments(expr.left);
      collectClassFragments(expr.right);
      return;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      for (const element of expr.elements) collectClassFragments(element);
      return;
    }
    if (ts.isObjectLiteralExpression(expr)) {
      // Class maps such as `cn({ "bg-[#fff]": active })`: static string or
      // no-substitution-template keys are class strings. Recurse into values so
      // nested static maps/arrays are inspected; dynamic members are skipped.
      for (const property of expr.properties) {
        if (ts.isPropertyAssignment(property)) {
          const name = property.name;
          if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
            checkClassFragment(name.text, name.getStart(sourceFile) + 1);
          } else if (ts.isComputedPropertyName(name)) {
            const inner = name.expression;
            if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
              checkClassFragment(inner.text, inner.getStart(sourceFile) + 1);
            }
          }
          collectClassFragments(property.initializer);
          continue;
        }
        if (ts.isSpreadAssignment(property)) {
          collectClassFragments(property.expression);
        }
      }
      return;
    }
    if (ts.isCallExpression(expr)) {
      for (const argument of expr.arguments) collectClassFragments(argument);
      return;
    }
    if (ts.isJsxExpression(expr) && expr.expression) {
      collectClassFragments(expr.expression);
    }
  };

  const classifyStyleProperty = ({ kebab, rawName, value, pos }) => {
    if (LAYOUT_STYLE_PROPERTIES.has(kebab)) return;
    const category = visualCategoryForStyleProperty(kebab);
    if (category === null) {
      if (value.kind === "dynamic") {
        report({
          pos,
          ruleId: RULE_IDS.unverifiableStyle,
          message: `Unverifiable dynamic inline style value for "${rawName}" cannot be checked against the design system.`,
          token: rawName,
        });
      }
      return;
    }
    if (value.kind === "dynamic") {
      report({
        pos,
        ruleId: RULE_IDS.dynamicVisualStyle,
        message: `Dynamic inline style value for visual property "${rawName}" cannot be verified and is not allowed in strict mode.`,
        token: rawName,
      });
      return;
    }
    if (category === "color" && rules.allowArbitraryColors) return;
    if (category === "radius" && rules.allowArbitraryRadius) return;
    if (category === "shadow" && rules.allowArbitraryShadows) return;
    report({
      pos,
      ruleId: RULE_IDS.visualStyleOverride,
      message: `Inline style visual override "${rawName}: ${value.text}" bypasses the design system's visual language.`,
      token: `${rawName}: ${value.text}`,
    });
  };

  const checkStyleObject = (objectLiteral) => {
    for (const property of objectLiteral.properties) {
      if (ts.isSpreadAssignment(property)) {
        report({
          pos: property.getStart(sourceFile),
          ruleId: RULE_IDS.styleSpread,
          message: "Inline style spread cannot be verified and is not allowed in strict mode.",
          token: "...",
        });
        continue;
      }
      if (ts.isPropertyAssignment(property)) {
        const nameInfo = readPropertyName(property.name, ts);
        if (!nameInfo.static) {
          report({
            pos: property.getStart(sourceFile),
            ruleId: RULE_IDS.unverifiableStyle,
            message: "Computed inline style property name cannot be verified.",
            token: property.getText(sourceFile),
          });
          continue;
        }
        classifyStyleProperty({
          kebab: toKebab(nameInfo.name),
          rawName: nameInfo.name,
          value: staticValueKind(property.initializer, ts),
          pos: property.getStart(sourceFile),
        });
        continue;
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        classifyStyleProperty({
          kebab: toKebab(property.name.text),
          rawName: property.name.text,
          value: { kind: "dynamic" },
          pos: property.getStart(sourceFile),
        });
        continue;
      }
      report({
        pos: property.getStart(sourceFile),
        ruleId: RULE_IDS.unverifiableStyle,
        message: "Unsupported inline style member cannot be verified.",
        token: property.getText(sourceFile),
      });
    }
  };

  const checkStyleAttribute = (attribute) => {
    const initializer = attribute.initializer;
    if (!initializer) return;
    if (ts.isJsxExpression(initializer)) {
      const expr = initializer.expression;
      if (!expr) return; // style={} is an empty object
      if (ts.isObjectLiteralExpression(expr)) {
        checkStyleObject(expr);
        return;
      }
      report({
        pos: initializer.getStart(sourceFile),
        ruleId: RULE_IDS.styleExpression,
        message:
          "Inline style must be a static object literal; dynamic or non-object style expressions cannot be verified.",
        token: "style",
      });
      return;
    }
    report({
      pos: initializer.getStart(sourceFile),
      ruleId: RULE_IDS.styleExpression,
      message:
        "Inline style must be a static object literal; non-object style expressions cannot be verified.",
      token: "style",
    });
  };

  const checkPrimitiveDuplication = (node) => {
    if (rules.allowPrimitiveDuplication) return;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) return;
      const clause = node.importClause;
      if (!clause) return;
      const flag = (name, pos) => {
        report({
          pos,
          ruleId: RULE_IDS.primitiveDuplication,
          message: `Relative import of canonical component "${name}" from "${specifier}" looks like a local primitive replacement.`,
          token: name,
        });
      };
      if (clause.name && canonical.has(clause.name.text)) {
        flag(clause.name.text, clause.name.getStart(sourceFile));
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const imported = element.propertyName ?? element.name;
          if (canonical.has(imported.text)) {
            flag(imported.text, imported.getStart(sourceFile));
          }
        }
      }
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        if (canonical.has(clause.namedBindings.name.text)) {
          flag(clause.namedBindings.name.text, clause.namedBindings.name.getStart(sourceFile));
        }
      }
      return;
    }
    const nameNode =
      (ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name
        ? node.name
        : null;
    if (nameNode && ts.isIdentifier(nameNode) && canonical.has(nameNode.text)) {
      report({
        pos: node.getStart(sourceFile),
        ruleId: RULE_IDS.primitiveDuplication,
        message: `Local declaration "${nameNode.text}" duplicates a canonical design-system component.`,
        token: nameNode.text,
      });
    }
  };

  const visit = (node) => {
    if (ts.isJsxAttribute(node)) {
      const attributeName = node.name.text;
      if (attributeName === "className" || attributeName === "class") {
        const initializer = node.initializer;
        if (initializer) {
          if (ts.isStringLiteral(initializer)) {
            checkClassFragment(initializer.text, initializer.getStart(sourceFile) + 1);
          } else if (ts.isJsxExpression(initializer) && initializer.expression) {
            collectClassFragments(initializer.expression);
          }
        }
      } else if (attributeName === "style") {
        checkStyleAttribute(node);
      }
    }
    checkPrimitiveDuplication(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return findings;
}

/* -------------------------------------------------------------------------- */
/* Checker                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Run the usage check for a consumer root.
 *
 * @param {{ cwd?: string, ignore?: string[], strict?: boolean }} [options]
 * @returns {{ ok: boolean, strict: boolean, packageName: string, version: string, scanned: number, findings: object[], errors: number, warnings: number, summary: string }}
 */
export function checkUsage({ cwd, ignore, strict } = {}) {
  const context = loadUsageContext({ cwd, ignore, strict });
  const files = collectSourceFiles({
    consumerRoot: context.consumerRoot,
    ignoreGlobs: context.ignoreGlobs,
  });
  const findings = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const relFile = toPosix(relative(context.consumerRoot, file));
    const fileFindings = checkSourceText({
      fileName: relFile,
      text,
      rules: context.rules,
      strict: context.strict,
      componentNames: context.componentNames,
    });
    findings.push(...fileFindings);
  }
  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.length - errors;
  const summary =
    `Scanned ${files.length} file(s); ${errors} error(s), ${warnings} warning(s) ` +
    `(${context.packageName}@${context.version}, ${context.strict ? "strict" : "non-strict"}).`;
  return {
    ok: errors === 0,
    strict: context.strict,
    packageName: context.packageName,
    version: context.version,
    scanned: files.length,
    findings,
    errors,
    warnings,
    summary,
  };
}

export function helpText() {
  return [
    "Usage: prism-ds check-usage --cwd <consumer-root> [options]",
    "",
    "Deterministically validate strict design-system usage in a configured consumer",
    "repository. Discovers the design system through .design-system/config.json,",
    "reads strict rules from the shipped design-system.json manifest, and scans only",
    "TS/TSX files under the consumer root with the TypeScript AST.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --ignore <glob>       Additional root-relative ignore glob (repeatable).",
    "  --strict              Force strict mode (overrides consumer config).",
    "  --no-strict           Force non-strict mode (overrides consumer config).",
    "  -h, --help            Show this help.",
    "",
    "Strict-mode findings exit non-zero; non-strict findings are warnings and exit",
    "zero. A clean run exits zero.",
    "",
  ].join("\n");
}
