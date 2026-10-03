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
 * The manifest reports all twenty-nine required components plus only the
 * optional components the system implements, and the fixed
 * `capabilities.categories` membership inventory. The catalog exposes that
 * inventory with per-category `available`/`unavailable` names derived solely by
 * intersecting each category's names with the declared component map, so a
 * separate availability declaration is never trusted. A declared optional is
 * available with its declared API metadata; an undeclared optional is reported
 * unavailable with no fabricated metadata.
 *
 * A requested component name is resolved against the known set. A
 * known-but-unavailable optional is reported as unavailable; an unknown name is
 * rejected with a clear error. The example route is derived only from the
 * validated manifest `id`, matching the existing `info` route (`/showcase/<id>`),
 * and components keep the canonical contract order.
 */

import {
  CAPABILITY_CATEGORY_KEYS,
  COMPONENT_NAMES,
  CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  OPTIONAL_COMPONENTS,
  REQUIRED_COMPONENTS,
} from "./constants.mjs";
import {
  discoverConsumerPackage,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import {
  collectCapabilitiesFailures,
  collectEntrypointsFailures,
  collectExtensionsFailures,
  detectManifestContract,
} from "./manifest.mjs";

/** Optional per-component metadata fields passed through when declared. */
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

/** The known canonical component names, in contract order. */
function knownComponentNames() {
  return COMPONENT_NAMES;
}

/** The required component names, in canonical order. */
function requiredComponentNames() {
  return REQUIRED_COMPONENTS;
}

/** The optional component names, in canonical order. */
function optionalComponentNames() {
  return OPTIONAL_COMPONENTS;
}

/**
 * Pass through a declared effects block as a fresh object, or `null` when the
 * manifest does not declare effects. Effects are never inferred.
 */
export function normalizeCatalogEffects(value) {
  if (!isPlainObject(value)) return null;
  const effects = {
    features: Array.isArray(value.features) ? [...value.features] : [],
    rendering: value.rendering,
    reducedMotion: value.reducedMotion,
  };
  if (value.fallback !== undefined) effects.fallback = value.fallback;
  return effects;
}

/** The public import path an entrypoint maps to, e.g. `pkg/subpath`. */
export function entrypointImportPath(packageName, entrypoint) {
  if (entrypoint === ".") return packageName;
  return `${packageName}${entrypoint.replace(/^\./, "")}`;
}

/**
 * Build the extension catalog entries from a validated manifest: every custom
 * runtime export with its `apiVersion`, declared `entrypoint`, resolved
 * `importPath`, optional effects, and the entrypoint's requirements. This is
 * the single unified shape reused by `components`, `info`, and the CLI.
 */
export function buildExtensionCatalogEntries(manifest) {
  const extensions = isPlainObject(manifest?.extensions) ? manifest.extensions : {};
  const entrypoints = isPlainObject(manifest?.entrypoints) ? manifest.entrypoints : {};
  return Object.keys(extensions).map((name) => {
    const extension = extensions[name];
    const entrypoint = extension.entrypoint;
    const requirements = Array.isArray(entrypoints[entrypoint]?.requirements)
      ? entrypoints[entrypoint].requirements.map((requirement) => ({
          name: requirement.name,
          kind: requirement.kind,
          range: requirement.range,
          optional: requirement.optional,
        }))
      : [];
    return {
      kind: "extension",
      name,
      apiVersion: extension.apiVersion,
      entrypoint,
      importPath: entrypointImportPath(manifest.package, entrypoint),
      available: true,
      description: extension.description,
      docs: extension.docs,
      example: extension.example,
      effects: normalizeCatalogEffects(extension.effects),
      requirements,
    };
  });
}

/** Resolve a requested name against canonical components, then extensions. */
function selectRequestedEntry({ requested, names, catalog, extensions }) {
  const entryName = requireNonEmptyString(requested, "component name");
  const component = catalog.find((entry) => entry.name === entryName);
  if (component !== undefined) return component;
  const extension = extensions.find((entry) => entry.name === entryName);
  if (extension !== undefined) return extension;
  const known = [...names, ...extensions.map((entry) => entry.name)];
  throw new Error(
    `Unknown component ${JSON.stringify(entryName)}; known components are: ${known.join(", ")}.`,
  );
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
 *   contractVersion: 4,
 *   id: string,
 *   name: string,
 *   showcase: { route: string },
 *   counts: { required: number, optional: number, available: number, unavailable: number },
 *   components: object[],
 *   available: string[],
 *   unavailable: string[],
 *   capabilities: {
 *     categories: Record<
 *       string,
 *       { required: string[], optional: string[], available: string[], unavailable: string[] }
 *     >,
 *   },
 *   requested: object | null,
 * }}
 */
