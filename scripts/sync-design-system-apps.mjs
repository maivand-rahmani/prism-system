#!/usr/bin/env node
/**
 * Manifest-driven static app integration for the factory.
 *
 * Showcase and Reference App are integrated from `config/design-systems.json`
 * with **static system imports only** — no runtime package discovery, no
 * dynamic `import()` of a design system's root entry. Given a candidate
 * manifest and an explicit root, this module plans deterministic content for
 * the tool-owned parts of both apps:
 *
 *   app/registry.ts   fully generated: one static import (package + tokens) per
 *                     manifest entry, the common `RegisteredSystem` type, and a
 *                     throwing lookup. Every entry imports the package's public
 *                     generated `./manifest` metadata and exposes the full
 *                     runtime component map.
 *   app/extension-loaders.ts
 *                     Showcase-only, fully generated: literal dynamic imports of
 *                     every extension each package's validated source descriptor
 *                     declares, dispatched by `(systemId, extensionName)`.
 *                     Modules load only when `loadExtension` selects them. The
 *                     Reference App never imports an extension.
 *   app/layout.tsx    generated import block for every registered stylesheet,
 *                     with the surrounding metadata/body preserved verbatim.
 *   package.json      workspace dependency set reconciled to the manifest, all
 *                     unrelated fields and dependencies preserved.
 *   next.config.mjs   marked `transpilePackages` block carrying core plus every
 *                     registered package, with unrelated config preserved.
 *
 * Safety model:
 *   - `planAppIntegration` only reads. `applyAppIntegration` writes.
 *   - `rollbackAppIntegration` restores the exact bytes captured during apply,
 *     and removes files that did not exist before.
 *   - Tool-owned files are marked (`@prism-system:tool-owned` / block markers).
 *     An unmarked file may be migrated **once** from its known legacy shape;
 *     any other unmarked file is left alone and reported as unsafe.
 *   - When the selected root has no `apps/` the plan is an explicit
 *     manifest-only skip. A root with only one app is a hard error. The module
 *     never falls back to the repository root.
 *
 * This module is a library (imported by `register-design-system.mjs`). The
 * canonical catalog reader is injected by callers that already hold the
 * evaluated namespace (the registry CLI lives inside a module cycle with it and
 * must never `import()` it late); standalone callers fall back to loading it on
 * demand only when a package actually has a source descriptor.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/** Marker on fully tool-owned files (for example `app/registry.ts`). */
export const TOOL_OWNED_MARKER = "// @prism-system:tool-owned";
/** Markers around the generated stylesheet import block in a layout. */
export const STYLES_BEGIN = "// @prism-system:styles:begin";
export const STYLES_END = "// @prism-system:styles:end";
/** Markers around the generated `transpilePackages` block in next.config. */
export const TRANSPILE_BEGIN = "// @prism-system:transpile:begin";
export const TRANSPILE_END = "// @prism-system:transpile:end";
/** Package-owned, prebuild-safe API descriptor read for declared extensions. */
export const SOURCE_DESCRIPTOR_FILENAME = "design-system.source.json";
/** Tool-owned, Showcase-only generated extension loader module. */
export const EXTENSION_LOADERS_FILENAME = "extension-loaders.ts";

/** The unstyled foundation every app always transpiles and depends on. */
export const CORE_PACKAGE = "@prism-system/ui-core";

/** The apps the manifest is projected into, in a fixed order. */
export const APP_TARGETS = Object.freeze([
  Object.freeze({
    name: "showcase",
    dir: "showcase",
    packageName: "@prism-system/showcase",
    title: "Maivand design systems · Showcase",
    description: "A component laboratory for portable Maivand design systems.",
    stylesheet: "./showcase.css",
    extensions: true,
  }),
  Object.freeze({
    name: "reference-app",
    dir: "reference-app",
    packageName: "@prism-system/reference-app",
    title: "Maivand reference app",
    description: "A fixed composition for validating interchangeable design systems.",
    stylesheet: "./reference.css",
    extensions: false,
  }),
]);

const SYSTEM_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
const CSS_CLASS_PATTERN = /^[A-Za-z_][\w-]*$/;
/** A safe managed package name; the only scope the generator imports. */
const MANAGED_PACKAGE_PATTERN = /^@prism-system\/[a-z0-9-]+$/;
/** A declared extension key is a PascalCase named export, never a canonical name. */
const EXTENSION_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
/**
 * A concrete package export subpath such as `./custom/keyboard-scene`.
 * Segments start with an alphanumeric character, so `.`/`..` traversal and
 * empty segments are rejected before any import specifier is generated.
 */
const ENTRYPOINT_PATTERN =
  /^\.\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)*$/;

const REGISTRY_HEADER = [
  TOOL_OWNED_MARKER,
  "// Generated by scripts/sync-design-system-apps.mjs from the design-system manifest.",
  "// Do not edit by hand; run `pnpm ds:register <id>` to regenerate.",
].join("\n");

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Path relative to `root` in posix form. */
function toPosixRelative(root, target) {
  return relative(root, target).split("\\").join("/");
}

