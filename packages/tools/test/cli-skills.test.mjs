#!/usr/bin/env node
/**
 * Direct CLI tests for `prism-ds skills`.
 *
 * Run (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/cli-skills.test.mjs
 *
 * Strategy:
 *
 *   - `skills list` runs the real binary with a mocked temp home so no real
 *     agent store is read or written.
 *   - Mutation planning runs in a child helper process (`--child`) that injects
 *     a runtime version and a fake bounded source fetch, captures the CLI
 *     streams, and returns a JSON envelope. No test runs the real
 *     `npx skills@1.7.0`; the Node hardguard is exercised deterministically.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { helpText, skillsHelpText } from "../src/cli.mjs";
import { repoRoot } from "./manifest-fixture.mjs";
import { SHA_A, createFakeFetch } from "./skills-fixtures.mjs";

const binPath = join(repoRoot, "packages", "tools", "bin", "prism-ds.mjs");
const SUPPORTED_NODE = "22.20.0";

/* -------------------------------------------------------------------------- */
/* Child helper mode                                                          */
/* -------------------------------------------------------------------------- */

/**
 * When launched with `--child <payload>`, run one CLI invocation with the
 * injected runtime/fetch and print a JSON envelope. This keeps the test
 * runner's TAP stream untouched while still exercising the exported command.
 */
