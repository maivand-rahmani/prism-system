#!/usr/bin/env node
/**
 * Standalone tests for the offline Tailwind v4 setup helper.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/tailwind-setup.test.mjs
 *
 * These exercise the exported `planTailwindSetup` / `setupTailwind` /
 * `mergeBridgeImports` helpers against real temporary consumer fixtures: a
 * connected `.design-system/config.json`, an installed V4 design system, and an
 * installed Tailwind package. Nothing is installed and nothing is run.
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { mergeBridgeImports, setupTailwind } from "../src/tailwind-setup.mjs";

const PACKAGE_NAME = "@prism-system/ui-system-a";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCss(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

/**
 * Create a temporary consumer fixture.
 *
 * @param {import("node:test").TestContext} t
 * @param {object} [options]
 */
function createConsumer(t, options = {}) {
  const {
    systemVersion = "1.0.0",
    configVersion = "1.0.0",
    contract = "v4",
    schemaVersion = 2,
    tailwind = "4.1.0",
    tailwindWithExports = true,
    omitTailwindExport = false,
    omitStylesExport = false,
    conditionalTailwindExport = false,
    tailwindTargetExists = true,
    stylesTargetExists = true,
    withConfig = true,
    extraDependency = null,
  } = options;

  const root = mkdtempSync(join(tmpdir(), "prism-twsetup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const dependencies = { [PACKAGE_NAME]: systemVersion };
  if (tailwind !== null) dependencies.tailwindcss = tailwind;
  if (extraDependency) dependencies[extraDependency] = "1.0.0";
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
      package: PACKAGE_NAME,
      version: configVersion,
      manifest: "./manifest",
      strict: true,
    });
  }

  const systemDir = join(root, "node_modules", ...PACKAGE_NAME.split("/"));
  const exportsMap = { "./manifest": "./design-system.json" };
  if (!omitTailwindExport) {
    exportsMap["./tailwind.css"] = conditionalTailwindExport
      ? { import: "./dist/tailwind.css" }
      : "./dist/tailwind.css";
  }
  if (!omitStylesExport) exportsMap["./styles.css"] = "./dist/index.css";
  writeJson(join(systemDir, "package.json"), {
    name: PACKAGE_NAME,
    version: systemVersion,
    exports: exportsMap,
  });
  writeJson(join(systemDir, "design-system.json"), {
    $schema: "https://github.com/maivand-rahmani/prism-system/schemas/design-system-v4.schema.json",
    schemaVersion,
    generated: "prism-system/design-system-manifest",
    contract,
    package: PACKAGE_NAME,
    version: systemVersion,
  });
  if (tailwindTargetExists && !omitTailwindExport) {
    mkdirSync(join(systemDir, "dist"), { recursive: true });
    writeFileSync(join(systemDir, "dist", "tailwind.css"), "/* tailwind bridge */\n", "utf8");
  }
  if (stylesTargetExists && !omitStylesExport) {
    mkdirSync(join(systemDir, "dist"), { recursive: true });
    writeFileSync(join(systemDir, "dist", "index.css"), "/* styles */\n", "utf8");
  }

  if (tailwind !== null) {
    const tailwindDir = join(root, "node_modules", "tailwindcss");
    writeJson(join(tailwindDir, "package.json"), {
      name: "tailwindcss",
      version: tailwind,
      ...(tailwindWithExports
        ? { exports: { ".": "./index.css", "./package.json": "./package.json" } }
        : {}),
    });
    writeFileSync(join(tailwindDir, "index.css"), "/* tailwind */\n", "utf8");
  }

  return { root, packageName: PACKAGE_NAME };
}

const MANAGED_BLOCK =
  '@import "tailwindcss";\n' +
  `@import "${PACKAGE_NAME}/tailwind.css";\n` +
  `@import "${PACKAGE_NAME}/styles.css";\n`;

