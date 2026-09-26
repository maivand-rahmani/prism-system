#!/usr/bin/env node
/**
 * Generated design-system manifest tooling.
 *
 * Every design-system package ships a generated `design-system.json` manifest
 * so an external coding agent can understand the installed system without
 * reading package internals. The manifest is derived deterministically from
 * three package-owned inputs:
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
  assertSystemId,
  readJsonFile,
  repoRoot,
  toPackageName,
} from "./register-design-system.mjs";
import {
  TOKEN_NAMESPACE_PATTERN,
  TOKEN_NAME_FIELDS,
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

/**
 * Version of the package-owned source descriptor schema
 * (`design-system.source.json`). The source descriptor stays schemaVersion 3;
 * the generated, shipped manifest is versioned independently below.
 */
export const DESIGN_SYSTEM_SCHEMA_VERSION = 3;
/** The single current numeric component contract version. */
export const CONTRACT_VERSION = 4;
/** Version of the generated, shipped manifest schema (`design-system.json`). */
export const DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION = 4;

/** `$schema` references and the generated marker written into every manifest. */
export const MANIFEST_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system.schema.json";
export const SOURCE_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/design-system.source.schema.json";
export const GENERATED_MARKER = "prism-system/design-system-manifest";

/* -------------------------------------------------------------------------- */
/* Contract constants                                                         */
/* -------------------------------------------------------------------------- */

/** The 29 canonical required component names, in order. */
export const REQUIRED_COMPONENTS = Object.freeze([
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
  "Center",
  "Cluster",
  "Sidebar",
  "AspectRatio",
  "Combobox",
  "DatePicker",
  "NumberField",
  "Slider",
  "FileUpload",
]);

/** The 17 optional component names a system may implement, in order. */
export const OPTIONAL_COMPONENTS = Object.freeze([
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
  "Metric",
  "DescriptionList",
  "Timeline",
  "Meter",
  "EmptyState",
]);

/** Every component name a descriptor or manifest may declare. */
export const COMPONENT_NAMES = Object.freeze([...REQUIRED_COMPONENTS, ...OPTIONAL_COMPONENTS]);

/**
 * The canonical capability-category inventory generated into every shipped
 * manifest. This is the single definition of which scoped component families
 * each category covers: per-class arrays list the required or optional
 * components the category may expose, in canonical order. Availability is
 * determined only by the names present in a system's `components` map; this
 * inventory is a generated category-membership reference and is never declared
 * in a package-owned source descriptor.
 */
export const CAPABILITY_CATEGORIES = Object.freeze({
  composition: Object.freeze({
    required: Object.freeze(["Container", "Stack", "Center", "Cluster", "Sidebar", "AspectRatio"]),
    optional: Object.freeze(["Grid", "Section"]),
  }),
  forms: Object.freeze({
    required: Object.freeze([
      "FormField",
      "Combobox",
      "DatePicker",
      "NumberField",
      "Slider",
      "FileUpload",
    ]),
    optional: Object.freeze([]),
  }),
  "data-display": Object.freeze({
    required: Object.freeze([]),
    optional: Object.freeze([
      "Table",
      "Pagination",
      "Progress",
      "Metric",
      "DescriptionList",
      "Timeline",
      "Meter",
      "EmptyState",
    ]),
  }),
});

/** Canonical capability-category keys, in generation order. */
export const CAPABILITY_CATEGORY_KEYS = Object.freeze(Object.keys(CAPABILITY_CATEGORIES));

/** Token source schema version. */
export const TOKENS_SOURCE_SCHEMA_VERSION = 1;

/** The package-owned semantic token source. Never shipped in the tarball. */
export const TOKENS_SOURCE_FILENAME = "tokens.source.json";

/** `$schema` reference written into the token source. */
export const TOKENS_SOURCE_SCHEMA_URL =
  "https://github.com/maivand-rahmani/prism-system/schemas/tokens.source.schema.json";

/** Token group keys exposed by a manifest, matching the token source groups. */
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

