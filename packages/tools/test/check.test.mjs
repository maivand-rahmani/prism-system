#!/usr/bin/env node
/**
 * Tests for the offline `prism-ds check` report API.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/check.test.mjs
 *
 * Every case builds a real temporary consumer whose installed design system is
 * resolved through Node module resolution and read only through its public
 * `./manifest` export. The report is offline and read-only: several cases also
 * assert byte-for-byte that nothing on disk changed.
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { CONTRACT_VERSION } from "../src/constants.mjs";
import { CHECK_IDS, CHECK_STATUS, checkDesignSystem } from "../src/check.mjs";
import { currentManifest, readJson, repoRoot } from "./manifest-fixture.mjs";

const SYSTEM_A_MANIFEST = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
);

const PACKAGE_NAME = "@prism-system/ui-check";
const OTHER_PACKAGE = "@prism-system/ui-other";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFile(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

/** A safe package-relative target writable inside the package directory. */
function toWritableRelative(target) {
  if (typeof target !== "string") return null;
  if (!target.startsWith("./") || target.includes("..")) return null;
  return target.slice(2);
}

/**
 * Create a temporary consumer with an installed design system.
 *
 * @param {import("node:test").TestContext} t
 * @param {object} [options]
 */
function createConsumer(t, options = {}) {
  const {
    withConfig = true,
    includeManifestStyles = true,
    manifestStylesTarget = "./dist/index.css",
    includePackageStyles = true,
    packageStylesTarget = "./dist/index.css",
    stylesTargetExists = packageStylesTarget === "./dist/index.css",
    includeManifestTailwind = true,
    includePackageTailwind = true,
    manifestTailwindTarget = "./dist/tailwind.css",
    packageTailwindTarget = "./dist/tailwind.css",
    tailwindTargetExists = packageTailwindTarget === "./dist/tailwind.css",
    tailwind = null,
    tailwindDeclared = tailwind !== null,
    mutateManifest = null,
    files = {},
  } = options;

  const root = mkdtempSync(join(tmpdir(), "prism-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const packageName = PACKAGE_NAME;
  const version = "1.0.0";

  const manifest = structuredClone(SYSTEM_A_MANIFEST);
  manifest.package = packageName;
  manifest.version = version;
  manifest.id = "check";
  manifest.name = "Check";
  if (includeManifestStyles) manifest.exports["./styles.css"] = manifestStylesTarget;
  else delete manifest.exports["./styles.css"];
  if (includeManifestTailwind) manifest.exports["./tailwind.css"] = manifestTailwindTarget;
  else delete manifest.exports["./tailwind.css"];
  if (typeof mutateManifest === "function") mutateManifest(manifest);

  const dependencies = { [packageName]: version };
  if (tailwindDeclared) dependencies.tailwindcss = tailwind ?? "4.1.0";
  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    dependencies,
  });

  if (withConfig) {
    writeJson(join(root, ".design-system", "config.json"), {
      $schema:
        "https://github.com/maivand-rahmani/prism-system/schemas/design-system-consumer.schema.json",
      schemaVersion: 1,
      package: packageName,
      version,
      manifest: "./manifest",
      strict: true,
    });
  }

  const exportsMap = { "./manifest": "./design-system.json" };
  if (includePackageStyles) exportsMap["./styles.css"] = packageStylesTarget;
  if (includePackageTailwind) exportsMap["./tailwind.css"] = packageTailwindTarget;

  const systemDir = join(root, "node_modules", ...packageName.split("/"));
  writeJson(join(systemDir, "package.json"), {
    name: packageName,
    version,
    exports: exportsMap,
  });
  writeJson(join(systemDir, "design-system.json"), manifest);
  const stylesRelative = toWritableRelative(packageStylesTarget);
  if (stylesTargetExists && includePackageStyles && stylesRelative !== null) {
    writeFile(systemDir, stylesRelative, "/* styles */\n");
  }
  if (includePackageTailwind && tailwindTargetExists) {
    const tailwindRelative = toWritableRelative(packageTailwindTarget);
    if (tailwindRelative !== null) {
      writeFile(systemDir, tailwindRelative, "/* tailwind bridge */\n");
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

  for (const [relative, content] of Object.entries(files)) writeFile(root, relative, content);

  return { root, packageName, version, manifest };
}

function checkById(result, id) {
  return result.checks.find((check) => check.id === id);
}

function failedRequired(result) {
  return result.checks.filter((check) => check.required && check.status === CHECK_STATUS.FAILED);
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function snapshot(root) {
  return listFiles(root).map((file) => [file, readFileSync(file, "utf8")]);
}

function managedCss(packageName, extraLines = []) {
  return [
    '@import "tailwindcss";',
    `@import "${packageName}/tailwind.css";`,
    `@import "${packageName}/styles.css";`,
    ...extraLines,
    "",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Healthy consumers                                                          */
/* -------------------------------------------------------------------------- */

test("a connected consumer without Tailwind or CSS passes", (t) => {
  const { root } = createConsumer(t);

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, true, JSON.stringify(failedRequired(result)));
  assert.equal(result.contractVersion, CONTRACT_VERSION);
  assert.equal(result.package, PACKAGE_NAME);
  assert.equal(result.version, "1.0.0");
  assert.equal(result.status, CHECK_STATUS.PASSED);

  assert.equal(checkById(result, CHECK_IDS.config).status, CHECK_STATUS.PASSED);
  assert.equal(checkById(result, CHECK_IDS.doctor).status, CHECK_STATUS.PASSED);
  assert.equal(checkById(result, CHECK_IDS.stylesExport).status, CHECK_STATUS.PASSED);
  assert.equal(checkById(result, CHECK_IDS.tailwindBridge).status, CHECK_STATUS.PASSED);
  assert.equal(checkById(result, CHECK_IDS.tailwindPrerequisite).status, CHECK_STATUS.NOT_CHECKED);
  assert.equal(checkById(result, CHECK_IDS.cssImports).status, CHECK_STATUS.NOT_CHECKED);
  assert.equal(checkById(result, CHECK_IDS.usage).status, CHECK_STATUS.PASSED);
  assert.equal(checkById(result, CHECK_IDS.components).status, CHECK_STATUS.PASSED);
});

/* -------------------------------------------------------------------------- */
/* No CSS scanning by default                                                 */
/* -------------------------------------------------------------------------- */

test("default check never scans for a CSS file, even when several exist", (t) => {
  const { root } = createConsumer(t, {
    files: {
      "src/a.css": '@import "tailwindcss";\n',
      "src/b.css": '@import "something";\n',
      "app.css": "body { margin: 0; }\n",
    },
  });

  const before = snapshot(root);
  const result = checkDesignSystem({ cwd: root });
  const after = snapshot(root);

  const css = checkById(result, CHECK_IDS.cssImports);
  assert.equal(css.status, CHECK_STATUS.NOT_CHECKED);
  assert.match(css.detail, /does not scan/);
  assert.deepEqual(after, before, "check must not touch any file");
});

/* -------------------------------------------------------------------------- */
/* Tailwind prerequisite (Tailwind v4)                                            */
/* -------------------------------------------------------------------------- */

test("declared and installed Tailwind v4 passes the prerequisite", (t) => {
  const { root } = createConsumer(t, { tailwind: "4.1.0" });

  const result = checkDesignSystem({ cwd: root });

  const prerequisite = checkById(result, CHECK_IDS.tailwindPrerequisite);
  assert.equal(prerequisite.status, CHECK_STATUS.PASSED);
  assert.match(prerequisite.detail, /4\.1\.0/);
  assert.equal(result.ok, true, JSON.stringify(failedRequired(result)));
});

test("declared but not installed Tailwind fails", (t) => {
  const { root } = createConsumer(t, { tailwind: null, tailwindDeclared: true });

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, false);
  const prerequisite = checkById(result, CHECK_IDS.tailwindPrerequisite);
  assert.equal(prerequisite.status, CHECK_STATUS.FAILED);
  assert.match(prerequisite.detail, /not installed/);
});

test("an installed non-v4 Tailwind fails", (t) => {
  const { root } = createConsumer(t, { tailwind: "3.4.0" });

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, false);
  const prerequisite = checkById(result, CHECK_IDS.tailwindPrerequisite);
  assert.equal(prerequisite.status, CHECK_STATUS.FAILED);
  assert.match(prerequisite.detail, /requires Tailwind CSS v4/);
});

/* -------------------------------------------------------------------------- */
/* Stylesheet public export                                                   */
/* -------------------------------------------------------------------------- */

test("a manifest without ./styles.css fails the stylesheet export check", (t) => {
  const { root } = createConsumer(t, { includeManifestStyles: false });

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, false);
  const styles = checkById(result, CHECK_IDS.stylesExport);
  assert.equal(styles.status, CHECK_STATUS.FAILED);
  assert.match(styles.detail, /does not advertise/);
});

test("a package ./styles.css export mismatching the manifest fails", (t) => {
  const { root } = createConsumer(t, {
    manifestStylesTarget: "./dist/index.css",
    packageStylesTarget: "./dist/other.css",
    stylesTargetExists: true,
  });

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, false);
  const styles = checkById(result, CHECK_IDS.stylesExport);
  assert.equal(styles.status, CHECK_STATUS.FAILED);
  assert.match(styles.detail, /must expose/);
});

