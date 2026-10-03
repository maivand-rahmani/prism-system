#!/usr/bin/env node
/**
 * Phase B custom-component verification harness (maintainer tooling).
 *
 * Discovers the extensions actually declared in the registered shipped
 * manifests, packs the real workspace artifacts (`ui-core`, each system with
 * extensions, and `@prism-system/tools`) into one unique contained
 * `TEMP/lifecycle/custom-<uuid>/` run directory, and verifies the custom
 * surface end to end:
 *
 *   1. static tarball checks (no package execution): declared entrypoints exist
 *      in `package.json` exports, export targets exist and stay contained, the
 *      built JS/DTS artifacts statically name the extension export, extension
 *      docs/examples are real packaged files, `publicApi` lists the extension,
 *      and the root/tokens artifacts never reference scene-only peers, custom
 *      entrypoint subpaths, or extension names;
 *   2. client/server boundary: root ESM/CJS artifacts open with a top-level
 *      `"use client"` directive while `./tokens` artifacts stay server-safe;
 *   3. isolated consumer rows (the two user-approved candidates):
 *      React 18.3.1 + Fiber 8.18.0 and React 19.3.0 + Fiber 9.8.1, both with
 *      Three 0.186.1 and matching `@types` majors. Each row installs only the
 *      packed tarballs plus the explicit peers of the selected entries into a
 *      fresh TEMP consumer with fixed `npm install --ignore-scripts` argv
 *      (never a repository install);
 *   4. runtime/SSR probes: actual root, `./tokens`, and selected extension
 *      imports in Node (no top-level browser API). An approved DOM extension is
 *      server-rendered with `renderToString` and its real props; a WebGL
 *      extension is server-imported only because there is no SSR markup claim
 *      to make. `tsc` type checks the custom public entry with typed real props
 *      and JSX elements (never import existence alone), and a root-only consumer
 *      with no graphics peers proves the root/tokens/DOM extension stay usable
 *      and the scene peers are genuinely absent (`require.resolve` fails);
 *   5. packed `prism-ds` CLI checks in the same consumers: catalog metadata
 *      (names/imports/effects/requirements/apiVersion), default and root
 *      `check`/`doctor` pass without scene peers, `--entry` fails closed on a
 *      missing selected peer, and the offline `--with-entry`/`--peer` planning
 *      helpers from the packed tools artifact validate overrides against the
 *      declared ranges without writing to the consumer. Registry `info` and
 *      `upgrade` diffs are network commands and stay in the parent/Phase C
 *      flow; this harness exercises the strict manifest reader and the
 *      entry/peer planner they share on the exact packed artifact instead;
 *   6. minimal browser consumer fixtures for both React rows (HTML + JSX),
 *      bundled with the workspace's existing esbuild when available. The two
 *      approved System B pilot scenarios (KeyboardScene, InteractiveWorkflowMap)
 *      are mounted with their real public props, controlled React state, and
 *      QA-only readouts; every other extension keeps the generic import
 *      boundary and is reported as unwired instead of being rendered with
 *      guessed props. `--keep` preserves the run directory and the JSON summary
 *      lists each built browser fixture directory for the parent to serve with
 *      the exported `startStaticServer` (without rerunning the matrix);
 *      `--serve` starts local static servers and waits for QA; the default run
 *      never waits.
 *
 * Safety and scope:
 *   - Every artifact, consumer, and log lives under one fresh unique
 *     `TEMP/lifecycle/custom-<uuid>/` directory; a collision fails closed.
 *   - No repository file is written; no package is built, versioned, published,
 *     or committed. `--static-only` skips the network consumer matrix.
 *   - The packed tools artifact is always the workspace package (never a stale
 *     user-level `@prism-system/tools` install).
 *   - Commands use fixed argv built from validated manifest values only.
 *
 * CLI: node scripts/check-custom-components.mjs [options]
 */

import { strict as nodeAssert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readJsonFile, readManifest, repoRoot } from "./register-design-system.mjs";
import { parseManifest } from "./design-system-manifest.mjs";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** The root public entrypoint key. */
export const ROOT_ENTRYPOINT = ".";
/** The server-safe token entrypoint key. */
export const TOKENS_ENTRYPOINT = "./tokens";

/**
 * The two user-approved consumer rows. Every entry is an exact
 * research-snapshot pin; ranges and floating major tags are never used to prove
 * compatibility. `typesReact` and `typesReactDom` follow the React major of
 * their row.
 */
export const CONSUMER_MATRIX = Object.freeze([
  Object.freeze({
    id: "react18-fiber8",
    react: "18.3.1",
    reactDom: "18.3.1",
    fiber: "8.18.0",
    three: "0.186.1",
    typesReact: "18.3.24",
    typesReactDom: "18.3.7",
    typesThree: "0.186.0",
    typescript: "5.9.3",
  }),
  Object.freeze({
    id: "react19-fiber9",
    react: "19.3.0",
    reactDom: "19.3.0",
    fiber: "9.8.1",
    three: "0.186.1",
    typesReact: "19.3.0",
    typesReactDom: "19.2.3",
    typesThree: "0.186.0",
    typescript: "5.9.3",
  }),
]);

