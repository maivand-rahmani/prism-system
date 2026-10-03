/**
 * Preview/plan tests: exact pinned argv, frozen revision, allowlist boundaries,
 * and refusal of destructive or ambiguous replacements. No subprocesses.
 */

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertSafeSkillArgument,
  buildSkillCommandArgs,
  buildSkillsSpawnPlan,
  checkSkillsNodeVersion,
  planSkillOperation as planSkillOperationBase,
  resolveSkillSourceRevision,
} from "../src/skills.mjs";
import { computeSkillFingerprint, writeSkillsStore } from "../src/skill-inventory.mjs";
import {
  SHA_A,
  SHA_B,
  createFakeFetch,
  ensureDir,
  linkSkillDir,
  makeTempRoot,
  managedEntry,
  writeSkillDir,
} from "./skills-fixtures.mjs";

// The pinned skills@1.7.0 requires Node >= 22.20.0. Tests inject a supported
// runtime; below-minimum behavior is covered explicitly.
const SUPPORTED_NODE = "22.20.0";
const planSkill = (options) =>
  planSkillOperationBase({ nodeVersion: SUPPORTED_NODE, env: {}, ...options });

function fixtureRoots(t) {
  const temp = makeTempRoot();
  t.after(() => temp.cleanup());
  const cwd = ensureDir(join(temp.root, "project"));
  const homeDir = ensureDir(join(temp.root, "home"));
  return { temp, cwd, homeDir };
}

async function seedManagedInstall({
  cwd,
  homeDir,
  id = "frontend-design",
  skill = id,
  source = "anthropics/skills",
  revision = SHA_A,
  agents = ["claude-code", "opencode"],
} = {}) {
  const canonicalDir = writeSkillDir(join(cwd, ".agents", "skills"), skill, { revision });
  const placements = [
    {
      path: `.agents/skills/${skill}`,
      kind: "canonical",
      fingerprint: await computeSkillFingerprint(canonicalDir),
      shared: true,
    },
  ];
  if (agents.includes("claude-code")) {
    const claudeDir = join(cwd, ".claude", "skills", skill);
    linkSkillDir(canonicalDir, claudeDir);
    placements.push({
      path: `.claude/skills/${skill}`,
      kind: "agent",
      agent: "claude-code",
      fingerprint: await computeSkillFingerprint(claudeDir),
    });
  }
  const store = {
    version: 1,
    skills: {
      [id]: managedEntry({
        id,
        skill,
        source,
        sourceUrl: `https://github.com/${source}`,
        revision,
        agents,
        placements,
      }),
    },
  };
  const written = await writeSkillsStore({ scope: "project", cwd, homeDir }, store);
  assert.equal(written.ok, true, written.failures?.join(" "));
  return { canonicalDir };
}

test("add previews the pinned command and freezes the resolved revision", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl, calls } = createFakeFetch({ sha: SHA_A });
  const plan = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode", "claude-code"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  assert.deepEqual(plan.agents, ["claude-code", "opencode"]);
  assert.equal(plan.expectedPlan.revision, SHA_A);
  assert.equal(plan.expectedPlan.sourceSpec, `https://github.com/anthropics/skills/tree/${SHA_A}`);
  assert.deepEqual(
    [...plan.command.args],
    [
      "--yes",
      "--ignore-scripts",
      "skills@1.7.0",
      "add",
      `https://github.com/anthropics/skills/tree/${SHA_A}`,
      "--skill",
      "frontend-design",
      "--agent",
      "claude-code",
      "opencode",
      "-y",
      "--json",
    ],
  );
  assert.equal(plan.command.executable, "npx");
  assert.equal(plan.command.package, "skills@1.7.0");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.github.com/repos/anthropics/skills/commits/HEAD");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(
    plan.expectedPlan.before.every((target) => target.exists === false),
    true,
  );
});

test("plan rejects unknown ids, agents, scopes, and missing roots", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({});
  const base = {
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  };
  const cases = [
    [{ skillId: "attacker/evil" }, /allowlisted catalog id/],
    [{ agents: ["evil-agent"] }, /allowlisted agent/],
    [{ agents: [] }, /At least one allowlisted agent/],
    [{ scope: "system" }, /scope must be/],
    [{ action: "install" }, /action must be one of/],
    [{ cwd: undefined }, /cwd root is required/],
    [{ cwd: join(cwd, "missing") }, /cwd does not exist/],
  ];
  for (const [patch, pattern] of cases) {
    const result = await planSkill({ ...base, ...patch });
    assert.equal(result.ok, false, `expected failure for ${JSON.stringify(patch)}`);
    assert.match(result.failures.join(" "), pattern);
  }
});

