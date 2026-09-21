#!/usr/bin/env node
/**
 * Deterministic validation for a registered design-system package (V2 Phase 4).
 *
 * This module is both a reusable library (imported by release tooling) and a
 * CLI (`pnpm ds:check <id>`). It never mutates the manifest or the package.
 *
 * `validateDesignSystem({ id, root, runCommands })` returns a structured result
 * of the form `{ id, ok, failures, checks }`. Every check aggregates, so a
 * single run reports as many independent issues as it can detect.
 *
 * Validation is V2-only: the canonical fourteen-component contract is always
 * required, and a V1/missing contract on the manifest entry fails with an
 * actionable message instead of falling back to the historical eight.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANIFEST_RELATIVE_PATH,
  PACKAGE_DIRECTORY,
  assertSystemId,
  readJsonFile,
  readManifest,
  readPackageMetadata,
  repoRoot,
  toPackageName,
  toTokensExport,
  toUiClass,
} from "./register-design-system.mjs";

/** The canonical fourteen V2 component names, in order. */
export const V2_REQUIRED_COMPONENTS = Object.freeze([
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
]);

/** Applications every registered system must be wired into. */
export const APP_NAMES = Object.freeze(["showcase", "reference-app"]);

/** Required non-source files for every package. */
const REQUIRED_FILES = Object.freeze([
  "package.json",
  "README.md",
  "AGENTS.md",
  "LICENSE",
  "tsconfig.json",
  "src/index.ts",
  "src/tokens/index.ts",
  "src/styles/index.css",
]);

/** Component module candidates; generated packages emit `.tsx`. */
const COMPONENT_MODULE_CANDIDATES = Object.freeze([
  "src/components/index.tsx",
  "src/components/index.ts",
]);

/** Required token groups; `typography` is optional. */
const REQUIRED_TOKEN_GROUPS = Object.freeze(["color", "radius", "shadow", "motion"]);

/** Package scripts that must exist and pass. */
const REQUIRED_PACKAGE_SCRIPTS = Object.freeze(["typecheck", "lint", "build"]);

function toPosix(path) {
  return path.split(sep).join("/");
}

/** Path relative to the root when possible, otherwise the absolute path. */
function displayPath(root, target) {
  const rel = relative(root, target);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? toPosix(rel) : target;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate));
}

/* -------------------------------------------------------------------------- */
/* Deterministic source parsing                                               */
/* -------------------------------------------------------------------------- */

const EXPORT_DECL_PATTERN = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_TYPE_PATTERN = /export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST_PATTERN = /export\s*\{([^}]*)\}/g;
const EXPORT_STAR_PATTERN = /export\s+\*\s+from\s+["']([^"']+)["']/g;

const IMPORT_FROM_PATTERN = /\bimport\s+(?:[^"'();]*?\s+from\s+)?["']([^"']+)["']/g;
const RE_EXPORT_FROM_PATTERN = /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
const CSS_IMPORT_PATTERN = /@import\s+(?:url\()?["']([^"']+)["']/g;

function matches(pattern, source) {
  const values = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match !== null) {
    values.push(match[1]);
    match = pattern.exec(source);
  }
  return values;
}

/** Collect the names a module exports plus any `export * from` specifiers. */
function collectExports(source) {
  const names = new Set();
  for (const name of matches(EXPORT_DECL_PATTERN, source)) names.add(name);
  for (const name of matches(EXPORT_TYPE_PATTERN, source)) names.add(name);
  for (const list of matches(EXPORT_LIST_PATTERN, source)) {
    for (const entry of list.split(",")) {
      for (const part of entry.split(/\s+as\s+/)) {
        const name = part.trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
  }
  return { names, starReexports: matches(EXPORT_STAR_PATTERN, source) };
}

/** All module/stylesheet specifiers referenced by a source file. */
function importSpecifiers(source) {
  return [
    ...matches(IMPORT_FROM_PATTERN, source),
    ...matches(RE_EXPORT_FROM_PATTERN, source),
    ...matches(CSS_IMPORT_PATTERN, source),
  ];
}

/** Strip a trailing JS/TS extension so module specifiers compare equal. */
function withoutExtension(path) {
  return path.replace(/\.(?:d\.)?(?:mjs|cjs|jsx|tsx|js|ts)$/, "");
}

/** Extract the object literal body following `marker` (string-aware). */
function extractObjectBody(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;
  const open = source.indexOf("{", markerIndex);
  if (open === -1) return null;
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

/** Keys declared at the top level of an object body. */
function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && /[A-Za-z_$]/.test(char)) {
      const match = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(index));
      if (match) {
        keys.push(match[1]);
        index += match[0].length - 1;
      }
    }
  }
  return keys;
}