const EXTENSION_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const CLIENT_DIRECTIVE_PATTERN = /^["']use client["'];?$/;
const GRAPHICS_PEER_PATTERN = /^(?:three|@react-three\/[^/]+)$/;
/** CSS-safe root class names generated into consumer fixtures. */
const UI_CLASS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPosix(value) {
  return String(value).split(sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function writeJsonFile(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Deterministic recursive sha256 of a directory tree (empty = missing). */
export function hashTree(directory) {
  const hash = createHash("sha256");
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        hash.update(toPosix(relative(directory, full)));
        hash.update(readFileSync(full));
      }
    }
  };
  if (existsSync(directory)) walk(directory);
  return hash.digest("hex");
}

/** Standard Windows argument quoting for fixed, internally generated args. */
export function quoteWindowsArgument(value) {
  const text = String(value);
  if (text === "") return '""';
  if (!/[\s"^&|<>()%!]/.test(text)) return text;
  const escaped = text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

/**
 * Run a fixed command. POSIX spawns directly with `shell: false`; Windows uses
 * a narrowly constrained `cmd.exe /d /s /c` adapter for the npm/pnpm shim. All
 * arguments are internal literals derived from validated manifest values.
 */
export function runCommand(command, args, options = {}) {
  const { cwd, timeout = 0, maxBuffer = 64 * 1024 * 1024 } = options;
  if (process.platform === "win32") {
    const interpreter = process.env.ComSpec ?? "cmd.exe";
    const line = [command, ...args].map(quoteWindowsArgument).join(" ");
    return spawnSync(interpreter, ["/d", "/s", "/c", line], {
      cwd,
      encoding: "utf8",
      timeout,
      maxBuffer,
    });
  }
  return spawnSync(command, args, { cwd, encoding: "utf8", timeout, maxBuffer });
}

export function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 0,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

/* -------------------------------------------------------------------------- */
/* CLI options                                                                */
/* -------------------------------------------------------------------------- */

export const CLI_OPTIONS = Object.freeze([
  "--root <path>    Repository root holding packages/ and config/ (default: repo root).",
  "--static-only    Skip the network consumer matrix; pack + static checks only.",
  "--keep           Keep the TEMP run directory and built browser fixtures; JSON lists them.",
  "--serve          After building browser fixtures, serve them locally and wait for QA.",
  "--json           Emit a stable JSON summary instead of the human log.",
  "-h, --help       Show this help.",
]);

export function helpText() {
  return [
    "Usage: node scripts/check-custom-components.mjs [options]",
    "",
    "Pack and verify the custom extension surface of the registered design",
    "systems. With no declared manifest extensions the harness exits 0 without",
    "packing anything. The full run requires network access for the isolated",
    "consumer rows; --static-only performs only local packing and static checks.",
    "",
    "Options:",
    ...CLI_OPTIONS.map((line) => `  ${line}`),
    "",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    root: undefined,
    staticOnly: false,
    keep: false,
    serve: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--static-only") {
      options.staticOnly = true;
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg === "--serve") {
      options.serve = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      let value;
      if (equals !== -1) value = arg.slice(equals + 1);
      else value = argv[index + 1];
      if (key !== "root") throw new Error(`Unknown option: --${key}`);
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Option --root requires a value.");
      }
      options.root = value;
      if (equals === -1) index += 1;
    } else {
      throw new Error(`Unexpected argument: ${arg}.`);
    }
  }
  return options;
}

/* -------------------------------------------------------------------------- */
/* Discovery                                                                  */
/* -------------------------------------------------------------------------- */

/** `pkg` + `./subpath` -> the public import specifier, e.g. `pkg/subpath`. */
export function entrypointImportPath(packageName, entrypoint) {
  return entrypoint === ROOT_ENTRYPOINT ? packageName : `${packageName}${entrypoint.slice(1)}`;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected a non-empty string for ${label}.`);
  }
  return value.trim();
}

/**
 * Read every registered system's shipped manifest and collect its declared
 * extensions with the resolved public import path and entrypoint requirements.
 * Fails closed on a missing/invalid manifest instead of silently skipping a
 * system, because an unreadable manifest could hide a custom surface.
 */
export function discoverDeclaredExtensions({ root }) {
  const registryPath = join(root, "config", "design-systems.json");
  if (!existsSync(registryPath)) {
    throw new Error(`Missing registry manifest ${registryPath}.`);
  }
  const registry = readManifest({ manifestPath: registryPath });
  const systems = [];
  const extensions = [];
  for (const entry of registry.designSystems) {
    const packageDir = join(root, "packages", entry.id);
    const shippedPath = join(packageDir, "design-system.json");
    if (!existsSync(shippedPath)) {
      throw new Error(
        `Registered system "${entry.id}" is missing shipped manifest ${shippedPath}.`,
      );
    }
    let manifest;
    try {
      manifest = parseManifest(readJsonFile(shippedPath));
    } catch (error) {
      throw new Error(
        `Invalid shipped manifest for "${entry.id}" (${shippedPath}): ${error.message} ` +
          `Upgrade the reader/writer pair in lockstep; there is one current manifest shape.`,
      );
    }
    const packageJsonPath = join(packageDir, "package.json");
    const pkg = readJsonFile(packageJsonPath);
    if (pkg.name !== entry.packageName) {
      throw new Error(
        `Package identity mismatch for "${entry.id}": package.json has ${JSON.stringify(pkg.name)}, ` +
          `registry expects ${JSON.stringify(entry.packageName)}.`,
      );
    }
    const tokensExport = requireNonEmptyString(
      pkg.prismSystem?.tokensExport,
      `prismSystem.tokensExport in ${packageJsonPath}`,
    );
    const declaredExtensions = Object.entries(manifest.extensions ?? {});
    let uiClass = null;
    if (declaredExtensions.length > 0) {
      uiClass = requireNonEmptyString(
        pkg.prismSystem?.uiClass,
        `prismSystem.uiClass in ${packageJsonPath} (required when extensions are declared)`,
      );
      if (!UI_CLASS_PATTERN.test(uiClass)) {
        throw new Error(
          `Invalid prismSystem.uiClass ${JSON.stringify(uiClass)} in ${packageJsonPath}; ` +
            "expected a CSS-safe class name.",
        );
      }
      if (typeof entry.uiClass === "string" && entry.uiClass !== uiClass) {
        throw new Error(
          `uiClass mismatch for "${entry.id}": registry has ${JSON.stringify(entry.uiClass)}, ` +
            `package.json has ${JSON.stringify(uiClass)}.`,
        );
      }
    }
    const system = {
      id: entry.id,
      packageName: entry.packageName,
      packageDir,
      version: manifest.version,
      tokensExport,
      uiClass,
      manifest,
      entrypoints: manifest.entrypoints ?? {},
      extensions: [],
    };
    for (const [name, extension] of declaredExtensions) {
      if (!EXTENSION_NAME_PATTERN.test(name)) {
        throw new Error(`Manifest extension name ${JSON.stringify(name)} is not PascalCase.`);
      }
      const requirements = system.entrypoints[extension.entrypoint]?.requirements ?? [];
      const discovered = Object.freeze({
        systemId: entry.id,
        packageName: entry.packageName,
        version: manifest.version,
        tokensExport,
        name,
        entrypoint: extension.entrypoint,
        importPath: entrypointImportPath(entry.packageName, extension.entrypoint),
        apiVersion: extension.apiVersion,
        effects: extension.effects ?? null,
        description: extension.description,
        docs: extension.docs,
        example: extension.example,
        requirements,
        manifest,
        packageDir,
      });
      system.extensions.push(discovered);
      extensions.push(discovered);
    }
    systems.push(system);
  }
  return { registry, systems, extensions };
}

/** True when an extension declares real WebGL/mixed rendering or graphics peers. */
export function isSceneExtension(extension) {
  const rendering = extension.effects?.rendering;
  if (rendering === "webgl" || rendering === "mixed") return true;
  if (rendering === "dom") return false;
  // Effects are optional: only fall back to the declared peers when rendering
  // is undeclared. An explicit declaration always wins.
  return extension.requirements.some((requirement) => GRAPHICS_PEER_PATTERN.test(requirement.name));
}

/* -------------------------------------------------------------------------- */
/* Static packed-artifact checks (no package execution)                       */
/* -------------------------------------------------------------------------- */

function resolveContainedFilePath(baseDir, relativePath, label, failures) {
  if (typeof relativePath !== "string" || !relativePath.startsWith("./")) {
    failures.push(`${label} must be a package-relative path starting with "./"`);
    return null;
  }
  const resolved = resolve(baseDir, relativePath);
  const rel = relative(baseDir, resolved);
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    failures.push(`${label} escapes the packed package: ${relativePath}`);
    return null;
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    failures.push(`${label} is missing or not a file: ${relativePath}`);
    return null;
  }
  return resolved;
}

/** Collect module specifiers from JS/DTS text (imports, requires, dynamic imports). */
export function moduleSpecifiers(text) {
  const specifiers = [];
  for (const pattern of [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      specifiers.push(match[1]);
      match = pattern.exec(text);
    }
  }
  return specifiers;
}

/** True when a bundle opens with a top-level `"use client"` directive. */
export function startsWithClientDirective(text) {
  for (const line of String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    return CLIENT_DIRECTIVE_PATTERN.test(trimmed);
  }
  return false;
}

function exportTargetPaths(target) {
  if (typeof target === "string") return [target];
  if (!isPlainObject(target)) return [];
  return ["types", "import", "require"]
    .filter((field) => typeof target[field] === "string")
    .map((field) => target[field]);
}

function readContainedTexts(extractedDir, target, label, failures) {
  const texts = [];
  for (const relativePath of exportTargetPaths(target)) {
    const resolved = resolveContainedFilePath(extractedDir, relativePath, label, failures);
    if (resolved) texts.push(readFileSync(resolved, "utf8"));
  }
  return texts;
}

/**
 * Static verification of one packed design-system package's custom surface.
 * Returns a list of human-readable failures; an empty list means the packed
 * tarball satisfies the static custom contracts. Nothing is imported or
 * executed, so this is safe to run from `ds:check-all` and from isolated tests.
 */
export function collectPackedCustomFailures({ label, extractedDir, pkg, manifest }) {
  const failures = [];
  const push = (message) => failures.push(`${label}: ${message}`);
  if (!isPlainObject(pkg) || !isPlainObject(manifest)) {
    push("packed package.json/manifest are missing");
    return failures;
  }
  const entrypoints = isPlainObject(manifest.entrypoints) ? manifest.entrypoints : {};
  const extensions = isPlainObject(manifest.extensions) ? manifest.extensions : {};
  const extensionNames = Object.keys(extensions);
  const publicApi = isPlainObject(manifest.publicApi) ? manifest.publicApi : {};

  for (const key of Object.keys(entrypoints)) {
    if (key === ROOT_ENTRYPOINT || key === TOKENS_ENTRYPOINT) continue;
    if (typeof pkg.exports?.[key] === "undefined") {
      push(
        `manifest entrypoint ${JSON.stringify(key)} is missing from packed package.json exports`,
      );
    }
  }

  for (const [name, extension] of Object.entries(extensions)) {
    const api = publicApi[extension.entrypoint];
    if (!Array.isArray(api) || !api.includes(name)) {
      push(
        `extension ${JSON.stringify(name)} is not listed in publicApi for ${JSON.stringify(extension.entrypoint)}`,
      );
    }
    const target = pkg.exports?.[extension.entrypoint];
    if (!isPlainObject(target) || typeof target.types !== "string") {
      push(`extension ${JSON.stringify(name)} entrypoint must expose a "types" target`);
    }
    const runtimeFields = ["import", "require"].filter(
      (field) => typeof target?.[field] === "string",
    );
    if (runtimeFields.length === 0) {
      push(
        `extension ${JSON.stringify(name)} entrypoint must expose an "import" or "require" target`,
      );
    }
    for (const relativePath of exportTargetPaths(target)) {
      const resolved = resolveContainedFilePath(
        extractedDir,
        relativePath,
        `extension ${JSON.stringify(name)} artifact`,
        failures,
      );
      if (resolved === null) continue;
      const text = readFileSync(resolved, "utf8");
      if (!new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text)) {
        push(
          `extension ${JSON.stringify(name)} artifact ${relativePath} does not statically reference the export`,
        );
      }
    }
    resolveContainedFilePath(
      extractedDir,
      extension.docs,
      `extension ${JSON.stringify(name)} docs`,
      failures,
    );
    resolveContainedFilePath(
      extractedDir,
      extension.example,
      `extension ${JSON.stringify(name)} example`,
      failures,
    );
  }

  // Root isolation: root/tokens artifacts must not pull the optional scene
  // graph or the custom modules into ordinary UI imports.
  if (extensionNames.length > 0) {
    const rootTexts = readContainedTexts(
      extractedDir,
      pkg.exports?.[ROOT_ENTRYPOINT],
      "root entry artifact",
      failures,
    );
    const tokenTexts = readContainedTexts(
      extractedDir,
      pkg.exports?.[TOKENS_ENTRYPOINT],
      "tokens entry artifact",
      failures,
    );
    const rootRequirementNames = new Set(
      [
        ...(entrypoints[ROOT_ENTRYPOINT]?.requirements ?? []),
        ...(entrypoints[TOKENS_ENTRYPOINT]?.requirements ?? []),
      ].map((requirement) => requirement.name),
    );
    const scenePeerNames = new Set();
    for (const extension of Object.values(extensions)) {
      for (const requirement of entrypoints[extension.entrypoint]?.requirements ?? []) {
        if (requirement.kind === "peer" && !rootRequirementNames.has(requirement.name)) {
          scenePeerNames.add(requirement.name);
        }
      }
    }
    for (const [entryLabel, texts] of [
      ["root", rootTexts],
      ["tokens", tokenTexts],
    ]) {
      for (const text of texts) {
        for (const specifier of moduleSpecifiers(text)) {
          if (scenePeerNames.has(specifier) || /^@react-three\/[^/]+$/.test(specifier)) {
            push(
              `${entryLabel} artifact references scene-only module ${JSON.stringify(specifier)}`,
            );
          }
        }
        for (const extension of Object.values(extensions)) {
          const subpath = extension.entrypoint.replace(/^\.\//, "");
          if (text.includes(subpath)) {
            push(`${entryLabel} artifact references custom entrypoint ${extension.entrypoint}`);
          }
        }
      }
    }
    for (const name of extensionNames) {
      if (
        (publicApi[ROOT_ENTRYPOINT] ?? []).includes(name) ||
        (publicApi[TOKENS_ENTRYPOINT] ?? []).includes(name)
      ) {
        push(`extension ${JSON.stringify(name)} leaked into the root/tokens publicApi`);
      }
    }

    // Client/server boundary: root is a client entry, tokens stay server-safe.
    const rootImport = pkg.exports?.[ROOT_ENTRYPOINT]?.import;
    const rootRequire = pkg.exports?.[ROOT_ENTRYPOINT]?.require;
    for (const [condition, relativePath] of [
      ["import", rootImport],
      ["require", rootRequire],
    ]) {
      if (typeof relativePath !== "string") continue;
      const resolved = resolveContainedFilePath(
        extractedDir,
        relativePath,
        `root ${condition} artifact`,
        failures,
      );
      if (resolved === null) continue;
      if (!startsWithClientDirective(readFileSync(resolved, "utf8"))) {
        push(`root ${condition} artifact must open with a top-level "use client" directive`);
      }
    }
    const tokensTarget = pkg.exports?.[TOKENS_ENTRYPOINT];
    for (const relativePath of exportTargetPaths(tokensTarget)) {
      if (!/\.(?:js|mjs|cjs)$/.test(relativePath)) continue;
      const resolved = resolveContainedFilePath(
        extractedDir,
        relativePath,
        "tokens runtime artifact",
        failures,
      );
      if (resolved === null) continue;
      if (/["']use client["']/.test(readFileSync(resolved, "utf8"))) {
        push(`tokens artifact ${relativePath} must not carry a "use client" directive`);
      }
    }
  }

  return failures;
}

/* -------------------------------------------------------------------------- */
/* Consumer fixtures                                                          */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Approved pilot scenarios (exact System B extension names only)             */
/* -------------------------------------------------------------------------- */

/** The only package whose extension scenarios are explicitly approved. */
export const PILOT_PACKAGE = "@prism-system/ui-system-b";

/**
 * Locked scenario adapters for the two approved System B pilots. The props are
 * transcribed from the real public types and the Showcase scenarios; a new
 * extension requires an explicit adapter here before the harness may render it.
 * Every other extension stays import-only and is reported as unwired instead of
 * being rendered with guessed props. Never activate this for another package:
 * the exact package name and export name must both match.
 */
export const PILOT_SCENARIOS = Object.freeze({
  KeyboardScene: Object.freeze({
    packageName: PILOT_PACKAGE,
    importPath: `${PILOT_PACKAGE}/custom/keyboard-scene`,
    propsType: "KeyboardSceneProps",
    typeImports: Object.freeze(["KeyboardSceneProps"]),
    ssrMode: "import-only",
    browserKind: "scene",
    browserProps: Object.freeze([
      "selectedKey={selectedKey}",
      "onSelectedKeyChange={handleSelectedKeyChange}",
      "reducedMotion={reducedMotion ? true : undefined}",
    ]),
    typeProbe: Object.freeze([
      "const keyboardSceneProps: KeyboardSceneProps = {",
      '  selectedKey: "letter-g",',
      "  onSelectedKeyChange: (key) => {",
      "    void key;",
      "  },",
      "  reducedMotion: true,",
      "};",
      "export const keyboardSceneProbe = <KeyboardScene {...keyboardSceneProps} />;",
    ]),
  }),
  InteractiveWorkflowMap: Object.freeze({
    packageName: PILOT_PACKAGE,
    importPath: `${PILOT_PACKAGE}/custom/interactive-workflow-map`,
    propsType: "InteractiveWorkflowMapProps",
    typeImports: Object.freeze(["InteractiveWorkflowMapProps", "InteractiveWorkflowNode"]),
    ssrMode: "markup",
    browserKind: "map",
    browserProps: Object.freeze([
      "nodes={workflowNodes}",
      "selectedNodeId={selectedNodeId}",
      "onSelectedNodeChange={handleSelectedNodeChange}",
      'label="Custom-component harness workflow"',
    ]),
    typeProbe: Object.freeze([
      "const workflowNodes: readonly InteractiveWorkflowNode[] = [",
      '  { id: "outline", title: "Outline", description: "Set the direction for the first pass." },',
      '  { id: "review", title: "Review", description: "Collect notes before the next revision." },',
      '  { id: "release", title: "Release", description: "Choose when the work is ready to share." },',
      "];",
      "const interactiveWorkflowMapProps: InteractiveWorkflowMapProps = {",
      "  nodes: workflowNodes,",
      '  selectedNodeId: "review",',
      "  onSelectedNodeChange: (nodeId) => {",
      "    void nodeId;",
      "  },",
      '  label: "Custom-component harness workflow",',
      "};",
      "export const interactiveWorkflowMapProbe = <InteractiveWorkflowMap {...interactiveWorkflowMapProps} />;",
    ]),
    ssrPropsLines: Object.freeze([
      '    label: "Custom-component harness workflow",',
      "    nodes: [",
      '      { id: "outline", title: "Outline", description: "Set the direction for the first pass." },',
      '      { id: "review", title: "Review", description: "Collect notes before the next revision." },',
      '      { id: "release", title: "Release", description: "Choose when the work is ready to share." },',
      "    ],",
      '    selectedNodeId: "review",',
      "    onSelectedNodeChange: () => {},",
    ]),
    ssrIncludes: Object.freeze([
      'aria-label="Custom-component harness workflow"',
      "Review selected.",
      'aria-pressed="true"',
    ]),
  }),
});

/**
 * Resolve the approved pilot adapter for a discovered extension, or null when
 * no explicit scenario exists. The exact package, export name, and entrypoint
 * import path must all match, so a renamed entrypoint or another package that
 * happens to export the same name deactivates the adapter instead of guessing.
 */
export function resolvePilotScenario(extension) {
  if (!extension || extension.packageName !== PILOT_PACKAGE || typeof extension.name !== "string") {
    return null;
  }
  const scenario = PILOT_SCENARIOS[extension.name];
  if (!scenario || extension.importPath !== scenario.importPath) return null;
  return scenario;
}

/** Minimal consumer package.json (never saved over by the harness installs). */
export function buildConsumerPackageJson({ name }) {
  return { name, version: "0.0.0", private: true, type: "module" };
}

/**
 * TS probe importing the root, tokens, and every selected extension. Approved
 * pilot extensions also build typed real props and JSX elements, so `tsc`
 * checks the public props contract instead of import existence alone.
 * Extensions without an approved adapter stay import-only.
 */
export function buildConsumerTypesSource({ packageName, tokensExport, extensions }) {
  const lines = [
    `import { Button, DesignSystem } from ${JSON.stringify(packageName)};`,
    `import { ${tokensExport} } from ${JSON.stringify(`${packageName}/tokens`)};`,
  ];
  for (const extension of extensions) {
    lines.push(`import { ${extension.name} } from ${JSON.stringify(extension.importPath)};`);
    const scenario = resolvePilotScenario(extension);
    if (scenario) {
      lines.push(
        `import type { ${scenario.typeImports.join(", ")} } from ${JSON.stringify(extension.importPath)};`,
      );
    }
  }
  lines.push("", "export const probes = {", "  Button,", "  DesignSystem,", `  ${tokensExport},`);
  for (const extension of extensions) lines.push(`  ${extension.name},`);
  lines.push("} as const;");
  for (const extension of extensions) {
    const scenario = resolvePilotScenario(extension);
    if (scenario) lines.push("", ...scenario.typeProbe);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Node SSR/import probe: real root, tokens, and extension module imports. An
 * approved DOM extension is server-rendered with `renderToString` and its real
 * props; a WebGL extension is server-imported only (there is no SSR markup
 * claim to make), and unknown extensions are never rendered with guessed props.
 */
export function buildConsumerSsrSource({ packageName, version, tokensExport, extensions }) {
  const needsMarkup = extensions.some(
    (extension) => resolvePilotScenario(extension)?.ssrMode === "markup",
  );
  const lines = ['import assert from "node:assert/strict";'];
  if (needsMarkup) {
    lines.push(
      'import { createElement } from "react";',
      'import { renderToString } from "react-dom/server";',
    );
  }
  lines.push(
    "",
    `const root = await import(${JSON.stringify(packageName)});`,
    `assert.equal(root.DesignSystem?.version, ${JSON.stringify(version)}, "root DesignSystem.version");`,
    'assert.ok("Button" in root, "root must export Button");',
    `const tokens = await import(${JSON.stringify(`${packageName}/tokens`)});`,
    `assert.ok(tokens[${JSON.stringify(tokensExport)}] && typeof tokens[${JSON.stringify(tokensExport)}] === "object", "tokens export");`,
  );
  extensions.forEach((extension, index) => {
    const variable = `extensionModule${index}`;
    lines.push(
      `const ${variable} = await import(${JSON.stringify(extension.importPath)});`,
      `assert.ok(${JSON.stringify(extension.name)} in ${variable}, ${JSON.stringify(`${extension.name} runtime export`)});`,
    );
    const scenario = resolvePilotScenario(extension);
    if (scenario === null) {
      lines.push(`// ${extension.name}: no approved scenario adapter; server import only.`);
      return;
    }
    lines.push(
      `assert.equal(typeof ${variable}.${extension.name}, "function", ${JSON.stringify(
        `${extension.name} must be a server-importable component`,
      )});`,
    );
    if (scenario.ssrMode !== "markup") {
      lines.push(
        `// ${extension.name}: ${scenario.ssrMode}; no SSR markup claim for this rendering mode.`,
      );
      return;
    }
    lines.push(
      `const markup${index} = renderToString(`,
      `  createElement(${variable}.${extension.name}, {`,
      ...scenario.ssrPropsLines,
      "  }),",
      ");",
    );
    for (const expected of scenario.ssrIncludes) {
      lines.push(
        `assert.ok(markup${index}.includes(${JSON.stringify(expected)}), ${JSON.stringify(
          `${extension.name} SSR markup must include ${expected}`,
        )});`,
      );
    }
  });
  lines.push('process.stdout.write("ssr-import-ok\\n");', "");
  return lines.join("\n");
}

