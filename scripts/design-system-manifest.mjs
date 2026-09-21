#!/usr/bin/env node
/**
 * Generated design-system manifest tooling (V3 contract/artifact foundation).
 *
 * Every V2 design-system package ships a generated `design-system.json`
 * manifest so an external coding agent can understand the installed system
 * without reading package internals. The manifest is derived deterministically
 * from three package-owned inputs:
 *
 *   package.json                 identity, exact version, exports map
 *   design-system.source.json    explicit component/compound/variant descriptor
 *   design-brief.json            the human Design Brief (shipped unchanged)
 *
 * The descriptor is the creative contract: it declares, by hand, each
 * component's variants, sizes, and compound members. Variants are never
 * inferred from CSS or fragile source regexes. The generator only copies those
 * declarations, stamps the authoritative `package.json.version`, and records
 * the package's real public export subpaths.
 *
 * `package.json.version` is authoritative. Drift between it, the generated
 * manifest, the registry entry, and the runtime `DesignSystem.version` is a
 * validation failure. Release preparation regenerates the manifest before it
 * builds or packs.
 *
 * This module is both a reusable library (imported by the factory scripts) and
 * a CLI (`pnpm ds:manifest <id> [--write]`).
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PACKAGE_DIRECTORY,
  V2_REQUIRED_COMPONENTS,
  assertSystemId,
  readJsonFile,
  repoRoot,
  toPackageName,
} from "./register-design-system.mjs";

/** The explicit, package-owned API descriptor. Never shipped in the tarball. */
export const DESIGN_SYSTEM_SOURCE_FILENAME = "design-system.source.json";
/** The generated, shipped consumer manifest. */
export const DESIGN_SYSTEM_MANIFEST_FILENAME = "design-system.json";
/** The normalized Design Brief written by the generator. */
export const DESIGN_SYSTEM_BRIEF_FILENAME = "design-brief.json";
/** Public export subpath that exposes the manifest. */
export const MANIFEST_EXPORT_SUBPATH = "./manifest";
/** The exact `exports["./manifest"]` target; anything else is unsafe. */
export const MANIFEST_EXPORT_TARGET = `./${DESIGN_SYSTEM_MANIFEST_FILENAME}`;
/**
 * Entries every publishable package must declare in `package.json.files` so the
 * shipped manifest, docs, license, and built output reach the tarball.
 */
export const REQUIRED_PACKAGE_FILES = Object.freeze([
  "dist",
  "README.md",
  "AGENTS.md",
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  DESIGN_SYSTEM_BRIEF_FILENAME,
  "LICENSE",
]);

/** Version of the generated-manifest schema. */
export const MANIFEST_SCHEMA_VERSION = 1;
/** Version of the source-descriptor schema. */
export const SOURCE_SCHEMA_VERSION = 1;

/** `$schema` references and the generated marker written into every manifest. */
export const MANIFEST_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system.schema.json";
export const SOURCE_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system.source.schema.json";
export const GENERATED_MARKER = "prism-system/design-system-manifest";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const ALLOWED_DENSITY = Object.freeze(["compact", "comfortable", "spacious"]);
const ALLOWED_THEME = Object.freeze(["light-first", "dark-first", "dual"]);
const ALLOWED_RADIUS = Object.freeze(["none", "small", "medium", "large", "full"]);
const RULE_KEYS = Object.freeze([
  "allowArbitraryColors",
  "allowArbitraryRadius",
  "allowArbitraryShadows",
  "allowPrimitiveDuplication",
]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected a non-empty string for "${label}".`);
  }
  return value.trim();
}

function requireStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Expected "${label}" to be an array of strings.`);
  }
  const seen = new Set();
  const result = [];
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`Expected "${label}[${index}]" to be a non-empty string.`);
    }
    const entry = item.trim();
    if (seen.has(entry)) {
      throw new Error(`Duplicate value "${entry}" in "${label}".`);
    }
    seen.add(entry);
    result.push(entry);
  });
  return result;
}

/* -------------------------------------------------------------------------- */
/* Source descriptor                                                          */
/* -------------------------------------------------------------------------- */

