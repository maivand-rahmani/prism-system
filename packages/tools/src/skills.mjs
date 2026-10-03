/**
 * `prism-ds skills` engine: offline catalog + installed inventory, explicit
 * preview, and consent-gated mutations through the pinned upstream CLI.
 *
 * Contract summary
 * ----------------
 * - `listSkillCatalog()` / `listInstalledSkills(...)` are offline and read-only.
 * - `planSkillOperation(options)` never spawns a subprocess and never writes.
 *   It may resolve the catalog source's default-branch HEAD to a 40-hex commit
 *   through a bounded, credential-free GitHub API read (injectable `fetchImpl`),
 *   and freezes that revision in `expectedPlan.revision`.
 * - `executeSkillOperation(options)` requires `confirmed: true`, re-verifies the
 *   exact previewed state, and runs the same frozen revision. A preview result
 *   should be passed back as `plan` so a push between preview and consent can
 *   never change what gets installed.
 * - The only executable is the pinned `npx --yes --ignore-scripts skills@1.7.0`.
 *   The only sources, skill names, and agents are the static catalog/allowlist.
 *   There is no arbitrary argument passthrough, no shell string interpolation,
 *   and no `--replace`/destructive override.
 * - Mutations never roll back automatically; a failed verification is reported
 *   and the prism-ds metadata is not updated to claim success.
 *
 * The engine is self-contained: Node built-ins plus the static catalog and the
 * offline inventory module. It never imports the design-systems source
 * repository or another design system.
 */

import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

import {
  SKILL_AGENT_IDS,
  UNIVERSAL_SKILL_AGENT_IDS,
  inspectSkillPath,
  readSkillsStore,
  resolveCanonicalSkillsDir,
  resolveAgentSkillsDir,
  resolveSkillsStorePath,
  writeSkillsStore,
} from "./skill-inventory.mjs";
import { getSkillCatalogEntry, getSkillCatalogSource } from "./skill-catalog.mjs";

export {
  SKILL_AGENT_IDS,
  SKILL_AGENTS,
  SKILLS_STORE_VERSION,
  UNIVERSAL_SKILL_AGENT_IDS,
  createEmptySkillsStore,
  detectInstalledSkillAgents,
  listInstalledSkills,
  readSkillsStore,
  resolveSkillsStorePath,
  writeSkillsStore,
} from "./skill-inventory.mjs";
export {
  FIRSTPARTY_SKILL_SOURCE,
  SKILL_CATALOG,
  SKILL_CATALOG_CATEGORIES,
  SKILL_CATALOG_SOURCES,
  SKILL_CATALOG_TYPES,
  SKILL_REVIEW_STATUSES,
  SKILL_ROLES,
  collectSkillCatalogFailures,
  getSkillCatalogEntry,
  getSkillCatalogEntryBySkill,
  getSkillCatalogSource,
  listSkillCatalog,
  listSkillCatalogSources,
} from "./skill-catalog.mjs";

/** The pinned upstream CLI package. The executable is pinned separately. */
export const SKILLS_CLI_PACKAGE = "skills@1.7.0";
/** The pinned upstream CLI version, exposed for previews and diagnostics. */
export const SKILLS_CLI_VERSION = "1.7.0";
/** The upstream CLI's required Node runtime. Older runtimes get a preview warning. */
export const MIN_SKILLS_NODE_VERSION = "22.20.0";
/** The executable used to run the pinned CLI. */
export const SKILLS_CLI_EXECUTABLE = "npx";
/** Supported mutation actions. */
export const SKILL_OPERATION_ACTIONS = Object.freeze(["add", "update", "remove"]);

const SAFE_SKILL_ARG_PATTERN = /^[A-Za-z0-9@/._:=+~-]+$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SOURCE_SPEC_PATTERN =
  /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+\/tree\/[0-9a-f]{40}$/;
const GITHUB_API_HOST = "api.github.com";
const DEFAULT_RESOLVE_TIMEOUT_MS = 10_000;
const DEFAULT_RESOLVE_MAX_BYTES = 65_536;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function operationFailure(action, failures, extra = {}) {
  return { ok: false, action: action ?? null, failures: [...failures], ...extra };
}

function toText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

function tail(text, limit = 500) {
  const trimmed = text.trim();
  return trimmed.length > limit ? `…${trimmed.slice(-limit)}` : trimmed;
}

