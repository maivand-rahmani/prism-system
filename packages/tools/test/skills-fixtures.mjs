/**
 * Deterministic fixtures for the skills catalog/inventory/engine tests.
 * Everything is local and offline: no network, no npx, no real home directory.
 */

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { SKILL_AGENT_IDS, UNIVERSAL_SKILL_AGENT_IDS } from "../src/skill-inventory.mjs";

export function makeTempRoot(prefix = "prism-skills-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function writeSkillDir(baseDir, name, { revision = "rev-1", extraFile = null } = {}) {
  const dir = join(baseDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "version: 1.0.0",
      "description: Fixture skill for deterministic tests",
      "---",
      "",
      `# ${name}`,
      "",
      `fixture-revision: ${revision}`,
      "",
    ].join("\n"),
    "utf8",
  );
  if (extraFile) {
    writeFileSync(join(dir, extraFile.name), extraFile.content, "utf8");
  }
  return dir;
}

/** Create a directory link (junction on Windows), falling back to a copy. */
export function linkSkillDir(target, linkPath) {
  mkdirSync(dirname(linkPath), { recursive: true });
  // Replace any existing link/copy so re-installs are deterministic. Removing a
  // junction/symlink removes the link itself, never the target.
  try {
    rmSync(linkPath, { recursive: true, force: true });
  } catch {
    // Continue to creation; a locked path will fail loudly below.
  }
  try {
    symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    cpSync(target, linkPath, { recursive: true });
    return false;
  }
}

export function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function hex(value) {
  const text = String(value);
  const base = text.repeat(40).slice(0, 40);
  return base.replace(/[^0-9a-f]/g, "a");
}

export const SHA_A = hex("a");
export const SHA_B = hex("b");

/** A Response-like fake for the bounded GitHub resolver. */
export function createFakeFetch({
  sha = SHA_A,
  status = 200,
  body,
  headers = {},
  throwError = null,
} = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (throwError) throw throwError;
    const text = body !== undefined ? body : JSON.stringify({ sha });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get(name) {
          const value = headers[String(name).toLowerCase()];
          return value === undefined ? null : value;
        },
      },
      text: async () => text,
    };
  };
  return { impl, calls };
}

function collectFlagValues(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return [];
  const values = [];
  for (let cursor = index + 1; cursor < args.length; cursor += 1) {
    if (args[cursor].startsWith("-")) break;
    values.push(args[cursor]);
  }
  return values;
}

function claudeSkillsDir(cwd, homeDir, scope) {
  return scope === "global" ? join(homeDir, ".claude", "skills") : join(cwd, ".claude", "skills");
}

function canonicalSkillsDir(cwd, homeDir, scope) {
  return scope === "global" ? join(homeDir, ".agents", "skills") : join(cwd, ".agents", "skills");
}

function materializeInstall({ cwd, homeDir, skill, agents, scope, revision }) {
  const canonical = canonicalSkillsDir(cwd, homeDir, scope);
  writeSkillDir(canonical, skill, { revision });
  for (const agent of agents) {
    if (UNIVERSAL_SKILL_AGENT_IDS.includes(agent)) continue;
    linkSkillDir(join(canonical, skill), join(claudeSkillsDir(cwd, homeDir, scope), skill));
  }
}

function removeInstall({ cwd, homeDir, skill, agents, scope, retainCanonical }) {
  const canonical = canonicalSkillsDir(cwd, homeDir, scope);
  for (const agent of agents) {
    if (UNIVERSAL_SKILL_AGENT_IDS.includes(agent)) {
      if (!retainCanonical) rmSync(join(canonical, skill), { recursive: true, force: true });
    } else {
      rmSync(join(claudeSkillsDir(cwd, homeDir, scope), skill), { recursive: true, force: true });
    }
  }
}

/**
 * A synchronous fake `spawnImpl` that emulates the pinned upstream CLI's
 * observable behavior for `add` and `remove` inside the fixture roots.
 */
export function createFakeSkillRunner({
  cwd,
  homeDir,
  retainCanonical = false,
  fail = null,
  status = 0,
  stdout = null,
  stderr = "",
} = {}) {
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args: [...args], options });
    if (fail) return fail;
    const packageIndex = args.indexOf("skills@1.7.0");
    const verb = args[packageIndex + 1];
    const scope = args.includes("--global") ? "global" : "project";
    if (verb === "add") {
      const sourceSpec = args[packageIndex + 2];
      const skill = args[args.indexOf("--skill") + 1];
      const agents = collectFlagValues(args, "--agent");
      const revision = sourceSpec.split("/tree/")[1];
      materializeInstall({ cwd, homeDir, skill, agents, scope, revision });
      const json =
        stdout ??
        JSON.stringify([{ name: skill, status: "installed", ref: revision, scope, agents }]);
      return { status, stdout: json, stderr };
    }
    if (verb === "remove") {
      const skill = args[packageIndex + 2];
      const agents = collectFlagValues(args, "--agent");
      removeInstall({ cwd, homeDir, skill, agents, scope, retainCanonical });
      return { status, stdout: stdout ?? "", stderr };
    }
    return { status: 1, stdout: "", stderr: `unsupported verb ${verb}` };
  };
  return { runner, calls };
}

/** A managed store entry shaped exactly like the engine writes it. */
export function managedEntry({
  id,
  skill = id,
  source,
  sourceUrl,
  revision,
  scope = "project",
  agents,
  placements,
  installedAt = "2026-01-01T00:00:00.000Z",
  updatedAt = "2026-01-01T00:00:00.000Z",
}) {
  return {
    id,
    skill,
    source,
    sourceUrl,
    revision,
    scope,
    agents: SKILL_AGENT_IDS.filter((agent) => agents.includes(agent)),
    installedAt,
    updatedAt,
    placements,
  };
}
