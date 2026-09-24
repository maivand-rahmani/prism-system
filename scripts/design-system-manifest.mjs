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

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
import {
  TOKEN_NAMESPACE_PATTERN,
  V4_TOKEN_NAME_FIELDS,
  buildTokenArtifactFiles,
  checkTokenArtifactFiles,
  tokenNaming,
} from "./design-system-tokens.mjs";

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

/* -------------------------------------------------------------------------- */
/* V4 contract constants                                                      */
/* -------------------------------------------------------------------------- */

/** The twenty canonical V4 required component names, in order. */
export const V4_REQUIRED_COMPONENTS = Object.freeze([
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
]);

/** The twelve V4 optional component names a system may implement, in order. */
export const V4_OPTIONAL_COMPONENTS = Object.freeze([
  "Grid",
  "Section",
  "Fieldset",
  "Alert",
  "Progress",
  "Skeleton",
  "Toast",
  "Accordion",
  "Avatar",
  "Breadcrumbs",
  "Pagination",
  "Table",
]);

/** Every component name a V4 descriptor or manifest may declare. */
export const V4_COMPONENT_NAMES = Object.freeze([
  ...V4_REQUIRED_COMPONENTS,
  ...V4_OPTIONAL_COMPONENTS,
]);

/** V4 generated-manifest schema version. */
export const MANIFEST_V4_SCHEMA_VERSION = 2;
/** V4 source-descriptor schema version. */
export const SOURCE_V4_SCHEMA_VERSION = 2;
/** Token source schema version. */
export const TOKENS_SOURCE_SCHEMA_VERSION = 1;

/** The package-owned semantic token source. Never shipped in the tarball. */
export const TOKENS_SOURCE_FILENAME = "tokens.source.json";

/** `$schema` references written into the V4 manifests and descriptors. */
export const V4_MANIFEST_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system-v4.schema.json";
export const V4_SOURCE_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system-source-v4.schema.json";
export const TOKENS_SOURCE_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/tokens.source.schema.json";

/** Token group keys exposed by a V4 manifest, matching the token source groups. */
export const TOKEN_GROUP_KEYS = Object.freeze([
  "themes",
  "typography",
  "spacing",
  "containers",
  "breakpoints",
  "layers",
  "radius",
  "shadow",
  "motion",
]);

const V4_SOURCE_ROOT_FIELDS = Object.freeze([
  "$schema",
  "schemaVersion",
  "contract",
  "name",
  "components",
  "design",
  "rules",
  "docs",
]);
const V4_MANIFEST_ROOT_FIELDS = Object.freeze([
  "$schema",
  "schemaVersion",
  "generated",
  "contract",
  "id",
  "name",
  "package",
  "version",
  "exports",
  "publicApi",
  "components",
  "design",
  "rules",
  "tokens",
  "docs",
]);
const V4_COMPONENT_FIELDS = Object.freeze([
  "variants",
  "sizes",
  "members",
  "description",
  "docs",
  "example",
]);
const V4_COMPONENT_META_FIELDS = Object.freeze(["description", "docs", "example"]);
const V4_DOC_FIELDS = Object.freeze([
  "readme",
  "agents",
  "brief",
  "foundations",
  "components",
  "usage",
]);
const TOKEN_ARTIFACT_FIELDS = Object.freeze(["typescript", "css", "tailwind"]);

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

/* -------------------------------------------------------------------------- */
/* V4 schema/contract dispatch and validation                                 */
/* -------------------------------------------------------------------------- */

function assertKnownFields(raw, allowed, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!allowedSet.has(key)) {
      throw new Error(
        `${label} has unknown field "${key}"; allowed fields are ${allowed.join(", ")}.`,
      );
    }
  }
}

/**
 * Dispatch strictly by the `(schemaVersion, contract)` pair.
 *
 * Only `(1, "v2")` and `(2, "v4")` are accepted. Every other combination —
 * including a missing field, a V1-shaped payload, or a fabricated pair — is
 * rejected so the two contracts are never silently mixed.
 */
export function dispatchSchemaContract(raw, label = "design-system descriptor") {
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const show = (value) => (value === undefined ? "undefined" : JSON.stringify(value));
  const pair = `(${show(raw.schemaVersion)}, ${show(raw.contract)})`;
  if (raw.schemaVersion === 1 && raw.contract === "v2") return "v2";
  if (raw.schemaVersion === 2 && raw.contract === "v4") return "v4";
  throw new Error(`Unsupported schema/contract pair ${pair}; expected (1, "v2") or (2, "v4").`);
}

/**
 * Read a required V4 component field. All three API fields must be present;
 * the descriptor is the explicit contract, so a missing field is never
 * silently defaulted to an empty array (an explicitly empty array is valid).
 */
function requireV4ComponentField(raw, key, name) {
  if (!(key in raw)) {
    throw new Error(
      `Component "${name}" is missing required field "${key}"; ` +
        `"variants", "sizes", and "members" are required (empty arrays are allowed).`,
    );
  }
  return raw[key];
}

/**
 * Validate one component entry for a V4 descriptor or manifest. `variants`,
 * `sizes`, and `members` are required unique string arrays (empty allowed);
 * `description`, `docs`, and `example` are optional metadata.
 */