/** Recursively list files under `directory`. */
function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* -------------------------------------------------------------------------- */
/* Command execution                                                          */
/* -------------------------------------------------------------------------- */

/** Resolve the repository package manager binary from `packageManager`. */
function packageManagerBinary(root) {
  try {
    const pkg = readJsonFile(join(root, "package.json"));
    if (typeof pkg.packageManager === "string") {
      const name = pkg.packageManager.split("@")[0].trim();
      if (name) return name;
    }
  } catch {
    // Fall through to the repository default.
  }
  return "pnpm";
}

/**
 * Run a fixed command. Arguments are always literals supplied by this module,
 * never user input. On Windows the package-manager shim (`.cmd`) is invoked
 * through the command interpreter; elsewhere it is spawned directly.
 */
function runCommand({ command, args, cwd }) {
  if (process.platform === "win32") {
    const interpreter = process.env.ComSpec ?? "cmd.exe";
    return spawnSync(interpreter, ["/d", "/s", "/c", [command, ...args].join(" ")], {
      cwd,
      encoding: "utf8",
    });
  }
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function commandHint(result) {
  const text = result.stderr || result.stdout || "";
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ? ` ${line.slice(0, 200)}` : "";
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function createReporter() {
  const failures = [];
  const checks = [];
  const fail = (message) => failures.push(message);
  const check = (name, run) => {
    const before = failures.length;
    try {
      run();
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
    checks.push({ name, ok: failures.length === before });
  };
  return { failures, checks, fail, check };
}

/**
 * Read the raw manifest entries without validation, so a V1/missing contract
 * can be reported directly instead of surfacing as a generic normalization
 * error.
 */
function readRawManifestEntries(manifestPath) {
  try {
    if (!existsSync(manifestPath)) return [];
    const raw = readJsonFile(manifestPath);
    return isPlainObject(raw) && Array.isArray(raw.designSystems) ? raw.designSystems : [];
  } catch {
    return [];
  }
}

function findUnsupportedContractEntry(manifestPath) {
  for (const entry of readRawManifestEntries(manifestPath)) {
    if (!isPlainObject(entry)) continue;
    if (entry.contract !== "v2") {
      return {
        id: typeof entry.id === "string" ? entry.id : "(unknown)",
        contract: entry.contract,
      };
    }
  }
  return null;
}

function unsupportedContractMessage(context, id, contract) {
  const shown = contract === undefined ? "(missing)" : JSON.stringify(contract);
  return (
    `Manifest entry "${id}" has contract ${shown}; V2 tooling requires contract "v2" and ` +
    `no longer supports V1. Migrate the package to the V2 contract, then set ` +
    `"contract": "v2" for "${id}" in ${displayPath(context.root, context.manifestPath)} ` +
    `(for example by re-running "pnpm ds:register ${id}").`
  );
}

function validateManifestEntry(context, fail) {
  let manifest;
  try {
    manifest = readManifest({ manifestPath: context.manifestPath });
  } catch (error) {
    const unsupported = findUnsupportedContractEntry(context.manifestPath);
    if (unsupported) {
      fail(unsupportedContractMessage(context, unsupported.id, unsupported.contract));
    } else {
      fail(`Invalid design-system manifest: ${error.message}`);
    }
    return;
  }
  context.manifest = manifest;

  const entry = manifest.designSystems.find((system) => system.id === context.id);
  if (!entry) {
    fail(
      `Manifest entry missing for "${context.id}" in ${displayPath(
        context.root,
        context.manifestPath,
      )}. Run "pnpm ds:register ${context.id}" or "pnpm ds:create ${context.id}" first.`,
    );
    return;
  }
  if (entry.contract !== "v2") {
    fail(unsupportedContractMessage(context, entry.id, entry.contract));
    return;
  }
  context.entry = entry;
  context.contract = "v2";
  context.requiredComponents = V2_REQUIRED_COMPONENTS;

  const canonical = {
    packageName: context.packageName,
    packagePath: `${PACKAGE_DIRECTORY}/${context.id}`,
    uiClass: context.uiClass,
    tokensExport: context.tokensExport,
  };
  for (const [field, expected] of Object.entries(canonical)) {
    if (entry[field] !== expected) {
      fail(
        `Manifest ${field} "${entry[field]}" is not canonical for "${context.id}" (expected "${expected}").`,
      );
    }
  }
}

function validatePackageMetadata(context, fail) {
  if (!context.entry) return;
  let metadata;
  try {
    metadata = readPackageMetadata({ id: context.id, root: context.root });
  } catch (error) {
    fail(`Package metadata: ${error.message}`);
    return;
  }
  context.packageDir = metadata.packageDir;
  context.packageJsonPath = join(metadata.packageDir, "package.json");
  context.prismSystem = metadata.prismSystem;
  try {
    context.pkg = readJsonFile(context.packageJsonPath);
  } catch (error) {
    fail(`Invalid package.json: ${error.message}`);
    return;
  }

  if (metadata.packageName !== context.entry.packageName) {
    fail(
      `Package name "${metadata.packageName}" does not match manifest "${context.entry.packageName}".`,
    );
  }
  const actualPath = toPosix(relative(context.root, metadata.packageDir));
  if (actualPath !== context.entry.packagePath) {
    fail(`Package path "${actualPath}" does not match manifest "${context.entry.packagePath}".`);
  }
}

function validateRequiredFiles(context, fail) {
  if (!context.packageDir) return;
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(context.packageDir, file))) fail(`Missing required file: ${file}`);
  }
  if (!firstExisting(COMPONENT_MODULE_CANDIDATES.map((file) => join(context.packageDir, file)))) {
    fail(`Missing required file: ${COMPONENT_MODULE_CANDIDATES[0]}`);
  }
  // The normalized design brief is a required V2 artifact for every package.
  if (!existsSync(join(context.packageDir, "design-brief.json"))) {
    fail("Missing required file: design-brief.json");
  }
}

