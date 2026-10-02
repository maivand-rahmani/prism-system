#!/usr/bin/env node
/**
 * Custom-component harness unit tests (Node built-in test runner, no network).
 *
 * These tests exercise the helper/fake-fixture layer of
 * `scripts/check-custom-components.mjs` without packing, building, or
 * installing any real repository artifact:
 *  - extension discovery from shipped manifests (including fail-closed shapes);
 *  - static packed-artifact checks: missing export target/JS/DTS, missing
 *    export name, missing docs/example, unsafe path escapes, root/tokens leaks,
 *    client/server banners, publicApi membership;
 *  - consumer fixture generators and row coverage for both approved React rows,
 *    including the two locked System B pilot scenario adapters (typed real props,
 *    real mount/SSR wiring) and generic import-only safety for unknown names;
 *  - explicit no-extension early exit without creating a TEMP run directory;
 *  - unique contained run directories and cleanup semantics.
 *
 * The real packed/consumer matrix is executed by the parent after the designer
 * handoff (`node scripts/check-custom-components.mjs`); these tests must stay
 * offline and deterministic.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONSUMER_MATRIX,
  PILOT_PACKAGE,
  buildBrowserHtmlSource,
  buildBrowserMainSource,
  buildConsumerEntryProbeSource,
  buildConsumerPackageJson,
  buildConsumerSsrSource,
  buildConsumerTypesSource,
  collectPackedCustomFailures,
  createRunDirectory,
  discoverDeclaredExtensions,
  hashTree,
  helpText,
  isSceneExtension,
  moduleSpecifiers,
  packageRequiresDist,
  parseArgs,
  resolvePilotScenario,
  runHarness,
  startsWithClientDirective,
  startStaticServer,
} from "./check-custom-components.mjs";
import { buildManifest } from "./design-system-manifest.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "schemas", "fixtures");

function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Copy the real `valid-custom` source fixture into a temp dir, generate its
 * manifest, and create the packed `dist/` artifacts the static checks read.
 * `mutate` receives the dir, parsed package.json, generated manifest, and
 * write helpers, and may change any of them in place.
 */
