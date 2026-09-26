#!/usr/bin/env node
/**
 * Deterministic validation for a registered design-system package (V2 Phase 4).
 *
 * This module is both a reusable library (imported by release tooling) and a
 * CLI (`pnpm ds:check <id>`). It never mutates the manifest or the package.
 *
 * `validateDesignSystem({ id, root, runCommands })` returns a structured result
 * of the form `{ id, ok, failures, checks }`. Every check aggregates, so a
 * single run reports as many independent issues as it can detect.
 *
 * Validation is contract-aware. The registry entry's `contract` selects the
 * branch: `"v4"` uses the V4 per-component folder, token artifact, stylesheet
 * entry, and runtime `src/design-system.ts` checks; `"v2"` keeps the canonical
 * fourteen-component contract unchanged (a V1/missing contract still fails with
 * an actionable message instead of falling back to the historical eight).
 *
 * Shared V3 foundation checks: the generated `design-system.json` must match a
 * fresh build from the package-owned `design-system.source.json`, its declared
 * compound members must match the actual public API, and `package.json.version`
 * (authoritative) must equal the generated-manifest version, the runtime
 * `DesignSystem.version`, and the registry entry version.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANIFEST_RELATIVE_PATH,
  PACKAGE_DIRECTORY,
  V2_REQUIRED_COMPONENTS,
  assertSystemId,
  readJsonFile,
  readManifest,
  readPackageMetadata,
  repoRoot,
  toPackageName,
  toSystemClass,
  toTokensExport,
  toUiClass,
} from "./register-design-system.mjs";
import {
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  DESIGN_SYSTEM_SOURCE_FILENAME,
  MANIFEST_EXPORT_SUBPATH,
  MANIFEST_EXPORT_TARGET,
  TOKENS_SOURCE_FILENAME,
  V4_COMPONENT_NAMES,
  V4_REQUIRED_COMPONENTS,
  checkDesignSystemManifest,
  missingRequiredPackageFiles,
  readDesignSystemManifest,
  readRuntimeDesignSystemVersion,
  readSourceDescriptor,
} from "./design-system-manifest.mjs";

/** The canonical fourteen V2 component names, in order. */
export { V2_REQUIRED_COMPONENTS };

/** Applications every registered system must be wired into. */
export const APP_NAMES = Object.freeze(["showcase", "reference-app"]);

/** Required non-source files for every package. */
const REQUIRED_FILES = Object.freeze([
  "package.json",
  "README.md",
  "AGENTS.md",
  "LICENSE",
  "tsconfig.json",
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  DESIGN_SYSTEM_SOURCE_FILENAME,
  "src/index.ts",
  "src/tokens/index.ts",
  "src/styles/index.css",
]);

/** Compound components whose static members are attached via `Object.assign`. */
const COMPOUND_COMPONENTS = Object.freeze([
  "Card",
  "RadioGroup",
  "Switch",
  "Select",
  "Tabs",
  "Dialog",
  "DropdownMenu",
  "Tooltip",
]);

/** Component module candidates; generated packages emit `.tsx`. */
const COMPONENT_MODULE_CANDIDATES = Object.freeze([
  "src/components/index.tsx",
  "src/components/index.ts",
]);

/** Required token groups; `typography` is optional. */
const REQUIRED_TOKEN_GROUPS = Object.freeze(["color", "radius", "shadow", "motion"]);

/** Package scripts that must exist and pass. */
const REQUIRED_PACKAGE_SCRIPTS = Object.freeze(["typecheck", "lint", "build"]);

/**
 * Required files for a V4 package. Every V4 package uses the per-component
 * folder layout from the V4 specification, ships a generated manifest and
 * generated token/bridge artifacts, and owns its package and TS config.
 */
const V4_REQUIRED_FILES = Object.freeze([
  "package.json",
  "tsconfig.json",
  "README.md",
  "AGENTS.md",
  "LICENSE",
  DESIGN_SYSTEM_SOURCE_FILENAME,
  TOKENS_SOURCE_FILENAME,
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  "src/index.ts",
  "src/design-system.ts",
  "src/components/index.ts",
  "src/styles/index.css",
  "src/styles/tokens.css",
  "src/styles/tailwind.css",
  "src/tokens/index.ts",
]);

/** Public export subpaths every V4 package must declare. */
const V4_REQUIRED_EXPORTS = Object.freeze([
  ".",
  "./styles.css",
  "./tailwind.css",
  "./tokens",
  MANIFEST_EXPORT_SUBPATH,
]);

/**
 * Exact `exports` targets for the V4 stylesheet and token subpaths, matching the
 * canonical package template and the files the build ships. A subpath that
 * points anywhere else would silently resolve to a missing or wrong artifact.
 */
const V4_STYLES_EXPORT_TARGET = "./dist/index.css";
const V4_TAILWIND_EXPORT_TARGET = "./dist/tailwind.css";
const V4_TOKENS_EXPORT_TARGET = Object.freeze({
  types: "./dist/tokens/index.d.ts",
  import: "./dist/tokens/index.mjs",
  require: "./dist/tokens/index.js",
});

/** The legacy monolithic component module a V4 package must not ship. */
const V4_LEGACY_COMPONENTS_MODULE = "src/components/index.tsx";

/** The V4 runtime identity helper the package-owned `src/design-system.ts` uses. */
const V4_RUNTIME_HELPER = "defineDesignSystemV4";

/** The named export the runtime `src/design-system.ts` must expose. */
const V4_RUNTIME_EXPORT = "DesignSystem";

function toPosix(path) {
  return path.split(sep).join("/");
}

/** Path relative to the root when possible, otherwise the absolute path. */
function displayPath(root, target) {
  const rel = relative(root, target);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? toPosix(rel) : target;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Exact comparison for an `exports` target. String targets must match exactly;
 * conditional targets must be a plain object with exactly the expected keys and
 * values (key order is irrelevant).
 */
function sameExportTarget(actual, expected) {
  if (typeof expected === "string") return actual === expected;
  if (!isPlainObject(actual)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every(
    (key, index) => actualKeys[index] === key && actual[key] === expected[key],
  );
}

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate));
}

/* -------------------------------------------------------------------------- */
/* Deterministic source parsing                                               */
/* -------------------------------------------------------------------------- */

const EXPORT_DECL_PATTERN = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_TYPE_PATTERN = /export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST_PATTERN = /export\s*\{([^}]*)\}/g;
const EXPORT_STAR_PATTERN = /export\s+\*\s+from\s+["']([^"']+)["']/g;

const IMPORT_FROM_PATTERN = /\bimport\s+(?:[^"'();]*?\s+from\s+)?["']([^"']+)["']/g;
const RE_EXPORT_FROM_PATTERN = /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
const CSS_IMPORT_PATTERN = /@import\s+(?:url\()?["']([^"']+)["']/g;

function matches(pattern, source) {
  const values = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match !== null) {
    values.push(match[1]);
    match = pattern.exec(source);
  }
  return values;
}

/** Collect the names a module exports plus any `export * from` specifiers. */
function collectExports(source) {
  const names = new Set();
  for (const name of matches(EXPORT_DECL_PATTERN, source)) names.add(name);
  for (const name of matches(EXPORT_TYPE_PATTERN, source)) names.add(name);
  for (const list of matches(EXPORT_LIST_PATTERN, source)) {
    for (const entry of list.split(",")) {
      for (const part of entry.split(/\s+as\s+/)) {
        const name = part.trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
  }
  return { names, starReexports: matches(EXPORT_STAR_PATTERN, source) };
}

/** All module/stylesheet specifiers referenced by a source file. */
function importSpecifiers(source) {
  return [
    ...matches(IMPORT_FROM_PATTERN, source),
    ...matches(RE_EXPORT_FROM_PATTERN, source),
    ...matches(CSS_IMPORT_PATTERN, source),
  ];
}

/** Strip a trailing JS/TS extension so module specifiers compare equal. */
function withoutExtension(path) {
  return path.replace(/\.(?:d\.)?(?:mjs|cjs|jsx|tsx|js|ts)$/, "");
}

/** Extract the object literal body following `marker` (string-aware). */
function extractObjectBody(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;
  const open = source.indexOf("{", markerIndex);
  if (open === -1) return null;
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

/** Keys declared at the top level of an object body. */
function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && /[A-Za-z_$]/.test(char)) {
      const match = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(index));
      if (match) {
        keys.push(match[1]);
        index += match[0].length - 1;
      }
    }
  }
  return keys;
}

