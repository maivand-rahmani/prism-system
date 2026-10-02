/**
 * Offline entry prerequisite selection and scanning.
 *
 * This module connects the strict manifest's `entrypoints` requirements and
 * `extensions` to what a consumer actually selects:
 *
 *   - `--with-entry <path-or-extension>` selects the requirements of one named
 *     extension, one declared entrypoint key, or one contained consumer source
 *     file whose exact target-package import specifiers select declared
 *     entrypoints (`@scope/ui-x`, `@scope/ui-x/motion`,
 *     `@scope/ui-x/custom/keyboard-scene`, ...). Every requirement of a selected
 *     entry is required, even when the engine is only reached indirectly; bare
 *     peer imports and undeclared nested subpaths select nothing;
 *   - `--peer name@exact-version` overrides a missing selected peer;
 *   - `--entry <path-or-extension>` (check/doctor) reports the same selected
 *     prerequisites with installed versions validated against the declared
 *     semver ranges. Without `--entry` the prerequisite scan is clearly skipped:
 *     these commands never scan a whole repository to guess entries.
 *
 * The scan is bounded and literal: only string `import` declarations, dynamic
 * `import("...")`, and `require("...")` calls are read from the selected file.
 * Computed or template expressions are reported as unscannable and ignored.
 * Installed package code is never executed, no network is used, and every path
 * stays contained in the consumer root or the exact installed package
 * directory (symlink escapes fail closed through {@link assertWithin}).
 *
 * TypeScript is a declared runtime dependency but is loaded lazily only when a
 * scan actually runs; importing this module never loads it.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  DEFAULT_ENTRYPOINT_KEYS,
  PACKAGE_NAME_PATTERN,
  assertWithin,
  readJsonFile,
} from "./constants.mjs";
import { detectManifestContract } from "./manifest.mjs";
import { exactSemverRange, isExactSemver, isValidSemverRange, satisfiesSemverRange } from "./semver.mjs";
import { resolveInstalledDesignSystem } from "./consumer.mjs";
import { getTypeScript } from "./usage.mjs";

/** Clear, stable limitation statement attached to every scan report. */
export const ENTRY_SCAN_LIMITATIONS =
  "Bounded literal scan: only string import declarations, dynamic import(), and require() " +
  "specifiers are read; computed/template expressions are ignored, and installed package " +
  "code is never executed.";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneRequirements(value) {
  if (!Array.isArray(value)) return [];
  return value.map((requirement) => ({
    name: requirement.name,
    kind: requirement.kind,
    range: requirement.range,
    optional: requirement.optional,
  }));
}

function importPathFor(packageName, entrypoint) {
  if (entrypoint === ".") return packageName;
  return `${packageName}${entrypoint.replace(/^\./, "")}`;
}

/**
 * Parse repeatable `--peer name@exact-version` values. Scoped names
 * (`@scope/name@1.2.3`) split on the last `@`; the name must be a safe npm
 * package name (rejecting whitespace, shell metacharacters, and injection) and
 * the version must be exact semver. Duplicate peer names fail closed.
 *
 * @returns {{ name: string, version: string }[]}
 */
export function parsePeerOverrides(values) {
  const list =
    values === undefined || values === null ? [] : Array.isArray(values) ? values : [values];
  const seen = new Set();
  const peers = [];
  for (const raw of list) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error("--peer requires a name@exact-version value.");
    }
    const text = raw.trim();
    const at = text.lastIndexOf("@");
    if (at <= 0 || at === text.length - 1) {
      throw new Error(
        `Invalid --peer ${JSON.stringify(raw)}; expected name@exact-version ` +
          "(for example three@0.186.1).",
      );
    }
    const name = text.slice(0, at);
    const version = text.slice(at + 1);
    if (!PACKAGE_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid --peer package name ${JSON.stringify(name)}.`);
    }
    if (!isExactSemver(version)) {
      throw new Error(
        `Invalid --peer version ${JSON.stringify(version)} for "${name}"; expected exact semver.`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate --peer for "${name}"; select one exact version.`);
    }
    seen.add(name);
    peers.push({ name, version });
  }
  return peers;
}

/**
 * Scan one source file for literal module specifiers. Lazy-loads TypeScript on
 * first use (never at module import), parses without executing, and only reads
 * string import/import()/require() arguments. Returns unique specifiers and the
 * truncated source of each ignored computed expression.
 *
 * @returns {{ specifiers: string[], unscannable: string[] }}
 */
