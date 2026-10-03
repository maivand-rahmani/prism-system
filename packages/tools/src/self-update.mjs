/**
 * Installation-aware self-update for the `prism-ds` CLI itself.
 *
 * This module is deliberately separate from the design-system catalog commands
 * (`install`/`use`/`upgrade`): those mutate a consumer's design-system
 * dependency, while `self-update` updates `@prism-system/tools` itself. It never
 * confuses the two: the target package is fixed, the target version is an exact
 * semver resolved from the registry, and the command is built internally.
 *
 * Boundaries:
 *
 *   - `checkCliUpdate` is read-only and never throws: it reads the running
 *     package version, detects how this CLI is installed, and (unless disabled
 *     or offline) performs one bounded, credential-free, redirect-rejected,
 *     timeout- and size-limited registry read. It never writes and never spawns.
 *   - `planSelfUpdate` resolves the exact target and builds the fixed npm/pnpm
 *     command. It never spawns or writes.
 *   - `selfUpdate` mutates only with `confirmed: true`, only for a supported
 *     installation context, only through the exact planned command, and never
 *     with user-supplied arguments. `--dry-run` never spawns or writes. A
 *     successful manager exit is post-verified when possible; otherwise the
 *     result is reported as an explicit partial/unverified state. There is no
 *     promised rollback.
 *
 * Installation detection never guesses: a local update requires the running
 * package root to be exactly the consumer's declared installed dependency; a
 * global update requires a verified conventional npm/pnpm global root or an
 * explicit `--global`/`--manager` authorization. Ephemeral (npx/dlx), workspace,
 * source, and unknown contexts produce accurate advice and are never mutated as
 * if they were a global install.
 */

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFile, resolveRealPath } from "./constants.mjs";
import {
  SUPPORTED_MANAGERS,
  assertSafeArgument,
  buildInstallCommand,
  detectPackageManager,
  spawnInstall,
} from "./package-manager.mjs";
import {
  DEFAULT_REGISTRY_URL,
  buildRegistryEndpoint,
  fetchJsonLimited,
  normalizeRegistryUrl,
} from "./registry.mjs";
import { compareExactSemver, isExactSemver } from "./semver.mjs";