function normalizeV4Component(raw, name) {
  if (!isPlainObject(raw)) {
    throw new Error(`Component "${name}" must be an object.`);
  }
  const allowed = new Set(V4_COMPONENT_FIELDS);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Component "${name}" has unknown field "${key}"; allowed fields are ` +
          `${V4_COMPONENT_FIELDS.join(", ")}.`,
      );
    }
  }
  const component = {
    variants: requireStringArray(
      requireV4ComponentField(raw, "variants", name),
      `${name}.variants`,
    ),
    sizes: requireStringArray(requireV4ComponentField(raw, "sizes", name), `${name}.sizes`),
    members: requireStringArray(requireV4ComponentField(raw, "members", name), `${name}.members`),
  };
  for (const key of V4_COMPONENT_META_FIELDS) {
    if (raw[key] !== undefined) {
      component[key] = requireNonEmptyString(raw[key], `${name}.${key}`);
    }
  }
  return component;
}

/**
 * Validate the V4 component map: all twenty required names must be present and
 * every declared optional name must be a known V4 optional component. Absence
 * means unavailable, so a boolean `false` entry is rejected as a non-object and
 * an unknown name is rejected outright.
 */
function normalizeV4Components(raw, label) {
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  const declared = Object.keys(raw);
  const missing = V4_REQUIRED_COMPONENTS.filter((name) => !declared.includes(name));
  const unknown = declared.filter((name) => !V4_COMPONENT_NAMES.includes(name));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `${label} must declare all twenty V4 required components and only implemented optional ` +
        `components.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}${
          unknown.length > 0 ? ` Unknown: ${unknown.join(", ")}.` : ""
        }`,
    );
  }
  const components = {};
  for (const name of V4_COMPONENT_NAMES) {
    if (name in raw) components[name] = normalizeV4Component(raw[name], name);
  }
  return components;
}

/** Validate package-relative documentation paths. */
function normalizeDocs(raw, label, requireCore) {
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  assertKnownFields(raw, V4_DOC_FIELDS, label);
  if (requireCore) {
    for (const key of ["readme", "agents"]) {
      if (!(key in raw)) throw new Error(`${label} is missing required field "${key}".`);
    }
  }
  const docs = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value.startsWith("./") || value.length <= 2) {
      throw new Error(
        `${label}.${key} must be a package-relative path starting with "./" ` +
          `(received ${JSON.stringify(value)}).`,
      );
    }
    docs[key] = value;
  }
  return docs;
}

/** Validate the generated manifest's token group names, artifacts, and naming. */
function normalizeTokenManifest(raw) {
  const label = `${DESIGN_SYSTEM_MANIFEST_FILENAME} "tokens"`;
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  assertKnownFields(raw, ["groups", "artifacts", "names"], label);

  const groupsLabel = `${label} "groups"`;
  if (!isPlainObject(raw.groups)) {
    throw new Error(`${groupsLabel} must be an object.`);
  }
  assertKnownFields(raw.groups, TOKEN_GROUP_KEYS, groupsLabel);
  const groups = {};
  for (const key of TOKEN_GROUP_KEYS) {
    if (!(key in raw.groups)) {
      throw new Error(`${groupsLabel} is missing required group "${key}".`);
    }
    groups[key] = requireStringArray(raw.groups[key], `${groupsLabel}.${key}`);
  }

  const artifactsLabel = `${label} "artifacts"`;
  if (!isPlainObject(raw.artifacts)) {
    throw new Error(`${artifactsLabel} must be an object.`);
  }
  assertKnownFields(raw.artifacts, TOKEN_ARTIFACT_FIELDS, artifactsLabel);
  const artifacts = {};
  for (const key of TOKEN_ARTIFACT_FIELDS) {
    const value = raw.artifacts[key];
    if (typeof value !== "string" || !value.startsWith("./") || value.length <= 2) {
      throw new Error(
        `${artifactsLabel}.${key} must be a package-relative path starting with "./" ` +
          `(received ${JSON.stringify(value ?? null)}).`,
      );
    }
    artifacts[key] = value;
  }

  return { groups, artifacts, names: normalizeTokenNames(raw.names, label) };
}

/**
 * Validate the manifest `tokens.names` block: exactly the two required naming
 * fields, each a safe lower-kebab namespace. Missing, unknown, or malformed
 * names fail closed so a consumer never reads a namespace the artifacts do not
 * actually use.
 */
function normalizeTokenNames(raw, tokensLabel) {
  const label = `${tokensLabel} "names"`;
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  assertKnownFields(raw, V4_TOKEN_NAME_FIELDS, label);
  const names = {};
  for (const key of V4_TOKEN_NAME_FIELDS) {
    if (!(key in raw)) {
      throw new Error(`${label} is missing required field "${key}".`);
    }
    const value = raw[key];
    if (typeof value !== "string" || !TOKEN_NAMESPACE_PATTERN.test(value)) {
      throw new Error(
        `${label}.${key} must be a safe lower-kebab namespace ` +
          `(received ${JSON.stringify(value ?? null)}).`,
      );
    }
    names[key] = value;
  }
  return names;
}

function normalizePublicApi(raw, label) {
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  const publicApi = {};
  for (const [subpath, members] of Object.entries(raw)) {
    publicApi[subpath] = requireStringArray(members, `${label}["${subpath}"]`);
  }
  return publicApi;
}

/** Read and validate a package-owned V4 `design-system.source.json`. */
export function parseV4SourceDescriptor(raw) {
  if (!isPlainObject(raw)) {
    throw new Error(`${DESIGN_SYSTEM_SOURCE_FILENAME} must be a JSON object.`);
  }
  assertKnownFields(raw, V4_SOURCE_ROOT_FIELDS, DESIGN_SYSTEM_SOURCE_FILENAME);
  if (raw.schemaVersion !== SOURCE_V4_SCHEMA_VERSION) {
    throw new Error(
      `${DESIGN_SYSTEM_SOURCE_FILENAME} has schemaVersion ${JSON.stringify(
        raw.schemaVersion,
      )}; expected ${SOURCE_V4_SCHEMA_VERSION}.`,
    );
  }
  if (raw.contract !== "v4") {
    throw new Error(
      `${DESIGN_SYSTEM_SOURCE_FILENAME} must declare "contract": "v4" (received ${JSON.stringify(
        raw.contract ?? null,
      )}).`,
    );
  }
  const descriptor = {
    schemaVersion: SOURCE_V4_SCHEMA_VERSION,
    contract: "v4",
    name: requireNonEmptyString(raw.name, "name"),
    components: normalizeV4Components(
      raw.components,
      `${DESIGN_SYSTEM_SOURCE_FILENAME} "components"`,
    ),
    design: normalizeDesign(raw.design, "design"),
    rules: normalizeRules(raw.rules, "rules"),
  };
  if (raw.docs !== undefined) {
    descriptor.docs = normalizeDocs(raw.docs, `${DESIGN_SYSTEM_SOURCE_FILENAME} "docs"`, true);
  }
  return descriptor;
}

/* -------------------------------------------------------------------------- */
/* V4 token source validation                                                 */
/* -------------------------------------------------------------------------- */

const DIMENSION_UNITS = Object.freeze(["px", "rem", "em", "ch", "vw", "vh", "%"]);
const ABSOLUTE_UNITS = Object.freeze(["px", "rem", "em"]);
const NONNEGATIVE_DIMENSION_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em|ch|vw|vh|%)$/;
const SIGNED_DIMENSION_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em|ch|vw|vh|%)$/;
const NONNEGATIVE_ABSOLUTE_DIMENSION_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em)$/;
const TIME_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(ms|s)$/;
const DECLARATION_DELIMITERS = /[;{}<>!]/;

function tokenLeaf(validate, describe) {
  return { leaf: true, validate, describe };
}

function tokenObject(properties, required) {
  return {
    leaf: false,
    properties,
    required: required ?? Object.keys(properties),
  };
}

function colorLeaf() {
  return tokenLeaf(
    (value) =>
      typeof value === "string" && value.trim().length > 0 && !DECLARATION_DELIMITERS.test(value)
        ? null
        : `must be a safe CSS color literal with no declaration delimiters (received ${JSON.stringify(
            value,
          )}).`,
    "a color literal",
  );
}

/**
 * A finite CSS length leaf. Dimensions are non-negative by default; only
 * `typography.letterSpacing` opts into signed values. `absoluteOnly` narrows
 * the allowed units to px/rem/em (breakpoints) and is always non-negative.
 */
function dimensionLeaf({ absoluteOnly = false, signed = false } = {}) {
  const units = absoluteOnly ? ABSOLUTE_UNITS : DIMENSION_UNITS;
  const unitList =
    units.length < 2
      ? units.join("")
      : `${units.slice(0, -1).join(", ")}, or ${units[units.length - 1]}`;
  const pattern = absoluteOnly
    ? NONNEGATIVE_ABSOLUTE_DIMENSION_PATTERN
    : signed
      ? SIGNED_DIMENSION_PATTERN
      : NONNEGATIVE_DIMENSION_PATTERN;
  return tokenLeaf(
    (value) => {
      if (typeof value !== "string") {
        return `must be a valid length using ${unitList} (received ${JSON.stringify(value)}).`;
      }
      if (!pattern.test(value)) {
        return `must be a valid length using ${unitList} (received ${JSON.stringify(value)}).`;
      }
      return null;
    },
    absoluteOnly ? "an absolute length (px, rem, em)" : "a length",
  );
}

function timeLeaf() {
  return tokenLeaf(
    (value) =>
      typeof value === "string" && TIME_PATTERN.test(value)
        ? null
        : `must be a valid duration using ms or s (received ${JSON.stringify(value)}).`,
    "a time duration",
  );
}

function integerLeaf(describe = "an integer", min = undefined) {
  return tokenLeaf(
    (value) =>
      Number.isInteger(value) && (min === undefined || value >= min)
        ? null
        : `must be ${describe} (received ${JSON.stringify(value)}).`,
    describe,
  );
}

function positiveNumberLeaf() {
  return tokenLeaf(
    (value) =>
      typeof value === "number" && Number.isFinite(value) && value > 0
        ? null
        : `must be a positive number (received ${JSON.stringify(value)}).`,
    "a positive number",
  );
}

function lineHeightLeaf() {
  const describe = "a line height (positive number or length)";
  return tokenLeaf((value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) && value > 0
        ? null
        : `must be a positive number or a valid length (received ${JSON.stringify(value)}).`;
    }
    if (typeof value === "string" && NONNEGATIVE_DIMENSION_PATTERN.test(value)) return null;
    return `must be a positive number or a valid length (received ${JSON.stringify(value)}).`;
  }, describe);
}

function fontWeightLeaf() {
  return tokenLeaf(
    (value) =>
      Number.isInteger(value) && value >= 100 && value <= 900
        ? null
        : `must be a font weight between 100 and 900 (received ${JSON.stringify(value)}).`,
    "a font weight",
  );
}

function safeStringLeaf(describe) {
  return tokenLeaf(
    (value) =>
      typeof value === "string" && value.trim().length > 0 && !DECLARATION_DELIMITERS.test(value)
        ? null
        : `must be ${describe} (received ${JSON.stringify(value)}).`,
    describe,
  );
}

const COLOR_SEMANTIC_SHAPE = tokenObject({
  text: tokenObject({
    primary: colorLeaf(),
    secondary: colorLeaf(),
    muted: colorLeaf(),
    inverse: colorLeaf(),
  }),
  surface: tokenObject({
    canvas: colorLeaf(),
    raised: colorLeaf(),
    sunken: colorLeaf(),
    inverse: colorLeaf(),
  }),
  border: tokenObject({ default: colorLeaf(), strong: colorLeaf(), focus: colorLeaf() }),
  action: tokenObject({
    primary: colorLeaf(),
    primaryHover: colorLeaf(),
    primaryText: colorLeaf(),
    secondary: colorLeaf(),
    secondaryHover: colorLeaf(),
    secondaryText: colorLeaf(),
  }),
  status: tokenObject({
    info: colorLeaf(),
    success: colorLeaf(),
    warning: colorLeaf(),
    danger: colorLeaf(),
  }),
});

const TOKEN_SHAPE = Object.freeze({
  themes: tokenObject({
    light: tokenObject({ color: COLOR_SEMANTIC_SHAPE }),
    dark: tokenObject({ color: COLOR_SEMANTIC_SHAPE }),
  }),
  typography: tokenObject({
    family: tokenObject({
      sans: safeStringLeaf("a font family list"),
      mono: safeStringLeaf("a font family list"),
    }),
    size: tokenObject({
      xs: dimensionLeaf(),
      sm: dimensionLeaf(),
      md: dimensionLeaf(),
      lg: dimensionLeaf(),
      xl: dimensionLeaf(),
      "2xl": dimensionLeaf(),
      "3xl": dimensionLeaf(),
      "4xl": dimensionLeaf(),
    }),
    weight: tokenObject({
      light: fontWeightLeaf(),
      normal: fontWeightLeaf(),
      medium: fontWeightLeaf(),
      semibold: fontWeightLeaf(),
      bold: fontWeightLeaf(),
    }),
    lineHeight: tokenObject({
      tight: lineHeightLeaf(),
      normal: lineHeightLeaf(),
      relaxed: lineHeightLeaf(),
    }),
    letterSpacing: tokenObject({
      tight: dimensionLeaf({ signed: true }),
      normal: dimensionLeaf({ signed: true }),
      wide: dimensionLeaf({ signed: true }),
    }),
  }),
  spacing: tokenObject({
    scale: tokenObject({
      0: dimensionLeaf(),
      1: dimensionLeaf(),
      2: dimensionLeaf(),
      3: dimensionLeaf(),
      4: dimensionLeaf(),
      6: dimensionLeaf(),
      8: dimensionLeaf(),
      12: dimensionLeaf(),
      16: dimensionLeaf(),
      24: dimensionLeaf(),
    }),
    semantic: tokenObject({
      inline: dimensionLeaf(),
      inset: dimensionLeaf(),
      stack: dimensionLeaf(),
      section: dimensionLeaf(),
    }),
  }),
  containers: tokenObject({
    narrow: dimensionLeaf(),
    content: dimensionLeaf(),
    wide: dimensionLeaf(),
    full: dimensionLeaf(),
  }),
  breakpoints: tokenObject({
    sm: dimensionLeaf({ absoluteOnly: true }),
    md: dimensionLeaf({ absoluteOnly: true }),
    lg: dimensionLeaf({ absoluteOnly: true }),
    xl: dimensionLeaf({ absoluteOnly: true }),
  }),
  layers: tokenObject({
    base: integerLeaf("an integer", 0),
    dropdown: integerLeaf("an integer", 0),
    sticky: integerLeaf("an integer", 0),
    overlay: integerLeaf("an integer", 0),
    modal: integerLeaf("an integer", 0),
    toast: integerLeaf("an integer", 0),
    tooltip: integerLeaf("an integer", 0),
  }),
  radius: tokenObject({
    none: dimensionLeaf(),
    sm: dimensionLeaf(),
    md: dimensionLeaf(),
    lg: dimensionLeaf(),
    full: dimensionLeaf(),
  }),
  shadow: tokenObject({
    sm: safeStringLeaf("a shadow literal"),
    md: safeStringLeaf("a shadow literal"),
    lg: safeStringLeaf("a shadow literal"),
    focus: safeStringLeaf("a shadow literal"),
  }),
  motion: tokenObject({
    duration: tokenObject({
      fast: timeLeaf(),
      normal: timeLeaf(),
      slow: timeLeaf(),
      reduced: timeLeaf(),
    }),
    easing: tokenObject({
      standard: safeStringLeaf("an easing function"),
      entrance: safeStringLeaf("an easing function"),
      exit: safeStringLeaf("an easing function"),
    }),
  }),
});

function isTokenRefObject(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "$ref";
}

function walkTokenNode(node, value, path, leaves) {
  if (node.leaf) {
    if (isPlainObject(value)) {
      if (
        isTokenRefObject(value) &&
        typeof value.$ref === "string" &&
        value.$ref.trim().length > 0
      ) {
        leaves.set(path, { node, ref: value.$ref.trim() });
        return;
      }
      throw new Error(
        `"${path}" must be a literal value or exactly {"$ref": "dot.separated.path"}.`,
      );
    }
    const error = node.validate(value);
    if (error) throw new Error(`"${path}" ${error}`);
    leaves.set(path, { node, literal: value });
    return;
  }
  if (!isPlainObject(value)) {
    throw new Error(`Expected "${path}" to be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!(key in node.properties)) {
      throw new Error(`"${path}" has unknown field "${key}".`);
    }
  }
  for (const key of node.required) {
    if (!(key in value)) {
      throw new Error(`"${path}" is missing required field "${key}".`);
    }
  }
  for (const key of Object.keys(value)) {
    walkTokenNode(node.properties[key], value[key], `${path}.${key}`, leaves);
  }
}