test("bounded source resolution rejects redirects, HTTP errors, oversized bodies, and bad SHAs", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const base = {
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
  };
  const cases = [
    [createFakeFetch({ status: 302 }).impl, /redirected/i],
    [createFakeFetch({ status: 404 }).impl, /HTTP 404/],
    [createFakeFetch({ body: JSON.stringify({ sha: "nope" }) }).impl, /40-hex commit SHA/],
    [
      createFakeFetch({ body: "x".repeat(2000) }).impl,
      /exceeded 64 bytes/,
      { resolveMaxBytes: 64 },
    ],
    [createFakeFetch({ throwError: new Error("boom") }).impl, /boom/],
  ];
  for (const [impl, pattern, extra] of cases) {
    const result = await planSkill({ ...base, ...extra, fetchImpl: impl });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), pattern);
  }
  const noFetch = await planSkill({ ...base, fetchImpl: 42 });
  assert.equal(noFetch.ok, false);
  assert.match(noFetch.failures.join(" "), /fetch implementation/);
});

test("an existing unmanaged same-name placement refuses add", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  writeSkillDir(join(cwd, ".agents", "skills"), "frontend-design");
  const { impl } = createFakeFetch({ sha: SHA_A });
  const result = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /unmanaged/);
});

test("managed unchanged installs are verified no-ops", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir });
  const { impl } = createFakeFetch({ sha: SHA_A });
  const add = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(add.ok, true, add.failures?.join(" "));
  assert.equal(add.expectedPlan.noop, true);
  assert.equal(add.expectedPlan.idempotent, true);

  const update = await planSkill({
    action: "update",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(update.ok, true, update.failures?.join(" "));
  assert.equal(update.expectedPlan.noop, true);
});

test("add refuses a different revision and points at update", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir, revision: SHA_A });
  const { impl } = createFakeFetch({ sha: SHA_B });
  const result = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /use the update action/);
});

test("update refuses unmanaged, modified, and agent-mismatched targets", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_B });
  const base = {
    action: "update",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  };
  const unmanaged = await planSkill(base);
  assert.equal(unmanaged.ok, false);
  assert.match(unmanaged.failures.join(" "), /not managed/);

  const { canonicalDir } = await seedManagedInstall({ cwd, homeDir, revision: SHA_A });
  writeFileSync(join(canonicalDir, "SKILL.md"), "---\nname: frontend-design\n---\nlocal edit\n");
  const modified = await planSkill(base);
  assert.equal(modified.ok, false);
  assert.match(modified.failures.join(" "), /modified or incomplete/);

  const { cwd: cwd2, homeDir: homeDir2 } = fixtureRoots(t);
  await seedManagedInstall({ cwd: cwd2, homeDir: homeDir2, revision: SHA_A });
  const mismatch = await planSkill({
    ...base,
    cwd: cwd2,
    homeDir: homeDir2,
    agents: ["opencode"],
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.failures.join(" "), /differ from the managed install/);
});

test("update refuses unrecorded placements as unverifiable", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir, agents: ["opencode"] });
  writeSkillDir(join(cwd, ".claude", "skills"), "frontend-design", { revision: "manual" });
  const { impl } = createFakeFetch({ sha: SHA_B });
  const result = await planSkill({
    action: "update",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /Unrecorded/);
});

test("same-name source conflicts cannot silently replace", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir, source: "vercel-labs/agent-skills" });
  const { impl } = createFakeFetch({ sha: SHA_A });
  const result = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /ambiguous same-name/);
});

test("remove previews exact args and flags shared canonical placement", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir });
  const plan = await planSkill({
    action: "remove",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  assert.deepEqual(
    [...plan.command.args],
    [
      "--yes",
      "--ignore-scripts",
      "skills@1.7.0",
      "remove",
      "frontend-design",
      "--agent",
      "opencode",
      "-y",
    ],
  );
  assert.equal(plan.expectedPlan.canonicalSelected, true);
  assert.ok(plan.warnings.some((warning) => /shared/i.test(warning)));
  assert.ok(plan.warnings.some((warning) => /remain untouched/i.test(warning)));
});