/** `fancy-tech` -> `FancyTech`, `system-a` -> `SystemA`. */
export function toPascalCase(id) {
  return String(id)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Local alias for a package's default `./manifest` import.
 * `SystemA` -> `systemAManifest`, `FancyTech` -> `fancyTechManifest`.
 */
function toManifestAlias(alias) {
  return `${alias.charAt(0).toLowerCase()}${alias.slice(1)}Manifest`;
}

/** True for the workspace packages this tool manages in app manifests. */
function isManagedPrismPackage(name) {
  return name === CORE_PACKAGE || name.startsWith("@prism-system/ui-");
}

/* -------------------------------------------------------------------------- */
/* Manifest projection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Reduce a normalized manifest to the fields the apps need, in stable ascending
 * id order, rejecting anything that could break generated source (unsafe
 * package names, non-identifier token exports, colliding local aliases).
 */
function prepareEntries(manifest) {
  const list =
    isPlainObject(manifest) && Array.isArray(manifest.designSystems) ? manifest.designSystems : [];

  const entries = list.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new Error(`Manifest entry #${index} must be an object.`);
    }
    const { id, packageName, uiClass, tokensExport, contractVersion } = raw;
    if (typeof id !== "string" || !SYSTEM_ID_PATTERN.test(id)) {
      throw new Error(
        `App integration: invalid system id ${JSON.stringify(id)} at entry #${index}.`,
      );
    }
    if (typeof packageName !== "string" || !packageName.startsWith("@prism-system/")) {
      throw new Error(
        `App integration: "${id}" has an unsafe package name ${JSON.stringify(packageName)}.`,
      );
    }
    if (typeof uiClass !== "string" || !CSS_CLASS_PATTERN.test(uiClass)) {
      throw new Error(
        `App integration: "${id}" has an unsafe ui class ${JSON.stringify(uiClass)}.`,
      );
    }
    if (typeof tokensExport !== "string" || !IDENTIFIER_PATTERN.test(tokensExport)) {
      throw new Error(
        `App integration: "${id}" has unsafe token export ${JSON.stringify(tokensExport)}; expected a valid identifier.`,
      );
    }
    if (contractVersion !== 4) {
      throw new Error(
        `App integration: "${id}" has contractVersion ${JSON.stringify(
          contractVersion ?? null,
        )}; the only current contract is the numeric contractVersion: 4.`,
      );
    }
    return { id, packageName, uiClass, tokensExport, alias: toPascalCase(id) };
  });

  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const localNames = new Set();
  for (const entry of entries) {
    const names = [entry.alias, entry.tokensExport, toManifestAlias(entry.alias)];
    for (const name of names) {
      if (localNames.has(name)) {
        throw new Error(
          `App integration: local name "${name}" collides between manifest entries; rename one system id.`,
        );
      }
      localNames.add(name);
    }
  }

  return entries;
}

function requiredPackages(entries) {
  return [CORE_PACKAGE, ...entries.map((entry) => entry.packageName)];
}

/* -------------------------------------------------------------------------- */
/* Declared extensions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Lazily load the canonical catalog tooling for standalone callers that do not
 * inject it. The extension declarations are read through the catalog's own
 * `readSourceDescriptor` so entrypoint and export-map validation stays in one
 * place. `planAppIntegration` accepts a `catalog` option because callers inside
 * the registry module cycle (`register-design-system.mjs`) already hold the
 * evaluated namespace: a dynamic `import()` of a module in the caller's own
 * pending evaluation cycle never settles, so late loading is the wrong default
 * there.
 */
let catalogModulePromise = null;
function loadCatalogModule() {
  catalogModulePromise ??= import("./design-system-manifest.mjs");
  return catalogModulePromise;
}

/**
 * Locate a registered package directory inside `root`. The registry's
 * `packagePath` is preferred, the canonical `packages/<id>` layout is the
 * fallback. Absolute and escaping paths are ignored (never followed).
 */
function resolvePackageDirectory(root, entry) {
  const candidates = [];
  if (typeof entry.packagePath === "string" && entry.packagePath.trim().length > 0) {
    candidates.push(entry.packagePath);
  }
  candidates.push(`packages/${entry.id}`);
  for (const candidate of candidates) {
    const normalized = candidate.split("\\").join("/");
    if (isAbsolute(candidate) || normalized.startsWith("..")) continue;
    const target = resolve(root, candidate);
    const relativePath = relative(resolve(root), target);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) continue;
    if (existsSync(target)) return target;
  }
  return null;
}

/**
 * Turn the extensions a validated source descriptor declared into the loader
 * declarations the Showcase needs. The catalog reader has already validated
 * the full schema, the package export map, and the real runtime named exports;
 * this step enforces the remaining code-generation boundary: a safe extension
 * name, a concrete subpath declared by `package.json exports`, and a managed
 * import specifier built from it.
 */
