/**
 * Offline installed-skill inventory and prism-ds metadata store.
 *
 * This module never invokes `npx`, never downloads anything, and never treats
 * an upstream lock file as proof that a skill exists or that its files are
 * intact. It only scans the expected, contained canonical skill directories
 * and the known agent directories from a bounded agent allowlist, and it
 * reports what is actually on disk.
 *
 * Layouts mirrored from the pinned upstream `skills@1.7.0` agent definitions:
 *
 * - canonical project: `<cwd>/.agents/skills`
 * - canonical global:  `<home>/.agents/skills`
 * - `claude-code`:     project `<cwd>/.claude/skills`, global `<claudeHome>/skills`
 * - `opencode`, `codex`, `cursor`: universal agents, so their installs live in
 *   the canonical `.agents/skills` directory (their native global directories
 *   are still scanned read-only for legacy/manual placements).
 *
 * The canonical `.agents/skills` folder is shared by every universal agent,
 * including agents outside this allowlist. Listings expose that sharing
 * instead of pretending per-agent isolation exists.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { assertWithin } from "./constants.mjs";
import { getSkillCatalogEntryBySkill, listSkillCatalog } from "./skill-catalog.mjs";

/** Supported inventory scopes. */
export const SKILL_SCOPE_VALUES = Object.freeze(["project", "global", "all"]);

/** The bounded agent allowlist this tooling can plan and inspect. */
export const SKILL_AGENT_IDS = Object.freeze(["claude-code", "codex", "cursor", "opencode"]);

/** Agents that read the shared canonical `.agents/skills` directory. */
export const UNIVERSAL_SKILL_AGENT_IDS = Object.freeze(["codex", "cursor", "opencode"]);

/** Current prism-ds skills metadata schema version. Unknown versions fail closed. */
export const SKILLS_STORE_VERSION = 1;

/** Project metadata path, relative to the consumer root. */
export const SKILLS_PROJECT_STORE_RELATIVE = join(".design-system", "skills.json");

/** Global metadata path, relative to the user home directory (mockable for tests). */
export const SKILLS_GLOBAL_STORE_RELATIVE = join(".prism-ds", "skills.json");

function claudeHome({ homeDir, env }) {
  const override = env?.CLAUDE_CONFIG_DIR;
  return typeof override === "string" && override.trim() !== ""
    ? resolve(override.trim())
    : join(homeDir, ".claude");
}

function codexHome({ homeDir, env }) {
  const override = env?.CODEX_HOME;
  return typeof override === "string" && override.trim() !== ""
    ? resolve(override.trim())
    : join(homeDir, ".codex");
}

function configHome({ homeDir, env }) {
  const override = env?.XDG_CONFIG_HOME;
  return typeof override === "string" && override.trim() !== ""
    ? resolve(override.trim())
    : join(homeDir, ".config");
}

/**
 * The agent allowlist with the exact path definitions from the pinned
 * upstream agent table. `universal` agents read the canonical directory;
 * `resolveNativeGlobalSkillsDir` is scanned read-only for legacy placements.
 */