function compareVersions(a, b) {
  const left = String(a)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Hard runtime guard for the pinned skills CLI. Below the minimum the mutation
 * operations fail closed before any network read or subprocess; the catalog and
 * inventory stay usable on the package's own Node floor.
 */
export function checkSkillsNodeVersion(nodeVersion) {
  if (compareVersions(nodeVersion, MIN_SKILLS_NODE_VERSION) < 0) {
    return {
      ok: false,
      failures: [
        `The pinned ${SKILLS_CLI_PACKAGE} requires Node >= ${MIN_SKILLS_NODE_VERSION}; the current runtime is ${nodeVersion}. Upgrade Node to run skills add/update/remove. Catalog and inventory remain available.`,
      ],
    };
  }
  return { ok: true, failures: [] };
}

/** Reject any argument that could carry shell syntax or whitespace. */
export function assertSafeSkillArgument(value, label = "skills argument") {
  if (typeof value !== "string" || value === "" || !SAFE_SKILL_ARG_PATTERN.test(value)) {
    throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}.`);
  }
  return value;
}

/** Standard Windows argument quoting for the fixed, already-validated tokens. */
export function quoteWindowsSkillArgument(value) {
  const text = String(value);
  if (text === "") return '""';
  if (!/[\s"^&|<>()%!]/.test(text)) return text;
  const escaped = text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

/**
 * Build the exact, fixed argv for a skill mutation. No caller-provided text is
 * ever appended: every token is validated and assembled here.
 *
 * @returns {string[]} frozen argv (excluding the executable)
 */
export function buildSkillCommandArgs({ action, sourceSpec, skillName, agents, scope } = {}) {
  if (!SKILL_OPERATION_ACTIONS.includes(action)) {
    throw new Error(`Unsupported skills action ${JSON.stringify(action)}.`);
  }
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new Error("Skill mutations require at least one selected agent.");
  }
  const args = ["--yes", "--ignore-scripts", SKILLS_CLI_PACKAGE];
  if (action === "add" || action === "update") {
    if (typeof sourceSpec !== "string" || !SOURCE_SPEC_PATTERN.test(sourceSpec)) {
      throw new Error(`Unsafe skills source spec: ${JSON.stringify(sourceSpec)}.`);
    }
    assertSafeSkillArgument(skillName, "skill name");
    args.push("add", sourceSpec, "--skill", skillName);
    args.push("--agent", ...agents);
    args.push("-y", "--json");
  } else {
    assertSafeSkillArgument(skillName, "skill name");
    args.push("remove", skillName, "--agent", ...agents, "-y");
  }
  if (scope === "global") args.push("--global");
  for (const arg of args) assertSafeSkillArgument(arg, "skills argument");
  return Object.freeze(args);
}

/**
 * Build the exact spawn plan. POSIX runs `npx` directly with `shell:false`;
 * Windows uses a narrowly constrained `cmd.exe /d /s /c` adapter for the
 * allowlisted `npx` shim. No user text is ever executed.
 */
export function buildSkillsSpawnPlan({
  args,
  platform = process.platform,
  comSpec = process.env.ComSpec,
} = {}) {
  if (!Array.isArray(args) || args.length === 0)
    throw new Error("Skills spawn args must be a non-empty array.");
  for (const arg of args) assertSafeSkillArgument(arg, "skills spawn argument");
  if (platform === "win32") {
    const interpreter = typeof comSpec === "string" && comSpec !== "" ? comSpec : "cmd.exe";
    const line = [SKILLS_CLI_EXECUTABLE, ...args].map(quoteWindowsSkillArgument).join(" ");
    return {
      command: interpreter,
      args: ["/d", "/s", "/c", line],
      options: { shell: false, windowsVerbatimArguments: true },
    };
  }
  return { command: SKILLS_CLI_EXECUTABLE, args: [...args], options: { shell: false } };
}

/**
 * Resolve a catalog source's default-branch HEAD to a 40-hex commit through a
 * bounded, credential-free GitHub API read. The fetch is injectable; redirects
 * are rejected, the body is size-limited, and only a valid commit SHA is
 * accepted.
 */
export async function resolveSkillSourceRevision({
  source,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS,
  maxBytes = DEFAULT_RESOLVE_MAX_BYTES,
} = {}) {
  const sourceRecord = typeof source === "string" ? getSkillCatalogSource(source) : source;
  if (
    !sourceRecord ||
    typeof sourceRecord.owner !== "string" ||
    typeof sourceRecord.repo !== "string"
  ) {
    return { ok: false, failures: [`Unknown skill catalog source ${JSON.stringify(source)}.`] };
  }
  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      failures: ["Resolving a skill source revision requires a fetch implementation."],
    };
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { ok: false, failures: ["timeoutMs must be a positive number."] };
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return { ok: false, failures: ["maxBytes must be a positive number."] };
  }
  const url = `https://${GITHUB_API_HOST}/repos/${sourceRecord.owner}/${sourceRecord.repo}/commits/HEAD`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "prism-ds-skills",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason =
      error?.name === "TimeoutError" ? `timed out after ${timeoutMs}ms` : error.message;
    return { ok: false, failures: [`Could not resolve ${sourceRecord.id} at ${url}: ${reason}.`] };
  }
  if (!response || typeof response.status !== "number") {
    return {
      ok: false,
      failures: [`Could not resolve ${sourceRecord.id}: the fetch returned no response.`],
    };
  }
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, failures: [`Refusing redirected skill source resolution from ${url}.`] };
  }
  if (!response.ok) {
    return {
      ok: false,
      failures: [`Could not resolve ${sourceRecord.id}: GitHub returned HTTP ${response.status}.`],
    };
  }
  const contentLength = Number(response.headers?.get?.("content-length") ?? Number.NaN);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, failures: [`Skill source response exceeded ${maxBytes} bytes.`] };
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    return { ok: false, failures: [`Could not read the skill source response: ${error.message}.`] };
  }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, failures: [`Skill source response exceeded ${maxBytes} bytes.`] };
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, failures: ["Skill source response was not valid JSON."] };
  }
  const revision = typeof payload?.sha === "string" ? payload.sha.toLowerCase() : "";
  if (!COMMIT_PATTERN.test(revision)) {
    return { ok: false, failures: ["Skill source response did not contain a 40-hex commit SHA."] };
  }
  return {
    ok: true,
    source: sourceRecord.id,
    url,
    revision,
    sourceSpec: `https://github.com/${sourceRecord.owner}/${sourceRecord.repo}/tree/${revision}`,
  };
}

function normalizeAgentSelection(agents) {
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const invalid = agents.filter((agent) => !SKILL_AGENT_IDS.includes(agent));
  if (invalid.length > 0) return null;
  return SKILL_AGENT_IDS.filter((agent) => agents.includes(agent));
}

function findStoreEntry(store, catalogEntry) {
  const direct = store.skills[catalogEntry.id];
  if (direct && direct.skill === catalogEntry.skill) return direct;
  return Object.values(store.skills).find((entry) => entry.skill === catalogEntry.skill) ?? null;
}

function findStoreEntryKey(store, entry) {
  const key = Object.keys(store.skills).find((candidate) => store.skills[candidate] === entry);
  return key ?? entry.id;
}

function scopeRootPath(scope, { cwd, homeDir }) {
  return scope === "global" ? resolve(homeDir) : resolve(cwd);
}

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function relativeToScope(scopeRoot, absolutePath) {
  return toPosixPath(relative(scopeRoot, resolve(absolutePath)));
}

async function normalizeSkillOperation(options) {
  const failures = [];
  const action = options.action ?? null;
  if (!SKILL_OPERATION_ACTIONS.includes(action)) {
    failures.push(`action must be one of ${SKILL_OPERATION_ACTIONS.join(", ")}.`);
  }
  const catalogEntry =
    typeof options.skillId === "string" ? getSkillCatalogEntry(options.skillId) : null;
  if (!catalogEntry) {
    failures.push(
      `skillId must be an allowlisted catalog id (${JSON.stringify(options.skillId ?? null)} is not).`,
    );
  }
  const scope = options.scope === undefined ? "project" : options.scope;
  if (scope !== "project" && scope !== "global") {
    failures.push('scope must be "project" or "global".');
  }
  const agents = normalizeAgentSelection(options.agents);
  if (!agents) {
    failures.push("At least one allowlisted agent is required for add/update/remove.");
  }
  if (typeof options.cwd !== "string" || options.cwd === "") {
    failures.push("A cwd root is required.");
  }
  const cwd = typeof options.cwd === "string" && options.cwd !== "" ? resolve(options.cwd) : null;
  const homeDir = resolve(options.homeDir ?? homedir());
  const env = isPlainObject(options.env) ? options.env : process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const nodeVersion =
    typeof options.nodeVersion === "string" ? options.nodeVersion : process.versions.node;
  const nodeCheck = checkSkillsNodeVersion(nodeVersion);
  if (!nodeCheck.ok) failures.push(...nodeCheck.failures);
  const timeoutMs = options.resolveTimeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS;
  const maxBytes = options.resolveMaxBytes ?? DEFAULT_RESOLVE_MAX_BYTES;
  if (failures.length > 0) return { ok: false, failures };
  try {
    const info = await stat(cwd);
    if (!info.isDirectory()) failures.push(`cwd is not a directory: ${cwd}.`);
  } catch {
    failures.push(`cwd does not exist: ${cwd}.`);
  }
  if (failures.length > 0) return { ok: false, failures };
  const storePath = resolveSkillsStorePath({ scope, cwd, homeDir });
  return {
    ok: true,
    action,
    catalogEntry,
    scope,
    agents,
    cwd,
    homeDir,
    env,
    fetchImpl,
    now,
    nodeVersion,
    timeoutMs,
    maxBytes,
    storePath,
  };
}

