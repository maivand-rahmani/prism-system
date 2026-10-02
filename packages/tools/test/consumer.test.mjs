#!/usr/bin/env node
/**
 * Compatibility tests for the published consumer lifecycle.
 *
 * Run directly (Node built-in test runner, no dependency):
 *   node --test packages/tools/test/consumer.test.mjs
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
import { dirname, join, sep } from "node:path";
import { test } from "node:test";

import { CONTRACT_VERSION, OPTIONAL_COMPONENTS, REQUIRED_COMPONENTS } from "../src/constants.mjs";
import {
  connectDesignSystem,
  planConnect,
  planConnectForTarget,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "../src/consumer.mjs";
import { collectDoctorReport } from "../src/doctor.mjs";
import { checkSourceText, checkUsage, componentNamesForManifest } from "../src/usage.mjs";
import { currentManifest, readJson, repoRoot } from "./manifest-fixture.mjs";

const SYSTEM_A_MANIFEST = currentManifest(
  readJson(join(repoRoot, "packages", "system-a", "design-system.json")),
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

  const root = mkdtempSync(join(tmpdir(), "prism-consumer-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const packageName = "@prism-system/ui-bridge";
  const version = requestedVersion ?? "1.0.0";

  const manifest = structuredClone(SYSTEM_A_MANIFEST);
  manifest.package = packageName;
  manifest.version = version;
  manifest.id = "bridge";
  manifest.name = "Bridge";
  if (includeManifestTailwind) manifest.exports["./tailwind.css"] = manifestTailwindTarget;
  else delete manifest.exports["./tailwind.css"];
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
  exportsMap["./styles.css"] = "./dist/index.css";
  if (includePackageTailwind) exportsMap["./tailwind.css"] = packageTailwindTarget;

  const systemDir = join(root, "node_modules", ...packageName.split("/"));
  writeJson(join(systemDir, "package.json"), {
    name: packageName,
    version,
    exports: exportsMap,
  });
  writeJson(join(systemDir, "design-system.json"), manifest);
  writeFile(systemDir, "dist/index.css", "/* styles */\n");
  if (tailwindTargetExists) {
    const relativeTarget =
      manifestTailwindTarget.startsWith("./") && !manifestTailwindTarget.includes("..")
        ? manifestTailwindTarget.slice(2)
        : "dist/tailwind.css";
    writeFile(systemDir, relativeTarget, "/* tailwind bridge */\n");
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
/* connect / verify / doctor                                                  */
/* -------------------------------------------------------------------------- */

test("connect, verify, and doctor succeed and advertise the Tailwind bridge", (t) => {
  const { root, packageName, version } = createConsumer(t);

  const installed = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
  const verified = verifyConsumerDesignSystem({ packageName, expectedVersion: null, installed });
  assert.equal(verified.contractVersion, CONTRACT_VERSION);
  assert.equal(verified.version, version);

  const result = connectDesignSystem({ cwd: root });
  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.changed, true);

  const config = readJson(join(root, ".design-system", "config.json"));
  assert.equal(config.package, packageName);
  assert.equal(config.version, version);

  const agents = readFileSync(join(root, ".design-system", "AGENTS.md"), "utf8");
  assert.ok(agents.includes("- Contract version: `4`"), agents);
  assert.ok(
    agents.includes(`${packageName}/tailwind.css`),
    "instructions must include the Tailwind bridge import",
  );

  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, true, JSON.stringify(failedChecks(doctor)));
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && bridge.ok, "doctor validates the Tailwind bridge");

  const recheck = connectDesignSystem({ cwd: root, check: true });
  assert.equal(recheck.ok, true);
  assert.equal(recheck.changed, false, "a connected consumer is idempotent");
});

/* -------------------------------------------------------------------------- */
/* usage component selection                                                  */
/* -------------------------------------------------------------------------- */