export function scanLiteralModuleSpecifiers(sourceText, fileName = "entry.tsx") {
  const ts = getTypeScript();
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers = new Set();
  const unscannable = [];
  const describe = (node) => {
    const text = typeof node.getText === "function" ? node.getText(sourceFile) : "...";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) specifiers.add(specifier.text);
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const dynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(expression) && expression.text === "require";
      if ((dynamicImport || requireCall) && node.arguments.length > 0) {
        const first = node.arguments[0];
        if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
          specifiers.add(first.text);
        } else {
          unscannable.push(`${dynamicImport ? "import" : "require"}(${describe(first)})`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { specifiers: [...specifiers], unscannable };
}

/**
 * Resolve an installed package version through Node package resolution from the
 * consumer root, read-only and without executing package code. Missing packages
 * return `{ installed: false }`; this never throws for absence.
 *
 * @returns {{ installed: boolean, version: string | null, packageDir: string | null }}
 */
export function resolveInstalledPackageVersion({ consumerRoot, packageName } = {}) {
  if (typeof consumerRoot !== "string" || consumerRoot.trim() === "") {
    throw new Error("resolveInstalledPackageVersion requires an explicit consumer root.");
  }
  if (typeof packageName !== "string" || !PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new Error(`Invalid package name ${JSON.stringify(packageName ?? null)}.`);
  }
  const missing = { installed: false, version: null, packageDir: null };
  const requireFromConsumer = createRequire(join(consumerRoot, "package.json"));
  let packageJsonPath = null;
  try {
    packageJsonPath = requireFromConsumer.resolve(`${packageName}/package.json`);
  } catch {
    packageJsonPath = null;
  }
  if (packageJsonPath === null) {
    let entryPath = null;
    try {
      entryPath = requireFromConsumer.resolve(packageName);
    } catch {
      return missing;
    }
    let current = dirname(entryPath);
    for (;;) {
      const candidate = join(current, "package.json");
      if (existsSync(candidate)) {
        try {
          const json = readJsonFile(candidate);
          if (json?.name === packageName) {
            packageJsonPath = candidate;
            break;
          }
        } catch {
          // Continue walking; a malformed intermediate package.json is ignored.
        }
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    if (packageJsonPath === null) return missing;
  }
  let json;
  try {
    json = readJsonFile(packageJsonPath);
  } catch {
    return missing;
  }
  if (json?.name !== packageName) return missing;
  return {
    installed: true,
    version: typeof json.version === "string" ? json.version : null,
    packageDir: dirname(packageJsonPath),
  };
}

/** Normalize `--with-entry` values into a unique, non-empty, ordered list. */
function normalizeEntriesInput(values) {
  const list =
    values === undefined || values === null ? [] : Array.isArray(values) ? values : [values];
  const entries = [];
  for (const raw of list) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error("--with-entry/--entry requires a non-empty path or extension name.");
    }
    const text = raw.trim();
    if (!entries.includes(text)) entries.push(text);
  }
  return entries;
}

/** Merge requirement lists by name; conflicting declarations fail closed. */
function mergeRequirements(requirements) {
  const byName = new Map();
  for (const requirement of requirements) {
    const existing = byName.get(requirement.name);
    if (existing === undefined) {
      byName.set(requirement.name, requirement);
      continue;
    }
    if (
      existing.kind !== requirement.kind ||
      existing.range !== requirement.range ||
      existing.optional !== requirement.optional
    ) {
      throw new Error(
        `Conflicting requirements for "${requirement.name}" across the selected entries ` +
          `(${existing.range} vs ${requirement.range}).`,
      );
    }
  }
  return [...byName.values()];
}

/**
 * Scan a contained consumer source file and select the exact declared
 * entrypoints it imports.
 *
 * Selection is specifier-exact against the target package's real entrypoint
 * keys: `@scope/ui-x` selects `.`, `@scope/ui-x/tokens` selects `./tokens`,
 * `@scope/ui-x/motion` selects `./motion`, and
 * `@scope/ui-x/custom/keyboard-scene` selects `./custom/keyboard-scene`. Every
 * requirement of a selected entry is required, even when the consumer file
 * reaches the engine only indirectly (for example through a re-exported bundled
 * chunk). Undeclared nested subpaths, `importPath + "/"` prefix matches, and
 * unrelated bare peer imports never select anything.
 *
 * The path must resolve inside the consumer root; symlink escapes fail closed.
 */
export function scanConsumerEntryFile({ consumerRoot, manifest, entry } = {}) {
  const target = assertWithin(
    consumerRoot,
    isAbsolute(entry) ? resolve(entry) : join(consumerRoot, entry),
    `Entry file ${entry}`,
  );
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`Entry file does not exist or is not a regular file: ${target}.`);
  }
  const source = readFileSync(target, "utf8");
  const scan = scanLiteralModuleSpecifiers(source, target);
  const packageName = manifest.package;
  const extensions = isPlainObject(manifest?.extensions) ? manifest.extensions : {};
  const entrypoints = isPlainObject(manifest?.entrypoints) ? manifest.entrypoints : {};
  const entrypointBySpecifier = new Map();
  for (const key of Object.keys(entrypoints)) {
    entrypointBySpecifier.set(importPathFor(packageName, key), key);
  }
  const selectedEntrypoints = [];
  for (const specifier of scan.specifiers) {
    const key = entrypointBySpecifier.get(specifier);
    if (key !== undefined && !selectedEntrypoints.includes(key)) selectedEntrypoints.push(key);
  }
  const selectedExtensions = Object.entries(extensions)
    .filter(([, extension]) => selectedEntrypoints.includes(extension.entrypoint))
    .map(([name]) => name);
  const requirements = mergeRequirements(
    selectedEntrypoints.flatMap((key) => cloneRequirements(entrypoints[key]?.requirements)),
  );
  return {
    requested: entry,
    kind: "path",
    extension: selectedExtensions.length === 1 ? selectedExtensions[0] : null,
    entrypoint: selectedEntrypoints.length === 1 ? selectedEntrypoints[0] : null,
    selectedEntrypoints,
    selectedExtensions,
    file: target,
    source: "consumer",
    imports: scan.specifiers,
    unscannable: scan.unscannable,
    requirements,
  };
}