/** The fixed self-update target: this tooling package, never a design system. */
export const CLI_PACKAGE_NAME = "@prism-system/tools";
/** Environment variable that disables the nonblocking startup update check. */
export const UPDATE_CHECK_ENV = "PRISM_DS_UPDATE_CHECK";
/** Small default timeout for the version check so TUI startup is never blocked. */
export const UPDATE_CHECK_TIMEOUT_MS = 2500;
/** Size limit for the self-update registry read. */
export const UPDATE_CHECK_MAX_BYTES = 1024 * 1024;
/** Values of {@link UPDATE_CHECK_ENV} that disable the update check. */
export const UPDATE_DISABLED_VALUES = Object.freeze(["0", "false", "off", "no"]);
/** Installation contexts the update planner understands. */
export const INSTALLATION_KINDS = Object.freeze([
  "local",
  "global",
  "ephemeral",
  "workspace",
  "source",
  "unknown",
]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function hasPathSegment(root, segment) {
  return String(root)
    .split(/[\\/]+/)
    .includes(segment);
}

/**
 * Read the running `@prism-system/tools` package.json relative to this module,
 * so the version is correct in a published install, a workspace link, or a
 * source checkout with no repository-root assumptions.
 */
export function readCliPackageInfo() {
  const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
  let packageJson;
  try {
    packageJson = readJsonFile(packageJsonPath);
  } catch (error) {
    throw new Error(
      `Cannot read the prism-ds package.json at ${packageJsonPath}: ${error.message}`,
    );
  }
  if (packageJson.name !== CLI_PACKAGE_NAME) {
    throw new Error(
      `Expected ${JSON.stringify(CLI_PACKAGE_NAME)} at ${packageJsonPath}, received ` +
        `${JSON.stringify(packageJson.name ?? null)}.`,
    );
  }
  return {
    root: resolveRealPath(dirname(packageJsonPath)),
    packageJsonPath,
    packageJson,
    name: CLI_PACKAGE_NAME,
    version: typeof packageJson.version === "string" ? packageJson.version : null,
  };
}

/** True when the nonblocking startup update check is disabled by the environment. */
export function isUpdateCheckDisabled(env = process.env) {
  const value = env?.[UPDATE_CHECK_ENV];
  if (value === undefined || value === null) return false;
  return UPDATE_DISABLED_VALUES.includes(String(value).trim().toLowerCase());
}

function normalizeManagerOption(manager) {
  if (manager === undefined || manager === null || String(manager).trim() === "") return null;
  const value = String(manager).trim();
  if (!SUPPORTED_MANAGERS.includes(value)) {
    throw new Error(
      `Unsupported package manager ${JSON.stringify(value)}; only npm and pnpm are supported.`,
    );
  }
  return value;
}

/**
 * Resolve the exact latest `@prism-system/tools` version from the registry.
 *
 * One bounded read only: http(s), no credentials, redirects rejected, timeout
 * and size limited, and only an exact semver `dist-tags.latest` is accepted.
 */
export async function resolveLatestCliVersion({
  fetchImpl,
  registryUrl,
  registry,
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
  maxBytes = UPDATE_CHECK_MAX_BYTES,
} = {}) {
  const base = normalizeRegistryUrl(registryUrl ?? registry ?? DEFAULT_REGISTRY_URL);
  const endpoint = buildRegistryEndpoint(base, encodeURIComponent(CLI_PACKAGE_NAME));
  const packument = await fetchJsonLimited(endpoint, { fetchImpl, timeoutMs, maxBytes });
  if (!isPlainObject(packument)) {
    throw new Error(`Registry packument for ${CLI_PACKAGE_NAME} must be a JSON object.`);
  }
  if (packument.name !== CLI_PACKAGE_NAME) {
    throw new Error(
      `Registry packument name ${JSON.stringify(packument.name ?? null)} does not match ` +
        `${JSON.stringify(CLI_PACKAGE_NAME)}.`,
    );
  }
  const latest = isPlainObject(packument["dist-tags"]) ? packument["dist-tags"].latest : undefined;
  if (typeof latest !== "string" || !isExactSemver(latest)) {
    throw new Error(
      `Registry packument for ${CLI_PACKAGE_NAME} has no exact dist-tags.latest version.`,
    );
  }
  const metadata = isPlainObject(packument.versions) ? packument.versions[latest] : undefined;
  if (!isPlainObject(metadata)) {
    throw new Error(`Registry has no published ${CLI_PACKAGE_NAME} version ${latest}.`);
  }
  if (metadata.version !== latest) {
    throw new Error(
      `Registry metadata version ${JSON.stringify(metadata.version ?? null)} does not match ` +
        `${JSON.stringify(latest)}.`,
    );
  }
  if (metadata.name !== undefined && metadata.name !== CLI_PACKAGE_NAME) {
    throw new Error(
      `Registry metadata name ${JSON.stringify(metadata.name)} does not match ` +
        `${JSON.stringify(CLI_PACKAGE_NAME)}.`,
    );
  }
  return { registry: base, latest };
}

/**
 * Resolve `@prism-system/tools` through Node package resolution from a consumer
 * root and report whether the consumer declares it. Returns null when the
 * package is not resolvable. Read-only.
 */
export function resolveInstalledCliRoot({ cwd } = {}) {
  if (typeof cwd !== "string" || cwd.trim() === "") return null;
  const consumerRoot = resolve(cwd);
  let packageJsonPath;
  try {
    const requireFromConsumer = createRequire(join(consumerRoot, "package.json"));
    packageJsonPath = requireFromConsumer.resolve(`${CLI_PACKAGE_NAME}/package.json`);
  } catch {
    return null;
  }
  const root = resolveRealPath(dirname(packageJsonPath));
  let packageJson;
  try {
    packageJson = readJsonFile(join(root, "package.json"));
  } catch {
    return null;
  }
  if (packageJson.name !== CLI_PACKAGE_NAME) return null;
  let declared = false;
  let section = null;
  const consumerPackageJsonPath = join(consumerRoot, "package.json");
  if (existsSync(consumerPackageJsonPath)) {
    try {
      const consumerPackageJson = readJsonFile(consumerPackageJsonPath);
      for (const field of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        if (
          isPlainObject(consumerPackageJson[field]) &&
          hasOwn(consumerPackageJson[field], CLI_PACKAGE_NAME)
        ) {
          declared = true;
          if (section === null) section = field;
        }
      }
    } catch {
      declared = false;
    }
  }
  return {
    root,
    packageJsonPath: join(root, "package.json"),
    packageJson,
    declared,
    section,
  };
}

function addPnpmCandidates(candidates, home) {
  if (typeof home !== "string" || home === "") return;
  const globalDir = join(home, "global");
  const roots = [];
  try {
    for (const entry of readdirSync(globalDir, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(globalDir, entry.name, "node_modules"));
    }
  } catch {
    // No pnpm global layout here; the conventional node_modules fallback still applies.
  }
  roots.push(join(globalDir, "node_modules"));
  for (const root of roots) candidates.push({ root, manager: "pnpm" });
}

/** Conventional npm/pnpm global roots, derived from the environment only. */
function candidateGlobalRoots(env = process.env) {
  const candidates = [];
  const add = (root, manager) => {
    if (typeof root === "string" && root !== "") candidates.push({ root, manager });
  };
  if (env?.APPDATA) add(join(env.APPDATA, "npm", "node_modules"), "npm");
  if (env?.npm_config_prefix) {
    add(join(env.npm_config_prefix, "lib", "node_modules"), "npm");
    add(join(env.npm_config_prefix, "node_modules"), "npm");
  }
  const execDir = dirname(process.execPath);
  add(join(execDir, "node_modules"), "npm");
  add(join(dirname(execDir), "lib", "node_modules"), "npm");
  const pnpmHomes = [];
  if (env?.PNPM_HOME) pnpmHomes.push(env.PNPM_HOME);
  if (env?.LOCALAPPDATA) pnpmHomes.push(join(env.LOCALAPPDATA, "pnpm"));
  if (env?.XDG_DATA_HOME) pnpmHomes.push(join(env.XDG_DATA_HOME, "pnpm"));
  try {
    pnpmHomes.push(join(homedir(), ".local", "share", "pnpm"));
  } catch {
    // homedir() can fail in constrained environments; other candidates still apply.
  }
  for (const home of pnpmHomes) addPnpmCandidates(candidates, home);
  return candidates;
}

/**
 * Match the running package root against a conventional global root and verify
 * the candidate really is `@prism-system/tools` before trusting it.
 */
function findVerifiedGlobalRoot(packageRoot, env) {
  if (typeof packageRoot !== "string" || packageRoot === "") return null;
  for (const candidate of candidateGlobalRoots(env)) {
    const packageDir = join(candidate.root, ...CLI_PACKAGE_NAME.split("/"));
    const packageJsonPath = join(packageDir, "package.json");
    if (!existsSync(packageJsonPath)) continue;
    let packageJson;
    try {
      packageJson = readJsonFile(packageJsonPath);
    } catch {
      continue;
    }
    if (packageJson.name !== CLI_PACKAGE_NAME) continue;
    if (resolveRealPath(packageDir) === resolveRealPath(packageRoot)) {
      return { root: candidate.root, manager: candidate.manager };
    }
  }
  return null;
}

/** True when an ancestor manifest covers the package root (workspace link/checkout). */
function isWorkspacePackageRoot(packageRoot) {
  if (typeof packageRoot !== "string" || packageRoot === "") return false;
  let current = packageRoot;
  for (let depth = 0; depth < 12; depth += 1) {
    const parent = dirname(current);
    if (parent === current) return false;
    if (existsSync(join(parent, "pnpm-workspace.yaml"))) return true;
    const manifestPath = join(parent, "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = readJsonFile(manifestPath);
        if (Array.isArray(manifest.workspaces) && manifest.workspaces.length > 0) return true;
      } catch {
        // Ignore a malformed ancestor manifest; it cannot authorize a workspace claim.
      }
    }
    current = parent;
  }
  return false;
}

