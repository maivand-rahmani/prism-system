#!/usr/bin/env node
/**
 * Deterministically sync the standalone reference copies that ship inside each
 * skill folder.
 *
 * Canonical references live in `skills/references/` and stay authoritative for
 * this repository. A consumer install copies only one skill folder, so every
 * reference a skill links must exist inside that folder with links that resolve
 * locally. This helper derives those copies from the canonical files:
 *
 * - workspace-only links (`../...`) become clearly labeled workspace-relative
 *   prose (`docs/v4/README.md` and similar are author-workspace paths);
 * - links to another skill become prose references to that skill by name;
 * - links to another canonical reference stay local filenames, because both
 *   files are copied into the same `references/` folder;
 * - a generated header names the canonical source and the regeneration command.
 *
 * The check is deterministic and platform-independent: CRLF/CR input is
 * normalized to LF. `--check` (the default) reports drift and exits non-zero;
 * `--write` refreshes the copies. Only generated copies under `skills/` are
 * written.
 *
 * Usage:
 *   node scripts/sync-skill-references.mjs [--check|--write|--help]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The canonical references each skill folder must ship. */
export const SKILL_REFERENCE_SOURCES = Object.freeze({
  "create-design-system": Object.freeze([
    "design-interview",
    "lifecycle",
    "visual-effects-and-custom-components",
  ]),
  "modify-design-system": Object.freeze(["lifecycle", "visual-effects-and-custom-components"]),
  "switch-design-system": Object.freeze([
    "consumer-workflows",
    "lifecycle",
    "visual-effects-and-custom-components",
  ]),
  "use-design-system": Object.freeze([
    "consumer-workflows",
    "lifecycle",
    "visual-effects-and-custom-components",
  ]),
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g;
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;

const toPosix = (value) => value.split(sep).join("/");

/** Strip the leading `../` segments from a workspace link target. */
const toWorkspacePath = (target) => target.replace(/^(?:\.\.\/)+/, "");

/**
 * Render one link whose target escapes the skill folder as workspace prose.
 * Skill links become "the `<id>` skill"; other targets keep the link text and
 * add the workspace-relative path in inline code.
 */
function rewriteEscapingLink(text, target) {
  const skill = /^\.\.\/([^/]+)\/SKILL\.md$/.exec(target);
  if (skill) return `the \`${skill[1]}\` skill`;

  const workspacePath = toWorkspacePath(target);
  const plain = text.replace(/`/g, "").trim();
  const directory = plain.length > 0 && plain.endsWith("/") && workspacePath.startsWith(plain);
  if (
    plain === workspacePath ||
    directory ||
    (plain.length > 0 && workspacePath.endsWith(`/${plain}`))
  ) {
    return `\`${directory ? plain : workspacePath}\``;
  }
  return `${text} (\`${workspacePath}\`)`;
}

/** Rewrite every link outside code fences; local and fragment links stay as-is. */
function rewriteReferenceLinks(source) {
  const output = [];
  let fence = null;
  for (const line of source.split(/\r?\n/)) {
    const fenceMatch = FENCE_PATTERN.exec(line);
    if (fence) {
      output.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      output.push(line);
      continue;
    }
    output.push(
      line.replace(LINK_PATTERN, (whole, text, target) =>
        target.startsWith("../") ? rewriteEscapingLink(text, target) : whole,
      ),
    );
  }
  return output.join("\n");
}

/** Link targets outside code fences, used for the local-closure assertion. */
function collectContentLinkTargets(text) {
  const targets = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const fenceMatch = FENCE_PATTERN.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }
    for (const match of line.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
      targets.push(match[2].trim());
    }
  }
  return targets;
}

/**
 * A standalone copy may link only files copied into the same skill folder, so a
 * generated copy can never point at a missing sibling reference.
 */
function assertLocalClosure(text, skillId, name) {
  const copied = new Set(SKILL_REFERENCE_SOURCES[skillId]);
  for (const target of collectContentLinkTargets(text)) {
    if (target.startsWith("../")) {
      throw new Error(
        `${skillId}/references/${name}.md: link "${target}" still escapes the skill folder.`,
      );
    }
    const local = /^([\w.-]+)\.md$/.exec(target);
    if (local && !copied.has(local[1])) {
      throw new Error(
        `${skillId}/references/${name}.md: link "${target}" is not copied into this skill.`,
      );
    }
  }
}

