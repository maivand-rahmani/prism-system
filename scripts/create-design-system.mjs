#!/usr/bin/env node
/**
 * create-design-system.mjs
 *
 * Deterministic V2 package generator. Renders `templates/design-system/**`
 * into `packages/<id>`, preserves the normalized design brief, and registers
 * the new system in `config/design-systems.json`.
 *
 * Creative decisions belong to the agent; every repetitive engineering step
 * (ids, names, paths, placeholders, registration, rollback) is deterministic.
 *
 * CLI: pnpm ds:create <id> [--name <display name>] [--brief <path>]
 *      [--output <root>] [--dry-run] [--no-register]
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANIFEST_RELATIVE_PATH,
  PACKAGE_DIRECTORY,
  assertSystemId,
  assertWithin,
  readJsonFile,
  registerDesignSystem,
  repoRoot,
  toDisplayName,
  toPackageName,
  toSystemClass,
  toTokensExport,
  toUiClass,
} from "./register-design-system.mjs";

const TEMPLATE_RELATIVE = join("templates", "design-system");
const TEMPLATE_SUFFIX = ".template";
const DESIGN_BRIEF_FILENAME = "design-brief.json";

const PLACEHOLDER_PATTERN = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
const ALLOWED_PLACEHOLDERS = Object.freeze([
  "SYSTEM_ID",
  "PACKAGE_NAME",
  "SYSTEM_NAME",
  "SYSTEM_CLASS",
  "TOKENS_EXPORT",
  "BRIEF_SUMMARY",
  "VISUAL_DIRECTION",
  "AVOID_LIST",
]);

const DEFAULT_VISUAL_DIRECTION = "restrained, systematic, accessible";
const DEFAULT_AVOID_LIST = "arbitrary colors, oversized radii, inconsistent spacing";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/* Design brief                                                               */
/* -------------------------------------------------------------------------- */

function asString(value, label) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`Design brief field "${label}" must be a string.`);
  }
  return value.trim();
}

function asStringArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Design brief field "${label}" must be an array of strings.`);
  }
  return value
    .map((item, index) => {
      if (typeof item !== "string") {
        throw new Error(`Design brief field "${label}[${index}]" must be a string.`);
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
}

function asPlainObject(value, label) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    throw new Error(`Design brief field "${label}" must be an object.`);
  }
  return { ...value };
}

/** Normalize a brief with safe defaults while preserving unknown extra fields. */
export function normalizeBrief(raw, fallbackName) {
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) {
    throw new Error("Design brief must be a JSON object.");
  }
  const source = raw ?? {};
  const brief = { ...source };
  brief.project = asString(source.project, "project") || fallbackName;
  brief.product = asString(source.product, "product");
  brief.direction = asStringArray(source.direction, "direction");
  brief.references = asStringArray(source.references, "references");
  brief.foundations = asPlainObject(source.foundations, "foundations");
  brief.components = asStringArray(source.components, "components");
  brief.avoid = asStringArray(source.avoid, "avoid");
  return brief;
}

/** Recursively sort object keys so equivalent briefs serialize identically. */
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isPlainObject(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep(value[key]);
    }
    return sorted;
  }
  return value;
}

function readBrief(briefPath) {
  if (!briefPath) return null;
  const resolvedPath = resolve(briefPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Design brief not found: ${resolvedPath}`);
  }
  try {
    return readJsonFile(resolvedPath);
  } catch (error) {
    throw new Error(`Invalid JSON in design brief ${resolvedPath}: ${error.message}`);
  }
}

function briefPlaceholders(brief) {
  const summary = brief.product
    ? `${brief.project} — ${brief.product}`
    : `${brief.project} design system`;
  return {
    BRIEF_SUMMARY: summary,
    VISUAL_DIRECTION:
      brief.direction.length > 0 ? brief.direction.join(", ") : DEFAULT_VISUAL_DIRECTION,
    AVOID_LIST: brief.avoid.length > 0 ? brief.avoid.join(", ") : DEFAULT_AVOID_LIST,
  };
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

function resolveTemplateRoot(outputRoot) {
  const candidates = [join(outputRoot, TEMPLATE_RELATIVE), join(repoRoot(), TEMPLATE_RELATIVE)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate);
  }
  throw new Error(
    `Template directory not found. Expected ${join(repoRoot(), TEMPLATE_RELATIVE)} ` +
      `(or ${join(outputRoot, TEMPLATE_RELATIVE)} when using --output).`,
  );
}