test("remove refuses unmanaged skills and unselected shared placements", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const base = {
    action: "remove",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
  };
  const unmanaged = await planSkill(base);
  assert.equal(unmanaged.ok, false);
  assert.match(unmanaged.failures.join(" "), /not managed/);

  const { cwd: cwd2, homeDir: homeDir2 } = fixtureRoots(t);
  await seedManagedInstall({ cwd: cwd2, homeDir: homeDir2 });
  const shared = await planSkill({
    ...base,
    cwd: cwd2,
    homeDir: homeDir2,
    agents: ["claude-code"],
  });
  assert.equal(shared.ok, false);
  assert.match(shared.failures.join(" "), /shared canonical/);
});

test("remove flags modified targets clearly", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { canonicalDir } = await seedManagedInstall({ cwd, homeDir });
  writeFileSync(join(canonicalDir, "SKILL.md"), "---\nname: frontend-design\n---\nlocal edit\n");
  const plan = await planSkill({
    action: "remove",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  assert.ok(plan.warnings.some((warning) => /local modifications/i.test(warning)));
});

test("global scope pins --global and the prism-ds global store", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await planSkill({
    action: "add",
    skillId: "emil-design-eng",
    cwd,
    scope: "global",
    agents: ["codex"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  assert.equal(plan.command.args.at(-1), "--global");
  assert.equal(plan.storePath, join(homeDir, ".prism-ds", "skills.json"));
});

test("an unsupported runtime is a hard blocker before any network read", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl, calls } = createFakeFetch({ sha: SHA_A });
  const base = {
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
    nodeVersion: "22.0.0",
  };
  const add = await planSkill({ ...base, action: "add" });
  assert.equal(add.ok, false);
  assert.match(add.failures.join(" "), /requires Node >= 22\.20\.0/);
  assert.match(add.failures.join(" "), /Upgrade Node/);
  assert.equal(calls.length, 0, "below-minimum add must not resolve the source");

  const update = await planSkill({ ...base, action: "update" });
  assert.equal(update.ok, false);
  assert.match(update.failures.join(" "), /requires Node >= 22\.20\.0/);
  assert.equal(calls.length, 0, "below-minimum update must not resolve the source");

  const remove = await planSkill({ ...base, action: "remove" });
  assert.equal(remove.ok, false);
  assert.match(remove.failures.join(" "), /requires Node >= 22\.20\.0/);
  assert.equal(calls.length, 0);

  assert.equal(checkSkillsNodeVersion("22.13.1").ok, false);
  assert.equal(checkSkillsNodeVersion("22.20.0").ok, true);
  assert.equal(checkSkillsNodeVersion("24.0.0").ok, true);
});

test("command builders reject unsafe tokens and pin the executable", () => {
  assert.throws(() => assertSafeSkillArgument("a#b"), /Unsafe/);
  assert.throws(() => assertSafeSkillArgument("a;rm -rf /"), /Unsafe/);
  assert.throws(() => assertSafeSkillArgument(""), /Unsafe/);
  assert.throws(
    () =>
      buildSkillCommandArgs({
        action: "add",
        sourceSpec: "https://github.com/x/y/tree/abc#def",
        skillName: "frontend-design",
        agents: ["opencode"],
        scope: "project",
      }),
    /Unsafe skills source spec/,
  );
  const args = buildSkillCommandArgs({
    action: "add",
    sourceSpec: `https://github.com/anthropics/skills/tree/${SHA_A}`,
    skillName: "frontend-design",
    agents: ["opencode"],
    scope: "project",
  });
  assert.equal(Object.isFrozen(args), true);

  const posix = buildSkillsSpawnPlan({ args: [...args], platform: "linux" });
  assert.equal(posix.command, "npx");
  assert.deepEqual(posix.args, [...args]);
  assert.deepEqual(posix.options, { shell: false });

  const windows = buildSkillsSpawnPlan({
    args: [...args],
    platform: "win32",
    comSpec: "C:\\Windows\\System32\\cmd.exe",
  });
  assert.equal(windows.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(windows.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.equal(windows.args[3].startsWith("npx --yes --ignore-scripts skills@1.7.0"), true);
  assert.deepEqual(windows.options, { shell: false, windowsVerbatimArguments: true });
});

test("resolveSkillSourceRevision validates the source allowlist", async () => {
  const bad = await resolveSkillSourceRevision({ source: "attacker/evil", fetchImpl: 42 });
  assert.equal(bad.ok, false);
  assert.match(bad.failures.join(" "), /Unknown skill catalog source/);
});