/**
 * Detect how the running CLI is installed, without guessing.
 *
 * @returns {{
 *   kind: "local" | "global" | "ephemeral" | "workspace" | "source" | "unknown",
 *   manager: string | null,
 *   packageRoot: string | null,
 *   verified: boolean,
 *   explicit: boolean,
 *   globalRoot?: string | null,
 *   cwd?: string,
 *   section?: string | null,
 *   managerSource?: string | null,
 *   detail?: string,
 * }}
 */
export function detectCliInstallation({
  cwd,
  packageRoot,
  manager,
  global,
  env = process.env,
} = {}) {
  const explicitManager = normalizeManagerOption(manager);
  const base = {
    manager: explicitManager,
    packageRoot: typeof packageRoot === "string" && packageRoot !== "" ? packageRoot : null,
    verified: false,
    explicit: false,
  };
  if (global === true) {
    const verified = findVerifiedGlobalRoot(base.packageRoot, env);
    return {
      ...base,
      kind: "global",
      manager: explicitManager ?? verified?.manager ?? null,
      globalRoot: verified?.root ?? null,
      verified: verified !== null,
      explicit: true,
    };
  }
  if (base.packageRoot !== null) {
    if (hasPathSegment(base.packageRoot, "_npx") || hasPathSegment(base.packageRoot, "dlx")) {
      return {
        ...base,
        kind: "ephemeral",
        cacheRoot: base.packageRoot,
        detail: "running from an npx/dlx cache",
      };
    }
    const verified = findVerifiedGlobalRoot(base.packageRoot, env);
    if (verified !== null) {
      return {
        ...base,
        kind: "global",
        manager: explicitManager ?? verified.manager,
        globalRoot: verified.root,
        verified: true,
      };
    }
    if (typeof cwd === "string" && cwd.trim() !== "") {
      const consumerRoot = resolve(cwd);
      const local = resolveInstalledCliRoot({ cwd: consumerRoot });
      if (local !== null && resolveRealPath(local.root) === resolveRealPath(base.packageRoot)) {
        if (local.declared) {
          let detected = null;
          try {
            detected = detectPackageManager({ consumerRoot });
          } catch {
            detected = null;
          }
          return {
            ...base,
            kind: "local",
            manager: explicitManager ?? detected?.manager ?? null,
            managerSource: detected?.source ?? null,
            managerDetected: detected !== null,
            cwd: consumerRoot,
            section: local.section,
            verified: true,
          };
        }
        // The running copy is the installed copy but is not declared: fall through
        // to workspace/source/unknown instead of claiming a local dependency.
      }
    }
    if (isWorkspacePackageRoot(base.packageRoot)) {
      return { ...base, kind: "workspace", detail: "covered by a workspace manifest" };
    }
    if (!hasPathSegment(base.packageRoot, "node_modules")) {
      return { ...base, kind: "source", detail: "running from an uninstalled source checkout" };
    }
    return { ...base, kind: "unknown", detail: "installed layout could not be classified" };
  }
  return { ...base, kind: "unknown", detail: "the running package root could not be resolved" };
}

