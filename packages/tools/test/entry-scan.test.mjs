/**
 * Focused tests for offline entry prerequisite selection, the bounded literal
 * import scan, peer override parsing/planning, and installed-version checks.
 *
 * All fixtures are disposable temp consumers; nothing is installed, executed,
 * or fetched.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  collectEntryPrerequisites,
  parsePeerOverrides,
  planEntryAndPeers,
  resolveEntrySelection,
  scanLiteralModuleSpecifiers,
  verifyPeerInstallations,
} from "../src/entry-scan.mjs";
import { collectManifestFailures } from "../src/manifest.mjs";
import { buildComponentCatalog } from "../src/components.mjs";
import { buildInfoResult } from "../src/registry.mjs";
import {
  compareExactSemver,
  isExactSemver,
  isValidSemverRange,
  parseExactSemver,
  parsePartialVersion,
  satisfiesSemverRange,
} from "../src/semver.mjs";
import { addSyntheticExtension, syntheticManifest } from "./manifest-fixture.mjs";

/* -------------------------------------------------------------------------- */
/* Temp consumers                                                             */
/* -------------------------------------------------------------------------- */

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function createRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "prism-entry-scan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeJson(join(root, "package.json"), { name: "consumer-app", version: "0.0.0", private: true });
  return root;
}

/** Install one package fixture with an exact version. */
function writePackage(root, packageName, version, extra = {}) {
  const dir = join(root, "node_modules", ...packageName.split("/"));
  writeJson(join(dir, "package.json"), { name: packageName, version, ...extra });
  return dir;
}

function sceneManifest() {
  const manifest = syntheticManifest({ id: "scene", version: "2.0.0" });
  addSyntheticExtension(manifest, {
    requirements: [
      { name: "three", kind: "peer", range: "^0.186.0", optional: true },
      { name: "@react-three/fiber", kind: "peer", range: "8.18.0", optional: true },
    ],
    effects: { features: ["depth", "3d"], rendering: "webgl", reducedMotion: true },
  });
  return manifest;
}