function collectTemplateFiles(templateRoot) {
  const resolvedRoot = resolve(templateRoot);
  const files = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      assertWithin(resolvedRoot, fullPath, "Template path");
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Template contains a symbolic link (${fullPath}); symbolic links are not allowed.`,
        );
      }
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(TEMPLATE_SUFFIX)) continue;

      const relativePath = relative(resolvedRoot, fullPath).split("\\").join("/");
      const outputRelative = relativePath.slice(0, -TEMPLATE_SUFFIX.length);
      if (
        outputRelative.length === 0 ||
        outputRelative.startsWith("..") ||
        isAbsolute(outputRelative)
      ) {
        throw new Error(`Template path is not renderable: ${relativePath}.`);
      }
      files.push({ templatePath: fullPath, relative: relativePath, outputRelative });
    }
  };
  walk(resolvedRoot);
  return files;
}

const STRING_LITERAL_EXTENSIONS = Object.freeze([
  ".json",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
]);

function templateExtension(outputRelative) {
  const base = outputRelative.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

/** True when a placeholder sits inside a JSON or JS/TS string literal. */
function isStringLiteralContext(outputRelative) {
  return STRING_LITERAL_EXTENSIONS.includes(templateExtension(outputRelative));
}

/**
 * Escape a value so it stays inside an existing JSON/JS string literal. Quotes
 * and backslashes are escaped in place; surrounding quotes are never added.
 */
function encodeStringLiteral(value) {
  let encoded = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (char === '"') encoded += '\\"';
    else if (char === "\\") encoded += "\\\\";
    else if (char === "\n") encoded += "\\n";
    else if (char === "\r") encoded += "\\r";
    else if (char === "\t") encoded += "\\t";
    else if (char === "\b") encoded += "\\b";
    else if (char === "\f") encoded += "\\f";
    else if (code < 0x20) encoded += `\\u${code.toString(16).padStart(4, "0")}`;
    else encoded += char;
  }
  return encoded;
}

/**
 * Flatten a value for Markdown/text templates so embedded line breaks or
 * control characters cannot restructure the document.
 */
function encodeText(value) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

/** Encode a placeholder value according to the rendered file's context. */
function encodePlaceholder(value, outputRelative) {
  return isStringLiteralContext(outputRelative) ? encodeStringLiteral(value) : encodeText(value);
}

function renderTemplate(content, values, file) {
  // Inspect the template (not the rendered output) so a free-text value that
  // happens to contain `{{` is never mistaken for an unreplaced placeholder.
  const withoutValidPlaceholders = content.replace(PLACEHOLDER_PATTERN, "");
  if (withoutValidPlaceholders.includes("{{")) {
    throw new Error(
      `Unreplaced or malformed placeholder in ${file.relative}. Allowed placeholders: ${ALLOWED_PLACEHOLDERS.join(", ")}.`,
    );
  }
  return content.replace(PLACEHOLDER_PATTERN, (match, token) => {
    if (!Object.prototype.hasOwnProperty.call(values, token)) {
      throw new Error(
        `Unknown placeholder ${match} in ${file.relative}. Allowed placeholders: ${ALLOWED_PLACEHOLDERS.join(", ")}.`,
      );
    }
    return encodePlaceholder(values[token], file.outputRelative);
  });
}

/* -------------------------------------------------------------------------- */
/* Package creation                                                           */
/* -------------------------------------------------------------------------- */

function createPackage({ id, displayName, brief, outputRoot, templateRoot, dryRun }) {
  const packagesDir = join(outputRoot, PACKAGE_DIRECTORY);
  const packageDir = assertWithin(packagesDir, join(packagesDir, id), `Package path for "${id}"`);
  const templateFiles = collectTemplateFiles(templateRoot);
  const rendersBrief = templateFiles.some((file) => file.outputRelative === DESIGN_BRIEF_FILENAME);

  const values = {
    SYSTEM_ID: id,
    PACKAGE_NAME: toPackageName(id),
    SYSTEM_NAME: displayName,
    SYSTEM_CLASS: toSystemClass(id),
    TOKENS_EXPORT: toTokensExport(id),
    ...briefPlaceholders(brief),
  };

  const planned = [...templateFiles.map((file) => file.outputRelative)];
  if (!rendersBrief) planned.push(DESIGN_BRIEF_FILENAME);
  planned.sort();
  const existed = existsSync(packageDir);

  if (dryRun) {
    return { packageDir, planned, wrote: false, existed };
  }
  if (existed) {
    throw new Error(
      `Package directory already exists: ${packageDir}. Remove it or choose another id.`,
    );
  }

  mkdirSync(packagesDir, { recursive: true });
  const tempDir = join(packagesDir, `.${id}.tmp-${process.pid}-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  try {
    for (const file of templateFiles) {
      const rendered = renderTemplate(readFileSync(file.templatePath, "utf8"), values, file);
      const outputPath = assertWithin(
        tempDir,
        join(tempDir, file.outputRelative),
        `Output path for ${file.relative}`,
      );
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, rendered, "utf8");
    }
    if (!rendersBrief) {
      writeFileSync(
        join(tempDir, DESIGN_BRIEF_FILENAME),
        `${JSON.stringify(sortKeysDeep(brief), null, 2)}\n`,
        "utf8",
      );
    }
    renameSync(tempDir, packageDir);
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }

  return { packageDir, planned, wrote: true, existed: false };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

export function helpText() {
  return [
    "Usage: pnpm ds:create <id> [options]",
    "",
    "Create a design-system package from templates/design-system and register it.",
    "",
    "Arguments:",
    "  <id>                   Lower-kebab-case system id (e.g. pulse).",
    "",
    "Options:",
    '  --name <name>          Display name (default: brief "project", else title-cased id).',
    "  --brief <path>         Path to a JSON design brief.",
    "  --output <root>        Root for packages/ and config/ output (default: repo root).",
    "  --dry-run              List planned files without writing anything.",
    "  --no-register          Skip updating config/design-systems.json.",
    "  -h, --help             Show this help.",
    "",
    "Template files under templates/design-system ending in .template are rendered;",
    "the .template suffix is stripped. Allowed placeholders:",
    `  ${ALLOWED_PLACEHOLDERS.map((name) => `{{${name}}}`).join(", ")}.`,
    `The generator writes ${DESIGN_BRIEF_FILENAME} only when the template does not render it.`,
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    id: undefined,
    name: undefined,
    brief: undefined,
    output: undefined,
    dryRun: false,
    noRegister: false,
    help: false,
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-register") {
      options.noRegister = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      let value;
      if (equals !== -1) {
        value = arg.slice(equals + 1);
      } else {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (key === "name") options.name = value;
      else if (key === "brief") options.brief = value;
      else if (key === "output") options.output = value;
      else throw new Error(`Unknown option: --${key}`);
      continue;
    }
    positionals.push(arg);
  }
  if (positionals.length > 1) {
    throw new Error(`Expected a single <id>, received: ${positionals.join(", ")}.`);
  }
  options.id = positionals[0];
  return options;
}

function toPosixRelative(from, to) {
  return relative(from, to).split("\\").join("/");
}

async function main(argv) {
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
  if (!options.id) {
    process.stderr.write(`Missing required <id>.\n\n${helpText()}`);
    process.exitCode = 1;
    return;
  }

  try {
    const id = assertSystemId(options.id);
    const outputRoot = resolve(options.output ?? repoRoot());
    const rawBrief = readBrief(options.brief);
    const briefProject =
      isPlainObject(rawBrief) && typeof rawBrief.project === "string"
        ? rawBrief.project.trim()
        : "";
    const nameOption = options.name === undefined ? undefined : options.name.trim();
    if (nameOption !== undefined && nameOption.length === 0) {
      throw new Error("--name must not be empty.");
    }
    const displayName = nameOption || briefProject || toDisplayName(id);
    const brief = normalizeBrief(rawBrief, displayName);
    const templateRoot = resolveTemplateRoot(outputRoot);

    const result = createPackage({
      id,
      displayName,
      brief,
      outputRoot,
      templateRoot,
      dryRun: options.dryRun,
    });

    if (options.dryRun) {
      process.stdout.write(`Dry run for "${id}" (${toPackageName(id)})\n`);
      if (result.existed) {
        process.stdout.write(
          `  note: ${toPosixRelative(outputRoot, result.packageDir)} already exists\n`,
        );
      }
      for (const file of result.planned) {
        process.stdout.write(`  ${toPosixRelative(outputRoot, join(result.packageDir, file))}\n`);
      }
      process.stdout.write(
        options.noRegister
          ? "Dry run: no files written, registration skipped.\n"
          : "Dry run: no files written, would register in config/design-systems.json.\n",
      );
      return;
    }

    process.stdout.write(
      `Created ${toPackageName(id)} at ${toPosixRelative(outputRoot, result.packageDir)} ` +
        `(${result.planned.length} files).\n`,
    );

    if (!options.noRegister) {
      try {
        const registration = await registerDesignSystem({
          id,
          root: outputRoot,
          manifestPath: join(outputRoot, MANIFEST_RELATIVE_PATH),
          entry: {
            name: displayName,
            uiClass: toUiClass(id),
            tokensExport: toTokensExport(id),
            contract: "v2",
          },
        });
        process.stdout.write(
          `Registered ${registration.entry.packageName} as ${registration.action}.\n`,
        );
      } catch (error) {
        rmSync(result.packageDir, { recursive: true, force: true });
        throw new Error(
          `Registration failed; removed generated package at ${result.packageDir}.\n${error.message}`,
        );
      }
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(process.argv.slice(2));
}
