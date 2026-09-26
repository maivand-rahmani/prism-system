/**
 * Complete, repository-independent design-system manifest validator.
 *
 * This is the runtime, fail-closed counterpart of
 * `schemas/design-system.schema.json`. It is shared by the registry `info` path
 * and the consumer install/connect verification path so both reject the same
 * malformed manifests. It imports only `constants.mjs` and `semver.mjs` (never
 * `consumer.mjs` or `registry.mjs`), so it can be reused without a cycle and
 * without reading the design-systems source repository.
 */

import {
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_FIELDS,
  CAPABILITY_CATEGORY_KEYS,
  COMPONENT_FIELDS,
  COMPONENT_NAMES,
  COMPONENT_OPTIONAL_FIELDS,
  COMPONENT_REQUIRED_FIELDS,
  CONTRACT_VERSION,
  DOC_FIELDS,
  MANIFEST_SCHEMA_VERSION,
  OPTIONAL_COMPONENTS,
  PACKAGE_SCOPE,
  REQUIRED_COMPONENTS,
  REQUIRED_DOC_FIELDS,
  RESERVED_SYSTEM_IDS,
  SYSTEM_ID_PATTERN,
  TOKEN_ARTIFACT_FIELDS,
  TOKEN_GROUP_KEYS,
  TOKEN_NAME_FIELDS,
  TOKEN_NAMESPACE_PATTERN,
} from "./constants.mjs";
import { isExactSemver } from "./semver.mjs";

/** The generated marker every shipped manifest must carry. */
export const MANIFEST_GENERATED_MARKER = "prism-system/design-system-manifest";