/** Write the installed package (package.json + manifest + artifacts). */
function writeInstalledDesignSystem(
  root,
  manifest,
  { artifacts = {}, exportTargets = {} } = {},
) {
  const dir = join(root, "node_modules", ...manifest.package.split("/"));
  const exportsMap = { "./manifest": "./design-system.json" };
  for (const key of Object.keys(manifest.entrypoints)) {
    if (key === ".") exportsMap["."] = "./dist/index.mjs";
    else if (key === "./tokens") exportsMap["./tokens"] = "./dist/tokens/index.mjs";
    else exportsMap[key] = exportTargets[key] ?? manifest.exports[key];
  }
  writeJson(join(dir, "package.json"), {
    name: manifest.package,
    version: manifest.version,
    exports: exportsMap,
  });
  writeJson(join(dir, "design-system.json"), manifest);
  writeJson(join(dir, "dist", "index.mjs"), "export {};\n");
  writeJson(join(dir, "dist", "tokens", "index.mjs"), "export {};\n");
  for (const [key, content] of Object.entries(artifacts)) {
    writeFile(join(dir, exportsMap[key].replace(/^\.\//, "")), content);
  }
  return dir;
}

/* -------------------------------------------------------------------------- */
/* Literal scan                                                               */
/* -------------------------------------------------------------------------- */

test("the literal scan reads string imports, dynamic imports, and requires only", () => {
  const source = [
    'import { Canvas } from "@react-three/fiber";',
    'import "three";',
    'const lazy = import("./lazy-module");',
    'const legacy = require("legacy-pkg");',
    "const computed = import(moduleName);",
    "const called = require(getName());",
    "const template = import(`./${name}.ts`);",
    "",
  ].join("\n");
  const result = scanLiteralModuleSpecifiers(source, "entry.tsx");
  assert.deepEqual(result.specifiers.sort(), [
    "./lazy-module",
    "@react-three/fiber",
    "legacy-pkg",
    "three",
  ]);
  assert.equal(result.unscannable.length, 3);
  assert.ok(result.unscannable.every((entry) => /import\(|require\(/.test(entry)));
});

/* -------------------------------------------------------------------------- */
/* Peer override parsing                                                      */
/* -------------------------------------------------------------------------- */

test("peer specs accept plain and scoped names with exact versions", () => {
  assert.deepEqual(parsePeerOverrides(["three@0.186.1", "@react-three/fiber@8.18.0"]), [
    { name: "three", version: "0.186.1" },
    { name: "@react-three/fiber", version: "8.18.0" },
  ]);
  assert.deepEqual(parsePeerOverrides(undefined), []);
});

test("peer specs reject ranges, tags, injection, and duplicates", () => {
  for (const bad of [
    "three",
    "three@",
    "@react-three/fiber",
    "three@^0.186.0",
    "three@latest",
    "three@0.186",
    "three@0.186.1; rm -rf /",
    "../three@1.0.0",
    "three@1.0.0 --save-dev",
    "   ",
  ]) {
    assert.throws(
      () => parsePeerOverrides([bad]),
      /Invalid --peer|--peer requires/,
      `must reject ${JSON.stringify(bad)}`,
    );
  }
  assert.throws(() => parsePeerOverrides(["three@1.0.0", "three@1.0.1"]), /Duplicate --peer/);
});

test("ordinary parse shapes are unchanged", () => {
  assert.deepEqual(parseExactSemver("1.2.3-rc.1+build.5"), {
    raw: "1.2.3-rc.1+build.5",
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: ["rc", "1"],
    build: ["build", "5"],
  });
  assert.deepEqual(parsePartialVersion("1.2"), {
    major: 1,
    minor: 2,
    patch: null,
    prerelease: [],
  });
  assert.deepEqual(parsePartialVersion("1.x"), {
    major: 1,
    minor: null,
    patch: null,
    prerelease: [],
  });
  assert.equal(isExactSemver("1.2.3"), true);
  assert.equal(isValidSemverRange("^1.2.3"), true);
  assert.equal(satisfiesSemverRange("1.5.0", "^1.2.0 || ^2.0.0"), true);
});

test("large numeric identifiers compare losslessly for versions, ranges, and overrides", (t) => {
  const SAFE_MAX = "9007199254740991"; // Number.MAX_SAFE_INTEGER
  const ABOVE_SAFE = "9007199254740992"; // MAX_SAFE + 1
  const HUGE = "9007199254740993"; // MAX_SAFE + 2

  // Syntactic acceptance is restored for every schema-valid digit run.
  assert.equal(isExactSemver(`${HUGE}.0.0`), true);
  assert.equal(isExactSemver(`1.2.3-${HUGE}`), true);
  assert.equal(isValidSemverRange(`>=${HUGE}.0.0`), true);
  assert.equal(isValidSemverRange(`>=1.2.3-${HUGE}`), true);
  assert.equal(isValidSemverRange(`${HUGE}.0.0`), true);

  // Public shape: ordinary components stay Numbers, huge ones become canonical
  // decimal strings (no BigInt leaks into results).
  const parsed = parseExactSemver(`${HUGE}.10.7`);
  assert.equal(parsed.major, HUGE);
  assert.equal(typeof parsed.major, "string");
  assert.equal(parsed.minor, 10);
  assert.equal(parsed.patch, 7);
  assert.doesNotThrow(() => JSON.stringify(parsed));
  assert.equal(JSON.stringify(parsed).includes("BigInt"), false);

  // Adjacent huge identifiers are never treated as equivalent.
  assert.equal(compareExactSemver(`${HUGE}.0.0`, `${ABOVE_SAFE}.0.0`), 1);
  assert.equal(compareExactSemver(`${ABOVE_SAFE}.0.0`, `${HUGE}.0.0`), -1);
  assert.equal(satisfiesSemverRange(`${HUGE}.0.0`, `>${ABOVE_SAFE}.0.0`), true);
  assert.equal(satisfiesSemverRange(`${HUGE}.0.0`, `<=${ABOVE_SAFE}.0.0`), false);
  assert.equal(satisfiesSemverRange(`1.2.3-${HUGE}`, `>1.2.3-${ABOVE_SAFE}`), true);
  assert.equal(satisfiesSemverRange(`1.2.3-${HUGE}`, `1.2.3-${HUGE}`), true);
  assert.equal(satisfiesSemverRange(`1.2.3-${HUGE}`, `1.2.3-${ABOVE_SAFE}`), false);

  // Range successors beyond the safe integer are exact, not rejected/rounded.
  assert.equal(satisfiesSemverRange(`${SAFE_MAX}.5.0`, `^${SAFE_MAX}.0.0`), true);
  assert.equal(satisfiesSemverRange(`${ABOVE_SAFE}.0.0`, `^${SAFE_MAX}.0.0`), false);
  assert.equal(satisfiesSemverRange(`${SAFE_MAX}.2.9`, `~${SAFE_MAX}.2.0`), true);
  assert.equal(satisfiesSemverRange(`${SAFE_MAX}.3.0`, `~${SAFE_MAX}.2.0`), false);
  assert.equal(satisfiesSemverRange(`${HUGE}.9.9`, `${HUGE}.x`), true);
  assert.equal(satisfiesSemverRange(`${ABOVE_SAFE}.0.0`, `${HUGE}.x`), false);
  assert.equal(
    satisfiesSemverRange(`9007199254740994.0.0`, `${ABOVE_SAFE}.0.0 - ${HUGE}.0.0`),
    false,
  );
  assert.equal(
    satisfiesSemverRange(`${HUGE}.0.0`, `${ABOVE_SAFE}.0.0 - ${HUGE}.0.0`),
    true,
  );
  assert.equal(satisfiesSemverRange(`${HUGE}.1.0`, `<=${HUGE}`), true);
  assert.equal(satisfiesSemverRange(`9007199254740994.0.0`, `<=${HUGE}`), false);
  assert.equal(satisfiesSemverRange(`${ABOVE_SAFE}.0.0`, `>${SAFE_MAX}`), true);

  // Exact overrides accept large exact versions and still match the range.
  assert.deepEqual(parsePeerOverrides([`three@${HUGE}.0.0`]), [
    { name: "three", version: `${HUGE}.0.0` },
  ]);
  const root = createRoot(t);
  const manifest = syntheticManifest({ id: "custom", version: "1.0.0" });
  addSyntheticExtension(manifest, {
    name: "Reveal",
    entrypoint: "./custom/reveal",
    target: "./dist/custom/reveal.mjs",
    requirements: [
      {
        name: "three",
        kind: "peer",
        range: `>=${ABOVE_SAFE}.0.0 <9007199254740994.0.0`,
        optional: true,
      },
    ],
  });
  assert.deepEqual(collectManifestFailures(manifest), []);

  const accepted = planEntryAndPeers({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entries: ["Reveal"],
    peerSpecs: [`three@${HUGE}.0.0`],
  });
  assert.equal(accepted.peers[0].action, "install");
  assert.equal(accepted.peers[0].version, `${HUGE}.0.0`);
  assert.equal(typeof accepted.peers[0].version, "string");
  assert.doesNotThrow(() => JSON.stringify(accepted));
  assert.equal(JSON.stringify(accepted).includes("BigInt"), false);

  // The adjacent out-of-range values still fail the same matching.
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: manifest.package,
        manifest,
        entries: ["Reveal"],
        peerSpecs: ["three@9007199254740994.0.0"],
      }),
    /does not satisfy the declared range/,
  );
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: manifest.package,
        manifest,
        entries: ["Reveal"],
        peerSpecs: [`three@${SAFE_MAX}.0.0`],
      }),
    /does not satisfy the declared range/,
  );
});

