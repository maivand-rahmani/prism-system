#!/usr/bin/env node
/**
 * Tests for the read-only recovery report and its safe, explicit repairs.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/recovery.test.mjs
 *
 * Every case builds a real temporary consumer; nothing reaches the network,
 * spawns a package manager, or mutates anything outside the temp root.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";

import { MANAGED_BLOCK_BEGIN } from "../src/consumer.mjs";
import {
  buildRecoverySuggestions,
  collectRecoveryReport,
  executeRecoveryAction,
  previewRecoveryAction,
} from "../src/recovery.mjs";
import {
  addSyntheticExtension,
  currentManifest,
  readJson,
  repoRoot,
  syntheticManifest,
} from "./manifest-fixture.mjs";

const SYSTEM_A_MANIFEST = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
);

const PACKAGE_NAME = "@prism-system/ui-recover";
const OTHER_PACKAGE = "@prism-system/ui-other";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

/** Recursively snapshot a directory as relative-path -> content. */
function snapshotTree(root) {
  const result = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) result[relative(root, full)] = readFileSync(full, "utf8");
    }
  };
  walk(root);
  return result;
}

/**
 * Create a temporary consumer with one or more fake installed design systems.
 *
 * @param {import("node:test").TestContext} t
 * @param {object} [options]
 */