function normalizeExtensionDeclarations({ entry, packageDir, declared, catalog }) {
  if (!isPlainObject(declared)) {
    throw new Error(`App integration: "${entry.id}" descriptor "extensions" must be an object.`);
  }
  const names = Object.keys(declared);
  if (names.length === 0) return [];
  if (!MANAGED_PACKAGE_PATTERN.test(entry.packageName)) {
    throw new Error(
      `App integration: "${entry.id}" has unsafe package name ${JSON.stringify(
        entry.packageName,
      )} for declared extensions.`,
    );
  }

  const packageJsonPath = join(packageDir, "package.json");
  let pkg = null;
  if (existsSync(packageJsonPath)) {
    try {
      pkg = JSON.parse(stripBom(readFileSync(packageJsonPath, "utf8")));
    } catch (error) {
      throw new Error(
        `App integration: "${entry.id}" has invalid JSON in ${packageJsonPath}: ${error.message}`,
      );
    }
  }
  const exportsMap = isPlainObject(pkg?.exports) ? pkg.exports : {};
  const canonical = new Set([
    ...(Array.isArray(catalog?.REQUIRED_COMPONENTS) ? catalog.REQUIRED_COMPONENTS : []),
    ...(Array.isArray(catalog?.OPTIONAL_COMPONENTS) ? catalog.OPTIONAL_COMPONENTS : []),
  ]);

  const declarations = [];
  for (const name of names) {
    const label = `App integration: "${entry.id}" extension "${name}"`;
    if (!EXTENSION_NAME_PATTERN.test(name)) {
      throw new Error(`${label} must be a PascalCase named export.`);
    }
    if (canonical.has(name)) {
      throw new Error(`${label} collides with a canonical component name.`);
    }
    const raw = declared[name];
    if (!isPlainObject(raw)) {
      throw new Error(`${label} must be an object.`);
    }
    if (typeof raw.entrypoint !== "string" || !ENTRYPOINT_PATTERN.test(raw.entrypoint)) {
      throw new Error(`${label} "entrypoint" must be a concrete "./subpath".`);
    }
    if (!Object.prototype.hasOwnProperty.call(exportsMap, raw.entrypoint)) {
      throw new Error(
        `${label} entrypoint ${JSON.stringify(raw.entrypoint)} is not declared by package.json ` +
          `"exports"; refusing to generate an undeclared import.`,
      );
    }
    declarations.push({
      name,
      systemId: entry.id,
      importSpecifier: `${entry.packageName}${raw.entrypoint.slice(1)}`,
    });
  }
  declarations.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return declarations;
}

/**
 * Read the extensions one registered package declares. A package directory or
 * descriptor that does not exist contributes no extensions. A descriptor that
 * declares no `extensions` map is neutral and is left to the catalog and
 * registration checks; a descriptor that does declare one is validated through
 * the canonical catalog reader, so invalid metadata fails the whole plan
 * instead of generating a guessed import.
 */
async function readExtensionDeclarations(root, entry, catalog) {
  const packageDir = resolvePackageDirectory(root, entry);
  if (packageDir === null) return [];
  const descriptorPath = join(packageDir, SOURCE_DESCRIPTOR_FILENAME);
  if (!existsSync(descriptorPath)) return [];
  let raw;
  try {
    raw = JSON.parse(stripBom(readFileSync(descriptorPath, "utf8")));
  } catch (error) {
    throw new Error(
      `App integration: "${entry.id}" has invalid JSON in ${descriptorPath}: ${error.message}`,
    );
  }
  if (
    !isPlainObject(raw) ||
    !isPlainObject(raw.extensions) ||
    Object.keys(raw.extensions).length === 0
  ) {
    return [];
  }
  const catalogModule = catalog ?? (await loadCatalogModule());
  let descriptor;
  try {
    descriptor = catalogModule.readSourceDescriptor(packageDir);
  } catch (error) {
    throw new Error(
      `App integration: "${entry.id}" has an invalid source descriptor: ${error.message}`,
    );
  }
  const validated = descriptor?.extensions;
  if (!isPlainObject(validated) || Object.keys(validated).length === 0) {
    throw new Error(
      `App integration: "${entry.id}" declares extensions but the catalog reader did not ` +
        `validate them; refusing to generate an incomplete extension loader.`,
    );
  }
  return normalizeExtensionDeclarations({
    entry,
    packageDir,
    declared: validated,
    catalog: catalogModule,
  });
}

/** Prepare the sorted entries and attach each package's declared extensions. */
async function prepareEntriesWithExtensions(manifest, root, catalog) {
  const entries = prepareEntries(manifest);
  const prepared = [];
  for (const entry of entries) {
    prepared.push({
      ...entry,
      extensions: await readExtensionDeclarations(root, entry, catalog),
    });
  }
  return prepared;
}

/* -------------------------------------------------------------------------- */
/* Generated source                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Registry source for the current single contract: one static package import
 * per manifest entry, the package's public generated `./manifest` metadata, the
 * full runtime component map, and a throwing lookup.
 */