function validateNamingAndExports(context, fail) {
  if (!context.pkg) return;
  const exportsField = context.pkg.exports;
  if (!isPlainObject(exportsField)) {
    fail('package.json is missing an "exports" map.');
    return;
  }
  for (const key of [".", "./styles.css", "./tokens"]) {
    if (!(key in exportsField)) fail(`package.json exports is missing "${key}".`);
  }
}

function validateContractMetadata(context, fail) {
  if (!context.packageDir) return;
  const metadata = context.prismSystem;

  if (!metadata) {
    fail('V2 package is missing the "prismSystem" block in package.json.');
  } else {
    if (metadata.contract !== "v2") {
      fail(
        `V2 package "prismSystem.contract" is ${JSON.stringify(
          metadata.contract ?? null,
        )} but must be "v2". V1 is no longer supported.`,
      );
    }
    if (metadata.uiClass !== context.entry.uiClass) {
      fail(
        `V2 package "prismSystem.uiClass" "${metadata.uiClass ?? "(missing)"}" does not match manifest "${context.entry.uiClass}".`,
      );
    }
    if (metadata.tokensExport !== context.entry.tokensExport) {
      fail(
        `V2 package "prismSystem.tokensExport" "${metadata.tokensExport ?? "(missing)"}" does not match manifest "${context.entry.tokensExport}".`,
      );
    }
    if (metadata.name !== context.entry.name) {
      fail(
        `V2 package "prismSystem.name" "${metadata.name ?? "(missing)"}" does not match manifest "${context.entry.name}".`,
      );
    }
  }

  const indexPath = join(context.packageDir, "src/index.ts");
  if (!existsSync(indexPath)) return;
  const source = readFileSync(indexPath, "utf8");
  if (!source.includes("defineDesignSystemV2")) {
    fail("V2 package src/index.ts must use defineDesignSystemV2.");
  }
  if (!/componentContract\s*:\s*["']v2["']/.test(source)) {
    fail('V2 package src/index.ts must declare componentContract: "v2".');
  }
}

function validateComponentExports(context, fail) {
  if (!context.packageDir) return;
  const componentsPath = firstExisting(
    COMPONENT_MODULE_CANDIDATES.map((file) => join(context.packageDir, file)),
  );
  if (!componentsPath) return;

  const componentExports = collectExports(readFileSync(componentsPath, "utf8"));
  for (const name of context.requiredComponents) {
    if (!componentExports.names.has(name)) fail(`Missing required component: ${name}`);
  }

  const indexPath = join(context.packageDir, "src/index.ts");
  if (!existsSync(indexPath)) return;
  const indexExports = collectExports(readFileSync(indexPath, "utf8"));
  const target = withoutExtension(componentsPath);
  const reexportsComponents = indexExports.starReexports.some(
    (specifier) => withoutExtension(resolve(dirname(indexPath), specifier)) === target,
  );
  if (reexportsComponents) return;
  for (const name of context.requiredComponents) {
    if (!indexExports.names.has(name)) {
      fail(`Package public exports are missing required component: ${name}`);
    }
  }
}

function validateTokensAndTheme(context, fail) {
  if (!context.packageDir) return;

  const tokensPath = join(context.packageDir, "src/tokens/index.ts");
  if (existsSync(tokensPath)) {
    const source = readFileSync(tokensPath, "utf8");
    const exportPattern = new RegExp(`export\\s+const\\s+${escapeRegExp(context.tokensExport)}\\b`);
    if (!exportPattern.test(source)) {
      fail(`Token module does not export "${context.tokensExport}".`);
    } else {
      const body = extractObjectBody(source, `export const ${context.tokensExport}`);
      if (body === null) {
        fail(`Token export "${context.tokensExport}" must be an object literal.`);
      } else {
        const keys = topLevelKeys(body);
        for (const group of REQUIRED_TOKEN_GROUPS) {
          if (!keys.includes(group)) {
            fail(`Token export "${context.tokensExport}" is missing the "${group}" group.`);
          }
        }
      }
    }
  }

  const stylesPath = join(context.packageDir, "src/styles/index.css");
  if (existsSync(stylesPath)) {
    const css = readFileSync(stylesPath, "utf8");
    if (!css.includes(`.${context.uiClass}`)) {
      fail(`Stylesheet does not scope rules under ".${context.uiClass}".`);
    }
  }

  const componentsPath = firstExisting(
    COMPONENT_MODULE_CANDIDATES.map((file) => join(context.packageDir, file)),
  );
  if (componentsPath) {
    const source = readFileSync(componentsPath, "utf8");
    if (!source.includes(context.uiClass)) {
      fail(`Components do not apply the scoped UI class "${context.uiClass}".`);
    }
  }
}

function validatePackageBoundaries(context, fail) {
  if (!context.packageDir) return;
  const srcDir = join(context.packageDir, "src");
  if (!existsSync(srcDir)) return;

  const sourceFiles = walkFiles(srcDir).filter((file) => /\.(?:ts|tsx|css|mjs|js)$/.test(file));
  for (const file of sourceFiles) {
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith("@prism-system/ui-system-") && specifier !== context.packageName) {
        fail(`Cross-package import "${specifier}" in ${displayPath(context.root, file)}.`);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const resolved = relative(context.packageDir, resolve(dirname(file), specifier));
      if (resolved.startsWith("..") || isAbsolute(resolved)) {
        fail(
          `Relative import escapes the package: "${specifier}" in ${displayPath(context.root, file)}.`,
        );
      }
    }
  }
}