function normalizeComponent(raw, name) {
  if (!isPlainObject(raw)) {
    throw new Error(`Component "${name}" must be an object.`);
  }
  const allowed = new Set(["variants", "sizes", "members"]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Component "${name}" has unknown field "${key}"; allowed fields are ` +
          `${[...allowed].join(", ")}.`,
      );
    }
  }
  return {
    variants: requireStringArray(raw.variants ?? [], `${name}.variants`),
    sizes: requireStringArray(raw.sizes ?? [], `${name}.sizes`),
    members: requireStringArray(raw.members ?? [], `${name}.members`),
  };
}

function normalizeDesign(raw, label) {
  if (!isPlainObject(raw)) {
    throw new Error(`Expected "${label}" to be an object.`);
  }
  const density = requireNonEmptyString(raw.density, `${label}.density`);
  if (!ALLOWED_DENSITY.includes(density)) {
    throw new Error(
      `"${label}.density" must be one of: ${ALLOWED_DENSITY.join(", ")} (received ${JSON.stringify(
        density,
      )}).`,
    );
  }
  const theme = requireNonEmptyString(raw.theme, `${label}.theme`);
  if (!ALLOWED_THEME.includes(theme)) {
    throw new Error(
      `"${label}.theme" must be one of: ${ALLOWED_THEME.join(", ")} (received ${JSON.stringify(
        theme,
      )}).`,
    );
  }
  const radius = requireNonEmptyString(raw.radius, `${label}.radius`);
  if (!ALLOWED_RADIUS.includes(radius)) {
    throw new Error(
      `"${label}.radius" must be one of: ${ALLOWED_RADIUS.join(", ")} (received ${JSON.stringify(
        radius,
      )}).`,
    );
  }
  return {
    density,
    theme,
    radius,
    keywords: requireStringArray(raw.keywords ?? [], `${label}.keywords`),
  };
}

function normalizeRules(raw, label) {
  if (!isPlainObject(raw)) {
    throw new Error(`Expected "${label}" to be an object.`);
  }
  const rules = {};
  for (const key of RULE_KEYS) {
    if (typeof raw[key] !== "boolean") {
      throw new Error(`"${label}.${key}" must be a boolean.`);
    }
    rules[key] = raw[key];
  }
  return rules;
}

/** Read and validate the package-owned `design-system.source.json`. */
export function readSourceDescriptor(packageDir) {
  const sourcePath = join(packageDir, DESIGN_SYSTEM_SOURCE_FILENAME);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Missing source descriptor ${DESIGN_SYSTEM_SOURCE_FILENAME} in ${packageDir}. ` +
        `Every V2 design system must declare its public API explicitly.`,
    );
  }
  let raw;
  try {
    raw = readJsonFile(sourcePath);
  } catch (error) {
    throw new Error(`Invalid JSON in ${sourcePath}: ${error.message}`);
  }
  if (!isPlainObject(raw)) {
    throw new Error(`${DESIGN_SYSTEM_SOURCE_FILENAME} must be a JSON object.`);
  }
  const allowedRootFields = new Set([
    "$schema",
    "schemaVersion",
    "contract",
    "name",
    "components",
    "design",
    "rules",
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedRootFields.has(key)) {
      throw new Error(
        `${DESIGN_SYSTEM_SOURCE_FILENAME} has unknown field "${key}"; allowed fields are ` +
          `${[...allowedRootFields].join(", ")}.`,
      );
    }
  }
  if (raw.schemaVersion !== SOURCE_SCHEMA_VERSION) {
    throw new Error(
      `${DESIGN_SYSTEM_SOURCE_FILENAME} has schemaVersion ${JSON.stringify(
        raw.schemaVersion,
      )}; expected ${SOURCE_SCHEMA_VERSION}.`,
    );
  }
  if (raw.contract !== "v2") {
    throw new Error(
      `${DESIGN_SYSTEM_SOURCE_FILENAME} must declare "contract": "v2" (received ${JSON.stringify(
        raw.contract ?? null,
      )}).`,
    );
  }
  const name = requireNonEmptyString(raw.name, "name");

  if (!isPlainObject(raw.components)) {
    throw new Error(`${DESIGN_SYSTEM_SOURCE_FILENAME} "components" must be an object.`);
  }
  const declared = Object.keys(raw.components);
  const missing = V2_REQUIRED_COMPONENTS.filter((component) => !declared.includes(component));
  const extra = declared.filter((component) => !V2_REQUIRED_COMPONENTS.includes(component));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${DESIGN_SYSTEM_SOURCE_FILENAME} "components" must declare exactly the fourteen V2 ` +
        `components.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}${
          extra.length > 0 ? ` Unknown: ${extra.join(", ")}.` : ""
        }`,
    );
  }
  const components = {};
  for (const component of V2_REQUIRED_COMPONENTS) {
    components[component] = normalizeComponent(
      raw.components[component],
      `components.${component}`,
    );
  }

  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    contract: "v2",
    name,
    components,
    design: normalizeDesign(raw.design, "design"),
    rules: normalizeRules(raw.rules, "rules"),
  };
}

/* -------------------------------------------------------------------------- */
/* Runtime DesignSystem.version parser                                        */
/* -------------------------------------------------------------------------- */

/** Decode the common escapes of a raw string/template body. */
function decodeEscapes(raw) {
  let value = "";
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== "\\") {
      value += char;
      continue;
    }
    const next = raw[index + 1];
    if (next === "n") value += "\n";
    else if (next === "t") value += "\t";
    else if (next === "r") value += "\r";
    else if (next === undefined) value += "\\";
    else value += next;
    index += 1;
  }
  return value;
}

/**
 * Find the end of a template literal that starts at the opening backtick.
 * Tracks `${ ... }` interpolation (including nested templates) so the token
 * boundary stays correct; `interpolated` records whether any substitution
 * exists.
 */
function scanTemplate(source, start) {
  const length = source.length;
  let index = start + 1;
  let interpolated = false;
  while (index < length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") return { valueEnd: index, end: index + 1, interpolated };
    if (char === "$" && source[index + 1] === "{") {
      interpolated = true;
      index += 2;
      let depth = 1;
      while (index < length && depth > 0) {
        const inner = source[index];
        if (inner === "\\") {
          index += 2;
          continue;
        }
        if (inner === "{") depth += 1;
        else if (inner === "}") depth -= 1;
        else if (inner === "`") {
          index = scanTemplate(source, index).end;
          continue;
        }
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return { valueEnd: length, end: length, interpolated };
}