/** Recursively list files under `directory`. */
function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* -------------------------------------------------------------------------- */
/* V4 static runtime parser                                                   */
/* -------------------------------------------------------------------------- */

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * `DropdownMenu` -> `dropdown-menu`, `FormField` -> `form-field`,
 * `Button` -> `button`. Used to map a component contract name to its folder and
 * stylesheet names.
 */
function toKebabCase(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Tokenize JS/TS source into the minimal stream the V4 runtime parser needs:
 * comments dropped, string/template literals carrying their decoded value, and
 * every other character an identifier, number, or punctuation token. Template
 * substitutions are flagged so a dynamic value is never mistaken for static.
 */
function tokenizeSource(source) {
  const tokens = [];
  const length = source.length;
  let index = 0;
  while (index < length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      let value = "";
      index += 1;
      while (index < length && source[index] !== quote) {
        if (source[index] === "\\") {
          value += source[index + 1] ?? "";
          index += 2;
          continue;
        }
        value += source[index];
        index += 1;
      }
      index += 1;
      tokens.push({ type: "string", value, interpolated: value.includes("${") });
      continue;
    }
    if (IDENT_START.test(char)) {
      const start = index;
      while (index < length && IDENT_PART.test(source[index])) index += 1;
      tokens.push({ type: "ident", value: source.slice(start, index) });
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      while (index < length && /[0-9.eE+-]/.test(source[index])) index += 1;
      tokens.push({ type: "number", value: source.slice(start, index) });
      continue;
    }
    tokens.push({ type: "punct", value: char });
    index += 1;
  }
  return tokens;
}

/** Index of the `}` matching the `{` at `open`, or -1 when unterminated. */
function matchBrace(tokens, open) {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "punct" && token.value === "{") depth += 1;
    else if (token.type === "punct" && token.value === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Locate the single `callee({ ... })` call in a source file and return the span
 * of its direct object-literal argument. Fails closed on a missing, ambiguous,
 * wrapped, or non-literal argument.
 */
function findCallObject(tokens, callee) {
  const callIndexes = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token.type === "ident" && token.value === callee && next?.value === "(") {
      callIndexes.push(index);
    }
  }
  if (callIndexes.length === 0) {
    throw new Error(`src/design-system.ts does not call ${callee}(...).`);
  }
  if (callIndexes.length > 1) {
    throw new Error(
      `src/design-system.ts contains ${callIndexes.length} ${callee}(...) calls; exactly one is required.`,
    );
  }
  const argumentStart = callIndexes[0] + 2;
  if (tokens[argumentStart]?.value !== "{") {
    throw new Error(
      `${callee}(...) must be called with a single object literal argument; identifiers, ` +
        `conditionals, calls, and type-asserted wrappers are not allowed.`,
    );
  }
  const objectEnd = matchBrace(tokens, argumentStart);
  if (objectEnd === -1) throw new Error(`${callee}(...) object is unterminated.`);
  if (tokens[objectEnd + 1]?.value !== ")") {
    throw new Error(
      `${callee}(...) object must be the direct call argument with no extra arguments.`,
    );
  }
  return { open: argumentStart, close: objectEnd };
}

/** Top-level properties of an object literal, with value spans. */
function readTopLevelProperties(tokens, open, close) {
  const properties = [];
  let index = open + 1;
  while (index < close) {
    const token = tokens[index];
    if (token.type === "punct" && token.value === ",") {
      index += 1;
      continue;
    }
    if (token.type === "punct" && (token.value === "." || token.value === "[")) {
      throw new Error(
        `${V4_RUNTIME_HELPER}(...) contains a spread or computed key; declare each property statically.`,
      );
    }
    const isKey = token.type === "ident" || token.type === "string";
    const isShorthand = isKey && (tokens[index + 1]?.value === "," || index + 1 === close);
    if (!isKey || (!isShorthand && tokens[index + 1]?.value !== ":")) {
      throw new Error(
        `${V4_RUNTIME_HELPER}(...) contains an unsupported top-level property form near ` +
          `"${token.value}".`,
      );
    }
    const key = token.value;
    if (isShorthand) {
      // Shorthand (`components,`) resolves the identifier as the value.
      properties.push({ key, valueStart: index, valueEnd: index, shorthand: true });
      index += 1;
      continue;
    }
    const valueStart = index + 2;
    let depth = 0;
    let cursor = valueStart;
    for (; cursor < close; cursor += 1) {
      const current = tokens[cursor];
      if (
        current.type === "punct" &&
        (current.value === "{" || current.value === "[" || current.value === "(")
      ) {
        depth += 1;
      } else if (
        current.type === "punct" &&
        (current.value === "}" || current.value === "]" || current.value === ")")
      ) {
        if (depth === 0) break;
        depth -= 1;
      } else if (current.type === "punct" && current.value === "," && depth === 0) {
        break;
      }
    }
    properties.push({ key, valueStart, valueEnd: cursor - 1 });
    index = cursor + 1;
  }
  return properties;
}

/**
 * Component entries declared in an inline components object literal: the key is
 * the contract name and the identifier is the named export it references
 * (shorthand when no alias is used).
 */
function readInlineObjectEntries(tokens, open, close) {
  const entries = [];
  let index = open + 1;
  while (index < close) {
    const token = tokens[index];
    if (token.type === "punct" && token.value === ".") {
      throw new Error("The components map must not use spread; declare each component explicitly.");
    }
    if (token.type === "punct" && token.value === "[") {
      throw new Error("The components map must not use computed keys.");
    }
    if (token.type === "punct" && token.value === ",") {
      index += 1;
      continue;
    }
    if (token.type !== "ident" && token.type !== "string") {
      throw new Error(`The components map contains an unsupported entry near "${token.value}".`);
    }
    const key = token.value;
    let ident = key;
    if (tokens[index + 1]?.value === ":") {
      const valueToken = tokens[index + 2];
      if (valueToken?.type !== "ident") {
        throw new Error(`Components map entry "${key}" must reference a named component export.`);
      }
      ident = valueToken.value;
    }
    entries.push({ key, ident });
    let depth = 0;
    index += 1;
    for (; index < close; index += 1) {
      const current = tokens[index];
      if (
        current.type === "punct" &&
        (current.value === "{" || current.value === "[" || current.value === "(")
      ) {
        depth += 1;
      } else if (
        current.type === "punct" &&
        (current.value === "}" || current.value === "]" || current.value === ")")
      ) {
        if (depth === 0) break;
        depth -= 1;
      } else if (current.type === "punct" && current.value === "," && depth === 0) {
        break;
      }
    }
  }
  return entries;
}

/** A same-file `const <ident> = { ... }` object literal, or null. */
function findLocalObjectLiteral(tokens, ident) {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (
      token.type === "ident" &&
      token.value === "const" &&
      tokens[index + 1]?.type === "ident" &&
      tokens[index + 1].value === ident
    ) {
      let cursor = index + 2;
      while (
        cursor < tokens.length &&
        !(
          tokens[cursor].type === "punct" &&
          (tokens[cursor].value === "=" || tokens[cursor].value === ";")
        )
      ) {
        cursor += 1;
      }
      if (tokens[cursor]?.value !== "=") continue;
      const open = cursor + 1;
      if (tokens[open]?.value !== "{") continue;
      const close = matchBrace(tokens, open);
      if (close === -1) continue;
      return readInlineObjectEntries(tokens, open, close);
    }
  }
  return null;
}

/**
 * Member names attached by a static `Object.assign` on a component root, in
 * both `{ Key: value }` and `{ Key }` shorthand forms, or null when the module
 * has no matching static compound export.
 */
function readCompoundMemberNames(source, component) {
  const tokens = tokenizeSource(source);
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index]?.value === "export" &&
      tokens[index + 1]?.value === "const" &&
      tokens[index + 2]?.value === component &&
      tokens[index + 3]?.value === "=" &&
      tokens[index + 4]?.value === "Object" &&
      tokens[index + 5]?.value === "." &&
      tokens[index + 6]?.value === "assign"
    ) {
      for (let cursor = index + 7; cursor < tokens.length; cursor += 1) {
        if (tokens[cursor].value === "{") {
          const close = matchBrace(tokens, cursor);
          if (close === -1) return null;
          return readInlineObjectEntries(tokens, cursor, close).map((entry) => entry.key);
        }
        if (tokens[cursor].value === ")") break;
      }
      return null;
    }
  }
  return null;
}