function makePackedCustomFixture(t, mutate) {
  const dir = mkdtempSync(join(tmpdir(), "prism-custom-packed-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(fixturesRoot, "valid-custom"), dir, { recursive: true });
  const manifest = buildManifest({ id: "valid-custom", packageDir: dir });
  writeJson(join(dir, "design-system.json"), manifest);

  writeText(
    join(dir, "dist", "index.mjs"),
    '"use client";\nexport { Button } from "./chunk.mjs";\n',
  );
  writeText(join(dir, "dist", "index.js"), '"use client";\nexports.Button = {};\n');
  writeText(join(dir, "dist", "index.d.ts"), "export declare const Button: unknown;\n");
  writeText(join(dir, "dist", "tokens", "index.mjs"), "export const v4CustomTokens = {};\n");
  writeText(join(dir, "dist", "tokens", "index.js"), "exports.v4CustomTokens = {};\n");
  writeText(
    join(dir, "dist", "tokens", "index.d.ts"),
    "export declare const v4CustomTokens: unknown;\n",
  );

  for (const [slug, names] of [
    ["reveal", ["Reveal", "revealPresets"]],
    ["keyboard-scene", ["KeyboardScene", "keyboardSceneUtils"]],
  ]) {
    writeText(
      join(dir, "dist", "custom", slug, "index.mjs"),
      `${names.map((name) => `const ${name} = {};`).join("\n")}\nexport { ${names.join(", ")} };\n`,
    );
    writeText(join(dir, "dist", "custom", slug, "index.js"), `exports.${names[0]} = {};\n`);
    writeText(
      join(dir, "dist", "custom", slug, "index.d.ts"),
      `${names.map((name) => `declare const ${name}: unknown;`).join("\n")}\nexport { ${names.join(", ")} };\n`,
    );
  }

  const helpers = {
    dir,
    manifest,
    pkg: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")),
    writeText: (relativePath, content) => writeText(join(dir, relativePath), content),
    writeJson: (relativePath, value) => writeJson(join(dir, relativePath), value),
  };
  if (mutate) mutate(helpers);
  return helpers;
}

function runStatic(helpers) {
  return collectPackedCustomFailures({
    label: "fixture",
    extractedDir: helpers.dir,
    pkg: helpers.pkg,
    manifest: helpers.manifest,
  });
}

/** Build a fake repository root with one custom and one neutral registered system. */
function makeDiscoveryRoot(t, { customManifest } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-custom-root-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const customDir = join(root, "packages", "valid-custom");
  cpSync(join(fixturesRoot, "valid-custom"), customDir, { recursive: true });
  const manifest = customManifest ?? buildManifest({ id: "valid-custom", packageDir: customDir });
  writeJson(join(customDir, "design-system.json"), manifest);

  const neutralDir = join(root, "packages", "v4-valid");
  cpSync(join(fixturesRoot, "valid"), neutralDir, { recursive: true });
  writeJson(
    join(neutralDir, "design-system.json"),
    buildManifest({ id: "v4-valid", packageDir: neutralDir }),
  );

  writeJson(join(root, "config", "design-systems.json"), {
    version: 3,
    designSystems: [
      {
        id: "v4-valid",
        name: "V4 Valid",
        packageName: "@prism-system/ui-v4-valid",
        packagePath: "packages/v4-valid",
        version: "0.0.0",
        uiClass: "maivand-valid-ui",
        tokensExport: "v4ValidTokens",
        contractVersion: 4,
      },
      {
        id: "valid-custom",
        name: "V4 Custom",
        packageName: "@prism-system/ui-valid-custom",
        packagePath: "packages/valid-custom",
        version: "0.0.0",
        uiClass: "maivand-valid-custom-ui",
        tokensExport: "v4CustomTokens",
        contractVersion: 4,
      },
    ],
  });
  return { root, manifest };
}

/** Fake root with only a neutral registered system (no declared extensions). */
function makeNeutralRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "prism-custom-neutral-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const neutralDir = join(root, "packages", "v4-valid");
  cpSync(join(fixturesRoot, "valid"), neutralDir, { recursive: true });
  writeJson(
    join(neutralDir, "design-system.json"),
    buildManifest({ id: "v4-valid", packageDir: neutralDir }),
  );
  writeJson(join(root, "config", "design-systems.json"), {
    version: 3,
    designSystems: [
      {
        id: "v4-valid",
        name: "V4 Valid",
        packageName: "@prism-system/ui-v4-valid",
        packagePath: "packages/v4-valid",
        version: "0.0.0",
        uiClass: "maivand-valid-ui",
        tokensExport: "v4ValidTokens",
        contractVersion: 4,
      },
    ],
  });
  return root;
}

test("CLI option parsing and help cover the documented switches", () => {
  assert.deepEqual(parseArgs([]), {
    root: undefined,
    staticOnly: false,
    keep: false,
    serve: false,
    json: false,
    help: false,
  });
  const options = parseArgs(["--static-only", "--keep", "--root", "C:/repo", "--json"]);
  assert.equal(options.staticOnly, true);
  assert.equal(options.keep, true);
  assert.equal(options.root, "C:/repo");
  assert.equal(options.json, true);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown option: --unknown/);
  assert.throws(() => parseArgs(["positional"]), /Unexpected argument: positional/);
  assert.match(helpText(), /--static-only/);
  assert.match(helpText(), /--serve/);
});

test("the consumer matrix covers both approved React rows exactly", () => {
  assert.deepEqual(
    CONSUMER_MATRIX.map((row) => row.id),
    ["react18-fiber8", "react19-fiber9"],
  );
  assert.deepEqual(CONSUMER_MATRIX, [
    {
      id: "react18-fiber8",
      react: "18.3.1",
      reactDom: "18.3.1",
      fiber: "8.18.0",
      three: "0.186.1",
      typesReact: "18.3.24",
      typesReactDom: "18.3.7",
      typesThree: "0.186.0",
      typescript: "5.9.3",
    },
    {
      id: "react19-fiber9",
      react: "19.3.0",
      reactDom: "19.3.0",
      fiber: "9.8.1",
      three: "0.186.1",
      typesReact: "19.3.0",
      typesReactDom: "19.2.3",
      typesThree: "0.186.0",
      typescript: "5.9.3",
    },
  ]);
});