function buildUpdateAdvice({ installation, current, latest, available }) {
  const target = `${CLI_PACKAGE_NAME}@${latest ?? "<latest>"}`;
  if (!available) return `prism-ds ${current ?? "?"} is up to date; no update is needed.`;
  const kind = installation?.kind ?? "unknown";
  const manager = installation?.manager ?? null;
  if (kind === "local") {
    const cwd = installation.cwd ?? "<consumer-root>";
    if (manager === null) {
      return (
        `A newer prism-ds (${latest}) is available. Update the local dependency with ` +
        `"prism-ds self-update --cwd ${cwd}", after making the package manager unambiguous ` +
        "(add a packageManager field or exactly one supported lockfile)."
      );
    }
    const section = installation.section === "devDependencies" ? "--save-dev" : "--save-prod";
    const verb = manager === "npm" ? "install" : "add";
    return (
      `A newer prism-ds (${latest}) is available. Update the local dependency with ` +
      `"prism-ds self-update --cwd ${cwd}" (${manager} ${verb} ${section} ${target}).`
    );
  }
  if (kind === "global") {
    if (manager === null) {
      return (
        `A newer prism-ds (${latest}) is available, but the global package manager could not ` +
        'be verified. Re-run with an explicit manager: "prism-ds self-update --global ' +
        '--manager npm|pnpm".'
      );
    }
    const verb = manager === "npm" ? "install" : "add";
    return (
      `A newer prism-ds (${latest}) is available. Update the verified global install with ` +
      `"prism-ds self-update --global --manager ${manager}" (${manager} ${verb} -g ${target}).`
    );
  }
  if (kind === "ephemeral") {
    return (
      `A newer prism-ds (${latest}) is available. This prism-ds is running from an npx/dlx ` +
      `cache; run the explicit package instead ("npx ${target} ..."), or install prism-ds as ` +
      "a local dependency or a global package first. Do not assume a global install."
    );
  }
  if (kind === "workspace") {
    return (
      `A newer prism-ds (${latest}) is available. This prism-ds belongs to a workspace or ` +
      "source checkout; update the checkout itself (git pull / pnpm install) — prism-ds will " +
      "not mutate a workspace link."
    );
  }
  if (kind === "source") {
    return (
      `A newer prism-ds (${latest}) is available. This prism-ds is running from a source ` +
      "checkout; update the checkout (git pull / pnpm install) or install a released version " +
      "explicitly. Do not assume a global install."
    );
  }
  return (
    `A newer prism-ds (${latest}) is available, but how prism-ds is installed could not be ` +
    "determined. Update it explicitly with the manager that actually owns this installation " +
    "(npm or pnpm); do not run a global install unless prism-ds was installed globally."
  );
}

/**
 * Read-only, non-throwing update check for the TUI/startup path.
 *
 * Never writes, never spawns, respects `PRISM_DS_UPDATE_CHECK=0` and the
 * `offline` option, and returns a structured error instead of throwing so a
 * startup notice can never block the CLI.
 *
 * @returns {{
 *   ok: boolean,
 *   skipped: boolean,
 *   reason: string | null,
 *   current: string | null,
 *   latest: string | null,
 *   available: boolean,
 *   installation: object,
 *   error: string | null,
 *   advice: string,
 * }}
 */