test("a huge package version is valid metadata and JSON-safe across tools results", () => {
  const HUGE = "9007199254740993.0.0";
  const manifest = syntheticManifest({ version: HUGE });
  assert.deepEqual(collectManifestFailures(manifest), []);

  const info = buildInfoResult({ package: manifest.package, version: manifest.version, manifest });
  assert.equal(info.version, HUGE);
  assert.doesNotThrow(() => JSON.stringify(info));
  assert.equal(JSON.stringify(info).includes("BigInt"), false);

  const catalog = buildComponentCatalog({ manifest });
  assert.equal(catalog.counts.required, 29);
  assert.doesNotThrow(() => JSON.stringify(catalog));
  for (const component of catalog.components.slice(0, 3)) {
    assert.equal(component.entrypoint, ".");
  }
});

/* -------------------------------------------------------------------------- */
/* Entry selection                                                            */
/* -------------------------------------------------------------------------- */

test("extensions, entrypoints, and defaults select declared requirements", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);

  const extension = resolveEntrySelection({ consumerRoot: root, manifest, entries: ["KeyboardScene"] });
  assert.equal(extension.entries[0].kind, "extension");
  assert.equal(extension.entries[0].entrypoint, "./keyboard-scene");
  assert.deepEqual(
    extension.requirements.map((requirement) => requirement.name),
    ["three", "@react-three/fiber"],
  );

  const entrypoint = resolveEntrySelection({
    consumerRoot: root,
    manifest,
    entries: ["./keyboard-scene"],
  });
  assert.equal(entrypoint.entries[0].kind, "entrypoint");
  assert.deepEqual(entrypoint.requirements, extension.requirements);

  const defaults = resolveEntrySelection({ consumerRoot: root, manifest, entries: [] });
  assert.deepEqual(
    defaults.entries.map((entry) => entry.entrypoint),
    [".", "./tokens"],
  );
  assert.deepEqual(defaults.requirements, []);
});

