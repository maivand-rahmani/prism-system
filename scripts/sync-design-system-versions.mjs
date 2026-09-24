#!/usr/bin/env node
/**
 * Post-version synchronization for the V3 contract foundation.
 *
 * `changeset version` rewrites `package.json.version` but cannot update the
 * other places the version is mirrored. This tool makes the sync explicit and
 * deterministic after versioning, and fail-closed when only checking.
 *
 * For every target design system it aligns, to the authoritative
 * `package.json.version`:
 *
 *   runtime `DesignSystem.version`
 *       V2: `src/index.ts` (`defineDesignSystemV2`)
 *       V4: `src/design-system.ts` (`defineDesignSystemV4`)
 *   design-system.json    generated manifest version (regenerated)
 *   config/design-systems.json   registry entry version
 *
 * The contract is read from the registry entry (falling back to the package's
 * `design-system.source.json`), so a V4 runtime is synchronized through the V4
 * parser and is never relabeled as V2.
 *
 * Modes:
 *   default   write the synchronized runtime version, manifest, and registry.
 *   --check   report drift and exit non-zero without writing anything.
 *
 * `ds:check` stays read-only. Release preparation runs this write step before
 * validation/build/pack; `pnpm release` runs it with `--check` before publish.
 * This tool never versions and never publishes.
 *
 * CLI: pnpm ds:sync-versions [id] [--root <path>] [--check]
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANIFEST_RELATIVE_PATH,
  PACKAGE_DIRECTORY,
  assertSystemId,
  assertWithin,
  readJsonFile,
  readManifest,
  readSourceContract,
  repoRoot,
  serializeManifest,
  toPackageName,
  upsertDesignSystem,
  writeManifest,
} from "./register-design-system.mjs";
import {
  DESIGN_SYSTEM_MANIFEST_FILENAME,
  checkDesignSystemManifest,
  syncRuntimeDesignSystemVersion,
  writeDesignSystemManifest,
} from "./design-system-manifest.mjs";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function resolvePackageDir(root, id) {
  return assertWithin(
    join(root, PACKAGE_DIRECTORY),
    join(root, PACKAGE_DIRECTORY, id),
    `Package path for "${id}"`,
  );
}

/**
 * The canonical runtime source file (relative to a package) that declares the
 * runtime `DesignSystem.version` for a contract.
 *
 * V2 keeps the historical `src/index.ts` + `defineDesignSystemV2`; V4 uses the
 * canonical `src/design-system.ts` + `defineDesignSystemV4`.
 */
export function runtimeTargetForContract(contract) {
  if (contract === "v2") return "src/index.ts";
  if (contract === "v4") return "src/design-system.ts";
  throw new Error(
    `Unsupported contract ${JSON.stringify(contract)}; expected "v2" or "v4".`,
  );
}

/**
 * Synchronize runtime, manifest, and registry versions.
 *
 * @param {object} options
 * @param {string} [options.id]    One system id; defaults to every registered system.
 * @param {string} [options.root]  Root holding packages/ and config/ (defaults to repo root).
 * @param {boolean} [options.check] Report drift only; never write.
 * @returns {Promise<{ ok: boolean, changed: boolean, check: boolean, ids: string[], plans: object[], failures: string[] }>}
 */