export async function checkCliUpdate({
  fetchImpl,
  registryUrl,
  registry,
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
  maxBytes = UPDATE_CHECK_MAX_BYTES,
  cwd,
  manager,
  global,
  packageRoot,
  env = process.env,
  offline = false,
} = {}) {
  let current = null;
  let packageRootResolved =
    typeof packageRoot === "string" && packageRoot !== "" ? packageRoot : null;
  try {
    const info = readCliPackageInfo();
    current = info.version;
    packageRootResolved = packageRootResolved ?? info.root;
  } catch {
    // Reported below as a quiet structured failure.
  }
  const base = {
    ok: true,
    skipped: false,
    reason: null,
    current,
    latest: null,
    available: false,
    installation: {
      kind: "unknown",
      manager: null,
      packageRoot: packageRootResolved,
      verified: false,
      explicit: false,
    },
    error: null,
    advice: "",
  };
  if (isUpdateCheckDisabled(env)) {
    return {
      ...base,
      skipped: true,
      reason: "disabled",
      advice: `Update checks are disabled by ${UPDATE_CHECK_ENV}.`,
    };
  }
  if (offline === true) {
    return {
      ...base,
      skipped: true,
      reason: "offline",
      advice: "Offline: the prism-ds update check was skipped.",
    };
  }
  let installation;
  try {
    installation = detectCliInstallation({
      cwd,
      packageRoot: packageRootResolved,
      manager,
      global,
      env,
    });
  } catch (error) {
    return {
      ...base,
      ok: false,
      error: error.message,
      advice: "prism-ds could not determine how it is installed; no update was checked.",
    };
  }
  if (current === null) {
    return {
      ...base,
      installation,
      ok: false,
      error: "The running prism-ds package version could not be read.",
      advice: "prism-ds could not read its own version; no update was checked.",
    };
  }
  let latest;
  try {
    ({ latest } = await resolveLatestCliVersion({
      fetchImpl,
      registryUrl: registryUrl ?? registry,
      timeoutMs,
      maxBytes,
    }));
  } catch (error) {
    return {
      ...base,
      installation,
      ok: false,
      error: error.message,
      advice: `Update check skipped (network/registry error): ${error.message}`,
    };
  }
  if (!isExactSemver(current)) {
    const error = `The running prism-ds version ${JSON.stringify(current)} is not an exact semver.`;
    return { ...base, installation, ok: false, latest, error, advice: error };
  }
  const available = compareExactSemver(latest, current) > 0;
  return {
    ...base,
    installation,
    latest,
    available,
    advice: buildUpdateAdvice({ installation, current, latest, available }),
  };
}

function buildGlobalUpdateCommand({ manager, version, registry }) {
  const verb = manager === "npm" ? "install" : "add";
  const target = assertSafeArgument(`${CLI_PACKAGE_NAME}@${version}`, "update target");
  const registryArgument = `--registry=${assertSafeArgument(registry, "registry URL")}`;
  return {
    manager,
    verb,
    scope: "global",
    args: [verb, "--global", "--ignore-scripts", registryArgument, target],
  };
}

/**
 * Plan a self-update without spawning or writing anything.
 *
 * The target package is always `@prism-system/tools`. A local plan requires the
 * running package root to be the consumer's declared installed dependency; a
 * global plan requires a verified global root or an explicit
 * `global: true`/`manager` authorization. Ephemeral, workspace, source, and
 * unknown contexts fail closed with accurate advice.
 *
 * @returns {{
 *   ok: boolean,
 *   boundary?: string,
 *   failures: string[],
 *   advice?: string,
 *   action?: "self-update",
 *   scope?: "local" | "global",
 *   installation?: object,
 *   packageName?: string,
 *   currentVersion?: string | null,
 *   targetVersion?: string,
 *   updateAvailable?: boolean,
 *   registry?: string,
 *   cwd?: string | null,
 *   command?: { manager: string, verb: string, scope: string, args: string[] } | null,
 *   preserveSection?: string | null,
 *   postVerifySupported?: boolean,
 *   globalRoot?: string | null,
 * }}
 */
