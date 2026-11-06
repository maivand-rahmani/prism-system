#!/usr/bin/env node
/**
 * Standalone tests for package-manager detection and fixed command construction.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/package-manager.test.mjs
 *
 * Every case uses a disposable temp directory and never spawns a real package
 * manager or writes outside the fixture.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  PNPM_WORKSPACE_MANIFEST,
  buildInstallCommand,
  detectPackageManager,
  isPnpmWorkspaceRoot,
} from "../src/package-manager.mjs";

function makeRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "prism-manager-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePackage(root, value) {
  writeJson(join(root, "package.json"), value);
}

function writeWorkspace(root, patterns = ["apps/*", "packages/*"]) {
  const lines = patterns.map((pattern) => `  - "${pattern}"`).join("\n");
  writeFileSync(join(root, PNPM_WORKSPACE_MANIFEST), `packages:\n${lines}\n`, "utf8");
}

const REGISTRY = "https://registry.test";
const TARGET = "@prism-system/ui-system-a";
const VERSION = "1.0.0";

test("isPnpmWorkspaceRoot recognizes only the selected root's workspace manifest", (t) => {
  const root = makeRoot(t);
  const child = join(root, "packages", "app");
  mkdirSync(child, { recursive: true });
  writePackage(root, { name: "root", private: true });
  writePackage(child, { name: "app", private: true });

  assert.equal(isPnpmWorkspaceRoot(root), false, "a plain directory is not a workspace root");

  writeWorkspace(root);
  assert.equal(isPnpmWorkspaceRoot(root), true, "the declaring directory is a workspace root");
  assert.equal(
    isPnpmWorkspaceRoot(child),
    false,
    "a member package never inherits its parent's workspace root",
  );
  assert.equal(isPnpmWorkspaceRoot(""), false, "an empty root is not a workspace root");

  writeFileSync(join(root, "packages", "app", "pnpm-workspace.yml"), "packages: []\n", "utf8");
  assert.equal(
    isPnpmWorkspaceRoot(child),
    false,
    "only pnpm-workspace.yaml declares a pnpm workspace root",
  );
});

test("detectPackageManager marks a workspace root only for pnpm", (t) => {
  const pnpmRoot = makeRoot(t);
  writePackage(pnpmRoot, { name: "root", private: true, packageManager: "pnpm@12.5.1" });
  writeWorkspace(pnpmRoot);
  assert.deepEqual(detectPackageManager({ consumerRoot: pnpmRoot }), {
    manager: "pnpm",
    source: "packageManager",
    workspaceRoot: true,
  });

  const pnpmLockRoot = makeRoot(t);
  writePackage(pnpmLockRoot, { name: "root", private: true });
  writeWorkspace(pnpmLockRoot);
  writeFileSync(join(pnpmLockRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  assert.deepEqual(detectPackageManager({ consumerRoot: pnpmLockRoot }), {
    manager: "pnpm",
    source: "pnpm-lock.yaml",
    workspaceRoot: true,
  });

  const npmRoot = makeRoot(t);
  writePackage(npmRoot, { name: "root", private: true, packageManager: "npm@10.0.0" });
  writeWorkspace(npmRoot);
  assert.equal(detectPackageManager({ consumerRoot: npmRoot }).workspaceRoot, false);

  const plainRoot = makeRoot(t);
  writePackage(plainRoot, { name: "plain", private: true, packageManager: "pnpm@12.5.1" });
  assert.equal(detectPackageManager({ consumerRoot: plainRoot }).workspaceRoot, false);

  const workspaceParent = makeRoot(t);
  writeWorkspace(workspaceParent);
  const member = join(workspaceParent, "packages", "app");
  writePackage(member, { name: "app", private: true, packageManager: "pnpm@12.5.1" });
  assert.equal(detectPackageManager({ consumerRoot: member }).workspaceRoot, false);
});

test("buildInstallCommand adds -w only for a pnpm workspace root", () => {
  const base = {
    packageName: TARGET,
    version: VERSION,
    registry: REGISTRY,
    exact: true,
  };

  const workspaceRoot = buildInstallCommand({ ...base, manager: "pnpm", workspaceRoot: true });
  assert.deepEqual(workspaceRoot.args, [
    "add",
    "-w",
    "--save-prod",
    "--save-exact",
    "--ignore-scripts",
    `--registry=${REGISTRY}`,
    `${TARGET}@${VERSION}`,
  ]);

  const plainPnpm = buildInstallCommand({ ...base, manager: "pnpm", workspaceRoot: false });
  assert.deepEqual(plainPnpm.args, [
    "add",
    "--save-prod",
    "--save-exact",
    "--ignore-scripts",
    `--registry=${REGISTRY}`,
    `${TARGET}@${VERSION}`,
  ]);

  const npmRoot = buildInstallCommand({ ...base, manager: "npm", workspaceRoot: true });
  assert.equal(npmRoot.args[0], "install");
  assert.equal(
    npmRoot.args.includes("-w"),
    false,
    "npm never receives the pnpm workspace-root flag",
  );
});
