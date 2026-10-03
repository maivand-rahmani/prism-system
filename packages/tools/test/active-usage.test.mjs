#!/usr/bin/env node
/**
 * Standalone tests for active design-system API usage scanning.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/active-usage.test.mjs
 *
 * Everything is offline and in-memory on disposable temp consumers: no design
 * system package is installed, no network is used, and nothing is executed.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  ACTIVE_USAGE_LIMITATIONS,
  buildTokenIndex,
  collectActiveSourceFiles,
  scanActiveUsage,
} from "../src/active-usage.mjs";
import { syntheticManifest } from "./manifest-fixture.mjs";

const PACKAGE = "@prism-system/ui-scan";

function scannerManifest() {
  const manifest = syntheticManifest({ id: "scan", version: "1.0.0", packageName: PACKAGE });
  manifest.components.Button = {
    variants: ["primary", "secondary"],
    sizes: ["sm", "md"],
    members: [],
  };
  manifest.components.Alert = { variants: ["info"], sizes: [], members: ["Title", "Description"] };
  manifest.tokens.names = { cssVariablePrefix: "maivand", tailwindUtilityPrefix: "prism" };
  manifest.tokens.groups.spacing = ["scale.4"];
  manifest.tokens.groups.themes = ["light.color.text.primary"];
  manifest.publicApi = { ".": ["Button", "Alert"], "./tokens": [] };
  return manifest;
}

function createConsumer(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-active-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  return root;
}

test("scan detects module references, aliases, JSX props, members, and known tokens", (t) => {
  const root = createConsumer(t, {
    "src/app.tsx": [
      'import { Button as B, Alert } from "@prism-system/ui-scan";',
      'import * as DS from "@prism-system/ui-scan";',
      'import "unrelated-package";',
      'import { local } from "./local";',
      "export function App() {",
      "  return (",
      "    <div>",
      '      <B variant="primary" size="sm" />',
      '      <DS.Button variant="secondary" />',
      "      <Alert>",
      "        <Alert.Title />",
      "      </Alert>",
      '      <Unrelated variant="whatever" />',
      '      <div className="text-prism-text-primary p-prism-4" style={{ color: "var(--maivand-color-text-primary)" }} />',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n"),
  });

  const usage = scanActiveUsage({
    consumerRoot: root,
    packageName: PACKAGE,
    manifest: scannerManifest(),
  });

  assert.deepEqual(usage.files, ["src/app.tsx"]);
  assert.equal(usage.counts.moduleReferences, 2);
  assert.equal(usage.counts.components, 3, JSON.stringify(usage.components));
  assert.deepEqual(
    usage.components.map((site) => site.name),
    ["Button", "Button", "Alert"],
  );
  assert.deepEqual(
    usage.variants.map((site) => [site.component, site.value]),
    [
      ["Button", "primary"],
      ["Button", "secondary"],
    ],
  );
  assert.deepEqual(
    usage.sizes.map((site) => [site.component, site.value]),
    [["Button", "sm"]],
  );
  assert.deepEqual(
    usage.members.map((site) => [site.component, site.member]),
    [["Alert", "Title"]],
  );
  assert.deepEqual(usage.unverified, []);
  assert.deepEqual(
    usage.tokenReferences.map((reference) => [reference.kind, reference.raw, reference.name]),
    [
      ["tailwind-utility", "text-prism-text-primary", "color.text.primary"],
      ["tailwind-utility", "p-prism-4", "spacing.scale.4"],
      ["css-var", "--maivand-color-text-primary", "color.text.primary"],
    ],
  );
  assert.equal(usage.limitations, ACTIVE_USAGE_LIMITATIONS);
  // The unrelated import/component is never flagged.
  assert.ok(!JSON.stringify(usage.components).includes("Unrelated"));
});

test("scan plans only exact package-prefix rewrites when a target package is given", (t) => {
  const root = createConsumer(t, {
    "src/app.tsx": [
      'import { Button } from "@prism-system/ui-scan";',
      'const lazy = () => import("@prism-system/ui-scan/tokens");',
      "",
    ].join("\n"),
  });
  const usage = scanActiveUsage({
    consumerRoot: root,
    packageName: PACKAGE,
    manifest: scannerManifest(),
    targetPackage: "@prism-system/ui-other",
  });

  assert.equal(usage.rewrites.length, 1);
  const [rewrite] = usage.rewrites;
  assert.equal(rewrite.kind, "source");
  assert.equal(rewrite.path, join(root, "src", "app.tsx"));
  assert.match(rewrite.after, /import \{ Button \} from "@prism-system\/ui-other";/);
  assert.match(rewrite.after, /import\("@prism-system\/ui-other\/tokens"\)/);
  assert.ok(!rewrite.after.includes(PACKAGE));
  assert.equal(rewrite.edits.length, 2);
});

test("scan reports dynamic and computed package usage as unverified", (t) => {
  const root = createConsumer(t, {
    "src/dynamic.tsx": [
      'import { Button } from "@prism-system/ui-scan";',
      'const name = "Button";',
      "const mod = import(`@prism-system/ui-scan/${name}`);",
      "const req = require(`@prism-system/ui-scan/${name}`);",
      "export const X = <Button variant={name} {...props} />;",
      "",
    ].join("\n"),
  });
  const usage = scanActiveUsage({
    consumerRoot: root,
    packageName: PACKAGE,
    manifest: scannerManifest(),
  });

  const codes = usage.unverified.map((item) => item.code).sort();
  assert.deepEqual(codes, ["dynamic-module", "dynamic-module", "dynamic-variant", "spread-props"]);
  for (const item of usage.unverified) {
    assert.equal(item.file, "src/dynamic.tsx");
    assert.ok(item.line >= 1);
  }
  // Unrelated computed imports are not attributed to the package.
  const unrelated = createConsumer(t, {
    "src/other.tsx": ['const name = "x";', "const mod = import(`./local/${name}`);", ""].join("\n"),
  });
  const other = scanActiveUsage({
    consumerRoot: unrelated,
    packageName: PACKAGE,
    manifest: scannerManifest(),
  });
  assert.deepEqual(other.unverified, []);
});

test("scan without a manifest still detects literal module references only", (t) => {
  const root = createConsumer(t, {
    "src/app.ts": [
      'import { Button } from "@prism-system/ui-scan";',
      "export const x = Button;",
      "",
    ].join("\n"),
  });
  const usage = scanActiveUsage({ consumerRoot: root, packageName: PACKAGE, manifest: null });
  assert.equal(usage.counts.moduleReferences, 1);
  assert.equal(usage.moduleReferences[0].declared, false);
  assert.equal(usage.components.length, 0);
  assert.equal(usage.tokensAvailable, false);
});

test("scan skips build output, declaration files, and unknown token names", (t) => {
  const root = createConsumer(t, {
    "src/app.ts": ['export const x = "var(--not-a-token)";', ""].join("\n"),
    "dist/bundle.js": 'import "@prism-system/ui-scan";\n',
    "node_modules/pkg/index.js": 'import "@prism-system/ui-scan";\n',
    "src/types.d.ts": 'import "@prism-system/ui-scan";\n',
    "src/app.generated.ts": 'import "@prism-system/ui-scan";\n',
  });
  const usage = scanActiveUsage({
    consumerRoot: root,
    packageName: PACKAGE,
    manifest: scannerManifest(),
  });
  assert.deepEqual(usage.files, ["src/app.ts"]);
  assert.equal(usage.counts.moduleReferences, 0);
  assert.equal(usage.tokenReferences.length, 0);
});

test("scan reads one explicit CSS file and ignores guessed ones", (t) => {
  const root = createConsumer(t, {
    "src/app.css": [
      "/* user */",
      "body { margin: 0; }",
      '@import "@prism-system/ui-scan/tailwind.css";',
      '@import "@prism-system/ui-scan/styles.css";',
      '@import "tailwindcss";',
      ".x { color: var(--maivand-color-text-primary); }",
      "",
    ].join("\n"),
    "other/ignored.css": '@import "@prism-system/ui-scan/tailwind.css";\n',
  });
  const usage = scanActiveUsage({
    consumerRoot: root,
    packageName: PACKAGE,
    manifest: scannerManifest(),
    cssPath: "src/app.css",
  });
  assert.equal(usage.cssFile.relativePath, "src/app.css");
  assert.deepEqual(
    usage.cssFile.imports.map((reference) => reference.specifier),
    [`${PACKAGE}/tailwind.css`, `${PACKAGE}/styles.css`],
  );
  assert.equal(
    usage.cssFile.imports.every((reference) => reference.css === true),
    true,
  );
  assert.equal(usage.counts.cssImports, 2);
  assert.deepEqual(
    usage.cssFile.tokenReferences.map((reference) => reference.raw),
    ["--maivand-color-text-primary"],
  );
  // The unlisted CSS file was never read.
  assert.ok(!JSON.stringify(usage.moduleReferences).includes("other/ignored.css"));
});