/**
 * Resolve `--with-entry` values against the target manifest into selections and
 * the merged requirement list. `--with-entry` values resolve as an extension
 * name first, then a declared entrypoint key, then a contained consumer file.
 */
export function resolveEntrySelection({ consumerRoot, manifest, entries } = {}) {
  if (!isPlainObject(manifest) || detectManifestContract(manifest) === null) {
    throw new Error("A current design-system manifest is required to select entries.");
  }
  const requested = normalizeEntriesInput(entries);
  const extensions = isPlainObject(manifest.extensions) ? manifest.extensions : {};
  const entrypoints = isPlainObject(manifest.entrypoints) ? manifest.entrypoints : {};
  const selections = [];
  for (const value of requested) {
    if (hasOwn(extensions, value)) {
      const extension = extensions[value];
      selections.push({
        requested: value,
        kind: "extension",
        extension: value,
        entrypoint: extension.entrypoint,
        selectedEntrypoints: [extension.entrypoint],
        selectedExtensions: [value],
        file: null,
        source: "manifest",
        imports: [],
        unscannable: [],
        requirements: cloneRequirements(entrypoints[extension.entrypoint]?.requirements),
      });
    } else if (hasOwn(entrypoints, value)) {
      selections.push({
        requested: value,
        kind: "entrypoint",
        extension: null,
        entrypoint: value,
        selectedEntrypoints: [value],
        selectedExtensions: [],
        file: null,
        source: "manifest",
        imports: [],
        unscannable: [],
        requirements: cloneRequirements(entrypoints[value]?.requirements),
      });
    } else {
      selections.push(scanConsumerEntryFile({ consumerRoot, manifest, entry: value }));
    }
  }
  if (selections.length === 0) {
    for (const key of DEFAULT_ENTRYPOINT_KEYS) {
      selections.push({
        requested: key,
        kind: "entrypoint",
        extension: null,
        entrypoint: key,
        selectedEntrypoints: [key],
        selectedExtensions: [],
        file: null,
        source: "default",
        imports: [],
        unscannable: [],
        requirements: cloneRequirements(entrypoints[key]?.requirements),
      });
    }
  }
  const requirements = mergeRequirements(selections.flatMap((selection) => selection.requirements));
  return { requested, entries: selections, requirements };
}