test("extension discovery reads shipped manifests and keeps neutral systems empty", (t) => {
  const { root } = makeDiscoveryRoot(t);
  const discovery = discoverDeclaredExtensions({ root });
  assert.deepEqual(discovery.extensions.map((extension) => extension.name).sort(), [
    "KeyboardScene",
    "Reveal",
  ]);
  assert.deepEqual(discovery.extensions.map((extension) => extension.importPath).sort(), [
    "@prism-system/ui-valid-custom/custom/keyboard-scene",
    "@prism-system/ui-valid-custom/custom/reveal",
  ]);
  const neutral = discovery.systems.find((system) => system.id === "v4-valid");
  assert.deepEqual(neutral.extensions, []);
  const scene = discovery.extensions.find((extension) => extension.name === "KeyboardScene");
  assert.equal(isSceneExtension(scene), true);
  assert.equal(scene.packageName, "@prism-system/ui-valid-custom");
  const dom = discovery.extensions.find((extension) => extension.name === "Reveal");
  assert.equal(isSceneExtension(dom), false);
  assert.equal(
    discovery.systems.find((system) => system.id === "valid-custom").uiClass,
    "maivand-valid-custom-ui",
  );
});

test("extension-bearing systems fail closed on a missing or mismatched uiClass", (t) => {
  {
    const { root } = makeDiscoveryRoot(t);
    const packageJsonPath = join(root, "packages", "valid-custom", "package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    delete pkg.prismSystem.uiClass;
    writeJson(packageJsonPath, pkg);
    assert.throws(
      () => discoverDeclaredExtensions({ root }),
      /prismSystem\.uiClass.*required when extensions are declared/,
    );
  }
  {
    const { root } = makeDiscoveryRoot(t);
    const packageJsonPath = join(root, "packages", "valid-custom", "package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    pkg.prismSystem.uiClass = "maivand-other-ui";
    writeJson(packageJsonPath, pkg);
    assert.throws(() => discoverDeclaredExtensions({ root }), /uiClass mismatch/);
  }
});

test("extension discovery fails closed on a non-current shipped manifest", (t) => {
  const { root, manifest } = makeDiscoveryRoot(t);
  const legacy = structuredClone(manifest);
  legacy.schemaVersion = 4;
  writeJson(join(root, "packages", "valid-custom", "design-system.json"), legacy);
  assert.throws(
    () => discoverDeclaredExtensions({ root }),
    /Invalid shipped manifest for "valid-custom".*schemaVersion/,
  );
});

test("a fully consistent packed custom fixture passes every static check", (t) => {
  const helpers = makePackedCustomFixture(t);
  assert.deepEqual(runStatic(helpers), []);
});

test("a neutral packed manifest needs no custom artifacts", () => {
  const dir = join(fixturesRoot, "valid");
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const manifest = buildManifest({ id: "v4-valid", packageDir: dir });
  assert.deepEqual(
    collectPackedCustomFailures({ label: "neutral", extractedDir: dir, pkg, manifest }),
    [],
  );
});

test("static checks fail closed on missing export targets and artifacts", (t) => {
  {
    const helpers = makePackedCustomFixture(t, ({ pkg }) => {
      delete pkg.exports["./custom/reveal"];
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /manifest entrypoint "\.\/custom\/reveal" is missing/,
    );
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      rmSync(join(dir, "dist", "custom", "reveal", "index.mjs"));
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /artifact is missing or not a file: \.\/dist\/custom\/reveal\/index\.mjs/,
    );
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      rmSync(join(dir, "dist", "custom", "reveal", "index.d.ts"));
    });
    assert.match(runStatic(helpers).join("\n"), /index\.d\.ts$/m);
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      writeText(join(dir, "dist", "custom", "reveal", "index.mjs"), "export {};\n");
    });
    assert.match(runStatic(helpers).join("\n"), /does not statically reference the export/);
  }
  {
    const helpers = makePackedCustomFixture(t, ({ pkg }) => {
      pkg.exports["./custom/reveal"] = {
        types: "./../outside.d.ts",
        import: "./../outside.mjs",
      };
    });
    assert.match(runStatic(helpers).join("\n"), /artifact escapes the packed package/);
  }
});

test("static checks fail closed on missing docs and examples", (t) => {
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      rmSync(join(dir, "docs", "reveal.md"));
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /extension "Reveal" docs is missing or not a file: \.\/docs\/reveal\.md/,
    );
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      rmSync(join(dir, "examples", "keyboard-scene.tsx"));
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /extension "KeyboardScene" example is missing or not a file: \.\/examples\/keyboard-scene\.tsx/,
    );
  }
});