export const SKILL_AGENTS = Object.freeze({
  "claude-code": Object.freeze({
    id: "claude-code",
    displayName: "Claude Code",
    universal: false,
    projectSkillsDir: ".claude/skills",
    resolveGlobalSkillsDir: (ctx) => join(claudeHome(ctx), "skills"),
    resolveNativeGlobalSkillsDir: (ctx) => join(claudeHome(ctx), "skills"),
    resolveDetectPaths: (ctx) => [claudeHome(ctx)],
  }),
  codex: Object.freeze({
    id: "codex",
    displayName: "Codex",
    universal: true,
    projectSkillsDir: ".agents/skills",
    resolveGlobalSkillsDir: () => undefined,
    resolveNativeGlobalSkillsDir: (ctx) => join(codexHome(ctx), "skills"),
    resolveDetectPaths: (ctx) => [codexHome(ctx)],
  }),
  cursor: Object.freeze({
    id: "cursor",
    displayName: "Cursor",
    universal: true,
    projectSkillsDir: ".agents/skills",
    resolveGlobalSkillsDir: () => undefined,
    resolveNativeGlobalSkillsDir: (ctx) => join(ctx.homeDir, ".cursor", "skills"),
    resolveDetectPaths: (ctx) => [join(ctx.homeDir, ".cursor")],
  }),
  opencode: Object.freeze({
    id: "opencode",
    displayName: "OpenCode",
    universal: true,
    projectSkillsDir: ".agents/skills",
    resolveGlobalSkillsDir: () => undefined,
    resolveNativeGlobalSkillsDir: (ctx) => join(configHome(ctx), "opencode", "skills"),
    resolveDetectPaths: (ctx) => [join(configHome(ctx), "opencode")],
  }),
});

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithin(base, target) {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function scopeRootPath(scope, { cwd, homeDir }) {
  return scope === "global" ? resolve(homeDir) : resolve(cwd);
}

/** The canonical `.agents/skills` directory for a scope. */
export function resolveCanonicalSkillsDir({ scope, cwd, homeDir }) {
  if (scope === "global") return join(resolve(homeDir), ".agents", "skills");
  return join(resolve(cwd), ".agents", "skills");
}

/**
 * The directory the pinned upstream installer actually targets for one agent
 * and scope. Universal agents always resolve to the shared canonical folder.
 */
export function resolveAgentSkillsDir(agentId, { scope, cwd, homeDir, env = process.env }) {
  const agent = SKILL_AGENTS[agentId];
  if (!agent) throw new Error(`Unknown skill agent ${JSON.stringify(agentId)}.`);
  if (agent.universal) return resolveCanonicalSkillsDir({ scope, cwd, homeDir });
  if (scope === "global") {
    const dir = agent.resolveGlobalSkillsDir({ homeDir: resolve(homeDir), env });
    if (!dir) throw new Error(`${agent.displayName} does not support global skill installs.`);
    return dir;
  }
  return join(resolve(cwd), agent.projectSkillsDir);
}

/** A known agent-native global directory, scanned read-only for legacy placements. */
export function resolveAgentNativeGlobalSkillsDir(agentId, { homeDir, env = process.env }) {
  const agent = SKILL_AGENTS[agentId];
  if (!agent) throw new Error(`Unknown skill agent ${JSON.stringify(agentId)}.`);
  if (agent.universal) {
    return agent.resolveNativeGlobalSkillsDir({ homeDir: resolve(homeDir), env });
  }
  return agent.resolveGlobalSkillsDir({ homeDir: resolve(homeDir), env }) ?? undefined;
}

/** Path of the prism-ds skills metadata store for a scope. */
export function resolveSkillsStorePath({ scope, cwd, homeDir }) {
  if (scope === "global") return join(resolve(homeDir), SKILLS_GLOBAL_STORE_RELATIVE);
  if (scope === "project") return join(resolve(cwd), SKILLS_PROJECT_STORE_RELATIVE);
  throw new Error(`Unknown skills store scope ${JSON.stringify(scope)}.`);
}

/** An empty, current-version metadata store. */
export function createEmptySkillsStore() {
  return { version: SKILLS_STORE_VERSION, skills: {} };
}

function collectSkillsStoreFailures(store) {
  const failures = [];
  if (!isPlainObject(store)) return ["skills metadata must be a JSON object."];
  if (store.version !== SKILLS_STORE_VERSION) {
    failures.push(
      `skills metadata version must be ${SKILLS_STORE_VERSION}, got ${JSON.stringify(store.version)}.`,
    );
  }
  if (!isPlainObject(store.skills))
    return [...failures, "skills metadata must contain a skills object."];
  for (const [key, entry] of Object.entries(store.skills)) {
    const label = `skills metadata entry ${JSON.stringify(key)}`;
    if (!isPlainObject(entry)) {
      failures.push(`${label} must be an object.`);
      continue;
    }
    if (typeof entry.id !== "string" || entry.id === "") failures.push(`${label} id is required.`);
    if (typeof entry.skill !== "string" || entry.skill === "")
      failures.push(`${label} skill is required.`);
    if (typeof entry.source !== "string" || entry.source === "") {
      failures.push(`${label} source is required.`);
    }
    if (entry.scope !== "project" && entry.scope !== "global") {
      failures.push(`${label} scope must be "project" or "global".`);
    }
    if (typeof entry.revision !== "string" || !/^[0-9a-f]{40}$/.test(entry.revision)) {
      failures.push(`${label} revision must be a 40-character hex commit.`);
    }
    if (!Array.isArray(entry.agents) || entry.agents.some((id) => !SKILL_AGENT_IDS.includes(id))) {
      failures.push(`${label} agents must be an array of allowlisted agent ids.`);
    }
    if (!Array.isArray(entry.placements)) {
      failures.push(`${label} placements must be an array.`);
      continue;
    }
    for (const placement of entry.placements) {
      if (
        !isPlainObject(placement) ||
        typeof placement.path !== "string" ||
        placement.path === ""
      ) {
        failures.push(`${label} placements must record a relative path.`);
        continue;
      }
      if (placement.kind !== "canonical" && placement.kind !== "agent") {
        failures.push(`${label} placement kind must be "canonical" or "agent".`);
      }
      if (typeof placement.fingerprint !== "string" || placement.fingerprint === "") {
        failures.push(`${label} placement fingerprint is required.`);
      }
    }
  }
  return failures;
}

/**
 * Read the prism-ds skills metadata store. A missing store is an empty store;
 * a malformed store fails closed so callers never overwrite unknown data.
 */
export async function readSkillsStore({ scope, cwd, homeDir }) {
  const storePath = resolveSkillsStorePath({ scope, cwd, homeDir });
  if (!existsSync(storePath)) {
    return { ok: true, store: createEmptySkillsStore(), path: storePath };
  }
  try {
    const text = await readFile(storePath, "utf8");
    const parsed = JSON.parse(text);
    const failures = collectSkillsStoreFailures(parsed);
    if (failures.length > 0) {
      return {
        ok: false,
        path: storePath,
        failures: [`Skills metadata at ${storePath} is not usable: ${failures.join(" ")}`],
      };
    }
    return { ok: true, store: parsed, path: storePath };
  } catch (error) {
    return {
      ok: false,
      path: storePath,
      failures: [`Skills metadata at ${storePath} is malformed: ${error.message}`],
    };
  }
}

/**
 * Atomically write the prism-ds skills metadata store inside its scope root.
 * Never touches any other file (in particular `.design-system/config.json`).
 */
export async function writeSkillsStore({ scope, cwd, homeDir }, store) {
  const failures = collectSkillsStoreFailures(store);
  if (failures.length > 0) {
    return {
      ok: false,
      failures: [`Refusing to write invalid skills metadata: ${failures.join(" ")}`],
    };
  }
  const storePath = resolveSkillsStorePath({ scope, cwd, homeDir });
  try {
    assertWithin(scopeRootPath(scope, { cwd, homeDir }), storePath, "Skills metadata path");
    await mkdir(dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await rename(tempPath, storePath);
    return { ok: true, path: storePath };
  } catch (error) {
    return {
      ok: false,
      path: storePath,
      failures: [`Could not write skills metadata: ${error.message}`],
    };
  }
}

/** Deterministic SHA-256 fingerprint of every regular file inside a skill folder. */
export async function computeSkillFingerprint(skillDir) {
  const files = [];
  await collectFingerprintFiles(skillDir, skillDir, files);
  files.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function collectFingerprintFiles(baseDir, currentDir, results) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectFingerprintFiles(baseDir, fullPath, results);
    } else if (entry.isFile()) {
      results.push({
        relativePath: toPosixPath(relative(baseDir, fullPath)),
        content: await readFile(fullPath),
      });
    }
  }
}

