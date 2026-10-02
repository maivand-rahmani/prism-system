#!/usr/bin/env node
/**
 * App registry generation tests (Node built-in test runner, no dependency).
 *
 * Run directly:
 *   node --test scripts/sync-design-system-apps.test.mjs
 *
 * These exercise the real generator path (`planAppIntegration`) rather than a
 * test-only reimplementation:
 *
 *   - the generated registry exposes the full runtime component map through the
 *     public `DesignSystemComponents`/`DesignSystem` types, carries each
 *     package's public generated `./manifest` metadata, and never fabricates or
 *     guesses an optional component from a name list;
 *   - the generated registry and shared props typecheck against the real
 *     `@prism-system/ui-core` contract;
 *   - the live `config/design-systems.json` is projected into both apps and the
 *     committed Showcase and Reference App registries are checked against that
 *     plan, so both stay byte-identical and in sync.
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  EXTENSION_LOADERS_FILENAME,
  SOURCE_DESCRIPTOR_FILENAME,
  applyAppIntegration,
  planAppIntegration,
  rollbackAppIntegration,
} from "./sync-design-system-apps.mjs";
import * as manifestTooling from "./design-system-manifest.mjs";
import { readManifest } from "./register-design-system.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The canonical component names, mirroring `@prism-system/ui-core`. The
 * registry generator must never enumerate either set: the twenty-nine required
 * names come from `DesignSystemComponents`, and optional presence comes from the
 * real runtime component-map keys.
 */
const REQUIRED_NAMES = [
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
];

const OPTIONAL_NAMES = [
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
];

function entry(overrides) {
  return { version: "0.1.0", contractVersion: 4, ...overrides };
}

function manifest(...systems) {
  return { version: 3, designSystems: systems };
}

async function registrySourceFor(manifestValue, app = "showcase") {
  const plan = await planAppIntegration({ manifest: manifestValue, root: repoRoot });
  assert.equal(plan.status, "planned");
  const file = plan.files.find(
    (candidate) => candidate.kind === "registry" && candidate.app === app,
  );
  assert.ok(file, `registry file planned for ${app}`);
  return file.after;
}

const TYPECHECK_REGISTRY_PATH = join(
  repoRoot,
  "apps",
  "showcase",
  "app",
  "__registered-system-type-regression__.ts",
);
const TYPECHECK_CONSUMER_PATH = join(
  repoRoot,
  "apps",
  "showcase",
  "app",
  "__registered-system-type-usage__.tsx",
);
const MINIMAL_SYSTEM_PATH = join(repoRoot, "apps", "showcase", "__minimal-system__.ts");
const MINIMAL_MANIFEST_PATH = join(repoRoot, "apps", "showcase", "__minimal-manifest__.ts");
const TYPECHECK_LOADER_PATH = join(
  repoRoot,
  "apps",
  "showcase",
  "app",
  "__extension-loaders-type-regression__.ts",
);

/**
 * A compile-time-only fixture built against core's real component contract.
 * It supplies every one of the twenty-nine required keys and deliberately
 * supplies no optional key.
 */
function minimalSystemSource(systemPackageName = PULSE.packageName, tokensExport = "pulseTokens") {
  const componentEntries = REQUIRED_NAMES.map(
    (name) =>
      `  ${name}: (() => null) as unknown as DesignSystemComponents[${JSON.stringify(name)}],`,
  );

  return [
    'import { defineDesignSystem, type DesignSystemComponents } from "@prism-system/ui-core";',
    "",
    "const components = {",
    ...componentEntries,
    "} satisfies DesignSystemComponents;",
    "",
    "export const DesignSystem = defineDesignSystem({",
    '  id: "minimal",',
    '  name: "Minimal",',
    `  packageName: ${JSON.stringify(systemPackageName)},`,
    '  version: "1.0.0",',
    "  contractVersion: 4,",
    "  components,",
    "});",
    "",
    `export const ${tokensExport} = {`,
    '  color: { text: "#111111" },',
    '  radius: { medium: "4px" },',
    '  shadow: { none: "none" },',
    '  motion: { quick: "120ms" },',
    "};",
    "",
  ].join("\n");
}

