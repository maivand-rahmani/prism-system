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

import { existsSync } from "node:fs";

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

function info(label, detail) {
  return { label, ok: true, detail };
}

function failure(label, detail) {
  return { label, ok: false, detail };
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
