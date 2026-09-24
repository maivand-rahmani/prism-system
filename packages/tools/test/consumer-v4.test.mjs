#!/usr/bin/env node
/**
 * V4 compatibility tests for the published consumer lifecycle.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/consumer-v4.test.mjs
 *
 * These exercise `connect` / `verify` / `check-usage` / `doctor` against real
 * temporary consumer packages whose installed design system is resolved through
 * Node module resolution and read only through its public `./manifest` export.
 * Repository fixtures are read as JSON data and never mutated; every write
 * happens inside a fresh temp consumer root.
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
import { dirname, join, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { V4_OPTIONAL_COMPONENTS, V4_REQUIRED_COMPONENTS } from "../src/constants.mjs";
import {
  connectDesignSystem,
  planConnect,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "../src/consumer.mjs";
import { collectDoctorReport } from "../src/doctor.mjs";
import { checkSourceText, checkUsage, componentNamesForManifest } from "../src/usage.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..", "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const SYSTEM_A_MANIFEST = readJson(join(repoRoot, "packages", "system-a", "design-system.json"));
const V2_MANIFEST = readJson(
  join(repoRoot, "schemas", "fixtures", "v2-valid", "design-system.json"),
);

const STRICT_RULES = Object.freeze({
  allowArbitraryColors: false,
  allowArbitraryRadius: false,
  allowArbitraryShadows: false,
  allowPrimitiveDuplication: false,
});

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

/**
 * Create a real temporary consumer with an installed design system.
 *
 * The installed package is discovered through Node module resolution and read
 * only through its public `./manifest` export (never package internals).
 */
