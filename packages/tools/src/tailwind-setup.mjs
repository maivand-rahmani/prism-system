/**
 * `prism-ds setup-tailwind` — offline Tailwind v4 setup for a consumer.
 *
 * This is the reusable implementation behind the future `setup-tailwind` CLI
 * command. It is strictly offline and built-in-only:
 *
 *   - it never installs Tailwind or the design system and never edits
 *     dependencies;
 *   - it never runs a package script and never makes a network call;
 *   - it edits exactly one explicitly named CSS file inside the consumer root
 *     and refuses any path that resolves outside that root (traversal or a
 *     symlink/junction escape);
 *   - a dry run never writes.
 *
 * Setup requires a *connected or uniquely identified* installed design
 * system. Discovery reuses the published consumer contract (explicit
 * `.design-system/config.json`, then `package.json` `designSystem` metadata,
 * then a single supported `@prism-system/ui-*` dependency); anything ambiguous
 * fails closed. The installed package is resolved through Node package
 * resolution from the consumer root and read only through its public `exports`
 * (never package internals).
 *
 * It then verifies, without running anything:
 *
 *   1. the installed design system manifest is current (`contractVersion: 4`,
 *      `schemaVersion: 4`) with exact identity/version equality;
 *   2. the installed `tailwindcss` is major v4 (read from its `package.json`);
 *   3. the package's `./tailwind.css` and `./styles.css` public export targets
 *      are plain relative strings that exist on disk and stay inside the
 *      package directory.
 *
 * Finally it makes the target CSS file load, in order:
 *
 *   @import "tailwindcss";
 *   @import "<package>/tailwind.css";
 *   @import "<package>/styles.css";
 *
 * All other CSS and imports are preserved byte-for-byte, the managed imports
 * are normalized into one contiguous block, a conflicting second design-system
 * bridge fails closed, and re-running is byte-stable.
 */

import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  PACKAGE_SCOPE,
  assertWithin,
  readJsonFile,
} from "./constants.mjs";
import {
  discoverConsumerPackage,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
} from "./consumer.mjs";

/** Installed package whose major version gates the Tailwind v4 bridge. */
export const TAILWIND_PACKAGE = "tailwindcss";
/** The Tailwind v4 stylesheet entry point the consumer imports first. */
export const TAILWIND_IMPORT_SPECIFIER = "tailwindcss";
/** Public subpath a design system exposes its Tailwind bridge on. */
export const TAILWIND_EXPORT_SUBPATH = "./tailwind.css";
/** Public subpath a design system exposes its ordinary stylesheet on. */
export const STYLES_EXPORT_SUBPATH = "./styles.css";
/** Required Tailwind CSS major version. */
export const TAILWIND_MIN_MAJOR = 4;

/** A supported `@prism-system/ui-<id>/{tailwind,styles}.css` bridge import. */
const BRIDGE_SPECIFIER_PATTERN = new RegExp(
  `^${PACKAGE_SCOPE}([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/(tailwind|styles)\\.css$`,
);