/** Resolve the `components` property to its static component entries. */
function resolveComponentsEntries(tokens, property) {
  const first = tokens[property.valueStart];
  if (first?.value === "{") {
    const close = matchBrace(tokens, property.valueStart);
    if (close === -1 || close > property.valueEnd) {
      throw new Error(`${V4_RUNTIME_HELPER}(...) "components" object is unterminated.`);
    }
    return readInlineObjectEntries(tokens, property.valueStart, close);
  }
  if (property.valueStart === property.valueEnd && first?.type === "ident") {
    const entries = findLocalObjectLiteral(tokens, first.value);
    if (entries) return entries;
    throw new Error(
      `${V4_RUNTIME_HELPER}(...) "components" identifier "${first.value}" must reference a ` +
        `static object literal declared with const in the same file.`,
    );
  }
  throw new Error(
    `${V4_RUNTIME_HELPER}(...) "components" must be a static object literal or a const object-literal identifier.`,
  );
}

/**
 * Parse the package-owned V4 `src/design-system.ts` runtime identity, version,
 * marker, and component map without executing the module. Only the static
 * object-literal form is accepted.
 */
function parseV4RuntimeSource(source) {
  const tokens = tokenizeSource(source);
  const span = findCallObject(tokens, V4_RUNTIME_HELPER);
  const properties = readTopLevelProperties(tokens, span.open, span.close);
  const byKey = new Map();
  for (const property of properties) {
    if (byKey.has(property.key)) {
      throw new Error(`${V4_RUNTIME_HELPER}(...) declares duplicate property "${property.key}".`);
    }
    byKey.set(property.key, property);
  }

  const readStaticString = (key) => {
    const property = byKey.get(key);
    if (!property)
      throw new Error(`${V4_RUNTIME_HELPER}(...) is missing required property "${key}".`);
    const token = tokens[property.valueStart];
    if (
      property.valueStart !== property.valueEnd ||
      token?.type !== "string" ||
      token.interpolated
    ) {
      throw new Error(
        `${V4_RUNTIME_HELPER}(...) property "${key}" must be exactly one static string literal.`,
      );
    }
    return token.value;
  };

  const componentContract = readStaticString("componentContract");
  if (componentContract !== "v4") {
    throw new Error(
      `${V4_RUNTIME_HELPER}(...) componentContract must be "v4" (received ${JSON.stringify(
        componentContract,
      )}).`,
    );
  }
  const componentsProperty = byKey.get("components");
  if (!componentsProperty) {
    throw new Error(`${V4_RUNTIME_HELPER}(...) is missing required property "components".`);
  }

  return {
    id: readStaticString("id"),
    name: readStaticString("name"),
    packageName: readStaticString("packageName"),
    version: readStaticString("version"),
    componentContract,
    components: resolveComponentsEntries(tokens, componentsProperty),
  };
}

/* -------------------------------------------------------------------------- */
/* Command execution                                                          */
/* -------------------------------------------------------------------------- */

/** Resolve the repository package manager binary from `packageManager`. */
function packageManagerBinary(root) {
  try {
    const pkg = readJsonFile(join(root, "package.json"));
    if (typeof pkg.packageManager === "string") {
      const name = pkg.packageManager.split("@")[0].trim();
      if (name) return name;
    }
  } catch {
    // Fall through to the repository default.
  }
  return "pnpm";
}

/**
 * Run a fixed command. Arguments are always literals supplied by this module,
 * never user input. On Windows the package-manager shim (`.cmd`) is invoked
 * through the command interpreter; elsewhere it is spawned directly.
 */
function runCommand({ command, args, cwd }) {
  if (process.platform === "win32") {
    const interpreter = process.env.ComSpec ?? "cmd.exe";
    return spawnSync(interpreter, ["/d", "/s", "/c", [command, ...args].join(" ")], {
      cwd,
      encoding: "utf8",
    });
  }
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function commandHint(result) {
  const text = result.stderr || result.stdout || "";
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ? ` ${line.slice(0, 200)}` : "";
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function createReporter() {
  const failures = [];
  const checks = [];
  const fail = (message) => failures.push(message);
  const check = (name, run) => {
    const before = failures.length;
    try {
      run();
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
    checks.push({ name, ok: failures.length === before });
  };
  return { failures, checks, fail, check };
}

/**
 * Read the raw manifest entries without validation, so a V1/missing contract
 * can be reported directly instead of surfacing as a generic normalization
 * error.
 */
function readRawManifestEntries(manifestPath) {
  try {
    if (!existsSync(manifestPath)) return [];
    const raw = readJsonFile(manifestPath);
    return isPlainObject(raw) && Array.isArray(raw.designSystems) ? raw.designSystems : [];
  } catch {
    return [];
  }
}

function findUnsupportedContractEntry(manifestPath) {
  for (const entry of readRawManifestEntries(manifestPath)) {
    if (!isPlainObject(entry)) continue;
    if (entry.contract !== "v2") {
      return {
        id: typeof entry.id === "string" ? entry.id : "(unknown)",
        contract: entry.contract,
      };
    }
  }
  return null;
}

function unsupportedContractMessage(context, id, contract) {
  const shown = contract === undefined ? "(missing)" : JSON.stringify(contract);
  return (
    `Manifest entry "${id}" has contract ${shown}; V2 tooling requires contract "v2" and ` +
    `no longer supports V1. Migrate the package to the V2 contract, then set ` +
    `"contract": "v2" for "${id}" in ${displayPath(context.root, context.manifestPath)} ` +
    `(for example by re-running "pnpm ds:register ${id}").`
  );
}

function validateManifestEntry(context, fail) {
  const rawEntries = readRawManifestEntries(context.manifestPath);
  const rawTarget = rawEntries.find((entry) => isPlainObject(entry) && entry.id === context.id);

  // V4 packages dispatch to a separate, additive validation branch. The V2
  // reader cannot normalize a V4 entry yet, so the contract is read from the
  // raw registry entry and validated directly.
  if (rawTarget && rawTarget.contract === "v4") {
    context.entry = rawTarget;
    context.contract = "v4";
    context.requiredComponents = V4_REQUIRED_COMPONENTS;
    validateV4CanonicalEntry(context, fail);
    return;
  }

  let manifest;
  try {
    manifest = readManifest({ manifestPath: context.manifestPath });
  } catch (error) {
    // A registry that also holds V4 entries is not normalizable by the V2
    // reader; validate the V2 target from its raw entry instead so a mixed
    // registry does not break existing V2 systems.
    if (rawTarget && rawTarget.contract === "v2") {
      manifest = { version: 2, designSystems: rawEntries.filter(isPlainObject) };
    } else {
      const unsupported = findUnsupportedContractEntry(context.manifestPath);
      if (unsupported) {
        fail(unsupportedContractMessage(context, unsupported.id, unsupported.contract));
      } else {
        fail(`Invalid design-system manifest: ${error.message}`);
      }
      return;
    }
  }
  context.manifest = manifest;

  const entry = manifest.designSystems.find((system) => system.id === context.id);
  if (!entry) {
    fail(
      `Manifest entry missing for "${context.id}" in ${displayPath(
        context.root,
        context.manifestPath,
      )}. Run "pnpm ds:register ${context.id}" or "pnpm ds:create ${context.id}" first.`,
    );
    return;
  }
  if (entry.contract !== "v2") {
    fail(unsupportedContractMessage(context, entry.id, entry.contract));
    return;
  }
  context.entry = entry;
  context.contract = "v2";
  context.requiredComponents = V2_REQUIRED_COMPONENTS;

  const canonical = {
    packageName: context.packageName,
    packagePath: `${PACKAGE_DIRECTORY}/${context.id}`,
    uiClass: context.uiClass,
    tokensExport: context.tokensExport,
  };
  for (const [field, expected] of Object.entries(canonical)) {
    if (entry[field] !== expected) {
      fail(
        `Manifest ${field} "${entry[field]}" is not canonical for "${context.id}" (expected "${expected}").`,
      );
    }
  }
}

function validatePackageMetadata(context, fail) {
  if (!context.entry) return;
  let metadata;
  try {
    metadata = readPackageMetadata({ id: context.id, root: context.root });
  } catch (error) {
    fail(`Package metadata: ${error.message}`);
    return;
  }
  context.packageDir = metadata.packageDir;
  context.packageJsonPath = join(metadata.packageDir, "package.json");
  context.prismSystem = metadata.prismSystem;
  try {
    context.pkg = readJsonFile(context.packageJsonPath);
  } catch (error) {
    fail(`Invalid package.json: ${error.message}`);
    return;
  }

  if (metadata.packageName !== context.entry.packageName) {
    fail(
      `Package name "${metadata.packageName}" does not match manifest "${context.entry.packageName}".`,
    );
  }
  const actualPath = toPosix(relative(context.root, metadata.packageDir));
  if (actualPath !== context.entry.packagePath) {
    fail(`Package path "${actualPath}" does not match manifest "${context.entry.packagePath}".`);
  }
  if (metadata.version !== context.entry.version) {
    fail(
      `Registry version "${context.entry.version}" does not match package.json version ` +
        `"${metadata.version}"; package.json.version is authoritative. Re-run ` +
        `"pnpm ds:register ${context.id}" to synchronize the registry.`,
    );
  }
}

function validateRequiredFiles(context, fail) {
  if (!context.packageDir) return;
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(context.packageDir, file))) fail(`Missing required file: ${file}`);
  }
  if (!firstExisting(COMPONENT_MODULE_CANDIDATES.map((file) => join(context.packageDir, file)))) {
    fail(`Missing required file: ${COMPONENT_MODULE_CANDIDATES[0]}`);
  }
  // The normalized design brief is a required V2 artifact for every package.
  if (!existsSync(join(context.packageDir, "design-brief.json"))) {
    fail("Missing required file: design-brief.json");
  }
}