function validateDesignBrief(context, fail) {
  if (!context.packageDir) return;
  const briefPath = join(context.packageDir, "design-brief.json");
  if (!existsSync(briefPath)) return;
  let brief;
  try {
    brief = readJsonFile(briefPath);
  } catch (error) {
    fail(`Invalid design-brief.json: ${error.message}`);
    return;
  }
  if (!isPlainObject(brief)) fail("design-brief.json must be a JSON object.");
}

function validateDocumentation(context, fail) {
  if (!context.packageDir) return;

  const readmePath = join(context.packageDir, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    if (readme.trim().length === 0) fail("README.md is empty.");
    if (!readme.includes(context.packageName)) {
      fail(`README.md does not mention the package name "${context.packageName}".`);
    }
    const missing = context.requiredComponents.filter(
      (name) => !new RegExp(`\\b${escapeRegExp(name)}\\b`).test(readme),
    );
    if (missing.length > 0) {
      fail(`README.md does not list required component(s): ${missing.join(", ")}.`);
    }
    if (!/installation|pnpm add/i.test(readme)) {
      fail("README.md is missing installation guidance.");
    }
    if (!/design brief|visual direction/i.test(readme)) {
      fail("README.md is missing the design brief / visual direction.");
    }
  }

  const agentsPath = join(context.packageDir, "AGENTS.md");
  if (existsSync(agentsPath)) {
    const agents = readFileSync(agentsPath, "utf8");
    if (agents.trim().length === 0) fail("AGENTS.md is empty.");
    if (!agents.includes(context.packageName) && !agents.includes(context.entry.name)) {
      fail(`AGENTS.md does not mention "${context.entry.name}" or "${context.packageName}".`);
    }
    const missing = context.requiredComponents.filter(
      (name) => !new RegExp(`\\b${escapeRegExp(name)}\\b`).test(agents),
    );
    if (missing.length > 0) {
      fail(`AGENTS.md does not list required component(s): ${missing.join(", ")}.`);
    }
    if (!/extension|extend|additive/i.test(agents)) {
      fail("AGENTS.md is missing extension guidance.");
    }
    if (!/visual direction|design brief/i.test(agents)) {
      fail("AGENTS.md is missing the visual direction.");
    }
  }
}