/** Workflow stages owned by the harness for the approved map scenario. */
const WORKFLOW_NODE_LINES = Object.freeze([
  '  { id: "outline", title: "Outline", description: "Set the direction for the first pass." },',
  '  { id: "review", title: "Review", description: "Collect notes before the next revision." },',
  '  { id: "release", title: "Release", description: "Choose when the work is ready to share." },',
]);

function normalizeUiClass(uiClass) {
  if (uiClass === undefined || uiClass === null) return null;
  const value = requireNonEmptyString(uiClass, "uiClass");
  if (!UI_CLASS_PATTERN.test(value)) {
    throw new Error(`Invalid uiClass ${JSON.stringify(value)}; expected a CSS-safe class name.`);
  }
  return value;
}

/**
 * Browser entry composing package components plus every approved pilot
 * scenario with its real public props and controlled React state. QA-only
 * readouts expose the selected values and change counts for the parent browser
 * pass. Extensions without an approved adapter are imported but never rendered
 * (void-import boundary) and are reported separately as unwired. The package's
 * own root class is applied; no package internals are restyled here.
 */
export function buildBrowserMainSource({ packageName, extensions, uiClass = null }) {
  const resolvedUiClass = normalizeUiClass(uiClass);
  const wired = [];
  const unwired = [];
  for (const extension of extensions) {
    const scenario = resolvePilotScenario(extension);
    if (scenario) wired.push({ extension, scenario });
    else unwired.push(extension);
  }
  const scene = wired.find(({ scenario }) => scenario.browserKind === "scene") ?? null;
  const map = wired.find(({ scenario }) => scenario.browserKind === "map") ?? null;
  const extensionImports = extensions.map(
    (extension) => `import { ${extension.name} } from ${JSON.stringify(extension.importPath)};`,
  );

  const lines = [];
  if (wired.length > 0) lines.push('import { useState } from "react";');
  lines.push(
    'import { createRoot } from "react-dom/client";',
    `import { Button, Card } from ${JSON.stringify(packageName)};`,
    `import ${JSON.stringify(`${packageName}/styles.css`)};`,
    ...extensionImports,
    "",
  );

  if (wired.length === 0) {
    lines.push(
      "// Exact extension props arrive with a future designer handoff. Until then",
      "// this scaffold only proves the import boundary and never renders unknown",
      "// or empty prop sets.",
      extensions.length > 0
        ? `void [${extensions.map((extension) => extension.name).join(", ")}];`
        : "void 0;",
      "",
      'const rootElement = document.getElementById("root");',
      "createRoot(rootElement).render(",
    );
    if (resolvedUiClass) {
      lines.push(
        `  <div className=${JSON.stringify(resolvedUiClass)}>`,
        "    <Card>",
        "      <Card.Header>Prism custom components</Card.Header>",
        "      <Card.Content>",
        "        <Button>Action</Button>",
        "      </Card.Content>",
        "    </Card>",
        "  </div>,",
        ");",
      );
    } else {
      lines.push(
        "  <Card>",
        "    <Card.Header>Prism custom components</Card.Header>",
        "    <Card.Content>",
        "      <Button>Action</Button>",
        "    </Card.Content>",
        "  </Card>,",
        ");",
      );
    }
    lines.push("");
    return lines.join("\n");
  }

  lines.push(
    "// Approved System B pilot scenarios: real public props, controlled React",
    "// state, and QA-only readouts. No package internals are styled here.",
    "",
  );
  if (unwired.length > 0) {
    lines.push(
      "// Extensions without an approved adapter keep the import boundary; props",
      "// are never guessed.",
      `void [${unwired.map((extension) => extension.name).join(", ")}];`,
      "",
    );
  }
  if (map) lines.push("const workflowNodes = [", ...WORKFLOW_NODE_LINES, "];", "");

  lines.push("function Probe() {");
  if (scene) {
    lines.push(
      '  const [selectedKey, setSelectedKey] = useState("letter-g");',
      "  const [keyboardChanges, setKeyboardChanges] = useState(0);",
      "  const [reducedMotion, setReducedMotion] = useState(false);",
    );
  }
  if (map) {
    lines.push(
      '  const [selectedNodeId, setSelectedNodeId] = useState("review");',
      "  const [workflowChanges, setWorkflowChanges] = useState(0);",
    );
  }
  lines.push("");
  if (scene) {
    lines.push(
      "  const handleSelectedKeyChange = (key) => {",
      "    setSelectedKey(key);",
      "    setKeyboardChanges((count) => count + 1);",
      "  };",
      "  const simulateContextLoss = () => {",
      "    const sceneHost = document.querySelector('[data-prism-qa=\"keyboard-scene\"]');",
      '    const canvas = sceneHost ? sceneHost.querySelector("canvas") : null;',
      '    if (canvas) canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));',
      "  };",
    );
  }
  if (map) {
    lines.push(
      "  const handleSelectedNodeChange = (nodeId) => {",
      "    setSelectedNodeId(nodeId);",
      "    setWorkflowChanges((count) => count + 1);",
      "  };",
    );
  }
  lines.push(
    "",
    "  return (",
    resolvedUiClass ? `    <div className=${JSON.stringify(resolvedUiClass)}>` : "    <div>",
    "      <Card>",
    "        <Card.Header>Prism custom components</Card.Header>",
    "        <Card.Content>",
    "          <Button>Action</Button>",
    "        </Card.Content>",
    "      </Card>",
  );
  if (scene) {
    lines.push(
      '      <section data-prism-qa="keyboard-scene">',
      `        <${scene.extension.name}`,
      ...scene.scenario.browserProps.map((prop) => `          ${prop}`),
      "        />",
      "      </section>",
      '      <output data-prism-qa="keyboard-selected" data-selected-key={selectedKey ?? ""}>',
      '        {selectedKey ?? "none"}',
      "      </output>",
      '      <output data-prism-qa="keyboard-changes">{String(keyboardChanges)}</output>',
      "      <button",
      '        type="button"',
      '        data-prism-qa="keyboard-reduced-motion"',
      "        aria-pressed={reducedMotion}",
      "        onClick={() => setReducedMotion((value) => !value)}",
      "      >",
      "        QA: reduced motion",
      "      </button>",
      "      <button",
      '        type="button"',
      '        data-prism-qa="keyboard-context-loss"',
      "        onClick={simulateContextLoss}",
      "      >",
      "        QA: simulate context loss",
      "      </button>",
    );
  }
  if (map) {
    lines.push(
      '      <section data-prism-qa="workflow-map">',
      `        <${map.extension.name}`,
      ...map.scenario.browserProps.map((prop) => `          ${prop}`),
      "        />",
      "      </section>",
      '      <output data-prism-qa="workflow-selected" data-selected-node={selectedNodeId ?? ""}>',
      '        {selectedNodeId ?? "none"}',
      "      </output>",
      '      <output data-prism-qa="workflow-changes">{String(workflowChanges)}</output>',
    );
  }
  lines.push(
    "    </div>",
    "  );",
    "}",
    "",
    'const rootElement = document.getElementById("root");',
    "createRoot(rootElement).render(<Probe />);",
    "",
  );
  return lines.join("\n");
}

