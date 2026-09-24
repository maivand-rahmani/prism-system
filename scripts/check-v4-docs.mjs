#!/usr/bin/env node
/**
 * Deterministic V4 documentation validation (Phase 4 evidence).
 *
 * This module is both a reusable library (imported by tests) and a CLI
 * (`pnpm ds:check-v4-docs`). It is offline, read-only, and mutates nothing:
 *
 * 1. Scans the active Markdown documentation only — root README/AGENTS,
 *    `docs/guide(.md)` and `docs/v4`, app READMEs, package READMEs/AGENTS,
 *    the template README/AGENTS templates, and the consumer fixture docs.
 *    `docs/archive/**`, `skills/**`, changelogs, generated/temp output, and
 *    non-Markdown files are excluded.
 * 2. Validates local Markdown file links relative to the containing document.
 *    External/network links, same-page fragments, code fences, known app routes
 *    (`/showcase/<id>`), and inline code are ignored. GitHub-style fragment
 *    slugs are intentionally not validated: reproducing them without a
 *    dependency would invent false positives.
 * 3. Requires the V4 system and template README section contract:
 *    `Quickstart`, `Foundations`, `Components`, `Usage rules`. The `Components`
 *    section must point at the live `/showcase/<id>` catalog and at the
 *    generated `design-system.json` / `<package>/manifest` catalog source
 *    instead of a hand-maintained variant inventory. The template must use the
 *    `/showcase/{{SYSTEM_ID}}` placeholder and describe the manifest source
 *    neutrally.
 *    When present, the consumer migration guide
 *    (`docs/v4/migration-v2-to-v4.md`) must keep its essential sections; its
 *    local links are validated by the generic link pass.
 * 4. Re-runs the existing read-only `validateDesignSystem({ id, runCommands:
 *    false })` checks for every registered V4 system and reports failures from
 *    the generated-manifest, component-barrel, and runtime-map checks with the
 *    system id as doc-check context. No package code is executed and no
 *    network access is performed.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateDesignSystem } from "./validate-design-system.mjs";

/** The four sections every V4 system and template README must provide. */
export const REQUIRED_README_SECTIONS = Object.freeze([
  "Quickstart",
  "Foundations",
  "Components",
  "Usage rules",
]);

/** The consumer migration guide and the sections it must keep. */
export const MIGRATION_DOCUMENT = "docs/v4/migration-v2-to-v4.md";

export const REQUIRED_MIGRATION_SECTIONS = Object.freeze([
  "Что меняется",
  "Версии пакетов",
  "Путь миграции",
  "CSS и Tailwind",
  "Примеры до и после",
  "Команды prism-ds и их границы",
  "Версионирование и выпуск",
]);

/**
 * `validateDesignSystem` checks that back the documentation's catalog/export
 * evidence. The generated manifest, component barrel, and runtime map are the
 * primary ones; the surrounding identity/files checks are included so a missing
 * or unregistered package cannot silently pass.
 */
export const CATALOG_CONTRACT_CHECKS = Object.freeze([
  "manifest entry",
  "package metadata",
  "required package files",
  "generated manifest",
  "component barrel exports",
  "runtime design system",
]);

/** Root-absolute targets under this prefix are known application routes. */
const SHOWCASE_ROUTE_PREFIX = "/showcase";

/** Directory segments that never contain active documentation. */
const EXCLUDED_SEGMENTS = Object.freeze([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "coverage",
  "TEMP",
]);

/** Absolute path to the repository root (the parent directory of `scripts/`). */
function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Documentation paths this checker never scans, even transitively. */
function isExcludedDocPath(relPath) {
  const posix = toPosix(relPath);
  if (posix.startsWith("docs/archive/") || posix.startsWith("skills/")) return true;
  const segments = posix.split("/");
  if (segments.some((segment) => EXCLUDED_SEGMENTS.includes(segment))) return true;
  return /^changelog\.md$/i.test(segments.at(-1) ?? "");
}

/** Recursively collect `.md` files under `dir`, honoring the exclusions. */
function collectMarkdownTree(dir, root, files) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const relPath = toPosix(relative(root, absolute));
    if (isExcludedDocPath(relPath)) continue;
    if (entry.isDirectory()) collectMarkdownTree(absolute, root, files);
    else if (entry.isFile() && /\.md$/i.test(entry.name)) files.add(relPath);
  }
}