/** Exactly the allowed top-level manifest keys. */
export const MANIFEST_TOP_LEVEL_KEYS = Object.freeze([
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

/** Allowed `design.density` values. */
export const MANIFEST_DENSITIES = Object.freeze(["compact", "comfortable", "spacious"]);
/** Allowed `design.theme` values. */
export const MANIFEST_THEMES = Object.freeze(["light-first", "dark-first", "dual"]);
/** Allowed `design.radius` values. */
export const MANIFEST_RADII = Object.freeze(["none", "small", "medium", "large", "full"]);

/** Exactly the allowed `rules` keys. */
export const MANIFEST_RULE_KEYS = Object.freeze([
  "allowArbitraryColors",
  "allowArbitraryRadius",
  "allowArbitraryShadows",
  "allowPrimitiveDuplication",
]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** True for an array of unique, non-empty strings (the schema's string array). */
export function isUniqueStringArray(value) {
  if (!Array.isArray(value)) return false;
  const seen = new Set();
  for (const item of value) {
    if (!isNonEmptyString(item)) return false;
    if (seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

/** True for an own property of an object. */
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Record missing required keys and disallowed extra keys for an object with
 * `additionalProperties:false`. `allowedKeys` may be wider than `requiredKeys`
 * when some fields are optional (for example component metadata).
 */
function collectAllowedKeys(value, allowedKeys, requiredKeys, prefix, failures) {
  for (const key of requiredKeys) {
    if (!hasOwn(value, key)) {
      failures.push(`${prefix}${key} is required.`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      failures.push(`${prefix}${key} is not allowed.`);
    }
  }
}

/** Record missing and disallowed keys for an object with `additionalProperties:false`. */
function collectExactKeys(value, requiredKeys, prefix, failures) {
  collectAllowedKeys(value, requiredKeys, requiredKeys, prefix, failures);
}

/** True for a package-relative path like `./README.md`. */
function isPackageRelativePath(value) {
  return typeof value === "string" && value.startsWith("./") && value.length > 2;
}

/** True for a safe lower-kebab token namespace like `maivand-a` or `prism`. */
function isSafeTokenNamespace(value) {
  return typeof value === "string" && TOKEN_NAMESPACE_PATTERN.test(value);
}

function collectPackageNameFailures(value, failures) {
  if (typeof value !== "string" || !value.startsWith(PACKAGE_SCOPE)) {
    failures.push(`package must be a supported ${PACKAGE_SCOPE}* name.`);
    return;
  }
  const id = value.slice(PACKAGE_SCOPE.length);
  if (!SYSTEM_ID_PATTERN.test(id) || RESERVED_SYSTEM_IDS.includes(id)) {
    failures.push(`package ${JSON.stringify(value)} is not a supported ${PACKAGE_SCOPE}* name.`);
  }
}

function collectPublicApiFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("publicApi must be an object.");
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!isUniqueStringArray(entry)) {
      failures.push(`publicApi.${key} must be an array of unique non-empty strings.`);
    }
  }
}

function collectDesignFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("design must be an object.");
    return;
  }
  collectExactKeys(value, ["density", "theme", "radius", "keywords"], "design.", failures);
  if (!MANIFEST_DENSITIES.includes(value.density)) {
    failures.push(`design.density must be one of ${MANIFEST_DENSITIES.join(", ")}.`);
  }
  if (!MANIFEST_THEMES.includes(value.theme)) {
    failures.push(`design.theme must be one of ${MANIFEST_THEMES.join(", ")}.`);
  }
  if (!MANIFEST_RADII.includes(value.radius)) {
    failures.push(`design.radius must be one of ${MANIFEST_RADII.join(", ")}.`);
  }
  if (!isUniqueStringArray(value.keywords)) {
    failures.push("design.keywords must be an array of unique non-empty strings.");
  }
}

function collectRulesFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("rules must be an object.");
    return;
  }
  collectExactKeys(value, MANIFEST_RULE_KEYS, "rules.", failures);
  for (const key of MANIFEST_RULE_KEYS) {
    if (typeof value[key] !== "boolean") {
      failures.push(`rules.${key} must be a boolean.`);
    }
  }
}

/**
 * Strict current-contract detection. Only `(schemaVersion: 4,
 * contractVersion: 4)` is recognized; every other combination (including
 * missing fields and retired string `contract` markers) returns `null` so
 * callers can fail closed.
 */
export function detectManifestContract(manifest) {
  if (!isPlainObject(manifest)) return null;
  if (
    manifest.schemaVersion === MANIFEST_SCHEMA_VERSION &&
    manifest.contractVersion === CONTRACT_VERSION
  ) {
    return CONTRACT_VERSION;
  }
  return null;
}

function unsupportedManifestMessage(manifest) {
  const show = (value) => (value === undefined ? "undefined" : JSON.stringify(value));
  return (
    `Unsupported manifest metadata (schemaVersion ${show(manifest.schemaVersion)}, ` +
    `contractVersion ${show(manifest.contractVersion)}); expected ` +
    `(schemaVersion ${MANIFEST_SCHEMA_VERSION}, contractVersion ${CONTRACT_VERSION}).`
  );
}

/** Collect the component-map violations (all required names, known optionals only). */
function collectComponentFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("components must be an object.");
    return;
  }
  const declared = Object.keys(value);
  for (const name of REQUIRED_COMPONENTS) {
    if (!hasOwn(value, name)) failures.push(`components.${name} is required.`);
  }
  for (const name of declared) {
    if (!COMPONENT_NAMES.includes(name)) {
      failures.push(`components.${name} is not allowed.`);
    }
  }
  for (const name of COMPONENT_NAMES) {
    if (!hasOwn(value, name)) continue;
    const component = value[name];
    if (!isPlainObject(component)) {
      failures.push(`components.${name} must be an object.`);
      continue;
    }
    collectAllowedKeys(
      component,
      COMPONENT_FIELDS,
      COMPONENT_REQUIRED_FIELDS,
      `components.${name}.`,
      failures,
    );
    for (const field of COMPONENT_REQUIRED_FIELDS) {
      if (!isUniqueStringArray(component[field])) {
        failures.push(`components.${name}.${field} must be an array of unique non-empty strings.`);
      }
    }
    for (const field of COMPONENT_OPTIONAL_FIELDS) {
      if (component[field] !== undefined && !isNonEmptyString(component[field])) {
        failures.push(`components.${name}.${field} must be a non-empty string.`);
      }
    }
  }
}

/** True when two arrays are element-wise equal. */
function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Collect one capability category name-array's violations: uniqueness, known
 * component names, required-vs-optional classification, and exact equality with
 * the approved inventory.
 */
function collectCapabilityArrayFailures(value, { pool, expected, label }, failures) {
  if (!isUniqueStringArray(value)) {
    failures.push(`${label} must be an array of unique non-empty strings.`);
    return;
  }
  for (const name of value) {
    if (!COMPONENT_NAMES.includes(name)) {
      failures.push(`${label} contains unknown component ${JSON.stringify(name)}.`);
      continue;
    }
    if (!pool.includes(name)) {
      failures.push(
        `${label} must contain only ${pool === REQUIRED_COMPONENTS ? "required" : "optional"} ` +
          `components; ${JSON.stringify(name)} is ${
            pool === REQUIRED_COMPONENTS ? "optional" : "required"
          }.`,
      );
    }
  }
  if (arraysEqual(value, expected)) return;
  failures.push(
    expected.length === 0
      ? `${label} must be an empty array.`
      : `${label} must be exactly [${expected.join(", ")}].`,
  );
}