if (process.argv[2] === "--child") {
  const payload = JSON.parse(process.argv[3]);
  const { runSkillsCommand } = await import("../src/cli.mjs");
  const nodeDescriptor = Object.getOwnPropertyDescriptor(process.versions, "node");
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  if (payload.fetch === "sha") {
    const fake = createFakeFetch({ sha: SHA_A });
    globalThis.fetch = fake.impl;
    // The fake records internally; expose the count via a proxy.
    const originalImpl = fake.impl;
    globalThis.fetch = async (...args) => {
      fetchCalls += 1;
      return originalImpl(...args);
    };
  } else if (payload.fetch === "throw") {
    globalThis.fetch = () => {
      fetchCalls += 1;
      throw new Error("network must not be used");
    };
  }
  if (payload.nodeVersion !== undefined) {
    Object.defineProperty(process.versions, "node", {
      value: payload.nodeVersion,
      configurable: true,
      enumerable: true,
    });
  }
  const previousStdout = process.stdout.write;
  const previousStderr = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.exitCode = undefined;
  process.stdout.write = (chunk) => {
    stdout += chunk;
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += chunk;
    return true;
  };
  let thrown = null;
  try {
    await runSkillsCommand(payload.argv);
  } catch (error) {
    thrown = error;
  } finally {
    process.stdout.write = previousStdout;
    process.stderr.write = previousStderr;
    globalThis.fetch = previousFetch;
    Object.defineProperty(process.versions, "node", nodeDescriptor);
  }
  const envelope = {
    stdout,
    stderr,
    exitCode: process.exitCode ?? null,
    fetchCalls,
    thrown: thrown === null ? null : thrown.message,
  };
  process.stdout.write(JSON.stringify(envelope));
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function makeTempDir(t, prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

function writeFile(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

function writeSkillDir(root, relative) {
  return writeFile(
    root,
    join(relative, "SKILL.md"),
    ["---", "name: fixture", "description: fixture", "---", "", "# fixture", ""].join("\n"),
  );
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

/** A subprocess environment whose home is a temp dir (no real agent stores). */
function mockedHomeEnv(home) {
  return {
    ...process.env,
    USERPROFILE: home,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    CODEX_HOME: join(home, ".codex"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
  };
}

function runBin(args, { cwd = repoRoot, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolvePromise({ stdout, stderr, exitCode }));
  });
}

/** Run one skills invocation in the child helper with injected runtime/fetch. */
function invokeSkills(argv, { fetch: fetchMode, nodeVersion } = {}) {
  const testFile = fileURLToPath(import.meta.url);
  const payload = JSON.stringify({
    argv,
    fetch: fetchMode ?? null,
    nodeVersion: nodeVersion ?? null,
  });
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [testFile, "--child", payload], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`child helper exited ${code}: ${stderr}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`child helper returned invalid JSON: ${error.message}: ${stdout}`));
      }
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Help, dispatch, validation                                                 */
/* -------------------------------------------------------------------------- */

test("root help and the skills help cover the full subcommand surface", async () => {
  const root = await runBin(["--help"]);
  assert.equal(root.exitCode, 0);
  assert.equal(root.stdout, helpText());
  assert.match(root.stdout, /skills list/);
  assert.match(root.stdout, /skills add\|update\|remove/);

  for (const args of [
    ["skills", "--help"],
    ["skills", "list", "--help"],
    ["skills", "add", "--help"],
  ]) {
    const result = await runBin(args);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, skillsHelpText());
  }
  assert.match(skillsHelpText(), /claude-code, codex, cursor,\s+opencode/);
  assert.match(skillsHelpText(), /Node >= 22\.20/);

  const unknown = await runBin(["skills", "frobnicate"]);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stderr, /Unknown skills subcommand: frobnicate/);
});

test("skills mutations validate arguments before any catalog or network work", async (t) => {
  const root = makeTempDir(t, "prism-cli-skills-");

  const noCwd = await runBin(["skills", "list"]);
  assert.equal(noCwd.exitCode, 1);
  assert.match(noCwd.stderr, /skills list requires an explicit --cwd/);

  const noId = await runBin(["skills", "add", "--cwd", root, "--agent", "cursor"]);
  assert.equal(noId.exitCode, 1);
  assert.match(noId.stderr, /requires a <catalog-id>/);

  const noAgent = await runBin(["skills", "add", "use-design-system", "--cwd", root]);
  assert.equal(noAgent.exitCode, 1);
  assert.match(noAgent.stderr, /requires at least one --agent/);

  const badAgent = await runBin([
    "skills",
    "add",
    "use-design-system",
    "--cwd",
    root,
    "--agent",
    "not-an-agent",
  ]);
  assert.equal(badAgent.exitCode, 1);
  assert.match(badAgent.stderr, /Unsupported skill agent/);

  const badId = await invokeSkills(
    ["add", "not-a-catalog-skill", "--cwd", root, "--agent", "cursor", "--dry-run", "--json"],
    { fetch: "throw", nodeVersion: "22.13.1" },
  );
  assert.equal(badId.exitCode, 1);
  assert.match(badId.stdout, /allowlisted catalog id/);
  assert.match(badId.stdout, /Node >= 22\.20\.0/);
  assert.equal(badId.fetchCalls, 0);
});

test("use --no-skills conflicts and an invalid --skill-agent fails closed before any registry read", async (t) => {
  const root = makeTempDir(t, "prism-cli-use-");

  const conflict = await runBin([
    "use",
    "@prism-system/ui-system-a",
    "--cwd",
    root,
    "--no-skills",
    "--skill-agent",
    "cursor",
  ]);
  assert.equal(conflict.exitCode, 1);
  assert.match(conflict.stderr, /--no-skills cannot be combined with --skill-agent/);

  const invalid = await runBin([
    "use",
    "@prism-system/ui-system-a",
    "--cwd",
    root,
    "--skill-agent",
    "bogus",
    "--json",
  ]);
  assert.equal(invalid.exitCode, 1);
  const report = JSON.parse(invalid.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.boundary, "skills");
  assert.equal(report.skillSetup.reason, "invalid-agent-selection");
  assert.equal(report.systemReady, false);
});

/* -------------------------------------------------------------------------- */
/* skills list                                                                */
/* -------------------------------------------------------------------------- */

test("skills list reports the catalog and empty inventory from a mocked home", async (t) => {
  const home = makeTempDir(t, "prism-cli-skills-home-");
  const cwd = makeTempDir(t, "prism-cli-skills-cwd-");
  const before = snapshot(cwd);

  const result = await runBin(["skills", "list", "--cwd", cwd, "--json"], {
    env: mockedHomeEnv(home),
  });

  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.scope, "all");
  assert.ok(report.catalog.some((entry) => entry.id === "use-design-system"));
  assert.deepEqual(report.installed, []);
  assert.deepEqual(report.external, []);
  assert.deepEqual(snapshot(cwd), before, "list must not write");

  const human = await runBin(["skills", "list", "--cwd", cwd], { env: mockedHomeEnv(home) });
  assert.equal(human.exitCode, 0);
  assert.match(human.stdout, /inventory scope: all/);
  assert.match(human.stdout, /not installed/);
});

test("skills list shows project and global installs, external skills, and shared placement", async (t) => {
  const home = makeTempDir(t, "prism-cli-skills-home-");
  const cwd = makeTempDir(t, "prism-cli-skills-cwd-");
  // An unmanaged project skill (not in the catalog).
  writeSkillDir(cwd, join(".agents", "skills", "external-project-skill"));
  // An unmanaged global skill.
  writeSkillDir(home, join(".agents", "skills", "external-global-skill"));

  const all = await runBin(["skills", "list", "--cwd", cwd, "--json"], {
    env: mockedHomeEnv(home),
  });
  assert.equal(all.exitCode, 0, all.stderr);
  const allReport = JSON.parse(all.stdout);
  assert.deepEqual(
    allReport.installed.map((skill) => [skill.name, skill.scope, skill.managed, skill.shared]),
    [
      ["external-project-skill", "project", false, true],
      ["external-global-skill", "global", false, true],
    ],
  );
  assert.deepEqual(allReport.external.map((skill) => skill.name).sort(), [
    "external-global-skill",
    "external-project-skill",
  ]);

  const global = await runBin(["skills", "list", "--cwd", cwd, "--global", "--json"], {
    env: mockedHomeEnv(home),
  });
  assert.equal(global.exitCode, 0);
  const globalReport = JSON.parse(global.stdout);
  assert.equal(globalReport.scope, "global");
  assert.deepEqual(
    globalReport.installed.map((skill) => skill.name),
    ["external-global-skill"],
  );

  const human = await runBin(["skills", "list", "--cwd", cwd], { env: mockedHomeEnv(home) });
  assert.equal(human.exitCode, 0);
  assert.match(human.stdout, /external\/unmanaged/);
  assert.match(human.stdout, /shared canonical placement/);
  assert.match(human.stdout, /Installed skills outside the catalog/);
});

/* -------------------------------------------------------------------------- */
/* Node hardguard (deterministic)                                             */
/* -------------------------------------------------------------------------- */

test("the Node hardguard blocks mutations before any network or spawn", async (t) => {
  const cwd = makeTempDir(t, "prism-cli-skills-cwd-");
  const before = snapshot(cwd);

  const add = await invokeSkills(
    ["add", "use-design-system", "--cwd", cwd, "--agent", "cursor", "--dry-run", "--json"],
    { fetch: "throw", nodeVersion: "22.13.1" },
  );
  assert.equal(add.exitCode, 1);
  const addReport = JSON.parse(add.stdout);
  assert.equal(addReport.ok, false);
  assert.match(addReport.failures.join(" "), /Node >= 22\.20\.0/);
  assert.equal(add.fetchCalls, 0, "the runtime guard fails before any source read");

  const remove = await invokeSkills(
    ["remove", "use-design-system", "--cwd", cwd, "--agent", "cursor", "--dry-run"],
    { fetch: "throw", nodeVersion: "22.13.1" },
  );
  assert.equal(remove.exitCode, 1);
  assert.match(remove.stdout, /Node >= 22\.20\.0/);
  assert.match(remove.stdout, /Nothing was spawned or written/);
  assert.equal(remove.fetchCalls, 0);
  assert.deepEqual(snapshot(cwd), before);
});

/* -------------------------------------------------------------------------- */
/* Planning with an injected capable runtime                                  */
/* -------------------------------------------------------------------------- */

test("skills add --dry-run freezes the plan with an injected runtime and fake source", async (t) => {
  const cwd = makeTempDir(t, "prism-cli-skills-cwd-");
  const before = snapshot(cwd);

  const result = await invokeSkills(
    ["add", "use-design-system", "--cwd", cwd, "--agent", "cursor", "--dry-run", "--json"],
    { fetch: "sha", nodeVersion: SUPPORTED_NODE },
  );

  assert.equal(result.thrown, null);
  assert.equal(result.exitCode, null, "a successful dry run leaves exit 0");
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.ok, true);
  assert.equal(report.action, "add");
  assert.equal(report.expectedPlan.revision, SHA_A);
  assert.match(report.command.args.join(" "), /skills@1\.7\.0/);
  assert.match(report.command.args.join(" "), new RegExp(`/tree/${SHA_A}`));
  assert.equal(result.fetchCalls, 1, "exactly one bounded source read");
  assert.deepEqual(snapshot(cwd), before, "a dry run must not write");
});

test("skills add without --yes prints the frozen preview and writes nothing", async (t) => {
  const cwd = makeTempDir(t, "prism-cli-skills-cwd-");
  const before = snapshot(cwd);

  const result = await invokeSkills(
    ["add", "use-design-system", "--cwd", cwd, "--agent", "cursor"],
    { fetch: "sha", nodeVersion: SUPPORTED_NODE },
  );

  assert.equal(result.thrown, null);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Skills add: use-design-system/);
  assert.match(result.stdout, /revision: aaaaaaaaaa/);
  assert.match(result.stdout, /requires --yes; nothing was spawned or written/);
  assert.match(result.stdout, /next: prism-ds skills add use-design-system/);
  assert.deepEqual(snapshot(cwd), before);
});

test("skills update/remove report unmanaged state with a remedy and no spawn", async (t) => {
  const cwd = makeTempDir(t, "prism-cli-skills-cwd-");
  const before = snapshot(cwd);

  const update = await invokeSkills(
    ["update", "use-design-system", "--cwd", cwd, "--agent", "cursor", "--dry-run", "--json"],
    { fetch: "sha", nodeVersion: SUPPORTED_NODE },
  );
  assert.equal(update.thrown, null);
  assert.equal(update.exitCode, 1);
  const updateReport = JSON.parse(update.stdout);
  assert.equal(updateReport.ok, false);
  assert.match(updateReport.failures.join(" "), /not managed by prism-ds/);
  assert.equal(update.fetchCalls, 1, "update resolves the source before checking the store");

  const remove = await invokeSkills(
    ["remove", "use-design-system", "--cwd", cwd, "--agent", "cursor", "--dry-run"],
    { fetch: "sha", nodeVersion: SUPPORTED_NODE },
  );
  assert.equal(remove.thrown, null);
  assert.equal(remove.exitCode, 1);
  assert.match(remove.stdout, /not managed by prism-ds/);
  assert.match(remove.stdout, /Nothing was spawned or written/);
  assert.equal(remove.fetchCalls, 0, "remove never reads the source");
  assert.deepEqual(snapshot(cwd), before);
});
