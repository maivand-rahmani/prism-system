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
  CONTRACT_V2,
  CONTRACT_V4,
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_V4_SCHEMA_VERSION,
  PACKAGE_SCOPE,
  RESERVED_SYSTEM_IDS,
  SYSTEM_ID_PATTERN,
  TOKEN_NAMESPACE_PATTERN,
  V2_REQUIRED_COMPONENTS,
  V4_COMPONENT_FIELDS,
  V4_COMPONENT_NAMES,
  V4_COMPONENT_OPTIONAL_FIELDS,
  V4_COMPONENT_REQUIRED_FIELDS,
  V4_DOC_FIELDS,
  V4_REQUIRED_COMPONENTS,
  V4_REQUIRED_DOC_FIELDS,
  V4_TOKEN_ARTIFACT_FIELDS,
  V4_TOKEN_GROUP_KEYS,
  V4_TOKEN_NAME_FIELDS,
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

/** Exactly the allowed top-level V4 manifest keys (the V2 keys plus `tokens`/`docs`). */
export const MANIFEST_V4_TOP_LEVEL_KEYS = Object.freeze([
  ...MANIFEST_TOP_LEVEL_KEYS,
  "tokens",
  "docs",
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

/** True for an own property of an object. */
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Record missing required keys and disallowed extra keys for an object with
 * `additionalProperties:false`. `allowedKeys` may be wider than `requiredKeys`
 * when some fields are optional (for example V4 component metadata).
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
 * Strict `(schemaVersion, contract)` pair dispatch. Only `(1, "v2")` and
 * `(2, "v4")` are recognized; every other pair (including missing fields)
 * returns `null` so callers can fail closed without silently mixing contracts.
 */
export function detectManifestContract(manifest) {
  if (!isPlainObject(manifest)) return null;
  if (manifest.schemaVersion === MANIFEST_SCHEMA_VERSION && manifest.contract === CONTRACT_V2) {
    return CONTRACT_V2;
  }
  if (manifest.schemaVersion === MANIFEST_V4_SCHEMA_VERSION && manifest.contract === CONTRACT_V4) {
    return CONTRACT_V4;
  }
  return null;
}

function unsupportedManifestPairMessage(manifest) {
  const show = (value) => (value === undefined ? "undefined" : JSON.stringify(value));
  return (
    `Unsupported schema/contract pair (${show(manifest.schemaVersion)}, ` +
    `${show(manifest.contract)}); expected (${MANIFEST_SCHEMA_VERSION}, ` +
    `${JSON.stringify(CONTRACT_V2)}) or (${MANIFEST_V4_SCHEMA_VERSION}, ` +
    `${JSON.stringify(CONTRACT_V4)}).`
  );
}

/** Collect the V4 component-map violations (twenty required, known optionals only). */
function collectV4ComponentFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("components must be an object.");
    return;
  }
  const declared = Object.keys(value);
  for (const name of V4_REQUIRED_COMPONENTS) {
    if (!hasOwn(value, name)) failures.push(`components.${name} is required.`);
  }
  for (const name of declared) {
    if (!V4_COMPONENT_NAMES.includes(name)) {
      failures.push(`components.${name} is not allowed.`);
    }
  }
  for (const name of V4_COMPONENT_NAMES) {
    if (!hasOwn(value, name)) continue;
    const component = value[name];
    if (!isPlainObject(component)) {
      failures.push(`components.${name} must be an object.`);
      continue;
    }
    collectAllowedKeys(
      component,
      V4_COMPONENT_FIELDS,
      V4_COMPONENT_REQUIRED_FIELDS,
      `components.${name}.`,
      failures,
    );
    for (const field of V4_COMPONENT_REQUIRED_FIELDS) {
      if (!isUniqueStringArray(component[field])) {
        failures.push(`components.${name}.${field} must be an array of unique non-empty strings.`);
      }
    }
    for (const field of V4_COMPONENT_OPTIONAL_FIELDS) {
      if (component[field] !== undefined && !isNonEmptyString(component[field])) {
        failures.push(`components.${name}.${field} must be a non-empty string.`);
      }
    }
  }
}

