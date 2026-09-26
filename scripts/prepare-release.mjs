#!/usr/bin/env node
/**
 * Deterministic release preparation for a registered design-system package.
 *
 * This module is both a reusable library (`prepareRelease`) and a CLI
 * (`pnpm ds:release <id> --approved`). It prepares a release; it never versions,
 * publishes, or commits. Versioning and publishing stay with Changesets and
 * remain an explicit human decision.
 *
 * Guarantees:
 *   - Fail closed. Any validation, manifest, or pack failure returns a blocked
 *     result and a non-zero exit code.
 *   - Explicit `--approved` is required for any real preparation. Without it the
 *     tool refuses to run commands or write files.
 *   - Validation is performed by importing `validateDesignSystem` directly; CLI
 *     output is never parsed.
 *   - No Changesets versioning (`changeset version`) or publishing
 *     (`changeset publish`) is ever run from here.
 *   - The pack check writes its tarball to a temporary directory outside the
 *     package, inspects its contents (required files and the exact `./manifest`
 *     export target), and removes it in a `finally` block.
 *   - After `changeset version`, the mirrored versions (runtime
 *     `DesignSystem.version`, generated `design-system.json`, and the registry
 *     entry) are synchronized to the authoritative `package.json.version`
 *     before the fail-closed validation that gates build/pack.
 *
 * Dry-run semantics: `--dry-run` runs static validation only (no package/app
 * scripts), writes nothing, and reports the commands it would have run.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTRACT_VERSION,
  MANIFEST_RELATIVE_PATH,
  assertSystemId,
  assertWithin,
  readJsonFile,
  readManifest,
  readPackageMetadata,
  repoRoot,
} from "./register-design-system.mjs";
import { validateDesignSystem } from "./validate-design-system.mjs";
import {
  DESIGN_SYSTEM_BRIEF_FILENAME,
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  MANIFEST_EXPORT_SUBPATH,
  MANIFEST_EXPORT_TARGET,
  missingRequiredPackageFiles,
} from "./design-system-manifest.mjs";
import { syncDesignSystemVersions } from "./sync-design-system-versions.mjs";

/** Files every published tarball must contain (pnpm pack prefixes `package/`). */
export const REQUIRED_TARBALL_FILES = Object.freeze([
  "package/README.md",
  "package/AGENTS.md",
  `package/${DESIGN_SYSTEM_MANIFEST_FILENAME}`,
  `package/${DESIGN_SYSTEM_BRIEF_FILENAME}`,
  "package/LICENSE",
]);

/** Bumps accepted on the command line. */
export const RELEASE_BUMPS = Object.freeze(["major", "minor", "patch"]);

/** Relative strength of each bump: `major` outranks `minor`, which outranks `patch`. */
export const BUMP_PRECEDENCE = Object.freeze({ major: 3, minor: 2, patch: 1 });

/**
 * Exact next commands a human runs after preparation succeeds. `changeset
 * version` rewrites package.json, so the versions must be synchronized before
 * the package is built and published.
 */
