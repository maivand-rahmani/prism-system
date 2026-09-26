#!/usr/bin/env node
/**
 * Deterministic token artifact tests (Node built-in test runner, no
 * dependency).
 *
 * Run directly:
 *   node --test scripts/design-system-tokens.test.mjs
 *
 * These tests exercise the real generation path: `parseTokenSource` /
 * `resolveTokenSource` from `design-system-manifest.mjs` validate and resolve,
 * the pure renderers in `design-system-tokens.mjs` format, and
 * `writeDesignSystemManifest` / `checkDesignSystemManifest` write and verify.
 * Fixtures are copied into temp directories; the repository is never
 * mutated.
 */

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildManifest,
  checkDesignSystemManifest,
  parseTokenSource,
  readRuntimeDesignSystemVersion,
  resolveTokenSource,
  syncRuntimeDesignSystemVersion,
  writeDesignSystemManifest,
} from "./design-system-manifest.mjs";
import {
  TAILWIND_UTILITY_PREFIX,
  TOKEN_NAMESPACE_PATTERN,
  TOKEN_ARTIFACT_PATHS,
  TOKEN_NAME_FIELDS,
  buildTokenArtifactFiles,
  renderTailwindCss,
  renderTokensCss,
  renderTokensTypeScript,
  tokenNaming,
  tokenVariablePrefix,
} from "./design-system-tokens.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "schemas", "fixtures");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fixture = (...segments) => join(fixturesRoot, ...segments);
const validTokens = () => readJson(fixture("valid", "tokens.source.json"));
const resolvedValid = () => resolveTokenSource(validTokens());

/** Copy a directory into a fresh temp dir so tests never touch the repo. */
function tempCopy(sourceDir) {
  const dest = mkdtempSync(join(tmpdir(), "prism-tokens-"));
  cpSync(sourceDir, dest, { recursive: true });
  return dest;
}

