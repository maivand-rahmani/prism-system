#!/usr/bin/env node
/**
 * V4 token-naming contract tests for the published tooling.
 *
 * The generated manifest is the only source a consumer reads, and
 * `tokens.names` publishes the naming contract: `cssVariablePrefix` for CSS
 * custom properties and `tailwindUtilityPrefix` for Tailwind utilities. These
 * tests exercise the published, self-contained validator
 * (`collectManifestFailures`, `detectManifestContract`) and the real A/B/V2
 * manifests. No design-system source or `@prism-system/ui-core` code is
 * imported or executed.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/token-naming-contract.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  TAILWIND_UTILITY_PREFIX,
  TOKEN_NAMESPACE_PATTERN,
  V4_TOKEN_NAME_FIELDS,
} from "../src/constants.mjs";
import { collectManifestFailures, detectManifestContract } from "../src/manifest.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..", "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const v2Manifest = readJson(
  join(repoRoot, "schemas", "fixtures", "v2-valid", "design-system.json"),
);
const systemAManifest = readJson(join(repoRoot, "packages", "system-a", "design-system.json"));
const systemBManifest = readJson(join(repoRoot, "packages", "system-b", "design-system.json"));

test("naming constants describe the canonical kebab namespaces", () => {
  assert.deepEqual([...V4_TOKEN_NAME_FIELDS], ["cssVariablePrefix", "tailwindUtilityPrefix"]);
  assert.equal(TAILWIND_UTILITY_PREFIX, "prism");
  for (const value of ["prism", "maivand-a", "maivand-b", "prism2"]) {
    assert.ok(TOKEN_NAMESPACE_PATTERN.test(value), `${JSON.stringify(value)} is a safe namespace`);
  }
  for (const value of ["", "Prism", "9prism", "maivand_a", "maivand a", "maivand.", "-prism"]) {
    assert.ok(
      !TOKEN_NAMESPACE_PATTERN.test(value),
      `${JSON.stringify(value)} must be rejected as an unsafe namespace`,
    );
  }
});

test("the real A/B generated manifests publish valid token names", () => {
  const expectedPrefix = { "system-a": "maivand-a", "system-b": "maivand-b" };
  for (const manifest of [systemAManifest, systemBManifest]) {
    assert.equal(detectManifestContract(manifest), "v4");
    assert.deepEqual(manifest.tokens.names, {
      cssVariablePrefix: expectedPrefix[manifest.id],
      tailwindUtilityPrefix: TAILWIND_UTILITY_PREFIX,
    });
    assert.deepEqual(collectManifestFailures(manifest), []);
  }
});

test("missing, unknown, or malformed token names fail closed", () => {
  const base = () => structuredClone(systemAManifest);

  const absent = base();
  delete absent.tokens.names;
  assert.ok(
    collectManifestFailures(absent).includes("tokens.names must be an object."),
    "an absent names object is rejected",
  );

  const missing = base();
  delete missing.tokens.names.cssVariablePrefix;
  assert.ok(
    collectManifestFailures(missing).includes("tokens.names.cssVariablePrefix is required."),
    "a missing cssVariablePrefix is rejected",
  );

  const unknown = base();
  unknown.tokens.names.extra = "value";
  assert.ok(
    collectManifestFailures(unknown).includes("tokens.names.extra is not allowed."),
    "an unknown names field is rejected",
  );

  const malformedCss = base();
  malformedCss.tokens.names.cssVariablePrefix = "Maivand A";
  assert.ok(
    collectManifestFailures(malformedCss).includes(
      "tokens.names.cssVariablePrefix must be a safe lower-kebab namespace.",
    ),
    "a malformed cssVariablePrefix is rejected",
  );

  const malformedTailwind = base();
  malformedTailwind.tokens.names.tailwindUtilityPrefix = "9prism";
  assert.ok(
    collectManifestFailures(malformedTailwind).includes(
      "tokens.names.tailwindUtilityPrefix must be a safe lower-kebab namespace.",
    ),
    "a malformed tailwindUtilityPrefix is rejected",
  );
});

test("valid legacy V2 manifests stay schema-1 and carry no token names", () => {
  assert.equal(detectManifestContract(v2Manifest), "v2");
  assert.deepEqual(collectManifestFailures(v2Manifest), []);
  assert.equal(v2Manifest.schemaVersion, 1);
  assert.ok(!("tokens" in v2Manifest), "the V2 manifest has no V4 token block");

  // A V4 token block (with or without names) is never accepted in a V2 manifest.
  const tampered = structuredClone(v2Manifest);
  tampered.tokens = {
    groups: {},
    artifacts: {},
    names: { cssVariablePrefix: "prism", tailwindUtilityPrefix: "prism" },
  };
  assert.ok(
    collectManifestFailures(tampered).includes("tokens is not allowed."),
    "the V2 contract rejects the V4 tokens block",
  );
});

test("the (schemaVersion, contract) pair decides which naming rules apply", () => {
  assert.equal(detectManifestContract({ schemaVersion: 1, contract: "v2" }), "v2");
  assert.equal(detectManifestContract({ schemaVersion: 2, contract: "v4" }), "v4");
  assert.equal(detectManifestContract({ schemaVersion: 2, contract: "v2" }), null);
  assert.equal(detectManifestContract({ schemaVersion: 1, contract: "v4" }), null);
  assert.equal(detectManifestContract({ schemaVersion: 3, contract: "v4" }), null);
  const failures = collectManifestFailures({ schemaVersion: 2, contract: "v2" });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^Unsupported schema\/contract pair \(2, "v2"\)/);
});
