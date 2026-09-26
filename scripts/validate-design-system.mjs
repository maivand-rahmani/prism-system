#!/usr/bin/env node
/**
 * Deterministic validation for a registered design-system package.
 *
 * This module is both a reusable library (imported by release tooling) and a
 * CLI (`pnpm ds:check <id>`). It never mutates the manifest or the package.
 *
 * `validateDesignSystem({ id, root, runCommands })` returns a structured result
 * of the form `{ id, ok, failures, checks }`. Every check aggregates, so a
 * single run reports as many independent issues as it can detect.
 *
 * There is exactly one current contract. Validation covers the per-component
 * folder layout, token artifacts, stylesheet entry, and the runtime
 * `src/design-system.ts` call, plus the shared foundation checks: the generated
 * `design-system.json` must match a fresh build from the package-owned
 * `design-system.source.json`, its declared compound members must match the
 * actual public API, and `package.json.version` (authoritative) must equal the
 * generated-manifest version, the runtime `DesignSystem.version`, and the
 * registry entry version.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTRACT_VERSION,
  MANIFEST_RELATIVE_PATH,
  PACKAGE_DIRECTORY,
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
  COMPONENT_NAMES,
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  DESIGN_SYSTEM_SOURCE_FILENAME,
  MANIFEST_EXPORT_SUBPATH,
  MANIFEST_EXPORT_TARGET,
  TOKENS_SOURCE_FILENAME,
  checkDesignSystemManifest,
  missingRequiredPackageFiles,
  readDesignSystemManifest,
  readSourceDescriptor,
} from "./design-system-manifest.mjs";

/** Applications every registered system must be wired into. */
export const APP_NAMES = Object.freeze(["showcase", "reference-app"]);

/** Package scripts that must exist and pass. */
const REQUIRED_PACKAGE_SCRIPTS = Object.freeze(["typecheck", "lint", "build"]);

/**
 * Required files for a package. Every package uses the per-component folder
 * layout from the specification, ships a generated manifest and generated
 * token/bridge artifacts, and owns its package and TS config.
 */
const REQUIRED_PACKAGE_FILES = Object.freeze([
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

/** Public export subpaths every package must declare. */
const REQUIRED_EXPORTS = Object.freeze([
  ".",
  "./styles.css",
  "./tailwind.css",
  "./tokens",
  MANIFEST_EXPORT_SUBPATH,
]);

/**
 * Exact `exports` targets for the stylesheet and token subpaths, matching the
 * canonical package template and the files the build ships. A subpath that
 * points anywhere else would silently resolve to a missing or wrong artifact.
 */
const STYLES_EXPORT_TARGET = "./dist/index.css";
const TAILWIND_EXPORT_TARGET = "./dist/tailwind.css";
const TOKENS_EXPORT_TARGET = Object.freeze({
  types: "./dist/tokens/index.d.ts",
  import: "./dist/tokens/index.mjs",
  require: "./dist/tokens/index.js",
});

/** The legacy monolithic component module a package must not ship. */
const LEGACY_COMPONENTS_MODULE = "src/components/index.tsx";

/** The runtime identity helper the package-owned `src/design-system.ts` uses. */
const RUNTIME_HELPER = "defineDesignSystem";

/** The named export the runtime `src/design-system.ts` must expose. */
const RUNTIME_EXPORT = "DesignSystem";

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

/* -------------------------------------------------------------------------- */
/* Static runtime parser                                                      */
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
 * Tokenize JS/TS source into the minimal stream the runtime parser needs:
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
        `${RUNTIME_HELPER}(...) contains a spread or computed key; declare each property statically.`,
      );
    }
    const isKey = token.type === "ident" || token.type === "string";
    const isShorthand = isKey && (tokens[index + 1]?.value === "," || index + 1 === close);
    if (!isKey || (!isShorthand && tokens[index + 1]?.value !== ":")) {
      throw new Error(
        `${RUNTIME_HELPER}(...) contains an unsupported top-level property form near ` +
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
      throw new Error(`${RUNTIME_HELPER}(...) "components" object is unterminated.`);
    }
    return readInlineObjectEntries(tokens, property.valueStart, close);
  }
  if (property.valueStart === property.valueEnd && first?.type === "ident") {
    const entries = findLocalObjectLiteral(tokens, first.value);
    if (entries) return entries;
    throw new Error(
      `${RUNTIME_HELPER}(...) "components" identifier "${first.value}" must reference a ` +
        `static object literal declared with const in the same file.`,
    );
  }
  throw new Error(
    `${RUNTIME_HELPER}(...) "components" must be a static object literal or a const object-literal identifier.`,
  );
}

/**
 * Parse the package-owned `src/design-system.ts` runtime identity, version,
 * contract marker, and component map without executing the module. Only the
 * static object-literal form is accepted.
 */