function validateApp(context, appName, fail) {
  const appDir = join(context.root, "apps", appName);
  if (!existsSync(appDir)) {
    fail(
      `App integration: "${appName}" app is missing at ${displayPath(
        context.root,
        appDir,
      )}; cannot verify compatibility in an isolated root.`,
    );
    return;
  }

  const registryPath = join(appDir, "app", "registry.ts");
  const layoutPath = join(appDir, "app", "layout.tsx");
  const packageJsonPath = join(appDir, "package.json");
  const nextConfigPath = join(appDir, "next.config.mjs");

  for (const [label, file] of [
    ["registry", registryPath],
    ["layout", layoutPath],
    ["package.json", packageJsonPath],
    ["next.config.mjs", nextConfigPath],
  ]) {
    if (!existsSync(file)) {
      fail(`App integration: ${appName} ${label} not found at ${displayPath(context.root, file)}.`);
    }
  }

  if (existsSync(registryPath)) {
    const source = readFileSync(registryPath, "utf8");
    if (!source.includes(context.packageName)) {
      fail(`App integration: ${appName} registry does not import "${context.packageName}".`);
    }
    if (!source.includes(context.entry.tokensExport)) {
      fail(
        `App integration: ${appName} registry does not reference token export "${context.entry.tokensExport}".`,
      );
    }
    if (!source.includes(context.entry.uiClass)) {
      fail(
        `App integration: ${appName} registry does not use ui class "${context.entry.uiClass}".`,
      );
    }
  }

  if (existsSync(layoutPath)) {
    const source = readFileSync(layoutPath, "utf8");
    if (!source.includes(`${context.packageName}/styles.css`)) {
      fail(
        `App integration: ${appName} layout does not import "${context.packageName}/styles.css".`,
      );
    }
  }

  if (existsSync(packageJsonPath)) {
    let appPkg;
    try {
      appPkg = readJsonFile(packageJsonPath);
    } catch (error) {
      fail(
        `App integration: invalid ${displayPath(context.root, packageJsonPath)}: ${error.message}`,
      );
    }
    if (appPkg) {
      const dependencies = { ...appPkg.dependencies, ...appPkg.devDependencies };
      if (!(context.packageName in dependencies)) {
        fail(
          `App integration: ${appName} package.json is missing dependency "${context.packageName}".`,
        );
      }
    }
  }

  if (existsSync(nextConfigPath)) {
    const source = readFileSync(nextConfigPath, "utf8");
    if (!source.includes(context.packageName)) {
      fail(
        `App integration: ${appName} next.config.mjs is missing "${context.packageName}" in transpilePackages.`,
      );
    }
  }
}