test("scene-only peers are allowed in extension artifacts but not in root/tokens", (t) => {
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      writeText(
        join(dir, "dist", "custom", "keyboard-scene", "index.mjs"),
        'import "three";\nimport "@react-three/fiber";\nexport const KeyboardScene = {};\nexport const keyboardSceneUtils = {};\n',
      );
    });
    const failures = runStatic(helpers);
    assert.equal(failures.length, 0, failures.join("\n"));
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      writeText(
        join(dir, "dist", "index.mjs"),
        '"use client";\nimport "three";\nexport { Button } from "./chunk.mjs";\n',
      );
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /root artifact references scene-only module "three"/,
    );
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      writeText(
        join(dir, "dist", "tokens", "index.mjs"),
        'export { default as three } from "three";\nexport const v4CustomTokens = {};\n',
      );
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /tokens artifact references scene-only module "three"/,
    );
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      writeText(
        join(dir, "dist", "index.mjs"),
        '"use client";\nimport "./custom/reveal/index.mjs";\nexport { Button } from "./chunk.mjs";\n',
      );
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /root artifact references custom entrypoint \.\/custom\/reveal/,
    );
  }
});

test("root/tokens banners and publicApi ownership are enforced", (t) => {
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      writeText(join(dir, "dist", "index.mjs"), "export { Button } from './chunk.mjs';\n");
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /root import artifact must open with a top-level "use client"/,
    );
  }
  {
    const helpers = makePackedCustomFixture(t, ({ dir }) => {
      writeText(
        join(dir, "dist", "tokens", "index.mjs"),
        '"use client";\nexport const v4CustomTokens = {};\n',
      );
    });
    assert.match(runStatic(helpers).join("\n"), /must not carry a "use client" directive/);
  }
  {
    const helpers = makePackedCustomFixture(t, ({ manifest }) => {
      manifest.publicApi["."].push("Reveal");
    });
    assert.match(
      runStatic(helpers).join("\n"),
      /extension "Reveal" leaked into the root\/tokens publicApi/,
    );
  }
});

const pilotKeyboardScene = Object.freeze({
  name: "KeyboardScene",
  packageName: PILOT_PACKAGE,
  importPath: `${PILOT_PACKAGE}/custom/keyboard-scene`,
});

const pilotWorkflowMap = Object.freeze({
  name: "InteractiveWorkflowMap",
  packageName: PILOT_PACKAGE,
  importPath: `${PILOT_PACKAGE}/custom/interactive-workflow-map`,
});

test("pilot scenario adapters stay locked to exact System B names and entrypoints", () => {
  assert.equal(resolvePilotScenario(pilotKeyboardScene)?.propsType, "KeyboardSceneProps");
  assert.equal(resolvePilotScenario(pilotKeyboardScene)?.ssrMode, "import-only");
  assert.equal(resolvePilotScenario(pilotWorkflowMap)?.propsType, "InteractiveWorkflowMapProps");
  assert.equal(resolvePilotScenario(pilotWorkflowMap)?.ssrMode, "markup");
  assert.equal(resolvePilotScenario({ name: "KeyboardScene" }), null);
  assert.equal(resolvePilotScenario({ name: "KeyboardScene", packageName: PILOT_PACKAGE }), null);
  assert.equal(
    resolvePilotScenario({
      name: "KeyboardScene",
      packageName: "@prism-system/ui-valid-custom",
      importPath: "@prism-system/ui-valid-custom/custom/keyboard-scene",
    }),
    null,
  );
  assert.equal(
    resolvePilotScenario({
      name: "KeyboardScene",
      packageName: PILOT_PACKAGE,
      importPath: `${PILOT_PACKAGE}/custom/renamed-keyboard-scene`,
    }),
    null,
  );
  assert.equal(
    resolvePilotScenario({
      name: "Reveal",
      packageName: PILOT_PACKAGE,
      importPath: `${PILOT_PACKAGE}/custom/reveal`,
    }),
    null,
  );
});

