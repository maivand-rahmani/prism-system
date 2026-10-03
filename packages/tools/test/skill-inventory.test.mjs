/**
 * Offline inventory tests: real temp fixtures, real links, no network, no npx.
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  computeSkillFingerprint,
  detectInstalledSkillAgents,
  listInstalledSkills,
  writeSkillsStore,
} from "../src/skill-inventory.mjs";
import {
  SHA_A,
  ensureDir,
  linkSkillDir,
  makeTempRoot,
  managedEntry,
  writeJson,
  writeSkillDir,
} from "./skills-fixtures.mjs";

function fixtureRoots(t) {
  const temp = makeTempRoot();
  t.after(() => temp.cleanup());
  const cwd = ensureDir(join(temp.root, "project"));
  const homeDir = ensureDir(join(temp.root, "home"));
  return { temp, cwd, homeDir };
}

test("project inventory reports canonical, shared placement, and agent copies", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const canonical = writeSkillDir(join(cwd, ".agents", "skills"), "frontend-design");
  linkSkillDir(canonical, join(cwd, ".claude", "skills", "frontend-design"));

  const result = await listInstalledSkills({ cwd, scope: "project", homeDir, env: {} });
  assert.equal(result.ok, true, result.failures?.join(" "));
  const skill = result.skills.find((entry) => entry.name === "frontend-design");
  assert.ok(skill);
  assert.equal(skill.scope, "project");
  assert.equal(skill.shared, true);
  assert.equal(skill.canonicalPresent, true);
  assert.deepEqual(skill.agents, ["claude-code", "codex", "cursor", "opencode"]);
  assert.deepEqual(skill.sharedAgents, ["codex", "cursor", "opencode"]);
  assert.equal(skill.external, true);
  assert.equal(skill.managed, false);
  assert.equal(skill.catalogId, "frontend-design");
  assert.equal(skill.type, "design");
  assert.equal(skill.reviewStatus, "reviewed");
  assert.equal(skill.version, "1.0.0");
  assert.equal(skill.description, "Fixture skill for deterministic tests");
  const kinds = skill.placements.map((placement) => placement.kind).sort();
  assert.deepEqual(kinds, ["agent", "canonical"]);
  for (const placement of skill.placements) {
    assert.equal(placement.contained, true);
    assert.equal(typeof placement.fingerprint, "string");
  }
});

test("global inventory covers canonical, native agent dirs, and lock hints", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const configHome = ensureDir(join(homeDir, ".config"));
  writeSkillDir(join(homeDir, ".agents", "skills"), "emil-design-eng");
  writeSkillDir(join(configHome, "opencode", "skills"), "critique");
  writeSkillDir(join(homeDir, ".codex", "skills"), "delight");
  writeJson(join(homeDir, ".agents", ".skill-lock.json"), {
    version: 3,
    skills: {
      "emil-design-eng": {
        source: "emilkowalski/skills",
        sourceType: "github",
        ref: SHA_A,
        skillFolderHash: "deadbeef",
      },
    },
  });

  const result = await listInstalledSkills({
    cwd,
    scope: "global",
    homeDir,
    env: { XDG_CONFIG_HOME: configHome },
  });
  assert.equal(result.ok, true, result.failures?.join(" "));
  const byName = new Map(result.skills.map((entry) => [entry.name, entry]));

  const emil = byName.get("emil-design-eng");
  assert.ok(emil);
  assert.equal(emil.shared, true);
  assert.equal(emil.source, "emilkowalski/skills");
  assert.equal(emil.revision, SHA_A);

  const critique = byName.get("critique");
  assert.ok(critique);
  assert.deepEqual(critique.agents, ["opencode"]);
  assert.equal(critique.placements[0].kind, "agent-native");

  const delight = byName.get("delight");
  assert.ok(delight);
  assert.deepEqual(delight.agents, ["codex"]);
});

test("scope 'all' merges project and global scopes without duplicating locks", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  writeSkillDir(join(cwd, ".agents", "skills"), "frontend-design");
  writeSkillDir(join(homeDir, ".agents", "skills"), "frontend-design");
  writeSkillDir(join(homeDir, ".agents", "skills"), "critique");

  const result = await listInstalledSkills({ cwd, scope: "all", homeDir, env: {} });
  assert.equal(result.ok, true);
  const scopes = result.skills.map((entry) => `${entry.scope}:${entry.name}`);
  assert.deepEqual(scopes, [
    "project:frontend-design",
    "global:critique",
    "global:frontend-design",
  ]);
});

test("managed installs report modified state from fingerprints, not locks", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const canonicalDir = writeSkillDir(join(cwd, ".agents", "skills"), "frontend-design");
  linkSkillDir(canonicalDir, join(cwd, ".claude", "skills", "frontend-design"));
  const canonicalFingerprint = await computeSkillFingerprint(canonicalDir);
  const claudeFingerprint = await computeSkillFingerprint(
    join(cwd, ".claude", "skills", "frontend-design"),
  );

  const store = {
    version: 1,
    skills: {
      "frontend-design": managedEntry({
        id: "frontend-design",
        source: "anthropics/skills",
        sourceUrl: "https://github.com/anthropics/skills",
        revision: SHA_A,
        agents: ["claude-code", "codex", "cursor", "opencode"],
        placements: [
          {
            path: ".agents/skills/frontend-design",
            kind: "canonical",
            fingerprint: canonicalFingerprint,
            shared: true,
          },
          {
            path: ".claude/skills/frontend-design",
            kind: "agent",
            agent: "claude-code",
            fingerprint: claudeFingerprint,
          },
        ],
      }),
    },
  };
  const written = await writeSkillsStore({ scope: "project", cwd, homeDir }, store);
  assert.equal(written.ok, true, written.failures?.join(" "));

  let result = await listInstalledSkills({ cwd, scope: "project", homeDir, env: {} });
  let skill = result.skills.find((entry) => entry.name === "frontend-design");
  assert.equal(skill.managed, true);
  assert.equal(skill.modified, false);
  assert.equal(skill.source, "anthropics/skills");
  assert.equal(skill.revision, SHA_A);

  writeFileSync(join(canonicalDir, "SKILL.md"), "---\nname: frontend-design\n---\ntampered\n");
  result = await listInstalledSkills({ cwd, scope: "project", homeDir, env: {} });
  skill = result.skills.find((entry) => entry.name === "frontend-design");
  assert.equal(skill.managed, true);
  assert.equal(skill.modified, true);
});

test("lock files never create existence or integrity", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  writeJson(join(cwd, "skills-lock.json"), {
    version: 1,
    skills: {
      ghost: { source: "anthropics/skills", sourceType: "github", computedHash: "deadbeef" },
    },
  });
  const result = await listInstalledSkills({ cwd, scope: "project", homeDir, env: {} });
  assert.equal(result.ok, true);
  assert.equal(result.skills.length, 0, "a lock entry alone is not an installed skill");
});

test("escaping symlinks are listed but never fingerprinted", async (t) => {
  const { temp, cwd, homeDir } = fixtureRoots(t);
  const outside = writeSkillDir(join(temp.root, "outside"), "escaped-skill");
  linkSkillDir(outside, join(cwd, ".claude", "skills", "escaped-skill"));

  const result = await listInstalledSkills({ cwd, scope: "project", homeDir, env: {} });
  assert.equal(result.ok, true);
  const skill = result.skills.find((entry) => entry.name === "escaped-skill");
  assert.ok(skill);
  const placement = skill.placements[0];
  assert.equal(placement.contained, false);
  assert.equal(placement.fingerprint, null);
});

test("malformed metadata fails closed instead of being ignored", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  writeSkillDir(join(cwd, ".agents", "skills"), "frontend-design");
  mkdirSync(join(cwd, ".design-system"), { recursive: true });
  writeFileSync(join(cwd, ".design-system", "skills.json"), "{ not json", "utf8");

  const result = await listInstalledSkills({ cwd, scope: "project", homeDir, env: {} });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /malformed/i);
});

test("malformed upstream locks are ignored as hints", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  writeSkillDir(join(cwd, ".agents", "skills"), "frontend-design");
  writeFileSync(join(cwd, "skills-lock.json"), "not-json", "utf8");
  const result = await listInstalledSkills({ cwd, scope: "project", homeDir, env: {} });
  assert.equal(result.ok, true);
  assert.equal(result.skills[0].source, "anthropics/skills");
});

test("agent detection uses real config directories and the allowlist only", () => {
  const homeDir = "C:/fake/home";
  const claude = join(resolve(homeDir), ".claude");
  const opencode = join(resolve(homeDir), ".config", "opencode");
  const detected = detectInstalledSkillAgents({
    homeDir,
    env: {},
    pathExists: (path) => path === claude || path === opencode,
  });
  assert.deepEqual(detected, ["claude-code", "opencode"]);
  assert.deepEqual(detectInstalledSkillAgents({ homeDir, env: {}, pathExists: () => false }), []);
});