test("a consumer path is contained, scanned literally, and selects referenced entries", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);
  writeFile(
    join(root, "src", "scene.tsx"),
    [
      `import { KeyboardScene } from "${manifest.package}/keyboard-scene";`,
      'import "three";',
      "const other = import(computedName);",
      "",
    ].join("\n"),
  );

  const selection = resolveEntrySelection({
    consumerRoot: root,
    manifest,
    entries: ["src/scene.tsx"],
  });
  assert.equal(selection.entries[0].kind, "path");
  assert.equal(selection.entries[0].extension, "KeyboardScene");
  assert.deepEqual(selection.entries[0].selectedEntrypoints, ["./keyboard-scene"]);
  assert.deepEqual(selection.entries[0].selectedExtensions, ["KeyboardScene"]);
  assert.equal(selection.entries[0].unscannable.length, 1);
  assert.deepEqual(
    selection.requirements.map((requirement) => requirement.name),
    ["three", "@react-three/fiber"],
  );
});

test("unrelated peer imports and undeclared nested specifiers select nothing", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);
  writeFile(
    join(root, "src", "loose.ts"),
    [
      'import "three";',
      `import "${manifest.package}/keyboard-scene/extra";`,
      `import "${manifest.package}/custom/missing";`,
      "",
    ].join("\n"),
  );

  const selection = resolveEntrySelection({
    consumerRoot: root,
    manifest,
    entries: ["src/loose.ts"],
  });
  assert.deepEqual(selection.entries[0].selectedEntrypoints, []);
  assert.deepEqual(selection.entries[0].selectedExtensions, []);
  assert.deepEqual(selection.requirements, []);

  const result = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entry: "src/loose.ts",
  });
  assert.equal(result.ok, true, result.failures.join(" "));
  assert.deepEqual(result.report.requirements, []);
  assert.deepEqual(result.report.selectedEntrypoints, []);
});

test("an undeclared code export is not a selectable entry", (t) => {
  const manifest = sceneManifest();
  manifest.exports["./custom/motion"] = "./dist/custom/motion.mjs";
  const root = createRoot(t);
  writeFile(join(root, "src", "motion.ts"), `import "${manifest.package}/custom/motion";\n`);

  const selection = resolveEntrySelection({
    consumerRoot: root,
    manifest,
    entries: ["src/motion.ts"],
  });
  assert.deepEqual(selection.entries[0].selectedEntrypoints, []);
  assert.deepEqual(selection.entries[0].selectedExtensions, []);
  assert.deepEqual(selection.requirements, []);
});

test("root and non-extension declared entrypoints are selected by exact specifier", (t) => {
  const manifest = syntheticManifest({ id: "custom", version: "1.0.0" });
  manifest.entrypoints["."] = {
    requirements: [{ name: "react", kind: "peer", range: "^18.0.0", optional: false }],
  };
  manifest.entrypoints["./motion"] = {
    requirements: [{ name: "motion", kind: "peer", range: "^12.0.0", optional: true }],
  };
  manifest.exports["./motion"] = "./dist/motion.mjs";
  manifest.publicApi["./motion"] = [];
  const root = createRoot(t);
  writeFile(
    join(root, "src", "root.tsx"),
    `import { Button } from "${manifest.package}";\nimport "${manifest.package}/motion";\n`,
  );

  const selection = resolveEntrySelection({
    consumerRoot: root,
    manifest,
    entries: ["src/root.tsx"],
  });
  assert.deepEqual(selection.entries[0].selectedEntrypoints, [".", "./motion"]);
  assert.deepEqual(
    selection.requirements.map((requirement) => requirement.name),
    ["react", "motion"],
  );

  const result = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entry: "src/root.tsx",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.report.selectedEntrypoints, [".", "./motion"]);
  assert.deepEqual(
    result.report.requirements.map((requirement) => [requirement.name, requirement.status]),
    [
      ["react", "missing"],
      ["motion", "missing"],
    ],
  );
  assert.match(result.failures.join(" "), /"react".*not installed/);
  assert.match(result.failures.join(" "), /"motion".*not installed/);
});