export async function planSelfUpdate({
  cwd,
  global,
  manager,
  registry,
  registryUrl,
  fetchImpl,
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
  maxBytes = UPDATE_CHECK_MAX_BYTES,
  packageRoot,
  env = process.env,
  offline = false,
  targetVersion,
} = {}) {
  let info;
  try {
    info = readCliPackageInfo();
  } catch (error) {
    return { ok: false, boundary: "package", failures: [error.message], currentVersion: null };
  }
  let explicitManager;
  try {
    explicitManager = normalizeManagerOption(manager);
  } catch (error) {
    return {
      ok: false,
      boundary: "manager",
      failures: [error.message],
      currentVersion: info.version,
    };
  }
  let installation;
  try {
    installation = detectCliInstallation({
      cwd,
      packageRoot: packageRoot ?? info.root,
      manager: explicitManager,
      global,
      env,
    });
  } catch (error) {
    return {
      ok: false,
      boundary: "installation",
      failures: [error.message],
      currentVersion: info.version,
    };
  }

  let target;
  if (
    targetVersion !== undefined &&
    targetVersion !== null &&
    String(targetVersion).trim() !== ""
  ) {
    const value = String(targetVersion).trim();
    if (!isExactSemver(value)) {
      return {
        ok: false,
        boundary: "version",
        failures: [
          `Invalid target version ${JSON.stringify(targetVersion)}; expected an exact semver.`,
        ],
        currentVersion: info.version,
        installation,
      };
    }
    target = value;
  } else {
    if (offline === true) {
      return {
        ok: false,
        boundary: "offline",
        failures: [
          "Offline: the self-update plan requires registry access to resolve the latest version.",
        ],
        currentVersion: info.version,
        installation,
      };
    }
    try {
      ({ latest: target } = await resolveLatestCliVersion({
        fetchImpl,
        registryUrl: registryUrl ?? registry,
        timeoutMs,
        maxBytes,
      }));
    } catch (error) {
      return {
        ok: false,
        boundary: "registry",
        failures: [error.message],
        currentVersion: info.version,
        installation,
      };
    }
  }
  const updateAvailable = isExactSemver(info.version)
    ? compareExactSemver(target, info.version) > 0
    : true;

  let scope;
  if (global === true || installation.kind === "global") scope = "global";
  else if (installation.kind === "local") scope = "local";
  else {
    return {
      ok: false,
      boundary: "installation",
      failures: [
        `Cannot plan a self-update: prism-ds is running from a ${installation.kind} installation.`,
      ],
      advice: buildUpdateAdvice({
        installation,
        current: info.version,
        latest: target,
        available: updateAvailable,
      }),
      installation,
      currentVersion: info.version,
      targetVersion: target,
      updateAvailable,
    };
  }

  const resolvedManager = explicitManager ?? installation.manager ?? null;
  if (resolvedManager === null) {
    return {
      ok: false,
      boundary: "manager",
      failures: [
        "No package manager could be determined for this installation; pass --manager npm|pnpm.",
      ],
      advice: buildUpdateAdvice({
        installation,
        current: info.version,
        latest: target,
        available: updateAvailable,
      }),
      installation,
      currentVersion: info.version,
      targetVersion: target,
      updateAvailable,
    };
  }

  let registryBase;
  try {
    registryBase = normalizeRegistryUrl(registryUrl ?? registry ?? DEFAULT_REGISTRY_URL);
  } catch (error) {
    return {
      ok: false,
      boundary: "registry",
      failures: [error.message],
      installation,
      currentVersion: info.version,
      targetVersion: target,
    };
  }

  let command;
  let commandCwd = null;
  let preserveSection = null;
  try {
    if (scope === "global") {
      command = buildGlobalUpdateCommand({
        manager: resolvedManager,
        version: target,
        registry: registryBase,
      });
    } else {
      if (typeof cwd !== "string" || cwd.trim() === "") {
        return {
          ok: false,
          boundary: "cwd",
          failures: ["A local self-update requires an explicit --cwd <consumer-root>."],
          installation,
          currentVersion: info.version,
          targetVersion: target,
        };
      }
      commandCwd = resolve(cwd);
      const section =
        installation.section === "devDependencies" ? "devDependencies" : "dependencies";
      preserveSection = section;
      const built = buildInstallCommand({
        manager: resolvedManager,
        packageName: CLI_PACKAGE_NAME,
        version: target,
        saveDev: section === "devDependencies",
        exact: true,
        registry: registryBase,
        extraPackages: [],
      });
      command = { manager: built.manager, verb: built.verb, scope: "local", args: built.args };
    }
  } catch (error) {
    return {
      ok: false,
      boundary: "command",
      failures: [error.message],
      installation,
      currentVersion: info.version,
      targetVersion: target,
    };
  }

  const postVerifySupported =
    scope === "local" || (installation.verified === true && installation.globalRoot !== null);
  return {
    ok: true,
    action: "self-update",
    scope,
    installation,
    packageName: CLI_PACKAGE_NAME,
    currentVersion: info.version,
    targetVersion: target,
    updateAvailable,
    registry: registryBase,
    cwd: commandCwd,
    command: updateAvailable ? command : null,
    preserveSection,
    postVerifySupported,
    globalRoot: installation.globalRoot ?? null,
    failures: [],
    advice: buildUpdateAdvice({
      installation,
      current: info.version,
      latest: target,
      available: updateAvailable,
    }),
  };
}