/**
 * Resolve every `$ref` to its ultimate literal and reject a missing target, a
 * cycle, or a reference whose resolved literal is not valid for the referring
 * slot (for example an integer layer referencing a color, or a breakpoint
 * referencing a relative length).
 */
function resolveTokenRefs(leaves) {
  for (const [path, entry] of leaves) {
    if (!entry.ref) continue;
    const chain = [path];
    const seen = new Set([path]);
    let target = entry.ref;
    for (;;) {
      if (!leaves.has(target)) {
        throw new Error(
          `"${path}" $ref target "${target}" does not exist in ${TOKENS_SOURCE_FILENAME}.`,
        );
      }
      if (seen.has(target)) {
        chain.push(target);
        throw new Error(
          `${TOKENS_SOURCE_FILENAME} token $ref cycle detected: ${chain.join(" -> ")}.`,
        );
      }
      seen.add(target);
      chain.push(target);
      const next = leaves.get(target);
      if (!next.ref) {
        const error = entry.node.validate(next.literal);
        if (error) {
          throw new Error(
            `"${path}" has an incompatible $ref to "${target}": expected ` +
              `${entry.node.describe}, resolved to ${next.node.describe}.`,
          );
        }
        break;
      }
      target = next.ref;
    }
  }
}

/**
 * Validate a package-owned `tokens.source.json` (schemaVersion 1) and return
 * both the raw object and its flattened leaf map. Every leaf accepts a
 * type-appropriate literal or exactly `{"$ref": "dot.separated.path"}`. This is
 * the single validation authority for token sources: missing targets, cycles,
 * and type-incompatible references are all rejected here.
 */