/**
 * The exact active documentation set, sorted for determinism. Files that do
 * not exist in a given root are skipped, which keeps small test fixtures and
 * generated roots usable while the repository itself keeps every entry.
 */
export function collectActiveDocs(root) {
  const files = new Set();
  const addFile = (relPath) => {
    const absolute = join(root, relPath);
    if (existsSync(absolute) && statSync(absolute).isFile()) files.add(toPosix(relPath));
  };

  addFile("README.md");
  addFile("AGENTS.md");
  addFile("docs/guide.md");
  addFile(MIGRATION_DOCUMENT);
  collectMarkdownTree(join(root, "docs", "guide"), root, files);
  collectMarkdownTree(join(root, "docs", "v4"), root, files);
  addFile("fixtures/consumer-product/README.md");
  addFile("fixtures/consumer-product/AGENTS.md");
  addFile("templates/design-system/README.md.template");
  addFile("templates/design-system/AGENTS.md.template");

  for (const group of ["apps", "packages"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || isExcludedDocPath(entry.name)) continue;
      addFile(`${group}/${entry.name}/README.md`);
      if (group === "packages") addFile(`${group}/${entry.name}/AGENTS.md`);
    }
  }

  return [...files].filter((file) => !isExcludedDocPath(file)).sort();
}

/* -------------------------------------------------------------------------- */
/* Markdown parsing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Invoke `callback(line, index)` for every line outside a fenced code block.
 * The closing fence must reuse the opening character and length.
 */
function forEachContentLine(text, callback) {
  const lines = text.split(/\r?\n/);
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (match && match[1][0] === fence.char && match[1].length >= fence.length) fence = null;
      continue;
    }
    if (match) {
      fence = { char: match[1][0], length: match[1].length };
      continue;
    }
    callback(line, index);
  }
}

/** Remove fenced code blocks so content heuristics never inspect examples. */
function stripFencedBlocks(text) {
  const kept = [];
  forEachContentLine(text, (line) => kept.push(line));
  return kept.join("\n");
}