/**
 * Inspect one candidate skill directory without following it outside the scope
 * root. Symlinks/junctions are followed only when the real target stays inside
 * `scopeRoot`; an escaping or broken link is reported as `contained: false`
 * and is never fingerprinted.
 */
export async function inspectSkillPath(absPath, scopeRoot) {
  const result = {
    path: absPath,
    exists: false,
    isDirectory: false,
    symlink: false,
    broken: false,
    contained: true,
    hasSkillMd: false,
    fingerprint: null,
  };
  let linkStat;
  try {
    linkStat = await lstat(absPath);
  } catch {
    return result;
  }
  result.exists = true;
  result.symlink = linkStat.isSymbolicLink();
  let targetStat = linkStat;
  if (result.symlink) {
    try {
      targetStat = await stat(absPath);
    } catch {
      result.broken = true;
      result.contained = false;
      return result;
    }
  }
  result.isDirectory = targetStat.isDirectory();
  if (!result.isDirectory) return result;

  try {
    const skillMd = await stat(join(absPath, "SKILL.md"));
    result.hasSkillMd = skillMd.isFile();
  } catch {
    result.hasSkillMd = false;
  }

  const resolvedRoot = resolve(scopeRoot);
  let realRoot = resolvedRoot;
  try {
    realRoot = await realpath(resolvedRoot);
  } catch {
    realRoot = resolvedRoot;
  }
  let realTarget;
  try {
    realTarget = await realpath(absPath);
  } catch {
    result.contained = false;
    return result;
  }
  if (!isWithin(realRoot, realTarget)) {
    result.contained = false;
    return result;
  }

  if (result.hasSkillMd) {
    try {
      result.fingerprint = await computeSkillFingerprint(absPath);
    } catch {
      result.fingerprint = null;
    }
  }
  return result;
}

