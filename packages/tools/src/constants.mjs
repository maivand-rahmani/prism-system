/**
 * Shared constants and small filesystem helpers for the consumer tooling.
 *
 * These values are the published consumer contract: the `@prism-system/ui-*`
 * package scope, the manifest export subpath, and path-containment rules. They
 * are intentionally self-contained so `@prism-system/tools` has no runtime
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
/** The current generated-manifest schema version. Unknown versions fail closed. */
export const MANIFEST_SCHEMA_VERSION = 4;
/** The single current numeric component contract version. */
export const CONTRACT_VERSION = 4;

/**
 * The 29 canonical required component names, in order.
 *
 * Kept in the published tooling so strict manifest validation can verify the
 * full contract without importing the design-systems source repository.
 */
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

/**
 * The 17 optional component names a system may implement, in order.
 * Absence means unavailable; any other declared name fails closed.
 */
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

/** Every component name a manifest may declare (required first, then optional). */
export const COMPONENT_NAMES = Object.freeze([...REQUIRED_COMPONENTS, ...OPTIONAL_COMPONENTS]);

/**
 * The exact `capabilities.categories` keys every current manifest declares, in
 * canonical order. The categories are the generated grouping inventory, not a
 * per-system support list: whether a name is available is decided only by its
 * presence in `manifest.components`.
 */
export const CAPABILITY_CATEGORY_KEYS = Object.freeze(["composition", "forms", "data-display"]);

/** The exact fields of one capability category, in canonical order. */
export const CAPABILITY_CATEGORY_FIELDS = Object.freeze(["required", "optional"]);

/**
 * The exact approved generated `capabilities.categories` inventory, in canonical
 * order. Every current manifest must reproduce it exactly; a category lists the
 * contract membership of each name, never availability.
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

/** The required per-component API fields (empty arrays are valid). */
export const COMPONENT_REQUIRED_FIELDS = Object.freeze(["variants", "sizes", "members"]);
/** The optional per-component metadata fields. */
export const COMPONENT_OPTIONAL_FIELDS = Object.freeze(["description", "docs", "example"]);
/** Exactly the allowed per-component keys. */
export const COMPONENT_FIELDS = Object.freeze([
  ...COMPONENT_REQUIRED_FIELDS,
  ...COMPONENT_OPTIONAL_FIELDS,
]);

/** The nine token groups exposed as flattened semantic token names. */
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

/** The required token artifact path fields. */
export const TOKEN_ARTIFACT_FIELDS = Object.freeze(["typescript", "css", "tailwind"]);

/**
 * The exact `tokens.names` fields a manifest must declare, in canonical order.
 * Both are required; a missing or unknown field fails closed.
 */
export const TOKEN_NAME_FIELDS = Object.freeze(["cssVariablePrefix", "tailwindUtilityPrefix"]);

/** The canonical Tailwind utility namespace the Tailwind v4 bridge aliases under. */
export const TAILWIND_UTILITY_PREFIX = "prism";

/**
 * A safe lower-kebab namespace: a lowercase letter followed by hyphen-separated
 * lowercase alphanumeric words. Rejects empty strings, leading digits,
 * uppercase, dots, underscores, and whitespace.
 */
export const TOKEN_NAMESPACE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Exactly the allowed `docs` keys; `readme` and `agents` are required. */
export const DOC_FIELDS = Object.freeze([
  "readme",
  "agents",
  "brief",
  "foundations",
  "components",
  "usage",
]);
/** The required `docs` keys. */
export const REQUIRED_DOC_FIELDS = Object.freeze(["readme", "agents"]);

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