test("multiple exports sharing one entrypoint select that entry once", (t) => {
  const manifest = syntheticManifest({ id: "custom", version: "1.0.0" });
  addSyntheticExtension(manifest, {
    name: "Alpha",
    entrypoint: "./custom/shared",
    target: "./dist/custom/shared.mjs",
    requirements: [{ name: "three", kind: "peer", range: "^0.186.0", optional: true }],
  });
  manifest.extensions.Beta = {
    apiVersion: 1,
    entrypoint: "./custom/shared",
    description: "Second export on the shared entrypoint",
    docs: "./docs/beta.md",
    example: "<Beta />",
  };
  manifest.publicApi["./custom/shared"] = ["Alpha", "Beta"];
  const root = createRoot(t);
  writeFile(
    join(root, "src", "shared.tsx"),
    `import { Alpha, Beta } from "${manifest.package}/custom/shared";\n`,
  );

  const selection = resolveEntrySelection({
    consumerRoot: root,
    manifest,
    entries: ["src/shared.tsx"],
  });
  assert.deepEqual(selection.entries[0].selectedEntrypoints, ["./custom/shared"]);
  assert.deepEqual(selection.entries[0].selectedExtensions, ["Alpha", "Beta"]);
  assert.deepEqual(
    selection.requirements.map((requirement) => requirement.name),
    ["three"],
  );
});

test("path escapes fail closed with no symlink or traversal exception", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);
  writeFile(join(dirname(root), "outside.ts"), 'import "three";\n');

  for (const entry of ["../outside.ts", join(dirname(root), "outside.ts")]) {
    assert.throws(
      () => resolveEntrySelection({ consumerRoot: root, manifest, entries: [entry] }),
      /escapes/,
      `must reject ${entry}`,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Prerequisite report                                                        */
/* -------------------------------------------------------------------------- */

test("explicit extension selection requires every declared peer, imported or not", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);
  writeInstalledDesignSystem(root, manifest, {
    artifacts: {
      "./keyboard-scene": [
        'import * as THREE from "three";',
        'import { Canvas } from "@react-three/fiber";',
        "",
      ].join("\n"),
    },
  });
  writePackage(root, "three", "0.186.1");
  writePackage(root, "@react-three/fiber", "8.17.0");

  const result = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entry: "KeyboardScene",
  });
  assert.equal(result.ok, false);
  const byName = Object.fromEntries(
    result.report.requirements.map((requirement) => [requirement.name, requirement]),
  );
  assert.equal(byName.three.status, "satisfied");
  assert.equal(byName.three.used, true);
  assert.equal(byName.three.imported, true);
  assert.equal(byName["@react-three/fiber"].status, "out-of-range");
  assert.match(result.failures.join(" "), /@react-three\/fiber/);

  // A selected requirement is still required when the artifact reaches the
  // engine only indirectly (for example through a re-exported bundled chunk):
  // the literal scan reports imported: false, but the prerequisite never
  // downgrades to optional.
  const indirectRoot = createRoot(t);
  const indirect = sceneManifest();
  writeInstalledDesignSystem(indirectRoot, indirect, {
    artifacts: {
      "./keyboard-scene": 'export { KeyboardScene } from "./KeyboardScene.impl.mjs";\n',
    },
  });
  const indirectResult = collectEntryPrerequisites({
    consumerRoot: indirectRoot,
    packageName: indirect.package,
    manifest: indirect,
    entry: "KeyboardScene",
  });
  assert.equal(indirectResult.ok, false);
  const indirectByName = Object.fromEntries(
    indirectResult.report.requirements.map((requirement) => [requirement.name, requirement]),
  );
  assert.equal(indirectByName.three.imported, false);
  assert.equal(indirectByName.three.used, true);
  assert.equal(indirectByName.three.status, "missing");
  assert.match(indirectResult.failures.join(" "), /"three".*not installed/);
});