/** Minimal single-line frontmatter reader for SKILL.md (no YAML dependency). */
export async function readSkillFrontmatter(skillMdPath) {
  try {
    const info = await stat(skillMdPath);
    if (!info.isFile() || info.size > 1_000_000) return {};
    const text = (await readFile(skillMdPath, "utf8")).replace(/^\uFEFF/, "");
    if (!text.startsWith("---")) return {};
    const end = text.indexOf("\n---", 3);
    if (end === -1) return {};
    const data = {};
    for (const line of text.slice(3, end).split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1];
      if (!["name", "description", "version"].includes(key) || data[key] !== undefined) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value !== "") data[key] = value;
    }
    return data;
  } catch {
    return {};
  }
}

async function readUpstreamLockHints({ scope, cwd, homeDir, env = process.env }) {
  const lockPath =
    scope === "global"
      ? typeof env?.XDG_STATE_HOME === "string" && env.XDG_STATE_HOME.trim() !== ""
        ? join(resolve(env.XDG_STATE_HOME.trim()), "skills", ".skill-lock.json")
        : join(resolve(homeDir), ".agents", ".skill-lock.json")
      : join(resolve(cwd), "skills-lock.json");
  const hints = new Map();
  try {
    const parsed = JSON.parse(await readFile(lockPath, "utf8"));
    if (!isPlainObject(parsed) || !isPlainObject(parsed.skills)) return hints;
    for (const [name, entry] of Object.entries(parsed.skills)) {
      if (!isPlainObject(entry)) continue;
      hints.set(name, {
        source: typeof entry.source === "string" ? entry.source : null,
        sourceType: typeof entry.sourceType === "string" ? entry.sourceType : null,
        ref: typeof entry.ref === "string" ? entry.ref : null,
      });
    }
  } catch {
    // Missing, unreadable, or malformed locks are ignored as metadata hints.
    // Locks are never used to decide existence or integrity.
  }
  return hints;
}