function minimalManifestSource(systemPackageName = PULSE.packageName) {
  // The canonical Button deliberately declares a canonical effects block so
  // `satisfies RegisteredManifest` structurally proves the generated
  // RegisteredManifestComponent type accepts declared component effects.
  const components = REQUIRED_NAMES.map((name) => {
    if (name === "Button") {
      return [
        '    "Button": {',
        '      variants: ["primary"],',
        '      sizes: ["md"],',
        "      members: [],",
        "      effects: {",
        '        features: ["depth", "motion"],',
        '        rendering: "dom",',
        "        reducedMotion: true,",
        "      },",
        "    },",
      ].join("\n");
    }
    return `    ${JSON.stringify(name)}: { variants: [], sizes: [], members: [] },`;
  });

  return [
    'import type { RegisteredManifest } from "./__registered-system-type-regression.js";',
    "",
    "/** The current shipped manifest shape (schemaVersion 5, contractVersion 4). */",
    "const manifest = {",
    "  schemaVersion: 5,",
    "  contractVersion: 4,",
    '  id: "minimal",',
    '  name: "Minimal",',
    `  package: ${JSON.stringify(systemPackageName)},`,
    '  version: "1.0.0",',
    "  entrypoints: {",
    '    ".": { requirements: [] },',
    "    // A declared code entrypoint resolves explicit prerequisites only.",
    '    "./tokens": {',
    "      requirements: [",
    "        {",
    '          name: "@prism-system/ui-core",',
    '          kind: "dependency",',
    '          range: "workspace:*",',
    "          optional: false,",
    "        },",
    "      ],",
    "    },",
    "  },",
    "  components: {",
    ...components,
    "  },",
    "  capabilities: {",
    "    categories: {",
    '      composition: { required: ["Container"], optional: [] },',
    "      forms: { required: [], optional: [] },",
    '      "data-display": { required: [], optional: [] },',
    "    },",
    "  },",
    "} satisfies RegisteredManifest;",
    "",
    "export default manifest;",
    "",
  ].join("\n");
}

function registeredSystemUsageSource() {
  const inputExtensions = ["label", "hint", "error"]
    .map((extension) => {
      const variable = `invalidInput${extension.charAt(0).toUpperCase()}${extension.slice(1)}`;
      return `  // @ts-expect-error ${extension} is package-specific and must not leak into the shared type.\n  const ${variable} = <Input ${extension}="package-only" />;`;
    })
    .join("\n\n");

  return [
    "import type {",
    "  RegisteredManifest,",
    "  RegisteredSystem,",
    '} from "./__registered-system-type-regression.js";',
    "",
    "export function checkManifestMetadata(system: RegisteredSystem): void {",
    "  const manifest: RegisteredManifest = system.manifest;",
    '  const rootEntrypoint = manifest.entrypoints["."];',
    "  const firstRequirement = rootEntrypoint?.requirements[0];",
    '  if (firstRequirement?.kind === "peer" && firstRequirement.optional) {',
    "    void firstRequirement.range;",
    "  }",
    "  const extension = manifest.extensions?.KeyboardScene;",
    "  if (extension !== undefined) {",
    "    void extension.apiVersion;",
    "    void extension.entrypoint;",
    "    void extension.docs;",
    '    if (extension.effects?.rendering === "webgl") {',
    "      void extension.effects.fallback;",
    '      if (extension.effects.features.includes("3d") && extension.effects.reducedMotion) {',
    "        return;",
    "      }",
    "    }",
    "  }",
    "}",
    "",
    "export function checkCanonicalEffects(system: RegisteredSystem): void {",
    "  const button = system.manifest.components.Button;",
    '  if (button?.effects?.rendering === "dom") {',
    "    void button.effects.features;",
    "    void button.effects.reducedMotion;",
    "    void button.effects.fallback;",
    "  }",
    "}",
    "",
    "export function checkSharedComponents(system: RegisteredSystem) {",
    "  if (system.contractVersion !== 4) return;",
    "  const Input = system.components.Input;",
    '  const commonInput = <Input id="shared" value="valid" />;',
    inputExtensions,
    "",
    "  // @ts-expect-error optional Table is not guaranteed by every system.",
    "  const requiredTable: NonNullable<typeof system.components.Table> = system.components.Table;",
    "",
    "  if (system.components.Table) {",
    "    const optionalTable = <system.components.Table />;",
    "  }",
    "}",
    "",
  ].join("\n");
}