function validateTokenSource(raw) {
  if (!isPlainObject(raw)) {
    throw new Error(`${TOKENS_SOURCE_FILENAME} must be a JSON object.`);
  }
  assertKnownFields(raw, ["$schema", "schemaVersion", ...TOKEN_GROUP_KEYS], TOKENS_SOURCE_FILENAME);
  if (raw.schemaVersion !== TOKENS_SOURCE_SCHEMA_VERSION) {
    throw new Error(
      `${TOKENS_SOURCE_FILENAME} has schemaVersion ${JSON.stringify(
        raw.schemaVersion,
      )}; expected ${TOKENS_SOURCE_SCHEMA_VERSION}.`,
    );
  }
  const leaves = new Map();
  for (const key of TOKEN_GROUP_KEYS) {
    if (!(key in raw)) {
      throw new Error(`${TOKENS_SOURCE_FILENAME} is missing required group "${key}".`);
    }
    walkTokenNode(TOKEN_SHAPE[key], raw[key], key, leaves);
  }
  resolveTokenRefs(leaves);
  return { tokens: raw, leaves };
}

/**
 * Validate a package-owned `tokens.source.json` (schemaVersion 1). Every leaf
 * accepts a type-appropriate literal or exactly `{"$ref": "dot.separated.path"}`.
 * Returns the raw object; token values stay package-owned.
 */