/**
 * Plan selected peer installs for `install`/`use`/`upgrade`:
 *
 *   - an installed version that satisfies the declared range is retained;
 *   - a satisfying `--peer` override is used when the peer is missing;
 *   - a missing peer with an exact declared range installs that exact version;
 *   - a missing peer with a non-exact range requires an exact `--peer` override.
 *
 * The returned plan never contains user-supplied package-manager arguments; the
 * caller appends `name@version` specs to the fixed command.
 */
export function planEntryAndPeers({
  consumerRoot,
  packageName,
  manifest,
  entries,
  peerSpecs,
} = {}) {
  const selection = resolveEntrySelection({ consumerRoot, manifest, entries });
  const overrides = parsePeerOverrides(peerSpecs);
  const byName = new Map(selection.requirements.map((requirement) => [requirement.name, requirement]));
  for (const override of overrides) {
    const requirement = byName.get(override.name);
    if (requirement === undefined) {
      throw new Error(
        `--peer "${override.name}@${override.version}" is not a declared requirement of the ` +
          `selected entries (${packageName}).`,
      );
    }
    if (requirement.kind !== "peer") {
      throw new Error(
        `--peer "${override.name}@${override.version}" targets a declared "dependency" ` +
          "requirement; --peer only overrides declared peer requirements.",
      );
    }
    if (!isValidSemverRange(requirement.range)) {
      throw new Error(
        `--peer "${override.name}@${override.version}" cannot be validated: the selected entry ` +
          `declares the non-semver range ${JSON.stringify(requirement.range)}; this fails closed.`,
      );
    }
    if (!satisfiesSemverRange(override.version, requirement.range)) {
      throw new Error(
        `--peer "${override.name}@${override.version}" does not satisfy the declared range ` +
          `"${requirement.range}".`,
      );
    }
  }
  const overrideByName = new Map(overrides.map((override) => [override.name, override]));
  const peers = [];
  for (const requirement of selection.requirements) {
    if (requirement.kind !== "peer") {
      const installed = resolveInstalledPackageVersion({
        consumerRoot,
        packageName: requirement.name,
      });
      peers.push({
        name: requirement.name,
        kind: requirement.kind,
        range: requirement.range,
        optional: requirement.optional,
        action: "transitive",
        version: null,
        installed: installed.version,
        source: "design-system-dependency",
      });
      continue;
    }
    const installed = resolveInstalledPackageVersion({
      consumerRoot,
      packageName: requirement.name,
    });
    if (!isValidSemverRange(requirement.range)) {
      throw new Error(
        `The selected entry requires peer "${requirement.name}" with the non-semver range ` +
          `${JSON.stringify(requirement.range)}; it cannot be validated semantically and fails ` +
          "closed (no peer install was planned).",
      );
    }
    const override = overrideByName.get(requirement.name) ?? null;
    let action;
    let version;
    let source;
    if (installed.version !== null && satisfiesSemverRange(installed.version, requirement.range)) {
      action = "retain";
      version = installed.version;
      source = "installed";
    } else if (override !== null) {
      action = "install";
      version = override.version;
      source = "override";
    } else {
      const exact = exactSemverRange(requirement.range);
      if (exact === null) {
        throw new Error(
          `The selected entry requires peer "${requirement.name}" (${requirement.range}) but it ` +
            `is not installed; pass --peer ${requirement.name}@<exact-version> to choose one.`,
        );
      }
      action = "install";
      version = exact;
      source = "exact-range";
    }
    peers.push({
      name: requirement.name,
      kind: requirement.kind,
      range: requirement.range,
      optional: requirement.optional,
      action,
      version,
      installed: installed.version,
      source,
    });
  }
  return { selection, peers };
}