function typecheckGeneratedRegistry(
  registrySource,
  {
    allowDiagnostics = false,
    packageName = PULSE.packageName,
    tokensExport = "pulseTokens",
    extraFiles = {},
  } = {},
) {
  const configPath = join(repoRoot, "apps", "showcase", "tsconfig.json");
  const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(configRead.error, undefined, "Showcase TypeScript config is readable");
  const parsedConfig = ts.parseJsonConfigFileContent(
    configRead.config,
    ts.sys,
    dirname(configPath),
    {},
    configPath,
  );
  const options = {
    ...parsedConfig.options,
    noEmit: true,
    incremental: false,
    composite: false,
    noUnusedLocals: false,
    noUnusedParameters: false,
  };
  const extraEntries = Object.entries(extraFiles).map(([path, source]) => [resolve(path), source]);
  const virtualFiles = new Map([
    [resolve(TYPECHECK_REGISTRY_PATH), registrySource],
    [resolve(TYPECHECK_CONSUMER_PATH), registeredSystemUsageSource()],
    [resolve(MINIMAL_SYSTEM_PATH), minimalSystemSource(packageName, tokensExport)],
    [resolve(MINIMAL_MANIFEST_PATH), minimalManifestSource(packageName)],
    ...extraEntries,
  ]);
  const host = ts.createCompilerHost(options);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);

  host.fileExists = (fileName) => virtualFiles.has(resolve(fileName)) || baseFileExists(fileName);
  host.readFile = (fileName) => virtualFiles.get(resolve(fileName)) ?? baseReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const source = virtualFiles.get(resolve(fileName));
    if (source !== undefined) {
      return ts.createSourceFile(fileName, source, languageVersion, true);
    }
    return baseGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((moduleName) => {
      if (moduleName === packageName) {
        return { resolvedFileName: MINIMAL_SYSTEM_PATH, extension: ts.Extension.Ts };
      }
      if (moduleName === `${packageName}/manifest`) {
        return { resolvedFileName: MINIMAL_MANIFEST_PATH, extension: ts.Extension.Ts };
      }
      if (moduleName === "./__registered-system-type-regression.js") {
        return { resolvedFileName: TYPECHECK_REGISTRY_PATH, extension: ts.Extension.Ts };
      }
      return ts.resolveModuleName(moduleName, containingFile, options, host).resolvedModule;
    });

  const program = ts.createProgram(
    [TYPECHECK_REGISTRY_PATH, TYPECHECK_CONSUMER_PATH, ...extraEntries.map(([path]) => path)],
    options,
    host,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const messages = diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  );
  if (!allowDiagnostics) {
    assert.deepEqual(messages, [], "the generated registry and shared props should typecheck");
  }
  return messages;
}

/** Assert that `source` never names any optional component. */
function assertNoOptionalNameGuessing(source) {
  for (const name of OPTIONAL_NAMES) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${name}\\b`),
      `generated registry must not name optional component ${name}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Extension fixtures                                                          */
/* -------------------------------------------------------------------------- */

const EXTENSION_FIXTURE = entry({
  id: "extension-fixture",
  name: "Extension Fixture",
  packageName: "@prism-system/ui-extension-fixture",
  packagePath: "packages/extension-fixture",
  version: "1.0.0",
  uiClass: "maivand-extension-fixture-ui",
  tokensExport: "extensionFixtureTokens",
});

const EXTENSION_NAME = "KeyboardScene";
const EXTENSION_ENTRYPOINT = "./keyboard-scene";
const EXTENSION_IMPORT = "@prism-system/ui-extension-fixture/keyboard-scene";
const INJECTED_DESCRIPTION = 'Keyboard scene with "; process.exit(1); // injected metadata';

function fixturePackageJson({ declareEntrypoint = true } = {}) {
  return {
    name: EXTENSION_FIXTURE.packageName,
    version: EXTENSION_FIXTURE.version,
    prismSystem: {
      name: EXTENSION_FIXTURE.name,
      uiClass: EXTENSION_FIXTURE.uiClass,
      tokensExport: EXTENSION_FIXTURE.tokensExport,
    },
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.mjs" },
      "./tokens": { types: "./dist/tokens/index.d.ts", import: "./dist/tokens/index.mjs" },
      "./styles.css": "./dist/index.css",
      "./tailwind.css": "./dist/tailwind.css",
      "./manifest": "./design-system.json",
      ...(declareEntrypoint
        ? {
            [EXTENSION_ENTRYPOINT]: {
              types: "./dist/keyboard-scene/index.d.ts",
              import: "./dist/keyboard-scene/index.mjs",
            },
          }
        : {}),
    },
    files: ["dist", "README.md", "AGENTS.md", "design-system.json", "design-brief.json", "LICENSE"],
    peerDependencies: { three: ">=0.186.0 <1" },
    peerDependenciesMeta: { three: { optional: true } },
  };
}