test("missing used peers and broken entry artifacts fail closed", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);
  writeInstalledDesignSystem(root, manifest, {
    artifacts: { "./keyboard-scene": 'import "three";\n' },
  });
  const missing = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entry: "KeyboardScene",
  });
  assert.equal(missing.ok, false);
  assert.match(missing.failures.join(" "), /"three".*not installed/);

  // Manifest/package export mismatch fails closed.
  const mismatched = sceneManifest();
  writeInstalledDesignSystem(root, mismatched, {
    exportTargets: { "./keyboard-scene": "./dist/other.mjs" },
  });
  const broken = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: mismatched.package,
    manifest: mismatched,
    entry: "KeyboardScene",
  });
  assert.equal(broken.ok, false);
  assert.match(broken.failures.join(" "), /must expose/);

  // Unknown entry values are treated as contained consumer paths and fail.
  const unknown = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entry: "does-not-exist.tsx",
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.failures.join(" "), /does not exist/);
});

/* -------------------------------------------------------------------------- */
/* Peer planning                                                              */
/* -------------------------------------------------------------------------- */

test("peer planning retains installed satisfying versions and requires overrides for missing ranges", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);
  writePackage(root, "three", "0.186.1");

  const retained = planEntryAndPeers({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entries: ["KeyboardScene"],
    peerSpecs: [],
  });
  assert.deepEqual(
    retained.peers.map((peer) => [peer.name, peer.action, peer.version, peer.source]),
    [
      ["three", "retain", "0.186.1", "installed"],
      ["@react-three/fiber", "install", "8.18.0", "exact-range"],
    ],
  );

  // The missing non-exact peer needs an explicit exact override.
  const noFiber = sceneManifest();
  noFiber.entrypoints["./keyboard-scene"].requirements = [
    { name: "@react-three/fiber", kind: "peer", range: "^8.18.0", optional: true },
  ];
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: noFiber.package,
        manifest: noFiber,
        entries: ["KeyboardScene"],
        peerSpecs: [],
      }),
    /pass --peer @react-three\/fiber@<exact-version>/,
  );

  const overridden = planEntryAndPeers({
    consumerRoot: root,
    packageName: noFiber.package,
    manifest: noFiber,
    entries: ["KeyboardScene"],
    peerSpecs: ["@react-three/fiber@8.18.0"],
  });
  assert.equal(overridden.peers[0].action, "install");
  assert.equal(overridden.peers[0].source, "override");
  assert.equal(overridden.peers[0].version, "8.18.0");
});

test("peer planning rejects undeclared and out-of-range overrides", (t) => {
  const manifest = sceneManifest();
  const root = createRoot(t);
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: manifest.package,
        manifest,
        entries: ["KeyboardScene"],
        peerSpecs: ["react@18.3.1"],
      }),
    /not a declared requirement/,
  );
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: manifest.package,
        manifest,
        entries: ["KeyboardScene"],
        peerSpecs: ["three@0.170.0"],
      }),
    /does not satisfy the declared range/,
  );

  const withDependency = sceneManifest();
  withDependency.entrypoints["./keyboard-scene"].requirements = [
    { name: "react", kind: "dependency", range: "^18.0.0", optional: false },
  ];
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: withDependency.package,
        manifest: withDependency,
        entries: ["KeyboardScene"],
        peerSpecs: ["react@18.3.1"],
      }),
    /only overrides declared peer requirements/,
  );
});

test("post-install peer verification reports missing and wrong versions", (t) => {
  const root = createRoot(t);
  writePackage(root, "three", "0.185.0");
  const failures = verifyPeerInstallations({
    consumerRoot: root,
    peers: [
      { name: "three", action: "install", version: "0.186.1" },
      { name: "@react-three/fiber", action: "install", version: "8.18.0" },
      { name: "react", action: "retain", version: "18.3.1" },
    ],
  });
  assert.equal(failures.length, 2);
  assert.match(failures.join(" "), /three@0\.186\.1/);
  assert.match(failures.join(" "), /@react-three\/fiber@8\.18\.0/);
});