function buildRegistrySource(entries) {
  const packageImports = entries.flatMap((entry) => [
    `import { DesignSystem as ${entry.alias}, ${entry.tokensExport} } from ${JSON.stringify(
      entry.packageName,
    )};`,
    `import ${toManifestAlias(entry.alias)} from ${JSON.stringify(
      `${entry.packageName}/manifest`,
    )};`,
  ]);

  const registrations = entries.map(
    (entry) =>
      `  { ...${entry.alias}, uiClass: ${JSON.stringify(entry.uiClass)}, tokens: ${
        entry.tokensExport
      }, manifest: ${toManifestAlias(entry.alias)} },`,
  );

  return [
    REGISTRY_HEADER,
    "",
    "import {",
    "  createDesignSystemRegistry,",
    "  type DesignSystem,",
    "  type DesignSystemComponents,",
    `} from ${JSON.stringify(CORE_PACKAGE)};`,
    ...packageImports,
    "",
    "/** A group of related token values, for example the color or motion scale. */",
    "export type TokenGroup = Record<string, string>;",
    "",
    "/** Token groups every registered system exposes; typography is optional. */",
    "export type TokenSet = {",
    "  color: TokenGroup;",
    "  radius: TokenGroup;",
    "  shadow: TokenGroup;",
    "  motion: TokenGroup;",
    "  typography?: TokenGroup;",
    "};",
    "",
    "/**",
    " * One component entry of a package's generated `./manifest` metadata.",
    " *",
    " * `effects` is declared metadata only: a missing block means effects are",
    " * undeclared, and no feature or renderer is ever inferred from the name.",
    " */",
    "export type RegisteredManifestComponent = {",
    "  variants: readonly string[];",
    "  sizes: readonly string[];",
    "  members: readonly string[];",
    "  effects?: RegisteredManifestEffects;",
    "  description?: string;",
    "  docs?: string;",
    "  example?: string;",
    "};",
    "",
    "/** One capability category of a package's generated `./manifest` metadata. */",
    "export type RegisteredManifestCapabilityCategory = {",
    "  required: readonly string[];",
    "  optional: readonly string[];",
    "};",
    "",
    "/** The kind of prerequisite one public entrypoint declares. */",
    'export type RegisteredManifestRequirementKind = "dependency" | "peer";',
    "",
    "/** One resolved prerequisite of a package's generated `./manifest` metadata. */",
    "export type RegisteredManifestRequirement = {",
    "  name: string;",
    "  kind: RegisteredManifestRequirementKind;",
    "  range: string;",
    "  optional: boolean;",
    "};",
    "",
    "/** One code entrypoint of a package's generated `./manifest` metadata. */",
    "export type RegisteredManifestEntrypoint = {",
    "  requirements: readonly RegisteredManifestRequirement[];",
    "};",
    "",
    "/** One declared visual-effect feature of a component or extension. */",
    'export type RegisteredManifestEffectFeature = "depth" | "motion" | "3d";',
    "",
    "/** How a declared effect is rendered. */",
    'export type RegisteredManifestEffectRendering = "dom" | "webgl" | "mixed";',
    "",
    "/** The static fallback a webgl or mixed effect may provide. */",
    'export type RegisteredManifestEffectFallback = "static" | "none";',
    "",
    "/**",
    " * Explicit effect metadata declared by a source descriptor. Missing means",
    " * undeclared: consumers must never infer effects from a component name.",
    " */",
    "export type RegisteredManifestEffects = {",
    "  features: readonly RegisteredManifestEffectFeature[];",
    "  rendering: RegisteredManifestEffectRendering;",
    "  reducedMotion: boolean;",
    "  fallback?: RegisteredManifestEffectFallback;",
    "};",
    "",
    "/** One declared extension export of a package's generated `./manifest` metadata. */",
    "export type RegisteredManifestExtension = {",
    "  apiVersion: number;",
    "  entrypoint: string;",
    "  description: string;",
    "  docs: string;",
    "  example: string;",
    "  effects?: RegisteredManifestEffects;",
    "};",
    "",
    "/**",
    " * The public generated `./manifest` metadata a package publishes.",
    " *",
    " * It describes the components, variants, sizes, and compound members the",
    " * package promises, the public entrypoints and their resolved prerequisite",
    " * requirements, and any declared extensions, plus the generated",
    " * capability-category inventory. Availability is catalog metadata: a shared",
    " * component exists when its key is present in `components`, an extension when",
    " * its key is present in `extensions`. The category inventory is a reference",
    " * only, never a second availability list. JSON imports widen literals, so the",
    " * metadata versions are typed as numbers.",
    " */",
    "export type RegisteredManifest = {",
    "  schemaVersion: number;",
    "  contractVersion: number;",
    "  id: string;",
    "  name: string;",
    "  package: string;",
    "  version: string;",
    "  entrypoints: Readonly<Record<string, RegisteredManifestEntrypoint>>;",
    "  components: Readonly<Record<string, RegisteredManifestComponent>>;",
    "  capabilities: {",
    "    categories: Readonly<Record<string, RegisteredManifestCapabilityCategory>>;",
    "  };",
    "  extensions?: Readonly<Record<string, RegisteredManifestExtension>>;",
    "};",
    "",
    "/**",
    " * A registered system with its scoped UI class, token groups, and the",
    " * package's public generated `./manifest` metadata.",
    " *",
    " * Availability is the catalog metadata in `manifest` (`components` keys, and",
    " * extension keys in `extensions`); the runtime component map is the imported",
    " * implementation, not a second availability source.",
    " */",
    'export type RegisteredSystem = Omit<DesignSystem, "components"> & {',
    "  components: DesignSystemComponents;",
    "  manifest: RegisteredManifest;",
    "  uiClass: string;",
    "  tokens: TokenSet;",
    "};",
    "",
    "/** Every registered system, in stable ascending id order. */",
    "export const registeredSystems = [",
    ...registrations,
    "] as unknown as readonly RegisteredSystem[];",
    "",
    "export const systemRegistry = createDesignSystemRegistry(",
    "  registeredSystems as unknown as readonly DesignSystem[],",
    ");",
    "",
    "/** Resolve a registered system by id. Throws when the id is unknown. */",
    "export function getRegisteredSystem(id: string): RegisteredSystem {",
    "  return systemRegistry.require(id) as unknown as RegisteredSystem;",
    "}",
    "",
  ].join("\n");
}

