/**
 * Shared constants and small filesystem helpers for the consumer tooling.
 *
 * These values are the published consumer contract: the `@prism-system/ui-*`
 * package scope, the V2 manifest export subpath, and path-containment rules.
 * They are intentionally self-contained so `@prism-system/tools` has no runtime
 * dependency on the design-systems source repository.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

/** Lower-kebab-case system id, e.g. `pulse`, `fancy-tech`. */
export const SYSTEM_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Ids that are not design systems and can never be registered. */
export const RESERVED_SYSTEM_IDS = Object.freeze(["core", "showcase", "reference-app"]);
/** npm scope prefix for design-system packages. */
export const PACKAGE_SCOPE = "@prism-system/ui-";
/** Public subpath every design system exposes its structured manifest on. */
export const MANIFEST_EXPORT_SUBPATH = "./manifest";
/** Exact manifest filename a design system exposes at {@link MANIFEST_EXPORT_SUBPATH}. */
export const MANIFEST_EXPORT_TARGET = "./design-system.json";
/** Supported generated-manifest V2 schema version. Unknown versions fail closed. */
export const MANIFEST_SCHEMA_VERSION = 1;
/** Supported generated-manifest V4 schema version. */
export const MANIFEST_V4_SCHEMA_VERSION = 2;
/** The V2 contract identifier. */
export const CONTRACT_V2 = "v2";
/** The V4 contract identifier. */
export const CONTRACT_V4 = "v4";

/**
 * The canonical fourteen V2 component names, in order.
 *
 * Kept in the published tooling so strict usage validation can recognize local
 * primitive replacements without importing the source repository.
 */
export const V2_REQUIRED_COMPONENTS = Object.freeze([
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
]);

/**
 * The twenty canonical V4 required component names, in order.
 *
 * Kept in the published tooling so strict V4 manifest validation can verify the
 * full contract without importing the design-systems source repository.
 */
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

/**
 * The twelve V4 optional component names a system may implement, in order.
 * Absence means unavailable; any other declared name fails closed.
 */
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

/** Every component name a V4 manifest may declare (required first, then optional). */
export const V4_COMPONENT_NAMES = Object.freeze([
  ...V4_REQUIRED_COMPONENTS,
  ...V4_OPTIONAL_COMPONENTS,
]);

/** The required V4 per-component API fields (empty arrays are valid). */
export const V4_COMPONENT_REQUIRED_FIELDS = Object.freeze(["variants", "sizes", "members"]);
/** The optional V4 per-component metadata fields. */
export const V4_COMPONENT_OPTIONAL_FIELDS = Object.freeze(["description", "docs", "example"]);
/** Exactly the allowed V4 per-component keys. */
export const V4_COMPONENT_FIELDS = Object.freeze([
  ...V4_COMPONENT_REQUIRED_FIELDS,
  ...V4_COMPONENT_OPTIONAL_FIELDS,
]);

/** The nine V4 token groups exposed as flattened semantic token names. */
export const V4_TOKEN_GROUP_KEYS = Object.freeze([
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

/** The required V4 token artifact path fields. */
export const V4_TOKEN_ARTIFACT_FIELDS = Object.freeze(["typescript", "css", "tailwind"]);

/**
 * The exact V4 `tokens.names` fields a manifest must declare, in canonical
 * order. Both are required; a missing or unknown field fails closed.
 */
export const V4_TOKEN_NAME_FIELDS = Object.freeze(["cssVariablePrefix", "tailwindUtilityPrefix"]);

/** The canonical Tailwind utility namespace the V4 bridge aliases under. */
export const TAILWIND_UTILITY_PREFIX = "prism";

/**
 * A safe lower-kebab namespace: a lowercase letter followed by hyphen-separated
 * lowercase alphanumeric words. Rejects empty strings, leading digits,
 * uppercase, dots, underscores, and whitespace.
 */
export const TOKEN_NAMESPACE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Exactly the allowed V4 `docs` keys; `readme` and `agents` are required. */
export const V4_DOC_FIELDS = Object.freeze([
  "readme",
  "agents",
  "brief",
  "foundations",
  "components",
  "usage",
]);
/** The required V4 `docs` keys. */
export const V4_REQUIRED_DOC_FIELDS = Object.freeze(["readme", "agents"]);

/** Strip a leading UTF-8 BOM that Windows editors commonly add. */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Read and parse a JSON file, tolerating a leading BOM. */
export function readJsonFile(filePath) {
  return JSON.parse(stripBom(readFileSync(filePath, "utf8")));
}

/** `pulse` -> `@prism-system/ui-pulse` */
export function toPackageName(id) {
  return `${PACKAGE_SCOPE}${id}`;
}

/**
 * Resolve a path to its real location, following symlinks/junctions for every
 * ancestor that already exists. Not-yet-created leaf segments are re-appended
 * so callers can still validate paths before they are created.
 */
export function resolveRealPath(targetPath) {
  let current = resolve(targetPath);
  const missing = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  let real;
  try {
    real = realpathSync.native(current);
  } catch {
    real = current;
  }
  return missing.length > 0 ? join(real, ...missing) : real;
}

/** Throw when `target` resolves outside of `base` (path-traversal guard). */
export function assertWithin(base, target, label = "Path") {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedBase, resolvedTarget);
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new Error(`${label} escapes ${resolvedBase}: ${resolvedTarget}.`);
  }
  // An existing symlink/junction can make a lexically-contained path resolve
  // outside the base, so re-check the real paths (leaf paths may not exist yet).
  const realBase = resolveRealPath(resolvedBase);
  const realTarget = resolveRealPath(resolvedTarget);
  const realRel = relative(realBase, realTarget);
  if (realRel !== "" && (realRel.startsWith("..") || isAbsolute(realRel))) {
    throw new Error(`${label} escapes ${realBase}: ${realTarget}.`);
  }
  return resolvedTarget;
}
