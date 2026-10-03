#!/usr/bin/env node
/**
 * Unit tests for the shared headless `use` + skills orchestrator
 * (`packages/tools/src/use-skills.mjs`).
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/use-skills.test.mjs
 *
 * Everything is injected: a local fake registry on 127.0.0.1, a fake
 * package-manager runner that materializes the design system in a temp
 * consumer, a fake pinned-skills runner from the skills fixtures, a fake
 * bounded GitHub fetch, temp home directories, and an injected runtime
 * version. No real npm/npx, no real home, no network, and no repository writes.
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import { USE_SKILL_ID, runUseWithSkills } from "../src/use-skills.mjs";
import { currentManifest, readJson, repoRoot } from "./manifest-fixture.mjs";
import { SHA_A, createFakeFetch, createFakeSkillRunner } from "./skills-fixtures.mjs";

const SYSTEM_A = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
);
const SUPPORTED_NODE = "22.20.0";

/* -------------------------------------------------------------------------- */
/* Temp roots                                                                 */
/* -------------------------------------------------------------------------- */

function makeTempDir(t, prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push([full, readFileSync(full, "utf8")]);
    }
  };
  walk(root);
  return out.sort();
}

function createConsumer(t) {
  const root = makeTempDir(t, "prism-use-skills-");
  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    packageManager: "npm@10.0.0",
  });
  return root;
}

function createHome(t, { agents = [] } = {}) {
  const home = makeTempDir(t, "prism-use-skills-home-");
  for (const agent of agents) {
    if (agent === "claude-code") mkdirSync(join(home, ".claude"), { recursive: true });
    else if (agent === "codex") mkdirSync(join(home, ".codex"), { recursive: true });
    else if (agent === "cursor") mkdirSync(join(home, ".cursor"), { recursive: true });
    else if (agent === "opencode")
      mkdirSync(join(home, ".config", "opencode"), { recursive: true });
  }
  return home;
}

/* -------------------------------------------------------------------------- */
/* Fake registry (tarball + packument) and DS runner                          */
/* -------------------------------------------------------------------------- */

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, "ascii");
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write("00000000000\0", 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write("0", 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  let sum = 0;
  for (let index = 0; index < 512; index += 1) sum += header[index];
  header.write(`${sum.toString(8).padStart(7, "0")}\0`, 148, "ascii");
  return header;
}

function makeTarball(files) {
  const chunks = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    chunks.push(tarHeader(name, data.length));
    chunks.push(data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

async function startRegistry(t, { packageName, manifest }) {
  const tarball = makeTarball({ "package/design-system.json": JSON.stringify(manifest) });
  const requests = [];
  const versions = {
    [manifest.version]: {
      name: packageName,
      version: manifest.version,
      prismSystem: { contractVersion: manifest.contractVersion },
      exports: { "./manifest": "./design-system.json" },
      dist: { tarball: "" },
    },
  };
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (/\/-\/([^/]+)\.tgz$/.test(request.url ?? "")) {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(tarball);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        name: packageName,
        "dist-tags": { latest: manifest.version },
        versions,
      }),
    );
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const registry = `http://127.0.0.1:${server.address().port}`;
  versions[manifest.version].dist.tarball =
    `${registry}/${encodeURIComponent(packageName)}/-/${manifest.version}.tgz`;
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  return { registry, requests };
}

/** Materialize the installed design system the way a real manager would. */
function materializeDesignSystem(root, manifest) {
  const packageDir = join(root, "node_modules", ...manifest.package.split("/"));
  writeJson(join(packageDir, "package.json"), {
    name: manifest.package,
    version: manifest.version,
    exports: {
      "./manifest": "./design-system.json",
      "./tailwind.css": "./dist/tailwind.css",
      "./styles.css": "./dist/index.css",
    },
  });
  writeJson(join(packageDir, "design-system.json"), manifest);
  writeFile(packageDir, "dist/tailwind.css", "/* tailwind bridge */\n");
  writeFile(packageDir, "dist/index.css", "/* styles */\n");
}

function createDesignSystemRunner() {
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args: [...args], options });
    materializeDesignSystem(options.cwd, SYSTEM_A);
    return { status: 0, stdout: "", stderr: "" };
  };
  return { runner, calls };
}

