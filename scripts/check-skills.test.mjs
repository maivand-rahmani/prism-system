#!/usr/bin/env node
/**
 * Agent skill regression tests (Node built-in test runner, no dependency).
 * Run: node --test scripts/check-skills.test.mjs
 *
 * Covers SKILL.md entrypoints/frontmatter, local links/anchors under skills/**,
 * the design-brief schema and every brief-shaped JSON example, and
 * normalizeBrief/dry-run compatibility with the optional interview notes.
 * Limits: a subset validator for the keywords the brief schema uses
 * ($ref/type/required/properties/additionalProperties/items/minLength/
 * uniqueItems/enum), not a JSON Schema engine; it proves structure, not
 * interview quality. The schema file is the full contract.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeBrief } from "./create-design-system.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(repoRoot, "skills");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const briefSchema = readJson(join(skillsRoot, "create-design-system", "design-brief.schema.json"));

const EXPECTED_SKILLS = "create-design-system modify-design-system use-design-system".split(" ");
// Canonical required contract, compared as sets so schema field order is free.
const REQUIRED_BRIEF_FIELDS =
  "project product audience platform interfaceType dataDensity direction references foundations components avoid".split(
    " ",
  );
const REQUIRED_FOUNDATION_FIELDS =
  "accentDirection colorTemperature contrast typographyCharacter dominantRadius surfaceModel borders elevation motionIntensity".split(
    " ",
  );
const OPTIONAL_NOTES = {
  referenceNotes: ["Kept note"],
  decisionNotes: [{ topic: "Density", status: "confirmed", note: "High density approved." }],
  openQuestions: ["Confirm the accent hue"],
};

const toPosix = (value) => value.split(sep).join("/");
const repoRelative = (absolute) => toPosix(relative(repoRoot, absolute));
const sorted = (values) => [...values].sort();
const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function collectFiles(dir, predicate) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute, predicate);
    return entry.isFile() && predicate(absolute) ? [absolute] : [];
  });
}

/** Run `callback(line, index)` for every line outside a fenced code block. */
function forEachContentLine(text, callback) {
  const lines = text.split(/\r?\n/);
  let fence = null;
  for (const [index, line] of lines.entries()) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (match && match[1][0] === fence.char && match[1].length >= fence.length) fence = null;
    } else if (match) fence = { char: match[1][0], length: match[1].length };
    else callback(line, index);
  }
}

/** Inline Markdown links outside code fences and inline code, with 1-based line. */
function extractLinks(text) {
  const links = [];
  forEachContentLine(text, (line, index) => {
    const withoutInlineCode = line.replace(/``[^`]*``|`[^`]*`/g, " ");
    for (const match of withoutInlineCode.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
      links.push({ line: index + 1, raw: match[2].trim() });
    }
  });
  return links;
}

/**
 * Parse a link target: `null` for ignored remote/protocol URLs, `/showcase`
 * routes, empty targets, and placeholders; `{ absolute: true }` for other
 * root-absolute paths; otherwise `{ file, fragment }`.
 */
function parseLinkTarget(raw) {
  let target = raw;
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1).trim();
  const titled = /^(\S+)\s+["'(].*$/.exec(target);
  if (titled) target = titled[1];
  if (target === "" || /[<>]|\{\{|\}\}/.test(target)) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith("//")) return null;
  if (target.startsWith("/showcase")) return null;
  if (target.startsWith("/")) return { absolute: true };

  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    // Keep the raw target when it is not valid percent-encoding.
  }
  const [pathPart, rawFragment = ""] = decoded.split("#");
  const file = pathPart.split("?")[0].trim();
  const fragment = rawFragment.trim();
  return file === "" && fragment === "" ? null : { file, fragment };
}

/** GitHub-style heading slug; good enough for the ASCII skill headings. */
const slugifyHeading = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

function headingSlugs(text) {
  const slugs = new Set();
  forEachContentLine(text, (line) => {
    const match = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (match) slugs.add(slugifyHeading(match[1]));
  });
  return slugs;
}