/**
 * Collect the `capabilities.categories` violations: exact category keys and
 * order, exactly the approved `required`/`optional` name arrays, known names,
 * uniqueness, and required-vs-optional classification.
 *
 * Category membership is the fixed contract inventory, shared by every current
 * manifest. It never declares per-system availability: availability is derived
 * from the presence of a name in `components`, so any extra availability field
 * fails closed here.
 *
 * Exported so catalog readers can fail closed on the same rules as the full
 * manifest validation. Pass `failures` to append to an aggregate list; the
 * returned array is that same list.
 *
 * @param {unknown} value The manifest `capabilities` block.
 * @param {string[]} [failures] Aggregate list to append to.
 * @returns {string[]}
 */
export function collectCapabilitiesFailures(value, failures = []) {
  if (!isPlainObject(value)) {
    failures.push("capabilities must be an object.");
    return failures;
  }
  collectExactKeys(value, ["categories"], "capabilities.", failures);
  if (!isPlainObject(value.categories)) {
    if (hasOwn(value, "categories")) {
      failures.push("capabilities.categories must be an object.");
    }
    return failures;
  }
  const categories = value.categories;
  const actualKeys = Object.keys(categories);
  for (const key of actualKeys) {
    if (!CAPABILITY_CATEGORY_KEYS.includes(key)) {
      failures.push(`capabilities.categories.${key} is not allowed.`);
    }
  }
  for (const key of CAPABILITY_CATEGORY_KEYS) {
    if (!hasOwn(categories, key)) {
      failures.push(`capabilities.categories.${key} is required.`);
    }
  }
  if (
    actualKeys.length === CAPABILITY_CATEGORY_KEYS.length &&
    actualKeys.every((key) => CAPABILITY_CATEGORY_KEYS.includes(key)) &&
    !arraysEqual(actualKeys, CAPABILITY_CATEGORY_KEYS)
  ) {
    failures.push(
      `capabilities.categories keys must be ordered: ${CAPABILITY_CATEGORY_KEYS.join(", ")}.`,
    );
  }
  for (const key of CAPABILITY_CATEGORY_KEYS) {
    if (!hasOwn(categories, key)) continue;
    const category = categories[key];
    const prefix = `capabilities.categories.${key}`;
    if (!isPlainObject(category)) {
      failures.push(`${prefix} must be an object.`);
      continue;
    }
    collectExactKeys(category, CAPABILITY_CATEGORY_FIELDS, `${prefix}.`, failures);
    for (const field of CAPABILITY_CATEGORY_FIELDS) {
      if (!hasOwn(category, field)) continue;
      collectCapabilityArrayFailures(
        category[field],
        {
          pool: field === "required" ? REQUIRED_COMPONENTS : OPTIONAL_COMPONENTS,
          expected: CAPABILITY_CATEGORIES[key][field],
          label: `${prefix}.${field}`,
        },
        failures,
      );
    }
  }
  return failures;
}

/** Collect the `tokens` block violations (nine groups, three artifact paths, naming). */
function collectTokenFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("tokens must be an object.");
    return;
  }
  collectExactKeys(value, ["groups", "artifacts", "names"], "tokens.", failures);
  if (!isPlainObject(value.groups)) {
    failures.push("tokens.groups must be an object.");
  } else {
    collectExactKeys(value.groups, TOKEN_GROUP_KEYS, "tokens.groups.", failures);
    for (const key of TOKEN_GROUP_KEYS) {
      if (hasOwn(value.groups, key) && !isUniqueStringArray(value.groups[key])) {
        failures.push(`tokens.groups.${key} must be an array of unique non-empty strings.`);
      }
    }
  }
  if (!isPlainObject(value.artifacts)) {
    failures.push("tokens.artifacts must be an object.");
  } else {
    collectExactKeys(value.artifacts, TOKEN_ARTIFACT_FIELDS, "tokens.artifacts.", failures);
    for (const key of TOKEN_ARTIFACT_FIELDS) {
      if (hasOwn(value.artifacts, key) && !isPackageRelativePath(value.artifacts[key])) {
        failures.push(
          `tokens.artifacts.${key} must be a package-relative path starting with "./".`,
        );
      }
    }
  }
  if (!isPlainObject(value.names)) {
    failures.push("tokens.names must be an object.");
  } else {
    collectExactKeys(value.names, TOKEN_NAME_FIELDS, "tokens.names.", failures);
    for (const key of TOKEN_NAME_FIELDS) {
      if (hasOwn(value.names, key) && !isSafeTokenNamespace(value.names[key])) {
        failures.push(`tokens.names.${key} must be a safe lower-kebab namespace.`);
      }
    }
  }
}