export async function syncDesignSystemVersions(options = {}) {
  const root = resolve(options.root ?? repoRoot());
  const check = Boolean(options.check);
  const manifestPath = join(root, MANIFEST_RELATIVE_PATH);
  const registryExists = existsSync(manifestPath);
  const registry = registryExists ? readManifest({ manifestPath }) : null;

  let ids;
  if (options.id !== undefined && options.id !== null) {
    ids = [assertSystemId(options.id)];
  } else if (registry) {
    ids = registry.designSystems.map((system) => system.id);
  } else {
    ids = [];
  }
  if (ids.length === 0) {
    throw new Error(
      "No design systems to synchronize: pass an <id> or create " +
        `${MANIFEST_RELATIVE_PATH} with at least one registered system.`,
    );
  }

  const errors = [];
  const drift = [];
  const plans = [];

  for (const id of ids) {
    const packageDir = resolvePackageDir(root, id);
    const packageJsonPath = join(packageDir, "package.json");
    if (!existsSync(packageJsonPath)) {
      errors.push(`Cannot synchronize "${id}": missing ${packageJsonPath}.`);
      continue;
    }
    let pkg;
    try {
      pkg = readJsonFile(packageJsonPath);
    } catch (error) {
      errors.push(`Cannot synchronize "${id}": invalid ${packageJsonPath}: ${error.message}`);
      continue;
    }
    if (!isPlainObject(pkg) || pkg.name !== toPackageName(id)) {
      errors.push(
        `Cannot synchronize "${id}": package name ${JSON.stringify(
          pkg?.name ?? null,
        )} is not the canonical "${toPackageName(id)}".`,
      );
      continue;
    }
    const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
    if (!SEMVER_PATTERN.test(version)) {
      errors.push(
        `Cannot synchronize "${id}": package.json.version ${JSON.stringify(
          pkg.version ?? null,
        )} is not a valid semantic version.`,
      );
      continue;
    }

    const entry = registry
      ? registry.designSystems.find((system) => system.id === id)
      : undefined;

    // The contract is read from the registry entry, falling back to the
    // package's own source descriptor. A V4 package is never synchronized
    // through the V2 parser (or vice versa).
    let contract;
    try {
      contract = entry?.contract ?? readSourceContract(packageDir);
    } catch (error) {
      errors.push(`Cannot synchronize "${id}": ${error.message}`);
      continue;
    }
    if (contract !== "v2" && contract !== "v4") {
      errors.push(
        `Cannot synchronize "${id}": unsupported contract ${JSON.stringify(contract)}; ` +
          `expected "v2" or "v4".`,
      );
      continue;
    }

    const runtimePath = join(packageDir, runtimeTargetForContract(contract));
    if (!existsSync(runtimePath)) {
      errors.push(`Cannot synchronize "${id}": missing ${runtimePath}.`);
      continue;
    }
    const runtimeSource = readFileSync(runtimePath, "utf8");
    let runtime;
    try {
      runtime = syncRuntimeDesignSystemVersion(runtimeSource, version, contract);
    } catch (error) {
      errors.push(`Cannot synchronize "${id}" runtime version: ${error.message}`);
      continue;
    }

    let manifest;
    try {
      manifest = checkDesignSystemManifest({ id, packageDir });
    } catch (error) {
      errors.push(`Cannot synchronize "${id}" manifest: ${error.message}`);
      continue;
    }

    let registryAction = "skipped";
    let registryEntry = null;
    if (registry) {
      if (!entry) {
        errors.push(
          `Cannot synchronize "${id}": no registry entry in ${MANIFEST_RELATIVE_PATH}. ` +
            `Run "pnpm ds:register ${id}" first.`,
        );
      } else if (entry.version === version) {
        registryAction = "unchanged";
      } else {
        registryAction = "update";
        registryEntry = { ...entry, version };
      }
    }

    // A missing/unbuildable manifest is a hard error; an out-of-date manifest
    // is fixable drift that write mode regenerates.
    if (!manifest.ok) {
      if (manifest.expected === null) errors.push(...manifest.failures);
      else drift.push(...manifest.failures);
    }
    if (runtime.changed) {
      drift.push(
        `Runtime DesignSystem.version in ${runtimeTargetForContract(contract)} is not "${version}".`,
      );
    }
    if (registryAction === "update") {
      drift.push(`Registry entry version in ${MANIFEST_RELATIVE_PATH} is not "${version}".`);
    }

    plans.push({
      id,
      packageDir,
      contract,
      runtimePath,
      runtimeSource,
      runtime,
      manifest,
      registryAction,
      registryEntry,
    });
  }

  if (check) {
    return {
      ok: errors.length === 0 && drift.length === 0,
      changed: false,
      check: true,
      ids,
      plans,
      failures: [...new Set([...errors, ...drift])],
    };
  }
  if (errors.length > 0) {
    return {
      ok: false,
      changed: false,
      check: false,
      ids,
      plans,
      failures: [...new Set(errors)],
    };
  }

  // Apply with rollback: capture exact bytes before writing so any failure
  // restores the repository instead of leaving it half-synchronized.
  const backups = [];
  const remember = (path, content) => backups.push({ path, content });
  try {
    for (const plan of plans) {
      if (plan.runtime.changed) {
        remember(plan.runtimePath, plan.runtimeSource);
        writeFileAtomic(plan.runtimePath, plan.runtime.source);
      }
      if (!plan.manifest.ok) {
        const manifestPathOnDisk = join(plan.packageDir, DESIGN_SYSTEM_MANIFEST_FILENAME);
        remember(
          manifestPathOnDisk,
          existsSync(manifestPathOnDisk) ? readFileSync(manifestPathOnDisk, "utf8") : null,
        );
        await writeDesignSystemManifest({ id: plan.id, packageDir: plan.packageDir });
      }
    }

    if (registry) {
      let next = registry;
      let registryChanged = false;
      for (const plan of plans) {
        if (plan.registryAction !== "update") continue;
        const result = upsertDesignSystem(next, plan.registryEntry);
        next = result.manifest;
        registryChanged = true;
      }
      if (registryChanged) {
        remember(manifestPath, readFileSync(manifestPath, "utf8"));
        writeManifest({ manifestPath, content: serializeManifest(next) });
      }
    }
  } catch (error) {
    for (const backup of [...backups].reverse()) {
      if (backup.content === null) rmSync(backup.path, { force: true });
      else writeFileSync(backup.path, backup.content, "utf8");
    }
    throw new Error(`Version synchronization failed and was rolled back: ${error.message}`);
  }

  return {
    ok: true,
    changed: backups.length > 0,
    check: false,
    ids,
    plans,
    failures: [],
  };
}

export function helpText() {
  return [
    "Usage: pnpm ds:sync-versions [id] [--check] [options]",
    "",
    "Align runtime DesignSystem.version, generated design-system.json, and the",
    "config/design-systems.json registry version to the authoritative",
    "package.json.version after `changeset version`.",
    "",
    "Arguments:",
    "  [id]                  One system id (default: every registered system).",
    "",
    "Options:",
    "  --check               Report drift and exit non-zero; write nothing.",
    "  --root <path>         Root holding packages/ and config/ (default: repo root).",
    "  -h, --help            Show this help.",
    "",
    "This command never versions and never publishes.",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { id: undefined, root: undefined, check: false, help: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
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
    throw new Error(`Expected at most one <id>, received: ${positionals.join(", ")}.`);
  }
  options.id = positionals[0];
  return options;
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

  try {
    const result = await syncDesignSystemVersions(options);
    if (!result.ok) {
      process.stdout.write(
        result.check
          ? "Version synchronization check failed\n\n"
          : "Version synchronization failed\n\n",
      );
      for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
      process.stdout.write(
        result.check
          ? '\nRun "pnpm ds:sync-versions" to write the synchronized versions.\n'
          : "\nNothing was published or versioned.\n",
      );
      process.exitCode = 1;
      return;
    }
    const label = result.ids.length === 1 ? result.ids[0] : `${result.ids.length} systems`;
    process.stdout.write(
      result.check
        ? `Version synchronization check passed for ${label}.\n`
        : `${result.changed ? "Synchronized" : "Already synchronized"} ${label}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