/**
 * Showcase-only extension loader source. Every entry is a literal dynamic
 * import wrapped in a function: the mapping is data, and a module is imported
 * only when `loadExtension` selects its `(systemId, name)` pair. Systems with
 * no declared extensions contribute no import at all.
 */
function buildExtensionLoadersSource(entries) {
  const lines = [
    TOOL_OWNED_MARKER,
    "// Generated by scripts/sync-design-system-apps.mjs from each registered system's source descriptor.",
    "// Do not edit by hand; run `pnpm ds:register <id>` to regenerate.",
    "",
    "/** The runtime module namespace of one declared design-system extension. */",
    "export type ExtensionModule = Record<string, unknown>;",
    "",
    "/** A loader that imports one declared extension module on demand. */",
    "type ExtensionLoader = () => Promise<unknown>;",
    "",
    "/** All declared extension loaders for one design system, keyed by name. */",
    "type SystemExtensionLoaders = Readonly<Record<string, ExtensionLoader>>;",
    "",
    "/**",
    " * Literal dynamic imports keyed by design-system id and declared extension",
    " * name. No module is loaded until `loadExtension` selects it.",
    " */",
    "const extensionLoaders: Readonly<Record<string, SystemExtensionLoaders>> = {",
  ];
  for (const entry of entries) {
    if (entry.extensions.length === 0) continue;
    lines.push(`  ${JSON.stringify(entry.id)}: {`);
    for (const extension of entry.extensions) {
      lines.push(`    ${JSON.stringify(extension.name)}: () =>`);
      lines.push(`      import(${JSON.stringify(extension.importSpecifier)}),`);
    }
    lines.push("  },");
  }
  lines.push(
    "};",
    "",
    "/**",
    " * Load one declared extension of a registered design system.",
    " *",
    " * Only the `(systemId, name)` pairs declared by the registered systems'",
    " * validated source descriptors resolve; anything else is rejected instead of",
    " * guessing an import path. The selected module is imported on demand, so",
    " * opening one example never evaluates another extension.",
    " */",
    "export async function loadExtension(",
    "  systemId: string,",
    "  name: string,",
    "): Promise<ExtensionModule> {",
    "  const systemLoaders = Object.prototype.hasOwnProperty.call(extensionLoaders, systemId)",
    "    ? extensionLoaders[systemId]",
    "    : undefined;",
    "  const loader =",
    "    systemLoaders !== undefined && Object.prototype.hasOwnProperty.call(systemLoaders, name)",
    "      ? systemLoaders[name]",
    "      : undefined;",
    "  if (loader === undefined) {",
    "    throw new Error(",
    "      `Unknown extension ${JSON.stringify(name)} for design system ${JSON.stringify(systemId)}.`,",
    "    );",
    "  }",
    "  const extension = (await loader()) as ExtensionModule;",
    "  if (!(name in extension)) {",
    "    throw new Error(",
    "      `Design system ${JSON.stringify(systemId)} extension ${JSON.stringify(name)} did not expose that export.`,",
    "    );",
    "  }",
    "  return extension;",
    "}",
    "",
  );
  return lines.join("\n");
}

function buildStylesBlock(entries) {
  return [
    STYLES_BEGIN,
    ...entries.map((entry) => `import ${JSON.stringify(`${entry.packageName}/styles.css`)};`),
    STYLES_END,
  ];
}