function validateNamingAndExports(context, fail) {
  if (!context.pkg) return;
  const exportsField = context.pkg.exports;
  if (!isPlainObject(exportsField)) {
    fail('package.json is missing an "exports" map.');
    return;
  }
  for (const key of [".", "./styles.css", "./tokens", MANIFEST_EXPORT_SUBPATH]) {
    if (!(key in exportsField)) fail(`package.json exports is missing "${key}".`);
  }
  if (exportsField[MANIFEST_EXPORT_SUBPATH] !== MANIFEST_EXPORT_TARGET) {
    fail(
      `package.json exports["${MANIFEST_EXPORT_SUBPATH}"] must be exactly ` +
        `${JSON.stringify(MANIFEST_EXPORT_TARGET)} (received ${JSON.stringify(
          exportsField[MANIFEST_EXPORT_SUBPATH] ?? null,
        )}).`,
    );
  }
}

/** The published tarball must include the shipped manifest, docs, and license. */
function validatePackageFilesField(context, fail) {
  if (!context.pkg) return;
  const missing = missingRequiredPackageFiles(context.pkg);
  if (missing.length > 0) {
    fail(`package.json "files" is missing required entries: ${missing.join(", ")}.`);
  }
}

function validateContractMetadata(context, fail) {
  if (!context.packageDir) return;
  const metadata = context.prismSystem;

  if (!metadata) {
    fail('V2 package is missing the "prismSystem" block in package.json.');
  } else {
    if (metadata.contract !== "v2") {
      fail(
        `V2 package "prismSystem.contract" is ${JSON.stringify(
          metadata.contract ?? null,
        )} but must be "v2". V1 is no longer supported.`,
      );
    }
    if (metadata.uiClass !== context.entry.uiClass) {
      fail(
        `V2 package "prismSystem.uiClass" "${metadata.uiClass ?? "(missing)"}" does not match manifest "${context.entry.uiClass}".`,
      );
    }
    if (metadata.tokensExport !== context.entry.tokensExport) {
      fail(
        `V2 package "prismSystem.tokensExport" "${metadata.tokensExport ?? "(missing)"}" does not match manifest "${context.entry.tokensExport}".`,
      );
    }
    if (metadata.name !== context.entry.name) {
      fail(
        `V2 package "prismSystem.name" "${metadata.name ?? "(missing)"}" does not match manifest "${context.entry.name}".`,
      );
    }
  }

  const indexPath = join(context.packageDir, "src/index.ts");
  if (!existsSync(indexPath)) return;
  const source = readFileSync(indexPath, "utf8");
  if (!source.includes("defineDesignSystemV2")) {
    fail("V2 package src/index.ts must use defineDesignSystemV2.");
  }
  if (!/componentContract\s*:\s*["']v2["']/.test(source)) {
    fail('V2 package src/index.ts must declare componentContract: "v2".');
  }
}

/** Keys of the object literal passed to `Object.assign` for a compound root. */
function readCompoundMembers(source, component) {
  const body = extractObjectBody(source, `export const ${component} = Object.assign`);
  if (body === null) return null;
  return topLevelKeys(body);
}

/**
 * Validate the generated `design-system.json` against a fresh build, and check
 * that the explicitly declared compound members match the package's actual
 * public API (the `Object.assign` static members). Variants and sizes are
 * declared metadata and are never inferred from CSS or source regexes.
 */
function validateGeneratedManifest(context, fail) {
  if (!context.packageDir) return;
  const result = checkDesignSystemManifest({ id: context.id, packageDir: context.packageDir });
  context.designSystemManifest = readDesignSystemManifest(context.packageDir);
  if (!result.ok) {
    for (const failure of result.failures) fail(failure);
    return;
  }

  const componentsPath = firstExisting(
    COMPONENT_MODULE_CANDIDATES.map((file) => join(context.packageDir, file)),
  );
  if (!componentsPath) return;
  const source = readFileSync(componentsPath, "utf8");
  const declaredComponents = result.actual?.components ?? {};
  for (const component of COMPOUND_COMPONENTS) {
    const declared = declaredComponents[component]?.members ?? [];
    const actual = readCompoundMembers(source, component);
    if (actual === null) {
      fail(
        `Cannot read compound members for "${component}" from ${displayPath(
          context.root,
          componentsPath,
        )}; expected "export const ${component} = Object.assign".`,
      );
      continue;
    }
    const missing = declared.filter((member) => !actual.includes(member));
    const extra = actual.filter((member) => !declared.includes(member));
    if (missing.length > 0 || extra.length > 0) {
      fail(
        `Compound members for "${component}" in ${DESIGN_SYSTEM_SOURCE_FILENAME} do not match the ` +
          `package API.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}${
            extra.length > 0 ? ` Undeclared: ${extra.join(", ")}.` : ""
          }`,
      );
    }
  }
}

/**
 * Enforce version equality. `package.json.version` is authoritative: the
 * generated manifest, the runtime `DesignSystem.version`, and the registry
 * entry must all match it.
 */
function validateVersionConsistency(context, fail) {
  if (!context.pkg) return;
  const version = context.pkg.version;
  if (typeof version !== "string" || version.trim().length === 0) {
    fail('package.json is missing a non-empty "version".');
    return;
  }
  const manifest = context.designSystemManifest;
  if (manifest && manifest.version !== version) {
    fail(
      `Generated manifest version "${manifest.version}" does not match package.json version ` +
        `"${version}". Regenerate with "pnpm ds:manifest ${context.id} --write".`,
    );
  }
  const indexPath = join(context.packageDir, "src/index.ts");
  if (!existsSync(indexPath)) return;
  let runtime;
  try {
    runtime = readRuntimeDesignSystemVersion(readFileSync(indexPath, "utf8"));
  } catch (error) {
    fail(`Runtime version: ${error.message}`);
    return;
  }
  if (runtime !== version) {
    fail(
      `Runtime DesignSystem.version "${runtime}" does not match package.json version "${version}". ` +
        `package.json.version is authoritative.`,
    );
  }
}

function validateComponentExports(context, fail) {
  if (!context.packageDir) return;
  const componentsPath = firstExisting(
    COMPONENT_MODULE_CANDIDATES.map((file) => join(context.packageDir, file)),
  );
  if (!componentsPath) return;

  const componentExports = collectExports(readFileSync(componentsPath, "utf8"));
  for (const name of context.requiredComponents) {
    if (!componentExports.names.has(name)) fail(`Missing required component: ${name}`);
  }

  const indexPath = join(context.packageDir, "src/index.ts");
  if (!existsSync(indexPath)) return;
  const indexExports = collectExports(readFileSync(indexPath, "utf8"));
  const target = withoutExtension(componentsPath);
  const reexportsComponents = indexExports.starReexports.some(
    (specifier) => withoutExtension(resolve(dirname(indexPath), specifier)) === target,
  );
  if (reexportsComponents) return;
  for (const name of context.requiredComponents) {
    if (!indexExports.names.has(name)) {
      fail(`Package public exports are missing required component: ${name}`);
    }
  }
}

function validateTokensAndTheme(context, fail) {
  if (!context.packageDir) return;

  const tokensPath = join(context.packageDir, "src/tokens/index.ts");
  if (existsSync(tokensPath)) {
    const source = readFileSync(tokensPath, "utf8");
    const exportPattern = new RegExp(`export\\s+const\\s+${escapeRegExp(context.tokensExport)}\\b`);
    if (!exportPattern.test(source)) {
      fail(`Token module does not export "${context.tokensExport}".`);
    } else {
      const body = extractObjectBody(source, `export const ${context.tokensExport}`);
      if (body === null) {
        fail(`Token export "${context.tokensExport}" must be an object literal.`);
      } else {
        const keys = topLevelKeys(body);
        for (const group of REQUIRED_TOKEN_GROUPS) {
          if (!keys.includes(group)) {
            fail(`Token export "${context.tokensExport}" is missing the "${group}" group.`);
          }
        }
      }
    }
  }

  const stylesPath = join(context.packageDir, "src/styles/index.css");
  if (existsSync(stylesPath)) {
    const css = readFileSync(stylesPath, "utf8");
    if (!css.includes(`.${context.uiClass}`)) {
      fail(`Stylesheet does not scope rules under ".${context.uiClass}".`);
    }
  }

  const componentsPath = firstExisting(
    COMPONENT_MODULE_CANDIDATES.map((file) => join(context.packageDir, file)),
  );
  if (componentsPath) {
    const source = readFileSync(componentsPath, "utf8");
    if (!source.includes(context.uiClass)) {
      fail(`Components do not apply the scoped UI class "${context.uiClass}".`);
    }
  }
}

function validatePackageBoundaries(context, fail) {
  if (!context.packageDir) return;
  const srcDir = join(context.packageDir, "src");
  if (!existsSync(srcDir)) return;

  const sourceFiles = walkFiles(srcDir).filter((file) => /\.(?:ts|tsx|css|mjs|js)$/.test(file));
  for (const file of sourceFiles) {
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith("@prism-system/ui-system-") && specifier !== context.packageName) {
        fail(`Cross-package import "${specifier}" in ${displayPath(context.root, file)}.`);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const resolved = relative(context.packageDir, resolve(dirname(file), specifier));
      if (resolved.startsWith("..") || isAbsolute(resolved)) {
        fail(
          `Relative import escapes the package: "${specifier}" in ${displayPath(context.root, file)}.`,
        );
      }
    }
  }
}

