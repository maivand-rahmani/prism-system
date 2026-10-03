/**
 * Execution tests: consent gate, frozen revision, drift refusal, exact spawn
 * invocation, post-state verification, and metadata recording. The upstream
 * CLI is always a fake synchronous runner; nothing is installed for real.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  executeSkillOperation as executeSkillOperationBase,
  planSkillOperation as planSkillOperationBase,
} from "../src/skills.mjs";
import { computeSkillFingerprint, writeSkillsStore } from "../src/skill-inventory.mjs";
import {
  SHA_A,
  SHA_B,
  createFakeFetch,
  createFakeSkillRunner,
  ensureDir,
  linkSkillDir,
  makeTempRoot,
  managedEntry,
  readJson,
  writeSkillDir,
} from "./skills-fixtures.mjs";

// The pinned skills@1.7.0 requires Node >= 22.20.0. Tests inject a supported
// runtime; below-minimum behavior is covered explicitly.
const SUPPORTED_NODE = "22.20.0";
const planSkill = (options) => planSkillOperationBase({ nodeVersion: SUPPORTED_NODE, ...options });
const executeSkill = (options) =>
  executeSkillOperationBase({
    nodeVersion: SUPPORTED_NODE,
    env: {},
    action: options.plan?.action,
    skillId: options.plan?.skillId,
    ...options,
  });

function fixtureRoots(t) {
  const temp = makeTempRoot();
  t.after(() => temp.cleanup());
  const cwd = ensureDir(join(temp.root, "project"));
  const homeDir = ensureDir(join(temp.root, "home"));
  return { temp, cwd, homeDir };
}

const FIXED_NOW = () => new Date("2026-02-02T00:00:00.000Z");

function storePath(cwd) {
  return join(cwd, ".design-system", "skills.json");
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

async function previewAdd({ cwd, homeDir, fetchImpl, agents = ["claude-code", "opencode"] }) {
  return planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents,
    homeDir,
    env: {},
    fetchImpl,
  });
}

test("mutations require confirmed:true before any subprocess", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await previewAdd({ cwd, homeDir, fetchImpl: impl });
  assert.equal(plan.ok, true);
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });

  const refused = await executeSkill({
    plan,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: runner,
    platform: "linux",
  });
  assert.equal(refused.ok, false);
  assert.match(refused.failures.join(" "), /confirmed:true/);
  assert.equal(calls.length, 0);
  assert.equal(existsSync(storePath(cwd)), false);
});

test("execute add uses the frozen preview revision and records verified metadata", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const plan = await previewAdd({ cwd, homeDir, fetchImpl: impl });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const env = { PRISM_TEST: "1" };

  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["opencode", "claude-code"],
    env,
    spawnImpl: runner,
    platform: "linux",
    now: FIXED_NOW,
  });
  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.executed, true);
  assert.equal(result.revision, SHA_A);
  assert.equal(fetchCalls.length, 1, "execute with a plan must not re-resolve the source");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npx");
  assert.deepEqual(calls[0].args, [...plan.command.args]);
  assert.deepEqual(calls[0].options, { cwd, env, stdio: "pipe", shell: false });

  const store = readJson(storePath(cwd));
  const entry = store.skills["frontend-design"];
  assert.equal(entry.revision, SHA_A);
  assert.deepEqual(entry.agents, ["claude-code", "opencode"]);
  assert.equal(entry.installedAt, "2026-02-02T00:00:00.000Z");
  assert.deepEqual(entry.placements.map((placement) => placement.path).sort(), [
    ".agents/skills/frontend-design",
    ".claude/skills/frontend-design",
  ]);
  for (const placement of entry.placements) assert.match(placement.fingerprint, /^[0-9a-f]{64}$/);
});

test("execute refuses a plan that does not match the requested inputs", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await previewAdd({ cwd, homeDir, fetchImpl: impl });
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["opencode"],
    spawnImpl: runner,
    platform: "linux",
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /agents do not match/);
  assert.equal(calls.length, 0);
});

test("execute refuses when local state drifted since the preview", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await previewAdd({ cwd, homeDir, fetchImpl: impl });
  // A new placement appears between preview and consent.
  writeSkillDir(join(cwd, ".claude", "skills"), "frontend-design", { revision: "drift" });
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: runner,
    platform: "linux",
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /changed since the preview/);
  assert.equal(calls.length, 0);
  assert.equal(existsSync(storePath(cwd)), false);
});

test("execute refuses when prism-ds metadata drifted since the preview", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir, revision: SHA_A });
  const { impl } = createFakeFetch({ sha: SHA_B });
  const plan = await planSkill({
    action: "update",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  // Rewrite metadata with a different revision after the preview.
  const store = readJson(storePath(cwd));
  store.skills["frontend-design"].revision = SHA_A;
  store.skills["frontend-design"].updatedAt = "2099-01-01T00:00:00.000Z";
  await writeSkillsStore({ scope: "project", cwd, homeDir }, store);

  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: runner,
    platform: "linux",
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /metadata changed since the preview/);
  assert.equal(calls.length, 0);
});

test("a failing upstream exit never records success", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await previewAdd({ cwd, homeDir, fetchImpl: impl });
  const { runner } = createFakeSkillRunner({
    cwd,
    homeDir,
    fail: { status: 1, stdout: "", stderr: "network down" },
  });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: runner,
    platform: "linux",
  });
  assert.equal(result.ok, false);
  assert.equal(result.executed, true);
  assert.match(result.failures.join(" "), /network down/);
  assert.equal(existsSync(storePath(cwd)), false);
});

test("malformed upstream JSON never records success", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await previewAdd({ cwd, homeDir, fetchImpl: impl });

  const malformed = createFakeSkillRunner({ cwd, homeDir, stdout: "not json" });
  const malformedResult = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: malformed.runner,
    platform: "linux",
  });
  assert.equal(malformedResult.ok, false);
  assert.match(malformedResult.failures.join(" "), /did not emit verifiable JSON/);
  assert.equal(existsSync(storePath(cwd)), false);
});

test("a mismatched upstream revision never records success", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await previewAdd({ cwd, homeDir, fetchImpl: impl });
  const mismatched = createFakeSkillRunner({
    cwd,
    homeDir,
    stdout: JSON.stringify([
      {
        name: "frontend-design",
        status: "installed",
        ref: SHA_B,
        scope: "project",
        agents: ["claude-code", "opencode"],
      },
    ]),
  });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: mismatched.runner,
    platform: "linux",
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /does not match the frozen preview revision/);
  assert.equal(existsSync(storePath(cwd)), false);
});

test("update installs the new revision and refreshes fingerprints", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir, revision: SHA_A });
  const { impl } = createFakeFetch({ sha: SHA_B });
  const plan = await planSkill({
    action: "update",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: runner,
    platform: "linux",
    now: FIXED_NOW,
  });
  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.includes(`https://github.com/anthropics/skills/tree/${SHA_B}`), true);
  const store = readJson(storePath(cwd));
  assert.equal(store.skills["frontend-design"].revision, SHA_B);
  assert.equal(store.skills["frontend-design"].updatedAt, "2026-02-02T00:00:00.000Z");
});

test("an update at the same revision is a verified no-op with no subprocess", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir, revision: SHA_A });
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await planSkill({
    action: "update",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["claude-code", "opencode"],
    spawnImpl: runner,
    platform: "linux",
  });
  assert.equal(result.ok, true);
  assert.equal(result.executed, false);
  assert.equal(result.reason, "noop");
  assert.equal(calls.length, 0);
});

test("remove deletes the selected placement and cleans metadata", async (t) => {
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
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["opencode"],
    spawnImpl: runner,
    platform: "linux",
    now: FIXED_NOW,
  });
  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(calls.length, 1);
  assert.equal(existsSync(join(cwd, ".agents", "skills", "frontend-design")), false);
  const store = readJson(storePath(cwd));
  assert.deepEqual(store.skills, {});
});

test("remove keeps metadata when the shared canonical placement is retained", async (t) => {
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
  const { runner } = createFakeSkillRunner({ cwd, homeDir, retainCanonical: true });
  const result = await executeSkill({
    plan,
    confirmed: true,
    cwd,
    homeDir,
    agents: ["opencode"],
    spawnImpl: runner,
    platform: "linux",
    now: FIXED_NOW,
  });
  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(result.verification.canonicalRetained, true);
  const store = readJson(storePath(cwd));
  const entry = store.skills["frontend-design"];
  assert.ok(entry, "a retained shared placement must stay managed");
  assert.deepEqual(entry.agents, ["claude-code"]);
  assert.equal(
    entry.placements.some((placement) => placement.path === ".agents/skills/frontend-design"),
    true,
  );
});

test("execute without a provided plan resolves once and then runs", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
    confirmed: true,
    spawnImpl: runner,
    platform: "linux",
    now: FIXED_NOW,
  });
  assert.equal(result.ok, true, result.failures?.join(" "));
  assert.equal(fetchCalls.length, 1);
  assert.equal(calls.length, 1);
  const store = readJson(storePath(cwd));
  assert.equal(store.skills["frontend-design"].revision, SHA_A);
});

test("execute with a saved plan is blocked below the pinned runtime", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const plan = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkillOperationBase({
    plan,
    confirmed: true,
    action: "add",
    skillId: "frontend-design",
    cwd,
    homeDir,
    agents: ["opencode"],
    spawnImpl: runner,
    platform: "linux",
    nodeVersion: "22.13.1",
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /requires Node >= 22\.20\.0/);
  assert.equal(calls.length, 0);
  assert.equal(fetchCalls.length, 1, "only the preview resolution may happen");
  assert.equal(existsSync(storePath(cwd)), false);
});

test("execute with a saved plan requires the explicit authorized request", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const plan = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(plan.ok, true, plan.failures?.join(" "));
  const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
  const result = await executeSkillOperationBase({
    plan,
    confirmed: true,
    spawnImpl: runner,
    platform: "linux",
    nodeVersion: SUPPORTED_NODE,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /explicit action/);
  assert.equal(calls.length, 0);
  assert.equal(existsSync(storePath(cwd)), false);
});

test("a tampered saved add plan is rejected before spawn or write", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  const { impl } = createFakeFetch({ sha: SHA_A });
  const legit = await planSkill({
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    fetchImpl: impl,
  });
  assert.equal(legit.ok, true, legit.failures?.join(" "));
  const request = {
    confirmed: true,
    action: "add",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["claude-code", "opencode"],
    homeDir,
    env: {},
    platform: "linux",
    nodeVersion: SUPPORTED_NODE,
  };
  const clone = () => structuredClone(legit);
  const specIndex = (plan) => plan.command.args.indexOf("add") + 1;
  const cases = [];

  {
    const p = clone();
    p.command.args[specIndex(p)] = `https://github.com/vercel-labs/agent-skills/tree/${SHA_A}`;
    cases.push(["source spec substitution", p, /altered plan/]);
  }
  {
    const p = clone();
    p.command.args[p.command.args.indexOf("add")] = "remove";
    cases.push(["verb substitution", p, /altered plan/]);
  }
  {
    const p = clone();
    p.command.args[p.command.args.indexOf("skills@1.7.0")] = "skills@9.9.9";
    cases.push(["package substitution", p, /altered plan/]);
  }
  {
    const p = clone();
    p.command.executable = "sh";
    cases.push(["executable substitution", p, /altered plan/]);
  }
  {
    const p = clone();
    p.command.args[p.command.args.indexOf("--skill") + 1] = "critique";
    cases.push(["skill substitution", p, /altered plan/]);
  }
  {
    const p = clone();
    p.command.args[p.command.args.indexOf("--agent") + 1] = "cursor";
    cases.push(["agent argv substitution", p, /altered plan/]);
  }
  {
    const p = clone();
    p.command.args.push("--replace");
    cases.push(["appended token", p, /altered plan/]);
  }
  {
    const p = clone();
    const spec = `https://github.com/vercel-labs/agent-skills/tree/${SHA_A}`;
    p.source = {
      ...p.source,
      id: "vercel-labs/agent-skills",
      owner: "vercel-labs",
      repo: "agent-skills",
      url: "https://github.com/vercel-labs/agent-skills",
      spec,
    };
    p.expectedPlan.source = "vercel-labs/agent-skills";
    p.expectedPlan.sourceSpec = spec;
    p.command.args[specIndex(p)] = spec;
    cases.push(["source owner substitution", p, /current catalog source|does not belong/]);
  }
  {
    const p = clone();
    p.expectedPlan.revision = SHA_A.toUpperCase();
    p.source.revision = p.expectedPlan.revision;
    p.source.spec = `https://github.com/anthropics/skills/tree/${p.expectedPlan.revision}`;
    p.expectedPlan.sourceSpec = p.source.spec;
    p.command.args[specIndex(p)] = p.source.spec;
    cases.push(["invalid source revision", p, /frozen 40-hex/]);
  }
  {
    const p = clone();
    p.scope = "global";
    p.command.scope = "global";
    p.command.args.push("--global");
    p.expectedPlan.scope = "global";
    p.storePath = join(homeDir, ".prism-ds", "skills.json");
    p.expectedPlan.storePath = p.storePath;
    cases.push(["scope substitution", p, /scope does not match/]);
  }
  {
    const p = clone();
    p.cwd = join(cwd, "..");
    p.command.cwd = p.cwd;
    p.expectedPlan.cwd = p.cwd;
    cases.push(["cwd substitution", p, /cwd does not match/]);
  }
  {
    const p = clone();
    p.homeDir = join(homeDir, "elsewhere");
    p.expectedPlan.homeDir = p.homeDir;
    cases.push(["home substitution", p, /homeDir does not match/]);
  }
  {
    const p = clone();
    p.storePath = join(cwd, "evil-store.json");
    p.expectedPlan.storePath = p.storePath;
    cases.push(["store substitution", p, /store path/]);
  }
  {
    const p = clone();
    p.agents = ["opencode"];
    p.expectedPlan.agents = ["opencode"];
    p.command.args.splice(p.command.args.indexOf("--agent") + 1, 2, "opencode");
    cases.push(["agent request substitution", p, /agents do not match/]);
  }
  {
    const p = clone();
    const evilTarget = {
      path: join(cwd, "evil-skill"),
      kind: "agent",
      agent: "claude-code",
      relativePath: "evil-skill",
      selected: true,
      exists: false,
      symlink: false,
      broken: false,
      contained: true,
      isDirectory: false,
      hasSkillMd: false,
      fingerprint: null,
    };
    p.targets = [...p.targets, evilTarget];
    p.expectedPlan.before = [...p.expectedPlan.before, evilTarget];
    cases.push(["target injection", p, /unauthorized path/]);
  }
  {
    const p = clone();
    p.expectedPlan.metadataEntry = {
      id: "frontend-design",
      skill: "frontend-design",
      source: "vercel-labs/agent-skills",
      sourceUrl: "https://github.com/vercel-labs/agent-skills",
      revision: SHA_A,
      scope: "project",
      agents: ["opencode"],
      placements: [],
    };
    p.expectedPlan.metadataRevision = SHA_A;
    cases.push(["metadata substitution", p, /metadata entry source/]);
  }

  for (const [label, tampered, pattern] of cases) {
    const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
    const result = await executeSkillOperationBase({
      ...request,
      plan: tampered,
      spawnImpl: runner,
    });
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.match(result.failures.join(" "), pattern, `${label}: ${result.failures.join(" ")}`);
    assert.equal(calls.length, 0, `${label} must not spawn`);
    assert.equal(existsSync(storePath(cwd)), false, `${label} must not write metadata`);
  }
});

test("a tampered saved remove plan is rejected before spawn", async (t) => {
  const { cwd, homeDir } = fixtureRoots(t);
  await seedManagedInstall({ cwd, homeDir });
  const legit = await planSkill({
    action: "remove",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
  });
  assert.equal(legit.ok, true, legit.failures?.join(" "));
  const request = {
    confirmed: true,
    action: "remove",
    skillId: "frontend-design",
    cwd,
    scope: "project",
    agents: ["opencode"],
    homeDir,
    env: {},
    platform: "linux",
    nodeVersion: SUPPORTED_NODE,
  };
  const before = readJson(storePath(cwd));
  const cases = [];
  {
    const p = structuredClone(legit);
    p.command.args[p.command.args.indexOf("remove")] = "add";
    cases.push(["verb substitution", p, /altered plan/]);
  }
  {
    const p = structuredClone(legit);
    p.command.args[p.command.args.indexOf("skills@1.7.0")] = "skills@1.6.0";
    cases.push(["package substitution", p, /altered plan/]);
  }
  {
    const p = structuredClone(legit);
    p.storePath = join(cwd, "evil-store.json");
    p.expectedPlan.storePath = p.storePath;
    cases.push(["store substitution", p, /store path/]);
  }
  {
    const p = structuredClone(legit);
    p.expectedPlan.revision = SHA_B;
    cases.push(["revision substitution", p, /metadata entry/]);
  }

  for (const [label, tampered, pattern] of cases) {
    const { runner, calls } = createFakeSkillRunner({ cwd, homeDir });
    const result = await executeSkillOperationBase({
      ...request,
      plan: tampered,
      spawnImpl: runner,
    });
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.match(result.failures.join(" "), pattern, `${label}: ${result.failures.join(" ")}`);
    assert.equal(calls.length, 0, `${label} must not spawn`);
  }
  assert.deepEqual(readJson(storePath(cwd)), before, "metadata must stay unchanged");
});