/** Collect the `docs` block violations (readme/agents required, known keys only). */
function collectDocsFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("docs must be an object.");
    return;
  }
  collectAllowedKeys(value, DOC_FIELDS, REQUIRED_DOC_FIELDS, "docs.", failures);
  for (const key of DOC_FIELDS) {
    if (hasOwn(value, key) && !isPackageRelativePath(value[key])) {
      failures.push(`docs.${key} must be a package-relative path starting with "./".`);
    }
  }
}

/** Collect every current manifest violation as actionable strings. */
function collectCurrentManifestFailures(manifest, { packageName, version } = {}) {
  const failures = [];
  collectExactKeys(manifest, MANIFEST_TOP_LEVEL_KEYS, "", failures);
  if (!isNonEmptyString(manifest.$schema)) failures.push("$schema must be a non-empty string.");
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    failures.push(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}.`);
  }
  if (manifest.generated !== MANIFEST_GENERATED_MARKER) {
    failures.push(`generated must be "${MANIFEST_GENERATED_MARKER}".`);
  }
  if (manifest.contractVersion !== CONTRACT_VERSION) {
    failures.push(`contractVersion must be the numeric ${CONTRACT_VERSION}.`);
  }
  if (typeof manifest.id !== "string" || !SYSTEM_ID_PATTERN.test(manifest.id)) {
    failures.push("id must be lower-kebab-case.");
  }
  if (!isNonEmptyString(manifest.name)) failures.push("name must be a non-empty string.");
  collectPackageNameFailures(manifest.package, failures);
  if (packageName !== undefined && manifest.package !== packageName) {
    failures.push(
      `package ${JSON.stringify(manifest.package ?? null)} does not match "${packageName}".`,
    );
  }
  if (!isExactSemver(manifest.version)) failures.push("version must be an exact semver.");
  if (version !== undefined && manifest.version !== version) {
    failures.push(
      `version ${JSON.stringify(manifest.version ?? null)} does not match ${JSON.stringify(version)}.`,
    );
  }
  if (!isPlainObject(manifest.exports) || Object.keys(manifest.exports).length === 0) {
    failures.push("exports must be a non-empty object.");
  }
  collectPublicApiFailures(manifest.publicApi, failures);
  collectComponentFailures(manifest.components, failures);
  collectCapabilitiesFailures(manifest.capabilities, failures);
  collectDesignFailures(manifest.design, failures);
  collectRulesFailures(manifest.rules, failures);
  collectTokenFailures(manifest.tokens, failures);
  collectDocsFailures(manifest.docs, failures);
  return failures;
}

/**
 * Collect every schema violation for a manifest as actionable strings.
 *
 * Dispatch is strict on `(schemaVersion: 4, contractVersion: 4)`; any other
 * pair fails closed with a single dispatch failure.
 *
 * @param {unknown} manifest
 * @param {{ packageName?: string, version?: string }} [options] When provided,
 *   enforce exact package identity and version equality as well.
 * @returns {string[]}
 */
export function collectManifestFailures(manifest, { packageName, version } = {}) {
  if (!isPlainObject(manifest)) return ["manifest must be a JSON object."];
  if (detectManifestContract(manifest) === null) return [unsupportedManifestMessage(manifest)];
  return collectCurrentManifestFailures(manifest, { packageName, version });
}

/**
 * Validate a manifest completely and return it, or throw with every failure
 * aggregated. `packageName`/`version` add exact identity checks; `label` lets
 * callers keep their own error context.
 */
export function validateDesignSystemManifest(manifest, { packageName, version, label } = {}) {
  const failures = collectManifestFailures(manifest, { packageName, version });
  if (failures.length > 0) {
    const context =
      label ??
      (packageName !== undefined && version !== undefined
        ? ` for "${packageName}@${version}"`
        : "");
    throw new Error(`Invalid design-system manifest${context}: ${failures.join(" ")}`);
  }
  return manifest;
}