function buildLayoutSource(target, entries) {
  return [
    'import type { Metadata } from "next";',
    'import type { ReactNode } from "react";',
    ...buildStylesBlock(entries),
    `import ${JSON.stringify(target.stylesheet)};`,
    "",
    "export const metadata: Metadata = {",
    `  title: ${JSON.stringify(target.title)},`,
    `  description: ${JSON.stringify(target.description)},`,
    "};",
    "",
    "export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {",
    "  return (",
    '    <html lang="en">',
    "      <body>{children}</body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildNextConfigSource(packages) {
  return [
    "/** @type {import('next').NextConfig} */",
    "const nextConfig = {",
    "  transpilePackages: [",
    TRANSPILE_BEGIN,
    ...packages.map((name) => `    ${JSON.stringify(name)},`),
    TRANSPILE_END,
    "  ],",
    "};",
    "",
    "export default nextConfig;",
    "",
  ].join("\n");
}

function transpileBlockLines(packages) {
  return [
    TRANSPILE_BEGIN,
    ...packages.map((name) => `    ${JSON.stringify(name)},`),
    TRANSPILE_END,
  ];
}

/* -------------------------------------------------------------------------- */
/* Marked-block and migration transforms                                      */
/* -------------------------------------------------------------------------- */

/** Replace the lines from `begin` through `end` (inclusive) with `replacement`. */
function replaceMarkedBlock(source, begin, end, replacement, relativePath) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === begin);
  const finish = lines.findIndex((line) => line.trim() === end);
  if (start === -1 || finish === -1 || finish < start) {
    throw new Error(`Refusing to rewrite ${relativePath}: malformed tool-owned block.`);
  }
  return [...lines.slice(0, start), ...replacement, ...lines.slice(finish + 1)].join("\n");
}

const PRISM_STYLES_LINE =
  /^\s*import\s+(?:"|')@prism-system\/([^"']+?)\/styles\.css(?:"|')\s*;?\s*$/;

/**
 * Migrate a pre-marker layout once: drop the legacy package stylesheet imports
 * and insert the marked block in their place, leaving metadata and body intact.
 */
function migrateLayout(source, entries, relativePath) {
  if (!/export default function RootLayout\b/.test(source)) {
    throw new Error(
      `Refusing to rewrite ${relativePath}: unrecognized layout (no RootLayout export) and no tool-owned block.`,
    );
  }
  const required = new Set(entries.map((entry) => entry.packageName));
  const lines = source.split("\n");
  const styleLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = PRISM_STYLES_LINE.exec(lines[index]);
    if (!match) continue;
    const packageName = `@prism-system/${match[1]}`;
    if (!required.has(packageName)) {
      throw new Error(
        `Refusing to rewrite ${relativePath}: unknown stylesheet import "${lines[index].trim()}".`,
      );
    }
    styleLines.push(index);
  }

  const block = buildStylesBlock(entries);
  if (styleLines.length > 0) {
    const first = styleLines[0];
    const removed = new Set(styleLines);
    const kept = lines.filter((_, index) => !removed.has(index));
    kept.splice(first, 0, ...block);
    return kept.join("\n");
  }

  let lastImport = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*import\s/.test(lines[index])) lastImport = index;
  }
  if (lastImport === -1) {
    throw new Error(
      `Refusing to rewrite ${relativePath}: no import statements to anchor the block.`,
    );
  }
  const next = [...lines];
  next.splice(lastImport + 1, 0, ...block);
  return next.join("\n");
}