/** Minimal frontmatter reader; folded `>`/`|` values are treated as empty. */
function parseFrontmatter(text, relPath) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert.ok(block, `${relPath}: expected a frontmatter block at the top of the file.`);
  const fields = {};
  for (const match of block[1].matchAll(/^([A-Za-z][\w-]*):[ \t]*(.*)$/gm)) {
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    fields[match[1]] = /^[>|][+-]?$/.test(value) ? "" : value;
  }
  return fields;
}

/** Fenced ```json blocks, with the opening fence's 1-based line. */
function extractJsonFences(text) {
  const fences = [];
  const pattern = /^[ \t]*```json[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
  for (const match of text.matchAll(pattern)) {
    fences.push({ text: match[1], line: text.slice(0, match.index).split("\n").length });
  }
  return fences;
}

/* Local JSON Schema subset for the design-brief keywords. */

const resolveJsonPointer = (root, pointer) =>
  pointer
    .replace(/^#\//, "")
    .split("/")
    .reduce((node, token) => node?.[token.replace(/~1/g, "/").replace(/~0/g, "~")], root);

const resolveSchema = (schema, root) =>
  schema && typeof schema.$ref === "string" ? resolveJsonPointer(root, schema.$ref) : schema;

/** Returns an array of human-readable validation errors (empty means valid). */
function validateAgainstSchema(value, schema, root, at = "$") {
  if (!isPlainObject(schema)) return [];
  if (typeof schema.$ref === "string") {
    return validateAgainstSchema(value, resolveJsonPointer(root, schema.$ref), root, at);
  }

  const errors = [];
  if (typeof schema.type === "string") {
    const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (schema.type !== actual) errors.push(`${at} must be ${schema.type}; received ${actual}.`);
  }
  if (typeof value === "string") {
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errors.push(`${at} is not an allowed value.`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${at} must not be empty.`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) =>
        errors.push(...validateAgainstSchema(item, schema.items, root, `${at}[${index}]`)),
      );
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      value.forEach((item, index) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push(`${at}[${index}] duplicates an earlier item.`);
        seen.add(key);
      });
    }
  } else if (isPlainObject(value)) {
    for (const field of schema.required ?? []) {
      if (!(field in value)) errors.push(`${at} is missing required field "${field}".`);
    }
    const properties = schema.properties ?? {};
    for (const [field, subSchema] of Object.entries(properties)) {
      if (field in value) {
        errors.push(...validateAgainstSchema(value[field], subSchema, root, `${at}.${field}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!(field in properties)) errors.push(`${at} has unexpected field "${field}".`);
      }
    }
  }
  return errors;
}

/** A complete brief containing only the canonical required fields. */
function minimalBrief() {
  return {
    project: "Fixture",
    product: "A test product",
    audience: "Developers",
    platform: "responsive web",
    interfaceType: "console",
    dataDensity: "medium",
    direction: ["calm"],
    references: ["Linear"],
    foundations: Object.fromEntries(
      REQUIRED_FOUNDATION_FIELDS.map((field) => [field, `${field} decision`]),
    ),
    components: ["Button"],
    avoid: ["heavy shadows"],
  };
}

/**
 * Brief-shaped JSON examples in skill Markdown. A `project` or `foundations`
 * key marks brief intent, so an example missing another required field is
 * still validated. Invalid `json` fences are reported with source and line.
 */
function collectSkillBriefExamples() {
  const examples = [];
  const failures = [];
  for (const absolute of collectFiles(skillsRoot, (path) => /\.md$/i.test(path))) {
    const source = repoRelative(absolute);
    for (const fence of extractJsonFences(readFileSync(absolute, "utf8"))) {
      let parsed;
      try {
        parsed = JSON.parse(fence.text);
      } catch (error) {
        failures.push(`${source}:${fence.line}: invalid JSON example: ${error.message}`);
        continue;
      }
      if (isPlainObject(parsed) && ("project" in parsed || "foundations" in parsed)) {
        examples.push({ source: `${source}:${fence.line}`, brief: parsed });
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
  assert.ok(examples.length > 0, "skill references must keep at least one brief example.");
  return examples;
}

test("the three skill entrypoints are the only SKILL.md files with frontmatter", () => {
  const skillFiles = collectFiles(skillsRoot, (path) => path.endsWith("SKILL.md"))
    .map(repoRelative)
    .sort();
  assert.deepEqual(
    skillFiles,
    EXPECTED_SKILLS.map((id) => `skills/${id}/SKILL.md`),
    "skills/ must contain exactly the three lifecycle SKILL.md entrypoints",
  );
  assert.ok(
    !skillFiles.some((file) => file.startsWith("skills/references/")),
    "references/ must not contain SKILL.md entrypoints",
  );

  const names = new Set();
  for (const relPath of skillFiles) {
    const fields = parseFrontmatter(readFileSync(join(repoRoot, relPath), "utf8"), relPath);
    assert.ok(
      fields.name && !names.has(fields.name),
      `${relPath}: needs a unique non-empty "name".`,
    );
    names.add(fields.name);
    assert.equal(fields.name, dirname(relPath).split(/[\\/]/).pop(), `${relPath}: name mismatch.`);
    assert.ok(
      fields.description && fields.description.length > 0,
      `${relPath}: frontmatter needs a non-empty "description".`,
    );
  }
});

test("every relative Markdown link in skills/** resolves inside the repository", () => {
  const markdownFiles = collectFiles(skillsRoot, (path) => /\.md$/i.test(path));
  assert.ok(markdownFiles.length >= 5, "skills/ must keep the skill and reference Markdown files.");

  const failures = [];
  for (const absolute of markdownFiles) {
    const relPath = repoRelative(absolute);
    const fail = (link, message) => failures.push(`${relPath}:${link.line}: ${message}`);
    for (const link of extractLinks(readFileSync(absolute, "utf8"))) {
      const target = parseLinkTarget(link.raw);
      if (!target) continue;
      if (target.absolute) {
        fail(link, `root-absolute link "${link.raw}" is not a repository path.`);
        continue;
      }

      const resolved = target.file === "" ? absolute : resolve(dirname(absolute), target.file);
      const withinRepo = relative(repoRoot, resolved);
      if (withinRepo.startsWith("..") || isAbsolute(withinRepo)) {
        fail(link, `local link "${link.raw}" escapes the repository.`);
        continue;
      }
      if (!existsSync(resolved)) {
        fail(link, `local link "${link.raw}" does not resolve.`);
        continue;
      }
      if (target.fragment && /\.md$/i.test(resolved)) {
        const slugs = headingSlugs(readFileSync(resolved, "utf8"));
        if (!slugs.has(target.fragment.toLowerCase())) {
          fail(link, `anchor "#${target.fragment}" not found in ${repoRelative(resolved)}.`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("the brief schema keeps the canonical contract and declares the optional notes", () => {
  assert.equal(briefSchema.type, "object");
  assert.equal(
    briefSchema.additionalProperties,
    true,
    "unknown interview fields must stay allowed.",
  );
  assert.deepEqual(sorted(briefSchema.required), sorted(REQUIRED_BRIEF_FIELDS));

  const arrayFields = new Set(["direction", "references", "components", "avoid"]);
  for (const field of REQUIRED_BRIEF_FIELDS) {
    const property = briefSchema.properties[field];
    assert.ok(property, `required field "${field}" must be described.`);
    if (field === "foundations") assert.equal(property.type, "object");
    else if (arrayFields.has(field)) assert.equal(property.$ref, "#/$defs/stringArray");
    else {
      assert.ok(
        property.type === "string" && property.minLength === 1,
        `${field} must be a non-empty string.`,
      );
    }
  }

  const foundations = briefSchema.properties.foundations;
  assert.deepEqual(sorted(foundations.required), sorted(REQUIRED_FOUNDATION_FIELDS));
  for (const field of REQUIRED_FOUNDATION_FIELDS) {
    assert.equal(foundations.properties[field].type, "string");
    assert.equal(foundations.properties[field].minLength, 1);
  }

  const stringArray = briefSchema.$defs.stringArray;
  assert.equal(stringArray.items.type, "string");
  assert.equal(stringArray.items.minLength, 1);
  assert.equal(stringArray.uniqueItems, true);

  for (const field of ["referenceNotes", "openQuestions"]) {
    assert.equal(
      briefSchema.properties[field]?.$ref,
      "#/$defs/stringArray",
      `${field} must reuse the string-array shape.`,
    );
  }
  const decisionNotes = resolveSchema(briefSchema.properties.decisionNotes, briefSchema);
  assert.ok(decisionNotes && decisionNotes.type === "array", "decisionNotes must be an array.");
  const item = resolveSchema(decisionNotes.items, briefSchema);
  assert.ok(isPlainObject(item), "decisionNotes.items must resolve to an object schema.");
  assert.equal(item.additionalProperties, false);
  assert.deepEqual(sorted(item.required), sorted(["topic", "status", "note"]));
  for (const field of ["topic", "note"]) {
    assert.equal(item.properties[field].type, "string");
    assert.ok(item.properties[field].minLength >= 1, `${field} must not be empty.`);
  }
  assert.deepEqual(
    sorted(item.properties.status.enum),
    sorted(["confirmed", "delegated", "proposed"]),
  );
});

test("brief-shaped examples validate and incomplete briefs still fail", () => {
  const examples = [
    ...["system-a", "system-b"].map((id) => ({
      source: `packages/${id}/design-brief.json`,
      brief: readJson(join(repoRoot, "packages", id, "design-brief.json")),
    })),
    ...collectSkillBriefExamples(),
  ];
  for (const { source, brief } of examples) {
    const errors = validateAgainstSchema(brief, briefSchema, briefSchema);
    assert.deepEqual(errors, [], `${source}:\n${errors.join("\n")}`);
  }

  const { avoid: _omitted, ...incomplete } = minimalBrief();
  assert.ok(
    validateAgainstSchema(incomplete, briefSchema, briefSchema).some((error) =>
      error.includes('"avoid"'),
    ),
    "a brief missing a required field must fail the local validator",
  );
  const extended = { ...minimalBrief(), ...OPTIONAL_NOTES, extraUnknown: { nested: true } };
  assert.deepEqual(validateAgainstSchema(extended, briefSchema, briefSchema), []);
});

test("normalizeBrief and the dry run preserve optional interview notes without writing", (t) => {
  const raw = {
    ...minimalBrief(),
    project: "  Fixture  ",
    direction: [" calm ", "", "compact"],
    ...OPTIONAL_NOTES,
    extraUnknown: { nested: true },
  };
  const normalized = normalizeBrief(raw, "Fallback");
  assert.equal(normalized.project, "Fixture");
  assert.deepEqual(normalized.direction, ["calm", "compact"]);
  for (const field of Object.keys(OPTIONAL_NOTES)) {
    assert.deepEqual(normalized[field], raw[field], `${field} must be preserved.`);
  }
  assert.deepEqual(normalized.extraUnknown, { nested: true });
  assert.throws(() => normalizeBrief([], "Fallback"), /must be a JSON object/);

  const approved = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Temp", "opencode");
  const tempRoot = mkdtempSync(
    join(approved && existsSync(approved) ? approved : tmpdir(), "prism-skills-"),
  );
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));
  const briefPath = join(tempRoot, "brief.json");
  writeFileSync(
    briefPath,
    `${JSON.stringify({ ...minimalBrief(), ...OPTIONAL_NOTES }, null, 2)}\n`,
  );

  const generator = join(repoRoot, "scripts", "create-design-system.mjs");
  const result = spawnSync(
    process.execPath,
    [
      generator,
      "skills-check",
      "--brief",
      briefPath,
      "--output",
      tempRoot,
      "--dry-run",
      "--no-register",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dry run for "skills-check"/);
  assert.deepEqual(
    readdirSync(tempRoot).sort(),
    ["brief.json"],
    "dry run must not write any file.",
  );
});