function managedOrder(content) {
  const tailwind = content.indexOf('@import "tailwindcss";');
  const bridge = content.indexOf(`@import "${PACKAGE_NAME}/tailwind.css";`);
  const styles = content.indexOf(`@import "${PACKAGE_NAME}/styles.css";`);
  return {
    tailwind,
    bridge,
    styles,
    ordered: tailwind !== -1 && tailwind < bridge && bridge < styles,
  };
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
  return out;
}

function snapshot(root) {
  const map = new Map();
  for (const file of listFiles(root)) map.set(file, readFileSync(file, "utf8"));
  return map;
}

test("setup writes the three imports in order and preserves unrelated CSS", (t) => {
  const { root } = createConsumer(t);
  const cssPath = writeCss(
    root,
    join("src", "app.css"),
    ["/* product styles */", '@import "./fonts.css";', "body { color: red; }", ""].join("\n"),
  );

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.changed, true);
  assert.deepEqual(result.changes, [{ kind: "css", path: cssPath }]);

  const content = readFileSync(cssPath, "utf8");
  const order = managedOrder(content);
  assert.equal(order.ordered, true, content);
  assert.ok(content.includes(MANAGED_BLOCK), content);
  assert.ok(content.includes("/* product styles */"));
  assert.ok(content.includes('@import "./fonts.css";'));
  assert.ok(content.includes("body { color: red; }"));
});

test("re-running setup is byte-stable and reports no change", (t) => {
  const { root } = createConsumer(t);
  const cssPath = writeCss(
    root,
    join("src", "app.css"),
    `@import "${PACKAGE_NAME}/styles.css";\n@import "./unrelated.css";\n@import "${PACKAGE_NAME}/tailwind.css";\n`,
  );

  const first = setupTailwind({ cwd: root, cssPath: "src/app.css" });
  assert.equal(first.ok, true, first.failures.join(" "));
  const afterFirst = readFileSync(cssPath);

  const second = setupTailwind({ cwd: root, cssPath: "src/app.css" });
  assert.equal(second.ok, true, second.failures.join(" "));
  assert.equal(second.changed, false);
  const afterSecond = readFileSync(cssPath);

  assert.deepEqual(afterSecond, afterFirst);
  assert.ok(afterFirst.toString("utf8").includes(MANAGED_BLOCK));
});