/** True when the imported specifier belongs to the package name. */
function specifierUsesPackage(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

/**
 * Resolve a string/conditional-string export target. Prefers the runtime
 * conditions (`import`, `default`, `require`) before `types`.
 */
export function resolveExportTarget(value) {
  if (typeof value === "string") return value;
  if (!isPlainObject(value)) return null;
  for (const condition of ["import", "default", "require", "types", "node"]) {
    const target = value[condition];
    if (typeof target === "string") return target;
    if (isPlainObject(target)) {
      for (const nested of ["import", "default", "require", "types"]) {
        if (typeof target[nested] === "string") return target[nested];
      }
    }
  }
  return null;
}

/**
 * Resolve one installed entrypoint's artifact through the installed
 * `package.json` exports, verify it matches the shipped manifest export, and
 * scan it. Contained in the exact installed package directory; never executes.
 */
export function scanInstalledEntryArtifact({ installed, entrypoint } = {}) {
  if (!isPlainObject(installed?.packageJson) || !isPlainObject(installed?.manifest)) {
    throw new Error("An installed design-system package is required to scan an entrypoint.");
  }
  const manifestTarget = resolveExportTarget(installed.manifest.exports?.[entrypoint]);
  if (manifestTarget === null) {
    throw new Error(
      `Shipped manifest does not export the entrypoint ${JSON.stringify(entrypoint)}.`,
    );
  }
  const packageTarget = resolveExportTarget(installed.packageJson.exports?.[entrypoint]);
  if (packageTarget === null) {
    throw new Error(
      `Installed "${installed.packageJson.name}" does not export ${JSON.stringify(entrypoint)}.`,
    );
  }
  if (packageTarget !== manifestTarget) {
    throw new Error(
      `Installed "${installed.packageJson.name}" must expose ${JSON.stringify(entrypoint)} as ` +
        `the manifest target ${JSON.stringify(manifestTarget)} (received ` +
        `${JSON.stringify(packageTarget)}).`,
    );
  }
  const file = assertWithin(
    installed.packageDir,
    join(installed.packageDir, manifestTarget),
    `Entrypoint target for "${entrypoint}"`,
  );
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(
      `Entrypoint ${JSON.stringify(entrypoint)} -> ${JSON.stringify(manifestTarget)} is not a ` +
        "contained regular file.",
    );
  }
  const scan = scanLiteralModuleSpecifiers(readFileSync(file, "utf8"), file);
  return { file, imports: scan.specifiers, unscannable: scan.unscannable };
}

/**
 * Offline `check`/`doctor --entry` prerequisite report. Resolves the entry as an
 * extension, a declared entrypoint, or a contained consumer file; scans it
 * literally; and validates every declared requirement against the installed
 * peer version and the declared range. A declared requirement that is neither
 * imported nor installed is informational ("unused-missing"), not a failure.
 *
 * @returns {{ ok: boolean, failures: string[], report: object | null }}
 */