function fixtureDescriptor({ includeExtensions = true, dropDeclaration = false } = {}) {
  const components = {};
  for (const name of REQUIRED_NAMES) components[name] = { variants: [], sizes: [], members: [] };
  const descriptor = {
    schemaVersion: manifestTooling.DESIGN_SYSTEM_SCHEMA_VERSION,
    contractVersion: 4,
    name: EXTENSION_FIXTURE.name,
    components,
    design: { density: "comfortable", theme: "light-first", radius: "small", keywords: [] },
    rules: {
      allowArbitraryColors: false,
      allowArbitraryRadius: false,
      allowArbitraryShadows: false,
      allowPrimitiveDuplication: false,
    },
  };
  if (includeExtensions) {
    if (!dropDeclaration) {
      descriptor.entrypoints = {
        [EXTENSION_ENTRYPOINT]: { source: "./src/keyboard-scene/index.ts", requires: ["three"] },
      };
    }
    descriptor.extensions = {
      [EXTENSION_NAME]: {
        apiVersion: 1,
        entrypoint: EXTENSION_ENTRYPOINT,
        description: INJECTED_DESCRIPTION,
        docs: "./docs/keyboard-scene.md",
        example: "./examples/keyboard-scene.tsx",
        effects: {
          features: ["3d", "motion"],
          rendering: "webgl",
          reducedMotion: true,
          fallback: "static",
        },
      },
    };
  }
  return descriptor;
}

/**
 * A real package fixture under a temporary root: both app directories, a
 * schema-current source descriptor, a valid token source, and the exported
 * source barrel and documentation files the metadata refers to.
 */