async function snapshotSkillTargets(context) {
  const { catalogEntry, scope, agents, cwd, homeDir, env } = context;
  const skillName = catalogEntry.skill;
  const scopeRoot = scopeRootPath(scope, { cwd, homeDir });
  const canonical = resolveCanonicalSkillsDir({ scope, cwd, homeDir });
  const entries = new Map();
  const add = (dir, kind, agent) => {
    const abs = resolve(join(dir, skillName));
    if (entries.has(abs)) return;
    entries.set(abs, { path: abs, kind, agent });
  };
  add(canonical, "canonical", null);
  const selectedPaths = new Set([resolve(join(canonical, skillName))]);
  for (const agentId of agents) {
    const dir = resolveAgentSkillsDir(agentId, { scope, cwd, homeDir, env });
    const selected = resolve(join(dir, skillName));
    add(dir, dir === canonical ? "canonical" : "agent", dir === canonical ? null : agentId);
    selectedPaths.add(selected);
  }
  for (const agentId of SKILL_AGENT_IDS) {
    const dir = resolveAgentSkillsDir(agentId, { scope, cwd, homeDir, env });
    add(dir, dir === canonical ? "canonical" : "agent", dir === canonical ? null : agentId);
  }
  const targets = [];
  for (const [abs, meta] of entries) {
    const inspected = await inspectSkillPath(abs, scopeRoot);
    targets.push({
      ...meta,
      relativePath: relativeToScope(scopeRoot, abs),
      selected: selectedPaths.has(abs),
      exists: inspected.exists,
      symlink: inspected.symlink,
      broken: inspected.broken,
      contained: inspected.contained,
      isDirectory: inspected.isDirectory,
      hasSkillMd: inspected.hasSkillMd,
      fingerprint: inspected.fingerprint,
    });
  }
  targets.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "canonical" ? -1 : b.kind === "canonical" ? 1 : 0;
    return SKILL_AGENT_IDS.indexOf(a.agent) - SKILL_AGENT_IDS.indexOf(b.agent);
  });
  return targets;
}

function recordedPlacementProblems(entry, targets, scopeRoot) {
  const byPath = new Map(targets.map((target) => [target.path, target]));
  const problems = [];
  for (const recorded of entry.placements) {
    const abs = resolve(scopeRoot, recorded.path);
    const actual = byPath.get(abs);
    if (
      !actual ||
      !actual.exists ||
      !actual.contained ||
      actual.broken ||
      actual.fingerprint === null ||
      actual.fingerprint !== recorded.fingerprint
    ) {
      problems.push(recorded.path);
    }
  }
  return problems;
}

function unrecordedPlacementPaths(entry, targets, scopeRoot) {
  const recorded = new Set(entry.placements.map((placement) => resolve(scopeRoot, placement.path)));
  return targets
    .filter((target) => target.exists && !recorded.has(target.path))
    .map((target) => target.path);
}

function sameAgentSet(left, right) {
  return left.length === right.length && left.every((agent) => right.includes(agent));
}

function formatPaths(paths) {
  return paths.map((path) => JSON.stringify(path)).join(", ");
}

async function planAddOrUpdate(context) {
  const { action, catalogEntry, scope, agents, cwd, homeDir } = context;
  const sourceRecord = getSkillCatalogSource(catalogEntry.source);
  if (!sourceRecord) {
    return operationFailure(action, [
      `Catalog source ${JSON.stringify(catalogEntry.source)} is not allowlisted.`,
    ]);
  }
  const resolution = await resolveSkillSourceRevision({
    source: sourceRecord,
    fetchImpl: context.fetchImpl,
    timeoutMs: context.timeoutMs,
    maxBytes: context.maxBytes,
  });
  if (!resolution.ok) return operationFailure(action, resolution.failures);

  const storeResult = await readSkillsStore({ scope, cwd, homeDir });
  if (!storeResult.ok) return operationFailure(action, storeResult.failures);
  const existing = findStoreEntry(storeResult.store, catalogEntry);
  const scopeRoot = scopeRootPath(scope, { cwd, homeDir });
  const targets = await snapshotSkillTargets(context);
  const warnings = [];
  const failures = [];
  let noop = false;
  let idempotent = false;

  const existingPresent = targets.filter((target) => target.exists);
  if (action === "add") {
    if (existingPresent.length === 0) {
      if (existing) {
        failures.push(
          `prism-ds metadata records "${catalogEntry.skill}" but no installed files were found; refusing to reinstall over an unknown state. Remove the metadata or reinstall manually.`,
        );
      }
    } else if (!existing) {
      failures.push(
        `An existing unmanaged "${catalogEntry.skill}" placement was found at ${formatPaths(
          existingPresent.map((target) => target.path),
        )}; refusing to replace it. Remove it with the upstream skills CLI first.`,
      );
    } else if (existing.source !== catalogEntry.source) {
      failures.push(
        `An installed "${catalogEntry.skill}" belongs to source ${JSON.stringify(existing.source)}, not ${JSON.stringify(catalogEntry.source)}; refusing an ambiguous same-name replacement.`,
      );
    } else if (existing.scope !== scope) {
      failures.push(
        `"${catalogEntry.skill}" is managed at the ${existing.scope} scope, not ${scope}.`,
      );
    } else {
      const problems = recordedPlacementProblems(existing, targets, scopeRoot);
      const unrecorded = unrecordedPlacementPaths(existing, targets, scopeRoot);
      if (problems.length > 0) {
        failures.push(
          `The managed install of "${catalogEntry.skill}" is modified or incomplete at ${formatPaths(
            problems,
          )}; refusing to replace it. Use update only for an unchanged install.`,
        );
      } else if (unrecorded.length > 0) {
        failures.push(
          `Unrecorded "${catalogEntry.skill}" placements exist at ${formatPaths(
            unrecorded,
          )}; prism-ds metadata cannot verify them; refusing to replace an unverifiable state.`,
        );
      } else if (resolution.revision !== existing.revision) {
        failures.push(
          `"${catalogEntry.skill}" is installed at revision ${existing.revision}; use the update action to move to ${resolution.revision}.`,
        );
      } else {
        idempotent = true;
        noop = sameAgentSet(agents, existing.agents);
        warnings.push(
          noop
            ? `"${catalogEntry.skill}" is already installed at the previewed revision; add is a verified no-op.`
            : `"${catalogEntry.skill}" is verified unchanged; add will re-apply the selected agent placements.`,
        );
      }
    }
  } else {
    // update
    if (!existing) {
      failures.push(
        `"${catalogEntry.skill}" is not managed by prism-ds; refusing to update an unmanaged or unverifiable target.`,
      );
    } else if (existing.source !== catalogEntry.source) {
      failures.push(
        `The managed "${catalogEntry.skill}" belongs to source ${JSON.stringify(existing.source)}, not ${JSON.stringify(catalogEntry.source)}.`,
      );
    } else if (existing.scope !== scope) {
      failures.push(
        `"${catalogEntry.skill}" is managed at the ${existing.scope} scope, not ${scope}.`,
      );
    } else if (existingPresent.length === 0) {
      failures.push(
        `prism-ds metadata records "${catalogEntry.skill}" but no installed files were found; refusing to update an unverifiable target.`,
      );
    } else {
      const problems = recordedPlacementProblems(existing, targets, scopeRoot);
      const unrecorded = unrecordedPlacementPaths(existing, targets, scopeRoot);
      if (problems.length > 0) {
        failures.push(
          `The managed install of "${catalogEntry.skill}" is modified or incomplete at ${formatPaths(
            problems,
          )}; refusing to update it.`,
        );
      } else if (unrecorded.length > 0) {
        failures.push(
          `Unrecorded "${catalogEntry.skill}" placements exist at ${formatPaths(
            unrecorded,
          )}; prism-ds metadata cannot verify them; refusing to update an unverifiable state.`,
        );
      } else if (!sameAgentSet(agents, existing.agents)) {
        failures.push(
          `The requested agents (${agents.join(", ")}) differ from the managed install (${existing.agents.join(
            ", ",
          )}); remove and re-add with the desired agents instead.`,
        );
      } else if (resolution.revision === existing.revision) {
        noop = true;
        warnings.push(
          `"${catalogEntry.skill}" is already at the previewed revision ${resolution.revision}; update is a verified no-op.`,
        );
      }
    }
  }

  const canonicalTarget = targets.find((target) => target.kind === "canonical");
  if (canonicalTarget?.exists) {
    warnings.push(
      `The canonical placement ${JSON.stringify(canonicalTarget.path)} is shared by universal agents; reinstalling it also affects ${
        UNIVERSAL_SKILL_AGENT_IDS.filter((agent) => !agents.includes(agent)).join(", ") ||
        "other universal agents"
      }.`,
    );
  }
  const foreign = targets.filter((target) => target.exists && !target.selected);
  if (foreign.length > 0) {
    warnings.push(
      `Other agent placements for "${catalogEntry.skill}" will not be touched: ${formatPaths(
        foreign.map((target) => target.path),
      )}.`,
    );
  }
  if (failures.length > 0) return operationFailure(action, failures, { skillId: catalogEntry.id });

  const commandArgs = buildSkillCommandArgs({
    action,
    sourceSpec: resolution.sourceSpec,
    skillName: catalogEntry.skill,
    agents,
    scope,
  });
  return {
    ok: true,
    action,
    skillId: catalogEntry.id,
    skill: catalogEntry,
    source: { ...sourceRecord, revision: resolution.revision, spec: resolution.sourceSpec },
    scope,
    agents,
    cwd,
    homeDir,
    storePath: context.storePath,
    command: {
      executable: SKILLS_CLI_EXECUTABLE,
      package: SKILLS_CLI_PACKAGE,
      args: commandArgs,
      cwd,
      scope,
    },
    targets,
    expectedPlan: {
      action,
      skillId: catalogEntry.id,
      skillName: catalogEntry.skill,
      source: catalogEntry.source,
      scope,
      agents,
      cwd,
      homeDir,
      storePath: context.storePath,
      revision: resolution.revision,
      sourceSpec: resolution.sourceSpec,
      metadataRevision: existing?.revision ?? null,
      metadataEntry: existing ?? null,
      noop,
      idempotent,
      canonicalSelected: agents.some((agent) => UNIVERSAL_SKILL_AGENT_IDS.includes(agent)),
      before: targets,
    },
    warnings,
  };
}

