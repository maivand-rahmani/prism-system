#!/usr/bin/env node
/**
 * `prism-ds doctor` — read-only consumer diagnostics.
 *
 * Doctor never writes, installs, or mutates anything. It reports, in a
 * deterministic order:
 *
 *   1. the explicit consumer root and its realpath containment;
 *   2. package discovery (config, package.json metadata, or single dependency);
 *   3. the installed package resolved through Node package resolution;
 *   4. the public `./manifest` export, its version, and identity invariants;
 *   5. the consumer `.design-system/config.json` state.
 *
 * Any failed check is reported with an actionable message and makes the command
 * exit non-zero. Missing `.design-system/config.json` is expected before the
 * first `connect`, so it is reported as information, not a failure.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { CONTRACT_V4, assertWithin } from "./constants.mjs";
import { detectManifestContract } from "./manifest.mjs";
import {
  CONSUMER_CONFIG_FILENAME,
  CONSUMER_DIRECTORY,
  discoverConsumerPackage,
  readConsumerConfig,
  resolveConsumerPath,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";

/** Public subpath a V4 design system advertises and exposes its Tailwind bridge on. */
export const TAILWIND_EXPORT_SUBPATH = "./tailwind.css";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function info(label, detail) {
  return { label, ok: true, detail };
}

function failure(label, detail) {
  return { label, ok: false, detail };
}

/**
 * Verify the V4 Tailwind bridge advertisement and its public export, read-only:
 * the shipped manifest must advertise `./tailwind.css`, `package.json` must
 * expose the same target, and that target must be a contained regular file
 * inside the package directory. V2 systems are not required to ship a bridge.
 */
function verifyV4TailwindBridge({ installed, packageName }) {
  const manifestExports = isPlainObject(installed.manifest?.exports)
    ? installed.manifest.exports
    : {};
  const declaredTarget = manifestExports[TAILWIND_EXPORT_SUBPATH];
  if (declaredTarget === undefined) {
    throw new Error(
      `Shipped V4 manifest does not advertise ${JSON.stringify(
        TAILWIND_EXPORT_SUBPATH,
      )} in its exports map.`,
    );
  }
  if (
    typeof declaredTarget !== "string" ||
    declaredTarget.trim().length === 0 ||
    !declaredTarget.startsWith("./")
  ) {
    throw new Error(
      `Shipped V4 manifest exports[${JSON.stringify(
        TAILWIND_EXPORT_SUBPATH,
      )}] must be a "./"-relative string target (received ${JSON.stringify(
        declaredTarget ?? null,
      )}).`,
    );
  }
  const normalized = declaredTarget.trim();
  const packageExports = isPlainObject(installed.packageJson.exports)
    ? installed.packageJson.exports
    : {};
  const publicTarget = packageExports[TAILWIND_EXPORT_SUBPATH];
  if (publicTarget !== normalized) {
    throw new Error(
      `Installed "${packageName}" must expose ${JSON.stringify(
        TAILWIND_EXPORT_SUBPATH,
      )} as the manifest target ${JSON.stringify(normalized)} (received ${JSON.stringify(
        publicTarget ?? null,
      )}).`,
    );
  }
  const targetPath = assertWithin(
    installed.packageDir,
    join(installed.packageDir, normalized),
    `Tailwind bridge target for "${packageName}"`,
  );
  if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
    throw new Error(
      `Installed "${packageName}" exposes ${JSON.stringify(
        TAILWIND_EXPORT_SUBPATH,
      )} -> ${JSON.stringify(normalized)}, but that target is not a contained regular file.`,
    );
  }
  return targetPath;
}

/**
 * Collect a read-only diagnostic report.
 *
 * @returns {{ ok: boolean, consumerRoot: string | null, checks: { label: string, ok: boolean, detail: string, informational?: boolean }[] }}
 */