function createFixtureRoot(t, { includeExtensions = true, dropDeclaration = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-app-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const app of ["showcase", "reference-app"]) {
    mkdirSync(join(root, "apps", app, "app"), { recursive: true });
  }
  const packageDir = join(root, "packages", EXTENSION_FIXTURE.id);
  mkdirSync(join(packageDir, "src", "keyboard-scene"), { recursive: true });
  mkdirSync(join(packageDir, "docs"), { recursive: true });
  mkdirSync(join(packageDir, "examples"), { recursive: true });
  writeFileSync(
    join(packageDir, "src", "keyboard-scene", "index.ts"),
    `export function ${EXTENSION_NAME}() {\n  return null;\n}\n`,
    "utf8",
  );
  writeFileSync(join(packageDir, "docs", "keyboard-scene.md"), "# KeyboardScene\n", "utf8");
  writeFileSync(join(packageDir, "examples", "keyboard-scene.tsx"), "export {};\n", "utf8");
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify(fixturePackageJson({ declareEntrypoint: !dropDeclaration }), null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageDir, SOURCE_DESCRIPTOR_FILENAME),
    `${JSON.stringify(fixtureDescriptor({ includeExtensions, dropDeclaration }), null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageDir, "tokens.source.json"),
    readFileSync(join(repoRoot, "schemas", "fixtures", "valid", "tokens.source.json"), "utf8"),
    "utf8",
  );
  return root;
}

async function fixturePlan(t, options) {
  const root = createFixtureRoot(t, options);
  const plan = await planAppIntegration({ manifest: manifest(EXTENSION_FIXTURE), root });
  assert.equal(plan.status, "planned");
  return { root, plan };
}

function planFile(plan, app, kind) {
  return plan.files.find((file) => file.app === app && file.kind === kind);
}

function extensionLoaderPath(root) {
  return join(root, "apps", "showcase", "app", EXTENSION_LOADERS_FILENAME);
}

/** Every file path under `dir`, recursively. */
function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else files.push(full);
  }
  return files;
}

const SYSTEM_A = entry({
  id: "system-a",
  name: "System A",
  packageName: "@prism-system/ui-system-a",
  packagePath: "packages/system-a",
  version: "1.1.0",
  uiClass: "maivand-a-ui",
  tokensExport: "systemATokens",
});

const SYSTEM_B = entry({
  id: "system-b",
  name: "System B",
  packageName: "@prism-system/ui-system-b",
  packagePath: "packages/system-b",
  version: "1.1.0",
  uiClass: "maivand-b-ui",
  tokensExport: "systemBTokens",
});

const PULSE = entry({
  id: "pulse",
  name: "Pulse",
  packageName: "@prism-system/ui-pulse",
  packagePath: "packages/pulse",
  uiClass: "maivand-pulse-ui",
  tokensExport: "pulseTokens",
});

test("a manifest generates one registry with the real component map and manifest", async () => {
  const source = await registrySourceFor(manifest(SYSTEM_A, PULSE));

  assert.match(
    source,
    /import \{\n {2}createDesignSystemRegistry,\n {2}type DesignSystem,\n {2}type DesignSystemComponents,\n\} from "@prism-system\/ui-core";/,
  );
  assert.match(source, /export type RegisteredSystem = Omit<DesignSystem, "components"> & \{/);
  assert.match(source, /components: DesignSystemComponents;/);
  assert.match(source, /manifest: RegisteredManifest;/);
  assert.match(source, /export type RegisteredManifest = \{/);
  assert.match(source, /schemaVersion: number;/);
  assert.match(source, /contractVersion: number;/);
  assert.match(source, /export type RegisteredManifestCapabilityCategory = \{/);
  assert.match(source, /required: readonly string\[\];/);
  assert.match(source, /optional: readonly string\[\];/);
  assert.match(
    source,
    /capabilities: \{\n {4}categories: Readonly<Record<string, RegisteredManifestCapabilityCategory>>;\n {2}\};/,
  );
  assert.match(source, /import systemAManifest from "@prism-system\/ui-system-a\/manifest";/);
  assert.match(source, /import pulseManifest from "@prism-system\/ui-pulse\/manifest";/);
  assert.match(source, /manifest: systemAManifest/);
  assert.match(source, /manifest: pulseManifest/);
  assert.match(source, /getRegisteredSystem\(id: string\): RegisteredSystem/);

  // The generated metadata types describe the current shipped manifest shape:
  // entrypoint requirement records and optional declared extensions.
  assert.match(source, /export type RegisteredManifestRequirementKind = "dependency" \| "peer";/);
  assert.match(source, /export type RegisteredManifestRequirement = \{/);
  assert.match(
    source,
    /export type RegisteredManifestEntrypoint = \{\n {2}requirements: readonly RegisteredManifestRequirement\[\];\n\};/,
  );
  assert.match(source, /entrypoints: Readonly<Record<string, RegisteredManifestEntrypoint>>;/);
  assert.match(
    source,
    /export type RegisteredManifestEffectFeature = "depth" \| "motion" \| "3d";/,
  );
  assert.match(
    source,
    /export type RegisteredManifestEffectRendering = "dom" \| "webgl" \| "mixed";/,
  );
  assert.match(source, /export type RegisteredManifestEffectFallback = "static" \| "none";/);
  assert.match(source, /fallback\?: RegisteredManifestEffectFallback;/);
  assert.match(source, /export type RegisteredManifestExtension = \{/);
  assert.match(source, /apiVersion: number;/);
  assert.match(source, /extensions\?: Readonly<Record<string, RegisteredManifestExtension>>;/);

  // The generated registry never imports an extension or any dynamic module:
  // extensions stay metadata until the Showcase loader selects one.
  assert.doesNotMatch(source, /import\(/);

  // The generator spreads each package's real runtime map and never enumerates
  // a component name: no required or optional name appears in the output.
  for (const name of [...REQUIRED_NAMES, ...OPTIONAL_NAMES]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`));
  }
  assertNoOptionalNameGuessing(source);
});