test("a ./styles.css target escaping the package fails", (t) => {
  const { root } = createConsumer(t, {
    manifestStylesTarget: "./../outside.css",
    packageStylesTarget: "./../outside.css",
    stylesTargetExists: false,
  });

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, false);
  const styles = checkById(result, CHECK_IDS.stylesExport);
  assert.equal(styles.status, CHECK_STATUS.FAILED);
  assert.match(styles.detail, /escapes/);
});

/* -------------------------------------------------------------------------- */
/* Config and usage failures                                                  */
/* -------------------------------------------------------------------------- */

test("a missing consumer config fails check with a connect hint", (t) => {
  const { root } = createConsumer(t, { withConfig: false });

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, false);
  const config = checkById(result, CHECK_IDS.config);
  assert.equal(config.status, CHECK_STATUS.FAILED);
  assert.match(config.detail, /prism-ds connect/);
  // Doctor still treats absent config as informational, so it can pass.
  assert.equal(checkById(result, CHECK_IDS.doctor).status, CHECK_STATUS.PASSED);
});

test("strict usage findings fail check", (t) => {
  const { root } = createConsumer(t, {
    files: {
      "src/app.tsx":
        "export function Button() {\n  return null;\n}\n\nexport function Heading() {\n  return null;\n}\n",
    },
  });

  const result = checkDesignSystem({ cwd: root });

  assert.equal(result.ok, false);
  const usage = checkById(result, CHECK_IDS.usage);
  assert.equal(usage.status, CHECK_STATUS.FAILED);
  assert.ok(usage.report.errors > 0, "strict findings are errors");
});

