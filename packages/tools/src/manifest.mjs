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
  MANIFEST_SCHEMA_VERSION,
  PACKAGE_SCOPE,
  RESERVED_SYSTEM_IDS,
  SYSTEM_ID_PATTERN,
  V2_REQUIRED_COMPONENTS,
} from "./constants.mjs";
import { isExactSemver } from "./semver.mjs";

/** The generated marker every shipped manifest must carry. */
export const MANIFEST_GENERATED_MARKER = "prism-system/design-system-manifest";

/** Exactly the allowed top-level manifest keys. */
export const MANIFEST_TOP_LEVEL_KEYS = Object.freeze([
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
]);

/** Exactly the allowed per-component keys. */
export const MANIFEST_COMPONENT_KEYS = Object.freeze(["variants", "sizes", "members"]);

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

/** Record missing and disallowed keys for an object with `additionalProperties:false`. */
function collectExactKeys(value, requiredKeys, prefix, failures) {
  const keys = Object.keys(value);
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      failures.push(`${prefix}${key} is required.`);
    }
  }
  for (const key of keys) {
    if (!requiredKeys.includes(key)) {
      failures.push(`${prefix}${key} is not allowed.`);
    }
  }
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

function collectComponentFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("components must be an object.");
    return;
  }
  collectExactKeys(value, V2_REQUIRED_COMPONENTS, "components.", failures);
  for (const name of V2_REQUIRED_COMPONENTS) {
    const component = value[name];
    if (component === undefined) continue;
    if (!isPlainObject(component)) {
      failures.push(`components.${name} must be an object.`);
      continue;
    }
    collectExactKeys(component, MANIFEST_COMPONENT_KEYS, `components.${name}.`, failures);
    for (const field of MANIFEST_COMPONENT_KEYS) {
      if (!isUniqueStringArray(component[field])) {
        failures.push(`components.${name}.${field} must be an array of unique non-empty strings.`);
      }
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
 * Collect every schema violation for a manifest as actionable strings.
 *
 * @param {unknown} manifest
 * @param {{ packageName?: string, version?: string }} [options] When provided,
 *   enforce exact package identity and version equality as well.
 * @returns {string[]}
 */
export function collectManifestFailures(manifest, { packageName, version } = {}) {
  if (!isPlainObject(manifest)) return ["manifest must be a JSON object."];
  const failures = [];

  collectExactKeys(manifest, MANIFEST_TOP_LEVEL_KEYS, "", failures);
  if (!isNonEmptyString(manifest.$schema)) failures.push("$schema must be a non-empty string.");
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    failures.push(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}.`);
  }
  if (manifest.generated !== MANIFEST_GENERATED_MARKER) {
    failures.push(`generated must be "${MANIFEST_GENERATED_MARKER}".`);
  }
  if (manifest.contract !== "v2") failures.push('contract must be "v2".');
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
  collectDesignFailures(manifest.design, failures);
  collectRulesFailures(manifest.rules, failures);

  return failures;
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