/** A single, pure `@import "<specifier>";` (or `url(...)`) line. */
const IMPORT_STATEMENT_PATTERN = /^\s*@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')\s*\)?\s*;\s*$/;

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Split text into lines, keeping each line's original terminator. */
function splitLines(text) {
  if (text.length === 0) return [];
  const parts = text.split(/(?<=\n)/);
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function stripTerminator(line) {
  return line.replace(/\r?\n$/, "");
}

/** The import specifier of a pure `@import` line, or null. */
function importSpecifierOf(line) {
  const match = IMPORT_STATEMENT_PATTERN.exec(line);
  if (match === null) return null;
  return match[1] ?? match[2];
}

/** The supported design-system package a bridge specifier belongs to, or null. */
function bridgePackageOf(specifier) {
  const match = BRIDGE_SPECIFIER_PATTERN.exec(specifier);
  if (match === null) return null;
  return `${PACKAGE_SCOPE}${match[1]}`;
}

/**
 * Merge the three managed bridge imports into existing CSS text.
 *
 * Managed imports (`tailwindcss`, `<package>/tailwind.css`, and
 * `<package>/styles.css`) are removed wherever they appear and re-emitted as a
 * single contiguous block, in order, at the position of the earliest managed
 * import. When none exist yet, the block is placed before the first existing
 * `@import` (or at the top of the file when there are no imports). Every other
 * line is preserved exactly, including its original line terminator.
 *
 * @param {string} existing CSS source.
 * @param {{ packageName: string }} options
 * @returns {string} The merged CSS source.
 */
export function mergeBridgeImports(existing, { packageName } = {}) {
  if (typeof existing !== "string") {
    throw new Error("mergeBridgeImports requires the existing CSS source as a string.");
  }
  if (typeof packageName !== "string" || packageName.trim().length === 0) {
    throw new Error("mergeBridgeImports requires a non-empty design system package name.");
  }
  const managed = [
    TAILWIND_IMPORT_SPECIFIER,
    `${packageName}/tailwind.css`,
    `${packageName}/styles.css`,
  ];
  const managedSet = new Set(managed);

  const lines = splitLines(existing);
  const remove = new Set();
  let insertAt = -1;
  let firstImportAt = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const specifier = importSpecifierOf(stripTerminator(lines[index]));
    if (specifier === null) continue;
    if (firstImportAt === -1) firstImportAt = index;
    if (managedSet.has(specifier)) {
      if (insertAt === -1) insertAt = index;
      remove.add(index);
      continue;
    }
    const bridgePackage = bridgePackageOf(specifier);
    if (bridgePackage !== null && bridgePackage !== packageName) {
      throw new Error(
        `CSS file already imports the design-system bridge "${specifier}" from ` +
          `"${bridgePackage}"; only one design-system bridge is supported per build. ` +
          `Remove it before running setup-tailwind for "${packageName}".`,
      );
    }
  }

  if (insertAt === -1) insertAt = firstImportAt === -1 ? 0 : firstImportAt;

  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const block = managed.map((specifier) => `@import "${specifier}";${newline}`);

  const output = [];
  let inserted = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (index === insertAt) {
      output.push(...block);
      inserted = true;
    }
    if (remove.has(index)) continue;
    output.push(lines[index]);
  }
  if (!inserted) output.push(...block);
  return output.join("");
}

/** Walk up from a resolved entry to the nearest `package.json` with this name. */
function findPackageJsonUpward(startDir, packageName) {
  let current = resolve(startDir);
  for (;;) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) {
      let json = null;
      try {
        json = readJsonFile(candidate);
      } catch {
        json = null;
      }
      if (json !== null && json.name === packageName) {
        return { dir: current, path: candidate, json };
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve an installed package through Node package resolution from the
 * consumer root and read its `package.json` only. Never runs scripts and never
 * touches the network.
 */
function resolveInstalledPackage({ consumerRoot, packageName }) {
  const requireFromConsumer = createRequire(join(consumerRoot, "package.json"));

  let packageJsonPath = null;
  try {
    packageJsonPath = requireFromConsumer.resolve(`${packageName}/package.json`);
  } catch {
    packageJsonPath = null;
  }
  if (packageJsonPath !== null) {
    let json;
    try {
      json = readJsonFile(packageJsonPath);
    } catch (error) {
      throw new Error(
        `Invalid installed "${packageName}" package.json ${packageJsonPath}: ${error.message}`,
      );
    }
    if (json?.name !== packageName) {
      throw new Error(
        `Installed package.json ${packageJsonPath} has name ${JSON.stringify(
          json?.name ?? null,
        )}; expected "${packageName}".`,
      );
    }
    return { dir: dirname(packageJsonPath), packageJsonPath, json };
  }

  let entryPath;
  try {
    entryPath = requireFromConsumer.resolve(packageName);
  } catch {
    throw new Error(
      `Package "${packageName}" is not installed in ${consumerRoot}; install it before ` +
        "running setup-tailwind (this command never installs).",
    );
  }
  const found = findPackageJsonUpward(dirname(entryPath), packageName);
  if (found === null) {
    throw new Error(`Installed "${packageName}" could not be located from its entry ${entryPath}.`);
  }
  return { dir: found.dir, packageJsonPath: found.path, json: found.json };
}

/** Require the installed Tailwind to be major v4, read from its package.json. */
function verifyInstalledTailwindV4({ consumerRoot }) {
  const installed = resolveInstalledPackage({
    consumerRoot,
    packageName: TAILWIND_PACKAGE,
  });
  const version = installed.json?.version;
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version.trim())) {
    throw new Error(
      `Installed "${TAILWIND_PACKAGE}" has an unrecognized version ${JSON.stringify(
        version ?? null,
      )}; expected Tailwind CSS v${TAILWIND_MIN_MAJOR}.`,
    );
  }
  const normalized = version.trim();
  const major = Number.parseInt(normalized.split(".")[0], 10);
  if (major !== TAILWIND_MIN_MAJOR) {
    throw new Error(
      `Installed "${TAILWIND_PACKAGE}" is v${normalized}; the design-system bridge ` +
        `requires Tailwind CSS v${TAILWIND_MIN_MAJOR}.`,
    );
  }
  return { dir: installed.dir, version: normalized };
}