function createConsumer(t, options = {}) {
  const {
    contract = "v4",
    version: requestedVersion = null,
    includeManifestTailwind = true,
    includePackageTailwind = true,
    manifestTailwindTarget = "./dist/tailwind.css",
    packageTailwindTarget = "./dist/tailwind.css",
    tailwindTargetExists = packageTailwindTarget === "./dist/tailwind.css",
    withConfig = false,
    mutateManifest = null,
    files = {},
  } = options;

  const root = mkdtempSync(join(tmpdir(), "prism-consumer-v4-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const isV4 = contract !== "v2";
  const packageName = isV4 ? "@prism-system/ui-v4-bridge" : "@prism-system/ui-v2-valid";
  const version = requestedVersion ?? (isV4 ? "1.0.0" : "1.1.0");

  const manifest = structuredClone(isV4 ? SYSTEM_A_MANIFEST : V2_MANIFEST);
  manifest.package = packageName;
  manifest.version = version;
  if (isV4) {
    manifest.id = "v4-bridge";
    manifest.name = "V4 Bridge";
    if (includeManifestTailwind) manifest.exports["./tailwind.css"] = manifestTailwindTarget;
    else delete manifest.exports["./tailwind.css"];
  }
  if (typeof mutateManifest === "function") mutateManifest(manifest);

  writeJson(join(root, "package.json"), {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    dependencies: { [packageName]: version },
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
  if (isV4) {
    exportsMap["./styles.css"] = "./dist/index.css";
    if (includePackageTailwind) exportsMap["./tailwind.css"] = packageTailwindTarget;
  }

  const systemDir = join(root, "node_modules", ...packageName.split("/"));
  writeJson(join(systemDir, "package.json"), {
    name: packageName,
    version,
    exports: exportsMap,
  });
  writeJson(join(systemDir, "design-system.json"), manifest);
  if (isV4) {
    writeFile(systemDir, "dist/index.css", "/* styles */\n");
    if (tailwindTargetExists) {
      const relativeTarget =
        manifestTailwindTarget.startsWith("./") && !manifestTailwindTarget.includes("..")
          ? manifestTailwindTarget.slice(2)
          : "dist/tailwind.css";
      writeFile(systemDir, relativeTarget, "/* tailwind bridge */\n");
    }
  }
  for (const [relative, content] of Object.entries(files)) writeFile(root, relative, content);

  return { root, packageName, version, manifest, systemDir };
}

function failedChecks(report) {
  return report.checks.filter((check) => !check.ok);
}

function tokenSet(findings) {
  return new Set(findings.map((finding) => finding.token));
}

/* -------------------------------------------------------------------------- */
/* V2 stays compatible                                                        */
/* -------------------------------------------------------------------------- */

test("V2 connect, verify, and doctor succeed without any Tailwind bridge", (t) => {
  const { root, packageName, version } = createConsumer(t, { contract: "v2" });

  const installed = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
  const verified = verifyConsumerDesignSystem({ packageName, expectedVersion: null, installed });
  assert.equal(verified.contract, "v2");
  assert.equal(verified.version, version);

  const result = connectDesignSystem({ cwd: root });
  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.changed, true);

  const config = readJson(join(root, ".design-system", "config.json"));
  assert.equal(config.package, packageName);
  assert.equal(config.version, version);

  const agents = readFileSync(join(root, ".design-system", "AGENTS.md"), "utf8");
  assert.ok(agents.includes("- Contract: `v2`"), agents);
  assert.ok(!agents.includes("/tailwind.css"), "V2 instructions must not claim a Tailwind bridge");

  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, true, JSON.stringify(failedChecks(doctor)));
  assert.equal(
    doctor.checks.some((check) => check.label === "tailwind bridge"),
    false,
    "V2 doctor must not require a Tailwind bridge",
  );

  const recheck = connectDesignSystem({ cwd: root, check: true });
  assert.equal(recheck.ok, true);
  assert.equal(recheck.changed, false, "a connected V2 consumer is idempotent");
});

test("V2 usage keeps the fourteen-name duplication set", (t) => {
  const { root } = createConsumer(t, {
    contract: "v2",
    files: {
      "src/app.ts":
        "export function Button() {\n  return null;\n}\n\nexport function Heading() {\n  return null;\n}\n",
    },
  });

  const usage = checkUsage({ cwd: root });
  const tokens = tokenSet(usage.findings);
  assert.ok(tokens.has("Button"), "a local V2 primitive replacement is flagged");
  assert.ok(!tokens.has("Heading"), "Heading is not part of the V2 duplication set");
});

/* -------------------------------------------------------------------------- */
/* V4 connect / verify / doctor                                               */
/* -------------------------------------------------------------------------- */

test("V4 connect, verify, and doctor succeed and advertise the Tailwind bridge", (t) => {
  const { root, packageName, version } = createConsumer(t, { contract: "v4" });

  const installed = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
  const verified = verifyConsumerDesignSystem({ packageName, expectedVersion: null, installed });
  assert.equal(verified.contract, "v4");
  assert.equal(verified.version, version);

  const result = connectDesignSystem({ cwd: root });
  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.changed, true);

  const config = readJson(join(root, ".design-system", "config.json"));
  assert.equal(config.package, packageName);
  assert.equal(config.version, version);

  const agents = readFileSync(join(root, ".design-system", "AGENTS.md"), "utf8");
  assert.ok(agents.includes("- Contract: `v4`"), agents);
  assert.ok(
    agents.includes(`${packageName}/tailwind.css`),
    "V4 instructions must include the Tailwind bridge import",
  );

  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, true, JSON.stringify(failedChecks(doctor)));
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && bridge.ok, "V4 doctor validates the Tailwind bridge");

  const recheck = connectDesignSystem({ cwd: root, check: true });
  assert.equal(recheck.ok, true);
  assert.equal(recheck.changed, false, "a connected V4 consumer is idempotent");
});

/* -------------------------------------------------------------------------- */
/* V4 usage component selection                                               */
/* -------------------------------------------------------------------------- */

test("V4 usage flags all required and declared optional components only", (t) => {
  const { root, manifest } = createConsumer(t, {
    contract: "v4",
    // Grid is a supported optional name that this system does not declare.
    mutateManifest: (m) => {
      delete m.components.Grid;
    },
    files: {
      "src/app.tsx": [
        "export function Heading() {",
        "  return null;",
        "}",
        "",
        "export function Grid() {",
        "  return null;",
        "}",
        "",
        "export const Table = () => null;",
        "",
      ].join("\n"),
    },
  });

  const declared = componentNamesForManifest(manifest);
  const expectedDeclared = [
    ...V4_REQUIRED_COMPONENTS,
    ...V4_OPTIONAL_COMPONENTS.filter((name) => name in manifest.components),
  ];
  assert.deepEqual(declared, expectedDeclared);
  assert.ok(declared.includes("Table"), "a declared optional is in the duplication set");
  assert.ok(!declared.includes("Grid"), "an undeclared optional is not in the duplication set");

  const usage = checkUsage({ cwd: root });
  const tokens = tokenSet(usage.findings);
  assert.ok(tokens.has("Heading"), "a required component replacement is flagged");
  assert.ok(tokens.has("Table"), "a declared optional replacement is flagged");
  assert.ok(!tokens.has("Grid"), "an undeclared optional replacement is not flagged");
  assert.equal(usage.ok, false);

  // Control: the same source flags Grid once it is declared available.
  const text = readFileSync(join(root, "src", "app.tsx"), "utf8");
  const control = checkSourceText({
    fileName: "src/app.tsx",
    text,
    rules: STRICT_RULES,
    strict: true,
    componentNames: [...declared, "Grid"],
  });
  assert.ok(
    control.some((finding) => finding.token === "Grid"),
    "Grid is detected when it is part of the canonical set",
  );
});