test("dry-run plans the change but leaves bytes unchanged", (t) => {
  const { root } = createConsumer(t);
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css", dryRun: true });

  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.changes, [{ kind: "css", path: cssPath }]);
  assert.notEqual(result.plan.before, result.plan.after);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("non-v4 Tailwind fails closed without writing", (t) => {
  const { root } = createConsumer(t, { tailwind: "3.4.0" });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /requires Tailwind CSS v4/);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("missing Tailwind fails closed without writing", (t) => {
  const { root } = createConsumer(t, { tailwind: null });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /tailwindcss.*not installed/i);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("missing bridge export target fails closed without writing", (t) => {
  const { root } = createConsumer(t, { tailwindTargetExists: false });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /does not exist/);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("an absent bridge export subpath fails closed without writing", (t) => {
  const { root } = createConsumer(t, { omitTailwindExport: true });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /does not expose "\.\/tailwind\.css"/);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("a conditional export target fails closed (ambiguous format)", (t) => {
  const { root } = createConsumer(t, { conditionalTailwindExport: true });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /single relative string target/);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("a non-V4 design system fails closed without writing", (t) => {
  const { root } = createConsumer(t, { contract: "v2", schemaVersion: 1 });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /must be "v4"/);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("only the selected CSS file changes", (t) => {
  const { root } = createConsumer(t);
  const selected = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  writeCss(root, join("src", "other.css"), '@import "./nothing.css";\n');
  writeFileSync(join(root, "README.md"), "# Consumer\n", "utf8");

  const before = snapshot(root);
  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });
  const after = snapshot(root);

  assert.equal(result.ok, true, result.failures.join(" "));
  const changed = [...after.keys()].filter((file) => before.get(file) !== after.get(file));
  assert.deepEqual(changed, [selected]);
  assert.equal(before.size, after.size);
});

test("a traversal CSS path is rejected without writing", (t) => {
  const { root } = createConsumer(t);
  const outside = join(root, "..", `prism-tw-outside-${process.pid}.css`);

  const result = setupTailwind({ cwd: root, cssPath: "../prism-tw-outside.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /escapes/);
  assert.equal(existsSync(outside), false);
});

test("a symlink escaping the consumer root is rejected without writing", (t) => {
  const { root } = createConsumer(t);
  const outsideDir = mkdtempSync(join(tmpdir(), "prism-twsetup-outside-"));
  t.after(() => rmSync(outsideDir, { recursive: true, force: true }));
  const outsideFile = join(outsideDir, "outside.css");
  writeFileSync(outsideFile, "/* outside */\n", "utf8");

  const linkPath = join(root, "src", "linked.css");
  mkdirSync(dirname(linkPath), { recursive: true });
  try {
    symlinkSync(outsideFile, linkPath, "file");
  } catch {
    t.skip("file symlinks are not available in this environment");
    return;
  }

  const before = readFileSync(outsideFile);
  const result = setupTailwind({ cwd: root, cssPath: "src/linked.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /escapes/);
  assert.deepEqual(readFileSync(outsideFile), before);
});

test("a conflicting second bridge fails closed and is not retained silently", (t) => {
  const { root } = createConsumer(t);
  const conflicting = '@import "@prism-system/ui-system-b/tailwind.css";\n';
  const cssPath = writeCss(root, join("src", "app.css"), `${conflicting}body { margin: 0; }\n`);
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /one design-system bridge is supported/);
  // The conflicting bridge stays (we refused) and nothing was rewritten.
  assert.deepEqual(readFileSync(cssPath), before);
  assert.ok(readFileSync(cssPath, "utf8").includes(conflicting));
});

test("a uniquely identified dependency works without a consumer config", (t) => {
  const { root } = createConsumer(t, { withConfig: false });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.plan.packageName, PACKAGE_NAME);
  assert.equal(managedOrder(readFileSync(cssPath, "utf8")).ordered, true);
});

test("ambiguous dependency discovery fails closed without writing", (t) => {
  const { root } = createConsumer(t, {
    withConfig: false,
    extraDependency: "@prism-system/ui-system-b",
  });
  const cssPath = writeCss(root, join("src", "app.css"), "body { margin: 0; }\n");
  const before = readFileSync(cssPath);

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /Multiple supported/);
  assert.deepEqual(readFileSync(cssPath), before);
});

test("a missing CSS file is rejected", (t) => {
  const { root } = createConsumer(t);

  const result = setupTailwind({ cwd: root, cssPath: "src/missing.css" });

  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /does not exist/);
});

test("CRLF line endings and unrelated imports are preserved", (t) => {
  const { root } = createConsumer(t);
  const cssPath = writeCss(
    root,
    join("src", "app.css"),
    ['@import "./a.css";', "body {", "  margin: 0;", "}", ""].join("\r\n"),
  );

  const result = setupTailwind({ cwd: root, cssPath: "src/app.css" });

  assert.equal(result.ok, true, result.failures.join(" "));
  const content = readFileSync(cssPath, "utf8");
  assert.ok(content.includes('@import "tailwindcss";\r\n'));
  assert.ok(content.includes('@import "./a.css";'));
  assert.ok(content.endsWith("}\r\n"));
});

test("mergeBridgeImports is a pure, deterministic transform", () => {
  const once = mergeBridgeImports("body {}\n", { packageName: PACKAGE_NAME });
  const twice = mergeBridgeImports(once, { packageName: PACKAGE_NAME });
  assert.equal(once, twice);
  assert.ok(once.startsWith(MANAGED_BLOCK));
  assert.throws(
    () =>
      mergeBridgeImports('@import "@prism-system/ui-system-b/styles.css";\n', {
        packageName: PACKAGE_NAME,
      }),
    /one design-system bridge is supported/,
  );
});