/**
 * Scan one string or template literal. Plain strings and no-substitution
 * templates are static; templates containing `${...}` are marked interpolated.
 */
function scanStringToken(source, start) {
  const quote = source[start];
  const length = source.length;
  const valueStart = start + 1;
  if (quote === "`") {
    const { valueEnd, end, interpolated } = scanTemplate(source, start);
    return {
      type: "string",
      quote,
      interpolated,
      value: decodeEscapes(source.slice(valueStart, valueEnd)),
      start,
      valueStart,
      valueEnd,
      end,
    };
  }
  let index = valueStart;
  while (index < length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) {
      return {
        type: "string",
        quote,
        interpolated: false,
        value: decodeEscapes(source.slice(valueStart, index)),
        start,
        valueStart,
        valueEnd: index,
        end: index + 1,
      };
    }
    index += 1;
  }
  return {
    type: "string",
    quote,
    interpolated: false,
    value: decodeEscapes(source.slice(valueStart, length)),
    start,
    valueStart,
    valueEnd: length,
    end: length,
  };
}

/**
 * Tokenize JS/TS source into a minimal stream: comments are dropped, string
 * literals carry their decoded value and the offsets of their raw inner text,
 * and every other character becomes an identifier, number, or punctuation
 * token. This is enough to parse the `defineDesignSystemV2(...)` argument
 * deterministically without an AST dependency.
 */