/** Extract the string literals of a `transpilePackages` array body. */
function parseTranspileEntries(inner, relativePath) {
  const literals = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
  let match = pattern.exec(inner);
  while (match !== null) {
    if (match[1] !== undefined) {
      literals.push(JSON.parse(`"${match[1]}"`));
    } else {
      literals.push(match[2].replace(/\\(['\\])/g, "$1"));
    }
    match = pattern.exec(inner);
  }
  const remainder = inner.replace(pattern, "").replace(/[,\s]/g, "");
  if (remainder.length > 0) {
    throw new Error(
      `Refusing to rewrite ${relativePath}: transpilePackages contains non-literal entries.`,
    );
  }
  return literals;
}

/** Locate the `[`..`]` span of the `transpilePackages` array. */
function findTranspileSpan(source, relativePath) {
  const match = /transpilePackages\s*:\s*\[/.exec(source);
  if (!match) {
    throw new Error(
      `Refusing to rewrite ${relativePath}: no "transpilePackages" array found to manage.`,
    );
  }
  const open = source.indexOf("[", match.index);
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return { open, close: index };
    }
  }
  throw new Error(`Refusing to rewrite ${relativePath}: unterminated transpilePackages array.`);
}

/** Migrate a pre-marker next.config once, preserving unrelated entries. */
function migrateNextConfig(source, packages, relativePath) {
  const { open, close } = findTranspileSpan(source, relativePath);
  const inner = source.slice(open + 1, close);
  const entries = parseTranspileEntries(inner, relativePath);
  const seen = new Set();
  const unrelated = [];
  for (const name of entries) {
    if (isManagedPrismPackage(name) || seen.has(name)) continue;
    seen.add(name);
    unrelated.push(name);
  }
  const body = [
    ...transpileBlockLines(packages),
    ...unrelated.map((name) => `    ${JSON.stringify(name)},`),
  ];
  const replacement = `\n${body.join("\n")}\n  `;
  return source.slice(0, open + 1) + replacement + source.slice(close);
}

/* -------------------------------------------------------------------------- */
/* Per-file content computation                                               */
/* -------------------------------------------------------------------------- */

function computeRegistry(existing, entries, relativePath) {
  if (existing === null || existing.includes(TOOL_OWNED_MARKER)) {
    return { after: buildRegistrySource(entries), source: "update" };
  }
  const looksLegacy =
    existing.includes("createDesignSystemRegistry") &&
    existing.includes("export const registeredSystems") &&
    existing.includes("getRegisteredSystem");
  if (!looksLegacy) {
    throw new Error(
      `Refusing to rewrite ${relativePath}: it is neither tool-owned nor a recognized legacy registry.`,
    );
  }
  return { after: buildRegistrySource(entries), source: "migrate" };
}

function computeExtensionLoaders(existing, entries, relativePath) {
  if (existing === null || existing.includes(TOOL_OWNED_MARKER)) {
    return { after: buildExtensionLoadersSource(entries), source: "update" };
  }
  throw new Error(
    `Refusing to rewrite ${relativePath}: it is neither tool-owned nor a recognized generated ` +
      "extension loader registry.",
  );
}

function computeLayout(existing, target, entries, relativePath) {
  if (existing === null) {
    return { after: buildLayoutSource(target, entries), source: "update" };
  }
  const hasBegin = existing.includes(STYLES_BEGIN);
  const hasEnd = existing.includes(STYLES_END);
  if (hasBegin !== hasEnd) {
    throw new Error(`Refusing to rewrite ${relativePath}: malformed tool-owned stylesheet block.`);
  }
  if (hasBegin) {
    const after = replaceMarkedBlock(
      existing,
      STYLES_BEGIN,
      STYLES_END,
      buildStylesBlock(entries),
      relativePath,
    );
    return { after, source: "update" };
  }
  return { after: migrateLayout(existing, entries, relativePath), source: "migrate" };
}

function computeNextConfig(existing, packages, relativePath) {
  if (existing === null) {
    return { after: buildNextConfigSource(packages), source: "update" };
  }
  const hasBegin = existing.includes(TRANSPILE_BEGIN);
  const hasEnd = existing.includes(TRANSPILE_END);
  if (hasBegin !== hasEnd) {
    throw new Error(`Refusing to rewrite ${relativePath}: malformed tool-owned transpile block.`);
  }
  if (hasBegin) {
    const after = replaceMarkedBlock(
      existing,
      TRANSPILE_BEGIN,
      TRANSPILE_END,
      transpileBlockLines(packages),
      relativePath,
    );
    return { after, source: "update" };
  }
  return { after: migrateNextConfig(existing, packages, relativePath), source: "migrate" };
}

function buildAppPackageJson(existing, target, entries) {
  const json = existing === null ? {} : JSON.parse(stripBom(existing));
  if (!isPlainObject(json)) {
    throw new Error(`Cannot integrate ${target.name}: package.json is not an object.`);
  }
  const pkg = existing === null ? {} : { ...json };
  const sourceDeps = isPlainObject(pkg.dependencies) ? pkg.dependencies : {};
  const sourceDevDeps = isPlainObject(pkg.devDependencies) ? pkg.devDependencies : {};

  const dependencies = {};
  for (const name of requiredPackages(entries)) dependencies[name] = "workspace:*";
  for (const [name, spec] of Object.entries(sourceDeps)) {
    if (!isManagedPrismPackage(name)) dependencies[name] = spec;
  }

  const devDependencies = {};
  for (const [name, spec] of Object.entries(sourceDevDeps)) {
    if (!isManagedPrismPackage(name)) devDependencies[name] = spec;
  }

  if (existing === null) {
    pkg.name = target.packageName;
    pkg.version = "0.1.0";
    pkg.private = true;
    pkg.type = "module";
    pkg.scripts = {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint .",
      typecheck: "tsc --noEmit",
    };
  }
  if (Object.keys(dependencies).length > 0) pkg.dependencies = dependencies;
  else delete pkg.dependencies;
  if (Object.keys(devDependencies).length > 0) pkg.devDependencies = devDependencies;
  else delete pkg.devDependencies;

  return { after: `${JSON.stringify(pkg, null, 2)}\n`, source: "update" };
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

async function loadPrettier() {
  const module = await import("prettier");
  return module.default ?? module;
}

async function formatSource(source, filePath, prettier) {
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  return prettier.format(source, { ...config, filepath: filePath });
}

async function buildFilePlan({ root, target, kind, path, compute, prettier }) {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  const relativePath = toPosixRelative(root, path);
  const { after: rawAfter, source } = compute(existing, relativePath);
  const after = kind === "package-json" ? rawAfter : await formatSource(rawAfter, path, prettier);

  let action;
  if (existing === null) action = "create";
  else if (after === existing) action = "unchanged";
  else action = source;

  return { app: target.name, kind, path, relativePath, action, before: existing, after };
}

async function planAppFiles({ root, target, entries, prettier }) {
  const appRoot = join(root, "apps", target.dir);
  const packages = requiredPackages(entries);
  const files = [
    await buildFilePlan({
      root,
      target,
      kind: "registry",
      path: join(appRoot, "app", "registry.ts"),
      prettier,
      compute: (existing, relativePath) => computeRegistry(existing, entries, relativePath),
    }),
    await buildFilePlan({
      root,
      target,
      kind: "layout",
      path: join(appRoot, "app", "layout.tsx"),
      prettier,
      compute: (existing, relativePath) => computeLayout(existing, target, entries, relativePath),
    }),
    await buildFilePlan({
      root,
      target,
      kind: "package-json",
      path: join(appRoot, "package.json"),
      prettier,
      compute: (existing) => buildAppPackageJson(existing, target, entries),
    }),
    await buildFilePlan({
      root,
      target,
      kind: "next-config",
      path: join(appRoot, "next.config.mjs"),
      prettier,
      compute: (existing, relativePath) => computeNextConfig(existing, packages, relativePath),
    }),
  ];
  // The extension loader registry is Showcase-only. The Reference App keeps
  // validating the shared contract and never imports an extension.
  if (target.extensions) {
    files.push(
      await buildFilePlan({
        root,
        target,
        kind: "extension-loaders",
        path: join(appRoot, "app", EXTENSION_LOADERS_FILENAME),
        prettier,
        compute: (existing, relativePath) =>
          computeExtensionLoaders(existing, entries, relativePath),
      }),
    );
  }
  return files;
}

/**
 * Plan the app integration for a candidate manifest without touching disk.
 *
 * @param {object} options
 * @param {object} options.manifest Normalized manifest (`{ version, designSystems }`).
 * @param {string} options.root     Explicit root holding `apps/`; never defaulted.
 * @param {object} [options.catalog] Already-evaluated canonical catalog namespace
 *   (`design-system-manifest.mjs`); standalone callers may omit it and get the
 *   lazy load. Callers inside that module's ESM cycle must inject it.
 * @returns {Promise<
 *   | { status: "skipped", reason: string, files: [] }
 *   | { status: "planned", reason: null, files: object[] }
 * >}
 */
export async function planAppIntegration({ manifest, root, catalog } = {}) {
  if (typeof root !== "string" || root.trim().length === 0) {
    throw new Error(
      "planAppIntegration requires an explicit root; it never defaults to repoRoot().",
    );
  }
  const resolvedRoot = resolve(root);
  const present = APP_TARGETS.filter((target) =>
    existsSync(join(resolvedRoot, "apps", target.dir)),
  );
  if (present.length === 0) {
    return { status: "skipped", reason: "no app directories under apps/", files: [] };
  }
  if (present.length !== APP_TARGETS.length) {
    throw new Error(
      `App integration requires both apps; found only ${present
        .map((target) => target.name)
        .join(", ")} under ${join(resolvedRoot, "apps")}.`,
    );
  }

  const entries = await prepareEntriesWithExtensions(manifest, resolvedRoot, catalog);
  const prettier = await loadPrettier();
  const files = [];
  for (const target of APP_TARGETS) {
    files.push(...(await planAppFiles({ root: resolvedRoot, target, entries, prettier })));
  }
  return { status: "planned", reason: null, files };
}

/* -------------------------------------------------------------------------- */
/* Apply / rollback                                                           */
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

/**
 * Write every changed file in a plan. On any failure the files already written
 * are rolled back before the error is rethrown.
 *
 * @returns {{ status: string, reason: string | null, files: object[], changed: boolean }}
 */
export function applyAppIntegration(plan) {
  if (!plan || plan.status !== "planned") {
    return {
      status: plan?.status ?? "skipped",
      reason: plan?.reason ?? null,
      files: [],
      changed: false,
    };
  }
  const applied = [];
  try {
    for (const file of plan.files) {
      if (file.action === "unchanged") continue;
      writeFileAtomic(file.path, file.after);
      applied.push({ path: file.path, before: file.before });
    }
  } catch (error) {
    rollbackAppIntegration({ files: applied });
    throw error;
  }
  return { status: "applied", reason: null, files: applied, changed: applied.length > 0 };
}

/** Restore the exact bytes captured during apply, removing newly-created files. */
export function rollbackAppIntegration(applied) {
  if (!applied || !Array.isArray(applied.files)) return;
  for (const file of [...applied.files].reverse()) {
    if (file.before === null) rmSync(file.path, { force: true });
    else writeFileSync(file.path, file.before, "utf8");
  }
}

/** Plan then apply in one step (used by callers that do not need the plan). */
export async function syncDesignSystemApps({ manifest, root, catalog } = {}) {
  const plan = await planAppIntegration({ manifest, root, catalog });
  if (plan.status !== "planned") return { ...plan, applied: null };
  return { ...plan, applied: applyAppIntegration(plan) };
}