/* -------------------------------------------------------------------------- */
/* skills:false passthrough                                                   */
/* -------------------------------------------------------------------------- */

test("skills:false is a pure runUseDesignSystem passthrough", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const before = snapshot(consumer);
  const home = createHome(t, { agents: ["cursor"] });
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    version: SYSTEM_A.version,
    registry: registry.registry,
    dryRun: true,
    skills: false,
    homeDir: home,
    skillFetchImpl: impl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.install.package, SYSTEM_A.package);
  assert.equal(result.install.version, SYSTEM_A.version);
  assert.equal(result.skillSetup.enabled, false);
  assert.equal(result.skillSetup.status, "disabled");
  assert.equal(result.partial, false);
  assert.equal(result.skillRequested, false);
  assert.equal(fetchCalls.length, 0, "no skill source read when skills are disabled");
  assert.deepEqual(snapshot(consumer), before);
});

/* -------------------------------------------------------------------------- */
/* Preview paths                                                              */
/* -------------------------------------------------------------------------- */

test("dry run with zero detected agents keeps the DS plan and reports pending", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const before = snapshot(consumer);
  const home = createHome(t);
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const ds = createDesignSystemRunner();
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
    spawnImpl: ds.runner,
  });

  assert.equal(result.ok, true);
  assert.equal(result.systemReady, true);
  assert.equal(result.partial, false);
  assert.equal(result.skillSetup.status, "pending");
  assert.equal(result.skillSetup.reason, "no-agent-detected");
  assert.match(result.skillSetup.guidance, /--skill-agent/);
  assert.equal(fetchCalls.length, 0, "no agent means no source read");
  assert.equal(ds.calls.length, 0);
  assert.equal(skill.calls.length, 0);
  assert.deepEqual(snapshot(consumer), before);
});

test("dry run with exactly one detected agent freezes the skill plan", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const before = snapshot(consumer);
  const home = createHome(t, { agents: ["cursor"] });
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
  });

  assert.equal(result.ok, true);
  assert.equal(result.systemReady, true);
  assert.equal(result.partial, false);
  assert.equal(result.skillSetup.status, "planned");
  assert.deepEqual(result.skillSetup.agents, ["cursor"]);
  assert.equal(result.skillSetup.skillId, USE_SKILL_ID);
  assert.equal(result.skillSetup.revision, SHA_A);
  assert.equal(result.skillSetup.command.executable, "npx");
  assert.ok(result.skillSetup.command.args.includes(`skills@1.7.0`));
  assert.ok(result.skillSetup.command.args.includes("use-design-system"));
  assert.ok(result.skillSetup.command.args.includes("cursor"));
  assert.match(result.skillPlan.command.args.join(" "), new RegExp(`/tree/${SHA_A}`));
  assert.equal(fetchCalls.length, 1, "exactly one bounded source read");
  assert.equal(skill.calls.length, 0);
  assert.deepEqual(snapshot(consumer), before, "preview must not write");
});

test("multiple detected agents stay pending unless one is explicitly selected", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const home = createHome(t, { agents: ["cursor", "claude-code"] });

  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const pending = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
  });
  assert.equal(pending.ok, true);
  assert.equal(pending.skillSetup.status, "pending");
  assert.equal(pending.skillSetup.reason, "multiple-agents-detected");
  assert.deepEqual(pending.skillSetup.detected, ["claude-code", "cursor"]);
  assert.match(pending.skillSetup.guidance, /--skill-agent/);
  assert.equal(fetchCalls.length, 0, "ambiguous selection never guesses a source read");

  const explicit = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    skillAgents: ["claude-code"],
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
  });
  assert.equal(explicit.ok, true);
  assert.equal(explicit.skillRequested, true);
  assert.equal(explicit.skillSetup.status, "planned");
  assert.deepEqual(explicit.skillSetup.agents, ["claude-code"]);
  assert.equal(fetchCalls.length, 1);
});

test("an invalid explicit agent fails closed before any registry read or spawn", async (t) => {
  const consumer = createConsumer(t);
  const before = snapshot(consumer);
  const home = createHome(t, { agents: ["cursor"] });
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    skillAgents: ["bogus-agent"],
    nodeVersion: SUPPORTED_NODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "skills");
  assert.equal(result.skillSetup.status, "blocked");
  assert.equal(result.skillSetup.reason, "invalid-agent-selection");
  assert.equal(registry.requests.length, 0, "no registry read for an invalid argument");
  assert.deepEqual(snapshot(consumer), before);
});