async function planRemove(context) {
  const { catalogEntry, scope, agents, cwd, homeDir } = context;
  const storeResult = await readSkillsStore({ scope, cwd, homeDir });
  if (!storeResult.ok) return operationFailure("remove", storeResult.failures);
  const existing = findStoreEntry(storeResult.store, catalogEntry);
  if (!existing) {
    return operationFailure("remove", [
      `"${catalogEntry.skill}" is not managed by prism-ds; refusing to remove an unmanaged skill.`,
    ]);
  }
  if (existing.source !== catalogEntry.source) {
    return operationFailure("remove", [
      `The managed "${catalogEntry.skill}" belongs to source ${JSON.stringify(existing.source)}, not ${JSON.stringify(catalogEntry.source)}.`,
    ]);
  }
  if (existing.scope !== scope) {
    return operationFailure("remove", [
      `"${catalogEntry.skill}" is managed at the ${existing.scope} scope, not ${scope}.`,
    ]);
  }
  const scopeRoot = scopeRootPath(scope, { cwd, homeDir });
  const targets = await snapshotSkillTargets(context);
  const selectedExisting = targets.filter((target) => target.selected && target.exists);
  if (selectedExisting.length === 0) {
    return operationFailure("remove", [
      `No installed "${catalogEntry.skill}" placement was found for the selected agents (${agents.join(", ")}).`,
    ]);
  }
  const canonicalTarget = targets.find((target) => target.kind === "canonical");
  const canonicalSelected = agents.some((agent) => UNIVERSAL_SKILL_AGENT_IDS.includes(agent));
  if (canonicalTarget?.exists && !canonicalSelected) {
    return operationFailure("remove", [
      `The shared canonical placement ${JSON.stringify(canonicalTarget.path)} exists, but none of the selected agents use it; refusing to remove a shared placement that was not explicitly selected.`,
    ]);
  }

  const warnings = [];
  const modifiedTargets = [];
  for (const recorded of existing.placements) {
    const abs = resolve(scopeRoot, recorded.path);
    const actual = targets.find((target) => target.path === abs);
    if (actual?.exists && actual.fingerprint !== recorded.fingerprint)
      modifiedTargets.push(recorded.path);
  }
  if (modifiedTargets.length > 0) {
    warnings.push(
      `Selected targets contain local modifications (${formatPaths(
        modifiedTargets,
      )}); the explicit removal will delete them.`,
    );
  }
  if (canonicalSelected && canonicalTarget?.exists) {
    warnings.push(
      `The canonical placement ${JSON.stringify(canonicalTarget.path)} is shared; the upstream CLI may retain it when another agent still uses it.`,
    );
  }
  const foreign = targets.filter((target) => target.exists && !target.selected);
  if (foreign.length > 0) {
    warnings.push(
      `Unselected placements for "${catalogEntry.skill}" remain untouched: ${formatPaths(
        foreign.map((target) => target.path),
      )}.`,
    );
  }
  const recordedPaths = new Set(existing.placements.map((placement) => placement.path));
  const unrecorded = selectedExisting.filter((target) => !recordedPaths.has(target.relativePath));
  if (unrecorded.length > 0) {
    warnings.push(
      `Some selected placements are not recorded in prism-ds metadata and will still be removed: ${formatPaths(
        unrecorded.map((target) => target.path),
      )}.`,
    );
  }

  const commandArgs = buildSkillCommandArgs({
    action: "remove",
    skillName: catalogEntry.skill,
    agents,
    scope,
  });
  return {
    ok: true,
    action: "remove",
    skillId: catalogEntry.id,
    skill: catalogEntry,
    source: getSkillCatalogSource(catalogEntry.source),
    scope,
    agents,
    cwd,
    homeDir,
    storePath: context.storePath,
    command: {
      executable: SKILLS_CLI_EXECUTABLE,
      package: SKILLS_CLI_PACKAGE,
      args: commandArgs,
      cwd,
      scope,
    },
    targets,
    expectedPlan: {
      action: "remove",
      skillId: catalogEntry.id,
      skillName: catalogEntry.skill,
      source: catalogEntry.source,
      scope,
      agents,
      cwd,
      homeDir,
      storePath: context.storePath,
      revision: existing.revision,
      sourceSpec: null,
      metadataRevision: existing.revision,
      metadataEntry: existing,
      noop: false,
      idempotent: false,
      canonicalSelected,
      modifiedTargets,
      before: targets,
    },
    warnings,
  };
}