export function collectEntryPrerequisites({
  consumerRoot,
  packageName,
  manifest,
  installed = null,
  entry,
} = {}) {
  if (typeof entry !== "string" || entry.trim() === "") {
    return { ok: false, failures: ["--entry requires a path or extension name."], report: null };
  }
  const value = entry.trim();
  if (!isPlainObject(manifest) || detectManifestContract(manifest) === null) {
    return {
      ok: false,
      failures: ["The installed manifest is not the current schemaVersion 5/contractVersion 4."],
      report: null,
    };
  }
  const extensions = isPlainObject(manifest.extensions) ? manifest.extensions : {};
  const entrypoints = isPlainObject(manifest.entrypoints) ? manifest.entrypoints : {};

  let selection;
  try {
    if (hasOwn(extensions, value)) {
      selection = {
        kind: "extension",
        extension: value,
        entrypoint: extensions[value].entrypoint,
        file: null,
        source: "manifest",
        imports: [],
        unscannable: [],
        requirements: cloneRequirements(entrypoints[extensions[value].entrypoint]?.requirements),
      };
    } else if (hasOwn(entrypoints, value)) {
      selection = {
        kind: "entrypoint",
        extension: null,
        entrypoint: value,
        file: null,
        source: "manifest",
        imports: [],
        unscannable: [],
        requirements: cloneRequirements(entrypoints[value]?.requirements),
      };
    } else {
      selection = scanConsumerEntryFile({ consumerRoot, manifest, entry: value });
    }
  } catch (error) {
    return { ok: false, failures: [error.message], report: null };
  }

  if (selection.kind !== "path") {
    let resolved = installed;
    try {
      if (resolved === null) {
        resolved = resolveInstalledDesignSystem({ consumerRoot, packageName });
      }
      const artifact = scanInstalledEntryArtifact({
        installed: resolved,
        entrypoint: selection.entrypoint,
      });
      selection.file = artifact.file;
      selection.imports = artifact.imports;
      selection.unscannable = artifact.unscannable;
    } catch (error) {
      return {
        ok: false,
        failures: [error.message],
        report: {
          entry: value,
          kind: selection.kind,
          extension: selection.extension,
          entrypoint: selection.entrypoint,
          selectedEntrypoints: [
            ...(selection.selectedEntrypoints ??
              (selection.entrypoint === null ? [] : [selection.entrypoint])),
          ],
          selectedExtensions: [
            ...(selection.selectedExtensions ??
              (selection.extension === null ? [] : [selection.extension])),
          ],
          file: selection.file,
          source: selection.source,
          imports: selection.imports,
          unscannable: selection.unscannable,
          requirements: [],
          limitations: ENTRY_SCAN_LIMITATIONS,
        },
      };
    }
  }

  const requirements = selection.requirements.map((requirement) => {
    // Every requirement of a semantically selected entry is required. Selection
    // is exact (`--entry <extension|entrypoint>` or a consumer file importing an
    // exact target package specifier), so an engine reached only indirectly
    // (through a bundled chunk or re-export) is still a required prerequisite.
    // `imported` is the honest literal-scan diagnostic and never downgrades the
    // requirement to optional.
    const imported = selection.imports.some((specifier) =>
      specifierUsesPackage(specifier, requirement.name),
    );
    const installedPeer = resolveInstalledPackageVersion({
      consumerRoot,
      packageName: requirement.name,
    });
    const evaluable = isValidSemverRange(requirement.range);
    let status;
    if (!evaluable) {
      // The shipped schema copies the real package.json range verbatim, so a
      // non-semver range is valid manifest data. It can never be evaluated here.
      status = requirement.kind === "peer" ? "unevaluable-range" : "unchecked-range";
    } else if (installedPeer.version === null) {
      status = requirement.kind === "peer" ? "missing" : "missing-transitive";
    } else if (satisfiesSemverRange(installedPeer.version, requirement.range)) {
      status = "satisfied";
    } else {
      status = "out-of-range";
    }
    return {
      name: requirement.name,
      kind: requirement.kind,
      range: requirement.range,
      optional: requirement.optional,
      used: true,
      imported,
      installed: installedPeer.version,
      status,
    };
  });

  const failures = [];
  for (const requirement of requirements) {
    // Only peer requirements are consumer-actionable; dependency-kind
    // requirements are brought in by the design-system package itself and are
    // reported for information.
    if (requirement.kind !== "peer") continue;
    if (requirement.status === "missing") {
      failures.push(
        `Entry requires peer "${requirement.name}" (${requirement.range}) but it is not installed.`,
      );
    } else if (requirement.status === "out-of-range") {
      failures.push(
        `Installed "${requirement.name}" is ${JSON.stringify(
          requirement.installed,
        )}; the declared range is ${requirement.range}.`,
      );
    } else if (requirement.status === "unevaluable-range") {
      failures.push(
        `Entry peer "${requirement.name}" declares the non-semver range ` +
          `${JSON.stringify(requirement.range)}; it cannot be validated and fails closed.`,
      );
    }
  }

  const report = {
    entry: value,
    kind: selection.kind,
    extension: selection.extension,
    entrypoint: selection.entrypoint,
    selectedEntrypoints: [
      ...(selection.selectedEntrypoints ??
        (selection.entrypoint === null ? [] : [selection.entrypoint])),
    ],
    selectedExtensions: [
      ...(selection.selectedExtensions ?? (selection.extension === null ? [] : [selection.extension])),
    ],
    file: selection.file,
    source: selection.source,
    imports: selection.imports,
    unscannable: selection.unscannable,
    requirements,
    limitations: ENTRY_SCAN_LIMITATIONS,
  };
  return { ok: failures.length === 0, failures, report };
}

/**
 * Fail-closed post-install verification: every peer planned with
 * `action: "install"` must resolve to exactly the planned version.
 */
export function verifyPeerInstallations({ consumerRoot, peers } = {}) {
  const failures = [];
  for (const peer of Array.isArray(peers) ? peers : []) {
    if (peer.action !== "install") continue;
    const installed = resolveInstalledPackageVersion({ consumerRoot, packageName: peer.name });
    if (!installed.installed || installed.version !== peer.version) {
      failures.push(
        `Peer "${peer.name}@${peer.version}" was not verified after install (found ` +
          `${JSON.stringify(installed.version ?? null)}).`,
      );
    }
  }
  return failures;
}