export const NEXT_COMMANDS = Object.freeze([
  "pnpm version-packages",
  "pnpm ds:sync-versions",
  "pnpm build",
  "pnpm release",
]);

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function toPosixRelative(root, target) {
  return relative(root, target).split(sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Flatten whitespace and control characters so text is safe for one-line output. */
function flattenText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep a summary on a single, frontmatter-safe line. */
function sanitizeSummary(value) {
  const text = flattenText(value);
  if (text.length === 0) {
    throw new Error("Release summary must not be empty.");
  }
  // A line made only of dashes could be read as a frontmatter delimiter.
  return /^-{3,}/.test(text) ? `Release note: ${text}` : text;
}

function defaultSummary({ displayName, packageName, currentVersion }) {
  const label = `${displayName} (${packageName})`;
  return /^0\./.test(currentVersion)
    ? `First stable release of ${label}.`
    : `Release ${label} at the next version.`;
}

/** Parse `major.minor.patch` with an optional pre-release/build suffix. */
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(String(version).trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Compute the next version for an explicit bump. */
export function computeNextVersion(currentVersion, bump) {
  const parsed = parseVersion(currentVersion);
  if (!parsed) {
    throw new Error(`Cannot release "${currentVersion}": it is not a valid semantic version.`);
  }
  if (!RELEASE_BUMPS.includes(bump)) {
    throw new Error(`Invalid bump "${bump}". Expected one of: ${RELEASE_BUMPS.join(", ")}.`);
  }
  if (bump === "major") return `${parsed.major + 1}.0.0`;
  if (bump === "minor") return `${parsed.major}.${parsed.minor + 1}.0`;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

/**
 * Reduce one or more bumps to the highest effective bump (major > minor > patch).
 * Used when several existing Changesets reference the same package: they are all
 * reused and the strongest one determines the plan. Never downgrades an entry.
 */
export function aggregateBumps(bumps) {
  let highest = null;
  for (const bump of bumps) {
    if (!RELEASE_BUMPS.includes(bump)) {
      throw new Error(
        `Invalid changeset bump "${bump}". Expected one of: ${RELEASE_BUMPS.join(", ")}.`,
      );
    }
    if (highest === null || BUMP_PRECEDENCE[bump] > BUMP_PRECEDENCE[highest]) {
      highest = bump;
    }
  }
  return highest;
}

/** A package below 1.0.0 promotes to its first stable release on `major`. */
export function defaultBumpFor(currentVersion) {
  const parsed = parseVersion(currentVersion);
  if (!parsed) {
    throw new Error(`Cannot release "${currentVersion}": it is not a valid semantic version.`);
  }
  return parsed.major === 0 ? "major" : "patch";
}

/** Deterministic changeset body for one package. */
export function renderChangeset(packageName, bump, summary) {
  return ["---", `${JSON.stringify(packageName)}: ${bump}`, "---", "", summary, ""].join("\n");
}

/** Write a file through a temporary sibling so a failure never leaves a partial file. */
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

/* -------------------------------------------------------------------------- */
/* Changesets                                                                 */
/* -------------------------------------------------------------------------- */

/** Extract the YAML frontmatter body, or null when the file has none. */
function readFrontmatter(source) {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(normalized);
  return match ? match[1] : null;
}

/**
 * Find existing changesets that already name `packageName` in their frontmatter,
 * ignoring the Changesets README and non-markdown config. Returns them in
 * deterministic path order.
 */
export function findPackageChangesets(changesetDir, packageName) {
  if (!existsSync(changesetDir)) return [];
  const pattern = new RegExp(
    `^\\s*["']?${escapeRegExp(packageName)}["']?\\s*:\\s*(major|minor|patch)\\s*$`,
    "m",
  );
  const found = [];
  for (const entry of readdirSync(changesetDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    if (entry.name.toLowerCase() === "readme.md") continue;
    const filePath = join(changesetDir, entry.name);
    let source;
    try {
      source = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const frontmatter = readFrontmatter(source);
    if (frontmatter === null) continue;
    const match = pattern.exec(frontmatter);
    if (match) found.push({ path: filePath, bump: match[1] });
  }
  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return found;
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

function commandHint(result) {
  const text = result.stderr || result.stdout || "";
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ? ` ${line.slice(0, 200)}` : "";
}

/** Quote one argument for `cmd.exe`; empty and special-character values are quoted. */
function quoteWindowsArg(value) {
  const text = String(value);
  if (text.length === 0) return '""';
  if (!/[\s"&|<>^()%!]/.test(text)) return text;
  const escaped = text.replace(/"/g, '""').replace(/%/g, "%%");
  return `"${escaped}"`;
}

/**
 * Run a fixed command. Arguments are always literals supplied by this module,
 * never user free text; on Windows the package-manager shim is invoked through
 * `cmd.exe` with each argument quoted, elsewhere it is spawned directly.
 */
function runCommand({ command, args, cwd }) {
  if (process.platform === "win32") {
    const interpreter = process.env.ComSpec ?? "cmd.exe";
    const line = [command, ...args.map(quoteWindowsArg)].join(" ");
    return spawnSync(interpreter, ["/d", "/s", "/c", line], {
      cwd,
      encoding: "utf8",
      windowsVerbatimArguments: true,
    });
  }
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

/** Read one file's contents from a tarball without extracting it. */
function readTarballFile(tarballPath, entry) {
  const result = spawnSync("tar", ["-xzOf", tarballPath, entry], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout ?? null;
}

/**
 * Inspect a tarball with the system `tar`. Fails closed: when the tarball
 * cannot be read, or the shipped `./manifest` export target is not the exact
 * manifest file, the release is blocked rather than assumed good.
 */
export function inspectTarball(tarballPath) {
  const result = spawnSync("tar", ["-tzf", tarballPath], { encoding: "utf8" });
  if (result.error) {
    return { ok: false, detail: `could not inspect tarball: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { ok: false, detail: `could not inspect tarball: tar exited ${result.status}` };
  }
  const entries = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const missing = REQUIRED_TARBALL_FILES.filter((file) => !entries.includes(file));
  if (!entries.some((entry) => entry.startsWith("package/dist/"))) {
    missing.push("package/dist/*");
  }
  if (missing.length > 0) {
    return { ok: false, detail: `tarball is missing required entries: ${missing.join(", ")}` };
  }

  // The shipped manifest subpath must point at the shipped manifest file, not
  // merely exist. Read the packed package.json and verify the exact target.
  const packedPackageJson = readTarballFile(tarballPath, "package/package.json");
  if (packedPackageJson === null) {
    return { ok: false, detail: "could not read package/package.json from the tarball" };
  }
  let pkg;
  try {
    pkg = JSON.parse(packedPackageJson);
  } catch (error) {
    return { ok: false, detail: `invalid package/package.json in tarball: ${error.message}` };
  }
  const manifestTarget = pkg?.exports?.[MANIFEST_EXPORT_SUBPATH];
  if (manifestTarget !== MANIFEST_EXPORT_TARGET) {
    return {
      ok: false,
      detail:
        `tarball package.json exports["${MANIFEST_EXPORT_SUBPATH}"] must be exactly ` +
        `${JSON.stringify(MANIFEST_EXPORT_TARGET)} (received ${JSON.stringify(
          manifestTarget ?? null,
        )})`,
    };
  }
  const targetEntry = `package/${MANIFEST_EXPORT_TARGET.replace(/^\.\//, "")}`;
  if (!entries.includes(targetEntry)) {
    return { ok: false, detail: `tarball is missing the manifest target ${targetEntry}` };
  }
  const missingFiles = missingRequiredPackageFiles(pkg);
  if (missingFiles.length > 0) {
    return {
      ok: false,
      detail: `tarball package.json "files" is missing: ${missingFiles.join(", ")}`,
    };
  }
  return { ok: true, detail: `${entries.length} entries` };
}

/**
 * Pack the package into a temporary directory outside it, inspect the tarball
 * contents, then remove the temporary artifacts. Never publishes.
 */
function runPackCheck({ root, packageDir }) {
  const binary = packageManagerBinary(root);
  let tempDir = null;
  try {
    tempDir = mkdtempSync(join(tmpdir(), "prism-release-"));
    const result = runCommand({
      command: binary,
      args: ["pack", "--pack-destination", tempDir],
      cwd: packageDir,
    });
    if (result.error) {
      return { status: "failed", detail: `pnpm pack could not start: ${result.error.message}` };
    }
    if (result.status !== 0) {
      return {
        status: "failed",
        detail: `pnpm pack failed (exit ${result.status ?? "unknown"}).${commandHint(result)}`,
      };
    }
    const tarballs = readdirSync(tempDir).filter((name) => name.endsWith(".tgz"));
    if (tarballs.length === 0) {
      return { status: "failed", detail: "pnpm pack reported success but produced no tarball." };
    }
    const inspection = inspectTarball(join(tempDir, tarballs[0]));
    if (!inspection.ok) {
      return { status: "failed", detail: inspection.detail };
    }
    return { status: "verified", detail: `packed ${tarballs[0]} (${inspection.detail})` };
  } catch (error) {
    return { status: "failed", detail: `pnpm pack failed: ${error.message}` };
  } finally {
    if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Release preparation                                                        */
/* -------------------------------------------------------------------------- */

function blocked(base, failures, extra = {}) {
  return { ...base, ...extra, ok: false, blocked: true, failures };
}

/**
 * Prepare a release for one registered design system.
 *
 * @param {object} options
 * @param {string} options.id        Lower-kebab-case system id.
 * @param {string} [options.root]    Root holding packages/, config/, apps/ (default: repo root).
 * @param {boolean} [options.approved] Explicit human approval; required unless `dryRun`.
 * @param {string} [options.summary] Changeset summary; defaults to a derived sentence.
 * @param {"major"|"minor"|"patch"} [options.bump] Explicit bump override.
 * @param {boolean} [options.dryRun] Preview only: no writes, no scripts, no commands.
 * @returns {object} Structured release plan, or a blocked result with failures.
 */
export async function prepareRelease(options = {}) {
  const id = assertSystemId(options.id);
  const root = resolve(options.root ?? repoRoot());
  const dryRun = Boolean(options.dryRun);
  const approved = Boolean(options.approved);
  const summaryOption = options.summary;
  const bumpOption = options.bump;

  if (bumpOption !== undefined && !RELEASE_BUMPS.includes(bumpOption)) {
    throw new Error(
      `Invalid --bump "${bumpOption}". Expected one of: ${RELEASE_BUMPS.join(", ")}.`,
    );
  }

  const base = { id, root, dryRun, approved, nextCommands: [...NEXT_COMMANDS] };

  // Approval gate runs before anything else, so an unapproved call never starts
  // validation scripts or writes files.
  if (!approved && !dryRun) {
    return blocked(base, [
      "Missing --approved. Release preparation requires explicit human approval; " +
        "re-run with --approved after review.",
    ]);
  }

  // `changeset version` rewrites package.json, so synchronize the mirrored
  // versions (runtime, generated manifest, registry) before the fail-closed
  // validation that gates build/pack. Never versions and never publishes.
  let synchronization;
  if (dryRun) {
    synchronization = { status: "skipped", detail: "dry run: versions are not synchronized" };
  } else {
    try {
      const result = await syncDesignSystemVersions({ id, root });
      synchronization = {
        status: result.changed ? "synchronized" : "unchanged",
        detail: `runtime, ${DESIGN_SYSTEM_MANIFEST_FILENAME}, and registry aligned to package.json.version`,
      };
    } catch (error) {
      return blocked(base, [`Version synchronization failed: ${error.message}`]);
    }
  }

  let validation;
  try {
    validation = validateDesignSystem({ id, root, runCommands: !dryRun });
  } catch (error) {
    return blocked(base, [`Validation could not run: ${error.message}`]);
  }
  if (!validation.ok) {
    return blocked(base, validation.failures, { validation, synchronization });
  }

  let entry;
  let metadata;
  let pkg;
  try {
    const manifest = readManifest({ manifestPath: join(root, MANIFEST_RELATIVE_PATH) });
    entry = manifest.designSystems.find((system) => system.id === id);
    if (!entry) {
      return blocked(base, [
        `No manifest entry for "${id}" in ${toPosixRelative(root, join(root, MANIFEST_RELATIVE_PATH))}.`,
      ]);
    }
    if (entry.contractVersion !== CONTRACT_VERSION) {
      return blocked(base, [
        `Manifest entry "${id}" has contractVersion ${JSON.stringify(
          entry.contractVersion ?? null,
        )}; release preparation requires the numeric contractVersion: ${CONTRACT_VERSION}.`,
      ]);
    }
    metadata = readPackageMetadata({ id, root });
    pkg = readJsonFile(join(metadata.packageDir, "package.json"));
  } catch (error) {
    return blocked(base, [error.message]);
  }

  const packageName = metadata.packageName;
  const displayName = flattenText(metadata.name || entry.name || id) || id;
  const packageDir = metadata.packageDir;
  const packageRelativePath = toPosixRelative(root, packageDir);
  const currentVersion = pkg.version;
  if (typeof currentVersion !== "string" || parseVersion(currentVersion) === null) {
    return blocked(base, [
      `Cannot release "${packageName}": package version ${JSON.stringify(currentVersion ?? null)} ` +
        "is not a valid semantic version.",
    ]);
  }

  const changesetDir = join(root, ".changeset");
  if (!existsSync(changesetDir)) {
    return blocked(base, [
      `Missing .changeset directory at ${toPosixRelative(root, changesetDir)}; initialize Changesets first.`,
    ]);
  }

  // Changesets supports several entries per change; every existing entry that
  // names this package is reused, and the highest bump wins. Existing entries
  // are never downgraded, rewritten, or deleted.
  const existing = findPackageChangesets(changesetDir, packageName);
  const reuseEntries = existing.map((item) => ({
    path: item.path,
    relativePath: toPosixRelative(root, item.path),
    bump: item.bump,
  }));

  let bump;
  let summary;
  let changeset;
  if (existing.length > 0) {
    const aggregatedBump = aggregateBumps(existing.map((item) => item.bump));
    if (bumpOption !== undefined && bumpOption !== aggregatedBump) {
      return blocked(base, [
        `${existing.length} existing changeset(s) reference ${packageName}: ` +
          `${reuseEntries.map((item) => `${item.relativePath} (${item.bump})`).join(", ")}. ` +
          `Their highest bump is "${aggregatedBump}", but --bump "${bumpOption}" was requested. ` +
          `Re-run with --bump "${aggregatedBump}" or update/remove the existing changesets; ` +
          "an existing bump is never downgraded.",
      ]);
    }
    bump = aggregatedBump;
    changeset = {
      action: "reused",
      bump,
      paths: reuseEntries.map((item) => item.path),
      relativePaths: reuseEntries.map((item) => item.relativePath),
      entries: reuseEntries,
    };
    // Backward-compatible single-entry fields, only when unambiguous.
    if (existing.length === 1) {
      changeset.path = reuseEntries[0].path;
      changeset.relativePath = reuseEntries[0].relativePath;
    }
  } else {
    bump = bumpOption ?? defaultBumpFor(currentVersion);
    summary = sanitizeSummary(
      summaryOption ?? defaultSummary({ displayName, packageName, currentVersion }),
    );
    const changesetPath = assertWithin(
      changesetDir,
      join(changesetDir, `${id}-release.md`),
      `Release changeset for "${id}"`,
    );
    const content = renderChangeset(packageName, bump, summary);
    if (existsSync(changesetPath)) {
      if (readFileSync(changesetPath, "utf8") !== content) {
        return blocked(base, [
          `Refusing to overwrite ${toPosixRelative(root, changesetPath)}: it already exists with ` +
            "different content. Review or remove it.",
        ]);
      }
      changeset = {
        action: "unchanged",
        path: changesetPath,
        relativePath: toPosixRelative(root, changesetPath),
        paths: [changesetPath],
        relativePaths: [toPosixRelative(root, changesetPath)],
        entries: [
          { path: changesetPath, relativePath: toPosixRelative(root, changesetPath), bump },
        ],
        bump,
      };
    } else {
      changeset = {
        action: dryRun ? "planned" : "created",
        path: changesetPath,
        relativePath: toPosixRelative(root, changesetPath),
        paths: [changesetPath],
        relativePaths: [toPosixRelative(root, changesetPath)],
        entries: [
          { path: changesetPath, relativePath: toPosixRelative(root, changesetPath), bump },
        ],
        bump,
      };
    }
  }

  let nextVersion;
  try {
    nextVersion = computeNextVersion(currentVersion, bump);
  } catch (error) {
    return blocked(base, [error.message]);
  }

  // Build/pack happen before the changeset is written: a failing pack check must
  // not leave a prepared changeset behind.
  let build;
  let pack;
  if (dryRun) {
    build = { status: "skipped", detail: "dry run: build is not executed" };
    pack = {
      status: "planned",
      detail: `pnpm pack --pack-destination <temp> (in ${packageRelativePath})`,
    };
  } else {
    build = {
      status: "verified",
      detail: "package build passed during validation",
    };
    pack = runPackCheck({ root, packageDir });
    if (pack.status === "failed") {
      return blocked(base, [pack.detail], {
        validation,
        synchronization,
        build,
        pack,
        changeset,
        nextVersion,
        bump,
      });
    }
  }

  if (changeset.action === "created") {
    try {
      writeFileAtomic(changeset.path, renderChangeset(packageName, bump, summary));
    } catch (error) {
      return blocked(base, [`Could not write ${changeset.relativePath}: ${error.message}`], {
        validation,
        synchronization,
        build,
        pack,
        changeset,
        nextVersion,
        bump,
      });
    }
  }

  return {
    ...base,
    ok: true,
    blocked: false,
    failures: [],
    packageName,
    displayName,
    packageDir,
    packageRelativePath,
    currentVersion,
    bump,
    nextVersion,
    summary,
    validation: { ok: validation.ok, checks: validation.checks, failures: validation.failures },
    synchronization,
    changeset,
    build,
    pack,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

/** Render the CLI help text. */
export function helpText() {
  return [
    "Usage: pnpm ds:release <id> --approved [options]",
    "",
    "Prepare a release for a registered design system: synchronize runtime,",
    "manifest, and registry versions to package.json.version, validate it, plan a",
    "Changesets entry, build, and run a fail-closed pack check that inspects the",
    "tarball contents (including the exact ./manifest export target). This never",
    "runs Changesets versioning or publishing, and never commits.",
    "",
    "Arguments:",
    "  <id>                  Lower-kebab-case system id (e.g. pulse).",
    "",
    "Options:",
    "  --approved            Required for a real preparation. Confirms a human has",
    "                        reviewed and approved the release.",
    "  --summary <text>      Changeset summary (default: derived from package metadata).",
    "  --bump <type>         major | minor | patch (default: major below 1.0.0, else patch).",
    "  --dry-run             Static validation only; write/build/pack nothing.",
    "  --root <path>         Root holding packages/, config/, apps/ (default: repo root).",
    "  -h, --help            Show this help.",
    "",
    "Safety:",
    "  - Without --approved (and without --dry-run) nothing is written or executed.",
    "  - Every existing changeset for the package is reused (none are rewritten or",
    "    deleted). Their highest bump (major > minor > patch) determines the plan,",
    "    and --bump must match that aggregated bump or preparation is blocked.",
    "  - Versioning and publishing remain human steps. After preparation run:",
    `      ${NEXT_COMMANDS.join("\n      ")}`,
    "",
    "Exit code is non-zero for every blocked or failing path.",
    "",
  ].join("\n");
}

/** Parse CLI arguments. Throws on unknown options or missing values. */
export function parseReleaseArgs(argv) {
  const options = {
    id: undefined,
    approved: false,
    summary: undefined,
    bump: undefined,
    dryRun: false,
    root: undefined,
    help: false,
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--approved") {
      options.approved = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
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
      if (key === "summary") options.summary = value;
      else if (key === "bump") options.bump = value;
      else if (key === "root") options.root = value;
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

function reportBlocked(result) {
  process.stdout.write("Release preparation blocked\n\n");
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write(
    "\nNo release changeset was written, and versioning and publishing were not run.\n",
  );
  process.exitCode = 1;
}

/** Render the changeset line(s), listing every reused path and never `undefined`. */
function reportChangesetLines(changeset) {
  const entries =
    Array.isArray(changeset.entries) && changeset.entries.length > 0
      ? changeset.entries
      : [{ relativePath: changeset.relativePath, bump: changeset.bump }];
  if (entries.length === 1) {
    return [`  changeset:  ${changeset.action} ${entries[0].relativePath}`];
  }
  return [
    `  changeset:  ${changeset.action} ${entries.length} changesets ` +
      `(highest bump: ${changeset.bump})`,
    ...entries.map((entry) => `    ${entry.relativePath} (${entry.bump})`),
  ];
}

function reportPlan(result) {
  if (result.dryRun) {
    process.stdout.write(`Release preparation dry run: ${result.packageName}\n\n`);
  } else {
    process.stdout.write(`Release preparation ready: ${result.packageName}\n\n`);
  }
  process.stdout.write(`  package:    ${result.packageName} (${result.displayName})\n`);
  process.stdout.write(`  path:       ${result.packageRelativePath}\n`);
  process.stdout.write(`  version:    ${result.currentVersion} -> ${result.nextVersion}\n`);
  process.stdout.write(`  bump:       ${result.bump}\n`);
  process.stdout.write(`  validation: passed (${result.validation.checks.length} check(s))\n`);
  process.stdout.write(
    `  versions:   ${result.synchronization.status} (${result.synchronization.detail})\n`,
  );
  for (const line of reportChangesetLines(result.changeset)) process.stdout.write(`${line}\n`);
  process.stdout.write(`  build:      ${result.build.status} (${result.build.detail})\n`);
  process.stdout.write(`  pack:       ${result.pack.status} (${result.pack.detail})\n`);
  process.stdout.write("\nNext commands (run manually, in order):\n");
  for (const command of result.nextCommands) process.stdout.write(`  ${command}\n`);
  process.stdout.write(
    result.dryRun
      ? "\nDry run: nothing was written, built, or packed.\n"
      : "\nVersioning and publishing were NOT run. Human approval is still required before publish.\n",
  );
}

async function main(argv) {
  let options;
  try {
    options = parseReleaseArgs(argv);
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

  let result;
  try {
    result = await prepareRelease(options);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (!result.ok) {
    reportBlocked(result);
    return;
  }
  reportPlan(result);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