test("usage flags all required and declared optional components only", (t) => {
  const { root, manifest } = createConsumer(t, {
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
    ...REQUIRED_COMPONENTS,
    ...OPTIONAL_COMPONENTS.filter((name) => name in manifest.components),
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
/* Tailwind bridge failures                                                   */
/* -------------------------------------------------------------------------- */

test("a manifest that does not advertise ./tailwind.css fails doctor", (t) => {
  const { root } = createConsumer(t, { includeManifestTailwind: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /does not advertise/);
});

test("a package.json without the ./tailwind.css export fails doctor", (t) => {
  const { root } = createConsumer(t, { includePackageTailwind: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /must expose/);
});

test("a package.json Tailwind target mismatching the manifest fails doctor", (t) => {
  const { root } = createConsumer(t, { packageTailwindTarget: "./dist/other.css" });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /manifest target/);
});

test("a missing Tailwind bridge target file fails doctor", (t) => {
  const { root } = createConsumer(t, { tailwindTargetExists: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const bridge = doctor.checks.find((check) => check.label === "tailwind bridge");
  assert.ok(bridge && !bridge.ok);
  assert.match(bridge.detail, /contained regular file/);
});

test("a Tailwind bridge target escaping the package fails doctor", (t) => {
  const { root } = createConsumer(t, {
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
/* Unsupported metadata fails closed                                          */
/* -------------------------------------------------------------------------- */

test("obsolete manifest metadata fails connect, verify, and doctor", (t) => {
  const pairs = [
    { schemaVersion: 3, contractVersion: 4 },
    { schemaVersion: 4, contractVersion: 2 },
    { schemaVersion: 3, contract: "v4" },
  ];
  for (const pair of pairs) {
    const { root, packageName } = createConsumer(t, {
      mutateManifest: (manifest) => {
        delete manifest.contractVersion;
        manifest.schemaVersion = pair.schemaVersion;
        if ("contractVersion" in pair) manifest.contractVersion = pair.contractVersion;
        if ("contract" in pair) manifest.contract = pair.contract;
      },
    });

    const installed = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
    assert.throws(
      () => verifyConsumerDesignSystem({ packageName, expectedVersion: null, installed }),
      /must be the numeric 4|must be 4/,
      `verify must reject ${JSON.stringify(pair)}`,
    );

    const result = connectDesignSystem({ cwd: root });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /must be the numeric 4|must be 4/);

    const doctor = collectDoctorReport({ cwd: root });
    assert.equal(doctor.ok, false);
    assert.match(
      doctor.checks
        .filter((check) => !check.ok)
        .map((check) => check.detail)
        .join(" "),
      /must be the numeric 4|must be 4/,
    );
  }
});

test("a current manifest missing capabilities fails verify, connect, and doctor", (t) => {
  const { root, packageName } = createConsumer(t, {
    mutateManifest: (manifest) => {
      delete manifest.capabilities;
    },
  });

  const installed = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
  assert.throws(
    () => verifyConsumerDesignSystem({ packageName, expectedVersion: null, installed }),
    /capabilities is required/,
  );

  const result = connectDesignSystem({ cwd: root });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /capabilities is required/);

  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  assert.match(
    doctor.checks
      .filter((check) => !check.ok)
      .map((check) => check.detail)
      .join(" "),
    /capabilities is required/,
  );
});

/* -------------------------------------------------------------------------- */
/* Writes stay inside the consumer root                                       */
/* -------------------------------------------------------------------------- */

test("connect plans and writes only inside the consumer root", (t) => {
  const { root } = createConsumer(t);

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
  const { root } = createConsumer(t);
  const outsideDir = mkdtempSync(join(tmpdir(), "prism-consumer-outside-"));
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

/* -------------------------------------------------------------------------- */
/* Target-version plans and the optional write precondition                   */
/* -------------------------------------------------------------------------- */

test("planConnectForTarget plans exact target content before install and matches the post-install plan", (t) => {
  const { root, packageName, version, manifest } = createConsumer(t);

  const target = planConnectForTarget({
    consumerRoot: root,
    package: packageName,
    version,
    manifest,
  });

  assert.equal(target.consumerRoot, root);
  assert.equal(target.packageName, packageName);
  assert.equal(target.version, version);
  assert.equal(target.strict, true);
  assert.deepEqual(
    target.files.map((file) => file.kind),
    ["config", "agents", "root-agents"],
  );
  for (const file of target.files) {
    assert.ok(
      file.path === root || file.path.startsWith(`${root}${sep}`),
      `planned write escapes the consumer root: ${file.path}`,
    );
    assert.equal(file.changed, file.before !== file.after);
  }

  // Exact planned content: config identity/strict, contract instructions, and
  // the appended managed block.
  const config = JSON.parse(target.files[0].after);
  assert.equal(config.package, packageName);
  assert.equal(config.version, version);
  assert.equal(config.strict, true);
  assert.equal(config.manifest, "./manifest");
  assert.equal(target.files[0].before, null);
  assert.match(target.files[1].after, /Contract version: `4`/);
  assert.match(target.files[2].after, /BEGIN @prism-system design system contract/);

  // The pre-install target plan is materially identical to the plan connect
  // recomputes from the installed package (same paths, before, and after).
  const installedPlan = planConnect({ cwd: root });
  const material = (plan) =>
    plan.files.map(({ kind, path, before, after }) => ({ kind, path, before, after }));
  assert.deepEqual(material(target), material(installedPlan));

  // Given the target plan as the write precondition, connect writes exactly the
  // previewed bytes.
  const result = connectDesignSystem({ cwd: root, expectedPlan: target });
  assert.equal(result.ok, true, result.failures.join(" "));
  for (const file of target.files) {
    assert.equal(readFileSync(file.path, "utf8"), file.after);
  }
});

test("planConnectForTarget preserves configured strict/ignore semantics", (t) => {
  const { root, packageName, version, manifest } = createConsumer(t, { withConfig: true });
  writeJson(join(root, ".design-system", "config.json"), {
    schemaVersion: 1,
    package: packageName,
    version,
    manifest: "./manifest",
    strict: false,
    ignore: ["dist/**"],
  });

  const target = planConnectForTarget({
    consumerRoot: root,
    package: packageName,
    version,
    manifest,
  });
  assert.equal(target.strict, false);
  const config = JSON.parse(target.files[0].after);
  assert.equal(config.strict, false);
  assert.deepEqual(config.ignore, ["dist/**"]);

  // An explicit strict argument overrides the config exactly like planConnect.
  const explicit = planConnectForTarget({
    consumerRoot: root,
    package: packageName,
    version,
    manifest,
    strict: true,
  });
  assert.equal(explicit.strict, true);
  assert.equal(JSON.parse(explicit.files[0].after).strict, true);
});

test("planConnectForTarget fails closed on a mismatched target manifest", (t) => {
  const { root, packageName, version, manifest } = createConsumer(t);

  assert.throws(
    () =>
      planConnectForTarget({
        consumerRoot: root,
        package: packageName,
        version: "9.9.9",
        manifest,
      }),
    /does not match/,
  );

  const stale = structuredClone(manifest);
  stale.contractVersion = 3;
  assert.throws(
    () =>
      planConnectForTarget({ consumerRoot: root, package: packageName, version, manifest: stale }),
    /contractVersion 4/,
  );
});

test("connect refuses to overwrite managed files that changed after the plan", (t) => {
  const { root } = createConsumer(t);
  const plan = planConnect({ cwd: root });

  // A managed file changes after the preview (for example while a package
  // manager runs); the write precondition must fail closed.
  const injected = "# changed after the preview\n";
  writeFile(root, "AGENTS.md", injected);

  const result = connectDesignSystem({ cwd: root, expectedPlan: plan });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "precondition");
  assert.match(result.failures.join(" "), /No connect files were written/);
  assert.match(result.failures.join(" "), /not rolled back/);
  assert.match(result.failures.join(" "), /root-agents/);
  // The injected change is preserved and no other managed file was created.
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), injected);
  assert.equal(existsSync(join(root, ".design-system", "config.json")), false);
  assert.equal(existsSync(join(root, ".design-system", "AGENTS.md")), false);
  // The fresh plan is reported so the caller can preview and confirm again.
  assert.ok(
    result.plan.files.some((file) => file.kind === "root-agents" && file.before === injected),
  );
});

test("connect fails closed when a managed config appears after the plan", (t) => {
  const { root, packageName, version } = createConsumer(t);
  const plan = planConnect({ cwd: root });

  const injected = `${JSON.stringify(
    {
      schemaVersion: 1,
      package: packageName,
      version,
      manifest: "./manifest",
      strict: false,
    },
    null,
    2,
  )}\n`;
  writeFile(root, ".design-system/config.json", injected);

  const result = connectDesignSystem({ cwd: root, expectedPlan: plan });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "precondition");
  assert.match(result.failures.join(" "), /config .*before/);
  assert.equal(readFileSync(join(root, ".design-system", "config.json"), "utf8"), injected);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
});