test("type probes use real pilot props and JSX elements, not import existence", () => {
  const types = buildConsumerTypesSource({
    packageName: PILOT_PACKAGE,
    tokensExport: "systemBTokens",
    extensions: [pilotKeyboardScene],
  });
  assert.match(types, /import \{ Button, DesignSystem \} from "@prism-system\/ui-system-b";/);
  assert.match(types, /import \{ systemBTokens \} from "@prism-system\/ui-system-b\/tokens";/);
  assert.match(
    types,
    /import \{ KeyboardScene \} from "@prism-system\/ui-system-b\/custom\/keyboard-scene";/,
  );
  assert.match(
    types,
    /import type \{ KeyboardSceneProps \} from "@prism-system\/ui-system-b\/custom\/keyboard-scene";/,
  );
  assert.match(types, /const keyboardSceneProps: KeyboardSceneProps = \{/);
  assert.match(types, /selectedKey: "letter-g"/);
  assert.match(types, /onSelectedKeyChange: \(key\) => \{/);
  assert.match(types, /reducedMotion: true/);
  assert.match(
    types,
    /export const keyboardSceneProbe = <KeyboardScene \{\.\.\.keyboardSceneProps\} \/>;/,
  );

  const mapTypes = buildConsumerTypesSource({
    packageName: PILOT_PACKAGE,
    tokensExport: "systemBTokens",
    extensions: [pilotWorkflowMap],
  });
  assert.match(
    mapTypes,
    /import type \{ InteractiveWorkflowMapProps, InteractiveWorkflowNode \} from "@prism-system\/ui-system-b\/custom\/interactive-workflow-map";/,
  );
  assert.match(mapTypes, /const workflowNodes: readonly InteractiveWorkflowNode\[\] = \[/);
  assert.match(mapTypes, /const interactiveWorkflowMapProps: InteractiveWorkflowMapProps = \{/);
  assert.match(mapTypes, /label: "Custom-component harness workflow"/);
  assert.match(
    mapTypes,
    /export const interactiveWorkflowMapProbe = <InteractiveWorkflowMap \{\.\.\.interactiveWorkflowMapProps\} \/>;/,
  );
});

test("SSR probes render approved DOM pilots and only import WebGL/unknown entries", () => {
  const scene = buildConsumerSsrSource({
    packageName: PILOT_PACKAGE,
    version: "9.9.9",
    tokensExport: "systemBTokens",
    extensions: [pilotKeyboardScene],
  });
  assert.match(scene, /await import\("@prism-system\/ui-system-b"\)/);
  assert.match(scene, /await import\("@prism-system\/ui-system-b\/custom\/keyboard-scene"\)/);
  assert.match(scene, /DesignSystem\?\.version/);
  assert.match(scene, /assert\.equal\(typeof extensionModule0\.KeyboardScene, "function"/);
  assert.match(scene, /no SSR markup claim/);
  assert.doesNotMatch(scene, /renderToString/);

  const map = buildConsumerSsrSource({
    packageName: PILOT_PACKAGE,
    version: "9.9.9",
    tokensExport: "systemBTokens",
    extensions: [pilotWorkflowMap],
  });
  assert.match(map, /import \{ renderToString \} from "react-dom\/server";/);
  assert.match(map, /renderToString\(/);
  assert.match(map, /createElement\(extensionModule0\.InteractiveWorkflowMap, \{/);
  assert.match(map, /selectedNodeId: "review"/);
  assert.match(map, /markup0\.includes\(.*aria-label=.*Custom-component harness workflow.*\)/);
  assert.match(map, /markup0\.includes\("Review selected\."\)/);

  const generic = buildConsumerSsrSource({
    packageName: "@prism-system/ui-valid-custom",
    version: "0.0.0",
    tokensExport: "v4CustomTokens",
    extensions: [{ name: "Reveal", importPath: "@prism-system/ui-valid-custom/custom/reveal" }],
  });
  assert.match(generic, /assert\.ok\("Reveal" in extensionModule0/);
  assert.match(generic, /no approved scenario adapter; server import only/);
  assert.doesNotMatch(generic, /renderToString/);
});

test("browser fixture mounts both pilots and stays generic for unknown extensions", () => {
  const main = buildBrowserMainSource({
    packageName: PILOT_PACKAGE,
    uiClass: "maivand-b-ui",
    extensions: [pilotKeyboardScene, pilotWorkflowMap],
  });
  assert.match(main, /import \{ useState \} from "react";/);
  assert.match(main, /import \{ Button, Card \} from "@prism-system\/ui-system-b";/);
  assert.match(
    main,
    /import \{ KeyboardScene \} from "@prism-system\/ui-system-b\/custom\/keyboard-scene";/,
  );
  assert.match(
    main,
    /import \{ InteractiveWorkflowMap \} from "@prism-system\/ui-system-b\/custom\/interactive-workflow-map";/,
  );
  assert.match(main, /className="maivand-b-ui"/);
  assert.match(main, /<KeyboardScene/);
  assert.match(main, /selectedKey=\{selectedKey\}/);
  assert.match(main, /onSelectedKeyChange=\{handleSelectedKeyChange\}/);
  assert.match(main, /reducedMotion=\{reducedMotion \? true : undefined\}/);
  assert.match(main, /<InteractiveWorkflowMap/);
  assert.match(main, /nodes=\{workflowNodes\}/);
  assert.match(main, /selectedNodeId=\{selectedNodeId\}/);
  assert.match(main, /onSelectedNodeChange=\{handleSelectedNodeChange\}/);
  assert.match(main, /label="Custom-component harness workflow"/);
  assert.match(main, /data-prism-qa="keyboard-selected"/);
  assert.match(main, /data-selected-key=\{selectedKey \?\? ""\}/);
  assert.match(main, /data-prism-qa="keyboard-changes"/);
  assert.match(main, /data-prism-qa="keyboard-reduced-motion"/);
  assert.match(main, /data-prism-qa="keyboard-context-loss"/);
  assert.match(main, /data-prism-qa="workflow-selected"/);
  assert.match(main, /data-selected-node=\{selectedNodeId \?\? ""\}/);
  assert.match(main, /data-prism-qa="workflow-changes"/);
  assert.match(main, /<Button>Action<\/Button>/);
  assert.match(main, /<Card\.Header>Prism custom components<\/Card\.Header>/);
  assert.doesNotMatch(main, /CardContent|CardHeader/);
  assert.match(main, /<Card\.Content>/);
  assert.match(main, /<\/Card\.Content>/);
  assert.doesNotMatch(main, /void \[KeyboardScene/);
  assert.match(main, /createRoot\(rootElement\)\.render\(<Probe \/>\);/);

  const mixed = buildBrowserMainSource({
    packageName: PILOT_PACKAGE,
    uiClass: "maivand-b-ui",
    extensions: [
      pilotKeyboardScene,
      {
        name: "Reveal",
        packageName: PILOT_PACKAGE,
        importPath: `${PILOT_PACKAGE}/custom/reveal`,
      },
    ],
  });
  assert.match(mixed, /<KeyboardScene/);
  assert.match(mixed, /void \[Reveal\];/);
  assert.doesNotMatch(mixed, /<Reveal/);

  const generic = buildBrowserMainSource({
    packageName: "@prism-system/ui-valid-custom",
    extensions: [
      {
        name: "KeyboardScene",
        packageName: "@prism-system/ui-valid-custom",
        importPath: "@prism-system/ui-valid-custom/custom/keyboard-scene",
      },
    ],
  });
  assert.match(generic, /void \[KeyboardScene\];/);
  assert.doesNotMatch(generic, /<KeyboardScene/);

  const html = buildBrowserHtmlSource({ title: "Probe" });
  assert.match(html, /src="\.\/bundle\.js"/);
  assert.match(html, /href="\.\/bundle\.css"/);

  const probe = buildConsumerEntryProbeSource({ extension: pilotKeyboardScene });
  assert.match(
    probe,
    /import \{ KeyboardScene \} from "@prism-system\/ui-system-b\/custom\/keyboard-scene";/,
  );
  assert.deepEqual(buildConsumerPackageJson({ name: "probe" }), {
    name: "probe",
    version: "0.0.0",
    private: true,
    type: "module",
  });
});

test("module specifier and client directive helpers are bounded", () => {
  assert.deepEqual(
    moduleSpecifiers(
      'import "three";\nimport x from "@react-three/fiber";\nconst y = require("react");\nawait import("pkg/sub");\n',
    ),
    ["@react-three/fiber", "three", "react", "pkg/sub"],
  );
  assert.equal(startsWithClientDirective('"use client";\nexport {};\n'), true);
  assert.equal(startsWithClientDirective("\n  'use client';\nexport {};\n"), true);
  assert.equal(startsWithClientDirective("export {};\n"), false);
  assert.equal(startsWithClientDirective('export {};\n"use client";\n'), false);
});

test("run directories are unique, contained, and cleaned on request", (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-custom-run-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = createRunDirectory(root);
  const second = createRunDirectory(root);
  assert.notEqual(first, second);
  for (const runDirectory of [first, second]) {
    assert.equal(runDirectory.startsWith(join(root, "TEMP", "lifecycle")), true);
    assert.equal(existsSync(runDirectory), true);
    rmSync(runDirectory, { recursive: true, force: true });
    assert.equal(existsSync(runDirectory), false);
  }
  assert.equal(hashTree(join(root, "TEMP", "lifecycle")).length, 64);
});

test("with no declared extensions the harness exits early without TEMP writes", async (t) => {
  const root = makeNeutralRoot(t);
  const summary = await runHarness({
    root,
    staticOnly: true,
    log: () => {},
  });
  assert.equal(summary.ok, true);
  assert.deepEqual(summary.checks, [{ name: "discover declared extensions", ok: true }]);
  assert.match(summary.skipped[0].reason, /no manifest extensions/);
  assert.equal(summary.runDirectory, null);
  assert.equal(
    existsSync(join(root, "TEMP")),
    false,
    "the early exit must not create a TEMP run directory",
  );
});

test("the CLI runs against an explicit root and emits pure JSON", (t) => {
  const root = makeNeutralRoot(t);
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, "scripts", "check-custom-components.mjs"),
      "--root",
      root,
      "--static-only",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.runDirectory, null);
  assert.deepEqual(summary.browserFixtures, []);
  assert.equal(summary.skipped[0].name, "custom-component verification");
});

test("dist is required only when the published payload is dist-based", () => {
  const readPkg = (relative) =>
    JSON.parse(readFileSync(join(repoRoot, relative, "package.json"), "utf8"));
  // Source-shipping tooling has no build step; design systems and core do.
  assert.equal(packageRequiresDist(readPkg("packages/tools")), false);
  assert.equal(packageRequiresDist(readPkg("packages/core")), true);
  assert.equal(packageRequiresDist(readPkg("packages/system-b")), true);
  assert.equal(
    packageRequiresDist({ files: ["bin", "src"], exports: { ".": "./src/index.mjs" } }),
    false,
  );
  assert.equal(
    packageRequiresDist({ exports: { ".": { import: "./dist/index.js" } } }),
    true,
  );
  assert.equal(packageRequiresDist({ files: ["dist"] }), true);
  assert.equal(packageRequiresDist({}), false);
});

test("a failed pack fails closed and cleans its run directory", async (t) => {
  const { root } = makeDiscoveryRoot(t);
  const summary = await runHarness({ root, log: () => {} });
  assert.equal(summary.ok, false);
  const packCheck = summary.checks.find(
    (check) => check.name === "pack and extract workspace artifacts",
  );
  assert.equal(packCheck.ok, false);
  assert.match(packCheck.detail, /missing dist\/; build the package before packing/);
  assert.equal(summary.runDirectory, null);
  assert.equal(existsSync(join(root, "TEMP", "lifecycle")), true);
  const { readdirSync } = await import("node:fs");
  assert.deepEqual(
    readdirSync(join(root, "TEMP", "lifecycle")),
    [],
    "failed runs must clean their run directory",
  );
});

test("--keep preserves a failed run directory for inspection", async (t) => {
  const { root } = makeDiscoveryRoot(t);
  const summary = await runHarness({ root, keep: true, log: () => {} });
  assert.equal(summary.ok, false);
  assert.ok(summary.runDirectory && existsSync(summary.runDirectory));
  rmSync(summary.runDirectory, { recursive: true, force: true });
});

test("the static server serves contained files and rejects traversal", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "prism-custom-serve-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeText(join(dir, "index.html"), "<html>custom-probe</html>\n");
  const { server, url } = await startStaticServer(dir);
  t.after(() => server.close());
  const ok = await fetch(url);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /custom-probe/);
  const escaped = await fetch(`${url}%2e%2e/outside.txt`);
  assert.equal(escaped.status, 404);
});