export function parseTokenSource(raw) {
  return validateTokenSource(raw).tokens;
}

/** Assign `value` at a dot-separated path, creating intermediate objects. */
function setAtPath(target, path, value) {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!isPlainObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

/** Follow a validated `$ref` chain to its ultimate literal. */
function resolveUltimateLiteral(leaves, path) {
  let entry = leaves.get(path);
  while (entry.ref) entry = leaves.get(entry.ref);
  return entry.literal;
}

/**
 * Validate a token source and return a deep, fully resolved copy in which every
 * `$ref` has been replaced by its ultimate literal. Reference safety is already
 * guaranteed by {@link validateTokenSource}, so resolution can follow each
 * chain without re-checking. Key order mirrors the canonical token shape.
 */
export function resolveTokenSource(raw) {
  const { leaves } = validateTokenSource(raw);
  const resolved = {};
  for (const [path, entry] of leaves) {
    const literal = entry.ref ? resolveUltimateLiteral(leaves, path) : entry.literal;
    setAtPath(resolved, path.split("."), literal);
  }
  return resolved;
}

/** Read and validate the package-owned V4 `tokens.source.json`. */
export function readTokensSource(packageDir) {
  const tokensPath = join(packageDir, TOKENS_SOURCE_FILENAME);
  if (!existsSync(tokensPath)) {
    throw new Error(
      `Missing token source ${TOKENS_SOURCE_FILENAME} in ${packageDir}. ` +
        `Every V4 design system must declare its semantic tokens.`,
    );
  }
  let raw;
  try {
    raw = readJsonFile(tokensPath);
  } catch (error) {
    throw new Error(`Invalid JSON in ${tokensPath}: ${error.message}`);
  }
  return parseTokenSource(raw);
}

/** Flatten a token subtree into dot-separated leaf names (never values). */
function flattenTokenNames(value, prefix = "") {
  if (isPlainObject(value) && !isTokenRefObject(value)) {
    const names = [];
    for (const key of Object.keys(value)) {
      names.push(...flattenTokenNames(value[key], prefix ? `${prefix}.${key}` : key));
    }
    return names;
  }
  return [prefix];
}

/** Build the manifest `tokens` block: group names, artifact paths, and naming. */
function buildTokenManifest(tokens, uiClass) {
  const groups = {};
  for (const key of TOKEN_GROUP_KEYS) {
    groups[key] = flattenTokenNames(tokens[key]);
  }
  const names = normalizeTokenNames(
    tokenNaming(uiClass),
    `${DESIGN_SYSTEM_MANIFEST_FILENAME} "tokens"`,
  );
  return {
    groups,
    artifacts: { typescript: "./tokens", css: "./styles.css", tailwind: "./tailwind.css" },
    names,
  };
}

/** Validate a generated V4 `design-system.json` manifest. */
export function parseV4Manifest(raw) {
  if (!isPlainObject(raw)) {
    throw new Error(`${DESIGN_SYSTEM_MANIFEST_FILENAME} must be a JSON object.`);
  }
  assertKnownFields(raw, V4_MANIFEST_ROOT_FIELDS, DESIGN_SYSTEM_MANIFEST_FILENAME);
  if (raw.schemaVersion !== MANIFEST_V4_SCHEMA_VERSION) {
    throw new Error(
      `${DESIGN_SYSTEM_MANIFEST_FILENAME} has schemaVersion ${JSON.stringify(
        raw.schemaVersion,
      )}; expected ${MANIFEST_V4_SCHEMA_VERSION}.`,
    );
  }
  if (raw.contract !== "v4") {
    throw new Error(
      `${DESIGN_SYSTEM_MANIFEST_FILENAME} must declare "contract": "v4" (received ${JSON.stringify(
        raw.contract ?? null,
      )}).`,
    );
  }
  if (raw.generated !== GENERATED_MARKER) {
    throw new Error(
      `${DESIGN_SYSTEM_MANIFEST_FILENAME} "generated" must be ${JSON.stringify(
        GENERATED_MARKER,
      )} (received ${JSON.stringify(raw.generated ?? null)}).`,
    );
  }
  const id = assertSystemId(raw.id);
  const name = requireNonEmptyString(raw.name, "name");
  if (typeof raw.package !== "string" || !/^@prism-system\/ui-[a-z0-9-]+$/.test(raw.package)) {
    throw new Error(
      `${DESIGN_SYSTEM_MANIFEST_FILENAME} "package" must be an @prism-system/ui-* name ` +
        `(received ${JSON.stringify(raw.package ?? null)}).`,
    );
  }
  const version = requireNonEmptyString(raw.version, "version");
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(
      `${DESIGN_SYSTEM_MANIFEST_FILENAME} "version" ${JSON.stringify(version)} is not a valid ` +
        `semantic version.`,
    );
  }
  if (!isPlainObject(raw.exports) || Object.keys(raw.exports).length === 0) {
    throw new Error(`${DESIGN_SYSTEM_MANIFEST_FILENAME} "exports" must be a non-empty object.`);
  }
  return {
    $schema: raw.$schema,
    schemaVersion: MANIFEST_V4_SCHEMA_VERSION,
    generated: GENERATED_MARKER,
    contract: "v4",
    id,
    name,
    package: raw.package,
    version,
    exports: raw.exports,
    publicApi: normalizePublicApi(raw.publicApi, `${DESIGN_SYSTEM_MANIFEST_FILENAME} "publicApi"`),
    components: normalizeV4Components(
      raw.components,
      `${DESIGN_SYSTEM_MANIFEST_FILENAME} "components"`,
    ),
    design: normalizeDesign(raw.design, "design"),
    rules: normalizeRules(raw.rules, "rules"),
    tokens: normalizeTokenManifest(raw.tokens),
    docs: normalizeDocs(raw.docs, `${DESIGN_SYSTEM_MANIFEST_FILENAME} "docs"`, true),
  };
}