test("a real run requires confirmed:true before any read, spawn, or write", async (t) => {
  const consumer = createConsumer(t);
  const before = snapshot(consumer);
  const home = createHome(t, { agents: ["cursor"] });
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const ds = createDesignSystemRunner();

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    spawnImpl: ds.runner,
  });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "confirmation-required");
  assert.equal(result.skillSetup.status, "pending-confirmation");
  assert.equal(registry.requests.length, 0);
  assert.equal(ds.calls.length, 0);
  assert.deepEqual(snapshot(consumer), before);
});

/* -------------------------------------------------------------------------- */
/* Confirmed runs                                                             */
/* -------------------------------------------------------------------------- */

test("a confirmed run installs the DS and the frozen skill without partial state", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const home = createHome(t, { agents: ["cursor"] });
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const ds = createDesignSystemRunner();
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    version: SYSTEM_A.version,
    registry: registry.registry,
    confirmed: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
    spawnImpl: ds.runner,
  });

  assert.equal(result.ok, true);
  assert.equal(result.systemReady, true);
  assert.equal(result.partial, false);
  assert.equal(result.skillSetup.status, "installed");
  assert.equal(result.skillSetup.revision, SHA_A);
  assert.equal(result.skillSetup.storePath, join(consumer, ".design-system", "skills.json"));
  assert.equal(fetchCalls.length, 1, "the source revision is frozen once");
  assert.equal(ds.calls.length, 1, "the design system manager ran exactly once");
  assert.equal(skill.calls.length, 1, "the pinned skills runner ran exactly once");
  assert.match(
    ds.calls[0].args.join(" "),
    new RegExp(
      `${SYSTEM_A.package.replace(/[/@]/g, "\\$&")}@${SYSTEM_A.version.replace(/\./g, "\\.")}`,
    ),
  );
  assert.match(skill.calls[0].args.join(" "), new RegExp(`tree/${SHA_A}`));
  assert.ok(existsSync(join(consumer, ".design-system", "config.json")));
  assert.ok(existsSync(join(consumer, ".design-system", "skills.json")));
  assert.ok(existsSync(join(consumer, ".agents", "skills", USE_SKILL_ID, "SKILL.md")));
});

test("a requested skill failure leaves the DS ready, reports partial, and gives a rerun", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const home = createHome(t, { agents: ["cursor"] });
  const { impl } = createFakeFetch({ sha: SHA_A });
  const ds = createDesignSystemRunner();
  const failing = createFakeSkillRunner({
    cwd: consumer,
    homeDir: home,
    status: 1,
    stderr: "upstream failed",
  });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    version: SYSTEM_A.version,
    registry: registry.registry,
    confirmed: true,
    homeDir: home,
    skillAgents: ["cursor"],
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: failing.runner,
    skillPlatform: "linux",
    spawnImpl: ds.runner,
  });

  assert.equal(result.systemReady, true, "the design system setup completed");
  assert.equal(result.partial, true);
  assert.equal(result.ok, false, "an explicitly requested skill failure exits non-zero");
  assert.equal(result.boundary, "skills");
  assert.equal(result.skillSetup.status, "failed");
  assert.ok(result.failures.length > 0);
  assert.match(result.skillSetup.nextCommand, /skills add use-design-system/);
  assert.ok(existsSync(join(consumer, ".design-system", "config.json")), "no rollback of DS setup");
  assert.equal(ds.calls.length, 1);
  assert.equal(failing.calls.length, 1);
});

test("a default skill plan failure does not block the DS setup and stays partial", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const home = createHome(t, { agents: ["cursor"] });
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const ds = createDesignSystemRunner();
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    version: SYSTEM_A.version,
    registry: registry.registry,
    confirmed: true,
    homeDir: home,
    nodeVersion: "22.13.1",
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
    spawnImpl: ds.runner,
  });

  assert.equal(result.systemReady, true, "the unsupported skills runtime never blocks the DS");
  assert.equal(result.ok, true, "a default (not explicitly requested) skill block follows DS ok");
  assert.equal(result.partial, true);
  assert.equal(result.skillSetup.status, "blocked");
  assert.equal(result.skillSetup.reason, "skill-plan-failed");
  assert.match(result.skillSetup.guidance, /22\.20\.0/);
  assert.equal(fetchCalls.length, 0, "the runtime guard fails before any source read");
  assert.equal(skill.calls.length, 0);
  assert.equal(ds.calls.length, 1);
  assert.ok(existsSync(join(consumer, ".design-system", "config.json")));
});