/* -------------------------------------------------------------------------- */
/* Component availability                                                     */
/* -------------------------------------------------------------------------- */

test("required components pass and an absent optional is not a failure", (t) => {
  const { root } = createConsumer(t);

  const result = checkDesignSystem({ cwd: root });

  const components = checkById(result, CHECK_IDS.components);
  assert.equal(components.status, CHECK_STATUS.PASSED);
  assert.equal(result.ok, true);
  assert.ok(
    components.report.components.every((component) => !component.required || component.available),
    "all required components are available",
  );
  assert.ok(
    components.report.unavailable.includes("Skeleton"),
    "an undeclared optional is reported unavailable, not failed",
  );
});

/* -------------------------------------------------------------------------- */
/* Explicit CSS import order (dry run only)                                   */
/* -------------------------------------------------------------------------- */

test("an explicitly checked, correctly ordered CSS file passes unchanged", (t) => {
  const { root } = createConsumer(t, {
    tailwind: "4.1.0",
    files: { "src/app.css": managedCss(PACKAGE_NAME, ["body { margin: 0; }"]) },
  });
  const cssPath = join(root, "src", "app.css");
  const before = readFileSync(cssPath, "utf8");

  const result = checkDesignSystem({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, true, JSON.stringify(failedRequired(result)));
  assert.equal(checkById(result, CHECK_IDS.cssImports).status, CHECK_STATUS.PASSED);
  assert.equal(readFileSync(cssPath, "utf8"), before, "check must not rewrite the CSS file");
});

test("missing and reordered CSS imports fail without changing bytes", (t) => {
  const cases = [
    { name: "missing", css: "body { margin: 0; }\n" },
    {
      name: "reordered",
      css:
        `@import "${PACKAGE_NAME}/styles.css";\n` +
        '@import "tailwindcss";\n' +
        `@import "${PACKAGE_NAME}/tailwind.css";\n`,
    },
  ];

  for (const item of cases) {
    const { root } = createConsumer(t, {
      tailwind: "4.1.0",
      files: { "src/app.css": item.css },
    });
    const cssPath = join(root, "src", "app.css");
    const before = readFileSync(cssPath, "utf8");

    const result = checkDesignSystem({ cwd: root, cssPath: "src/app.css" });

    assert.equal(result.ok, false, `${item.name} should fail`);
    const css = checkById(result, CHECK_IDS.cssImports);
    assert.equal(css.status, CHECK_STATUS.FAILED);
    assert.match(css.detail, /adding or reordering/);
    assert.equal(readFileSync(cssPath, "utf8"), before, `${item.name} must not write`);
  }
});

test("a conflicting second design-system bridge fails", (t) => {
  const { root } = createConsumer(t, {
    tailwind: "4.1.0",
    files: { "src/app.css": `@import "${OTHER_PACKAGE}/tailwind.css";\n` },
  });
  const cssPath = join(root, "src", "app.css");
  const before = readFileSync(cssPath, "utf8");

  const result = checkDesignSystem({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  const css = checkById(result, CHECK_IDS.cssImports);
  assert.equal(css.status, CHECK_STATUS.FAILED);
  assert.match(css.detail, /only one design-system bridge/);
  assert.equal(readFileSync(cssPath, "utf8"), before);
});

/* -------------------------------------------------------------------------- */
/* Containment, no writes, no network                                         */
/* -------------------------------------------------------------------------- */

test("check never writes anywhere and never reaches the network", (t) => {
  const { root } = createConsumer(t, {
    tailwind: "4.1.0",
    files: { "src/app.css": managedCss(PACKAGE_NAME) },
  });
  const before = snapshot(root);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network must not be used by check");
  };
  let result;
  try {
    result = checkDesignSystem({ cwd: root });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.ok, true, JSON.stringify(failedRequired(result)));
  assert.deepEqual(snapshot(root), before, "check must not write inside the consumer");
  assert.ok(existsSync(join(root, "src", "app.css")));
});

test("an explicit cssPath outside the consumer root fails and is never touched", (t) => {
  const outsideDir = mkdtempSync(join(tmpdir(), "prism-check-outside-"));
  t.after(() =>
    rmSync(outsideDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }),
  );
  const outsideFile = writeFile(outsideDir, "app.css", managedCss(PACKAGE_NAME));

  const { root } = createConsumer(t, { tailwind: "4.1.0" });
  const before = snapshot(root);
  const outsideBefore = readFileSync(outsideFile, "utf8");

  const result = checkDesignSystem({ cwd: root, cssPath: outsideFile });

  assert.equal(result.ok, false);
  const css = checkById(result, CHECK_IDS.cssImports);
  assert.equal(css.status, CHECK_STATUS.FAILED);
  assert.match(css.detail, /escapes/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(readFileSync(outsideFile, "utf8"), outsideBefore);
});
