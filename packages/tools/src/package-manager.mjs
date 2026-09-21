/**
 * Package-manager detection and fixed-argument command construction for
 * `prism-ds install` / `prism-ds use`.
 *
 * This is the only module allowed to mutate consumer dependencies, and only via
 * an explicit, internally constructed command. It supports npm and pnpm only,
 * never defaults silently, never uses user-supplied arguments, never enables
 * lifecycle scripts, and never uses a shell on POSIX.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { readJsonFile } from "./constants.mjs";

/** Package managers supported for explicit install. */
export const SUPPORTED_MANAGERS = Object.freeze(["npm", "pnpm"]);

/** Supported lockfiles, mapped to their manager. */
export const SUPPORTED_LOCKFILES = Object.freeze({
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
});

/** Safe argument pattern: no whitespace, quotes, or shell metacharacters. */
const SAFE_ARG_PATTERN = /^[A-Za-z0-9@/._:=+~-]+$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reject any argument that could carry shell syntax or whitespace. */
export function assertSafeArgument(value, label = "argument") {
  if (typeof value !== "string" || value === "" || !SAFE_ARG_PATTERN.test(value)) {
    throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * Parse a `packageManager` field (`npm@10.2.0` / `pnpm@10.34.5`).
 * Returns `{ manager, version }` or throws on unsupported/invalid values.
 */
export function parsePackageManagerField(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid "packageManager" field: ${JSON.stringify(value ?? null)}.`);
  }
  const text = value.trim();
  const at = text.lastIndexOf("@");
  const manager = at === -1 ? text : text.slice(0, at);
  const version = at === -1 ? "" : text.slice(at + 1);
  if (!SUPPORTED_MANAGERS.includes(manager)) {
    throw new Error(
      `Unsupported package manager ${JSON.stringify(manager)}; only npm and pnpm are supported.`,
    );
  }
  if (version.trim() === "" || /\s/.test(version)) {
    throw new Error(`Invalid "packageManager" version in ${JSON.stringify(value)}.`);
  }
  return { manager, version };
}

/**
 * Detect the consumer package manager from `packageManager`, or from exactly one
 * supported lockfile. Missing, unsupported, or ambiguous managers fail closed.
 *
 * @returns {{ manager: string, source: string }}
 */
export function detectPackageManager({ consumerRoot } = {}) {
  if (typeof consumerRoot !== "string" || consumerRoot === "") {
    throw new Error("Package-manager detection requires a consumer root.");
  }
  const packageJsonPath = join(consumerRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Consumer package.json not found at ${packageJsonPath}.`);
  }
  let pkg;
  try {
    pkg = readJsonFile(packageJsonPath);
  } catch (error) {
    throw new Error(`Invalid consumer package.json ${packageJsonPath}: ${error.message}`);
  }
  if (!isPlainObject(pkg)) {
    throw new Error(`Consumer package.json ${packageJsonPath} must be a JSON object.`);
  }

  if (pkg.packageManager !== undefined && pkg.packageManager !== null) {
    const { manager } = parsePackageManagerField(pkg.packageManager);
    return { manager, source: "packageManager" };
  }

  const lockfiles = Object.entries(SUPPORTED_LOCKFILES).filter(([file]) =>
    existsSync(join(consumerRoot, file)),
  );
  if (lockfiles.length === 0) {
    throw new Error(
      "Cannot detect a package manager: no valid packageManager field and no supported " +
        "package-lock.json or pnpm-lock.yaml. Add one or set packageManager explicitly.",
    );
  }
  if (lockfiles.length > 1) {
    throw new Error(
      `Ambiguous package manager: found ${lockfiles.map(([file]) => file).join(", ")}. ` +
        "Set packageManager explicitly to choose one.",
    );
  }
  return { manager: lockfiles[0][1], source: lockfiles[0][0] };
}

/**
 * Build the fixed install command. The returned `command`/`args` are the only
 * thing ever executed; there are no user-supplied extra arguments.
 *
 * @returns {{ manager: string, verb: string, args: string[] }}
 */
export function buildInstallCommand({
  manager,
  packageName,
  version,
  saveDev = false,
  exact = false,
  registry,
} = {}) {
  if (!SUPPORTED_MANAGERS.includes(manager)) {
    throw new Error(`Unsupported package manager ${JSON.stringify(manager)}.`);
  }
  const verb = manager === "npm" ? "install" : "add";
  const args = [
    verb,
    saveDev ? "--save-dev" : "--save-prod",
    ...(exact ? ["--save-exact"] : []),
    "--ignore-scripts",
    `--registry=${assertSafeArgument(registry, "registry URL")}`,
    assertSafeArgument(`${packageName}@${version}`, "install target"),
  ];
  return { manager, verb, args };
}

/** Standard Windows argument quoting (fixed internal args only). */
export function quoteWindowsArgument(value) {
  const text = String(value);
  if (text === "") return '""';
  if (!/[\s"^&|<>()%!]/.test(text)) return text;
  const escaped = text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

/**
 * Build the exact spawn plan. POSIX uses the manager directly with `shell:false`;
 * Windows uses a narrowly constrained `cmd.exe /d /s /c` adapter for the
 * allowlisted npm/pnpm shim. No user text is ever executed.
 */
export function buildSpawnPlan({
  manager,
  args,
  platform = process.platform,
  comSpec = process.env.ComSpec,
} = {}) {
  if (!SUPPORTED_MANAGERS.includes(manager)) {
    throw new Error(`Unsupported package manager ${JSON.stringify(manager)}.`);
  }
  if (!Array.isArray(args)) throw new Error("Spawn args must be an array.");
  for (const arg of args) assertSafeArgument(arg, "spawn argument");
  if (platform === "win32") {
    const interpreter = typeof comSpec === "string" && comSpec !== "" ? comSpec : "cmd.exe";
    const line = [manager, ...args].map(quoteWindowsArgument).join(" ");
    return {
      command: interpreter,
      args: ["/d", "/s", "/c", line],
      options: { shell: false, windowsVerbatimArguments: true },
    };
  }
  return { command: manager, args: [...args], options: { shell: false } };
}

/**
 * Run a fixed install command. Returns the spawn result. The default spawn is
 * `spawnSync`; tests may inject `spawnImpl`.
 */
export function spawnInstall({
  manager,
  args,
  cwd,
  stdio = "inherit",
  spawnImpl = spawnSync,
  platform = process.platform,
  comSpec = process.env.ComSpec,
} = {}) {
  const plan = buildSpawnPlan({ manager, args, platform, comSpec });
  const result = spawnImpl(plan.command, plan.args, {
    cwd,
    stdio,
    ...plan.options,
  });
  if (result.error) {
    throw new Error(`Failed to start ${manager}: ${result.error.message}`);
  }
  return result;
}
