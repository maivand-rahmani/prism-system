#!/usr/bin/env node
/**
 * Offline icon catalog for installed design systems (`prism-ds icons`).
 *
 * The catalog is the read-only counterpart of `components` and `tokens`: it
 * resolves the design system already installed in a consumer and reads only its
 * public `./manifest` export. It never installs, writes, executes package code,
 * reads package internals, or accesses the network.
 *
 * Icons are deliberately not a top-level manifest field and not components.
 * Availability is the real, generated `publicApi["./icons"]` list: every entry
 * is a canonical `${Name}Icon` export whose source and build were verified when
 * the manifest was generated. A system with no `./icons` entrypoint therefore
 * has no available icons, even though core defines the shared vocabulary.
 */

import {
  CONTRACT_VERSION,
  ICON_CATEGORIES,
  ICON_ENTRYPOINT,
  ICON_NAMES,
  MANIFEST_SCHEMA_VERSION,
  iconCategoryOf,
  iconExportName,
  iconNameFromExportName,
} from "./constants.mjs";
import { entrypointImportPath } from "./components.mjs";
import {
  discoverConsumerPackage,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import {
  collectEntrypointsFailures,
  collectIconEntrypointFailures,
  detectManifestContract,
} from "./manifest.mjs";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** A copy of the icon entrypoint's resolved requirements, or `[]`. */
function iconRequirements(manifest) {
  if (
    !isPlainObject(manifest.entrypoints) ||
    !hasOwn(manifest.entrypoints, ICON_ENTRYPOINT) ||
    !Array.isArray(manifest.entrypoints[ICON_ENTRYPOINT].requirements)
  ) {
    return [];
  }
  return manifest.entrypoints[ICON_ENTRYPOINT].requirements.map((requirement) => ({
    name: requirement.name,
    kind: requirement.kind,
    range: requirement.range,
    optional: requirement.optional,
  }));
}

/**
 * The canonical icon names the manifest's real `./icons` public API publishes.
 *
 * The manifest validators are the authority: an absent entrypoint publishes
 * none, and a present entrypoint may publish only canonical `${Name}Icon`
 * exports. Canonical order is restored here because `publicApi` is emitted in
 * deterministic alphabetical order.
 */
export function iconNamesForManifest(manifest) {
  if (
    !isPlainObject(manifest) ||
    !isPlainObject(manifest.entrypoints) ||
    !hasOwn(manifest.entrypoints, ICON_ENTRYPOINT) ||
    !isPlainObject(manifest.publicApi) ||
    !Array.isArray(manifest.publicApi[ICON_ENTRYPOINT])
  ) {
    return [];
  }
  const declared = new Set(
    manifest.publicApi[ICON_ENTRYPOINT].map((name) => iconNameFromExportName(name)).filter(Boolean),
  );
  return ICON_NAMES.filter((name) => declared.has(name));
}

/** Resolve a requested icon name, export name, or unique case-insensitive name. */
function resolveRequestedName(requested) {
  if (typeof requested !== "string" || requested.trim().length === 0) {
    throw new Error("An icon name is required.");
  }
  const value = requested.trim();
  if (ICON_NAMES.includes(value)) return value;
  const fromExport = iconNameFromExportName(value);
  if (fromExport !== null) return fromExport;
  const caseInsensitive = ICON_NAMES.filter((name) => name.toLowerCase() === value.toLowerCase());
  if (caseInsensitive.length === 1) return caseInsensitive[0];
  const known = ICON_NAMES.map((name) => `${name} (${iconExportName(name)})`).join(", ");
  throw new Error(`Unknown icon ${JSON.stringify(value)}; known icons are: ${known}.`);
}

/**
 * Build the deterministic icon catalog for an already-validated manifest.
 *
 * Pure and offline: it reads only the manifest object it is given. The catalog
 * always enumerates the fifty canonical names once, marking each entry
 * available only when the installed system publishes it. A system without an
 * icon entrypoint reports `supported: false` and zero available icons; its
 * known-but-unavailable entries never become importable.
 *
 * @param {{ manifest: object, name?: string }} [options]
 */
export function buildIconCatalog({ manifest, name } = {}) {
  if (!isPlainObject(manifest)) {
    throw new Error("A design-system manifest object is required.");
  }
  if (detectManifestContract(manifest) === null) {
    throw new Error(
      `Unsupported design-system manifest; expected schemaVersion ${MANIFEST_SCHEMA_VERSION} ` +
        `and contractVersion ${CONTRACT_VERSION}.`,
    );
  }
  const entrypointFailures = collectEntrypointsFailures(manifest.entrypoints);
  if (entrypointFailures.length > 0) {
    throw new Error(`Invalid design-system manifest entrypoints: ${entrypointFailures.join(" ")}`);
  }
  const iconFailures = collectIconEntrypointFailures({
    entrypoints: manifest.entrypoints,
    publicApi: manifest.publicApi,
  });
  if (iconFailures.length > 0) {
    throw new Error(`Invalid design-system manifest icon catalog: ${iconFailures.join(" ")}`);
  }

  const supported = hasOwn(manifest.entrypoints, ICON_ENTRYPOINT);
  const available = iconNamesForManifest(manifest);
  const availableSet = new Set(available);
  const requirements = iconRequirements(manifest);
  const importPath = supported ? entrypointImportPath(manifest.package, ICON_ENTRYPOINT) : null;

  const icons = ICON_NAMES.map((iconName) => {
    const isAvailable = availableSet.has(iconName);
    return {
      name: iconName,
      exportName: iconExportName(iconName),
      category: iconCategoryOf(iconName),
      available: isAvailable,
      entrypoint: supported ? ICON_ENTRYPOINT : null,
      importPath,
      importStatement:
        supported && isAvailable
          ? `import { ${iconExportName(iconName)} } from "${importPath}";`
          : null,
      requirements: supported ? requirements.map((requirement) => ({ ...requirement })) : [],
    };
  });

  const categories = {};
  for (const [key, categoryNames] of Object.entries(ICON_CATEGORIES)) {
    categories[key] = {
      names: [...categoryNames],
      available: categoryNames.filter((iconName) => availableSet.has(iconName)),
      unavailable: categoryNames.filter((iconName) => !availableSet.has(iconName)),
    };
  }

  let requested = null;
  if (name !== undefined) {
    const requestedName = resolveRequestedName(name);
    const entry = icons.find((icon) => icon.name === requestedName);
    requested = {
      ...entry,
      reason: !supported ? "no-icon-catalog" : entry.available ? null : "not-declared",
    };
  }

  return {
    contractVersion: CONTRACT_VERSION,
    id: manifest.id,
    name: manifest.name,
    package: manifest.package,
    showcase: { route: `/showcase/${manifest.id}/icons` },
    supported,
    entrypoint: supported ? ICON_ENTRYPOINT : null,
    importPath,
    counts: {
      total: ICON_NAMES.length,
      available: available.length,
      unavailable: ICON_NAMES.length - available.length,
    },
    icons,
    available,
    unavailable: ICON_NAMES.filter((iconName) => !availableSet.has(iconName)),
    categories,
    requested,
  };
}

/**
 * Offline icon catalog for the design system installed in a consumer.
 *
 * Resolves the consumer root, discovers the design system, verifies the
 * installed package through its public `./manifest` export (exact
 * identity/version), and reads the real icon availability. It never writes,
 * installs, executes package code, or accesses the network.
 *
 * @param {{ cwd?: string, name?: string }} [options]
 */
export function listDesignSystemIcons({ cwd, name } = {}) {
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
  const catalog = buildIconCatalog({ manifest: installed.manifest, name });
  return {
    ok: true,
    package: discovered.packageName,
    version,
    ...catalog,
  };
}