function buildScopeRoots(scope, ctx) {
  const roots = [];
  const canonical = resolveCanonicalSkillsDir({ ...ctx, scope });
  const add = (path, kind, agent) => {
    if (!path) return;
    const abs = resolve(path);
    if (roots.some((root) => root.path === abs)) return;
    roots.push({ path: abs, kind, agent });
  };
  add(canonical, "canonical", null);
  for (const agentId of SKILL_AGENT_IDS) {
    const dir = resolveAgentSkillsDir(agentId, { ...ctx, scope });
    add(dir, dir === canonical ? "canonical" : "agent", dir === canonical ? null : agentId);
    if (scope === "global") {
      const native = resolveAgentNativeGlobalSkillsDir(agentId, ctx);
      add(native, "agent-native", agentId);
    }
  }
  return roots;
}

async function scanScope(scope, ctx) {
  const scopeRoot = scopeRootPath(scope, ctx);
  const placements = [];
  for (const root of buildScopeRoots(scope, ctx)) {
    let entries;
    try {
      entries = await readdir(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith(".")) continue;
      const abs = join(root.path, entry.name);
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const inspected = await inspectSkillPath(abs, scopeRoot);
      if (!inspected.exists || !inspected.isDirectory || !inspected.hasSkillMd) continue;
      placements.push({
        name: entry.name,
        agent: root.agent,
        kind: root.kind,
        path: abs,
        relativePath: toPosixPath(relative(scopeRoot, abs)),
        exists: inspected.exists,
        symlink: inspected.symlink,
        broken: inspected.broken,
        contained: inspected.contained,
        fingerprint: inspected.fingerprint,
      });
    }
  }
  return { scope, scopeRoot, placements };
}

function composeScopeSkills(scope, scopeRoot, placements, store, lockHints) {
  const catalogBySkill = new Map(listSkillCatalog().map((entry) => [entry.skill, entry]));
  const storeBySkill = new Map(Object.values(store.skills).map((entry) => [entry.skill, entry]));
  const byName = new Map();
  for (const placement of placements) {
    if (!byName.has(placement.name)) byName.set(placement.name, []);
    byName.get(placement.name).push(placement);
  }

  const skills = [];
  for (const [name, skillPlacements] of byName) {
    skillPlacements.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "canonical" ? -1 : b.kind === "canonical" ? 1 : 0;
      return SKILL_AGENT_IDS.indexOf(a.agent) - SKILL_AGENT_IDS.indexOf(b.agent);
    });
    const catalogEntry = catalogBySkill.get(name) ?? null;
    const storeEntry = storeBySkill.get(name) ?? null;
    const lockHint = lockHints.get(name) ?? null;
    const canonicalPlacement = skillPlacements.find(
      (placement) => placement.kind === "canonical" && placement.exists,
    );
    const primary = canonicalPlacement ?? skillPlacements[0];
    const shared = Boolean(canonicalPlacement);

    const agentSet = new Set();
    for (const placement of skillPlacements) {
      if (placement.kind === "canonical") {
        for (const id of UNIVERSAL_SKILL_AGENT_IDS) agentSet.add(id);
      } else if (placement.agent) {
        agentSet.add(placement.agent);
      }
    }

    let managed = false;
    let modified = false;
    let drift = false;
    if (storeEntry) {
      managed = true;
      const byPath = new Map(
        skillPlacements.map((placement) => [placement.relativePath, placement]),
      );
      for (const recorded of storeEntry.placements) {
        const actual = byPath.get(recorded.path);
        if (!actual || !actual.exists || actual.fingerprint !== recorded.fingerprint) {
          modified = true;
          continue;
        }
        byPath.delete(recorded.path);
      }
      for (const leftover of byPath.values()) {
        if (leftover.exists) drift = true;
      }
    }

    skills.push({
      name,
      scope,
      catalogId: catalogEntry?.id ?? null,
      type: catalogEntry?.type ?? null,
      reviewStatus: catalogEntry?.reviewStatus ?? null,
      categories: catalogEntry?.categories ?? null,
      tags: catalogEntry?.tags ?? null,
      role: catalogEntry?.role ?? null,
      path: primary.path,
      relativePath: primary.relativePath,
      canonicalPath: join(scopeRoot, name),
      canonicalPresent: shared,
      shared,
      sharedAgents: shared ? [...UNIVERSAL_SKILL_AGENT_IDS] : [],
      agents: SKILL_AGENT_IDS.filter((id) => agentSet.has(id)),
      placements: skillPlacements,
      managed,
      external: !managed,
      modified,
      drift,
      source: storeEntry?.source ?? lockHint?.source ?? catalogEntry?.source ?? null,
      revision: storeEntry?.revision ?? lockHint?.ref ?? null,
      version: null,
      description: null,
    });
  }

  skills.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return skills;
}

