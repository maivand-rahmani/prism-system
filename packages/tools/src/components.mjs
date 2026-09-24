#!/usr/bin/env node
/**
 * Offline component catalog for installed design systems (`prism-ds components`).
 *
 * This is the read-only, offline counterpart of the registry `info` path: it
 * resolves the design system already installed in a consumer and reports the
 * component catalog declared by its public `./manifest` export. It never:
 *
 *   - installs, mutates, or writes anything;
 *   - executes installed package code or imports package internals;
 *   - accesses the network;
 *   - reads the design-systems source repository.
 *
 * Contract handling is dual-contract and fail-closed:
 *
 *   - V2 manifests list exactly the fourteen supported components, all required;
 *   - V4 manifests report all twenty required components plus all twelve known
 *     optional contracts. A declared optional is available with its declared API
 *     metadata; an undeclared optional is reported unavailable with no fabricated
 *     metadata.
 *
 * A requested component name is resolved against the contract's known set. A
 * known-but-unavailable optional is reported as unavailable; an unknown name is
 * rejected with a clear error. The example route is derived only from the
 * validated manifest `id`, matching the existing `info` route (`/showcase/<id>`),
 * and components keep the canonical contract order.
 */

import {
  CONTRACT_V4,
  V2_REQUIRED_COMPONENTS,
  V4_COMPONENT_NAMES,
  V4_OPTIONAL_COMPONENTS,
  V4_REQUIRED_COMPONENTS,
} from "./constants.mjs";
import {
  discoverConsumerPackage,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import { detectManifestContract } from "./manifest.mjs";

/** Optional per-component V4 metadata fields passed through when declared. */
const OPTIONAL_METADATA_FIELDS = Object.freeze(["description", "docs", "example"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected a non-empty string for "${label}".`);
  }
  return value.trim();
}

/** The known component names for a contract, in canonical order. */
function knownComponentNames(contract) {
  return contract === CONTRACT_V4 ? V4_COMPONENT_NAMES : V2_REQUIRED_COMPONENTS;
}

/** The required component names for a contract, in canonical order. */
function requiredComponentNames(contract) {
  return contract === CONTRACT_V4 ? V4_REQUIRED_COMPONENTS : V2_REQUIRED_COMPONENTS;
}

/** The optional component names for a contract, in canonical order ([] for V2). */
function optionalComponentNames(contract) {
  return contract === CONTRACT_V4 ? V4_OPTIONAL_COMPONENTS : [];
}

/** Resolve a requested component name against the known contract names. */
function selectRequestedComponent({ requested, names, catalog }) {
  const componentName = requireNonEmptyString(requested, "component name");
  if (!names.includes(componentName)) {
    throw new Error(
      `Unknown component ${JSON.stringify(componentName)}; known components are: ` +
        `${names.join(", ")}.`,
    );
  }
  const entry = catalog.find((component) => component.name === componentName);
  // The name was found in `names`, so the canonical catalog always contains it.
  return entry;
}

/**
 * Build the deterministic component catalog for an already-validated manifest.
 *
 * Pure and offline: it reads only the manifest object it is given. Kept separate
 * from {@link listDesignSystemComponents} so the catalog rules can be exercised
 * against manifest data without any consumer or filesystem access.
 *
 * @param {{ manifest: object, name?: string }} [options]
 * @returns {{
 *   contract: "v2" | "v4",
 *   id: string,
 *   name: string,
 *   showcase: { route: string },
 *   counts: { required: number, optional: number, available: number, unavailable: number },
 *   components: object[],
 *   available: string[],
 *   unavailable: string[],
 *   requested: object | null,
 * }}
 */
export function buildComponentCatalog({ manifest, name } = {}) {
  if (!isPlainObject(manifest)) {
    throw new Error("A design-system manifest object is required.");
  }
  const contract = detectManifestContract(manifest);
  if (contract === null) {
    throw new Error(
      'Unsupported design-system manifest; expected the (1, "v2") or (2, "v4") ' +
        "schema/contract pair.",
    );
  }

  const components = isPlainObject(manifest.components) ? manifest.components : {};
  const names = knownComponentNames(contract);
  const required = requiredComponentNames(contract);
  const optional = optionalComponentNames(contract);

  for (const componentName of required) {
    if (!hasOwn(components, componentName)) {
      throw new Error(`Manifest is missing required component "${componentName}".`);
    }
  }

  const catalog = names.map((componentName) => {
    const isRequired = required.includes(componentName);
    const declared = hasOwn(components, componentName);
    const entry = {
      name: componentName,
      required: isRequired,
      optional: !isRequired,
      available: declared,
      variants: null,
      sizes: null,
      members: null,
    };
    if (!declared) return entry;
    const api = components[componentName];
    if (!isPlainObject(api)) {
      throw new Error(`Manifest component "${componentName}" must be an object.`);
    }
    entry.variants = Array.isArray(api.variants) ? [...api.variants] : [];
    entry.sizes = Array.isArray(api.sizes) ? [...api.sizes] : [];
    entry.members = Array.isArray(api.members) ? [...api.members] : [];
    for (const field of OPTIONAL_METADATA_FIELDS) {
      if (typeof api[field] === "string") entry[field] = api[field];
    }
    return entry;
  });

  const available = catalog.filter((entry) => entry.available).map((entry) => entry.name);
  const unavailable = catalog.filter((entry) => !entry.available).map((entry) => entry.name);

  const requested =
    name === undefined ? null : selectRequestedComponent({ requested: name, names, catalog });

  return {
    contract,
    id: manifest.id,
    name: manifest.name,
    showcase: { route: `/showcase/${manifest.id}` },
    counts: {
      required: required.length,
      optional: optional.length,
      available: available.length,
      unavailable: unavailable.length,
    },
    components: catalog,
    available,
    unavailable,
    requested,
  };
}

/**
 * Offline component catalog for the design system installed in a consumer.
 *
 * Resolves the consumer root, discovers the design system (config, package.json
 * metadata, or a single supported dependency), resolves the installed package
 * through Node package resolution, and verifies it through the public `./manifest`
 * export with exact version/identity invariants before reading the catalog. It
 * never writes, installs, executes package code, or accesses the network.
 *
 * @param {{ cwd?: string, name?: string }} [options] `cwd` is the required
 *   consumer root (it never falls back to a repository root); `name` optionally
 *   selects a single known component, including an unavailable optional.
 * @returns {{
 *   ok: true,
 *   package: string,
 *   contract: "v2" | "v4",
 *   version: string,
 *   id: string,
 *   name: string,
 *   showcase: { route: string },
 *   counts: object,
 *   components: object[],
 *   available: string[],
 *   unavailable: string[],
 *   requested: object | null,
 * }}
 */
export function listDesignSystemComponents({ cwd, name } = {}) {
  const consumerRoot = resolveConsumerRoot({ cwd });
  const discovered = discoverConsumerPackage({ consumerRoot });
  const installed = resolveInstalledDesignSystem({
    consumerRoot,
    packageName: discovered.packageName,
  });
  const { version } = verifyConsumerDesignSystem({
    packageName: discovered.packageName,
    expectedVersion: discovered.expectedVersion,
    installed,
  });
  const catalog = buildComponentCatalog({ manifest: installed.manifest, name });
  return {
    ok: true,
    package: discovered.packageName,
    contract: catalog.contract,
    version,
    id: catalog.id,
    name: catalog.name,
    showcase: catalog.showcase,
    counts: catalog.counts,
    components: catalog.components,
    available: catalog.available,
    unavailable: catalog.unavailable,
    requested: catalog.requested,
  };
}