/** Require exact identity/version equality for the installed system. */
function verifyInstalledSystem({ packageName, expectedVersion, installed }) {
  const failures = [];
  const installedVersion = installed.packageJson.version;
  if (typeof installedVersion !== "string" || installedVersion.trim().length === 0) {
    failures.push(`Installed "${packageName}" has no version.`);
  }
  const manifest = installed.manifest;
  if (!isPlainObject(manifest)) {
    failures.push(`Installed "${packageName}" has no readable public ./manifest object.`);
  } else {
    if (manifest.package !== packageName) {
      failures.push(
        `Shipped manifest package ${JSON.stringify(
          manifest.package ?? null,
        )} does not match "${packageName}".`,
      );
    }
    if (manifest.version !== installedVersion) {
      failures.push(
        `Shipped manifest version ${JSON.stringify(
          manifest.version ?? null,
        )} does not match installed version ${JSON.stringify(installedVersion ?? null)}.`,
      );
    }
    if (manifest.contractVersion !== CONTRACT_VERSION) {
      failures.push(
        `Shipped manifest contractVersion ${JSON.stringify(
          manifest.contractVersion ?? null,
        )} must be the numeric ${CONTRACT_VERSION}.`,
      );
    }
    if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      failures.push(
        `Shipped manifest schemaVersion ${JSON.stringify(
          manifest.schemaVersion ?? null,
        )} must be ${MANIFEST_SCHEMA_VERSION}.`,
      );
    }
  }
  if (
    expectedVersion !== null &&
    expectedVersion !== undefined &&
    expectedVersion !== installedVersion
  ) {
    failures.push(
      `Declared version ${JSON.stringify(expectedVersion)} does not match installed version ` +
        `${JSON.stringify(installedVersion ?? null)}.`,
    );
  }
  if (failures.length > 0) throw new Error(failures.join(" "));
  return { version: installedVersion };
}

/** Require the `./tailwind.css` and `./styles.css` export targets to exist. */
function verifyBridgeExports({ installed, packageName }) {
  const exportsField = installed.packageJson.exports;
  if (!isPlainObject(exportsField)) {
    throw new Error(
      `Installed "${packageName}" has no "exports" map; cannot verify the Tailwind bridge.`,
    );
  }
  const resolved = {};
  for (const subpath of [TAILWIND_EXPORT_SUBPATH, STYLES_EXPORT_SUBPATH]) {
    const target = exportsField[subpath];
    if (target === undefined) {
      throw new Error(
        `Installed "${packageName}" does not expose "${subpath}"; a design system must ` +
          "publish it.",
      );
    }
    if (typeof target !== "string" || target.trim().length === 0) {
      throw new Error(
        `Installed "${packageName}" exports["${subpath}"] must be a single relative string ` +
          "target; conditional or non-string targets are not supported.",
      );
    }
    const normalized = target.trim();
    if (!normalized.startsWith("./")) {
      throw new Error(
        `Installed "${packageName}" exports["${subpath}"] target "${normalized}" must be a ` +
          '"./"-relative path.',
      );
    }
    const targetPath = assertWithin(
      installed.packageDir,
      join(installed.packageDir, normalized),
      `Export target "${subpath}" for "${packageName}"`,
    );
    if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
      throw new Error(
        `Installed "${packageName}" exposes "${subpath}" -> "${normalized}", but that file ` +
          "does not exist.",
      );
    }
    resolved[subpath] = targetPath;
  }
  return resolved;
}