function tokenizeRuntimeSource(source) {
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
      const token = scanStringToken(source, index);
      tokens.push(token);
      index = token.end;
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      const start = index;
      while (index < length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      tokens.push({ type: "ident", value: source.slice(start, index), start, end: index });
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      while (index < length && /[0-9.eE+-]/.test(source[index])) index += 1;
      tokens.push({ type: "number", value: source.slice(start, index), start, end: index });
      continue;
    }
    tokens.push({ type: "punct", value: char, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
}

/**
 * Locate the single `defineDesignSystemV2({ ... })` call in a source file and
 * return the span of its argument object. The first argument must be an object
 * literal and the object's closing brace must be the direct call terminator, so
 * conditional, identifier, call, member, parenthesized, type-asserted, and
 * extra-argument wrappers are rejected. Fails closed on a missing or ambiguous
 * call.
 */
function findDesignSystemV2Object(tokens) {
  const callIndexes = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token.type === "ident" &&
      token.value === "defineDesignSystemV2" &&
      next.type === "punct" &&
      next.value === "("
    ) {
      callIndexes.push(index);
    }
  }
  if (callIndexes.length === 0) {
    throw new Error("src/index.ts does not call defineDesignSystemV2(...).");
  }
  if (callIndexes.length > 1) {
    throw new Error(
      `src/index.ts contains ${callIndexes.length} defineDesignSystemV2(...) calls; ` +
        `exactly one is required to read the runtime version unambiguously.`,
    );
  }

  const argumentStart = callIndexes[0] + 2;
  const firstArgument = tokens[argumentStart];
  if (!(firstArgument?.type === "punct" && firstArgument.value === "{")) {
    throw new Error(
      "defineDesignSystemV2(...) must be called with a single object literal argument; " +
        "conditional, identifier, call, member, parenthesized, type-asserted, and other dynamic " +
        "argument wrappers are not allowed.",
    );
  }

  let depth = 0;
  let objectEnd = -1;
  for (let cursor = argumentStart; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token.type === "punct" && token.value === "{") depth += 1;
    else if (token.type === "punct" && token.value === "}") {
      depth -= 1;
      if (depth === 0) {
        objectEnd = cursor;
        break;
      }
    }
  }
  if (objectEnd === -1) {
    throw new Error("defineDesignSystemV2(...) object is unterminated.");
  }

  const afterObject = tokens[objectEnd + 1];
  if (!(afterObject?.type === "punct" && afterObject.value === ")")) {
    throw new Error(
      "defineDesignSystemV2(...) object must be the direct call argument with no extra " +
        "arguments, type assertions, or trailing expressions.",
    );
  }
  const afterCall = tokens[objectEnd + 2];
  const endsExpression =
    afterCall === undefined ||
    (afterCall.type === "punct" && [";", ",", ")", "]", "}"].includes(afterCall.value));
  if (!endsExpression) {
    throw new Error(
      "defineDesignSystemV2(...) call must end the expression; a call, member access, or type " +
        "assertion on its result is not allowed.",
    );
  }
  return { open: argumentStart, close: objectEnd };
}

/**
 * Parse the top-level properties of the `defineDesignSystemV2(...)` object.
 *
 * Only plain `key: value` properties with an identifier or string key are
 * accepted. Spreads, computed keys, getters, setters, methods, generator
 * methods, shorthand, and other dynamic property forms are rejected because
 * they can determine the runtime `version` without being visible as a simple
 * `version:` property. Nested values are skipped, so a nested `version` is
 * never mistaken for the runtime version.
 */
