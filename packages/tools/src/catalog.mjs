/**
 * Catalog orchestration for `prism-ds search`, `info`, `install`, and `use`.
 *
 * Network operations are read-only. `install`/`use` are the only paths that may
 * mutate consumer dependencies, and they do so through a fixed, internally
 * constructed npm/pnpm command after the registry has resolved and validated an
 * exact version. Failures stop at a clearly reported boundary; a package-manager
 * mutation is never rolled back automatically.
 */

import {
  connectDesignSystem,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import { buildInstallCommand, detectPackageManager, spawnInstall } from "./package-manager.mjs";
import { fetchDesignSystemInfo, searchRegistry } from "./registry.mjs";

/** Read-only registry search for supported design systems. */
export async function searchDesignSystems(options = {}) {
  return searchRegistry(options);
}

/** Read-only registry inspection of a published design system manifest. */
export async function inspectDesignSystem(options = {}) {
  return fetchDesignSystemInfo(options);
}

/**
 * Explicitly install a design system into a consumer.
 *
 * Resolves and validates the exact version from the registry first; if registry
 * resolution fails the package manager is never invoked. After the manager exits
 * zero, the installed package is verified through the public `./manifest` export
 * and exact identity/version checks. Returns a structured result.
 */
export async function installDesignSystem({
  cwd,
  package: target,
  version,
  saveDev = false,
  exact = false,
  registry,
  fetchImpl,
  spawnImpl,
  stdio = "inherit",
} = {}) {
  let consumerRoot;
  try {
    consumerRoot = resolveConsumerRoot({ cwd });
  } catch (error) {
    return { ok: false, boundary: "consumer-root", failures: [error.message] };
  }

  let info;
  try {
    info = await fetchDesignSystemInfo({ package: target, version, registry, fetchImpl });
  } catch (error) {
    return { ok: false, boundary: "registry", failures: [error.message] };
  }

  let detection;
  try {
    detection = detectPackageManager({ consumerRoot });
  } catch (error) {
    return { ok: false, boundary: "package-manager", failures: [error.message], info };
  }

  let command;
  try {
    command = buildInstallCommand({
      manager: detection.manager,
      packageName: info.package,
      version: info.version,
      saveDev,
      exact,
      registry: info.registry,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "command",
      failures: [error.message],
      info,
      manager: detection.manager,
    };
  }

  let result;
  try {
    result = spawnInstall({
      manager: detection.manager,
      args: command.args,
      cwd: consumerRoot,
      spawnImpl,
      stdio,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "spawn",
      failures: [error.message],
      info,
      manager: detection.manager,
      command,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      boundary: "manager",
      failures: [`${detection.manager} exited with code ${result.status ?? "unknown"}.`],
      info,
      manager: detection.manager,
      command,
    };
  }

  let installed;
  try {
    installed = resolveInstalledDesignSystem({ consumerRoot, packageName: info.package });
    verifyConsumerDesignSystem({
      packageName: info.package,
      expectedVersion: info.version,
      installed,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "verify",
      failures: [`Installed package verification failed: ${error.message}`],
      info,
      manager: detection.manager,
      command,
    };
  }

  return {
    ok: true,
    failures: [],
    consumerRoot,
    manager: detection.manager,
    managerSource: detection.source,
    package: info.package,
    version: info.version,
    registry: info.registry,
    command,
    installedDir: installed.packageDir,
  };
}

/**
 * Install, verify, and connect a design system, optionally running the strict
 * usage check. The target must be explicit; the package is never discovered.
 */
export async function runUseDesignSystem({
  cwd,
  package: target,
  version,
  saveDev = false,
  exact = false,
  registry,
  strict,
  ignore = [],
  checkUsage: runUsage = false,
  fetchImpl,
  spawnImpl,
  stdio = "inherit",
} = {}) {
  if (Array.isArray(ignore) && ignore.length > 0 && runUsage !== true) {
    return { ok: false, boundary: "arguments", failures: ["--ignore requires --check-usage."] };
  }

  const install = await installDesignSystem({
    cwd,
    package: target,
    version,
    saveDev,
    exact,
    registry,
    fetchImpl,
    spawnImpl,
    stdio,
  });
  if (!install.ok) {
    return {
      ok: false,
      boundary: install.boundary ?? "install",
      failures: install.failures,
      install,
    };
  }

  const connect = connectDesignSystem({
    cwd: install.consumerRoot,
    package: install.package,
    strict,
  });
  if (!connect.ok) {
    return {
      ok: false,
      boundary: "connect",
      failures: connect.failures,
      install,
      connect,
    };
  }

  let usage = null;
  if (runUsage === true) {
    // Lazy-load the checker so TypeScript stays lazy for every other command.
    const { checkUsage } = await import("./usage.mjs");
    try {
      usage = checkUsage({ cwd: install.consumerRoot, ignore, strict });
    } catch (error) {
      return {
        ok: false,
        boundary: "check-usage",
        failures: [error.message],
        install,
        connect,
      };
    }
    if (!usage.ok) {
      return {
        ok: false,
        boundary: "check-usage",
        failures: ["Strict usage check failed."],
        install,
        connect,
        usage,
      };
    }
  }

  return { ok: true, failures: [], install, connect, usage };
}