function validateDesignBrief(context, fail) {
  if (!context.packageDir) return;
  const briefPath = join(context.packageDir, "design-brief.json");
  if (!existsSync(briefPath)) return;
  let brief;
  try {
    brief = readJsonFile(briefPath);
  } catch (error) {
    fail(`Invalid design-brief.json: ${error.message}`);
    return;
  }
  if (!isPlainObject(brief)) fail("design-brief.json must be a JSON object.");
}

function validateDocumentation(context, fail) {
  if (!context.packageDir) return;

  const readmePath = join(context.packageDir, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    if (readme.trim().length === 0) fail("README.md is empty.");
    if (!readme.includes(context.packageName)) {
      fail(`README.md does not mention the package name "${context.packageName}".`);
    }
    const missing = context.requiredComponents.filter(
      (name) => !new RegExp(`\\b${escapeRegExp(name)}\\b`).test(readme),
    );
    if (missing.length > 0) {
      fail(`README.md does not list required component(s): ${missing.join(", ")}.`);
    }
    if (!/installation|pnpm add/i.test(readme)) {
      fail("README.md is missing installation guidance.");
    }
    if (!/design brief|visual direction/i.test(readme)) {
      fail("README.md is missing the design brief / visual direction.");
    }
  }

  const agentsPath = join(context.packageDir, "AGENTS.md");
  if (existsSync(agentsPath)) {
    const agents = readFileSync(agentsPath, "utf8");
    if (agents.trim().length === 0) fail("AGENTS.md is empty.");
    if (!agents.includes(context.packageName) && !agents.includes(context.entry.name)) {
      fail(`AGENTS.md does not mention "${context.entry.name}" or "${context.packageName}".`);
    }
    const missing = context.requiredComponents.filter(
      (name) => !new RegExp(`\\b${escapeRegExp(name)}\\b`).test(agents),
    );
    if (missing.length > 0) {
      fail(`AGENTS.md does not list required component(s): ${missing.join(", ")}.`);
    }
    if (!/extension|extend|additive/i.test(agents)) {
      fail("AGENTS.md is missing extension guidance.");
    }
    if (!/visual direction|design brief/i.test(agents)) {
      fail("AGENTS.md is missing the visual direction.");
    }
  }
}

function validateApp(context, appName, fail) {
  const appDir = join(context.root, "apps", appName);
  if (!existsSync(appDir)) {
    fail(
      `App integration: "${appName}" app is missing at ${displayPath(
        context.root,
        appDir,
      )}; cannot verify compatibility in an isolated root.`,
    );
    return;
  }

  const registryPath = join(appDir, "app", "registry.ts");
  const layoutPath = join(appDir, "app", "layout.tsx");
  const packageJsonPath = join(appDir, "package.json");
  const nextConfigPath = join(appDir, "next.config.mjs");

  for (const [label, file] of [
    ["registry", registryPath],
    ["layout", layoutPath],
    ["package.json", packageJsonPath],
    ["next.config.mjs", nextConfigPath],
  ]) {
    if (!existsSync(file)) {
      fail(`App integration: ${appName} ${label} not found at ${displayPath(context.root, file)}.`);
    }
  }

  if (existsSync(registryPath)) {
    const source = readFileSync(registryPath, "utf8");
    if (!source.includes(context.packageName)) {
      fail(`App integration: ${appName} registry does not import "${context.packageName}".`);
    }
    if (!source.includes(context.entry.tokensExport)) {
      fail(
        `App integration: ${appName} registry does not reference token export "${context.entry.tokensExport}".`,
      );
    }
    if (!source.includes(context.entry.uiClass)) {
      fail(
        `App integration: ${appName} registry does not use ui class "${context.entry.uiClass}".`,
      );
    }
  }

  if (existsSync(layoutPath)) {
    const source = readFileSync(layoutPath, "utf8");
    if (!source.includes(`${context.packageName}/styles.css`)) {
      fail(
        `App integration: ${appName} layout does not import "${context.packageName}/styles.css".`,
      );
    }
  }

  if (existsSync(packageJsonPath)) {
    let appPkg;
    try {
      appPkg = readJsonFile(packageJsonPath);
    } catch (error) {
      fail(
        `App integration: invalid ${displayPath(context.root, packageJsonPath)}: ${error.message}`,
      );
    }
    if (appPkg) {
      const dependencies = { ...appPkg.dependencies, ...appPkg.devDependencies };
      if (!(context.packageName in dependencies)) {
        fail(
          `App integration: ${appName} package.json is missing dependency "${context.packageName}".`,
        );
      }
    }
  }

  if (existsSync(nextConfigPath)) {
    const source = readFileSync(nextConfigPath, "utf8");
    if (!source.includes(context.packageName)) {
      fail(
        `App integration: ${appName} next.config.mjs is missing "${context.packageName}" in transpilePackages.`,
      );
    }
  }
}

function runPackageCommands(context, binary, fail) {
  if (!context.packageDir || !context.pkg) return;
  const scripts = context.pkg.scripts ?? {};
  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    if (typeof scripts[script] !== "string") {
      fail(`Package is missing the "${script}" script in package.json.`);
      continue;
    }
    const result = runCommand({
      command: binary,
      args: ["--filter", context.packageName, script],
      cwd: context.root,
    });
    if (result.error) {
      fail(`Package ${script} could not start: ${result.error.message}`);
    } else if (result.status !== 0) {
      fail(`Package ${script} failed (exit ${result.status ?? "unknown"}).${commandHint(result)}`);
    }
  }
}

function appCommandScript(scripts) {
  return ["typecheck", "lint", "build"].find((name) => typeof scripts[name] === "string");
}