export function buildComponentCatalog({ manifest, name } = {}) {
  if (!isPlainObject(manifest)) {
    throw new Error("A design-system manifest object is required.");
  }
  if (detectManifestContract(manifest) === null) {
    throw new Error(
      `Unsupported design-system manifest; expected schemaVersion ${MANIFEST_SCHEMA_VERSION} ` +
        `and contractVersion ${CONTRACT_VERSION}.`,
    );
  }
  const capabilityFailures = collectCapabilitiesFailures(manifest.capabilities);
  if (capabilityFailures.length > 0) {
    throw new Error(`Invalid design-system manifest capabilities: ${capabilityFailures.join(" ")}`);
  }
  const entrypointFailures = collectEntrypointsFailures(manifest.entrypoints);
  if (entrypointFailures.length > 0) {
    throw new Error(`Invalid design-system manifest entrypoints: ${entrypointFailures.join(" ")}`);
  }
  if (hasOwn(manifest, "extensions")) {
    const extensionFailures = collectExtensionsFailures(manifest.extensions, {
      entrypoints: manifest.entrypoints,
      publicApi: manifest.publicApi,
    });
    if (extensionFailures.length > 0) {
      throw new Error(`Invalid design-system manifest extensions: ${extensionFailures.join(" ")}`);
    }
  }

  const components = isPlainObject(manifest.components) ? manifest.components : {};
  const names = knownComponentNames();
  const required = requiredComponentNames();
  const optional = optionalComponentNames();

  for (const componentName of required) {
    if (!hasOwn(components, componentName)) {
      throw new Error(`Manifest is missing required component "${componentName}".`);
    }
  }

  const rootRequirements = Array.isArray(manifest.entrypoints["."]?.requirements)
    ? manifest.entrypoints["."].requirements.map((requirement) => ({ ...requirement }))
    : [];
  const catalog = names.map((componentName) => {
    const isRequired = required.includes(componentName);
    const declared = hasOwn(components, componentName);
    const entry = {
      name: componentName,
      required: isRequired,
      optional: !isRequired,
      available: declared,
      entrypoint: ".",
      importPath: manifest.package,
      requirements: rootRequirements.map((requirement) => ({ ...requirement })),
      variants: null,
      sizes: null,
      members: null,
      effects: null,
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
    entry.effects = normalizeCatalogEffects(api.effects);
    return entry;
  });

  const extensions = buildExtensionCatalogEntries(manifest);
  const available = catalog.filter((entry) => entry.available).map((entry) => entry.name);
  const unavailable = catalog.filter((entry) => !entry.available).map((entry) => entry.name);

  // Derived category availability: a category name is available only when the
  // component map (the single source of availability) declares it. The
  // `required`/`optional` arrays stay exactly as the manifest declared them.
  const categories = {};
  for (const key of CAPABILITY_CATEGORY_KEYS) {
    const category = manifest.capabilities.categories[key];
    const declaredNames = [...category.required, ...category.optional];
    categories[key] = {
      required: [...category.required],
      optional: [...category.optional],
      available: declaredNames.filter((componentName) => hasOwn(components, componentName)),
      unavailable: declaredNames.filter((componentName) => !hasOwn(components, componentName)),
    };
  }

  const requested =
    name === undefined
      ? null
      : selectRequestedEntry({ requested: name, names, catalog, extensions });

  return {
    contractVersion: CONTRACT_VERSION,
    id: manifest.id,
    name: manifest.name,
    showcase: { route: `/showcase/${manifest.id}` },
    counts: {
      required: required.length,
      optional: optional.length,
      available: available.length,
      unavailable: unavailable.length,
      extensions: extensions.length,
    },
    components: catalog,
    extensions,
    available,
    unavailable,
    capabilities: { categories },
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
 *   contractVersion: 4,
 *   version: string,
 *   id: string,
 *   name: string,
 *   showcase: { route: string },
 *   counts: object,
 *   components: object[],
 *   available: string[],
 *   unavailable: string[],
 *   capabilities: { categories: object },
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
    contractVersion: catalog.contractVersion,
    version,
    id: catalog.id,
    name: catalog.name,
    showcase: catalog.showcase,
    counts: catalog.counts,
    components: catalog.components,
    extensions: catalog.extensions,
    available: catalog.available,
    unavailable: catalog.unavailable,
    capabilities: catalog.capabilities,
    requested: catalog.requested,
  };
}