test("collectActiveSourceFiles honors ignore globs and reports oversized files", (t) => {
  const root = createConsumer(t, {
    "src/keep.ts": "export {};\n",
    "src/skip.test.ts": "export {};\n",
    "big/huge.ts": "x".repeat(1024 * 1024 + 1),
  });
  const collected = collectActiveSourceFiles({
    consumerRoot: root,
    ignoreGlobs: ["src/skip.test.ts"],
  });
  assert.deepEqual(
    collected.files.map((file) =>
      file
        .slice(root.length + 1)
        .split("\\")
        .join("/"),
    ),
    ["src/keep.ts"],
  );
  assert.deepEqual(
    collected.skipped.map((entry) =>
      entry.path
        .slice(root.length + 1)
        .split("\\")
        .join("/"),
    ),
    ["big/huge.ts"],
  );
  const usage = scanActiveUsage({
    consumerRoot: root,
    packageName: PACKAGE,
    manifest: scannerManifest(),
    ignoreGlobs: ["src/skip.test.ts"],
  });
  assert.deepEqual(usage.skipped, [{ path: "big/huge.ts", reason: "oversized" }]);
  assert.deepEqual(usage.files, ["src/keep.ts"]);
});

test("unsupported framework files that reference the package are unverified", (t) => {
  const root = createConsumer(t, {
    "src/App.vue": [
      "<template><Button /></template>",
      `<script>import { Button } from "${PACKAGE}";</script>`,
      "",
    ].join("\n"),
    "src/Other.svelte": "<div>unrelated</div>\n",
  });
  const usage = scanActiveUsage({
    consumerRoot: root,
    packageName: PACKAGE,
    manifest: scannerManifest(),
  });
  assert.deepEqual(usage.unsupportedFiles, ["src/App.vue", "src/Other.svelte"]);
  assert.deepEqual(
    usage.unverified.map((item) => item.code),
    ["unsupported-source-file"],
  );
  assert.equal(usage.unverified[0].file, "src/App.vue");
  assert.equal(usage.counts.unsupportedFiles, 2);
});

test("buildTokenIndex maps semantic names, CSS variables, and Tailwind utilities", () => {
  const index = buildTokenIndex(scannerManifest());
  assert.ok(index !== null);
  assert.equal(index.byName.get("color.text.primary").cssVariable, "--maivand-color-text-primary");
  assert.equal(index.byVariable.get("--maivand-color-text-primary").name, "color.text.primary");
  assert.equal(index.byUtility.get("p-prism-4").name, "spacing.scale.4");
  assert.equal(buildTokenIndex({ schemaVersion: 5 }), null);
});