async function enrichFrontmatter(skills) {
  for (const skill of skills) {
    const frontmatter = await readSkillFrontmatter(join(skill.path, "SKILL.md"));
    skill.version = frontmatter.version ?? null;
    skill.description = frontmatter.description ?? null;
  }
}

/**
 * List actually installed skills from the contained canonical and known agent
 * directories. Purely offline; upstream lock files are read only as optional
 * source/ref hints and never as existence or integrity proof.
 *
 * @returns {Promise<{ok: true, scope: string, skills: object[], failures: string[]} |
 *   {ok: false, scope: string, skills: object[], failures: string[]}>}
 */
export async function listInstalledSkills({
  cwd,
  scope = "project",
  homeDir = homedir(),
  env = process.env,
} = {}) {
  if (typeof cwd !== "string" || cwd === "") {
    return { ok: false, scope, skills: [], failures: ["Listing skills requires a cwd."] };
  }
  if (!SKILL_SCOPE_VALUES.includes(scope)) {
    return {
      ok: false,
      scope,
      skills: [],
      failures: [`scope must be one of ${SKILL_SCOPE_VALUES.join(", ")}.`],
    };
  }
  const ctx = { cwd: resolve(cwd), homeDir: resolve(homeDir), env };
  const scopes = scope === "all" ? ["project", "global"] : [scope];
  const allSkills = [];
  for (const currentScope of scopes) {
    const storeResult = await readSkillsStore({
      scope: currentScope,
      cwd: ctx.cwd,
      homeDir: ctx.homeDir,
    });
    if (!storeResult.ok) {
      return { ok: false, scope, skills: [], failures: storeResult.failures };
    }
    const { placements } = await scanScope(currentScope, ctx);
    const lockHints = await readUpstreamLockHints({
      scope: currentScope,
      cwd: ctx.cwd,
      homeDir: ctx.homeDir,
      env,
    });
    const skills = composeScopeSkills(
      currentScope,
      scopeRootPath(currentScope, ctx),
      placements,
      storeResult.store,
      lockHints,
    );
    await enrichFrontmatter(skills);
    allSkills.push(...skills);
  }
  return { ok: true, scope, skills: allSkills, failures: [] };
}

/**
 * Detect agent ids that have a real installed configuration directory.
 * Only returns allowlisted ids; it never guesses an arbitrary provider.
 */
export function detectInstalledSkillAgents({
  homeDir = homedir(),
  env = process.env,
  pathExists = existsSync,
} = {}) {
  const ctx = { homeDir: resolve(homeDir), env };
  const detected = [];
  for (const agentId of SKILL_AGENT_IDS) {
    const agent = SKILL_AGENTS[agentId];
    const paths = agent.resolveDetectPaths(ctx);
    if (paths.some((path) => pathExists(path))) detected.push(agentId);
  }
  return detected;
}

/** Look up the catalog entry matching an installed directory name, or `null`. */
export function matchInstalledSkillCatalogEntry(name) {
  return getSkillCatalogEntryBySkill(name);
}