function cleanup(testContext, dir) {
  // Temporary filesystem locks must not turn a passing assertion into a failure.
  // Only cleanup is retried; test assertions still run once.
  testContext.after(() =>
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
}

/* -------------------------------------------------------------------------- */
/* Validation authority + resolution                                          */
/* -------------------------------------------------------------------------- */

test("resolves every $ref to its ultimate literal", () => {
  const resolved = resolvedValid();
  assert.equal(resolved.radius.md, "0.25rem"); // radius.md -> radius.sm
  assert.equal(resolved.layers.tooltip, 1300); // layers.tooltip -> layers.modal
  assert.equal(resolved.spacing.semantic.inset, "1rem"); // -> spacing.scale.4
  assert.equal(resolved.themes.dark.color.action.secondaryText, "#f5f5f2");
  assert.equal(resolved.themes.light.color.text.primary, "#1a1a1a");
});

test("emits all groups in canonical order", () => {
  const resolved = resolvedValid();
  assert.deepEqual(Object.keys(resolved), [
    "themes",
    "typography",
    "spacing",
    "containers",
    "breakpoints",
    "layers",
    "radius",
    "shadow",
    "motion",
  ]);
  assert.deepEqual(Object.keys(resolved.themes), ["light", "dark"]);
});

test("parseTokenSource remains the validation authority for resolution", () => {
  assert.equal(parseTokenSource(validTokens()).schemaVersion, 1);
  assert.throws(
    () => resolveTokenSource(readJson(fixture("tokens-invalid-ref-target", "tokens.source.json"))),
    /does not exist in tokens\.source\.json/,
  );
  assert.throws(
    () => resolveTokenSource(readJson(fixture("tokens-invalid-ref-cycle", "tokens.source.json"))),
    /token \$ref cycle detected/,
  );
  assert.throws(
    () => resolveTokenSource(readJson(fixture("tokens-invalid-ref-type", "tokens.source.json"))),
    /incompatible \$ref/,
  );
});

/* -------------------------------------------------------------------------- */
/* TypeScript artifact                                                        */
/* -------------------------------------------------------------------------- */

test("renders deterministic TypeScript tokens with a type export", () => {
  const first = renderTokensTypeScript({
    tokensExport: "v4ValidTokens",
    resolvedTokens: resolvedValid(),
  });
  const second = renderTokensTypeScript({
    tokensExport: "v4ValidTokens",
    resolvedTokens: resolvedValid(),
  });
  assert.equal(first, second);
  assert.match(first, /export const v4ValidTokens = \{/);
  assert.match(first, /export type V4ValidTokens = typeof v4ValidTokens;/);
  assert.match(first, /"themes": \{/);
  assert.match(first, /"radius": \{/);
  // No alias leaks into the emitted tree.
  assert.ok(!first.includes("$ref"));
});

/* -------------------------------------------------------------------------- */
/* CSS artifact                                                               */
/* -------------------------------------------------------------------------- */

test("derives the variable prefix from uiClass", () => {
  assert.equal(tokenVariablePrefix("maivand-valid-ui"), "maivand-valid");
  assert.equal(tokenVariablePrefix("maivand-a-ui"), "maivand-a");
  assert.equal(tokenVariablePrefix("maivand-valid"), "maivand-valid");
});

test("tokenNaming publishes the exact prefixes the artifacts emit", () => {
  const uiClass = "maivand-valid-ui";
  const naming = tokenNaming(uiClass);
  assert.deepEqual(naming, {
    cssVariablePrefix: "maivand-valid",
    tailwindUtilityPrefix: TAILWIND_UTILITY_PREFIX,
  });
  assert.equal(naming.tailwindUtilityPrefix, "prism");
  assert.deepEqual([...TOKEN_NAME_FIELDS], ["cssVariablePrefix", "tailwindUtilityPrefix"]);
  for (const value of Object.values(naming)) {
    assert.ok(TOKEN_NAMESPACE_PATTERN.test(value), `${value} is a safe namespace`);
  }

  // Generation parity: the derived CSS prefix is exactly what the stylesheet
  // emits, and the derived Tailwind namespace is exactly what the bridge emits.
  const resolved = resolvedValid();
  const css = renderTokensCss({ uiClass, resolvedTokens: resolved });
  assert.ok(css.includes(`--${naming.cssVariablePrefix}-color-text-primary:`));
  const tw = renderTailwindCss({ uiClass, resolvedTokens: resolved });
  assert.ok(tw.includes(`--color-${naming.tailwindUtilityPrefix}-text-primary:`));
  const themeKeys = [...tw.matchAll(/^ {2}(--[a-z0-9-]+):/gm)].map((match) => match[1]);
  assert.ok(themeKeys.length > 0, "the bridge emits theme keys");
  for (const key of themeKeys) {
    assert.ok(
      key.includes(`-${naming.tailwindUtilityPrefix}`),
      `bridge key ${key} uses the published Tailwind namespace`,
    );
  }
});

test("a manifest's published token names match the emitted artifacts", () => {
  const manifest = buildManifest({ id: "v4-valid", packageDir: fixture("valid") });
  const files = buildTokenArtifactFiles({
    tokensExport: "v4ValidTokens",
    uiClass: "maivand-valid-ui",
    resolvedTokens: resolvedValid(),
  });
  const css = files.find((file) => file.key === "css").content;
  const tw = files.find((file) => file.key === "tailwind").content;
  assert.ok(css.includes(`--${manifest.tokens.names.cssVariablePrefix}-color-text-primary:`));
  assert.ok(tw.includes(`--color-${manifest.tokens.names.tailwindUtilityPrefix}-text-primary:`));
});

test("generation fails closed on a malformed uiClass namespace", (t) => {
  const dir = tempCopy(fixture("valid"));
  cleanup(t, dir);
  const pkg = readJson(join(dir, "package.json"));
  pkg.prismSystem.uiClass = "Maivand Valid";
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  assert.throws(
    () => buildManifest({ id: "v4-valid", packageDir: dir }),
    /design-system\.json "tokens" "names"\.cssVariablePrefix must be a safe lower-kebab namespace \(received "Maivand Valid"\)\./,
  );
});

test("renders system-prefixed CSS with shared light/dark names", () => {
  const css = renderTokensCss({ uiClass: "maivand-valid-ui", resolvedTokens: resolvedValid() });
  assert.match(css, /--maivand-valid-color-text-primary: #1a1a1a;/);
  assert.match(css, /--maivand-valid-color-text-primary: #f5f5f2;/);
  assert.match(css, /--maivand-valid-typography-family-sans: system-ui, sans-serif;/);
  assert.match(css, /--maivand-valid-spacing-scale-4: 1rem;/);
  assert.match(css, /--maivand-valid-motion-duration-fast: 120ms;/);
  // The `themes.light` / `themes.dark` segments are omitted from variable names.
  assert.ok(!css.includes("--maivand-valid-themes-"));
  // Light/default first, dark overrides second.
  assert.ok(css.indexOf(":root {") !== -1);
  assert.ok(css.indexOf(":root {") < css.indexOf(':root[data-prism-theme="dark"]'));
  // Light and dark declare the identical color variable-name set (the root
  // block additionally holds the non-theme groups, which have no dark override).
  const colorNames = (block) =>
    [...block.matchAll(/(--maivand-valid-color-[a-z0-9-]+):/g)].map((match) => match[1]);
  const rootBlock = css.slice(
    css.indexOf(":root {"),
    css.indexOf(':root[data-prism-theme="dark"]'),
  );
  const darkBlock = css.slice(css.indexOf(':root[data-prism-theme="dark"]'));
  assert.equal(colorNames(rootBlock).length, 21);
  assert.deepEqual(colorNames(darkBlock).sort(), colorNames(rootBlock).sort());
});

test("renders a second system with its own prefix", () => {
  const css = renderTokensCss({
    uiClass: "maivand-valid-b-ui",
    resolvedTokens: resolveTokenSource(readJson(fixture("valid-b", "tokens.source.json"))),
  });
  assert.match(css, /--maivand-valid-b-color-text-primary:/);
});

/* -------------------------------------------------------------------------- */
/* Tailwind bridge                                                            */
/* -------------------------------------------------------------------------- */

test("renders the Tailwind bridge namespaces and static breakpoints", () => {
  const tw = renderTailwindCss({ uiClass: "maivand-valid-ui", resolvedTokens: resolvedValid() });
  assert.match(tw, /@theme inline \{/);
  const expected = [
    "--color-prism-text-primary: var(--maivand-valid-color-text-primary);",
    "--font-prism-sans: var(--maivand-valid-typography-family-sans);",
    "--text-prism-2xl: var(--maivand-valid-typography-size-2xl);",
    "--font-weight-prism-semibold: var(--maivand-valid-typography-weight-semibold);",
    "--leading-prism-tight: var(--maivand-valid-typography-line-height-tight);",
    "--tracking-prism-wide: var(--maivand-valid-typography-letter-spacing-wide);",
    "--spacing-prism-4: var(--maivand-valid-spacing-scale-4);",
    "--spacing-prism-inline: var(--maivand-valid-spacing-semantic-inline);",
    "--container-prism-content: var(--maivand-valid-containers-content);",
    "--radius-prism-md: var(--maivand-valid-radius-md);",
    "--shadow-prism-focus: var(--maivand-valid-shadow-focus);",
    "--ease-prism-standard: var(--maivand-valid-motion-easing-standard);",
  ];
  for (const entry of expected) {
    assert.ok(tw.includes(entry), `bridge is missing ${entry}`);
  }
  // Static breakpoints are literal under `@theme`, never `var()`.
  assert.match(tw, /@theme \{\n {2}--breakpoint-prism-sm: 40rem;/);
  assert.ok(!/--breakpoint-prism-[a-z]+:\s*var\(/.test(tw));
  // No invented duration/z namespaces; no Tailwind import.
  assert.ok(!/--duration-prism/.test(tw));
  assert.ok(!/--z-prism/.test(tw));
  assert.ok(!tw.includes('@import "tailwindcss"'));
});

/* -------------------------------------------------------------------------- */
/* Artifact descriptors                                                       */
/* -------------------------------------------------------------------------- */

test("buildTokenArtifactFiles returns the three artifacts in stable order", () => {
  const files = buildTokenArtifactFiles({
    tokensExport: "v4ValidTokens",
    uiClass: "maivand-valid-ui",
    resolvedTokens: resolvedValid(),
  });
  assert.deepEqual(
    files.map((file) => file.key),
    ["typescript", "css", "tailwind"],
  );
  assert.deepEqual(
    files.map((file) => file.relativePath),
    ["src/tokens/index.ts", "src/styles/tokens.css", "src/styles/tailwind.css"],
  );
  for (const file of files) assert.ok(file.content.length > 0);
});

/* -------------------------------------------------------------------------- */
/* Write / check integration                                                  */
/* -------------------------------------------------------------------------- */

test("V4 write emits all artifacts and repeated writes are byte-identical", async (t) => {
  const dir = tempCopy(fixture("valid"));
  cleanup(t, dir);

  await writeDesignSystemManifest({ id: "v4-valid", packageDir: dir });
  const paths = TOKEN_ARTIFACT_PATHS.map((artifact) => join(dir, artifact.relativePath));
  for (const path of paths) assert.ok(existsSync(path), `expected ${path}`);
  const firstBytes = paths.map((path) => readFileSync(path, "utf8"));
  const manifestPath = join(dir, "design-system.json");
  const firstManifest = readFileSync(manifestPath, "utf8");

  await writeDesignSystemManifest({ id: "v4-valid", packageDir: dir });
  assert.deepEqual(
    paths.map((path) => readFileSync(path, "utf8")),
    firstBytes,
  );
  assert.equal(readFileSync(manifestPath, "utf8"), firstManifest);

  const result = checkDesignSystemManifest({ id: "v4-valid", packageDir: dir });
  assert.equal(result.ok, true, result.failures.join("; "));
  assert.equal(result.tokenArtifacts.typescript.ok, true);
  assert.equal(result.tokenArtifacts.css.ok, true);
  assert.equal(result.tokenArtifacts.tailwind.ok, true);
});

test("V4 check reports missing and drifted token artifacts", async (t) => {
  const dir = tempCopy(fixture("valid"));
  cleanup(t, dir);
  await writeDesignSystemManifest({ id: "v4-valid", packageDir: dir });

  rmSync(join(dir, "src/styles/tokens.css"), { force: true });
  let result = checkDesignSystemManifest({ id: "v4-valid", packageDir: dir });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) =>
      /Missing generated token artifact src\/styles\/tokens\.css/.test(failure),
    ),
    result.failures.join("; "),
  );

  await writeDesignSystemManifest({ id: "v4-valid", packageDir: dir });
  const tsPath = join(dir, "src/tokens/index.ts");
  writeFileSync(tsPath, `${readFileSync(tsPath, "utf8")}// drifted\n`, "utf8");
  result = checkDesignSystemManifest({ id: "v4-valid", packageDir: dir });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) =>
      /Generated token artifact src\/tokens\/index\.ts is out of date/.test(failure),
    ),
    result.failures.join("; "),
  );
});

test("V4 valid-b also writes and checks cleanly", async (t) => {
  const dir = tempCopy(fixture("valid-b"));
  cleanup(t, dir);
  await writeDesignSystemManifest({ id: "v4-valid-b", packageDir: dir });
  assert.match(
    readFileSync(join(dir, "src/styles/tokens.css"), "utf8"),
    /--maivand-valid-b-color-text-primary:/,
  );
  assert.equal(checkDesignSystemManifest({ id: "v4-valid-b", packageDir: dir }).ok, true);
});

/* -------------------------------------------------------------------------- */
/* Runtime version helpers                                                    */
/* -------------------------------------------------------------------------- */

test("runtime version helpers read and synchronize defineDesignSystem", () => {
  const source = [
    'import { defineDesignSystem } from "@prism-system/ui-core";',
    "export const DesignSystem = defineDesignSystem({",
    '  id: "system-a",',
    '  version: "2.0.0",',
    "  contractVersion: 4,",
    "  components: {},",
    "});",
    "",
  ].join("\n");

  assert.equal(readRuntimeDesignSystemVersion(source), "2.0.0");
  const synced = syncRuntimeDesignSystemVersion(source, "2.1.0");
  assert.equal(synced.changed, true);
  assert.equal(readRuntimeDesignSystemVersion(synced.source), "2.1.0");
  assert.equal(syncRuntimeDesignSystemVersion(source, "2.0.0").changed, false);

  assert.throws(
    () => readRuntimeDesignSystemVersion('const other = { version: "1.0.0" };'),
    /does not call defineDesignSystem\(\.\.\.\)\./,
  );
});
