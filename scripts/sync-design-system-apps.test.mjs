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
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { planAppIntegration } from "./sync-design-system-apps.mjs";
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
const MINIMAL_MANIFEST_PATH = join(repoRoot, "apps", "showcase", "__minimal-manifest__.d.ts");

/**
 * A compile-time-only fixture built against core's real component contract.
 * It supplies every one of the twenty-nine required keys and deliberately
 * supplies no optional key.
 */
function minimalSystemSource() {
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
    `  packageName: ${JSON.stringify(PULSE.packageName)},`,
    '  version: "1.0.0",',
    "  contractVersion: 4,",
    "  components,",
    "});",
    "",
    "export const pulseTokens = {",
    '  color: { text: "#111111" },',
    '  radius: { medium: "4px" },',
    '  shadow: { none: "none" },',
    '  motion: { quick: "120ms" },',
    "};",
    "",
  ].join("\n");
}

function minimalManifestSource() {
  const components = REQUIRED_NAMES.map(
    (name) => `    ${JSON.stringify(name)}: { variants: [], sizes: [], members: [] },`,
  );

  return [
    "declare const manifest: {",
    "  schemaVersion: 4;",
    "  contractVersion: 4;",
    '  id: "minimal";',
    '  name: "Minimal";',
    `  package: ${JSON.stringify(PULSE.packageName)};`,
    '  version: "1.0.0";',
    "  components: {",
    ...components,
    "  };",
    "  capabilities: {",
    "    categories: {",
    '      composition: { required: ["Container"], optional: [] };',
    "      forms: { required: [], optional: [] };",
    '      "data-display": { required: [], optional: [] };',
    "    };",
    "  };",
    "};",
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
    'import type { RegisteredSystem } from "./__registered-system-type-regression.js";',
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

function typecheckGeneratedRegistry(registrySource, { allowDiagnostics = false } = {}) {
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
  const virtualFiles = new Map([
    [resolve(TYPECHECK_REGISTRY_PATH), registrySource],
    [resolve(TYPECHECK_CONSUMER_PATH), registeredSystemUsageSource()],
    [resolve(MINIMAL_SYSTEM_PATH), minimalSystemSource()],
    [resolve(MINIMAL_MANIFEST_PATH), minimalManifestSource()],
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
      if (moduleName === PULSE.packageName) {
        return { resolvedFileName: MINIMAL_SYSTEM_PATH, extension: ts.Extension.Ts };
      }
      if (moduleName === `${PULSE.packageName}/manifest`) {
        return { resolvedFileName: MINIMAL_MANIFEST_PATH, extension: ts.Extension.Dts };
      }
      if (moduleName === "./__registered-system-type-regression.js") {
        return { resolvedFileName: TYPECHECK_REGISTRY_PATH, extension: ts.Extension.Ts };
      }
      return ts.resolveModuleName(moduleName, containingFile, options, host).resolvedModule;
    });

  const program = ts.createProgram(
    [TYPECHECK_REGISTRY_PATH, TYPECHECK_CONSUMER_PATH],
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

  // The generator spreads each package's real runtime map and never enumerates
  // a component name: no required or optional name appears in the output.
  for (const name of [...REQUIRED_NAMES, ...OPTIONAL_NAMES]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`));
  }
  assertNoOptionalNameGuessing(source);
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