/* -------------------------------------------------------------------------- */
/* Source descriptor dispatch (V2 / V4)                                       */
/* -------------------------------------------------------------------------- */

/** Read and validate the package-owned `design-system.source.json`. */
export function readSourceDescriptor(packageDir) {
  const sourcePath = join(packageDir, DESIGN_SYSTEM_SOURCE_FILENAME);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Missing source descriptor ${DESIGN_SYSTEM_SOURCE_FILENAME} in ${packageDir}. ` +
        `Every design system must declare its public API explicitly.`,
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
  // Strict dispatch: only (1, "v2") and (2, "v4") are accepted.
  const contract = dispatchSchemaContract(raw, DESIGN_SYSTEM_SOURCE_FILENAME);
  if (contract === "v4") {
    const descriptor = parseV4SourceDescriptor(raw);
    return { ...descriptor, tokens: readTokensSource(packageDir) };
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
 * Locate the single `<callName>({ ... })` call in a source file and return the
 * span of its argument object. The first argument must be an object literal and
 * the object's closing brace must be the direct call terminator, so conditional,
 * identifier, call, member, parenthesized, type-asserted, and extra-argument
 * wrappers are rejected. Fails closed on a missing or ambiguous call.
 */
function findDesignSystemCall(tokens, callName, fileLabel) {
  const callIndexes = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token.type === "ident" &&
      token.value === callName &&
      next.type === "punct" &&
      next.value === "("
    ) {
      callIndexes.push(index);
    }
  }
  if (callIndexes.length === 0) {
    throw new Error(`${fileLabel} does not call ${callName}(...).`);
  }
  if (callIndexes.length > 1) {
    throw new Error(
      `${fileLabel} contains ${callIndexes.length} ${callName}(...) calls; ` +
        `exactly one is required to read the runtime version unambiguously.`,
    );
  }

  const argumentStart = callIndexes[0] + 2;
  const firstArgument = tokens[argumentStart];
  if (!(firstArgument?.type === "punct" && firstArgument.value === "{")) {
    throw new Error(
      `${callName}(...) must be called with a single object literal argument; ` +
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
    throw new Error(`${callName}(...) object is unterminated.`);
  }

  const afterObject = tokens[objectEnd + 1];
  if (!(afterObject?.type === "punct" && afterObject.value === ")")) {
    throw new Error(
      `${callName}(...) object must be the direct call argument with no extra ` +
        "arguments, type assertions, or trailing expressions.",
    );
  }
  const afterCall = tokens[objectEnd + 2];
  const endsExpression =
    afterCall === undefined ||
    (afterCall.type === "punct" && [";", ",", ")", "]", "}"].includes(afterCall.value));
  if (!endsExpression) {
    throw new Error(
      `${callName}(...) call must end the expression; a call, member access, or type ` +
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
function topLevelObjectProperties(tokens, open, close, callName) {
  const properties = [];
  let index = open + 1;

  const rejectForm = (reason) => {
    throw new Error(
      `${callName}(...) object contains an unsupported top-level property form ` +
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
 * Runtime identity helpers. The `contract` argument defaults to `"v2"` so every
 * existing V2 caller keeps its exact behavior and messages; V4 callers pass
 * `"v4"` to parse the `defineDesignSystemV4(...)` call in `src/design-system.ts`.
 */
const RUNTIME_CONTRACTS = Object.freeze({
  v2: Object.freeze({ callName: "defineDesignSystemV2", fileLabel: "src/index.ts" }),
  v4: Object.freeze({ callName: "defineDesignSystemV4", fileLabel: "src/design-system.ts" }),
});

function resolveRuntimeContract(contract) {
  const resolved = RUNTIME_CONTRACTS[contract];
  if (!resolved) {
    throw new Error(
      `Unsupported runtime contract ${JSON.stringify(contract)}; expected "v2" or "v4".`,
    );
  }
  return resolved;
}

/**
 * Read the single top-level `version` of the `defineDesignSystemV2(...)` or
 * `defineDesignSystemV4(...)` argument, selected by `contract` (default
 * `"v2"`). The value must be exactly one static string literal or a
 * no-substitution template literal (comments around it are allowed). Fails
 * closed on a missing, duplicate, nested-only, commented-only, or dynamic
 * (concatenated, identifier, member access, call, interpolated, conditional, or
 * otherwise non-literal) version.
 *
 * @param {string} source  Runtime source text.
 * @param {"v2" | "v4"} [contract="v2"]  Which runtime call to read.
 * @returns {{ version: string, valueStart: number, valueEnd: number }}
 */
export function parseRuntimeDesignSystemVersion(source, contract = "v2") {
  const { callName, fileLabel } = resolveRuntimeContract(contract);
  const tokens = tokenizeRuntimeSource(source);
  const span = findDesignSystemCall(tokens, callName, fileLabel);
  const properties = topLevelObjectProperties(tokens, span.open, span.close, callName);
  const versions = properties.filter((property) => property.key === "version");
  if (versions.length === 0) {
    throw new Error(`${callName}(...) must declare exactly one top-level string "version".`);
  }
  if (versions.length > 1) {
    throw new Error(
      `${callName}(...) declares ${versions.length} top-level "version" properties; ` +
        `exactly one is required.`,
    );
  }
  const [entry] = versions;
  if (entry.kind !== "string") {
    throw new Error(
      `The top-level "version" in ${callName}(...) must be exactly one static string ` +
        "literal or no-substitution template literal. Concatenation, identifiers, member access, " +
        "calls, template interpolation, conditional/binary expressions, and other dynamic values " +
        "are not allowed.",
    );
  }
  return { version: entry.value, valueStart: entry.valueStart, valueEnd: entry.valueEnd };
}

/**
 * Read the runtime `DesignSystem.version` string. `contract` selects the
 * runtime call and defaults to `"v2"` (V2: `src/index.ts` /
 * `defineDesignSystemV2`; V4: `src/design-system.ts` / `defineDesignSystemV4`).
 */
export function readRuntimeDesignSystemVersion(source, contract = "v2") {
  return parseRuntimeDesignSystemVersion(source, contract).version;
}

/**
 * Return `source` with the runtime `DesignSystem.version` set to `version`,
 * replacing only the inner string text of the validated top-level property.
 * `contract` defaults to `"v2"` for backward compatibility.
 */
export function syncRuntimeDesignSystemVersion(source, version, contract = "v2") {
  const parsed = parseRuntimeDesignSystemVersion(source, contract);
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
  const uiClass = requireNonEmptyString(pkg.prismSystem?.uiClass, "prismSystem.uiClass");
  const displayName = requireNonEmptyString(pkg.prismSystem?.name, "prismSystem.name");
  return { pkg, version, tokensExport, uiClass, displayName };
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
  const { pkg, version, tokensExport, uiClass, displayName } = readPackageForManifest(
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

  if (source.contract === "v4") {
    return buildV4Manifest({
      resolvedId,
      pkg,
      version,
      tokensExport,
      uiClass,
      displayName,
      source,
    });
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

/** Build the canonical V4 manifest object. Pure and synchronous. */
function buildV4Manifest({ resolvedId, pkg, version, tokensExport, uiClass, displayName, source }) {
  const implementedOptional = V4_OPTIONAL_COMPONENTS.filter((name) => name in source.components);
  return {
    $schema: V4_MANIFEST_SCHEMA_URL,
    schemaVersion: MANIFEST_V4_SCHEMA_VERSION,
    generated: GENERATED_MARKER,
    contract: "v4",
    id: resolvedId,
    name: displayName,
    package: toPackageName(resolvedId),
    version,
    exports: pkg.exports,
    publicApi: {
      ".": [...V4_REQUIRED_COMPONENTS, ...implementedOptional, "DesignSystem", tokensExport],
      "./tokens": [tokensExport],
    },
    components: source.components,
    design: source.design,
    rules: source.rules,
    tokens: buildTokenManifest(source.tokens, uiClass),
    docs: { readme: "./README.md", agents: "./AGENTS.md", ...(source.docs ?? {}) },
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
 * Render the three V4 token artifacts for a package from its validated
 * `tokens.source.json`. `parseTokenSource`/`resolveTokenSource` guarantee the
 * source is type-safe and every `$ref` resolves before rendering. Pure.
 */
export function renderV4TokenArtifactFiles(packageDir) {
  const pkg = readJsonFile(join(packageDir, "package.json"));
  const tokensExport = requireNonEmptyString(
    pkg.prismSystem?.tokensExport,
    "prismSystem.tokensExport",
  );
  const uiClass = requireNonEmptyString(pkg.prismSystem?.uiClass, "prismSystem.uiClass");
  const tokensSource = readTokensSource(packageDir);
  const resolvedTokens = resolveTokenSource(tokensSource);
  return buildTokenArtifactFiles({ tokensExport, uiClass, resolvedTokens });
}

/**
 * Compare the on-disk manifest (and, for V4, the three token artifacts) with a
 * freshly built/rendered set. V2 packages check only `design-system.json`, so
 * their output and failure messages are unchanged.
 *
 * @returns {{ ok: boolean, failures: string[], expected: object | null, actual: object | null, tokenArtifacts: object | null }}
 */
export function checkDesignSystemManifest({ id, packageDir }) {
  let expected;
  try {
    expected = buildManifest({ id, packageDir });
  } catch (error) {
    return {
      ok: false,
      failures: [error.message],
      expected: null,
      actual: null,
      tokenArtifacts: null,
    };
  }
  const manifestPath = join(packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME);
  const failures = [];
  let actual = null;
  if (!existsSync(manifestPath)) {
    failures.push(
      `Missing generated manifest ${DESIGN_SYSTEM_MANIFEST_FILENAME}; regenerate it with ` +
        `"pnpm ds:manifest ${id} --write".`,
    );
  } else {
    try {
      actual = readJsonFile(manifestPath);
    } catch (error) {
      failures.push(`Invalid JSON in ${DESIGN_SYSTEM_MANIFEST_FILENAME}: ${error.message}`);
      actual = null;
    }
    if (actual !== null) {
      const same = JSON.stringify(canonicalize(expected)) === JSON.stringify(canonicalize(actual));
      if (!same) {
        failures.push(
          `${DESIGN_SYSTEM_MANIFEST_FILENAME} is out of date with package.json and ` +
            `${DESIGN_SYSTEM_SOURCE_FILENAME}; regenerate it with ` +
            `"pnpm ds:manifest ${id} --write".`,
        );
      }
    }
  }

  let tokenArtifacts = null;
  if (expected.contract === "v4") {
    try {
      const result = checkTokenArtifactFiles({
        id,
        packageDir,
        files: renderV4TokenArtifactFiles(packageDir),
      });
      tokenArtifacts = result.artifacts;
      failures.push(...result.failures);
    } catch (error) {
      failures.push(error.message);
    }
  }

  return { ok: failures.length === 0, failures, expected, actual, tokenArtifacts };
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

/**
 * Render every generated artifact for a package without writing: the manifest
 * source plus, for V4 only, the three token artifact descriptors. Pure except
 * for reading package-owned inputs.
 */
export async function renderDesignSystemArtifacts({ id, packageDir }) {
  const { manifest, source } = await renderDesignSystemManifest({ id, packageDir });
  const tokenArtifacts = manifest.contract === "v4" ? renderV4TokenArtifactFiles(packageDir) : [];
  return { manifest, manifestSource: source, tokenArtifacts };
}

/**
 * Write a set of files atomically and transactionally: capture every target's
 * previous bytes first, then write each via a temp-file rename. If any write
 * fails, restore the captured bytes (and remove files that did not exist) so the
 * package is never left half-generated.
 */
function writeFilesTransactional(writes) {
  const backups = writes.map((write) => ({
    path: write.path,
    content: existsSync(write.path) ? readFileSync(write.path, "utf8") : null,
  }));
  try {
    for (const write of writes) writeFileAtomic(write.path, write.content);
  } catch (error) {
    for (const backup of backups) {
      try {
        if (backup.content === null) rmSync(backup.path, { force: true });
        else writeFileSync(backup.path, backup.content, "utf8");
      } catch {
        // Best-effort rollback; surface the original failure instead.
      }
    }
    throw error;
  }
}

/**
 * Build, format, and atomically write the generated manifest. For V4 packages
 * this also writes the three deterministic token artifacts
 * (`src/tokens/index.ts`, `src/styles/tokens.css`, `src/styles/tailwind.css`)
 * in one transaction. V2 packages write only `design-system.json`.
 */
export async function writeDesignSystemManifest({ id, packageDir }) {
  const { manifest, manifestSource, tokenArtifacts } = await renderDesignSystemArtifacts({
    id,
    packageDir,
  });
  const writes = [
    { path: join(packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME), content: manifestSource },
    ...tokenArtifacts.map((artifact) => ({
      path: join(packageDir, artifact.relativePath),
      content: artifact.content,
    })),
  ];
  writeFilesTransactional(writes);
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