function runPackageCommands(context, binary, fail) {
  if (!context.packageDir || !context.pkg) return;
  const scripts = context.pkg.scripts ?? {};
  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    if (typeof scripts[script] !== "string") {
      fail(`Package is missing the "${script}" script in package.json.`);
      continue;
    }
    const result = runCommand({
      command: binary,
      args: ["--filter", context.packageName, script],
      cwd: context.root,
    });
    if (result.error) {
      fail(`Package ${script} could not start: ${result.error.message}`);
    } else if (result.status !== 0) {
      fail(`Package ${script} failed (exit ${result.status ?? "unknown"}).${commandHint(result)}`);
    }
  }
}

function appCommandScript(scripts) {
  return ["typecheck", "lint", "build"].find((name) => typeof scripts[name] === "string");
}

function runAppCommands(context, binary, fail) {
  for (const appName of APP_NAMES) {
    const packageJsonPath = join(context.root, "apps", appName, "package.json");
    if (!existsSync(packageJsonPath)) continue;
    let appPkg;
    try {
      appPkg = readJsonFile(packageJsonPath);
    } catch {
      continue;
    }
    const script = appCommandScript(appPkg.scripts ?? {});
    if (!script || typeof appPkg.name !== "string") {
      fail(`App integration: ${appName} has no typecheck/lint/build script to run.`);
      continue;
    }
    const result = runCommand({
      command: binary,
      args: ["--filter", appPkg.name, script],
      cwd: context.root,
    });
    if (result.error) {
      fail(`App ${appName} ${script} could not start: ${result.error.message}`);
    } else if (result.status !== 0) {
      fail(
        `App ${appName} ${script} failed (exit ${result.status ?? "unknown"}).${commandHint(result)}`,
      );
    }
  }
}

/**
 * Validate one registered design system.
 *
 * @param {object} options
 * @param {string} options.id            Lower-kebab-case system id.
 * @param {string} [options.root]        Root holding packages/, config/, and apps/ (defaults to repo root).
 * @param {boolean} [options.runCommands] Run package/app scripts (default true).
 * @returns {{ id: string, ok: boolean, failures: string[], checks: { name: string, ok: boolean }[] }}
 */