/**
 * Build the standalone copy of one canonical reference for one skill folder.
 * The output is deterministic: LF endings, a generated header naming the
 * canonical source, and only locally resolvable links.
 */
export function buildStandaloneReference({ skillId, name, source }) {
  const header = [
    `<!-- Generated standalone copy for the \`${skillId}\` skill. Canonical source:`,
    `     \`skills/references/${name}.md\` in the design-systems author`,
    "     workspace; edit that file and run",
    "     `node scripts/sync-skill-references.mjs --write`.",
    "     Do not edit this copy. Workspace paths such as `docs/...`, `packages/...`,",
    "     and `schemas/...` are author-workspace files, not installed with this skill. -->",
  ].join("\n");
  const body = rewriteReferenceLinks(source);
  assertLocalClosure(body, skillId, name);
  return `${header}\n\n${body}`;
}

/**
 * Compare (and optionally refresh) every standalone reference copy.
 *
 * @returns {{ ok: boolean, copies: number, stale: string[], missing: string[],
 *   unexpected: string[], written: string[] }}
 */
export function syncSkillReferences({ root = REPO_ROOT, write = false } = {}) {
  const stale = [];
  const missing = [];
  const unexpected = [];
  const written = [];
  let copies = 0;

  for (const [skillId, names] of Object.entries(SKILL_REFERENCE_SOURCES)) {
    const localDir = join(root, "skills", skillId, "references");
    for (const name of names) {
      copies += 1;
      const canonicalPath = join(root, "skills", "references", `${name}.md`);
      const targetPath = join(localDir, `${name}.md`);
      const expected = buildStandaloneReference({
        skillId,
        name,
        source: readFileSync(canonicalPath, "utf8"),
      });
      const relTarget = toPosix(relative(root, targetPath));
      if (!existsSync(targetPath)) {
        missing.push(relTarget);
        if (write) {
          mkdirSync(localDir, { recursive: true });
          writeFileSync(targetPath, expected);
          written.push(relTarget);
        }
        continue;
      }
      if (readFileSync(targetPath, "utf8") !== expected) {
        stale.push(relTarget);
        if (write) {
          writeFileSync(targetPath, expected);
          written.push(relTarget);
        }
      }
    }

    if (!existsSync(localDir)) continue;
    const expectedNames = new Set(names.map((name) => `${name}.md`));
    for (const entry of readdirSync(localDir, { withFileTypes: true })) {
      if (!entry.isFile() || expectedNames.has(entry.name)) continue;
      unexpected.push(toPosix(relative(root, join(localDir, entry.name))));
    }
  }

  return {
    ok: stale.length === 0 && missing.length === 0 && unexpected.length === 0,
    copies,
    stale,
    missing,
    unexpected,
    written,
  };
}

export function helpText() {
  return [
    "Usage: node scripts/sync-skill-references.mjs [--check|--write]",
    "",
    "Derive the standalone reference copies inside each skill folder from the",
    "canonical files in skills/references/. The check is deterministic and offline.",
    "",
    "Modes:",
    "  --check (default)     Report missing/stale/unexpected copies; exit non-zero on drift.",
    "  --write               Refresh the generated copies.",
    "",
    "Edit the canonical references and run --write; never edit a generated copy.",
    "",
  ].join("\n");
}

function report(result) {
  if (result.ok) {
    process.stdout.write(`Standalone skill references are in sync (${result.copies} copies).\n`);
    return;
  }
  for (const path of result.missing) process.stdout.write(`missing: ${path}\n`);
  for (const path of result.stale) process.stdout.write(`stale: ${path}\n`);
  for (const path of result.unexpected) process.stdout.write(`unexpected: ${path}\n`);
  process.stdout.write(
    "Run `node scripts/sync-skill-references.mjs --write` to refresh the copies.\n",
  );
  process.exitCode = 1;
}

function main(argv) {
  let write = false;
  for (const arg of argv) {
    if (arg === "--write") write = true;
    else if (arg === "--check") write = false;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      return;
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`);
      process.exitCode = 1;
      return;
    }
  }
  if (write) {
    const planned = syncSkillReferences({ write: true });
    if (planned.written.length > 0) {
      process.stdout.write(`Wrote ${planned.written.length} standalone reference copy(ies).\n`);
    }
    report(syncSkillReferences());
    return;
  }
  report(syncSkillReferences());
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main(process.argv.slice(2));