export function collectDoctorReport({ cwd, package: explicitPackage } = {}) {
  const checks = [];
  let consumerRoot;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    checks.push(failure("consumer root", error.message));
    return { ok: false, consumerRoot: null, checks };
  }
  checks.push(info("consumer root", consumerRoot));

  // Target containment: consumer-owned paths must stay inside the real root.
  try {
    resolveConsumerPath(consumerRoot, CONSUMER_DIRECTORY);
    resolveConsumerPath(consumerRoot, "AGENTS.md");
    resolveConsumerPath(consumerRoot, "package.json");
    checks.push(
      info("target containment", ".design-system, AGENTS.md, and package.json stay inside --cwd"),
    );
  } catch (error) {
    checks.push(failure("target containment", error.message));
  }

  // Consumer config state (invalid config is a failure; absent config is not).
  let config = null;
  try {
    config = readConsumerConfig(consumerRoot);
    checks.push(
      config
        ? info(
            "consumer config",
            `${CONSUMER_DIRECTORY}/${CONSUMER_CONFIG_FILENAME} (package ${config.package}@${config.version}, strict ${config.strict})`,
          )
        : info(
            "consumer config",
            `absent (${CONSUMER_DIRECTORY}/${CONSUMER_CONFIG_FILENAME}); run connect to create it`,
          ),
    );
  } catch (error) {
    checks.push(failure("consumer config", error.message));
  }

  // Package discovery.
  let discovered = null;
  try {
    discovered = discoverConsumerPackage({ consumerRoot, explicitPackage });
    checks.push(
      info("package discovery", `${discovered.packageName} (source: ${discovered.source})`),
    );
  } catch (error) {
    checks.push(failure("package discovery", error.message));
    return { ok: false, consumerRoot, checks };
  }

  // Installed package through Node package resolution.
  let installed = null;
  try {
    installed = resolveInstalledDesignSystem({
      consumerRoot,
      packageName: discovered.packageName,
    });
    checks.push(
      info(
        "installed package",
        `${discovered.packageName}@${installed.packageJson.version} at ${installed.packageDir}`,
      ),
    );
  } catch (error) {
    checks.push(failure("installed package", error.message));
    return { ok: false, consumerRoot, checks };
  }

  // Public manifest export.
  try {
    if (!existsSync(installed.manifestPath)) {
      throw new Error(`public manifest is missing at ${installed.manifestPath}`);
    }
    checks.push(
      info(
        "public manifest",
        `./manifest -> ${installed.manifestPath} (version ${installed.manifest?.version ?? "unknown"})`,
      ),
    );
  } catch (error) {
    checks.push(failure("public manifest", error.message));
  }

  // Exact version/identity invariants.
  try {
    const { version } = verifyConsumerDesignSystem({
      packageName: discovered.packageName,
      expectedVersion: discovered.expectedVersion,
      installed,
    });
    checks.push(info("version/identity invariants", `exact match at ${version}`));
  } catch (error) {
    checks.push(failure("version/identity invariants", error.message));
  }

  // V4 Tailwind bridge: the manifest advertises `./tailwind.css`, the package
  // exposes the matching public export, and its target is a contained regular
  // file. V2 design systems are never required to ship a Tailwind bridge.
  if (detectManifestContract(installed.manifest) === CONTRACT_V4) {
    try {
      const bridgePath = verifyV4TailwindBridge({
        installed,
        packageName: discovered.packageName,
      });
      checks.push(info("tailwind bridge", `./tailwind.css -> ${bridgePath}`));
    } catch (error) {
      checks.push(failure("tailwind bridge", error.message));
    }
  }

  const failures = checks.filter((check) => !check.ok);
  return { ok: failures.length === 0, consumerRoot, checks };
}

export function doctorHelpText() {
  return [
    "Usage: prism-ds doctor [package] --cwd <consumer-root>",
    "",
    "Read-only diagnostics for a consumer repository: target containment, discovered",
    "package and identity, installed package version (through Node package resolution),",
    "public ./manifest availability and version, exact invariants, and config state.",
    "",
    "Arguments:",
    "  [package]             Optional package name or system id to check explicitly.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  -h, --help            Show this help.",
    "",
    "Doctor writes nothing, installs nothing, and exits non-zero when any check fails.",
    "",
  ].join("\n");
}