export function validateDesignSystem(options = {}) {
  const { failures, checks, fail, check } = createReporter();
  const root = resolve(options.root ?? repoRoot());
  const runCommands = options.runCommands ?? true;

  let id;
  try {
    id = assertSystemId(options.id);
  } catch (error) {
    fail(error.message);
    return { id: options.id, ok: false, failures, checks };
  }

  const context = {
    id,
    root,
    manifestPath: join(root, MANIFEST_RELATIVE_PATH),
    manifest: null,
    entry: null,
    contract: null,
    requiredComponents: null,
    packageDir: null,
    packageJsonPath: null,
    pkg: null,
    prismSystem: null,
    packageName: toPackageName(id),
    uiClass: toUiClass(id),
    tokensExport: toTokensExport(id),
  };

  check("manifest entry", () => validateManifestEntry(context, fail));
  check("package metadata", () => validatePackageMetadata(context, fail));
  check("required package files", () => validateRequiredFiles(context, fail));
  check("package naming and exports", () => validateNamingAndExports(context, fail));
  check("contract and V2 metadata", () => validateContractMetadata(context, fail));
  check("required component exports", () => validateComponentExports(context, fail));
  check("tokens and theme", () => validateTokensAndTheme(context, fail));
  check("package boundaries", () => validatePackageBoundaries(context, fail));
  check("design brief", () => validateDesignBrief(context, fail));
  check("documentation", () => validateDocumentation(context, fail));
  check("app registration", () => {
    if (!context.entry) return;
    for (const appName of APP_NAMES) validateApp(context, appName, fail);
  });

  if (runCommands) {
    const binary = packageManagerBinary(root);
    check("package commands", () => runPackageCommands(context, binary, fail));
    check("app commands", () => runAppCommands(context, binary, fail));
  }

  const uniqueFailures = [...new Set(failures)];
  return { id, ok: uniqueFailures.length === 0, failures: uniqueFailures, checks };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

/** Render the CLI help text. */
export function helpText() {
  return [
    "Usage: pnpm ds:check <id> [options]",
    "",
    "Validate a registered design system package, its docs and tokens, and its",
    "Showcase / Reference App integration. Never mutates the manifest or package.",
    "",
    "Arguments:",
    "  <id>                  Lower-kebab-case system id (e.g. pulse).",
    "",
    "Options:",
    "  --root <path>         Root holding packages/, config/, and apps/ (default: repo root).",
    "  --no-commands         Skip typecheck/lint/build and app script runs.",
    "  -h, --help            Show this help.",
    "",
    "Exit code is non-zero when any check fails.",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { id: undefined, root: undefined, noCommands: false, help: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-commands") {
      options.noCommands = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      let value;
      if (equals !== -1) {
        value = arg.slice(equals + 1);
      } else {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (key === "root") options.root = value;
      else throw new Error(`Unknown option: --${key}`);
      continue;
    }
    positionals.push(arg);
  }
  if (positionals.length > 1) {
    throw new Error(`Expected a single <id>, received: ${positionals.join(", ")}.`);
  }
  options.id = positionals[0];
  return options;
}

function reportResult(result) {
  if (result.ok) {
    process.stdout.write(`Design System validation passed: ${result.id}\n`);
    for (const check of result.checks) process.stdout.write(`  ✓ ${check.name}\n`);
    process.stdout.write(`  ${result.checks.length} check(s) passed.\n`);
    return;
  }
  process.stdout.write("Design System validation failed\n\n");
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write(`\n${result.failures.length} issue(s) found.\n`);
  process.exitCode = 1;
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (!options.id) {
    process.stderr.write(`Missing required <id>.\n\n${helpText()}`);
    process.exitCode = 1;
    return;
  }

  try {
    reportResult(
      validateDesignSystem({
        id: options.id,
        root: options.root,
        runCommands: !options.noCommands,
      }),
    );
  } catch (error) {
    process.stdout.write(`Design System validation failed\n\n  ${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