/** Collect the V4 `tokens` block violations (nine groups, three artifact paths, naming). */
function collectV4TokenFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("tokens must be an object.");
    return;
  }
  collectExactKeys(value, ["groups", "artifacts", "names"], "tokens.", failures);
  if (!isPlainObject(value.groups)) {
    failures.push("tokens.groups must be an object.");
  } else {
    collectExactKeys(value.groups, V4_TOKEN_GROUP_KEYS, "tokens.groups.", failures);
    for (const key of V4_TOKEN_GROUP_KEYS) {
      if (hasOwn(value.groups, key) && !isUniqueStringArray(value.groups[key])) {
        failures.push(`tokens.groups.${key} must be an array of unique non-empty strings.`);
      }
    }
  }
  if (!isPlainObject(value.artifacts)) {
    failures.push("tokens.artifacts must be an object.");
  } else {
    collectExactKeys(value.artifacts, V4_TOKEN_ARTIFACT_FIELDS, "tokens.artifacts.", failures);
    for (const key of V4_TOKEN_ARTIFACT_FIELDS) {
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
    collectExactKeys(value.names, V4_TOKEN_NAME_FIELDS, "tokens.names.", failures);
    for (const key of V4_TOKEN_NAME_FIELDS) {
      if (hasOwn(value.names, key) && !isSafeTokenNamespace(value.names[key])) {
        failures.push(`tokens.names.${key} must be a safe lower-kebab namespace.`);
      }
    }
  }
}

/** Collect the V4 `docs` block violations (readme/agents required, known keys only). */
function collectV4DocsFailures(value, failures) {
  if (!isPlainObject(value)) {
    failures.push("docs must be an object.");
    return;
  }
  collectAllowedKeys(value, V4_DOC_FIELDS, V4_REQUIRED_DOC_FIELDS, "docs.", failures);
  for (const key of V4_DOC_FIELDS) {
    if (hasOwn(value, key) && !isPackageRelativePath(value[key])) {
      failures.push(`docs.${key} must be a package-relative path starting with "./".`);
    }
  }
}

/** Collect every V4 manifest violation as actionable strings. */
function collectV4ManifestFailures(manifest, { packageName, version } = {}) {
  const failures = [];
  collectExactKeys(manifest, MANIFEST_V4_TOP_LEVEL_KEYS, "", failures);
  if (!isNonEmptyString(manifest.$schema)) failures.push("$schema must be a non-empty string.");
  if (manifest.schemaVersion !== MANIFEST_V4_SCHEMA_VERSION) {
    failures.push(`schemaVersion must be ${MANIFEST_V4_SCHEMA_VERSION}.`);
  }
  if (manifest.generated !== MANIFEST_GENERATED_MARKER) {
    failures.push(`generated must be "${MANIFEST_GENERATED_MARKER}".`);
  }
  if (manifest.contract !== CONTRACT_V4) failures.push('contract must be "v4".');
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
  collectV4ComponentFailures(manifest.components, failures);
  collectDesignFailures(manifest.design, failures);
  collectRulesFailures(manifest.rules, failures);
  collectV4TokenFailures(manifest.tokens, failures);
  collectV4DocsFailures(manifest.docs, failures);
  return failures;
}

/** Collect every V2 manifest violation as actionable strings (unchanged behavior). */
function collectV2ManifestFailures(manifest, { packageName, version } = {}) {
  const failures = [];

  collectExactKeys(manifest, MANIFEST_TOP_LEVEL_KEYS, "", failures);
  if (!isNonEmptyString(manifest.$schema)) failures.push("$schema must be a non-empty string.");
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    failures.push(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}.`);
  }
  if (manifest.generated !== MANIFEST_GENERATED_MARKER) {
    failures.push(`generated must be "${MANIFEST_GENERATED_MARKER}".`);
  }
  if (manifest.contract !== CONTRACT_V2) failures.push('contract must be "v2".');
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
 * Collect every schema violation for a manifest as actionable strings.
 *
 * Dispatch is strict on the `(schemaVersion, contract)` pair: `(1, "v2")` uses
 * the fourteen-component V2 rules, `(2, "v4")` uses the twenty-plus-optional V4
 * rules, and any other pair fails closed with a single dispatch failure.
 *
 * @param {unknown} manifest
 * @param {{ packageName?: string, version?: string }} [options] When provided,
 *   enforce exact package identity and version equality as well.
 * @returns {string[]}
 */
export function collectManifestFailures(manifest, { packageName, version } = {}) {
  if (!isPlainObject(manifest)) return ["manifest must be a JSON object."];
  const contract = detectManifestContract(manifest);
  if (contract === CONTRACT_V4)
    return collectV4ManifestFailures(manifest, { packageName, version });
  if (contract === CONTRACT_V2)
    return collectV2ManifestFailures(manifest, { packageName, version });
  return [unsupportedManifestPairMessage(manifest)];
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