function createConsumer(t, options = {}) {
  const {
    systems = [{ name: PACKAGE_NAME, version: "1.0.0" }],
    dependencies = null,
    withConfig = true,
    configVersion = null,
    configOverride = null,
    rawConfig = null,
    includeManifestStyles = true,
    includeManifestTailwind = true,
    tailwind = null,
    mutateManifest = null,
    manifest: customManifest = null,
    packageExports = {},
    systemFiles = {},
    files = {},
  } = options;

  const root = mkdtempSync(join(tmpdir(), "prism-recovery-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const effectiveDependencies =
    dependencies ?? Object.fromEntries(systems.map((system) => [system.name, system.version]));
  const pkg = {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    dependencies: effectiveDependencies,
  };
  if (tailwind !== null) pkg.dependencies = { ...pkg.dependencies, tailwindcss: tailwind };
  writeJson(join(root, "package.json"), pkg);

  if (rawConfig !== null) {
    mkdirSync(join(root, ".design-system"), { recursive: true });
    writeFileSync(join(root, ".design-system", "config.json"), rawConfig, "utf8");
  } else if (withConfig) {
    const config = {
      $schema:
        "https://github.com/maivand-rahmani/prism-system/schemas/design-system-consumer.schema.json",
      schemaVersion: 1,
      package: systems[0].name,
      version: configVersion ?? systems[0].version,
      manifest: "./manifest",
      strict: true,
    };
    writeJson(join(root, ".design-system", "config.json"), configOverride ?? config);
  }

  for (const system of systems) {
    const manifest = customManifest
      ? structuredClone(customManifest)
      : structuredClone(SYSTEM_A_MANIFEST);
    manifest.package = system.name;
    manifest.version = system.version;
    manifest.id = system.name.slice("@prism-system/ui-".length);
    manifest.name = manifest.id;
    if (!includeManifestStyles) delete manifest.exports["./styles.css"];
    if (!includeManifestTailwind) delete manifest.exports["./tailwind.css"];
    if (typeof mutateManifest === "function") mutateManifest(manifest, system);

    const systemDir = join(root, "node_modules", ...system.name.split("/"));
    const exportsMap = { "./manifest": "./design-system.json" };
    if (includeManifestStyles) exportsMap["./styles.css"] = "./dist/index.css";
    if (includeManifestTailwind) exportsMap["./tailwind.css"] = "./dist/tailwind.css";
    Object.assign(exportsMap, packageExports);
    writeJson(join(systemDir, "package.json"), {
      name: system.name,
      version: system.version,
      exports: exportsMap,
    });
    writeJson(join(systemDir, "design-system.json"), manifest);
    if (includeManifestStyles) writeFile(systemDir, "dist/index.css", "/* styles */\n");
    if (includeManifestTailwind) writeFile(systemDir, "dist/tailwind.css", "/* bridge */\n");
    for (const [relativePath, content] of Object.entries(systemFiles)) {
      writeFile(systemDir, relativePath, content);
    }
  }

  if (tailwind !== null) {
    const tailwindDir = join(root, "node_modules", "tailwindcss");
    writeJson(join(tailwindDir, "package.json"), {
      name: "tailwindcss",
      version: tailwind,
      exports: { ".": "./index.css", "./package.json": "./package.json" },
    });
    writeFile(tailwindDir, "index.css", "/* tailwind */\n");
  }

  for (const [relativePath, content] of Object.entries(files))
    writeFile(root, relativePath, content);

  return { root, packageName: systems[0]?.name ?? null, version: systems[0]?.version ?? null };
}

function suggestionById(report, id, context = {}) {
  return buildRecoverySuggestions(report, context).find((item) => item.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Report and suggestions                                                     */
/* -------------------------------------------------------------------------- */

test("a healthy connected consumer reports no issues and no suggestions", (t) => {
  const { root } = createConsumer(t);
  const report = collectRecoveryReport({ cwd: root });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.deepEqual(report.issues, []);
  assert.deepEqual(buildRecoverySuggestions(report), []);
  assert.equal(report.diagnosis.connection.status, "ok");
});

test("a missing connection suggests an explicit connect and executes only after consent", (t) => {
  const { root } = createConsumer(t, {
    withConfig: false,
    files: { "AGENTS.md": "# My project\n\nUser notes.\n" },
  });
  const report = collectRecoveryReport({ cwd: root });
  assert.equal(report.ok, false);
  assert.equal(report.diagnosis.connection.status, "missing");
  const connect = suggestionById(report, "connect");
  assert.ok(connect);
  assert.equal(connect.label.length > 0, true);
  assert.equal(connect.kind, "connect");
  assert.equal(connect.risk, "low");
  assert.equal(connect.executable, true);
  assert.equal(connect.requiresConfirmation, true);
  assert.deepEqual(connect.command, { bin: "prism-ds", args: ["connect", "--cwd", root] });
  assert.equal(typeof connect.reason, "string");

  const preview = previewRecoveryAction({ cwd: root, actionId: "connect" });
  assert.equal(preview.ok, true);
  assert.equal(preview.kind, "connect");
  assert.ok(preview.changes.length > 0);
  assert.ok(preview.plan.files.some((file) => file.changed === true));

  const before = snapshotTree(root);
  const noConsent = executeRecoveryAction({ cwd: root, actionId: "connect" });
  assert.equal(noConsent.ok, false);
  assert.equal(noConsent.boundary, "consent");
  assert.equal(noConsent.actionCompleted, false);
  assert.deepEqual(snapshotTree(root), before);

  const executed = executeRecoveryAction({
    cwd: root,
    actionId: "connect",
    confirmed: true,
    expectedPlan: preview.plan,
  });
  assert.equal(executed.ok, true);
  assert.equal(executed.actionCompleted, true);
  assert.equal(executed.repaired, true);
  assert.equal(executed.healthy, true);
  assert.deepEqual(executed.stillRemaining, []);

  const config = readJson(join(root, ".design-system", "config.json"));
  assert.equal(config.package, PACKAGE_NAME);
  assert.equal(config.version, "1.0.0");
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /User notes\./);
  assert.match(agents, /BEGIN @prism-system design system contract \(managed\)/);
});

test("a stale connection is repaired by the same connect action", (t) => {
  const { root } = createConsumer(t, { configVersion: "0.0.1" });
  const report = collectRecoveryReport({ cwd: root });
  assert.equal(report.diagnosis.connection.status, "stale");
  const preview = previewRecoveryAction({ cwd: root, actionId: "connect" });
  assert.equal(preview.ok, true);
  const executed = executeRecoveryAction({
    cwd: root,
    actionId: "connect",
    confirmed: true,
    expectedPlan: preview.plan,
  });
  assert.equal(executed.actionCompleted, true);
  assert.equal(executed.repaired, true);
  assert.equal(executed.healthy, true);
  assert.equal(readJson(join(root, ".design-system", "config.json")).version, "1.0.0");
});

test("multiple installed candidates are never guessed", (t) => {
  const { root } = createConsumer(t, {
    systems: [
      { name: PACKAGE_NAME, version: "1.0.0" },
      { name: OTHER_PACKAGE, version: "1.0.0" },
    ],
    withConfig: false,
  });
  const report = collectRecoveryReport({ cwd: root });
  assert.equal(report.diagnosis.selection.status, "multiple");
  assert.equal(suggestionById(report, "connect"), null);
  const select = suggestionById(report, "select-package");
  assert.ok(select);
  assert.equal(select.executable, false);
  assert.equal(select.requiresConfirmation, false);

  const before = snapshotTree(root);
  const notExecutable = executeRecoveryAction({
    cwd: root,
    actionId: "select-package",
    confirmed: true,
  });
  assert.equal(notExecutable.ok, false);
  assert.equal(notExecutable.boundary, "not-executable");
  assert.deepEqual(snapshotTree(root), before);

  const targeted = collectRecoveryReport({ cwd: root, packageName: OTHER_PACKAGE });
  const targetedConnect = suggestionById(targeted, "connect");
  assert.ok(targetedConnect);
  assert.deepEqual(targetedConnect.command.args, ["connect", OTHER_PACKAGE, "--cwd", root]);
  const preview = previewRecoveryAction({
    cwd: root,
    actionId: "connect",
    packageName: OTHER_PACKAGE,
  });
  assert.equal(preview.ok, true);
  const executed = executeRecoveryAction({
    cwd: root,
    actionId: "connect",
    packageName: OTHER_PACKAGE,
    confirmed: true,
    expectedPlan: preview.plan,
  });
  assert.equal(executed.repaired, true);
  assert.equal(readJson(join(root, ".design-system", "config.json")).package, OTHER_PACKAGE);
});

test("missing package, malformed config, and schema mismatch are guidance only", (t) => {
  const empty = createConsumer(t, { systems: [], dependencies: {}, withConfig: false });
  const emptyReport = collectRecoveryReport({ cwd: empty.root });
  assert.equal(emptyReport.diagnosis.selection.status, "none");
  const installSuggestion = suggestionById(emptyReport, "install-design-system");
  assert.equal(installSuggestion.executable, false);
  const emptyBefore = snapshotTree(empty.root);
  const installAttempt = executeRecoveryAction({
    cwd: empty.root,
    actionId: "install-design-system",
    confirmed: true,
  });
  assert.equal(installAttempt.ok, false);
  assert.equal(installAttempt.boundary, "not-executable");
  assert.deepEqual(snapshotTree(empty.root), emptyBefore);

  const malformed = createConsumer(t, { rawConfig: "{ not json" });
  const malformedReport = collectRecoveryReport({ cwd: malformed.root });
  assert.equal(malformedReport.diagnosis.config.status, "malformed");
  const repair = suggestionById(malformedReport, "repair-config");
  assert.equal(repair.executable, false);
  assert.match(repair.reason, /Fix or remove/);
  const malformedBefore = snapshotTree(malformed.root);
  const repairAttempt = executeRecoveryAction({
    cwd: malformed.root,
    actionId: "repair-config",
    confirmed: true,
  });
  assert.equal(repairAttempt.boundary, "not-executable");
  assert.deepEqual(snapshotTree(malformed.root), malformedBefore);

  const mismatched = createConsumer(t, {
    configOverride: {
      schemaVersion: 99,
      package: PACKAGE_NAME,
      version: "1.0.0",
      manifest: "./manifest",
      strict: true,
    },
  });
  const mismatchReport = collectRecoveryReport({ cwd: mismatched.root });
  assert.equal(mismatchReport.diagnosis.config.status, "schema-mismatch");
  const upgrade = suggestionById(mismatchReport, "upgrade-cli");
  assert.equal(upgrade.executable, false);
  assert.deepEqual(upgrade.command.args, ["self-update", "--check", "--cwd", mismatched.root]);
});

/* -------------------------------------------------------------------------- */
/* CSS bridge                                                                 */
/* -------------------------------------------------------------------------- */

test("an explicit CSS file with missing bridge imports suggests setup-tailwind", (t) => {
  const { root } = createConsumer(t, {
    tailwind: "4.1.0",
    files: { "src/app.css": '@import "tailwindcss";\n\n:root { --user: 1; }\n' },
  });
  const report = collectRecoveryReport({ cwd: root, css: "src/app.css" });
  assert.equal(report.diagnosis.css.status, "needs-update");
  const suggestion = suggestionById(report, "setup-tailwind");
  assert.ok(suggestion);
  assert.equal(suggestion.executable, true);
  assert.deepEqual(suggestion.command.args, [
    "setup-tailwind",
    "--cwd",
    root,
    "--css",
    join(root, "src", "app.css"),
  ]);

  const before = snapshotTree(root);
  const preview = previewRecoveryAction({
    cwd: root,
    actionId: "setup-tailwind",
    css: "src/app.css",
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.plan.changed, true);
  assert.deepEqual(snapshotTree(root), before);
});

test("setup-tailwind execution blocks on drift and preserves user CSS", (t) => {
  const { root } = createConsumer(t, {
    tailwind: "4.1.0",
    files: { "src/app.css": '@import "tailwindcss";\n\n:root { --user: 1; }\n' },
  });
  const cssPath = join(root, "src", "app.css");
  const preview = previewRecoveryAction({
    cwd: root,
    actionId: "setup-tailwind",
    css: "src/app.css",
  });
  assert.equal(preview.ok, true);

  writeFileSync(
    cssPath,
    '@import "tailwindcss";\n\n/* changed after preview */\n:root { --user: 2; }\n',
  );
  const blocked = executeRecoveryAction({
    cwd: root,
    actionId: "setup-tailwind",
    css: "src/app.css",
    confirmed: true,
    expectedPlan: preview.plan,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.boundary, "precondition");
  assert.equal(blocked.actionCompleted, false);
  assert.match(readFileSync(cssPath, "utf8"), /changed after preview/);

  const fresh = previewRecoveryAction({
    cwd: root,
    actionId: "setup-tailwind",
    css: "src/app.css",
  });
  const executed = executeRecoveryAction({
    cwd: root,
    actionId: "setup-tailwind",
    css: "src/app.css",
    confirmed: true,
    expectedPlan: fresh.plan,
  });
  assert.equal(executed.actionCompleted, true);
  assert.equal(executed.repaired, true);
  const after = readFileSync(cssPath, "utf8");
  assert.match(after, /changed after preview/);
  assert.match(after, /--user: 2/);
  assert.match(after, /@import "@prism-system\/ui-recover\/tailwind\.css";/);
  assert.match(after, /@import "@prism-system\/ui-recover\/styles\.css";/);
});

test("a missing Tailwind prerequisite is guidance only", (t) => {
  const { root } = createConsumer(t, {
    files: { "src/app.css": '@import "tailwindcss";\n' },
  });
  const report = collectRecoveryReport({ cwd: root, css: "src/app.css" });
  assert.equal(report.diagnosis.css.status, "failed");
  const prerequisite = suggestionById(report, "css-prerequisite");
  assert.ok(prerequisite);
  assert.equal(prerequisite.executable, false);
  assert.equal(suggestionById(report, "setup-tailwind"), null);
});

/* -------------------------------------------------------------------------- */
/* Entry peers                                                                */
/* -------------------------------------------------------------------------- */

function peerConsumer(t, range) {
  const manifest = syntheticManifest({ id: "recover" });
  addSyntheticExtension(manifest, {
    name: "KeyboardScene",
    entrypoint: "./keyboard-scene",
    target: "./dist/keyboard-scene/index.mjs",
    requirements: [{ name: "three", kind: "peer", range, optional: false }],
  });
  return createConsumer(t, {
    manifest,
    packageExports: { "./keyboard-scene": "./dist/keyboard-scene/index.mjs" },
    systemFiles: { "dist/keyboard-scene/index.mjs": 'import "three";\n' },
  });
}

test("a missing peer with an exact declared range reports the derived version as guidance", (t) => {
  const { root } = peerConsumer(t, "0.160.0");
  const report = collectRecoveryReport({ cwd: root, entry: "KeyboardScene" });
  assert.equal(report.diagnosis.entry.status, "issue");
  const suggestion = suggestionById(report, "peer-three");
  assert.ok(suggestion);
  assert.equal(suggestion.executable, false);
  assert.equal(suggestion.requiresConfirmation, true);
  assert.equal(suggestion.peer.suggestedVersion, "0.160.0");
  assert.ok(!suggestion.command.args.some((argument) => argument.includes("three@")));
  assert.match(suggestion.reason, /0\.160\.0/);
});

test("a missing peer with a non-exact range never guesses a version", (t) => {
  const { root } = peerConsumer(t, "^0.160.0");
  const report = collectRecoveryReport({ cwd: root, entry: "KeyboardScene" });
  const suggestion = suggestionById(report, "peer-three");
  assert.ok(suggestion);
  assert.equal(suggestion.executable, false);
  assert.equal(suggestion.peer.suggestedVersion, null);
  assert.match(suggestion.reason, /Choose an exact version/);
});

/* -------------------------------------------------------------------------- */
/* Recheck and failure honesty                                                */
/* -------------------------------------------------------------------------- */

test("a successful connect that leaves other issues does not report the project healthy", (t) => {
  const { root } = createConsumer(t, { withConfig: false, includeManifestStyles: false });
  const report = collectRecoveryReport({ cwd: root });
  assert.ok(report.issues.some((issue) => issue.id === "styles-export"));
  const preview = previewRecoveryAction({ cwd: root, actionId: "connect" });
  assert.equal(preview.ok, true);
  const executed = executeRecoveryAction({
    cwd: root,
    actionId: "connect",
    confirmed: true,
    expectedPlan: preview.plan,
  });
  assert.equal(executed.actionCompleted, true);
  assert.equal(executed.repaired, true);
  assert.equal(executed.healthy, false);
  assert.ok(executed.stillRemaining.includes("styles-export"));
  assert.deepEqual(executed.targetIssueIds, ["connection"]);
});

test("a failing connect is reported as not completed and never swallows the error", (t) => {
  const { root } = createConsumer(t, {
    withConfig: false,
    files: {
      "AGENTS.md": `${MANAGED_BLOCK_BEGIN}\nbroken\n${MANAGED_BLOCK_BEGIN}\n`,
    },
  });
  const preview = previewRecoveryAction({ cwd: root, actionId: "connect" });
  assert.equal(preview.ok, false);
  assert.equal(preview.boundary, "preview");
  assert.ok(preview.failures.length > 0);

  const before = snapshotTree(root);
  const executed = executeRecoveryAction({ cwd: root, actionId: "connect", confirmed: true });
  assert.equal(executed.ok, false);
  assert.equal(executed.actionCompleted, false);
  assert.equal(executed.repaired, false);
  assert.ok(executed.failures.length > 0);
  assert.deepEqual(snapshotTree(root), before);
});

test("an invalid consumer root reports a manual action instead of throwing", (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-recovery-bad-root-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const filePath = join(root, "not-a-directory.txt");
  writeFileSync(filePath, "not a directory\n", "utf8");

  const report = collectRecoveryReport({ cwd: filePath });
  assert.equal(report.ok, false);
  assert.equal(report.cwd, null);
  assert.equal(report.issues[0].id, "consumer-root");
  const suggestions = buildRecoverySuggestions(report);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].id, "manual-review");
  assert.equal(suggestions[0].executable, false);

  const preview = previewRecoveryAction({ cwd: filePath, actionId: "manual-review" });
  assert.equal(preview.ok, false);
  assert.equal(preview.boundary, "not-executable");
});

test("unknown action ids fail closed without touching the project", (t) => {
  const { root } = createConsumer(t);
  const before = snapshotTree(root);
  const preview = previewRecoveryAction({ cwd: root, actionId: "does-not-exist" });
  assert.equal(preview.ok, false);
  assert.equal(preview.boundary, "action");
  const executed = executeRecoveryAction({
    cwd: root,
    actionId: "does-not-exist",
    confirmed: true,
  });
  assert.equal(executed.ok, false);
  assert.equal(executed.boundary, "action");
  assert.deepEqual(snapshotTree(root), before);
});

test("collecting a report with CSS and entry checks writes nothing", (t) => {
  const { root } = peerConsumer(t, "0.160.0");
  writeFile(root, "src/app.css", '@import "tailwindcss";\n');
  const before = snapshotTree(root);
  collectRecoveryReport({ cwd: root, css: "src/app.css", entry: "KeyboardScene" });
  collectRecoveryReport({ cwd: root, packageName: PACKAGE_NAME });
  assert.deepEqual(snapshotTree(root), before);
});