/** Inline Markdown links outside code fences, with their 1-based line. */
function extractLinks(text) {
  const links = [];
  forEachContentLine(text, (line, index) => {
    const withoutInlineCode = line.replace(/``[^`]*``|`[^`]*`/g, " ");
    const pattern = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match = pattern.exec(withoutInlineCode);
    while (match !== null) {
      links.push({ line: index + 1, text: match[1], raw: match[2].trim() });
      match = pattern.exec(withoutInlineCode);
    }
  });
  return links;
}

function normalizeHeading(text) {
  return text
    .replace(/[:：]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** ATX headings outside code fences, with their 0-based source line. */
function readHeadings(text) {
  const headings = [];
  forEachContentLine(text, (line, index) => {
    const match = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (match)
      headings.push({ level: match[1].length, line: index, text: normalizeHeading(match[2]) });
  });
  return headings;
}

/** Raw body of the first section whose heading text matches `title`. */
function findSection(text, title) {
  const lines = text.split(/\r?\n/);
  const headings = readHeadings(text);
  const wanted = normalizeHeading(title);
  const index = headings.findIndex((heading) => heading.text === wanted);
  if (index === -1) return null;

  const heading = headings[index];
  let end = lines.length;
  for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
    if (headings[cursor].level <= heading.level) {
      end = headings[cursor].line;
      break;
    }
  }
  return { line: heading.line + 1, body: lines.slice(heading.line + 1, end).join("\n") };
}

function requireReadmeSections({ relPath, text, fail }) {
  const headings = readHeadings(text);
  for (const title of REQUIRED_README_SECTIONS) {
    if (!headings.some((heading) => heading.text === normalizeHeading(title))) {
      fail(`${relPath}: missing required heading "## ${title}".`);
    }
  }
}

/**
 * The `Components` section may not keep a hand-written variant inventory; a
 * heading or `variant: value` assignment is the heuristic signal for one.
 * Fenced examples are ignored so code samples never trip the check.
 */
function rejectManualVariantInventory({ relPath, section, fail }) {
  const body = stripFencedBlocks(section.body);
  const heading = /(^|\n)[ \t]*#{1,6}[ \t]+variant(?:s)?\b/i.test(body);
  const assignment = /\bvariant(?:s)?\b[ \t]*[:=]/i.test(body);
  if (heading || assignment) {
    fail(
      `${relPath}: Components section must point at the generated catalog instead of a manual variant inventory.`,
    );
  }
}

/** Validate a registered V4 system README's section and catalog contract. */
function checkSystemReadme({ relPath, id, packageName, text, fail }) {
  requireReadmeSections({ relPath, text, fail });

  const section = findSection(text, "Components");
  if (!section) return;

  const route = `${SHOWCASE_ROUTE_PREFIX}/${id}`;
  const routePattern = new RegExp(`${escapeRegExp(route)}(?![A-Za-z0-9_-])`);
  if (!routePattern.test(section.body)) {
    fail(`${relPath}: Components section must point at the live catalog route ${route}.`);
  }

  const pointers = ["design-system.json", "./manifest"];
  if (typeof packageName === "string" && packageName.length > 0) {
    pointers.push(`${packageName}/manifest`);
  }
  if (!pointers.some((pointer) => section.body.includes(pointer))) {
    fail(
      `${relPath}: Components section must name the generated design-system.json manifest ` +
        `(public "./manifest") as the catalog source.`,
    );
  }

  rejectManualVariantInventory({ relPath, section, fail });
}

/** Validate the template README's placeholder route and neutral manifest source. */
function checkTemplateReadme({ relPath, text, fail }) {
  requireReadmeSections({ relPath, text, fail });

  const section = findSection(text, "Components");
  if (!section) return;

  if (!section.body.includes("/showcase/{{SYSTEM_ID}}")) {
    fail(`${relPath}: Components section must use the /showcase/{{SYSTEM_ID}} route placeholder.`);
  }
  for (const match of text.matchAll(/\/showcase\/[A-Za-z0-9_{}-]*/g)) {
    if (match[0] === "/showcase/") continue;
    if (match[0] !== "/showcase/{{SYSTEM_ID}}") {
      fail(`${relPath}: route "${match[0]}" must be written as /showcase/{{SYSTEM_ID}}.`);
    }
  }
  if (!/design-system\.json|\{\{PACKAGE_NAME\}\}\/manifest/.test(section.body)) {
    fail(
      `${relPath}: Components section must describe the generated manifest source neutrally ` +
        `(design-system.json / {{PACKAGE_NAME}}/manifest).`,
    );
  }

  rejectManualVariantInventory({ relPath, section, fail });
}

/**
 * The consumer migration guide must keep its essential sections. Links are
 * covered by the generic local-link pass; only headings are enforced here, and
 * only when the guide exists in the scanned root.
 */
function checkMigrationGuide({ relPath, text, fail }) {
  const headings = readHeadings(text);
  for (const title of REQUIRED_MIGRATION_SECTIONS) {
    if (!headings.some((heading) => heading.text === normalizeHeading(title))) {
      fail(`${relPath}: missing required heading "## ${title}".`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Classify a raw link target:
 *   ignore   — external, protocol-relative, same-page fragment, or empty path
 *   route    — known application route (`/showcase...`)
 *   absolute — other root-absolute path (not a repository path)
 *   empty    — no target at all
 *   local    — repository-relative path
 */
function classifyLinkTarget(raw) {
  let target = raw;
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1).trim();
  const title = /^(\S+)\s+["'(].*$/.exec(target);
  if (title) target = title[1];
  try {
    target = decodeURIComponent(target);
  } catch {
    // Keep the raw target when it is not valid percent-encoding.
  }

  if (target.length === 0) return { kind: "empty", value: raw };
  if (target.startsWith("#")) return { kind: "ignore" };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return { kind: "ignore" };
  if (target.startsWith("//")) return { kind: "ignore" };
  if (target.startsWith("/")) {
    if (target === SHOWCASE_ROUTE_PREFIX || target.startsWith(`${SHOWCASE_ROUTE_PREFIX}/`)) {
      return { kind: "route", value: target };
    }
    return { kind: "absolute", value: target };
  }
  const path = target.split(/[?#]/, 1)[0];
  if (path.length === 0) return { kind: "ignore" };
  return { kind: "local", value: path };
}

/** True when `target` exists relative to the containing document. */
function resolvesFromDocument(root, docRelPath, target) {
  return existsSync(resolve(root, dirname(docRelPath), target));
}

/* -------------------------------------------------------------------------- */
/* Registered systems and package contract verification                       */
/* -------------------------------------------------------------------------- */

/** Raw registry entries; throws when the registry is missing or invalid. */
export function readRegistryEntries(root) {
  const registryPath = join(root, "config", "design-systems.json");
  const raw = JSON.parse(readFileSync(registryPath, "utf8"));
  if (!isPlainObject(raw) || !Array.isArray(raw.designSystems)) {
    throw new Error('design-systems.json must contain a "designSystems" array.');
  }
  return raw.designSystems.filter(isPlainObject);
}

/**
 * Reuse the existing read-only package validation for one registered V4
 * system and surface catalog-contract failures with doc-check context.
 */
function verifyCatalogContract({ root, entry, fail }) {
  const id = entry.id;
  let result;
  try {
    result = validateDesignSystem({ id, root, runCommands: false });
  } catch (error) {
    fail(`[${id}] catalog contract check could not run: ${error.message}`);
    return;
  }
  const failed = result.checks
    .filter((check) => !check.ok && CATALOG_CONTRACT_CHECKS.includes(check.name))
    .map((check) => check.name);
  if (failed.length === 0) return;
  for (const failure of result.failures) {
    fail(`[${id}] catalog contract (${failed.join(", ")}): ${failure}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run the full V4 documentation validation.
 *
 * @param {object} [options]
 * @param {string} [options.root]            Root holding docs/, packages/, and config/ (defaults to repo root).
 * @param {boolean} [options.verifyContracts] Verify registered V4 packages (default true).
 * @returns {{ root: string, ok: boolean, failures: string[], checks: {name: string, ok: boolean}[], documents: string[], stats: object }}
 */
export function runDocsCheck(options = {}) {
  const root = resolve(options.root ?? repoRoot());
  const verifyContracts = options.verifyContracts ?? true;
  const failures = [];
  const checks = [];
  const check = (name, run) => {
    const before = failures.length;
    try {
      run();
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
    checks.push({ name, ok: failures.length === before });
  };
  const fail = (message) => failures.push(message);

  const stats = {
    documents: 0,
    links: 0,
    ignored: 0,
    systems: [],
    contracts: [],
    migration: false,
  };
  const documents = [];
  check("active documents", () => {
    documents.push(...collectActiveDocs(root));
    stats.documents = documents.length;
  });

  check("local links", () => {
    for (const docRelPath of documents) {
      const text = readFileSync(join(root, docRelPath), "utf8");
      for (const link of extractLinks(text)) {
        const target = classifyLinkTarget(link.raw);
        if (target.kind === "ignore" || target.kind === "route") {
          stats.ignored += 1;
          continue;
        }
        stats.links += 1;
        if (target.kind === "empty") {
          fail(`${docRelPath}:${link.line}: link "${link.raw}" has an empty target.`);
          continue;
        }
        if (target.kind === "absolute") {
          fail(
            `${docRelPath}:${link.line}: root-absolute link target "${target.value}" is not a ` +
              `repository path; only known application routes such as ${SHOWCASE_ROUTE_PREFIX}/<id> are ignored.`,
          );
          continue;
        }
        if (!resolvesFromDocument(root, docRelPath, target.value)) {
          fail(`${docRelPath}:${link.line}: local link target "${target.value}" does not resolve.`);
        }
      }
    }
  });

  let v4Entries = [];
  check("registered V4 systems", () => {
    const entries = readRegistryEntries(root);
    v4Entries = entries.filter((entry) => entry.contract === "v4");
    stats.systems = v4Entries.map((entry) =>
      typeof entry.id === "string" && entry.id.length > 0 ? entry.id : "(unidentified)",
    );
  });

  check("system READMEs", () => {
    for (const entry of v4Entries) {
      if (typeof entry.id !== "string" || entry.id.length === 0) {
        fail('config/design-systems.json: a V4 registry entry is missing a non-empty string "id".');
        continue;
      }
      const packagePath =
        typeof entry.packagePath === "string" && entry.packagePath.length > 0
          ? toPosix(entry.packagePath)
          : `packages/${entry.id}`;
      const relPath = `${packagePath}/README.md`;
      if (!existsSync(join(root, relPath))) {
        fail(`V4 system "${entry.id}": README not found at ${relPath}.`);
        continue;
      }
      checkSystemReadme({
        relPath,
        id: entry.id,
        packageName: entry.packageName,
        text: readFileSync(join(root, relPath), "utf8"),
        fail,
      });
    }
  });

  check("template documentation", () => {
    const templateDir = join(root, "templates", "design-system");
    if (!existsSync(templateDir)) return;
    for (const relPath of [
      "templates/design-system/README.md.template",
      "templates/design-system/AGENTS.md.template",
    ]) {
      if (!existsSync(join(root, relPath))) fail(`${relPath} is missing.`);
    }
    const readmeRelPath = "templates/design-system/README.md.template";
    if (existsSync(join(root, readmeRelPath))) {
      checkTemplateReadme({
        relPath: readmeRelPath,
        text: readFileSync(join(root, readmeRelPath), "utf8"),
        fail,
      });
    }
  });

  check("migration guide", () => {
    if (!existsSync(join(root, MIGRATION_DOCUMENT))) return;
    stats.migration = true;
    checkMigrationGuide({
      relPath: MIGRATION_DOCUMENT,
      text: readFileSync(join(root, MIGRATION_DOCUMENT), "utf8"),
      fail,
    });
  });

  check("package catalog contracts", () => {
    if (!verifyContracts) return;
    for (const entry of v4Entries) {
      if (typeof entry.id !== "string" || entry.id.length === 0) continue;
      stats.contracts.push(entry.id);
      verifyCatalogContract({ root, entry, fail });
    }
  });

  const uniqueFailures = [...new Set(failures)];
  return {
    root,
    ok: uniqueFailures.length === 0,
    failures: uniqueFailures,
    checks,
    documents,
    stats,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

/** Render the CLI help text. */
export function helpText() {
  return [
    "Usage: pnpm ds:check-v4-docs [--root <path>] [--no-contracts]",
    "",
    "Validate the active V4 documentation: local Markdown links resolve, the system",
    "and template READMEs keep the required sections with the live Showcase catalog",
    "and generated-manifest pointers, the consumer migration guide keeps its",
    "essential sections, and every registered V4 package still satisfies",
    "the generated manifest, component barrel, and runtime map contract.",
    "",
    "Deterministic, offline, read-only. Archive and skill documents, changelogs,",
    "generated/temp output, code fences, and external links are excluded.",
    "",
    "Options:",
    "  --root <path>     Root holding docs/, packages/, and config/ (default: repo root).",
    "  --no-contracts    Skip the registered V4 package contract verification.",
    "  -h, --help        Show this help.",
    "",
    "Exit code is non-zero when any check fails.",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { root: undefined, contracts: true, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-contracts") {
      options.contracts = false;
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Option --root requires a value.");
      }
      options.root = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function reportResult(result) {
  const { stats } = result;
  if (result.ok) {
    process.stdout.write("V4 documentation validation passed\n");
    process.stdout.write(`  ✓ active documents (${stats.documents})\n`);
    process.stdout.write(`  ✓ local links (${stats.links} checked, ${stats.ignored} ignored)\n`);
    process.stdout.write(`  ✓ system READMEs (${stats.systems.join(", ") || "none"})\n`);
    process.stdout.write("  ✓ template documentation\n");
    process.stdout.write(`  ✓ migration guide${stats.migration ? "" : " (absent)"}\n`);
    process.stdout.write(
      `  ✓ package catalog contracts (${result.stats.contracts.join(", ") || "skipped"})\n`,
    );
    process.stdout.write(`  ${result.checks.length} check(s) passed.\n`);
    return;
  }
  process.stdout.write("V4 documentation validation failed\n\n");
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write(`\n${result.failures.length} issue(s) found.\n`);
  process.exitCode = 1;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  try {
    reportResult(
      runDocsCheck({
        root: options.root,
        verifyContracts: options.contracts,
      }),
    );
  } catch (error) {
    process.stdout.write(`V4 documentation validation failed\n\n  ${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2));
}