/** Write CSS atomically, re-asserting containment of both target and temp. */
function writeFileAtomic(containRoot, filePath, content) {
  assertWithin(containRoot, filePath, "CSS write path");
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  assertWithin(containRoot, tempPath, "CSS temp path");
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
 * Plan a Tailwind setup without writing anything. Throws on any discovery or
 * verification failure (ambiguous or missing system, current-manifest, Tailwind
 * Tailwind, missing export targets, an out-of-root CSS path, or a conflicting
 * second bridge).
 *
 * @returns {{
 *   consumerRoot: string,
 *   cssPath: string,
 *   packageName: string,
 *   version: string,
 *   tailwindVersion: string,
 *   bridge: Record<string, string>,
 *   before: string,
 *   after: string,
 *   changed: boolean,
 * }}
 */
export function planTailwindSetup({ cwd, cssPath } = {}) {
  const consumerRoot = resolveConsumerRoot({ cwd });

  if (typeof cssPath !== "string" || cssPath.trim().length === 0) {
    throw new Error(
      "setup-tailwind requires an explicit --css <file> path inside the consumer root.",
    );
  }
  const requested = cssPath.trim();
  // Containment is checked before any read or write, following symlinks and
  // junctions, so a traversal or an external symlink fails closed.
  const cssTarget = assertWithin(
    consumerRoot,
    isAbsolute(requested) ? resolve(requested) : join(consumerRoot, requested),
    "CSS file",
  );
  if (!existsSync(cssTarget)) {
    throw new Error(
      `CSS file does not exist: ${cssTarget}. setup-tailwind only edits an existing file ` +
        "inside --cwd.",
    );
  }
  if (!statSync(cssTarget).isFile()) {
    throw new Error(`CSS path is not a regular file: ${cssTarget}.`);
  }

  const discovered = discoverConsumerPackage({ consumerRoot });
  const installed = resolveInstalledDesignSystem({
    consumerRoot,
    packageName: discovered.packageName,
  });
  const { version } = verifyInstalledSystem({
    packageName: discovered.packageName,
    expectedVersion: discovered.expectedVersion,
    installed,
  });
  const bridge = verifyBridgeExports({ installed, packageName: discovered.packageName });
  const tailwind = verifyInstalledTailwindV4({ consumerRoot });

  const before = readFileSync(cssTarget, "utf8");
  const after = mergeBridgeImports(before, { packageName: discovered.packageName });

  return {
    consumerRoot,
    cssPath: cssTarget,
    packageName: discovered.packageName,
    version,
    tailwindVersion: tailwind.version,
    bridge,
    before,
    after,
    changed: before !== after,
  };
}

/**
 * Discover, verify, and (unless checking or dry-running) update exactly one CSS
 * file so the consumer loads the Tailwind v4 bridge in the required order.
 *
 * @param {{ cwd?: string, cssPath?: string, dryRun?: boolean }} [options]
 * @returns {{
 *   ok: boolean,
 *   changed: boolean,
 *   dryRun: boolean,
 *   failures: string[],
 *   plan: object | null,
 *   changes: { kind: string, path: string }[],
 * }}
 */
export function setupTailwind({ cwd, cssPath, dryRun = false } = {}) {
  let plan;
  try {
    plan = planTailwindSetup({ cwd, cssPath });
  } catch (error) {
    return {
      ok: false,
      changed: false,
      dryRun,
      failures: [error.message],
      plan: null,
      changes: [],
    };
  }

  const plannedChanges = plan.changed ? [{ kind: "css", path: plan.cssPath }] : [];

  if (dryRun) {
    return {
      ok: true,
      changed: false,
      dryRun: true,
      failures: [],
      plan,
      changes: plannedChanges,
    };
  }
  if (!plan.changed) {
    return {
      ok: true,
      changed: false,
      dryRun: false,
      failures: [],
      plan,
      changes: [],
    };
  }

  try {
    writeFileAtomic(plan.consumerRoot, plan.cssPath, plan.after);
  } catch (error) {
    return {
      ok: false,
      changed: false,
      dryRun: false,
      failures: [`Tailwind setup failed: ${error.message}`],
      plan,
      changes: [],
    };
  }

  return {
    ok: true,
    changed: true,
    dryRun: false,
    failures: [],
    plan,
    changes: [{ kind: "css", path: plan.cssPath }],
  };
}