test("a supplied preview reuses the frozen version and skill revision", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const home = createHome(t, { agents: ["cursor"] });
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const ds = createDesignSystemRunner();
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });

  const preview = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
    spawnImpl: ds.runner,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.skillSetup.status, "planned");

  const applied = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    confirmed: true,
    preview: { use: preview.use, skillPlan: preview.skillPlan },
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
    spawnImpl: ds.runner,
  });

  assert.equal(applied.ok, true);
  assert.equal(applied.skillSetup.status, "installed");
  assert.equal(applied.install.version, preview.install.version);
  assert.equal(fetchCalls.length, 1, "the supplied frozen skill plan is reused, not re-read");
  assert.equal(skill.calls.length, 1);
  assert.match(skill.calls[0].args.join(" "), new RegExp(`tree/${SHA_A}`));
});

test("a real run with no detected agent still sets up the DS and reports pending", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const home = createHome(t);
  const { impl, calls: fetchCalls } = createFakeFetch({ sha: SHA_A });
  const ds = createDesignSystemRunner();
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    version: SYSTEM_A.version,
    registry: registry.registry,
    confirmed: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
    spawnImpl: ds.runner,
  });

  assert.equal(result.systemReady, true, "an unresolved selection never blocks the DS");
  assert.equal(result.ok, true, "the default pending state follows the DS result");
  assert.equal(result.partial, true, "the project is honestly reported as partially set up");
  assert.equal(result.skillSetup.status, "pending");
  assert.equal(result.skillSetup.reason, "no-agent-detected");
  assert.match(result.skillSetup.guidance, /--skill-agent/);
  assert.equal(ds.calls.length, 1);
  assert.equal(skill.calls.length, 0);
  assert.equal(fetchCalls.length, 0);
  assert.ok(existsSync(join(consumer, ".design-system", "config.json")));
});

test("a source-read failure is reported as blocked and never guessed", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const before = snapshot(consumer);
  const home = createHome(t, { agents: ["cursor"] });
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });
  const failingFetch = () => {
    throw new Error("offline");
  };

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: failingFetch,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
  });

  assert.equal(result.ok, true, "the default block follows the DS plan");
  assert.equal(result.skillSetup.status, "blocked");
  assert.equal(result.skillSetup.reason, "skill-plan-failed");
  assert.match(result.skillSetup.failures.join(" "), /Could not resolve|offline/);
  assert.match(result.skillSetup.guidance, /Re-run when/);
  assert.equal(skill.calls.length, 0);
  assert.deepEqual(snapshot(consumer), before);
});

test("an existing unmanaged skill is blocked, never overwritten", async (t) => {
  const registry = await startRegistry(t, {
    packageName: SYSTEM_A.package,
    manifest: SYSTEM_A,
  });
  const consumer = createConsumer(t);
  const home = createHome(t, { agents: ["cursor"] });
  const existing = writeFile(
    consumer,
    join(".agents", "skills", USE_SKILL_ID, "SKILL.md"),
    "# user-owned skill\n",
  );
  const { impl } = createFakeFetch({ sha: SHA_A });
  const skill = createFakeSkillRunner({ cwd: consumer, homeDir: home });

  const result = await runUseWithSkills({
    cwd: consumer,
    package: SYSTEM_A.package,
    registry: registry.registry,
    dryRun: true,
    homeDir: home,
    nodeVersion: SUPPORTED_NODE,
    skillFetchImpl: impl,
    skillSpawnImpl: skill.runner,
    skillPlatform: "linux",
  });

  assert.equal(result.skillSetup.status, "blocked");
  assert.equal(result.skillSetup.reason, "skill-plan-failed");
  assert.match(result.skillSetup.failures.join(" "), /refusing to replace it/);
  assert.match(result.skillSetup.guidance, /unmanaged|Resolve the existing/);
  assert.equal(skill.calls.length, 0);
  assert.equal(readFileSync(existing, "utf8"), "# user-owned skill\n");
});