function updatePlanDifference(expected, actual) {
  if (!isPlainObject(expected)) return ["the expected plan is not an object"];
  const details = [];
  for (const field of [
    "action",
    "scope",
    "packageName",
    "currentVersion",
    "targetVersion",
    "registry",
    "cwd",
  ]) {
    if (expected[field] !== actual[field]) details.push(`${field} changed`);
  }
  const expectedCommand = expected.command;
  const actualCommand = actual.command;
  if (!isPlainObject(expectedCommand) || !isPlainObject(actualCommand)) {
    if (expectedCommand !== actualCommand) details.push("command changed");
  } else {
    if (expectedCommand.manager !== actualCommand.manager) details.push("manager changed");
    if (JSON.stringify(expectedCommand.args) !== JSON.stringify(actualCommand.args)) {
      details.push("command args changed");
    }
  }
  return details;
}

function verifyUpdatedInstallation(plan) {
  if (plan.scope === "local") {
    if (typeof plan.cwd !== "string" || plan.cwd === "") {
      return {
        supported: false,
        verified: false,
        installedVersion: null,
        reason: "no consumer root",
      };
    }
    const local = resolveInstalledCliRoot({ cwd: plan.cwd });
    if (local === null) {
      return {
        supported: true,
        verified: false,
        installedVersion: null,
        reason: `${CLI_PACKAGE_NAME} does not resolve from ${plan.cwd}`,
      };
    }
    const installedVersion =
      typeof local.packageJson.version === "string" ? local.packageJson.version : null;
    return {
      supported: true,
      verified: installedVersion === plan.targetVersion,
      installedVersion,
      root: local.root,
    };
  }
  if (plan.scope === "global" && typeof plan.globalRoot === "string" && plan.globalRoot !== "") {
    const packageDir = join(plan.globalRoot, ...CLI_PACKAGE_NAME.split("/"));
    const packageJsonPath = join(packageDir, "package.json");
    if (!existsSync(packageJsonPath)) {
      return {
        supported: true,
        verified: false,
        installedVersion: null,
        reason: `${CLI_PACKAGE_NAME} is missing at ${packageJsonPath}`,
      };
    }
    try {
      const packageJson = readJsonFile(packageJsonPath);
      const installedVersion = typeof packageJson.version === "string" ? packageJson.version : null;
      return {
        supported: true,
        verified: packageJson.name === CLI_PACKAGE_NAME && installedVersion === plan.targetVersion,
        installedVersion,
        root: packageDir,
      };
    } catch (error) {
      return { supported: true, verified: false, installedVersion: null, reason: error.message };
    }
  }
  return {
    supported: false,
    verified: false,
    installedVersion: null,
    reason: "the global root for this installation was not verified",
  };
}

/**
 * Execute a planned self-update.
 *
 * Mutates only with `confirmed: true`, only for a supported installation
 * context, only through the exact planned npm/pnpm command with
 * `--ignore-scripts`, and never with arbitrary extra arguments. `dryRun` never
 * spawns or writes. When `expectedPlan` is supplied the freshly resolved plan
 * must match it exactly before the first spawn. A manager exit of 0 is
 * post-verified when possible; an unverifiable global install or a version
 * mismatch is reported as an explicit partial state. Nothing is rolled back.
 */