/**
 * Build an explicit preview. Never spawns a subprocess and never writes.
 * The preview may perform one bounded GitHub read to freeze the source
 * revision (`expectedPlan.revision`); pass the returned plan to
 * `executeSkillOperation` so consent applies to exactly that revision.
 */
export async function planSkillOperation(options = {}) {
  const action = options.action ?? null;
  try {
    const context = await normalizeSkillOperation(options);
    if (!context.ok) return operationFailure(action, context.failures);
    if (context.action === "remove") return await planRemove(context);
    return await planAddOrUpdate(context);
  } catch (error) {
    return operationFailure(action, [`Unexpected skills planning error: ${error.message}`]);
  }
}

/** Derive the exact authorized target descriptors for a catalog skill and request. */
function deriveTargetDescriptors(skillName, { scope, cwd, homeDir, env }) {
  const scopeRoot = scopeRootPath(scope, { cwd, homeDir });
  const canonical = resolveCanonicalSkillsDir({ scope, cwd, homeDir });
  const descriptors = new Map();
  const add = (dir, kind, agent) => {
    const path = resolve(join(dir, skillName));
    if (descriptors.has(path)) return;
    descriptors.set(path, { path, kind, agent, relativePath: relativeToScope(scopeRoot, path) });
  };
  add(canonical, "canonical", null);
  for (const agentId of SKILL_AGENT_IDS) {
    const dir = resolveAgentSkillsDir(agentId, { scope, cwd, homeDir, env });
    add(dir, dir === canonical ? "canonical" : "agent", dir === canonical ? null : agentId);
  }
  return descriptors;
}