function topLevelObjectProperties(tokens, open, close) {
  const properties = [];
  let index = open + 1;

  const rejectForm = (reason) => {
    throw new Error(
      `defineDesignSystemV2(...) object contains an unsupported top-level property form ` +
        `(${reason}); spreads, computed keys, getters, setters, methods, shorthand, and other ` +
        "dynamic property forms are not allowed because they can change the runtime version.",
    );
  };

  while (index < close) {
    const token = tokens[index];

    if (token.type === "punct" && token.value === ".") rejectForm("spread");
    if (token.type === "punct" && token.value === "[") rejectForm("computed key");
    if (token.type === "punct" && token.value === "*") rejectForm("generator method");

    if (
      token.type === "ident" &&
      (token.value === "get" || token.value === "set" || token.value === "async")
    ) {
      const key = tokens[index + 1];
      const paren = tokens[index + 2];
      if (
        (key?.type === "ident" || key?.type === "string") &&
        paren?.type === "punct" &&
        paren.value === "("
      ) {
        rejectForm(`${token.value} accessor/method`);
      }
    }

    const isKey = token.type === "ident" || token.type === "string";
    const colon = tokens[index + 1];
    if (isKey && colon?.type === "punct" && colon.value === ":") {
      const key = token.value;
      const value = tokens[index + 2];
      const following = tokens[index + 3];
      // A value is a static literal only when it is exactly one string or
      // no-substitution template token immediately followed by a property
      // delimiter (`,` or the end of the object). Concatenation, member access,
      // calls, interpolation, ternaries, and any other expression leave extra
      // tokens before the delimiter and are rejected.
      const valueEndsProperty =
        index + 3 === close || (following?.type === "punct" && following.value === ",");
      const isStaticString = value?.type === "string" && value.interpolated !== true;
      if (isStaticString && valueEndsProperty) {
        properties.push({
          key,
          kind: "string",
          value: value.value,
          valueStart: value.valueStart,
          valueEnd: value.valueEnd,
        });
      } else {
        properties.push({ key, kind: "dynamic" });
      }
      // Skip the value (and any trailing tokens) up to the next top-level comma.
      index += 2;
      let valueDepth = 0;
      while (index < close) {
        const current = tokens[index];
        if (
          current.type === "punct" &&
          (current.value === "{" || current.value === "[" || current.value === "(")
        ) {
          valueDepth += 1;
        } else if (
          current.type === "punct" &&
          (current.value === "}" || current.value === "]" || current.value === ")")
        ) {
          valueDepth -= 1;
        } else if (current.type === "punct" && current.value === "," && valueDepth === 0) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (isKey && colon?.type === "punct" && colon.value === "(") rejectForm("method");
    rejectForm("unsupported property");
  }
  return properties;
}

/**
 * Read the single top-level `version` of the `defineDesignSystemV2(...)`
 * argument. The value must be exactly one static string literal or a
 * no-substitution template literal (comments around it are allowed). Fails
 * closed on a missing, duplicate, nested-only, commented-only, or dynamic
 * (concatenated, identifier, member access, call, interpolated, conditional, or
 * otherwise non-literal) version.
 *
 * @returns {{ version: string, valueStart: number, valueEnd: number }}
 */
export function parseRuntimeDesignSystemVersion(source) {
  const tokens = tokenizeRuntimeSource(source);
  const span = findDesignSystemV2Object(tokens);
  const properties = topLevelObjectProperties(tokens, span.open, span.close);
  const versions = properties.filter((property) => property.key === "version");
  if (versions.length === 0) {
    throw new Error(
      'defineDesignSystemV2(...) must declare exactly one top-level string "version".',
    );
  }
  if (versions.length > 1) {
    throw new Error(
      `defineDesignSystemV2(...) declares ${versions.length} top-level "version" properties; ` +
        `exactly one is required.`,
    );
  }
  const [entry] = versions;
  if (entry.kind !== "string") {
    throw new Error(
      'The top-level "version" in defineDesignSystemV2(...) must be exactly one static string ' +
        "literal or no-substitution template literal. Concatenation, identifiers, member access, " +
        "calls, template interpolation, conditional/binary expressions, and other dynamic values " +
        "are not allowed.",
    );
  }
  return { version: entry.value, valueStart: entry.valueStart, valueEnd: entry.valueEnd };
}

/** Read the runtime `DesignSystem.version` string from `src/index.ts`. */
export function readRuntimeDesignSystemVersion(source) {
  return parseRuntimeDesignSystemVersion(source).version;
}

/**
 * Return `source` with the runtime `DesignSystem.version` set to `version`,
 * replacing only the inner string text of the validated top-level property.
 */
export function syncRuntimeDesignSystemVersion(source, version) {
  const parsed = parseRuntimeDesignSystemVersion(source);
  if (parsed.version === version) return { source, changed: false };
  return {
    source: source.slice(0, parsed.valueStart) + version + source.slice(parsed.valueEnd),
    changed: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Generated manifest                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Required `package.json.files` entries that are missing from `pkg`, in
 * `REQUIRED_PACKAGE_FILES` order. Returns an empty array when the package is
 * publishable.
 */
export function missingRequiredPackageFiles(pkg) {
  const files = Array.isArray(pkg?.files) ? pkg.files : [];
  return REQUIRED_PACKAGE_FILES.filter((entry) => !files.includes(entry));
}

function readPackageForManifest(packageDir, id) {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Missing package.json in ${packageDir}.`);
  }
  let pkg;
  try {
    pkg = readJsonFile(packageJsonPath);
  } catch (error) {
    throw new Error(`Invalid JSON in ${packageJsonPath}: ${error.message}`);
  }
  if (!isPlainObject(pkg)) {
    throw new Error(`${packageJsonPath} must be a JSON object.`);
  }
  const expectedName = toPackageName(id);
  if (pkg.name !== expectedName) {
    throw new Error(
      `Package name "${pkg.name}" does not match the canonical name "${expectedName}" for "${id}".`,
    );
  }
  const version = requireNonEmptyString(pkg.version, "package.json.version");
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(
      `package.json.version ${JSON.stringify(version)} is not a valid semantic version.`,
    );
  }
  if (!isPlainObject(pkg.exports)) {
    throw new Error('package.json is missing an "exports" map.');
  }
  if (!("." in pkg.exports)) {
    throw new Error('package.json exports is missing ".".');
  }
  const manifestTarget = pkg.exports[MANIFEST_EXPORT_SUBPATH];
  if (manifestTarget !== MANIFEST_EXPORT_TARGET) {
    throw new Error(
      `package.json exports["${MANIFEST_EXPORT_SUBPATH}"] must be exactly ` +
        `${JSON.stringify(MANIFEST_EXPORT_TARGET)} (received ${JSON.stringify(
          manifestTarget ?? null,
        )}); refusing to generate a manifest for an unsafe export target.`,
    );
  }
  const missingFiles = missingRequiredPackageFiles(pkg);
  if (missingFiles.length > 0) {
    throw new Error(
      `package.json "files" is missing required entries: ${missingFiles.join(", ")}. ` +
        `The shipped manifest, docs, license, and dist output must be publishable.`,
    );
  }
  const tokensExport = requireNonEmptyString(
    pkg.prismSystem?.tokensExport,
    "prismSystem.tokensExport",
  );
  const displayName = requireNonEmptyString(pkg.prismSystem?.name, "prismSystem.name");
  return { pkg, version, tokensExport, displayName };
}

/* -------------------------------------------------------------------------- */
/* Generated manifest                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Build the canonical manifest object for a package. Pure and synchronous:
 * formatting happens separately in {@link writeDesignSystemManifest}.
 */
export function buildManifest({ id, packageDir }) {
  const resolvedId = assertSystemId(id);
  const { pkg, version, tokensExport, displayName } = readPackageForManifest(
    packageDir,
    resolvedId,
  );
  const source = readSourceDescriptor(packageDir);
  if (source.name !== displayName) {
    throw new Error(
      `${DESIGN_SYSTEM_SOURCE_FILENAME} name ${JSON.stringify(
        source.name,
      )} does not match prismSystem.name ${JSON.stringify(displayName)}.`,
    );
  }

  return {
    $schema: MANIFEST_SCHEMA_URL,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generated: GENERATED_MARKER,
    contract: "v2",
    id: resolvedId,
    name: displayName,
    package: toPackageName(resolvedId),
    version,
    exports: pkg.exports,
    publicApi: {
      ".": [...V2_REQUIRED_COMPONENTS, "DesignSystem", tokensExport],
      "./tokens": [tokensExport],
    },
    components: source.components,
    design: source.design,
    rules: source.rules,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

/** Stable JSON with two-space indentation and a trailing newline. */
export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Read the on-disk generated manifest, or null when it does not exist yet. */
export function readDesignSystemManifest(packageDir) {
  const manifestPath = join(packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) return null;
  return readJsonFile(manifestPath);
}

/**
 * Compare the on-disk manifest with a freshly built one.
 *
 * @returns {{ ok: boolean, failures: string[], expected: object, actual: object | null }}
 */
export function checkDesignSystemManifest({ id, packageDir }) {
  let expected;
  try {
    expected = buildManifest({ id, packageDir });
  } catch (error) {
    return { ok: false, failures: [error.message], expected: null, actual: null };
  }
  const manifestPath = join(packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      failures: [
        `Missing generated manifest ${DESIGN_SYSTEM_MANIFEST_FILENAME}; regenerate it with ` +
          `"pnpm ds:manifest ${id} --write".`,
      ],
      expected,
      actual: null,
    };
  }
  let actual;
  try {
    actual = readJsonFile(manifestPath);
  } catch (error) {
    return {
      ok: false,
      failures: [`Invalid JSON in ${DESIGN_SYSTEM_MANIFEST_FILENAME}: ${error.message}`],
      expected,
      actual: null,
    };
  }
  const same = JSON.stringify(canonicalize(expected)) === JSON.stringify(canonicalize(actual));
  return {
    ok: same,
    failures: same
      ? []
      : [
          `${DESIGN_SYSTEM_MANIFEST_FILENAME} is out of date with package.json and ` +
            `${DESIGN_SYSTEM_SOURCE_FILENAME}; regenerate it with ` +
            `"pnpm ds:manifest ${id} --write".`,
        ],
    expected,
    actual,
  };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

function writeFileAtomic(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  let renamed = false;
  try {
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, filePath);
    renamed = true;
  } finally {
    if (!renamed) rmSync(tempPath, { force: true });
  }
}

async function formatSource(source, filePath) {
  try {
    const module = await import("prettier");
    const prettier = module.default ?? module;
    const config = (await prettier.resolveConfig(filePath)) ?? {};
    return await prettier.format(source, { ...config, filepath: filePath });
  } catch {
    // Formatting is cosmetic; never fail generation because Prettier is absent.
    return source;
  }
}

/** Render the prettier-formatted manifest source without writing it. */
export async function renderDesignSystemManifest({ id, packageDir }) {
  const manifest = buildManifest({ id, packageDir });
  const manifestPath = join(packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME);
  const formatted = await formatSource(serializeManifest(manifest), manifestPath);
  return { manifest, source: formatted };
}

/** Build, format, and atomically write the generated manifest. */
export async function writeDesignSystemManifest({ id, packageDir }) {
  const { manifest, source } = await renderDesignSystemManifest({ id, packageDir });
  writeFileAtomic(join(packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME), source);
  return manifest;
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

export function helpText() {
  return [
    "Usage: pnpm ds:manifest <id> [--write] [options]",
    "",
    "Check (default) or regenerate packages/<id>/design-system.json from the",
    "package-owned design-system.source.json and the authoritative package.json",
    "version.",
    "",
    "Arguments:",
    "  <id>                  Lower-kebab-case system id (e.g. system-a).",
    "",
    "Options:",
    "  --write               Regenerate design-system.json.",
    "  --root <path>         Root holding packages/ (default: repo root).",
    "  -h, --help            Show this help.",
    "",
    "Exit code is non-zero when the manifest is missing or out of date (check mode).",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { id: undefined, root: undefined, write: false, help: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--write") {
      options.write = true;
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
    const id = assertSystemId(options.id);
    const root = resolve(options.root ?? repoRoot());
    const packageDir = join(root, PACKAGE_DIRECTORY, id);
    if (options.write) {
      await writeDesignSystemManifest({ id, packageDir });
      process.stdout.write(`Wrote ${DESIGN_SYSTEM_MANIFEST_FILENAME} for "${id}".\n`);
      return;
    }
    const result = checkDesignSystemManifest({ id, packageDir });
    if (result.ok) {
      process.stdout.write(`${DESIGN_SYSTEM_MANIFEST_FILENAME} is up to date for "${id}".\n`);
      return;
    }
    process.stdout.write(`${DESIGN_SYSTEM_MANIFEST_FILENAME} check failed for "${id}"\n\n`);
    for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