export async function selfUpdate({
  cwd,
  global,
  manager,
  registry,
  registryUrl,
  fetchImpl,
  spawnImpl,
  stdio = "inherit",
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
  maxBytes = UPDATE_CHECK_MAX_BYTES,
  dryRun = false,
  confirmed = false,
  expectedPlan,
  offline = false,
  packageRoot,
  env = process.env,
  targetVersion,
} = {}) {
  const plan = await planSelfUpdate({
    cwd,
    global,
    manager,
    registry,
    registryUrl,
    fetchImpl,
    timeoutMs,
    maxBytes,
    packageRoot,
    env,
    offline,
    targetVersion,
  });
  const base = {
    dryRun,
    changed: false,
    partial: false,
    state: "blocked",
    packageName: CLI_PACKAGE_NAME,
    failures: [],
    plan,
  };
  if (!plan.ok) {
    return { ...base, ok: false, boundary: plan.boundary ?? "plan" };
  }
  if (!plan.updateAvailable) {
    return {
      ...base,
      ok: true,
      state: "up-to-date",
      currentVersion: plan.currentVersion,
      targetVersion: plan.targetVersion,
      command: null,
    };
  }
  if (dryRun) {
    return {
      ...base,
      ok: true,
      state: "dry-run",
      plannedChanges: [
        { kind: "dependency", manager: plan.command.manager, command: plan.command },
      ],
    };
  }
  if (confirmed !== true) {
    return {
      ...base,
      ok: false,
      boundary: "consent",
      failures: [
        `Refusing to update ${CLI_PACKAGE_NAME} without explicit confirmation; re-run with ` +
          "--yes. Nothing was spawned or written.",
      ],
    };
  }
  if (expectedPlan !== undefined && expectedPlan !== null) {
    const differences = updatePlanDifference(expectedPlan, plan);
    if (differences.length > 0) {
      return {
        ...base,
        ok: false,
        boundary: "precondition",
        failures: [
          "Refusing to update: the current self-update plan no longer matches the previewed " +
            `plan (${differences.join("; ")}). Nothing was spawned or written.`,
        ],
      };
    }
  }

  let spawnResult;
  try {
    spawnResult = spawnInstall({
      manager: plan.command.manager,
      args: plan.command.args,
      cwd: plan.cwd ?? undefined,
      spawnImpl,
      stdio,
    });
  } catch (error) {
    return { ...base, ok: false, boundary: "spawn", failures: [error.message] };
  }
  if (spawnResult.status !== 0) {
    return {
      ...base,
      ok: false,
      boundary: "manager",
      state: "manager-failed",
      partial: true,
      managerExit: spawnResult.status ?? null,
      failures: [
        `${plan.command.manager} exited with code ${spawnResult.status ?? "unknown"}; the ` +
          "installation state is unknown and was not rolled back.",
      ],
    };
  }

  let postVerify;
  try {
    postVerify = verifyUpdatedInstallation(plan);
  } catch (error) {
    postVerify = {
      supported: plan.postVerifySupported,
      verified: false,
      installedVersion: null,
      reason: error.message,
    };
  }
  if (postVerify.supported !== true) {
    return {
      ...base,
      ok: true,
      state: "unverified",
      partial: true,
      postVerify,
      failures: [],
      managerExit: 0,
      currentVersion: plan.currentVersion,
      targetVersion: plan.targetVersion,
      command: plan.command,
      note:
        `${plan.command.manager} exited 0, but this installation cannot be verified from ` +
        "here; confirm the installed version manually. Nothing was rolled back.",
    };
  }
  if (postVerify.verified !== true) {
    return {
      ...base,
      ok: false,
      boundary: "verify",
      state: "verify-mismatch",
      partial: true,
      postVerify,
      failures: [
        `${plan.command.manager} exited 0, but the installed ${CLI_PACKAGE_NAME} version is ` +
          `${JSON.stringify(postVerify.installedVersion)} instead of ${JSON.stringify(
            plan.targetVersion,
          )}. No rollback was attempted.`,
      ],
      managerExit: 0,
      currentVersion: plan.currentVersion,
      targetVersion: plan.targetVersion,
      command: plan.command,
    };
  }
  return {
    ...base,
    ok: true,
    changed: true,
    state: "verified",
    postVerify,
    failures: [],
    managerExit: 0,
    installedVersion: postVerify.installedVersion,
    currentVersion: plan.currentVersion,
    targetVersion: plan.targetVersion,
    command: plan.command,
  };
}

/** Human-readable help for the `prism-ds self-update` command. */
export function selfUpdateHelpText() {
  return [
    "Usage: prism-ds self-update [--check] [--cwd <consumer-root>] [--global]",
    "                       [--manager npm|pnpm] [--dry-run] [--yes]",
    "",
    "Update the prism-ds tooling package itself (@prism-system/tools). This is",
    "not the design-system upgrade command: it never touches a design system.",
    "",
    "Options:",
    "  --check               Read-only update check; never writes or spawns.",
    "  --cwd <path>          Consumer root for a local dependency update.",
    "  --global              Authorize a global update (requires --manager when",
    "                        the global root cannot be verified).",
    "  --manager <npm|pnpm>  Explicit package manager; never guessed.",
    "  --dry-run             Resolve and print the fixed command; no spawn/write.",
    "  --yes                 Explicit confirmation for the real update.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}