/** Reject previewed target lists that do not exactly match the authorized paths. */
function validatePlanTargets(label, entries, descriptors, failures) {
  if (!Array.isArray(entries)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const seen = new Set();
  for (const entry of entries) {
    if (!isPlainObject(entry) || typeof entry.path !== "string") {
      failures.push(`${label} entries must record a path.`);
      continue;
    }
    const expected = descriptors.get(entry.path);
    if (!expected) {
      failures.push(`${label} references an unauthorized path ${JSON.stringify(entry.path)}.`);
      continue;
    }
    if (seen.has(entry.path)) {
      failures.push(`${label} duplicates path ${JSON.stringify(entry.path)}.`);
      continue;
    }
    seen.add(entry.path);
    if (entry.kind !== expected.kind || (entry.agent ?? null) !== expected.agent) {
      failures.push(`${label} mislabels ${JSON.stringify(entry.path)}.`);
    }
    if (entry.relativePath !== expected.relativePath) {
      failures.push(`${label} has a relative path mismatch for ${JSON.stringify(entry.path)}.`);
    }
    if (
      typeof entry.selected !== "boolean" ||
      typeof entry.exists !== "boolean" ||
      typeof entry.symlink !== "boolean" ||
      typeof entry.broken !== "boolean" ||
      typeof entry.contained !== "boolean"
    ) {
      failures.push(`${label} has malformed state flags for ${JSON.stringify(entry.path)}.`);
    }
    if (entry.fingerprint !== null && !/^[0-9a-f]{64}$/.test(entry.fingerprint ?? "")) {
      failures.push(`${label} has an invalid fingerprint for ${JSON.stringify(entry.path)}.`);
    }
  }
  if (seen.size !== descriptors.size) {
    failures.push(`${label} does not cover exactly the authorized target paths.`);
  }
}

/** Validate the plan's metadata snapshot against the current catalog and scope. */
function validatePlanMetadataEntry(
  entry,
  { action, catalogEntry, scope, scopeRoot, descriptors, failures },
) {
  if (entry === null || entry === undefined) {
    if (action !== "add") failures.push(`plan metadata entry is required for ${action}.`);
    return;
  }
  if (!isPlainObject(entry)) {
    failures.push("plan metadata entry must be an object.");
    return;
  }
  if (entry.id !== catalogEntry.id || entry.skill !== catalogEntry.skill) {
    failures.push("plan metadata entry does not match the current catalog skill.");
  }
  if (entry.source !== catalogEntry.source) {
    failures.push("plan metadata entry source does not match the current catalog source.");
  }
  if (entry.scope !== scope) failures.push("plan metadata entry scope does not match the request.");
  if (!COMMIT_PATTERN.test(entry.revision ?? "")) {
    failures.push("plan metadata entry revision is invalid.");
  }
  if (
    !Array.isArray(entry.agents) ||
    entry.agents.some((agent) => !SKILL_AGENT_IDS.includes(agent))
  ) {
    failures.push("plan metadata entry agents are invalid.");
  }
  if (!Array.isArray(entry.placements)) {
    failures.push("plan metadata entry placements must be an array.");
    return;
  }
  for (const placement of entry.placements) {
    if (!isPlainObject(placement) || typeof placement.path !== "string") {
      failures.push("plan metadata placements must record a relative path.");
      continue;
    }
    const expected = descriptors.get(resolve(scopeRoot, placement.path));
    if (!expected) {
      failures.push(
        `plan metadata placement references an unauthorized path ${JSON.stringify(placement.path)}.`,
      );
      continue;
    }
    if (placement.kind !== expected.kind || (placement.agent ?? null) !== expected.agent) {
      failures.push(`plan metadata placement mislabels ${JSON.stringify(placement.path)}.`);
    }
    if (typeof placement.fingerprint !== "string" || placement.fingerprint === "") {
      failures.push(
        `plan metadata placement fingerprint is required for ${JSON.stringify(placement.path)}.`,
      );
    }
  }
}

/** Exact comparison of a provided command against the trusted derived command. */
function commandMatches(actual, derived) {
  if (!isPlainObject(actual)) return false;
  if (
    actual.executable !== derived.executable ||
    actual.package !== derived.package ||
    actual.cwd !== derived.cwd ||
    actual.scope !== derived.scope
  ) {
    return false;
  }
  if (!Array.isArray(actual.args) || actual.args.length !== derived.args.length) return false;
  return actual.args.every((arg, index) => arg === derived.args[index]);
}

/**
 * Treat a caller-provided plan as untrusted data: re-derive the authorized
 * catalog entry, scope, agents, roots, store, targets, frozen revision and
 * command from the explicit request plus the current catalog, and reject any
 * plan that differs. The plan is never silently normalized into something the
 * reviewer did not see; it either matches exactly or the mutation is refused.
 */
async function validateProvidedPlan(options) {
  const plan = options.plan;
  const action = options.action ?? plan?.action ?? null;
  if (!isPlainObject(plan) || plan.ok !== true || !isPlainObject(plan.expectedPlan)) {
    return operationFailure(action, ["plan must be a successful planSkillOperation result."]);
  }
  const failures = [];
  if (!SKILL_OPERATION_ACTIONS.includes(options.action)) {
    failures.push("execute with a saved plan requires an explicit action.");
  }
  if (typeof options.skillId !== "string" || options.skillId === "") {
    failures.push("execute with a saved plan requires an explicit skillId.");
  }
  if (!Array.isArray(options.agents) || options.agents.length === 0) {
    failures.push("execute with a saved plan requires an explicit agent selection.");
  }
  if (typeof options.cwd !== "string" || options.cwd === "") {
    failures.push("execute with a saved plan requires an explicit cwd.");
  }
  if (failures.length > 0) return operationFailure(action, failures);

  const requestedAction = options.action;
  const requestedAgents = normalizeAgentSelection(options.agents);
  if (!requestedAgents) failures.push("agents must be a non-empty allowlisted selection.");
  const scope = options.scope === undefined ? "project" : options.scope;
  if (scope !== "project" && scope !== "global") {
    failures.push('scope must be "project" or "global".');
  }
  const cwd = resolve(options.cwd);
  const homeDir = resolve(options.homeDir ?? homedir());
  const env = isPlainObject(options.env) ? options.env : process.env;
  const nodeVersion =
    typeof options.nodeVersion === "string" ? options.nodeVersion : process.versions.node;
  const catalogEntry = getSkillCatalogEntry(options.skillId);
  if (!catalogEntry) {
    failures.push(
      `skillId must be an allowlisted catalog id (${JSON.stringify(options.skillId)} is not).`,
    );
  }
  if (failures.length > 0) return operationFailure(action, failures);

  const nodeCheck = checkSkillsNodeVersion(nodeVersion);
  if (!nodeCheck.ok) return operationFailure(requestedAction, nodeCheck.failures);

  try {
    const info = await stat(cwd);
    if (!info.isDirectory()) failures.push(`cwd is not a directory: ${cwd}.`);
  } catch {
    failures.push(`cwd does not exist: ${cwd}.`);
  }

  if (plan.action !== requestedAction)
    failures.push("plan action does not match the requested action.");
  if (plan.skillId !== catalogEntry.id) {
    failures.push("plan skillId does not match the requested catalog id.");
  }
  if (plan.scope !== scope) failures.push("plan scope does not match the requested scope.");
  if (!Array.isArray(plan.agents) || !sameAgentSet(requestedAgents, plan.agents)) {
    failures.push("plan agents do not match the requested agents.");
  }
  if (plan.cwd !== cwd) failures.push("plan cwd does not match the requested cwd.");
  if (plan.homeDir !== homeDir) failures.push("plan homeDir does not match the requested homeDir.");
  if (
    !isPlainObject(plan.skill) ||
    plan.skill.id !== catalogEntry.id ||
    plan.skill.skill !== catalogEntry.skill ||
    plan.skill.source !== catalogEntry.source
  ) {
    failures.push("plan skill does not match the current catalog entry.");
  }

  const expected = plan.expectedPlan;
  const storePath = resolveSkillsStorePath({ scope, cwd, homeDir });
  if (plan.storePath !== storePath || expected.storePath !== storePath) {
    failures.push("plan store path does not match the authorized scope store.");
  }
  if (expected.action !== requestedAction) failures.push("expectedPlan action does not match.");
  if (expected.skillId !== catalogEntry.id || expected.skillName !== catalogEntry.skill) {
    failures.push("expectedPlan skill does not match the current catalog.");
  }
  if (expected.source !== catalogEntry.source) {
    failures.push("expectedPlan source does not match the current catalog source.");
  }
  if (expected.scope !== scope) failures.push("expectedPlan scope does not match.");
  if (expected.cwd !== cwd || expected.homeDir !== homeDir) {
    failures.push("expectedPlan roots do not match the requested roots.");
  }
  if (!Array.isArray(expected.agents) || !sameAgentSet(requestedAgents, expected.agents)) {
    failures.push("expectedPlan agents do not match the requested agents.");
  }

  const descriptors = deriveTargetDescriptors(catalogEntry.skill, { scope, cwd, homeDir, env });
  const scopeRoot = scopeRootPath(scope, { cwd, homeDir });
  validatePlanTargets("plan targets", plan.targets, descriptors, failures);
  validatePlanTargets("expectedPlan.before", expected.before, descriptors, failures);

  const sourceRecord = getSkillCatalogSource(catalogEntry.source);
  let derivedSpec = null;
  if (requestedAction !== "remove") {
    if (typeof expected.revision !== "string" || !COMMIT_PATTERN.test(expected.revision)) {
      failures.push("plan is missing a valid frozen 40-hex source revision.");
    } else {
      derivedSpec = `https://github.com/${sourceRecord.owner}/${sourceRecord.repo}/tree/${expected.revision}`;
      if (expected.sourceSpec !== derivedSpec) {
        failures.push(
          "plan source spec does not belong to the current catalog source and frozen revision.",
        );
      }
      if (
        !isPlainObject(plan.source) ||
        plan.source.id !== sourceRecord.id ||
        plan.source.owner !== sourceRecord.owner ||
        plan.source.repo !== sourceRecord.repo ||
        plan.source.revision !== expected.revision ||
        plan.source.spec !== derivedSpec
      ) {
        failures.push(
          "plan source metadata does not match the current catalog source and frozen revision.",
        );
      }
    }
  } else {
    if (expected.sourceSpec !== null) failures.push("remove plans must not carry a source spec.");
    if (!isPlainObject(plan.source) || plan.source.id !== sourceRecord.id) {
      failures.push("plan source does not match the current catalog source.");
    }
    if (expected.revision !== expected.metadataEntry?.revision) {
      failures.push("remove plan revision does not match its metadata entry.");
    }
  }
  if (expected.metadataRevision !== (expected.metadataEntry?.revision ?? null)) {
    failures.push("plan metadata revision does not match its metadata entry.");
  }
  validatePlanMetadataEntry(expected.metadataEntry ?? null, {
    action: requestedAction,
    catalogEntry,
    scope,
    scopeRoot,
    descriptors,
    failures,
  });

  let derivedCommand = null;
  try {
    derivedCommand = {
      executable: SKILLS_CLI_EXECUTABLE,
      package: SKILLS_CLI_PACKAGE,
      args: buildSkillCommandArgs({
        action: requestedAction,
        sourceSpec: derivedSpec ?? undefined,
        skillName: catalogEntry.skill,
        agents: requestedAgents,
        scope,
      }),
      cwd,
      scope,
    };
  } catch (error) {
    failures.push(`Could not derive the authorized skills command: ${error.message}`);
  }
  if (derivedCommand && !commandMatches(plan.command, derivedCommand)) {
    failures.push(
      "plan command does not match the authorized catalog, scope, agents, and frozen revision; refusing to execute an altered plan.",
    );
  }
  if (failures.length > 0) return operationFailure(requestedAction, failures);
  return {
    ok: true,
    plan: {
      ...plan,
      action: requestedAction,
      skillId: catalogEntry.id,
      scope,
      agents: requestedAgents,
      cwd,
      homeDir,
      storePath,
      command: derivedCommand,
      expectedPlan: { ...expected, sourceSpec: derivedSpec },
    },
  };
}

async function detectSkillPlanDrift(planResult) {
  const failures = [];
  const { expectedPlan } = planResult;
  const storeResult = await readSkillsStore({
    scope: expectedPlan.scope,
    cwd: expectedPlan.cwd,
    homeDir: expectedPlan.homeDir,
  });
  if (!storeResult.ok) {
    failures.push(...storeResult.failures);
  } else {
    const current = findStoreEntry(storeResult.store, planResult.skill);
    if (JSON.stringify(current ?? null) !== JSON.stringify(expectedPlan.metadataEntry ?? null)) {
      failures.push("prism-ds skills metadata changed since the preview; re-run the preview.");
    }
  }
  const scopeRoot = scopeRootPath(expectedPlan.scope, {
    cwd: expectedPlan.cwd,
    homeDir: expectedPlan.homeDir,
  });
  for (const before of expectedPlan.before) {
    const inspected = await inspectSkillPath(before.path, scopeRoot);
    if (
      inspected.exists !== before.exists ||
      inspected.symlink !== before.symlink ||
      inspected.broken !== before.broken ||
      inspected.contained !== before.contained ||
      inspected.fingerprint !== before.fingerprint
    ) {
      failures.push(
        `Local skill state changed since the preview at ${before.path}; re-run the preview.`,
      );
    }
  }
  return { ok: failures.length === 0, failures };
}

function runSkillMutation(planResult, options) {
  const spawnImpl = options.spawnImpl ?? spawnSync;
  if (typeof spawnImpl !== "function") {
    return operationFailure(planResult.action, ["spawnImpl must be a function."], {
      executed: false,
    });
  }
  const platform = options.platform ?? process.platform;
  const comSpec = options.comSpec ?? process.env.ComSpec;
  let spawnPlan;
  try {
    spawnPlan = buildSkillsSpawnPlan({ args: planResult.command.args, platform, comSpec });
  } catch (error) {
    return operationFailure(planResult.action, [error.message], { executed: false });
  }
  const env = isPlainObject(options.env) ? options.env : process.env;
  let result;
  try {
    result = spawnImpl(spawnPlan.command, spawnPlan.args, {
      cwd: planResult.cwd,
      env,
      stdio: "pipe",
      ...spawnPlan.options,
    });
  } catch (error) {
    return operationFailure(
      planResult.action,
      [`Failed to start ${SKILLS_CLI_PACKAGE}: ${error.message}.`],
      { executed: false },
    );
  }
  if (!result || typeof result !== "object") {
    return operationFailure(planResult.action, [`${SKILLS_CLI_PACKAGE} returned no result.`], {
      executed: false,
    });
  }
  if (result.error) {
    return operationFailure(
      planResult.action,
      [`Failed to start ${SKILLS_CLI_PACKAGE}: ${result.error.message}.`],
      { executed: false },
    );
  }
  if (typeof result.status !== "number") {
    return operationFailure(
      planResult.action,
      [`${SKILLS_CLI_PACKAGE} terminated without an exit code.`],
      { executed: true },
    );
  }
  const stdout = toText(result.stdout);
  const stderr = toText(result.stderr);
  const spawn = { command: spawnPlan.command, args: spawnPlan.args, status: result.status, stderr };
  if (result.status !== 0) {
    return operationFailure(
      planResult.action,
      [
        `${SKILLS_CLI_PACKAGE} ${planResult.action} exited with code ${result.status}${
          stderr.trim() ? `: ${tail(stderr)}` : "."
        }`,
      ],
      { executed: true, spawn },
    );
  }
  return { ok: true, spawn: { ...spawn, stdout } };
}

async function verifyAddOrUpdate(planResult, spawn) {
  const failures = [];
  let jsonEntry = null;
  try {
    const parsed = JSON.parse(spawn.stdout.trim());
    if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
    jsonEntry =
      parsed.find((entry) => isPlainObject(entry) && entry.name === planResult.skill.skill) ?? null;
    if (!jsonEntry) throw new Error(`no entry for ${JSON.stringify(planResult.skill.skill)}`);
  } catch (error) {
    failures.push(`${SKILLS_CLI_PACKAGE} add did not emit verifiable JSON: ${error.message}.`);
  }
  if (jsonEntry) {
    if (jsonEntry.status !== "installed") {
      failures.push(
        `${SKILLS_CLI_PACKAGE} add reported status ${JSON.stringify(jsonEntry.status)}${
          jsonEntry.error ? `: ${jsonEntry.error}` : "."
        }`,
      );
    }
    if (
      jsonEntry.ref !== undefined &&
      jsonEntry.ref !== null &&
      String(jsonEntry.ref).toLowerCase() !== planResult.expectedPlan.revision
    ) {
      failures.push(
        `Installed revision ${jsonEntry.ref} does not match the frozen preview revision ${planResult.expectedPlan.revision}.`,
      );
    }
    if (
      jsonEntry.scope !== undefined &&
      jsonEntry.scope !== null &&
      jsonEntry.scope !== planResult.scope
    ) {
      failures.push(
        `Installed scope ${jsonEntry.scope} does not match the previewed ${planResult.scope}.`,
      );
    }
    if (Array.isArray(jsonEntry.agents)) {
      for (const agentId of planResult.agents) {
        if (!jsonEntry.agents.includes(agentId)) {
          failures.push(`${SKILLS_CLI_PACKAGE} add did not report agent ${agentId}.`);
        }
      }
    }
  }

  const scopeRoot = scopeRootPath(planResult.scope, planResult);
  const placements = [];
  for (const target of planResult.targets.filter((candidate) => candidate.selected)) {
    const inspected = await inspectSkillPath(target.path, scopeRoot);
    if (
      !inspected.exists ||
      !inspected.isDirectory ||
      inspected.broken ||
      !inspected.contained ||
      !inspected.hasSkillMd ||
      !inspected.fingerprint
    ) {
      failures.push(
        `Expected an installed skill at ${target.path} after the install, but it is missing or unusable.`,
      );
      continue;
    }
    placements.push({
      path: target.relativePath,
      kind: target.kind,
      agent: target.agent,
      fingerprint: inspected.fingerprint,
      shared: target.kind === "canonical",
    });
  }
  if (failures.length > 0) return { ok: false, failures, details: { json: jsonEntry } };
  return { ok: true, details: { json: jsonEntry, placements } };
}

async function verifyRemove(planResult) {
  const failures = [];
  const details = { removedPaths: [], retainedPaths: [], canonicalRetained: false };
  const scopeRoot = scopeRootPath(planResult.scope, planResult);
  for (const target of planResult.targets.filter(
    (candidate) => candidate.selected && candidate.exists,
  )) {
    const inspected = await inspectSkillPath(target.path, scopeRoot);
    if (target.kind === "canonical") {
      if (inspected.exists) {
        details.canonicalRetained = true;
        details.retainedPaths.push(target.path);
      } else {
        details.removedPaths.push(target.path);
      }
      continue;
    }
    if (inspected.exists) {
      failures.push(`Expected ${target.path} to be removed, but it still exists.`);
    } else {
      details.removedPaths.push(target.path);
    }
  }
  return { ok: failures.length === 0, failures, details };
}

async function applyStoreAfterInstall(planResult, verifyDetails, options) {
  const { scope, cwd, homeDir } = planResult;
  const storeResult = await readSkillsStore({ scope, cwd, homeDir });
  if (!storeResult.ok) return storeResult;
  const store = storeResult.store;
  const previous = findStoreEntry(store, planResult.skill);
  const scopeRoot = scopeRootPath(scope, planResult);
  const nowIso = (typeof options.now === "function" ? options.now() : new Date()).toISOString();

  const placementsByPath = new Map();
  for (const recorded of previous?.placements ?? []) {
    const inspected = await inspectSkillPath(resolve(scopeRoot, recorded.path), scopeRoot);
    if (inspected.exists && inspected.contained && !inspected.broken && inspected.fingerprint) {
      placementsByPath.set(recorded.path, { ...recorded, fingerprint: inspected.fingerprint });
    }
  }
  for (const placement of verifyDetails.placements) {
    placementsByPath.set(placement.path, placement);
  }
  const agentSet = new Set([...(previous?.agents ?? []), ...planResult.agents]);
  const entry = {
    id: planResult.skill.id,
    skill: planResult.skill.skill,
    source: planResult.skill.source,
    sourceUrl: planResult.source.url,
    revision: planResult.expectedPlan.revision,
    scope,
    agents: SKILL_AGENT_IDS.filter((agent) => agentSet.has(agent)),
    installedAt: previous?.installedAt ?? nowIso,
    updatedAt: nowIso,
    placements: [...placementsByPath.values()].sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  if (previous) delete store.skills[findStoreEntryKey(store, previous)];
  store.skills[entry.id] = entry;
  const written = await writeSkillsStore({ scope, cwd, homeDir }, store);
  if (!written.ok) return written;
  return { ok: true, storePath: written.path, entry };
}

async function applyStoreAfterRemove(planResult, verifyDetails, options) {
  const { scope, cwd, homeDir } = planResult;
  const storeResult = await readSkillsStore({ scope, cwd, homeDir });
  if (!storeResult.ok) return storeResult;
  const store = storeResult.store;
  const previous = findStoreEntry(store, planResult.skill);
  if (!previous) {
    return { ok: false, failures: ["prism-ds skills metadata no longer records this install."] };
  }
  const scopeRoot = scopeRootPath(scope, planResult);
  const nowIso = (typeof options.now === "function" ? options.now() : new Date()).toISOString();
  const removedPaths = new Set(
    verifyDetails.removedPaths.map((path) => relativeToScope(scopeRoot, path)),
  );
  const removedAgents = new Set(planResult.agents);
  const remainingAgents = new Set(
    (previous.agents ?? []).filter((agent) => !removedAgents.has(agent)),
  );
  const remainingPlacements = [];
  for (const recorded of previous.placements) {
    if (removedPaths.has(recorded.path)) continue;
    const inspected = await inspectSkillPath(resolve(scopeRoot, recorded.path), scopeRoot);
    const usable =
      inspected.exists &&
      inspected.isDirectory &&
      inspected.contained &&
      !inspected.broken &&
      inspected.hasSkillMd;
    if (!usable) {
      if (recorded.agent) remainingAgents.delete(recorded.agent);
      continue;
    }
    remainingPlacements.push({
      ...recorded,
      fingerprint: inspected.fingerprint ?? recorded.fingerprint,
    });
  }
  if (remainingPlacements.length === 0) {
    delete store.skills[findStoreEntryKey(store, previous)];
  } else {
    const key = findStoreEntryKey(store, previous);
    store.skills[key] = {
      ...previous,
      agents: SKILL_AGENT_IDS.filter((agent) => remainingAgents.has(agent)),
      updatedAt: nowIso,
      placements: remainingPlacements.sort((a, b) => (a.path < b.path ? -1 : 1)),
    };
  }
  const written = await writeSkillsStore({ scope, cwd, homeDir }, store);
  if (!written.ok) return written;
  return { ok: true, storePath: written.path };
}

/**
 * Execute a previewed mutation. Requires `confirmed: true`; pass the preview
 * as `plan` so the frozen revision and the exact expected pre-state are used.
 * Never rolls back automatically, and never records success unless the
 * upstream exit code, JSON verification (add/update), and local post-state
 * verification all pass.
 */
export async function executeSkillOperation(options = {}) {
  const action = options.action ?? options.plan?.action ?? null;
  try {
    if (options.confirmed !== true) {
      return operationFailure(
        action,
        ["Skill mutations require confirmed:true after an explicit preview."],
        { executed: false },
      );
    }
    let planResult;
    if (options.plan !== undefined) {
      const validated = await validateProvidedPlan(options);
      if (!validated.ok) return { ...validated, executed: false };
      planResult = validated.plan;
    } else {
      planResult = await planSkillOperation(options);
      if (!planResult.ok) return { ...planResult, executed: false };
    }
    const drift = await detectSkillPlanDrift(planResult);
    if (!drift.ok)
      return operationFailure(planResult.action, drift.failures, {
        executed: false,
        plan: planResult,
      });
    if (planResult.expectedPlan.noop) {
      return { ...planResult, executed: false, reason: "noop", spawn: null };
    }
    const mutation = runSkillMutation(planResult, options);
    if (!mutation.ok) return { ...mutation, plan: planResult };
    let verification;
    if (planResult.action === "remove") {
      verification = await verifyRemove(planResult);
    } else {
      verification = await verifyAddOrUpdate(planResult, mutation.spawn);
    }
    if (!verification.ok) {
      return operationFailure(planResult.action, verification.failures, {
        executed: true,
        plan: planResult,
        spawn: {
          command: mutation.spawn.command,
          args: mutation.spawn.args,
          status: mutation.spawn.status,
        },
        verification: verification.details,
      });
    }
    const storeResult =
      planResult.action === "remove"
        ? await applyStoreAfterRemove(planResult, verification.details, options)
        : await applyStoreAfterInstall(planResult, verification.details, options);
    if (!storeResult.ok) {
      return operationFailure(
        planResult.action,
        [
          ...storeResult.failures,
          "The upstream CLI ran, but prism-ds could not record the verified result.",
        ],
        {
          executed: true,
          plan: planResult,
          spawn: {
            command: mutation.spawn.command,
            args: mutation.spawn.args,
            status: mutation.spawn.status,
          },
          verification: verification.details,
        },
      );
    }
    return {
      ok: true,
      executed: true,
      action: planResult.action,
      skillId: planResult.skillId,
      skill: planResult.skill,
      scope: planResult.scope,
      agents: planResult.agents,
      revision: planResult.expectedPlan.revision ?? null,
      command: planResult.command,
      storePath: storeResult.storePath,
      warnings: planResult.warnings,
      spawn: {
        command: mutation.spawn.command,
        args: mutation.spawn.args,
        status: mutation.spawn.status,
      },
      verification: verification.details,
    };
  } catch (error) {
    return operationFailure(action, [`Unexpected skills execution error: ${error.message}`], {
      executed: false,
    });
  }
}