export function buildBrowserHtmlSource({ title }) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${title}</title>`,
    '    <link rel="stylesheet" href="./bundle.css" />',
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    '    <script type="module" src="./bundle.js"></script>',
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

/** A literal consumer source file used by `--entry <file>` prerequisite scans. */
export function buildConsumerEntryProbeSource({ extension }) {
  return [
    `import { ${extension.name} } from ${JSON.stringify(extension.importPath)};`,
    `void ${extension.name};`,
    "",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Workspace toolchain discovery                                              */
/* -------------------------------------------------------------------------- */

/** Find the workspace's existing transitive esbuild bin, or null. */
export function resolveWorkspaceEsbuild(root) {
  const candidates = [
    join(root, "node_modules", ".pnpm", "node_modules", "esbuild", "bin", "esbuild"),
  ];
  const pnpmDir = join(root, "node_modules", ".pnpm");
  if (existsSync(pnpmDir)) {
    for (const entry of readdirSync(pnpmDir)
      .filter((name) => name.startsWith("esbuild@"))
      .sort()) {
      candidates.push(join(pnpmDir, entry, "node_modules", "esbuild", "bin", "esbuild"));
    }
  }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Find the workspace TypeScript compiler entry, or null. */
export function resolveWorkspaceTsc(root) {
  const candidate = join(root, "node_modules", "typescript", "bin", "tsc");
  return existsSync(candidate) ? candidate : null;
}

function toFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

/**
 * Bundle a browser fixture with the workspace esbuild. Returns
 * `{ ok, detail }`; a missing esbuild is a recorded skip, never a silent pass.
 */
export function bundleBrowserFixture({ esbuildBin, browserDir }) {
  if (esbuildBin === null)
    return { ok: false, skipped: true, detail: "workspace esbuild not found" };
  const result = runNode(
    [
      esbuildBin,
      "main.jsx",
      "--bundle",
      "--format=esm",
      "--outfile=bundle.js",
      "--jsx=automatic",
      "--loader:.jsx=jsx",
      "--loader:.css=css",
      "--log-level=warning",
    ],
    { cwd: browserDir },
  );
  return result.status === 0
    ? { ok: true, detail: "bundled" }
    : { ok: false, skipped: false, detail: output(result) };
}

/* -------------------------------------------------------------------------- */
/* Static server (explicit --serve only)                                      */
/* -------------------------------------------------------------------------- */

/** Start a contained read-only static server for a browser fixture directory. */
export function startStaticServer(directory, host = "127.0.0.1") {
  const server = createServer((request, response) => {
    let requestPath;
    try {
      requestPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const target = resolve(directory, `.${requestPath === "/" ? "/index.html" : requestPath}`);
    const rel = relative(directory, target);
    if (
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      !existsSync(target) ||
      !statSync(target).isFile()
    ) {
      response.writeHead(404).end("Not found");
      return;
    }
    const type = target.endsWith(".js")
      ? "text/javascript"
      : target.endsWith(".css")
        ? "text/css"
        : target.endsWith(".html")
          ? "text/html"
          : "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    response.end(readFileSync(target));
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, host, () => {
      resolvePromise({ server, url: `http://${host}:${server.address().port}/` });
    });
  });
}