/* -------------------------------------------------------------------------- */
/* V4 Tailwind bridge failures                                                */
/* -------------------------------------------------------------------------- */

test("a manifest that does not advertise ./tailwind.css fails doctor", (t) => {
  const { root } = createConsumer(t, { contract: "v4", includeManifestTailwind: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /does not advertise/);
});

test("a package.json without the ./tailwind.css export fails doctor", (t) => {
  const { root } = createConsumer(t, { contract: "v4", includePackageTailwind: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /must expose/);
});

test("a package.json Tailwind target mismatching the manifest fails doctor", (t) => {
  const { root } = createConsumer(t, {
    contract: "v4",
    packageTailwindTarget: "./dist/other.css",
  });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /manifest target/);
});

test("a missing Tailwind bridge target file fails doctor", (t) => {
  const { root } = createConsumer(t, { contract: "v4", tailwindTargetExists: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /contained regular file/);
});

test("a Tailwind bridge target escaping the package fails doctor", (t) => {
  const { root } = createConsumer(t, {
    contract: "v4",
    manifestTailwindTarget: "./../outside.css",
    packageTailwindTarget: "./../outside.css",
    tailwindTargetExists: false,
  });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /escapes/);
});

/* -------------------------------------------------------------------------- */
/* Unsupported contract/schema pairs fail closed                              */
/* -------------------------------------------------------------------------- */

test("an unsupported schema/contract pair fails connect, verify, and doctor", (t) => {
  const pairs = [
    { schemaVersion: 2, contract: "v2" },
    { schemaVersion: 1, contract: "v4" },
    { schemaVersion: 3, contract: "v4" },
  ];
  for (const pair of pairs) {
    const { root, packageName } = createConsumer(t, {
      contract: "v4",
      mutateManifest: (manifest) => {
        manifest.schemaVersion = pair.schemaVersion;
        manifest.contract = pair.contract;
      },
    });

    const installed = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
    assert.throws(
      () => verifyConsumerDesignSystem({ packageName, expectedVersion: null, installed }),
      /Unsupported schema\/contract pair/,
      `verify must reject ${JSON.stringify(pair)}`,
    );

    const result = connectDesignSystem({ cwd: root });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /Unsupported schema\/contract pair/);

    const doctor = collectDoctorReport({ cwd: root });
    assert.equal(doctor.ok, false);
    assert.match(
      doctor.checks
        .filter((check) => !check.ok)
        .map((check) => check.detail)
        .join(" "),
      /Unsupported schema\/contract pair/,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Writes stay inside the consumer root                                       */
/* -------------------------------------------------------------------------- */

test("connect plans and writes only inside the consumer root", (t) => {
  const { root } = createConsumer(t, { contract: "v4" });

  const plan = planConnect({ cwd: root });
  for (const file of plan.files) {
    assert.ok(
      file.path === root || file.path.startsWith(`${root}${sep}`),
      `planned write escapes the consumer root: ${file.path}`,
    );
  }

  const result = connectDesignSystem({ cwd: root });
  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(existsSync(join(root, ".design-system", "config.json")), true);
});

test("connect refuses an external .design-system symlink and writes nothing", (t) => {
  const { root } = createConsumer(t, { contract: "v4" });
  const outsideDir = mkdtempSync(join(tmpdir(), "prism-consumer-v4-outside-"));
  t.after(() =>
    rmSync(outsideDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }),
  );

  try {
    symlinkSync(
      outsideDir,
      join(root, ".design-system"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch {
    t.skip("directory symlinks are not available in this environment");
    return;
  }

  const result = connectDesignSystem({ cwd: root });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /escapes/);
  assert.deepEqual(readdirSync(outsideDir), []);
});