function parseRuntimeSource(source) {
  const tokens = tokenizeSource(source);
  const span = findCallObject(tokens, RUNTIME_HELPER);
  const properties = readTopLevelProperties(tokens, span.open, span.close);
  const byKey = new Map();
  for (const property of properties) {
    if (byKey.has(property.key)) {
      throw new Error(`${RUNTIME_HELPER}(...) declares duplicate property "${property.key}".`);
    }
    byKey.set(property.key, property);
  }

  const readStaticString = (key) => {
    const property = byKey.get(key);
    if (!property) throw new Error(`${RUNTIME_HELPER}(...) is missing required property "${key}".`);
    const token = tokens[property.valueStart];
    if (
      property.valueStart !== property.valueEnd ||
      token?.type !== "string" ||
      token.interpolated
    ) {
      throw new Error(
        `${RUNTIME_HELPER}(...) property "${key}" must be exactly one static string literal.`,
      );
    }
    return token.value;
  };

  const readContractVersion = () => {
    const property = byKey.get("contractVersion");
    if (!property) {
      throw new Error(`${RUNTIME_HELPER}(...) is missing required property "contractVersion".`);
    }
    const token = tokens[property.valueStart];
    if (
      property.valueStart !== property.valueEnd ||
      token?.type !== "number" ||
      token.value.trim() !== String(CONTRACT_VERSION)
    ) {
      throw new Error(
        `${RUNTIME_HELPER}(...) contractVersion must be the numeric ${CONTRACT_VERSION} ` +
          `(received ${JSON.stringify(token?.value ?? null)}).`,
      );
    }
    return CONTRACT_VERSION;
  };

  const contractVersion = readContractVersion();
  const componentsProperty = byKey.get("components");
  if (!componentsProperty) {
    throw new Error(`${RUNTIME_HELPER}(...) is missing required property "components".`);
  }

  return {
    id: readStaticString("id"),
    name: readStaticString("name"),
    packageName: readStaticString("packageName"),
    version: readStaticString("version"),
    contractVersion,
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

function validateManifestEntry(context, fail) {
  let manifest;
  try {
    manifest = readManifest({ manifestPath: context.manifestPath });
  } catch (error) {
    fail(`Invalid design-system manifest: ${error.message}`);
    return;
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
  context.entry = entry;
  if (entry.contractVersion !== CONTRACT_VERSION) {
    fail(
      `Manifest entry "${entry.id}" has contractVersion ${JSON.stringify(
        entry.contractVersion ?? null,
      )}; the only current contract is the numeric contractVersion: ${CONTRACT_VERSION}. ` +
        `Re-run "pnpm ds:register ${entry.id}" to synchronize the registry.`,
    );
    return;
  }
  validateCanonicalEntry(context, fail);
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

/** The published tarball must include the shipped manifest, docs, and license. */
function validatePackageFilesField(context, fail) {
  if (!context.pkg) return;
  const missing = missingRequiredPackageFiles(context.pkg);
  if (missing.length > 0) {
    fail(`package.json "files" is missing required entries: ${missing.join(", ")}.`);
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
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** Validate the canonical identity fields of a raw registry entry. */
function validateCanonicalEntry(context, fail) {
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

/** Required files for the per-component folder layout. */
function validateRequiredPackageFiles(context, fail) {
  if (!context.packageDir) return;
  for (const file of REQUIRED_PACKAGE_FILES) {
    if (!existsSync(join(context.packageDir, file))) fail(`Missing required file: ${file}`);
  }
}

/** Required public export subpaths. */
function validateNamingAndExports(context, fail) {
  if (!context.pkg) return;
  const exportsField = context.pkg.exports;
  if (!isPlainObject(exportsField)) {
    fail('package.json is missing an "exports" map.');
    return;
  }
  for (const key of REQUIRED_EXPORTS) {
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
    ["./styles.css", STYLES_EXPORT_TARGET],
    ["./tailwind.css", TAILWIND_EXPORT_TARGET],
    ["./tokens", TOKENS_EXPORT_TARGET],
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

/** The package-owned `prismSystem` block must be a complete block. */
function validateContractMetadata(context, fail) {
  if (!context.packageDir) return;
  const metadata = context.prismSystem;
  if (!metadata) {
    fail('Package is missing the "prismSystem" block in package.json.');
    return;
  }
  if (metadata.uiClass !== context.entry.uiClass) {
    fail(
      `Package "prismSystem.uiClass" "${metadata.uiClass ?? "(missing)"}" does not match manifest "${context.entry.uiClass}".`,
    );
  }
  if (metadata.tokensExport !== context.entry.tokensExport) {
    fail(
      `Package "prismSystem.tokensExport" "${metadata.tokensExport ?? "(missing)"}" does not match manifest "${context.entry.tokensExport}".`,
    );
  }
  if (metadata.name !== context.entry.name) {
    fail(
      `Package "prismSystem.name" "${metadata.name ?? "(missing)"}" does not match manifest "${context.entry.name}".`,
    );
  }
}

/**
 * Validate the generated manifest against a fresh build from the package's
 * source descriptor and `package.json` version. Token artifact drift/missing
 * checks are owned by `checkDesignSystemManifest`; this only calls it.
 */
function validateGeneratedManifest(context, fail) {
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
    fail(`Source descriptor: ${error.message}`);
  }
}

/** Enforce version equality across package, manifest, and runtime. */
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
  const runtimePath = join(context.packageDir, "src/design-system.ts");
  if (!existsSync(runtimePath)) return;
  let runtime;
  try {
    runtime = parseRuntimeSource(readFileSync(runtimePath, "utf8"));
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
function validateComponentFolders(context, fail) {
  if (!context.packageDir || !context.descriptor) return;
  const componentsDir = join(context.packageDir, "src", "components");
  if (existsSync(join(context.packageDir, LEGACY_COMPONENTS_MODULE))) {
    fail(
      `${LEGACY_COMPONENTS_MODULE} (legacy monolithic component module) is not allowed; ` +
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
 * undeclared component. Star re-exports into component folders are resolved.
 */
function validateComponentBarrel(context, fail) {
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
    (name) => COMPONENT_NAMES.includes(name) && !declared.includes(name),
  );
  if (undeclared.length > 0) {
    fail(`src/components/index.ts exports undeclared component(s): ${undeclared.join(", ")}.`);
  }
}

/**
 * Declared compound members must match the component's static compound exports
 * (`Object.assign`) without CSS or source-regex inference beyond that module.
 */
function validateCompoundMembers(context, fail) {
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
function validateStylesheet(context, fail) {
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
  if (matches(EXPORT_DECL_PATTERN, source).includes(RUNTIME_EXPORT)) return true;

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
    if (exported.includes(RUNTIME_EXPORT) && resolvesToRuntime(match[2])) return true;
    match = namedReexport.exec(source);
  }

  const runtimePath = join(dirname(indexPath), "design-system.ts");
  const runtimeSource = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : null;
  for (const specifier of matches(EXPORT_STAR_PATTERN, source)) {
    if (!resolvesToRuntime(specifier)) continue;
    if (runtimeSource !== null && collectExports(runtimeSource).names.has(RUNTIME_EXPORT)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate `src/design-system.ts` identity, version, contract marker, component map,
 * and named exports against the descriptor and package metadata, and that
 * `src/index.ts` exposes the runtime system and imports the package stylesheet.
 */
function validateRuntimeDesignSystem(context, fail) {
  if (!context.packageDir) return;
  const runtimePath = join(context.packageDir, "src", "design-system.ts");
  if (!existsSync(runtimePath)) return;

  let runtime = context.runtime;
  if (!runtime) {
    try {
      runtime = parseRuntimeSource(readFileSync(runtimePath, "utf8"));
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
  if (!runtimeExports.has(RUNTIME_EXPORT)) {
    fail(`src/design-system.ts must export a named "${RUNTIME_EXPORT}".`);
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
        `src/index.ts must re-export the runtime "${RUNTIME_EXPORT}" symbol from ` +
          `"./design-system.js".`,
      );
    }
    const indexSpecifiers = importSpecifiers(indexSource);
    if (!indexSpecifiers.some((specifier) => specifier.includes("styles/index.css"))) {
      fail('src/index.ts must import "./styles/index.css".');
    }
  }
}

/** Lightweight documentation presence check. */
function validateDocumentation(context, fail) {
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
  check("package metadata", () => validatePackageMetadata(context, fail));
  check("required package files", () => validateRequiredPackageFiles(context, fail));
  check("package naming and exports", () => validateNamingAndExports(context, fail));
  check("package files field", () => validatePackageFilesField(context, fail));
  check("contract metadata", () => validateContractMetadata(context, fail));
  check("generated manifest", () => validateGeneratedManifest(context, fail));
  check("version consistency", () => validateVersionConsistency(context, fail));
  check("component folders", () => validateComponentFolders(context, fail));
  check("component barrel exports", () => validateComponentBarrel(context, fail));
  check("compound members", () => validateCompoundMembers(context, fail));
  check("stylesheet entry", () => validateStylesheet(context, fail));
  check("runtime design system", () => validateRuntimeDesignSystem(context, fail));
  check("package boundaries", () => validatePackageBoundaries(context, fail));
  check("documentation", () => validateDocumentation(context, fail));

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