function waitForSignal(servers) {
  return new Promise((resolvePromise) => {
    const stop = () => {
      for (const { server } of servers) server.close();
      resolvePromise();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

/* -------------------------------------------------------------------------- */
/* Run directory                                                              */
/* -------------------------------------------------------------------------- */

/** Create a unique contained run directory; a collision fails closed. */
export function createRunDirectory(root) {
  const parent = join(root, "TEMP", "lifecycle");
  mkdirSync(parent, { recursive: true });
  const runDirectory = join(parent, `custom-${randomUUID()}`);
  if (existsSync(runDirectory)) {
    throw new Error(`Run directory collision at ${runDirectory}; refusing to reuse it.`);
  }
  mkdirSync(runDirectory, { recursive: true });
  return runDirectory;
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * True when a package's published payload is built into `dist/`: either its
 * `files` whitelist or one of its `exports` targets references `./dist`. Only
 * those packages must fail closed when packed without a build. Source-shipping
 * packages (for example `@prism-system/tools`, whose files/exports point at
 * `bin`/`src`) are packed as-is and have no dist step.
 */
export function packageRequiresDist(pkg) {
  const files = Array.isArray(pkg?.files) ? pkg.files : [];
  if (files.some((entry) => entry === "dist" || entry.startsWith("dist/"))) {
    return true;
  }
  const targets = [];
  const collect = (value) => {
    if (typeof value === "string") {
      targets.push(value);
    } else if (value !== null && typeof value === "object") {
      for (const nested of Object.values(value)) collect(nested);
    }
  };
  collect(pkg?.exports);
  return targets.some((target) => target === "./dist" || target.startsWith("./dist/"));
}

function packAndExtract({ target, runDirectory, log, failures }) {
  // An unreadable/missing package.json keeps the conservative dist requirement
  // so an unbuilt or malformed package still fails closed at this guard.
  const packageJsonPath = join(target.packageDir, "package.json");
  const requiresDist = existsSync(packageJsonPath)
    ? packageRequiresDist(readJsonFile(packageJsonPath))
    : true;
  if (requiresDist && !existsSync(join(target.packageDir, "dist"))) {
    failures.push(`${target.label}: missing dist/; build the package before packing`);
    return null;
  }
  const packDir = join(runDirectory, "pack");
  mkdirSync(packDir, { recursive: true });
  const pack = runCommand("pnpm", ["pack", "--pack-destination", packDir], {
    cwd: target.packageDir,
  });
  if (pack.status !== 0) {
    failures.push(`${target.label}: pnpm pack failed: ${output(pack)}`);
    return null;
  }
  const tarball = readdirSync(packDir).find(
    (name) => name.endsWith(".tgz") && name.includes(target.id),
  );
  if (!tarball) {
    failures.push(`${target.label}: no tarball was produced`);
    return null;
  }
  const tarballPath = join(packDir, tarball);
  log(`PACK ${target.label}: ${toPosix(relative(runDirectory, tarballPath))}`);
  const extractDir = join(runDirectory, "extract", target.id);
  mkdirSync(extractDir, { recursive: true });
  const extract = runCommand("tar", ["-xzf", tarballPath, "-C", extractDir]);
  if (extract.status !== 0) {
    failures.push(`${target.label}: tar extraction failed: ${output(extract)}`);
    return null;
  }
  const packageDir = join(extractDir, "package");
  if (!existsSync(join(packageDir, "package.json"))) {
    failures.push(`${target.label}: extracted tarball has no package/package.json`);
    return null;
  }
  return { tarballPath, packageDir };
}

async function runHarnessInternal(options) {
  const {
    root = repoRoot(),
    staticOnly = false,
    keep = false,
    serve = false,
    log = (line) => process.stdout.write(`${line}\n`),
  } = options;
  const checks = [];
  const skipped = [];
  let runDirectory = null;
  const servers = [];
  const browserFixtures = [];

  const record = (name, run) => {
    try {
      run();
      checks.push({ name, ok: true });
      log(`PASS ${name}`);
    } catch (error) {
      checks.push({ name, ok: false, detail: error.message });
      log(`FAIL ${name}: ${error.message}`);
    }
  };
  const recordAsync = async (name, run) => {
    try {
      await run();
      checks.push({ name, ok: true });
      log(`PASS ${name}`);
    } catch (error) {
      checks.push({ name, ok: false, detail: error.message });
      log(`FAIL ${name}: ${error.message}`);
    }
  };
  const skip = (name, reason) => {
    skipped.push({ name, reason });
    log(`SKIP ${name}: ${reason}`);
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  try {
    let discovery;
    try {
      discovery = discoverDeclaredExtensions({ root });
    } catch (error) {
      checks.push({ name: "discover declared extensions", ok: false, detail: error.message });
      return { ok: false, checks, skipped, runDirectory: null, browserFixtures: [] };
    }
    checks.push({ name: "discover declared extensions", ok: true });
    log(
      `DISCOVER ${discovery.extensions.length} extension(s) across ` +
        `${discovery.systems.filter((system) => system.extensions.length > 0).length} system(s)`,
    );
    if (discovery.extensions.length === 0) {
      skip("custom-component verification", "no manifest extensions are declared yet");
      return { ok: true, checks, skipped, runDirectory: null, browserFixtures: [] };
    }

    runDirectory = createRunDirectory(root);
    log(`RUN ${toPosix(relative(root, runDirectory))}`);
    const packFailures = [];

    const coreDir = join(root, "packages", "core");
    const toolsDir = join(root, "packages", "tools");
    const systemTargets = discovery.systems
      .filter((system) => system.extensions.length > 0)
      .map((system) => ({
        id: system.id,
        label: system.packageName,
        packageDir: system.packageDir,
        system,
      }));

    const packed = { core: null, tools: null, systems: new Map() };
    record("pack and extract workspace artifacts", () => {
      packed.core = packAndExtract({
        target: { id: "core", label: "@prism-system/ui-core", packageDir: coreDir },
        runDirectory,
        log,
        failures: packFailures,
      });
      packed.tools = packAndExtract({
        target: { id: "tools", label: "@prism-system/tools", packageDir: toolsDir },
        runDirectory,
        log,
        failures: packFailures,
      });
      for (const target of systemTargets) {
        packed.systems.set(
          target.id,
          packAndExtract({ target, runDirectory, log, failures: packFailures }),
        );
      }
      assert(packFailures.length === 0, packFailures.join("; "));
    });

    // The packed tools artifact must be the workspace package, never a stale
    // user-level install that happens to resolve on this machine.
    record("packed tools artifact is the workspace package", () => {
      assert(packed.tools !== null, "tools were not packed");
      const packedPkg = readJsonFile(join(packed.tools.packageDir, "package.json"));
      const workspacePkg = readJsonFile(join(toolsDir, "package.json"));
      assert(packedPkg.name === "@prism-system/tools", "packed tools package name mismatch");
      assert(
        packedPkg.version === workspacePkg.version,
        `packed tools version ${packedPkg.version} does not match workspace ${workspacePkg.version}`,
      );
      assert(
        toFileUrl(join(packed.tools.packageDir, "src", "index.mjs")).startsWith(
          toFileUrl(runDirectory),
        ),
        "packed tools entry is outside the run directory",
      );
    });

    for (const target of systemTargets) {
      const extracted = packed.systems.get(target.id);
      if (extracted === null) continue;
      record(`static packed custom surface ${target.id}`, () => {
        const pkg = readJsonFile(join(extracted.packageDir, "package.json"));
        const manifest = readJsonFile(join(extracted.packageDir, "design-system.json"));
        const failures = collectPackedCustomFailures({
          label: target.id,
          extractedDir: extracted.packageDir,
          pkg,
          manifest,
        });
        assert(failures.length === 0, failures.join("; "));
      });
    }

    if (staticOnly) {
      skip("consumer matrix", "--static-only");
    } else if (packed.core === null || packed.tools === null || packFailures.length > 0) {
      skip("consumer matrix", "packing the workspace artifacts did not succeed");
    } else {
      const tscPath = resolveWorkspaceTsc(root);
      const esbuildBin = resolveWorkspaceEsbuild(root);
      if (tscPath === null) {
        skip("consumer typecheck", "workspace typescript is not installed");
      }
      if (esbuildBin === null) {
        skip(
          "browser fixture bundling",
          "workspace esbuild not found (no new dependency is added)",
        );
      }

      for (const target of systemTargets) {
        const extracted = packed.systems.get(target.id);
        if (extracted === null) continue;
        const systemExtensions = target.system.extensions;
        const domExtensions = systemExtensions.filter((extension) => !isSceneExtension(extension));
        const sceneExtensions = systemExtensions.filter((extension) => isSceneExtension(extension));
        const sceneExtension = sceneExtensions[0] ?? null;
        if (domExtensions.length === 0) {
          checks.push({
            name: `dom extension present ${target.id}`,
            ok: false,
            detail:
              "no DOM-rendered extension is declared; a graphics-free selected extension cannot be verified",
          });
        }
        if (sceneExtensions.length === 0) {
          skip(
            `scene matrix ${target.id}`,
            "no WebGL/mixed or graphics-peer extension is declared",
          );
        }

        for (const row of CONSUMER_MATRIX) {
          const rowLabel = `${target.id} ${row.id}`;
          const rootOnlyDir = join(runDirectory, "consumers", `${row.id}-${target.id}-root`);
          const baseSpecs = [
            `react@${row.react}`,
            `react-dom@${row.reactDom}`,
            `@types/react@${row.typesReact}`,
            `@types/react-dom@${row.typesReactDom}`,
          ];

          await recordAsync(`isolated root-only consumer install ${rowLabel}`, async () => {
            mkdirSync(rootOnlyDir, { recursive: true });
            const consumerPkgPath = join(rootOnlyDir, "package.json");
            writeJsonFile(
              consumerPkgPath,
              buildConsumerPackageJson({ name: `prism-${row.id}-${target.id}-root` }),
            );
            const packageTextBefore = readFileSync(consumerPkgPath, "utf8");
            const result = runCommand(
              "npm",
              [
                "install",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                "--no-save",
                "--no-package-lock",
                packed.core.tarballPath,
                extracted.tarballPath,
                ...baseSpecs,
              ],
              { cwd: rootOnlyDir },
            );
            assert(result.status === 0, `npm install failed:\n${output(result)}`);
            assert(
              readFileSync(consumerPkgPath, "utf8") === packageTextBefore,
              "npm install must not save dependencies into the consumer package.json",
            );
          });

          if (domExtensions.length > 0) {
            const dom = domExtensions[0];
            await recordAsync(
              `dom extension works without graphics peers ${rowLabel}`,
              async () => {
                const script = buildConsumerSsrSource({
                  packageName: target.system.packageName,
                  version: target.system.version,
                  tokensExport: target.system.tokensExport,
                  extensions: [dom],
                });
                writeText(join(rootOnlyDir, "ssr-dom.mjs"), script);
                const result = runNode([join(rootOnlyDir, "ssr-dom.mjs")], { cwd: rootOnlyDir });
                assert(result.status === 0, output(result));
              },
            );
          }

          if (sceneExtension !== null) {
            const graphicsPeers = sceneExtension.requirements.filter((requirement) =>
              GRAPHICS_PEER_PATTERN.test(requirement.name),
            );
            await recordAsync(
              `scene peers are absent in root-only consumer ${rowLabel}`,
              async () => {
                for (const requirement of graphicsPeers) {
                  const resolved = runNode(
                    [
                      "-e",
                      `try { require.resolve(${JSON.stringify(requirement.name)}); process.exit(0); } catch { process.exit(3); }`,
                    ],
                    { cwd: rootOnlyDir },
                  );
                  assert(
                    resolved.status === 3,
                    `${requirement.name} unexpectedly resolves in the root-only consumer`,
                  );
                }
              },
            );

            await recordAsync(
              `dom-only check/doctor and scene --entry failures ${rowLabel}`,
              async () => {
                const toolsBin = join(packed.tools.packageDir, "bin", "prism-ds.mjs");
                const runPrism = (args) => runNode([toolsBin, ...args], { cwd: rootOnlyDir });
                // The isolated install used `--no-save`, so the consumer has no
                // recorded dependency and no config yet. Run the real offline
                // connect so discovery matches the post-install/use consumer
                // state before the CLI checks below.
                const connect = runPrism([
                  "connect",
                  target.system.packageName,
                  "--cwd",
                  rootOnlyDir,
                ]);
                assert(connect.status === 0, `connect failed: ${output(connect)}`);
                const catalog = runPrism(["components", "--cwd", rootOnlyDir, "--json"]);
                assert(catalog.status === 0, `components --json failed: ${output(catalog)}`);
                const catalogJson = JSON.parse(catalog.stdout);
                const catalogExtensions =
                  catalogJson.extensions ?? catalogJson.catalog?.extensions ?? [];
                const manifestExtensions = target.system.manifest.extensions ?? {};
                const expectedRequirements = (entrypoint) =>
                  target.system.manifest.entrypoints?.[entrypoint]?.requirements ?? [];
                for (const [name, extension] of Object.entries(manifestExtensions)) {
                  const entry = catalogExtensions.find((candidate) => candidate.name === name);
                  assert(entry, `catalog is missing extension ${name}`);
                  nodeAssert.equal(
                    entry.entrypoint,
                    extension.entrypoint,
                    `catalog entrypoint ${name}`,
                  );
                  nodeAssert.equal(
                    entry.importPath,
                    entrypointImportPath(target.system.packageName, extension.entrypoint),
                    `catalog importPath ${name}`,
                  );
                  nodeAssert.equal(
                    entry.apiVersion,
                    extension.apiVersion,
                    `catalog apiVersion ${name}`,
                  );
                  nodeAssert.deepEqual(
                    entry.effects ?? null,
                    extension.effects ?? null,
                    `catalog effects ${name}`,
                  );
                  nodeAssert.deepEqual(
                    entry.requirements,
                    expectedRequirements(extension.entrypoint),
                    `catalog requirements ${name}`,
                  );
                }
                const requestedDom = runPrism([
                  "components",
                  domExtensions[0].name,
                  "--cwd",
                  rootOnlyDir,
                  "--json",
                ]);
                assert(
                  requestedDom.status === 0,
                  `components <name> failed: ${output(requestedDom)}`,
                );
                const requestedJson = JSON.parse(requestedDom.stdout);
                nodeAssert.equal(
                  requestedJson.requested?.name,
                  domExtensions[0].name,
                  "requested catalog name",
                );
                nodeAssert.equal(
                  requestedJson.requested?.importPath,
                  domExtensions[0].importPath,
                  "requested catalog importPath",
                );
                const defaultCheck = runPrism(["check", "--cwd", rootOnlyDir, "--json"]);
                assert(
                  defaultCheck.status === 0,
                  `default check must pass: ${output(defaultCheck)}`,
                );
                const defaultDoctor = runPrism(["doctor", "--cwd", rootOnlyDir]);
                assert(
                  defaultDoctor.status === 0,
                  `default doctor must pass: ${output(defaultDoctor)}`,
                );
                const domEntry = runPrism([
                  "check",
                  "--cwd",
                  rootOnlyDir,
                  "--entry",
                  domExtensions[0].name,
                  "--json",
                ]);
                assert(domEntry.status === 0, `dom extension check must pass: ${output(domEntry)}`);
                const sceneEntry = runPrism([
                  "check",
                  "--cwd",
                  rootOnlyDir,
                  "--entry",
                  sceneExtension.name,
                  "--json",
                ]);
                assert(sceneEntry.status !== 0, "scene check must fail without graphics peers");
                const sceneJson = JSON.parse(sceneEntry.stdout);
                const entryCheck = (sceneJson.checks ?? []).find((check) => check.id === "entry");
                assert(
                  entryCheck && entryCheck.status === "failed",
                  "scene check must report a failed entry prerequisite",
                );
                for (const requirement of graphicsPeers) {
                  assert(
                    String(entryCheck.detail).includes(requirement.name),
                    `scene entry failure must name ${requirement.name}: ${entryCheck.detail}`,
                  );
                }
                const probePath = join(rootOnlyDir, "scene-entry.tsx");
                writeText(probePath, buildConsumerEntryProbeSource({ extension: sceneExtension }));
                const literalEntry = runPrism([
                  "check",
                  "--cwd",
                  rootOnlyDir,
                  "--entry",
                  "./scene-entry.tsx",
                  "--json",
                ]);
                assert(
                  literalEntry.status !== 0,
                  "literal scene import must fail without graphics peers",
                );
                const doctorScene = runPrism([
                  "doctor",
                  "--cwd",
                  rootOnlyDir,
                  "--entry",
                  sceneExtension.name,
                ]);
                assert(
                  doctorScene.status !== 0,
                  "doctor --entry scene must fail without graphics peers",
                );
              },
            );
          }

          if (tscPath !== null && domExtensions.length > 0) {
            await recordAsync(
              `typescript imports root/tokens/dom extension ${rowLabel}`,
              async () => {
                writeText(
                  join(rootOnlyDir, "consumer-types.tsx"),
                  buildConsumerTypesSource({
                    packageName: target.system.packageName,
                    tokensExport: target.system.tokensExport,
                    extensions: [domExtensions[0]],
                  }),
                );
                writeJsonFile(join(rootOnlyDir, "tsconfig.json"), {
                  compilerOptions: {
                    target: "ES2022",
                    module: "ESNext",
                    moduleResolution: "Bundler",
                    jsx: "react-jsx",
                    strict: true,
                    noEmit: true,
                    skipLibCheck: true,
                    types: [],
                  },
                  include: ["consumer-types.tsx"],
                });
                const result = runNode([tscPath, "-p", join(rootOnlyDir, "tsconfig.json")], {
                  cwd: rootOnlyDir,
                });
                assert(result.status === 0, output(result));
              },
            );
          }

          if (sceneExtension !== null && domExtensions.length > 0) {
            const selectedDir = join(runDirectory, "consumers", `${row.id}-${target.id}-selected`);
            const graphicsPeers = sceneExtension.requirements.filter((requirement) =>
              GRAPHICS_PEER_PATTERN.test(requirement.name),
            );
            const peerSpecs = [];
            for (const requirement of graphicsPeers) {
              if (requirement.name === "three") peerSpecs.push(`three@${row.three}`);
              else if (requirement.name === "@react-three/fiber")
                peerSpecs.push(`@react-three/fiber@${row.fiber}`);
              else {
                checks.push({
                  name: `scene peer coverage ${rowLabel}`,
                  ok: false,
                  detail:
                    `no approved version is pinned for scene peer ${requirement.name}; add an explicit row entry ` +
                    "instead of relying on a range",
                });
              }
            }
            await recordAsync(`selected extension consumer install ${rowLabel}`, async () => {
              mkdirSync(selectedDir, { recursive: true });
              const consumerPkgPath = join(selectedDir, "package.json");
              writeJsonFile(
                consumerPkgPath,
                buildConsumerPackageJson({ name: `prism-${row.id}-${target.id}-selected` }),
              );
              const result = runCommand(
                "npm",
                [
                  "install",
                  "--ignore-scripts",
                  "--no-audit",
                  "--no-fund",
                  "--no-save",
                  "--no-package-lock",
                  packed.core.tarballPath,
                  extracted.tarballPath,
                  ...baseSpecs,
                  `three@${row.three}`,
                  `@react-three/fiber@${row.fiber}`,
                  `@types/three@${row.typesThree}`,
                ],
                { cwd: selectedDir },
              );
              assert(result.status === 0, `npm install failed:\n${output(result)}`);
            });

            if (tscPath !== null) {
              await recordAsync(`typescript imports scene public entry ${rowLabel}`, async () => {
                writeText(
                  join(selectedDir, "consumer-types.tsx"),
                  buildConsumerTypesSource({
                    packageName: target.system.packageName,
                    tokensExport: target.system.tokensExport,
                    extensions: [sceneExtension],
                  }),
                );
                writeJsonFile(join(selectedDir, "tsconfig.json"), {
                  compilerOptions: {
                    target: "ES2022",
                    module: "ESNext",
                    moduleResolution: "Bundler",
                    jsx: "react-jsx",
                    strict: true,
                    noEmit: true,
                    skipLibCheck: true,
                    types: [],
                  },
                  include: ["consumer-types.tsx"],
                });
                const result = runNode([tscPath, "-p", join(selectedDir, "tsconfig.json")], {
                  cwd: selectedDir,
                });
                assert(result.status === 0, output(result));
              });
            }

            await recordAsync(`selected extension CLI prerequisites ${rowLabel}`, async () => {
              const toolsBin = join(packed.tools.packageDir, "bin", "prism-ds.mjs");
              const runPrism = (args) => runNode([toolsBin, ...args], { cwd: selectedDir });
              // Same post-install connect as the root-only consumer so the
              // selected CLI checks can discover the installed system.
              const connect = runPrism([
                "connect",
                target.system.packageName,
                "--cwd",
                selectedDir,
              ]);
              assert(connect.status === 0, `connect failed: ${output(connect)}`);
              writeText(
                join(selectedDir, "ssr-selected.mjs"),
                buildConsumerSsrSource({
                  packageName: target.system.packageName,
                  version: target.system.version,
                  tokensExport: target.system.tokensExport,
                  extensions: [sceneExtension],
                }),
              );
              const ssr = runNode([join(selectedDir, "ssr-selected.mjs")], { cwd: selectedDir });
              assert(ssr.status === 0, output(ssr));
              const sceneCheck = runPrism([
                "check",
                "--cwd",
                selectedDir,
                "--entry",
                sceneExtension.name,
                "--json",
              ]);
              assert(
                sceneCheck.status === 0,
                `selected scene check must pass: ${output(sceneCheck)}`,
              );
              const selectedDoctor = runPrism([
                "doctor",
                "--cwd",
                selectedDir,
                "--entry",
                sceneExtension.name,
              ]);
              assert(
                selectedDoctor.status === 0,
                `selected doctor must pass: ${output(selectedDoctor)}`,
              );
            });
          }

          await recordAsync(`offline peer planning helpers ${rowLabel}`, async () => {
            const helper = await import(
              toFileUrl(join(packed.tools.packageDir, "src", "index.mjs"))
            );
            const installedManifest = readJsonFile(
              join(
                rootOnlyDir,
                "node_modules",
                ...target.system.packageName.split("/"),
                "design-system.json",
              ),
            );
            // Registry `info` and `upgrade` diffs are network commands; this
            // offline harness proves the same strict manifest reader and the
            // entry/peer planner they share on the exact packed artifact.
            const validateFailures = helper.collectManifestFailures(installedManifest, {
              packageName: target.system.packageName,
              version: target.system.version,
            });
            assert(validateFailures.length === 0, validateFailures.join("; "));
            nodeAssert.doesNotThrow(() =>
              helper.validateDesignSystemManifest(installedManifest, {
                packageName: target.system.packageName,
                version: target.system.version,
              }),
            );
            if (sceneExtension === null) return;
            const graphicsPeers = sceneExtension.requirements.filter((requirement) =>
              GRAPHICS_PEER_PATTERN.test(requirement.name),
            );
            const peerSpecs = graphicsPeers.map((requirement) =>
              requirement.name === "three"
                ? `three@${row.three}`
                : `@react-three/fiber@${row.fiber}`,
            );
            const hashBefore = hashTree(rootOnlyDir);
            const plan = helper.planEntryAndPeers({
              consumerRoot: rootOnlyDir,
              packageName: target.system.packageName,
              manifest: installedManifest,
              entries: [sceneExtension.name],
              peerSpecs,
            });
            assert(
              plan.selection.entries[0]?.extension === sceneExtension.name,
              "plan must select the scene extension",
            );
            const plannedNames = new Set(plan.peers.map((peer) => peer.name));
            for (const requirement of sceneExtension.requirements) {
              assert(plannedNames.has(requirement.name), `plan must include ${requirement.name}`);
            }
            for (const requirement of graphicsPeers) {
              const planned = plan.peers.find((peer) => peer.name === requirement.name);
              assert(
                planned.action === "install",
                `${requirement.name} must be planned for install`,
              );
              assert(
                planned.source === "override",
                `${requirement.name} must come from the explicit override`,
              );
            }
            const manager = "npm";
            const built = helper.buildInstallCommand({
              manager,
              packageName: target.system.packageName,
              version: target.system.version,
              exact: true,
              registry: "https://registry.npmjs.org",
              extraPackages: peerSpecs,
            });
            assert(
              Array.isArray(built.args) && built.args.every((value) => typeof value === "string"),
              "the install command must be a fixed string argv",
            );
            assert(
              built.args.includes("--ignore-scripts"),
              "the install argv must keep --ignore-scripts",
            );
            for (const spec of peerSpecs) {
              assert(built.args.includes(spec), `the install argv must contain the peer ${spec}`);
            }
            const spawnPlan = helper.buildSpawnPlan({ manager, args: built.args });
            assert(
              spawnPlan.options.shell === false,
              "spawn planning must not use a shell on POSIX",
            );
            await nodeAssert.rejects(
              async () =>
                helper.planEntryAndPeers({
                  consumerRoot: rootOnlyDir,
                  packageName: target.system.packageName,
                  manifest: installedManifest,
                  entries: [sceneExtension.name],
                  peerSpecs: ["@prism-system/not-a-declared-peer@1.0.0"],
                }),
              /not a declared requirement/,
            );
            assert(
              hashTree(rootOnlyDir) === hashBefore,
              "offline peer planning must not write to the consumer",
            );
          });
        }
      }
    }

    for (const target of systemTargets) {
      const extracted = packed.systems.get(target.id);
      if (extracted === null) continue;
      const systemExtensions = target.system.extensions;
      if (
        systemExtensions.length === 0 ||
        staticOnly ||
        packed.core === null ||
        packed.tools === null
      )
        continue;
      for (const row of CONSUMER_MATRIX) {
        const browserConsumer = join(runDirectory, "consumers", `${row.id}-${target.id}-selected`);
        if (!existsSync(join(browserConsumer, "node_modules"))) {
          skip(`browser fixtures ${target.id} ${row.id}`, "selected consumer was not installed");
          continue;
        }
        const browserDir = join(browserConsumer, "browser");
        const wiredExtensions = systemExtensions.filter(
          (extension) => resolvePilotScenario(extension) !== null,
        );
        const unwiredExtensions = systemExtensions.filter(
          (extension) => resolvePilotScenario(extension) === null,
        );
        let sourcesReady = false;
        record(`browser fixture sources ${target.id} ${row.id}`, () => {
          mkdirSync(browserDir, { recursive: true });
          writeText(
            join(browserDir, "main.jsx"),
            buildBrowserMainSource({
              packageName: target.system.packageName,
              extensions: systemExtensions,
              uiClass: target.system.uiClass,
            }),
          );
          writeText(
            join(browserDir, "index.html"),
            buildBrowserHtmlSource({ title: `${target.system.packageName} custom components` }),
          );
          const main = readFileSync(join(browserDir, "main.jsx"), "utf8");
          for (const extension of systemExtensions) {
            assert(
              main.includes(extension.importPath),
              `browser fixture must import ${extension.importPath}`,
            );
          }
          for (const extension of wiredExtensions) {
            const scenario = resolvePilotScenario(extension);
            assert(
              main.includes(`<${extension.name}`),
              `browser fixture must mount ${extension.name} with its approved scenario props`,
            );
            for (const prop of scenario.browserProps) {
              assert(
                main.includes(prop),
                `browser fixture must wire ${extension.name} prop ${prop}`,
              );
            }
          }
          if (unwiredExtensions.length > 0) {
            assert(
              main.includes(
                `void [${unwiredExtensions.map((extension) => extension.name).join(", ")}]`,
              ),
              "browser fixture must not render an extension without an approved scenario adapter",
            );
          }
          if (target.system.uiClass !== null) {
            assert(
              main.includes(`className=${JSON.stringify(target.system.uiClass)}`),
              `browser fixture must apply the package root class ${target.system.uiClass}`,
            );
          }
          sourcesReady = true;
        });
        if (sourcesReady) {
          for (const extension of unwiredExtensions) {
            skip(
              `browser fixture render ${target.id} ${row.id} ${extension.name}`,
              "no approved scenario adapter for this extension; only the import boundary is verified",
            );
          }
          record(`browser fixture bundle ${target.id} ${row.id}`, () => {
            const result = bundleBrowserFixture({
              esbuildBin: resolveWorkspaceEsbuild(root),
              browserDir,
            });
            if (result.skipped) {
              skip(`browser fixture bundle ${target.id} ${row.id}`, result.detail);
              return;
            }
            assert(result.ok, `esbuild failed: ${result.detail}`);
            assert(existsSync(join(browserDir, "bundle.js")), "esbuild did not emit bundle.js");
            const bundle = readFileSync(join(browserDir, "bundle.js"), "utf8");
            for (const extension of systemExtensions) {
              assert(
                new RegExp(`\\b${escapeRegExp(extension.name)}\\b`).test(bundle),
                `bundle must resolve extension ${extension.name}`,
              );
            }
          });
          browserFixtures.push({
            systemId: target.id,
            rowId: row.id,
            directory: browserDir,
            preserved: keep,
          });
          if (serve) {
            const started = await startStaticServer(browserDir);
            servers.push(started);
            log(
              `SERVE ${target.id} ${row.id} browser fixture: ${started.url} ` +
                "(QA is explicit; Ctrl+C stops)",
            );
          }
        }
      }
    }
    if (serve && servers.length > 0) {
      await waitForSignal(servers);
    }

    return {
      ok: checks.every((check) => check.ok),
      checks,
      skipped,
      runDirectory: keep ? runDirectory : null,
      browserFixtures,
    };
  } finally {
    if (runDirectory !== null && !keep) {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  }
}

/** Run the harness and return a structured summary (used by tests and CLI). */
export async function runHarness(options = {}) {
  return runHarnessInternal(options);
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${helpText()}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const summary = await runHarness({
    root: resolve(options.root ?? repoRoot()),
    staticOnly: options.staticOnly,
    keep: options.keep,
    serve: options.serve,
    log: options.json ? () => {} : (line) => process.stdout.write(`${line}\n`),
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
  if (!summary.ok) {
    process.stderr.write(
      `Custom-component verification failed: ${summary.checks.filter((check) => !check.ok).length} check(s).\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (!options.json) {
    process.stdout.write(
      `Custom-component verification passed: ${summary.checks.length} check(s), ` +
        `${summary.skipped.length} explicit skip(s).\n`,
    );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