const SOURCE_ROOT_FIELDS = Object.freeze([
  "$schema",
  "schemaVersion",
  "contractVersion",
  "name",
  "components",
  "design",
  "rules",
  "docs",
]);
const MANIFEST_ROOT_FIELDS = Object.freeze([
  "$schema",
  "schemaVersion",
  "generated",
  "contractVersion",
  "id",
  "name",
  "package",
  "version",
  "exports",
  "publicApi",
  "components",
  "capabilities",
  "design",
  "rules",
  "tokens",
  "docs",
]);
const COMPONENT_FIELDS = Object.freeze([
  "variants",
  "sizes",
  "members",
  "description",
  "docs",
  "example",
]);
const COMPONENT_META_FIELDS = Object.freeze(["description", "docs", "example"]);
const DOC_FIELDS = Object.freeze([
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
/* Schema/contract metadata and validation                                    */
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
 * Enforce the single current contract metadata: the expected numeric
 * `schemaVersion` and `contractVersion: 4`. The package-owned source descriptor
 * defaults to schemaVersion 3; the generated shipped manifest passes its own
 * schemaVersion 4. Every other combination — including a missing field, a
 * historical `contract` string, or a fabricated pair — is rejected so no
 * obsolete contract shape is ever silently accepted.
 */
export function assertContractMetadata(
  raw,
  label = "design-system descriptor",
  schemaVersion = DESIGN_SYSTEM_SCHEMA_VERSION,
) {
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  if (raw.schemaVersion !== schemaVersion) {
    throw new Error(
      `${label} has schemaVersion ${JSON.stringify(raw.schemaVersion)}; ` +
        `expected ${schemaVersion}.`,
    );
  }
  if (raw.contractVersion !== CONTRACT_VERSION) {
    throw new Error(
      `${label} has contractVersion ${JSON.stringify(raw.contractVersion)}; ` +
        `expected ${CONTRACT_VERSION}.`,
    );
  }
}

/**
 * Read a required component field. All three API fields must be present; the
 * descriptor is the explicit contract, so a missing field is never silently
 * defaulted to an empty array (an explicitly empty array is valid).
 */
function requireComponentField(raw, key, name) {
  if (!(key in raw)) {
    throw new Error(
      `Component "${name}" is missing required field "${key}"; ` +
        `"variants", "sizes", and "members" are required (empty arrays are allowed).`,
    );
  }
  return raw[key];
}

/**
 * Validate one component entry for a descriptor or manifest. `variants`,
 * `sizes`, and `members` are required unique string arrays (empty allowed);
 * `description`, `docs`, and `example` are optional metadata.
 */
function normalizeComponent(raw, name) {
  if (!isPlainObject(raw)) {
    throw new Error(`Component "${name}" must be an object.`);
  }
  const allowed = new Set(COMPONENT_FIELDS);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Component "${name}" has unknown field "${key}"; allowed fields are ` +
          `${COMPONENT_FIELDS.join(", ")}.`,
      );
    }
  }
  const component = {
    variants: requireStringArray(requireComponentField(raw, "variants", name), `${name}.variants`),
    sizes: requireStringArray(requireComponentField(raw, "sizes", name), `${name}.sizes`),
    members: requireStringArray(requireComponentField(raw, "members", name), `${name}.members`),
  };
  for (const key of COMPONENT_META_FIELDS) {
    if (raw[key] !== undefined) {
      component[key] = requireNonEmptyString(raw[key], `${name}.${key}`);
    }
  }
  return component;
}

/**
 * Validate the component map: all 29 required names must be present and
 * every declared optional name must be a known optional component. Absence
 * means unavailable, so a boolean `false` entry is rejected as a non-object and
 * an unknown name is rejected outright.
 */
function normalizeComponents(raw, label) {
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  const declared = Object.keys(raw);
  const missing = REQUIRED_COMPONENTS.filter((name) => !declared.includes(name));
  const unknown = declared.filter((name) => !COMPONENT_NAMES.includes(name));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `${label} must declare all 29 required components and only implemented optional ` +
        `components.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}${
          unknown.length > 0 ? ` Unknown: ${unknown.join(", ")}.` : ""
        }`,
    );
  }
  const components = {};
  for (const name of COMPONENT_NAMES) {
    if (name in raw) components[name] = normalizeComponent(raw[name], name);
  }
  return components;
}

/**
 * Validate the generated manifest's canonical capability-category inventory.
 * The categories must be exactly the canonical keys; each category must declare
 * both classes; every name must be unique, a known component, and of the class
 * its array represents; and each array must equal the canonical sequence
 * exactly (same membership and same order). Availability itself is never
 * determined here: it stays a question about the per-system `components` map.
 */
function normalizeCapabilities(raw) {
  const label = `${DESIGN_SYSTEM_MANIFEST_FILENAME} "capabilities"`;
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  assertKnownFields(raw, ["categories"], label);

  const categoriesLabel = `${label} "categories"`;
  const categories = raw.categories;
  if (!isPlainObject(categories)) {
    throw new Error(`${categoriesLabel} must be an object.`);
  }
  const declaredKeys = Object.keys(categories);
  const missing = CAPABILITY_CATEGORY_KEYS.filter((key) => !declaredKeys.includes(key));
  const unknown = declaredKeys.filter((key) => !CAPABILITY_CATEGORY_KEYS.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `${categoriesLabel} must declare exactly the canonical capability categories.` +
        `${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}${
          unknown.length > 0 ? ` Unknown: ${unknown.join(", ")}.` : ""
        }`,
    );
  }

  const normalized = {};
  for (const key of CAPABILITY_CATEGORY_KEYS) {
    const categoryLabel = `${categoriesLabel}["${key}"]`;
    const category = categories[key];
    if (!isPlainObject(category)) {
      throw new Error(`${categoryLabel} must be an object.`);
    }
    assertKnownFields(category, ["required", "optional"], categoryLabel);
    normalized[key] = {};
    for (const [className, members] of [
      ["required", REQUIRED_COMPONENTS],
      ["optional", OPTIONAL_COMPONENTS],
    ]) {
      const classLabel = `${categoryLabel}.${className}`;
      if (!(className in category)) {
        throw new Error(`${categoryLabel} is missing required field "${className}".`);
      }
      const names = requireStringArray(category[className], classLabel);
      const unknownNames = names.filter((name) => !COMPONENT_NAMES.includes(name));
      if (unknownNames.length > 0) {
        throw new Error(
          `${classLabel} contains unknown component name(s): ${unknownNames.join(", ")}.`,
        );
      }
      const wrongClass = names.filter((name) => !members.includes(name));
      if (wrongClass.length > 0) {
        throw new Error(
          `${classLabel} must list only ${className} components; wrong class: ` +
            `${wrongClass.join(", ")}.`,
        );
      }
      const canonical = CAPABILITY_CATEGORIES[key][className];
      if (JSON.stringify(names) !== JSON.stringify([...canonical])) {
        throw new Error(
          `${classLabel} must be exactly ${JSON.stringify([...canonical])} in canonical order ` +
            `(received ${JSON.stringify(names)}).`,
        );
      }
      normalized[key][className] = names;
    }
  }
  return { categories: normalized };
}

/** A fresh, mutable copy of the canonical capability inventory for generation. */
export function buildCapabilityCategories() {
  const categories = {};
  for (const key of CAPABILITY_CATEGORY_KEYS) {
    categories[key] = {
      required: [...CAPABILITY_CATEGORIES[key].required],
      optional: [...CAPABILITY_CATEGORIES[key].optional],
    };
  }
  return categories;
}

/** Validate package-relative documentation paths. */
function normalizeDocs(raw, label, requireCore) {
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must be an object.`);
  }
  assertKnownFields(raw, DOC_FIELDS, label);
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
  assertKnownFields(raw, TOKEN_NAME_FIELDS, label);
  const names = {};
  for (const key of TOKEN_NAME_FIELDS) {
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

/** Read and validate a package-owned `design-system.source.json`. */
export function parseSourceDescriptor(raw) {
  if (!isPlainObject(raw)) {
    throw new Error(`${DESIGN_SYSTEM_SOURCE_FILENAME} must be a JSON object.`);
  }
  assertKnownFields(raw, SOURCE_ROOT_FIELDS, DESIGN_SYSTEM_SOURCE_FILENAME);
  assertContractMetadata(raw, DESIGN_SYSTEM_SOURCE_FILENAME);
  const descriptor = {
    schemaVersion: DESIGN_SYSTEM_SCHEMA_VERSION,
    contractVersion: CONTRACT_VERSION,
    name: requireNonEmptyString(raw.name, "name"),
    components: normalizeComponents(
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
/* Token source validation                                                    */
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

/** Read and validate the package-owned `tokens.source.json`. */
export function readTokensSource(packageDir) {
  const tokensPath = join(packageDir, TOKENS_SOURCE_FILENAME);
  if (!existsSync(tokensPath)) {
    throw new Error(
      `Missing token source ${TOKENS_SOURCE_FILENAME} in ${packageDir}. ` +
        `Every design system must declare its semantic tokens.`,
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

/** Validate a generated `design-system.json` manifest. */
export function parseManifest(raw) {
  if (!isPlainObject(raw)) {
    throw new Error(`${DESIGN_SYSTEM_MANIFEST_FILENAME} must be a JSON object.`);
  }
  assertKnownFields(raw, MANIFEST_ROOT_FIELDS, DESIGN_SYSTEM_MANIFEST_FILENAME);
  assertContractMetadata(
    raw,
    DESIGN_SYSTEM_MANIFEST_FILENAME,
    DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
  );
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
    schemaVersion: DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
    generated: GENERATED_MARKER,
    contractVersion: CONTRACT_VERSION,
    id,
    name,
    package: raw.package,
    version,
    exports: raw.exports,
    publicApi: normalizePublicApi(raw.publicApi, `${DESIGN_SYSTEM_MANIFEST_FILENAME} "publicApi"`),
    components: normalizeComponents(
      raw.components,
      `${DESIGN_SYSTEM_MANIFEST_FILENAME} "components"`,
    ),
    capabilities: normalizeCapabilities(raw.capabilities),
    design: normalizeDesign(raw.design, "design"),
    rules: normalizeRules(raw.rules, "rules"),
    tokens: normalizeTokenManifest(raw.tokens),
    docs: normalizeDocs(raw.docs, `${DESIGN_SYSTEM_MANIFEST_FILENAME} "docs"`, true),
  };
}

/* -------------------------------------------------------------------------- */
/* Source descriptor                                                          */
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
  const descriptor = parseSourceDescriptor(raw);
  return { ...descriptor, tokens: readTokensSource(packageDir) };
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
 * token. This is enough to parse the `defineDesignSystem(...)` argument
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
 * Parse the top-level properties of the `defineDesignSystem(...)` object.
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
 * Runtime identity helpers. There is exactly one current runtime call,
 * `defineDesignSystem(...)` in `src/design-system.ts`.
 */
const RUNTIME_CONTRACT = Object.freeze({
  callName: "defineDesignSystem",
  fileLabel: "src/design-system.ts",
});

/**
 * Read the single top-level `version` of the `defineDesignSystem(...)`
 * argument. The value must be exactly one static string literal or a
 * no-substitution template literal (comments around it are allowed). Fails
 * closed on a missing, duplicate, nested-only, commented-only, or dynamic
 * (concatenated, identifier, member access, call, interpolated, conditional, or
 * otherwise non-literal) version.
 *
 * @param {string} source  Runtime source text.
 * @returns {{ version: string, valueStart: number, valueEnd: number }}
 */
export function parseRuntimeDesignSystemVersion(source) {
  const { callName, fileLabel } = RUNTIME_CONTRACT;
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
 * Read the runtime `DesignSystem.version` string from the package-owned
 * `src/design-system.ts` (`defineDesignSystem`).
 */
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

  const implementedOptional = OPTIONAL_COMPONENTS.filter((name) => name in source.components);
  return {
    $schema: MANIFEST_SCHEMA_URL,
    schemaVersion: DESIGN_SYSTEM_MANIFEST_SCHEMA_VERSION,
    generated: GENERATED_MARKER,
    contractVersion: CONTRACT_VERSION,
    id: resolvedId,
    name: displayName,
    package: toPackageName(resolvedId),
    version,
    exports: pkg.exports,
    publicApi: {
      ".": [...REQUIRED_COMPONENTS, ...implementedOptional, "DesignSystem", tokensExport],
      "./tokens": [tokensExport],
    },
    components: source.components,
    capabilities: { categories: buildCapabilityCategories() },
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
 * Render the three token artifacts for a package from its validated
 * `tokens.source.json`. `parseTokenSource`/`resolveTokenSource` guarantee the
 * source is type-safe and every `$ref` resolves before rendering. Pure.
 */
export function renderTokenArtifactFiles(packageDir) {
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
 * Compare the on-disk manifest and the three token artifacts with a freshly
 * built/rendered set.
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
  try {
    const result = checkTokenArtifactFiles({
      id,
      packageDir,
      files: renderTokenArtifactFiles(packageDir),
    });
    tokenArtifacts = result.artifacts;
    failures.push(...result.failures);
  } catch (error) {
    failures.push(error.message);
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
 * source plus the three token artifact descriptors. Pure except for reading
 * package-owned inputs.
 */
export async function renderDesignSystemArtifacts({ id, packageDir }) {
  const { manifest, source } = await renderDesignSystemManifest({ id, packageDir });
  const tokenArtifacts = renderTokenArtifactFiles(packageDir);
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
 * Build, format, and atomically write the generated manifest plus the three
 * deterministic token artifacts (`src/tokens/index.ts`, `src/styles/tokens.css`,
 * `src/styles/tailwind.css`) in one transaction.
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