function runAppCommands(context, binary, fail) {
  for (const appName of APP_NAMES) {
    const packageJsonPath = join(context.root, "apps", appName, "package.json");
    if (!existsSync(packageJsonPath)) continue;
    let appPkg;
    try {
      appPkg = readJsonFile(packageJsonPath);
    } catch {
      continue;
    }
    const script = appCommandScript(appPkg.scripts ?? {});
    if (!script || typeof appPkg.name !== "string") {
      fail(`App integration: ${appName} has no typecheck/lint/build script to run.`);
      continue;
    }
    const result = runCommand({
      command: binary,
      args: ["--filter", appPkg.name, script],
      cwd: context.root,
    });
    if (result.error) {
      fail(`App ${appName} ${script} could not start: ${result.error.message}`);
    } else if (result.status !== 0) {
      fail(
        `App ${appName} ${script} failed (exit ${result.status ?? "unknown"}).${commandHint(result)}`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* V4 validation                                                              */
/* -------------------------------------------------------------------------- */

/** Validate the canonical identity fields of a raw V4 registry entry. */
function validateV4CanonicalEntry(context, fail) {
  const entry = context.entry;
  const canonical = {
    packageName: context.packageName,
    packagePath: `${PACKAGE_DIRECTORY}/${context.id}`,
    uiClass: context.uiClass,
    tokensExport: context.tokensExport,
  };
  for (const [field, expected] of Object.entries(canonical)) {
    if (entry[field] !== expected) {
      fail(
        `Manifest ${field} "${entry[field]}" is not canonical for "${context.id}" (expected "${expected}").`,
      );
    }
  }
  if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
    fail(`Manifest entry "${context.id}" is missing a non-empty "name".`);
  }
}

/** Required files for the V4 per-component folder layout. */
function validateV4RequiredFiles(context, fail) {
  if (!context.packageDir) return;
  for (const file of V4_REQUIRED_FILES) {
    if (!existsSync(join(context.packageDir, file))) fail(`Missing required file: ${file}`);
  }
}

/** Required V4 public export subpaths. */
function validateV4NamingAndExports(context, fail) {
  if (!context.pkg) return;
  const exportsField = context.pkg.exports;
  if (!isPlainObject(exportsField)) {
    fail('package.json is missing an "exports" map.');
    return;
  }
  for (const key of V4_REQUIRED_EXPORTS) {
    if (!(key in exportsField)) fail(`package.json exports is missing "${key}".`);
  }
  if (exportsField[MANIFEST_EXPORT_SUBPATH] !== MANIFEST_EXPORT_TARGET) {
    fail(
      `package.json exports["${MANIFEST_EXPORT_SUBPATH}"] must be exactly ` +
        `${JSON.stringify(MANIFEST_EXPORT_TARGET)} (received ${JSON.stringify(
          exportsField[MANIFEST_EXPORT_SUBPATH] ?? null,
        )}).`,
    );
  }
  for (const [subpath, expected] of [
    ["./styles.css", V4_STYLES_EXPORT_TARGET],
    ["./tailwind.css", V4_TAILWIND_EXPORT_TARGET],
    ["./tokens", V4_TOKENS_EXPORT_TARGET],
  ]) {
    // A missing subpath is already reported above; only validate the target.
    if (!(subpath in exportsField)) continue;
    const actual = exportsField[subpath];
    if (!sameExportTarget(actual, expected)) {
      fail(
        `package.json exports["${subpath}"] must be exactly ${JSON.stringify(expected)} ` +
          `(received ${JSON.stringify(actual ?? null)}).`,
      );
    }
  }
}

/** The package-owned `prismSystem` block must be a complete V4 block. */
function validateV4ContractMetadata(context, fail) {
  if (!context.packageDir) return;
  const metadata = context.prismSystem;
  if (!metadata) {
    fail('V4 package is missing the "prismSystem" block in package.json.');
    return;
  }
  if (metadata.contract !== "v4") {
    fail(
      `V4 package "prismSystem.contract" is ${JSON.stringify(
        metadata.contract ?? null,
      )} but must be "v4".`,
    );
  }
  if (metadata.uiClass !== context.entry.uiClass) {
    fail(
      `V4 package "prismSystem.uiClass" "${metadata.uiClass ?? "(missing)"}" does not match manifest "${context.entry.uiClass}".`,
    );
  }
  if (metadata.tokensExport !== context.entry.tokensExport) {
    fail(
      `V4 package "prismSystem.tokensExport" "${metadata.tokensExport ?? "(missing)"}" does not match manifest "${context.entry.tokensExport}".`,
    );
  }
  if (metadata.name !== context.entry.name) {
    fail(
      `V4 package "prismSystem.name" "${metadata.name ?? "(missing)"}" does not match manifest "${context.entry.name}".`,
    );
  }
}

/**
 * Validate the generated V4 manifest against a fresh build from the package's
 * source descriptor and `package.json` version. Token artifact drift/missing
 * checks are owned by `checkDesignSystemManifest`; this only calls it.
 */
function validateV4GeneratedManifest(context, fail) {
  if (!context.packageDir) return;
  const result = checkDesignSystemManifest({ id: context.id, packageDir: context.packageDir });
  context.designSystemManifest = readDesignSystemManifest(context.packageDir);
  if (!result.ok) {
    for (const failure of result.failures) fail(failure);
    return;
  }
  try {
    context.descriptor = readSourceDescriptor(context.packageDir);
    context.declaredComponents = Object.keys(context.descriptor.components);
  } catch (error) {
    fail(`V4 source descriptor: ${error.message}`);
  }
}

/** Enforce V4 version equality across package, manifest, and runtime. */
function validateV4VersionConsistency(context, fail) {
  if (!context.pkg) return;
  const version = context.pkg.version;
  if (typeof version !== "string" || version.trim().length === 0) {
    fail('package.json is missing a non-empty "version".');
    return;
  }
  const manifest = context.designSystemManifest;
  if (manifest && manifest.version !== version) {
    fail(
      `Generated manifest version "${manifest.version}" does not match package.json version ` +
        `"${version}". Regenerate with "pnpm ds:manifest ${context.id} --write".`,
    );
  }
  const runtimePath = join(context.packageDir, "src/design-system.ts");
  if (!existsSync(runtimePath)) return;
  let runtime;
  try {
    runtime = parseV4RuntimeSource(readFileSync(runtimePath, "utf8"));
  } catch (error) {
    fail(`Runtime version: ${error.message}`);
    return;
  }
  context.runtime = runtime;
  if (runtime.version !== version) {
    fail(
      `Runtime DesignSystem.version "${runtime.version}" does not match package.json version ` +
        `"${version}". package.json.version is authoritative.`,
    );
  }
}

/**
 * Every declared component must have its own kebab-case folder with a TSX
 * module, a scoped stylesheet, and a barrel; the legacy monolithic module is
 * rejected.
 */
function validateV4ComponentFolders(context, fail) {
  if (!context.packageDir || !context.descriptor) return;
  const componentsDir = join(context.packageDir, "src", "components");
  if (existsSync(join(context.packageDir, V4_LEGACY_COMPONENTS_MODULE))) {
    fail(
      `${V4_LEGACY_COMPONENTS_MODULE} (legacy monolithic component module) is not allowed; ` +
        `each component must live in its own src/components/<component>/ folder.`,
    );
  }
  for (const name of context.declaredComponents) {
    const kebab = toKebabCase(name);
    const folder = join(componentsDir, kebab);
    const tsxPath = join(folder, `${name}.tsx`);
    const cssPath = join(folder, `${kebab}.css`);
    const indexPath = join(folder, "index.ts");
    if (!existsSync(folder)) {
      fail(`Missing component folder: src/components/${kebab}/.`);
      continue;
    }
    if (!existsSync(tsxPath)) {
      fail(`Missing component module: src/components/${kebab}/${name}.tsx.`);
    } else if (!readFileSync(tsxPath, "utf8").includes(context.systemClass)) {
      fail(
        `Component module src/components/${kebab}/${name}.tsx does not reference the system ` +
          `class "${context.systemClass}".`,
      );
    }
    if (!existsSync(cssPath)) {
      fail(`Missing component stylesheet: src/components/${kebab}/${kebab}.css.`);
    }
    if (!existsSync(indexPath)) {
      fail(`Missing component barrel: src/components/${kebab}/index.ts.`);
    } else {
      const names = collectExports(readFileSync(indexPath, "utf8")).names;
      if (!names.has(name)) {
        fail(`src/components/${kebab}/index.ts does not export "${name}".`);
      }
    }
    if (existsSync(cssPath)) {
      const css = readFileSync(cssPath, "utf8");
      if (!css.includes(`.${context.uiClass}`)) {
        fail(
          `Component stylesheet src/components/${kebab}/${kebab}.css is not scoped under ` +
            `".${context.uiClass}".`,
        );
      }
    }
  }
}

/**
 * The public component barrel must export every declared component and no
 * undeclared V4 component. Star re-exports into component folders are resolved.
 */
function validateV4ComponentBarrel(context, fail) {
  if (!context.packageDir || !context.descriptor) return;
  const barrelPath = join(context.packageDir, "src", "components", "index.ts");
  if (!existsSync(barrelPath)) return;
  const collected = collectExports(readFileSync(barrelPath, "utf8"));
  const names = new Set(collected.names);
  for (const specifier of collected.starReexports) {
    if (!specifier.startsWith(".")) continue;
    const base = resolve(dirname(barrelPath), specifier);
    for (const candidate of [
      `${base}.ts`,
      `${base}.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
    ]) {
      if (existsSync(candidate)) {
        for (const name of collectExports(readFileSync(candidate, "utf8")).names) names.add(name);
        break;
      }
    }
  }
  context.barrelExports = names;

  const declared = context.declaredComponents;
  const missing = declared.filter((name) => !names.has(name));
  if (missing.length > 0) {
    fail(`src/components/index.ts is missing declared component exports: ${missing.join(", ")}.`);
  }
  const undeclared = [...names].filter(
    (name) => V4_COMPONENT_NAMES.includes(name) && !declared.includes(name),
  );
  if (undeclared.length > 0) {
    fail(`src/components/index.ts exports undeclared V4 component(s): ${undeclared.join(", ")}.`);
  }
}

/**
 * Declared compound members must match the component's static compound exports
 * (`Object.assign`) without CSS or source-regex inference beyond that module.
 */
function validateV4CompoundMembers(context, fail) {
  if (!context.packageDir || !context.descriptor) return;
  for (const name of context.declaredComponents) {
    const declared = context.descriptor.components[name]?.members ?? [];
    const kebab = toKebabCase(name);
    const candidates = [
      join(context.packageDir, "src", "components", kebab, `${name}.tsx`),
      join(context.packageDir, "src", "components", kebab, "index.ts"),
    ];
    let actual = null;
    let usedPath = null;
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      const members = readCompoundMemberNames(readFileSync(candidate, "utf8"), name);
      if (members !== null) {
        actual = members;
        usedPath = candidate;
        break;
      }
    }
    if (declared.length === 0) {
      if (actual && actual.length > 0) {
        fail(
          `Component "${name}" declares no members in ${DESIGN_SYSTEM_SOURCE_FILENAME} but ` +
            `${displayPath(context.root, usedPath)} attaches: ${actual.join(", ")}.`,
        );
      }
      continue;
    }
    if (actual === null) {
      fail(
        `Cannot read compound members for "${name}" from src/components/${kebab}/; expected ` +
          `"export const ${name} = Object.assign".`,
      );
      continue;
    }
    const missing = declared.filter((member) => !actual.includes(member));
    const extra = actual.filter((member) => !declared.includes(member));
    if (missing.length > 0 || extra.length > 0) {
      fail(
        `Compound members for "${name}" in ${DESIGN_SYSTEM_SOURCE_FILENAME} do not match the ` +
          `package API.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}${
            extra.length > 0 ? ` Undeclared: ${extra.join(", ")}.` : ""
          }`,
      );
    }
  }
}

/**
 * `src/styles/index.css` must import the generated `tokens.css` and exactly the
 * declared component stylesheets, in canonical descriptor order.
 */
function validateV4Stylesheet(context, fail) {
  if (!context.packageDir || !context.descriptor) return;
  const stylesPath = join(context.packageDir, "src", "styles", "index.css");
  if (!existsSync(stylesPath)) return;
  const stylesDir = dirname(stylesPath);
  const specifiers = matches(CSS_IMPORT_PATTERN, readFileSync(stylesPath, "utf8"));
  const resolved = specifiers.map((specifier) =>
    toPosix(relative(stylesDir, resolve(stylesDir, specifier))),
  );

  if (!resolved.includes("tokens.css")) {
    fail('src/styles/index.css must import the generated "./tokens.css".');
  }

  const expectedComponents = context.declaredComponents.map(
    (name) => `../components/${toKebabCase(name)}/${toKebabCase(name)}.css`,
  );
  const actualComponents = resolved.filter((specifier) => specifier.startsWith("../components/"));
  if (JSON.stringify(actualComponents) !== JSON.stringify(expectedComponents)) {
    const missing = expectedComponents.filter((specifier) => !actualComponents.includes(specifier));
    const extra = actualComponents.filter((specifier) => !expectedComponents.includes(specifier));
    let message =
      "src/styles/index.css must import exactly the declared component stylesheets in canonical order.";
    if (missing.length > 0) message += ` Missing: ${missing.join(", ")}.`;
    if (extra.length > 0) message += ` Undeclared: ${extra.join(", ")}.`;
    if (missing.length === 0 && extra.length === 0) {
      message += ` Received order: ${actualComponents.join(", ")}.`;
    }
    fail(message);
  }
}

/**
 * True when `src/index.ts` actually re-exports the runtime `DesignSystem`
 * symbol: declared directly, re-exported by name from the package-owned
 * `./design-system` module, or star re-exported from that module when the module
 * exports the symbol. A side-effect import, an unrelated specifier, or a
 * re-export of a different symbol does not satisfy the check.
 */
function reexportsRuntimeDesignSystem(indexPath, source) {
  if (matches(EXPORT_DECL_PATTERN, source).includes(V4_RUNTIME_EXPORT)) return true;

  const runtimeBase = withoutExtension(join(dirname(indexPath), "design-system"));
  const resolvesToRuntime = (specifier) =>
    specifier.startsWith(".") &&
    withoutExtension(resolve(dirname(indexPath), specifier)) === runtimeBase;

  const namedReexport = /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let match = namedReexport.exec(source);
  while (match !== null) {
    const exported = match[1].split(",").map((entry) =>
      entry
        .trim()
        .split(/\s+as\s+/)[0]
        .trim(),
    );
    if (exported.includes(V4_RUNTIME_EXPORT) && resolvesToRuntime(match[2])) return true;
    match = namedReexport.exec(source);
  }

  const runtimePath = join(dirname(indexPath), "design-system.ts");
  const runtimeSource = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : null;
  for (const specifier of matches(EXPORT_STAR_PATTERN, source)) {
    if (!resolvesToRuntime(specifier)) continue;
    if (runtimeSource !== null && collectExports(runtimeSource).names.has(V4_RUNTIME_EXPORT)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate `src/design-system.ts` identity, version, V4 marker, component map,
 * and named exports against the descriptor and package metadata, and that
 * `src/index.ts` exposes the runtime system and imports the package stylesheet.
 */
function validateV4RuntimeDesignSystem(context, fail) {
  if (!context.packageDir) return;
  const runtimePath = join(context.packageDir, "src", "design-system.ts");
  if (!existsSync(runtimePath)) return;

  let runtime = context.runtime;
  if (!runtime) {
    try {
      runtime = parseV4RuntimeSource(readFileSync(runtimePath, "utf8"));
    } catch (error) {
      fail(`src/design-system.ts: ${error.message}`);
      return;
    }
  }

  if (runtime.id !== context.id) {
    fail(`src/design-system.ts id "${runtime.id}" does not match "${context.id}".`);
  }
  if (runtime.packageName !== context.packageName) {
    fail(
      `src/design-system.ts packageName "${runtime.packageName}" does not match "${context.packageName}".`,
    );
  }
  if (context.pkg && runtime.version !== context.pkg.version) {
    fail(
      `src/design-system.ts version "${runtime.version}" does not match package.json version "${context.pkg.version}".`,
    );
  }
  if (context.entry && runtime.name !== context.entry.name) {
    fail(
      `src/design-system.ts name "${runtime.name}" does not match registry name "${context.entry.name}".`,
    );
  }

  const runtimeExports = collectExports(readFileSync(runtimePath, "utf8")).names;
  if (!runtimeExports.has(V4_RUNTIME_EXPORT)) {
    fail(`src/design-system.ts must export a named "${V4_RUNTIME_EXPORT}".`);
  }

  if (context.descriptor) {
    const declared = context.declaredComponents;
    const runtimeKeys = runtime.components.map((entry) => entry.key);
    const runtimeSet = new Set(runtimeKeys);
    const missing = declared.filter((name) => !runtimeSet.has(name));
    const extra = runtimeKeys.filter((name) => !declared.includes(name));
    if (missing.length > 0 || extra.length > 0) {
      fail(
        `src/design-system.ts component map does not match ${DESIGN_SYSTEM_SOURCE_FILENAME}.` +
          `${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}${
            extra.length > 0 ? ` Undeclared: ${extra.join(", ")}.` : ""
          }`,
      );
    }
    if (context.barrelExports) {
      for (const entry of runtime.components) {
        if (entry.ident !== entry.key && !context.barrelExports.has(entry.ident)) {
          fail(
            `src/design-system.ts component map entry "${entry.key}" references "${entry.ident}", ` +
              `which is not exported by src/components/index.ts.`,
          );
        }
      }
    }
  }

  const indexPath = join(context.packageDir, "src/index.ts");
  if (existsSync(indexPath)) {
    const indexSource = readFileSync(indexPath, "utf8");
    if (!reexportsRuntimeDesignSystem(indexPath, indexSource)) {
      fail(
        `src/index.ts must re-export the runtime "${V4_RUNTIME_EXPORT}" symbol from ` +
          `"./design-system.js".`,
      );
    }
    const indexSpecifiers = importSpecifiers(indexSource);
    if (!indexSpecifiers.some((specifier) => specifier.includes("styles/index.css"))) {
      fail('src/index.ts must import "./styles/index.css".');
    }
  }
}

/** Lightweight V4 documentation presence check. */
function validateV4Documentation(context, fail) {
  if (!context.packageDir) return;
  const readmePath = join(context.packageDir, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    if (readme.trim().length === 0) fail("README.md is empty.");
    else if (!readme.includes(context.packageName)) {
      fail(`README.md does not mention the package name "${context.packageName}".`);
    }
  }
  const agentsPath = join(context.packageDir, "AGENTS.md");
  if (existsSync(agentsPath)) {
    const agents = readFileSync(agentsPath, "utf8");
    if (agents.trim().length === 0) fail("AGENTS.md is empty.");
    else if (
      !agents.includes(context.packageName) &&
      !agents.includes(context.entry?.name ?? context.id)
    ) {
      fail(
        `AGENTS.md does not mention "${context.entry?.name ?? context.id}" or "${context.packageName}".`,
      );
    }
  }
  const licensePath = join(context.packageDir, "LICENSE");
  if (existsSync(licensePath) && readFileSync(licensePath, "utf8").trim().length === 0) {
    fail("LICENSE is empty.");
  }
}

/**
 * Validate one registered design system.
 *
 * @param {object} options
 * @param {string} options.id            Lower-kebab-case system id.
 * @param {string} [options.root]        Root holding packages/, config/, and apps/ (defaults to repo root).
 * @param {boolean} [options.runCommands] Run package/app scripts (default true).
 * @returns {{ id: string, ok: boolean, failures: string[], checks: { name: string, ok: boolean }[] }}
 */
export function validateDesignSystem(options = {}) {
  const { failures, checks, fail, check } = createReporter();
  const root = resolve(options.root ?? repoRoot());
  const runCommands = options.runCommands ?? true;

  let id;
  try {
    id = assertSystemId(options.id);
  } catch (error) {
    fail(error.message);
    return { id: options.id, ok: false, failures, checks };
  }

  const context = {
    id,
    root,
    manifestPath: join(root, MANIFEST_RELATIVE_PATH),
    manifest: null,
    entry: null,
    contract: null,
    requiredComponents: null,
    packageDir: null,
    packageJsonPath: null,
    pkg: null,
    prismSystem: null,
    designSystemManifest: null,
    descriptor: null,
    declaredComponents: null,
    barrelExports: null,
    runtime: null,
    packageName: toPackageName(id),
    uiClass: toUiClass(id),
    systemClass: toSystemClass(id),
    tokensExport: toTokensExport(id),
  };

  check("manifest entry", () => validateManifestEntry(context, fail));

  if (context.contract === "v4") {
    check("package metadata", () => validatePackageMetadata(context, fail));
    check("required package files", () => validateV4RequiredFiles(context, fail));
    check("package naming and exports", () => validateV4NamingAndExports(context, fail));
    check("package files field", () => validatePackageFilesField(context, fail));
    check("contract and V4 metadata", () => validateV4ContractMetadata(context, fail));
    check("generated manifest", () => validateV4GeneratedManifest(context, fail));
    check("version consistency", () => validateV4VersionConsistency(context, fail));
    check("component folders", () => validateV4ComponentFolders(context, fail));
    check("component barrel exports", () => validateV4ComponentBarrel(context, fail));
    check("compound members", () => validateV4CompoundMembers(context, fail));
    check("stylesheet entry", () => validateV4Stylesheet(context, fail));
    check("runtime design system", () => validateV4RuntimeDesignSystem(context, fail));
    check("package boundaries", () => validatePackageBoundaries(context, fail));
    check("documentation", () => validateV4Documentation(context, fail));
  } else {
    check("package metadata", () => validatePackageMetadata(context, fail));
    check("required package files", () => validateRequiredFiles(context, fail));
    check("package naming and exports", () => validateNamingAndExports(context, fail));
    check("package files field", () => validatePackageFilesField(context, fail));
    check("contract and V2 metadata", () => validateContractMetadata(context, fail));
    check("generated manifest", () => validateGeneratedManifest(context, fail));
    check("version consistency", () => validateVersionConsistency(context, fail));
    check("required component exports", () => validateComponentExports(context, fail));
    check("tokens and theme", () => validateTokensAndTheme(context, fail));
    check("package boundaries", () => validatePackageBoundaries(context, fail));
    check("design brief", () => validateDesignBrief(context, fail));
    check("documentation", () => validateDocumentation(context, fail));
    check("app registration", () => {
      if (!context.entry) return;
      for (const appName of APP_NAMES) validateApp(context, appName, fail);
    });
  }

  if (runCommands) {
    const binary = packageManagerBinary(root);
    check("package commands", () => runPackageCommands(context, binary, fail));
    check("app commands", () => runAppCommands(context, binary, fail));
  }

  const uniqueFailures = [...new Set(failures)];
  return { id, ok: uniqueFailures.length === 0, failures: uniqueFailures, checks };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

/** Render the CLI help text. */
export function helpText() {
  return [
    "Usage: pnpm ds:check <id> [options]",
    "",
    "Validate a registered design system package, its generated design-system.json",
    "manifest and version consistency, its docs and tokens, and its Showcase /",
    "Reference App integration. Never mutates the manifest or package.",
    "",
    "Arguments:",
    "  <id>                  Lower-kebab-case system id (e.g. pulse).",
    "",
    "Options:",
    "  --root <path>         Root holding packages/, config/, and apps/ (default: repo root).",
    "  --no-commands         Skip typecheck/lint/build and app script runs.",
    "  -h, --help            Show this help.",
    "",
    "Exit code is non-zero when any check fails.",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { id: undefined, root: undefined, noCommands: false, help: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-commands") {
      options.noCommands = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      let value;
      if (equals !== -1) {
        value = arg.slice(equals + 1);
      } else {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (key === "root") options.root = value;
      else throw new Error(`Unknown option: --${key}`);
      continue;
    }
    positionals.push(arg);
  }
  if (positionals.length > 1) {
    throw new Error(`Expected a single <id>, received: ${positionals.join(", ")}.`);
  }
  options.id = positionals[0];
  return options;
}

function reportResult(result) {
  if (result.ok) {
    process.stdout.write(`Design System validation passed: ${result.id}\n`);
    for (const check of result.checks) process.stdout.write(`  ✓ ${check.name}\n`);
    process.stdout.write(`  ${result.checks.length} check(s) passed.\n`);
    return;
  }
  process.stdout.write("Design System validation failed\n\n");
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write(`\n${result.failures.length} issue(s) found.\n`);
  process.exitCode = 1;
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (!options.id) {
    process.stderr.write(`Missing required <id>.\n\n${helpText()}`);
    process.exitCode = 1;
    return;
  }

  try {
    reportResult(
      validateDesignSystem({
        id: options.id,
        root: options.root,
        runCommands: !options.noCommands,
      }),
    );
  } catch (error) {
    process.stdout.write(`Design System validation failed\n\n  ${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
