/**
 * Catalog invariants: a closed, offline, statistics-free allowlist.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIRSTPARTY_SKILL_SOURCE,
  SKILL_CATALOG,
  SKILL_CATALOG_CATEGORIES,
  SKILL_CATALOG_SOURCES,
  collectSkillCatalogFailures,
  getSkillCatalogEntry,
  getSkillCatalogEntryBySkill,
  getSkillCatalogSource,
  listSkillCatalog,
  listSkillCatalogSources,
} from "../src/skill-catalog.mjs";

test("the catalog validates as a closed allowlist", () => {
  assert.deepEqual(collectSkillCatalogFailures(), []);
});

test("first-party lifecycle skills are present with the expected roles", () => {
  const expected = [
    ["use-design-system", "consumer"],
    ["create-design-system", "authoring"],
    ["modify-design-system", "authoring"],
    ["switch-design-system", "consumer"],
  ];
  for (const [id, role] of expected) {
    const entry = getSkillCatalogEntry(id);
    assert.ok(entry, `${id} must be catalogued`);
    assert.equal(entry.type, "prism");
    assert.equal(entry.source, FIRSTPARTY_SKILL_SOURCE);
    assert.equal(entry.publisher, "maivand-rahmani");
    assert.equal(entry.role, role);
    assert.equal(entry.reviewStatus, "firstparty");
  }
});

test("reviewed design candidates are present, and R3F is never included", () => {
  const expected = {
    "frontend-design": "anthropics/skills",
    "web-design-guidelines": "vercel-labs/agent-skills",
    "vercel-composition-patterns": "vercel-labs/agent-skills",
    critique: "pbakaus/impeccable",
    delight: "pbakaus/impeccable",
    "emil-design-eng": "emilkowalski/skills",
  };
  for (const [id, source] of Object.entries(expected)) {
    const entry = getSkillCatalogEntry(id);
    assert.ok(entry, `${id} must be catalogued`);
    assert.equal(entry.type, "design");
    assert.equal(entry.source, source);
    assert.equal(entry.reviewStatus, "reviewed");
  }
  assert.equal(
    SKILL_CATALOG.some((entry) => /r3f|react-three|fiber/i.test(entry.skill)),
    false,
    "broad R3F skills must never be catalogued",
  );
});

test("the narrow JetBrains candidate is experimental and low adoption", () => {
  const entry = getSkillCatalogEntry("webgpu-threejs-tsl");
  assert.ok(entry);
  assert.equal(entry.source, "JetBrains/skills");
  assert.equal(entry.reviewStatus, "experimental");
  assert.ok(entry.tags.includes("experimental"));
  assert.ok(entry.tags.includes("low-adoption"));
});

test("catalog entries never carry fabricated statistics", () => {
  for (const entry of listSkillCatalog()) {
    for (const field of ["downloads", "installs", "stars", "popularity", "stats", "trending"]) {
      assert.equal(field in entry, false, `${entry.id} must not carry ${field}`);
    }
  }
});

test("lookup helpers are strict and allowlist-bound", () => {
  assert.equal(getSkillCatalogEntry("not-a-skill"), null);
  assert.equal(getSkillCatalogEntry(null), null);
  assert.equal(getSkillCatalogEntryBySkill("frontend-design")?.id, "frontend-design");
  assert.equal(getSkillCatalogEntryBySkill("nope"), null);
  assert.equal(getSkillCatalogSource("anthropics/skills")?.owner, "anthropics");
  assert.equal(getSkillCatalogSource("attacker/evil"), null);
  assert.equal(getSkillCatalogSource(undefined), null);
  assert.equal(listSkillCatalogSources().length, Object.keys(SKILL_CATALOG_SOURCES).length);
  for (const category of SKILL_CATALOG_CATEGORIES) assert.equal(typeof category, "string");
});