test("the generated manifest type accepts canonical component effects", async () => {
  const source = await registrySourceFor(manifest(SYSTEM_A, PULSE));

  assert.match(
    source,
    /export type RegisteredManifestComponent = \{\n {2}variants: readonly string\[\];\n {2}sizes: readonly string\[\];\n {2}members: readonly string\[\];\n {2}effects\?: RegisteredManifestEffects;\n {2}description\?: string;/,
    "canonical components declare optional effects in the generated metadata type",
  );

  // The shared virtual manifest declares canonical Button effects and is
  // checked with `satisfies RegisteredManifest`; a missing component `effects`
  // field would fail the excess-property check.
  typecheckGeneratedRegistry(source);
});

test("entries keep a stable ascending id order", async () => {
  const source = await registrySourceFor(manifest(SYSTEM_B, SYSTEM_A, PULSE));
  const order = ["...Pulse", "...SystemA", "...SystemB"].map((needle) => source.indexOf(needle));
  assert.ok(order[0] !== -1 && order[1] !== -1 && order[2] !== -1, "all entries are registered");
  assert.ok(order[0] < order[1] && order[1] < order[2], "entries stay in ascending id order");
});

test("generated shared props stay core-only regardless of which concrete system is first", async () => {
  for (const firstSystem of [SYSTEM_A, SYSTEM_B]) {
    const source = await registrySourceFor(manifest(firstSystem, PULSE));
    typecheckGeneratedRegistry(source);
  }
});

test("the JSX regression rejects the former first-system component type", async () => {
  const source = await registrySourceFor(manifest(SYSTEM_A, PULSE));
  const oldFirstSystemType = source.replace(
    "  components: DesignSystemComponents;",
    "  components: typeof SystemA.components;",
  );
  assert.notEqual(oldFirstSystemType, source, "the in-memory regression mutation applies");

  const diagnostics = typecheckGeneratedRegistry(oldFirstSystemType, {
    allowDiagnostics: true,
  });
  const unusedExpectations = diagnostics.filter((message) =>
    message.includes("Unused '@ts-expect-error' directive"),
  );
  assert.ok(
    unusedExpectations.length >= 3,
    "first-system Input extensions should make each negative JSX assertion go unused",
  );
});

test("obsolete contract metadata is rejected instead of normalized", async () => {
  await assert.rejects(
    planAppIntegration({
      manifest: manifest(
        entry({
          id: "legacy",
          name: "Legacy",
          packageName: "@prism-system/ui-legacy",
          packagePath: "packages/legacy",
          uiClass: "maivand-legacy-ui",
          tokensExport: "legacyTokens",
          contractVersion: 2,
        }),
      ),
      root: repoRoot,
    }),
    /contractVersion 2; the only current contract is the numeric contractVersion: 4/,
  );
});

/* -------------------------------------------------------------------------- */
/* Extension loader generation                                                 */
/* -------------------------------------------------------------------------- */

test("neutral systems generate an empty Showcase loader and no Reference App loader", async (t) => {
  const { plan } = await fixturePlan(t, { includeExtensions: false });
  const loader = planFile(plan, "showcase", "extension-loaders");
  assert.ok(loader, "the Showcase loader is generated even when neutral");
  assert.equal(loader.action, "create");
  assert.match(loader.after, /@prism-system:tool-owned/);
  assert.match(loader.after, /export type ExtensionModule = Record<string, unknown>;/);
  assert.match(loader.after, /export async function loadExtension\(/);
  assert.match(loader.after, /systemId: string,/);
  assert.match(loader.after, /name: string,/);
  assert.doesNotMatch(loader.after, /import\(/);

  // Exactly the managed app outputs are planned: no empty package component,
  // motion, or custom module is ever generated.
  assert.deepEqual(plan.files.map((file) => `${file.app}:${file.kind}`).sort(), [
    "reference-app:layout",
    "reference-app:next-config",
    "reference-app:package-json",
    "reference-app:registry",
    "showcase:extension-loaders",
    "showcase:layout",
    "showcase:next-config",
    "showcase:package-json",
    "showcase:registry",
  ]);
  assert.ok(!planFile(plan, "reference-app", "extension-loaders"));

  typecheckGeneratedRegistry(planFile(plan, "showcase", "registry").after, {
    packageName: EXTENSION_FIXTURE.packageName,
    tokensExport: EXTENSION_FIXTURE.tokensExport,
    extraFiles: { [TYPECHECK_LOADER_PATH]: loader.after },
  });
});

test("declared extensions generate literal lazy imports from real declarations", async (t) => {
  const root = createFixtureRoot(t, {});
  const plan = await planAppIntegration({
    manifest: manifest(EXTENSION_FIXTURE, PULSE),
    root,
  });
  assert.equal(plan.status, "planned");

  const loader = planFile(plan, "showcase", "extension-loaders");
  assert.match(loader.after, /"extension-fixture": \{/);
  assert.match(loader.after, /KeyboardScene: \(\) =>/);
  assert.ok(
    loader.after.includes(`import("${EXTENSION_IMPORT}")`),
    "the declared entrypoint becomes one literal dynamic import",
  );
  assert.equal(
    (loader.after.match(/import\(/g) ?? []).length,
    1,
    "exactly one dynamic import per declared extension",
  );
  assert.match(loader.after, /=>\s+import\(/, "imports stay inside their mapping function");
  assert.doesNotMatch(loader.after, /"pulse": \{/, "neutral systems contribute no mapping");
  assert.doesNotMatch(loader.after, /ui-pulse/);

  // Metadata is validated, never embedded: injected description text and
  // declared effect values cannot reach generated code.
  assert.doesNotMatch(loader.after, /process\.exit/);
  assert.doesNotMatch(loader.after, /injected metadata/);
  assert.doesNotMatch(loader.after, /apiVersion/);
  assert.doesNotMatch(loader.after, /webgl/);

  // The Reference App shares the metadata registry but imports no extension.
  const showcaseRegistry = planFile(plan, "showcase", "registry").after;
  const referenceRegistry = planFile(plan, "reference-app", "registry").after;
  assert.equal(showcaseRegistry, referenceRegistry, "both apps generate the same registry");
  assert.ok(!planFile(plan, "reference-app", "extension-loaders"));
  assert.doesNotMatch(showcaseRegistry, /import\(/);
  assert.doesNotMatch(showcaseRegistry, /keyboard-scene/);
  assert.doesNotMatch(showcaseRegistry, /KeyboardScene/);
});

test("an injected catalog is used directly and the lazy fallback still works", async (t) => {
  const root = createFixtureRoot(t, {});

  // A stub proves the injected catalog is used verbatim: the lazy fallback
  // would never call these members and would fail on this nonsense descriptor.
  let calls = 0;
  const stubCatalog = {
    REQUIRED_COMPONENTS: [],
    OPTIONAL_COMPONENTS: [],
    readSourceDescriptor() {
      calls += 1;
      return { extensions: { [EXTENSION_NAME]: { entrypoint: EXTENSION_ENTRYPOINT } } };
    },
  };
  const injectedStub = await planAppIntegration({
    manifest: manifest(EXTENSION_FIXTURE),
    root,
    catalog: stubCatalog,
  });
  assert.equal(calls, 1, "the injected catalog reader is called exactly once");
  const stubLoader = planFile(injectedStub, "showcase", "extension-loaders");
  assert.ok(stubLoader.after.includes(`import("${EXTENSION_IMPORT}")`));
  assert.ok(
    !planFile(injectedStub, "reference-app", "extension-loaders"),
    "the Reference App never imports an extension, injected catalog or not",
  );

  // The real namespace and the standalone lazy default generate the same plan.
  const injectedReal = await planAppIntegration({
    manifest: manifest(EXTENSION_FIXTURE),
    root,
    catalog: manifestTooling,
  });
  const fallback = await planAppIntegration({ manifest: manifest(EXTENSION_FIXTURE), root });
  assert.equal(injectedReal.status, "planned");
  assert.equal(fallback.status, "planned");
  assert.equal(
    planFile(injectedReal, "showcase", "extension-loaders").after,
    planFile(fallback, "showcase", "extension-loaders").after,
  );
  assert.equal(stubLoader.after, planFile(fallback, "showcase", "extension-loaders").after);
  assert.ok(!planFile(fallback, "reference-app", "extension-loaders"));
});

test("an extension entrypoint absent from package exports is rejected", async (t) => {
  const invalidRoot = createFixtureRoot(t, { dropDeclaration: true });
  await assert.rejects(
    planAppIntegration({ manifest: manifest(EXTENSION_FIXTURE), root: invalidRoot }),
    /keyboard-scene|entrypoint|exports|declared/i,
  );
});

test("an unmarked extension loader file is refused instead of overwritten", async (t) => {
  const root = createFixtureRoot(t, { includeExtensions: false });
  mkdirSync(join(root, "apps", "showcase", "app"), { recursive: true });
  const unmarked = "export const loadExtension = () => undefined;\n";
  writeFileSync(extensionLoaderPath(root), unmarked, "utf8");

  await assert.rejects(
    planAppIntegration({ manifest: manifest(EXTENSION_FIXTURE), root }),
    /Refusing to rewrite .*extension-loaders\.ts/,
  );
  assert.equal(readFileSync(extensionLoaderPath(root), "utf8"), unmarked, "bytes stay untouched");
});

test("app integration applies atomically, rolls back exactly, and is idempotent", async (t) => {
  const { root, plan } = await fixturePlan(t, { includeExtensions: false });
  const loaderPath = extensionLoaderPath(root);
  const registryPath = join(root, "apps", "showcase", "app", "registry.ts");

  // A directory where a planned file belongs makes one write fail after an
  // earlier file was already written, proving the atomic rollback.
  mkdirSync(join(root, "apps", "showcase", "app", "layout.tsx"), { recursive: true });
  assert.throws(() => applyAppIntegration(plan));
  assert.ok(!existsSync(registryPath), "the earlier registry write was rolled back");
  assert.ok(!existsSync(loaderPath), "the loader was never written");
  assert.deepEqual(
    walkFiles(join(root, "apps")).filter((file) => file.includes(".tmp-")),
    [],
    "no temporary write files are left behind",
  );
  rmSync(join(root, "apps", "showcase", "app", "layout.tsx"), { recursive: true, force: true });

  const applied = applyAppIntegration(plan);
  assert.ok(applied.changed, "the first apply writes files");
  assert.ok(existsSync(loaderPath));

  const secondPlan = await planAppIntegration({
    manifest: manifest(EXTENSION_FIXTURE),
    root,
  });
  assert.equal(secondPlan.status, "planned");
  for (const file of secondPlan.files) {
    assert.equal(file.action, "unchanged", `${file.relativePath} is idempotent`);
  }
  assert.equal(applyAppIntegration(secondPlan).changed, false);

  rollbackAppIntegration(applied);
  assert.ok(!existsSync(loaderPath), "rollback removes the newly created loader");
  assert.ok(!existsSync(registryPath), "rollback removes the newly created registry");
});

/* -------------------------------------------------------------------------- */
/* Live repository integration                                                 */
/* -------------------------------------------------------------------------- */

const liveManifest = readManifest({
  manifestPath: join(repoRoot, "config", "design-systems.json"),
});

test("the committed Showcase and Reference App registries match the generated plan", async () => {
  const plan = await planAppIntegration({ manifest: liveManifest, root: repoRoot });
  assert.equal(plan.status, "planned");

  const registries = plan.files.filter((file) => file.kind === "registry");
  assert.deepEqual(
    registries.map((file) => file.app),
    ["showcase", "reference-app"],
  );
  const [showcase, reference] = registries;
  assert.equal(showcase.after, reference.after, "both apps generate the same registry");

  for (const file of registries) {
    assert.equal(file.action, "unchanged", `${file.relativePath} is in sync`);
    assert.equal(
      readFileSync(file.path, "utf8"),
      file.after,
      `${file.relativePath} matches the generated plan`,
    );
  }
});

test("the live registries expose every package manifest and no guessed capability", async () => {
  const entries = liveManifest.designSystems;
  assert.ok(entries.length > 0, "the live manifest registers at least one system");
  for (const system of entries) {
    assert.equal(system.contractVersion, 4, `${system.id} declares contractVersion 4`);
  }

  const source = await registrySourceFor(liveManifest);

  assert.match(source, /type RegisteredSystem = Omit<DesignSystem, "components"> & \{/);
  assert.match(source, /components: DesignSystemComponents;/);
  assert.match(
    source,
    /capabilities: \{\n {4}categories: Readonly<Record<string, RegisteredManifestCapabilityCategory>>;\n {2}\};/,
  );

  for (const system of entries) {
    const alias = system.id
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    assert.ok(source.includes(system.packageName), `${system.id} package import`);
    assert.ok(
      source.includes(`${alias.charAt(0).toLowerCase()}${alias.slice(1)}Manifest`),
      `${system.id} manifest import`,
    );
  }
  assertNoOptionalNameGuessing(source);
});

test("the live Showcase loader is in sync and the Reference App has none", async () => {
  const plan = await planAppIntegration({ manifest: liveManifest, root: repoRoot });
  assert.equal(plan.status, "planned");

  const loaders = plan.files.filter((file) => file.kind === "extension-loaders");
  assert.deepEqual(
    loaders.map((file) => file.app),
    ["showcase"],
    "only Showcase plans an extension loader registry",
  );
  const [loader] = loaders;
  assert.equal(loader.action, "unchanged", `${loader.relativePath} is in sync`);
  assert.equal(readFileSync(loader.path, "utf8"), loader.after);

  assert.ok(
    !existsSync(join(repoRoot, "apps", "reference-app", "app", EXTENSION_LOADERS_FILENAME)),
    "the Reference App never ships an extension loader module",
  );
});