test("nested entrypoints select and scan with their full subpath", (t) => {
  const manifest = syntheticManifest({ id: "custom", version: "1.0.0" });
  addSyntheticExtension(manifest, {
    name: "Reveal",
    entrypoint: "./custom/reveal",
    target: "./dist/custom/reveal/index.mjs",
    requirements: [{ name: "three", kind: "peer", range: "^0.186.0", optional: true }],
    effects: { features: ["depth", "motion"], rendering: "dom", reducedMotion: true },
  });
  const root = createRoot(t);
  writeInstalledDesignSystem(root, manifest, {
    artifacts: { "./custom/reveal": 'import "three";\n' },
  });
  writePackage(root, "three", "0.186.1");

  const report = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entry: "Reveal",
  });
  assert.equal(report.ok, true, report.failures.join(" "));
  assert.equal(report.report.entrypoint, "./custom/reveal");
  assert.ok(report.report.file.endsWith(join("custom", "reveal", "index.mjs")));
  assert.equal(report.report.requirements[0].status, "satisfied");

  writeFile(
    join(root, "src", "reveal.tsx"),
    `import { Reveal } from "${manifest.package}/custom/reveal";\n`,
  );
  const selection = resolveEntrySelection({
    consumerRoot: root,
    manifest,
    entries: ["src/reveal.tsx"],
  });
  assert.equal(selection.entries[0].extension, "Reveal");
  assert.equal(selection.entries[0].entrypoint, "./custom/reveal");
  assert.deepEqual(
    selection.requirements.map((requirement) => requirement.name),
    ["three"],
  );
});

test("non-semver peer ranges fail closed while dependency ranges stay informational", (t) => {
  const manifest = syntheticManifest({ id: "custom", version: "1.0.0" });
  addSyntheticExtension(manifest, {
    name: "Reveal",
    entrypoint: "./custom/reveal",
    target: "./dist/custom/reveal/index.mjs",
    requirements: [
      { name: "@prism-system/ui-core", kind: "dependency", range: "workspace:*", optional: false },
      { name: "three", kind: "peer", range: "workspace:*", optional: true },
    ],
  });
  const root = createRoot(t);
  writeInstalledDesignSystem(root, manifest, {
    artifacts: {
      "./custom/reveal": 'import "@prism-system/ui-core";\nimport "three";\n',
    },
  });

  const result = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: manifest.package,
    manifest,
    entry: "Reveal",
  });
  assert.equal(result.ok, false);
  const byName = Object.fromEntries(
    result.report.requirements.map((requirement) => [requirement.name, requirement]),
  );
  assert.equal(byName["@prism-system/ui-core"].status, "unchecked-range");
  assert.equal(byName.three.status, "unevaluable-range");
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /three.*non-semver range/);

  // A dependency-only workspace range is truthful manifest data and never fails.
  const dependenciesOnly = syntheticManifest({ id: "custom", version: "1.0.0" });
  addSyntheticExtension(dependenciesOnly, {
    name: "Reveal",
    entrypoint: "./custom/reveal",
    target: "./dist/custom/reveal/index.mjs",
    requirements: [
      { name: "@prism-system/ui-core", kind: "dependency", range: "workspace:*", optional: false },
    ],
  });
  writeInstalledDesignSystem(root, dependenciesOnly, {
    artifacts: { "./custom/reveal": 'import "@prism-system/ui-core";\n' },
  });
  const dependencyResult = collectEntryPrerequisites({
    consumerRoot: root,
    packageName: dependenciesOnly.package,
    manifest: dependenciesOnly,
    entry: "Reveal",
  });
  assert.equal(dependencyResult.ok, true, dependencyResult.failures.join(" "));
  assert.equal(dependencyResult.report.requirements[0].status, "unchecked-range");

  // Peer planning can never validate a non-semver peer range: fail closed.
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: manifest.package,
        manifest,
        entries: ["Reveal"],
        peerSpecs: ["three@0.186.1"],
      }),
    /non-semver range/,
  );
  assert.throws(
    () =>
      planEntryAndPeers({
        consumerRoot: root,
        packageName: manifest.package,
        manifest,
        entries: ["Reveal"],
        peerSpecs: [],
      }),
    /non-semver range/,
  );
});
