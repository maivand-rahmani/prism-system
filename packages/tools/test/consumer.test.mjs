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
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
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
  renderConsumerAgents,
  renderLegacyConsumerConfig,
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
    icons = null,
    iconsTarget = "./dist/icons.mjs",
    packageIconsTarget = iconsTarget,
    iconsTargetExists = true,
    includePackageIcons = icons !== null,
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
  if (icons !== null) {
    manifest.entrypoints["./icons"] = { requirements: [] };
    manifest.exports["./icons"] = iconsTarget;
    manifest.publicApi["./icons"] = icons.map((name) => `${name}Icon`);
  }
  if (typeof mutateManifest === "function") mutateManifest(manifest);

  const consumerPackage = {
    name: "consumer-app",
    version: "0.0.0",
    private: true,
    dependencies: { [packageName]: version },
  };
  if (withConfig) {
    // The current configuration location: package.json "designSystem".
    consumerPackage.designSystem = {
      schemaVersion: 1,
      package: packageName,
      version,
      strict: true,
    };
  }
  writeJson(join(root, "package.json"), consumerPackage);

  const exportsMap = { "./manifest": "./design-system.json" };
  exportsMap["./styles.css"] = "./dist/index.css";
  if (includePackageTailwind) exportsMap["./tailwind.css"] = packageTailwindTarget;
  if (includePackageIcons) exportsMap["./icons"] = packageIconsTarget;

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
  if (
    includePackageIcons &&
    iconsTargetExists &&
    iconsTarget.startsWith("./") &&
    !iconsTarget.includes("..")
  ) {
    writeFile(systemDir, iconsTarget.slice(2), "/* icons */\n");
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
  assert.deepEqual(result.migrations, []);

  const config = readJson(join(root, "package.json")).designSystem;
  assert.deepEqual(config, {
    schemaVersion: 1,
    package: packageName,
    version,
    strict: true,
  });
  assert.equal(
    existsSync(join(root, ".design-system")),
    false,
    "connect creates no .design-system directory",
  );

  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.ok(agents.includes("BEGIN @prism-system design system contract (managed)"));
  assert.ok(agents.includes("- Contract version: `4`"), agents);
  assert.ok(
    agents.includes(`${packageName}/tailwind.css`),
    "instructions must include the Tailwind bridge import",
  );
  assert.ok(
    agents.includes("package.json` under `designSystem"),
    "instructions point at the package.json field",
  );
  assert.ok(!agents.includes(".design-system/config.json"));

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
/* Icon catalog                                                               */
/* -------------------------------------------------------------------------- */

test("doctor reports an absent icon catalog as information", (t) => {
  const { root } = createConsumer(t);
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, true, JSON.stringify(failedChecks(doctor)));
  const icons = doctor.checks.find((check) => check.label === "icon catalog");
  assert.ok(icons, JSON.stringify(doctor.checks));
  assert.equal(icons.ok, true);
  assert.equal(icons.detail, "no icon catalog declared (absence means unavailable)");
});

test("doctor verifies a shipped icon catalog target and count", (t) => {
  const { root } = createConsumer(t, { icons: ["ArrowLeft", "Plus", "Info"] });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, true, JSON.stringify(failedChecks(doctor)));
  const icons = doctor.checks.find((check) => check.label === "icon catalog");
  assert.ok(icons && icons.ok, JSON.stringify(doctor.checks));
  assert.equal(icons.detail, "./icons -> ./dist/icons.mjs (3 icons)");
});

test("doctor accepts a conditional ./icons export with real import target", (t) => {
  const { root, systemDir } = createConsumer(t, { icons: ["ArrowLeft"] });
  const target = {
    types: "./dist/icons/index.d.ts",
    import: "./dist/icons/index.mjs",
    require: "./dist/icons/index.js",
  };
  const manifestPath = join(systemDir, "design-system.json");
  const manifest = readJson(manifestPath);
  manifest.exports["./icons"] = target;
  writeJson(manifestPath, manifest);
  const packagePath = join(systemDir, "package.json");
  const pkg = readJson(packagePath);
  pkg.exports["./icons"] = target;
  writeJson(packagePath, pkg);
  writeFile(systemDir, "dist/icons/index.mjs", "export const ArrowLeftIcon = null;\n");
  writeFile(systemDir, "dist/icons/index.js", "exports.ArrowLeftIcon = null;\n");
  writeFile(systemDir, "dist/icons/index.d.ts", "export declare const ArrowLeftIcon: unknown;\n");

  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, true, JSON.stringify(failedChecks(doctor)));
  const icons = doctor.checks.find((check) => check.label === "icon catalog");
  assert.ok(icons && icons.ok, JSON.stringify(doctor.checks));
  assert.match(icons.detail, /\.\/dist\/icons\/index\.mjs \(1 icons\)/);
});

test("a missing icon export target file fails doctor", (t) => {
  const { root } = createConsumer(t, { icons: ["ArrowLeft"], iconsTargetExists: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const icons = doctor.checks.find((check) => check.label === "icon catalog");
  assert.ok(icons && !icons.ok);
  assert.match(icons.detail, /contained regular file/);
});

test("a package.json without the ./icons export fails doctor", (t) => {
  const { root } = createConsumer(t, { icons: ["ArrowLeft"], includePackageIcons: false });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const icons = doctor.checks.find((check) => check.label === "icon catalog");
  assert.ok(icons && !icons.ok);
  assert.match(icons.detail, /must expose/);
});

test("a malformed icon public API fails doctor", (t) => {
  const { root } = createConsumer(t, {
    icons: ["ArrowLeft"],
    mutateManifest: (manifest) => {
      manifest.publicApi["./icons"] = ["arrow-left"];
    },
  });
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, false);
  const icons = doctor.checks.find((check) => check.label === "icon catalog");
  assert.ok(icons && !icons.ok);
  assert.match(icons.detail, /canonical/);
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
      /must be the numeric 4|must be 5/,
      `verify must reject ${JSON.stringify(pair)}`,
    );

    const result = connectDesignSystem({ cwd: root });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /must be the numeric 4|must be 5/);

    const doctor = collectDoctorReport({ cwd: root });
    assert.equal(doctor.ok, false);
    assert.match(
      doctor.checks
        .filter((check) => !check.ok)
        .map((check) => check.detail)
        .join(" "),
      /must be the numeric 4|must be 5/,
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
  assert.equal(typeof readJson(join(root, "package.json")).designSystem, "object");
  assert.equal(existsSync(join(root, ".design-system")), false);
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
    ["package-json", "root-agents"],
  );
  assert.deepEqual(
    target.files.map((file) => file.path),
    [join(root, "package.json"), join(root, "AGENTS.md")],
  );
  for (const file of target.files) {
    assert.ok(
      file.path === root || file.path.startsWith(`${root}${sep}`),
      `planned write escapes the consumer root: ${file.path}`,
    );
    assert.equal(file.changed, file.before !== file.after);
  }

  // Exact planned content: the package.json field identity/strict plus the
  // appended managed block. User content outside the block is never touched.
  const packageJsonEffect = target.files[0];
  assert.equal(packageJsonEffect.before, readFileSync(join(root, "package.json"), "utf8"));
  assert.deepEqual(packageJsonEffect.config, {
    schemaVersion: 1,
    package: packageName,
    version,
    strict: true,
  });
  const config = JSON.parse(packageJsonEffect.after).designSystem;
  assert.deepEqual(config, packageJsonEffect.config);
  assert.match(target.files[1].after, /BEGIN @prism-system design system contract/);

  // The pre-install target plan is materially identical to the plan connect
  // recomputes from the installed package (same paths, before, and after).
  const installedPlan = planConnect({ cwd: root });
  const material = (plan) =>
    plan.files.map(({ kind, path, before, after, config: plannedConfig }) => ({
      kind,
      path,
      before,
      after,
      config: plannedConfig ?? null,
    }));
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
  const packageJson = readJson(join(root, "package.json"));
  packageJson.designSystem = {
    schemaVersion: 1,
    package: packageName,
    version,
    strict: false,
    ignore: ["dist/**"],
  };
  writeJson(join(root, "package.json"), packageJson);

  const target = planConnectForTarget({
    consumerRoot: root,
    package: packageName,
    version,
    manifest,
  });
  assert.equal(target.strict, false);
  const config = target.files[0].config;
  assert.equal(config.strict, false);
  assert.deepEqual(config.ignore, ["dist/**"]);
  // The rendered package.json carries the same round-tripped value.
  assert.deepEqual(JSON.parse(target.files[0].after).designSystem, config);

  // An explicit strict argument overrides the config exactly like planConnect,
  // while the consumer's ignore globs are still preserved.
  const explicit = planConnectForTarget({
    consumerRoot: root,
    package: packageName,
    version,
    manifest,
    strict: true,
  });
  assert.equal(explicit.strict, true);
  assert.equal(explicit.files[0].config.strict, true);
  assert.deepEqual(explicit.files[0].config.ignore, ["dist/**"]);
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
  assert.equal(readJson(join(root, "package.json")).designSystem, undefined);
  assert.equal(existsSync(join(root, ".design-system")), false);
  // The fresh plan is reported so the caller can preview and confirm again.
  assert.ok(
    result.plan.files.some((file) => file.kind === "root-agents" && file.before === injected),
  );
});

test("connect fails closed when the designSystem value changes after the plan", (t) => {
  const { root, packageName, version } = createConsumer(t);
  const plan = planConnect({ cwd: root });

  const packageJson = readJson(join(root, "package.json"));
  const injected = {
    schemaVersion: 1,
    package: packageName,
    version,
    strict: false,
  };
  packageJson.designSystem = injected;
  writeJson(join(root, "package.json"), packageJson);

  const result = connectDesignSystem({ cwd: root, expectedPlan: plan });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "precondition");
  assert.match(result.failures.join(" "), /designSystem configuration/);
  assert.match(result.failures.join(" "), /strict mode changed/);
  assert.deepEqual(readJson(join(root, "package.json")).designSystem, injected);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
});

test("connect fails closed when a legacy config appears after the plan", (t) => {
  const { root, packageName, version } = createConsumer(t);
  const plan = planConnect({ cwd: root });

  const injected = renderLegacyConsumerConfig({ packageName, version, strict: true });
  writeFile(root, join(".design-system", "config.json"), injected);

  const result = connectDesignSystem({ cwd: root, expectedPlan: plan });

  assert.equal(result.ok, false);
  assert.equal(result.boundary, "precondition");
  assert.match(result.failures.join(" "), /managed file count changed/);
  assert.equal(readFileSync(join(root, ".design-system", "config.json"), "utf8"), injected);
  assert.equal(readJson(join(root, "package.json")).designSystem, undefined);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
});

test("connect migrates a legacy .design-system install into package.json and root AGENTS.md", (t) => {
  const { root, packageName, version } = createConsumer(t);

  writeFile(
    root,
    join(".design-system", "config.json"),
    renderLegacyConsumerConfig({ packageName, version, strict: true }),
  );
  writeFile(
    root,
    join(".design-system", "AGENTS.md"),
    renderConsumerAgents({ packageName, version, strict: true, contractVersion: CONTRACT_VERSION }),
  );
  const userAgents = "# Project notes\n\nKeep this line exactly.\n";
  writeFile(root, "AGENTS.md", userAgents);

  const result = connectDesignSystem({ cwd: root });

  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.changed, true);
  assert.ok(
    result.migrations.some((line) => line.includes("moved .design-system/config.json")),
    result.migrations.join("\n"),
  );
  assert.ok(
    result.migrations.some((line) =>
      line.includes("removed the generated .design-system/AGENTS.md"),
    ),
    result.migrations.join("\n"),
  );

  // The legacy configuration now lives in package.json and the legacy files are
  // retired with the directory they lived in.
  assert.deepEqual(readJson(join(root, "package.json")).designSystem, {
    schemaVersion: 1,
    package: packageName,
    version,
    strict: true,
  });
  assert.equal(existsSync(join(root, ".design-system")), false);

  // User-authored instructions are byte-preserved; only the managed block is added.
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.ok(agents.startsWith(userAgents), "user content is preserved as the file prefix");
  assert.ok(agents.includes("BEGIN @prism-system design system contract (managed)"));
  assert.ok(agents.includes("END @prism-system design system contract (managed)"));
  assert.ok(
    agents.includes(`consumes \`${packageName}@${version}\` as its visual source of truth`),
    agents,
  );

  const recheck = connectDesignSystem({ cwd: root, check: true });
  assert.equal(recheck.ok, true);
  assert.equal(recheck.changed, false, "migration is idempotent");
});

test("connect --check and --dry-run write nothing and ignore unrelated package.json edits", (t) => {
  const { root, packageName, version } = createConsumer(t);
  const packageJsonBefore = readFileSync(join(root, "package.json"), "utf8");
  const plan = planConnect({ cwd: root });

  const checked = connectDesignSystem({ cwd: root, check: true });
  assert.equal(checked.ok, true);
  assert.equal(checked.changed, true);
  assert.deepEqual(
    checked.changes.map((change) => change.kind),
    ["package-json", "root-agents"],
  );
  const dry = connectDesignSystem({ cwd: root, dryRun: true });
  assert.equal(dry.ok, true);
  assert.equal(dry.changed, false);
  assert.equal(readFileSync(join(root, "package.json"), "utf8"), packageJsonBefore);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
  assert.equal(existsSync(join(root, ".design-system")), false);

  // A package manager legitimately rewrites unrelated package.json content
  // between the preview and the confirmed run; the designSystem value is
  // unchanged, so that is not plan drift and the new content is preserved.
  const packageJson = readJson(join(root, "package.json"));
  packageJson.scripts = { build: "tsc" };
  writeJson(join(root, "package.json"), packageJson);

  const result = connectDesignSystem({ cwd: root, expectedPlan: plan });
  assert.equal(result.ok, true, result.failures.join(" "));
  const written = readJson(join(root, "package.json"));
  assert.deepEqual(written.scripts, { build: "tsc" });
  assert.deepEqual(written.designSystem, {
    schemaVersion: 1,
    package: packageName,
    version,
    strict: true,
  });
});

/* -------------------------------------------------------------------------- */
/* Configuration location                                                     */
/* -------------------------------------------------------------------------- */

test("connect can store the configuration in .design-system/config.json", (t) => {
  const { root, packageName, version } = createConsumer(t);

  const result = connectDesignSystem({ cwd: root, location: "design-system" });
  assert.equal(result.ok, true, result.failures.join(" "));
  assert.equal(result.plan.location, "design-system");
  assert.equal(result.changed, true);

  // The extended file wraps the identical subtree as package.json.
  assert.deepEqual(readJson(join(root, ".design-system", "config.json")), {
    designSystem: { schemaVersion: 1, package: packageName, version, strict: true },
  });
  assert.equal(
    readJson(join(root, "package.json")).designSystem,
    undefined,
    "the package.json field must be removed: one configuration, one location",
  );

  // Idempotent, and never migrated back by a plain connect.
  const rerun = connectDesignSystem({ cwd: root });
  assert.equal(rerun.ok, true, rerun.failures.join(" "));
  assert.equal(rerun.changed, false, "a second connect must be a no-op");
  assert.equal(rerun.plan.location, "design-system");
  assert.ok(existsSync(join(root, ".design-system", "config.json")));
  assert.equal(readJson(join(root, "package.json")).designSystem, undefined);

  // Read-only commands resolve the extended location.
  const doctor = collectDoctorReport({ cwd: root });
  assert.equal(doctor.ok, true, JSON.stringify(failedChecks(doctor)));
  const configCheck = doctor.checks.find((check) => check.label === "consumer config");
  assert.ok(configCheck, JSON.stringify(doctor.checks));
  assert.match(configCheck.detail, /\.design-system[\\/]config\.json#designSystem/);
});

test("the configuration moves between both locations without touching anything else", (t) => {
  const { root, packageName, version } = createConsumer(t, {
    files: { "AGENTS.md": "# Team rules\n\nKeep this.\n" },
  });
  const packagePath = join(root, "package.json");
  connectDesignSystem({ cwd: root });
  const packageAfterConnect = readFileSync(packagePath, "utf8");
  const agentsAfterConnect = readFileSync(join(root, "AGENTS.md"), "utf8");

  const moved = connectDesignSystem({ cwd: root, location: "design-system" });
  assert.equal(moved.ok, true, moved.failures.join(" "));
  assert.equal(readJson(join(root, ".design-system", "config.json")).designSystem.version, version);
  assert.ok(readFileSync(packagePath, "utf8").includes('"name": "consumer-app"'));
  assert.ok(!readFileSync(packagePath, "utf8").includes("designSystem"));

  const back = connectDesignSystem({ cwd: root, location: "package-json" });
  assert.equal(back.ok, true, back.failures.join(" "));
  assert.deepEqual(readJson(packagePath).designSystem, {
    schemaVersion: 1,
    package: packageName,
    version,
    strict: true,
  });
  assert.equal(
    readFileSync(packagePath, "utf8"),
    packageAfterConnect,
    "moving back must restore the exact package.json bytes",
  );
  assert.equal(existsSync(join(root, ".design-system")), false, "the emptied directory is retired");
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), agentsAfterConnect);
});

test("a configuration in both locations fails closed until an explicit location is given", (t) => {
  const { root, packageName, version } = createConsumer(t, { withConfig: true });
  writeJson(join(root, ".design-system", "config.json"), {
    designSystem: { schemaVersion: 1, package: packageName, version, strict: true },
  });

  const ambiguous = connectDesignSystem({ cwd: root });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.failures.join(" "), /configured in both/);
  assert.match(ambiguous.failures.join(" "), /prism-ds config/);

  const resolved = connectDesignSystem({ cwd: root, location: "package-json" });
  assert.equal(resolved.ok, true, resolved.failures.join(" "));
  assert.equal(existsSync(join(root, ".design-system", "config.json")), false);
  assert.equal(readJson(join(root, "package.json")).designSystem.version, version);
});

test("a legacy root-level config converts to the extended layout in place", (t) => {
  const { root, packageName, version } = createConsumer(t);
  writeFile(
    root,
    ".design-system/config.json",
    renderLegacyConsumerConfig({ packageName, version, strict: false }),
  );

  const result = connectDesignSystem({ cwd: root, location: "design-system" });
  assert.equal(result.ok, true, result.failures.join(" "));
  assert.deepEqual(readJson(join(root, ".design-system", "config.json")), {
    designSystem: { schemaVersion: 1, package: packageName, version, strict: false },
  });
  assert.equal(
    readJson(join(root, "package.json")).designSystem,
    undefined,
    "the legacy file is converted, not duplicated into package.json",
  );
  assert.match(result.migrations.join(" "), /extended designSystem layout/);
});

test("an unknown configuration location is rejected", (t) => {
  const { root } = createConsumer(t);
  const result = connectDesignSystem({ cwd: root, location: "sometimes" });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(" "), /Unsupported configuration location/);
});

/* -------------------------------------------------------------------------- */
/* Current install wins over a cached module-resolution realpath              */
/* -------------------------------------------------------------------------- */

function writeVersionedInstalledPackage(dir, packageName, version) {
  writeJson(join(dir, "package.json"), {
    name: packageName,
    version,
    exports: { "./manifest": "./design-system.json" },
  });
  writeJson(join(dir, "design-system.json"), { package: packageName, version });
}

function writeInstalledCopy(consumerRoot, packageName, version) {
  const dir = join(consumerRoot, "node_modules", ...packageName.split("/"));
  writeVersionedInstalledPackage(dir, packageName, version);
  return dir;
}

function writeConsumerPackage(dir, name = "consumer-app") {
  writeJson(join(dir, "package.json"), { name, version: "0.0.0", private: true });
  return dir;
}

test("installed resolution follows a replaced pnpm-style link, not a cached realpath", (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-link-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const packageName = "@prism-system/ui-link-fresh";
  const link = join(root, "node_modules", ...packageName.split("/"));
  const oldDir = join(root, "store", "old");
  const newDir = join(root, "store", "new");
  writeConsumerPackage(root);
  writeVersionedInstalledPackage(oldDir, packageName, "0.1.1");
  writeVersionedInstalledPackage(newDir, packageName, "0.2.0");
  mkdirSync(dirname(link), { recursive: true });
  const linkType = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(oldDir, link, linkType);

  const before = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
  assert.equal(before.packageJson.version, "0.1.1");
  assert.equal(before.manifest.version, "0.1.1");

  // pnpm updates the project link to a new versioned target after an upgrade.
  unlinkSync(link);
  symlinkSync(newDir, link, linkType);

  const after = resolveInstalledDesignSystem({ consumerRoot: root, packageName });
  assert.equal(after.packageJson.version, "0.2.0");
  assert.equal(after.manifest.version, "0.2.0");
  assert.equal(realpathSync(after.packageDir), realpathSync(newDir));
});

test("resolution falls back to a valid installed ancestor node_modules package", (t) => {
  const outer = mkdtempSync(join(tmpdir(), "prism-ancestor-"));
  t.after(() => rmSync(outer, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const packageName = "@prism-system/ui-ancestor";
  writeConsumerPackage(outer, "outer-app");
  const ancestorDir = writeInstalledCopy(outer, packageName, "0.3.0");
  const consumerRoot = writeConsumerPackage(join(outer, "app"), "child-app");

  const installed = resolveInstalledDesignSystem({ consumerRoot, packageName });
  assert.equal(installed.packageJson.version, "0.3.0");
  assert.equal(installed.manifest.version, "0.3.0");
  assert.equal(realpathSync(installed.packageDir), realpathSync(ancestorDir));
});

test("a direct install wins over a different ancestor copy", (t) => {
  const outer = mkdtempSync(join(tmpdir(), "prism-direct-wins-"));
  t.after(() => rmSync(outer, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const packageName = "@prism-system/ui-direct-wins";
  writeConsumerPackage(outer, "outer-app");
  const ancestorDir = writeInstalledCopy(outer, packageName, "0.1.1");
  const consumerRoot = writeConsumerPackage(join(outer, "app"), "child-app");
  const directDir = writeInstalledCopy(consumerRoot, packageName, "0.2.0");

  const installed = resolveInstalledDesignSystem({ consumerRoot, packageName });
  assert.equal(installed.packageJson.version, "0.2.0");
  assert.equal(installed.manifest.version, "0.2.0");
  assert.equal(realpathSync(installed.packageDir), realpathSync(directDir));
  assert.notEqual(realpathSync(installed.packageDir), realpathSync(ancestorDir));
});

test("a broken direct install fails closed without falling back to an ancestor copy", (t) => {
  const packageName = "@prism-system/ui-direct-broken";

  for (const variant of ["missing-manifest", "invalid-exports"]) {
    const outer = mkdtempSync(join(tmpdir(), "prism-direct-broken-"));
    t.after(() => rmSync(outer, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
    writeConsumerPackage(outer, "outer-app");
    writeInstalledCopy(outer, packageName, "0.1.1");
    const consumerRoot = writeConsumerPackage(join(outer, "app"), "child-app");
    const directDir = join(consumerRoot, "node_modules", ...packageName.split("/"));
    writeJson(join(directDir, "package.json"), {
      name: packageName,
      version: "0.2.0",
      exports: {
        "./manifest": variant === "invalid-exports" ? "./other.json" : "./design-system.json",
      },
    });
    if (variant === "invalid-exports") {
      writeJson(join(directDir, "design-system.json"), { package: packageName, version: "0.2.0" });
    }

    assert.throws(
      () => resolveInstalledDesignSystem({ consumerRoot, packageName }),
      variant === "missing-manifest" ? /missing its manifest/ : /must expose/,
      `${variant} must fail closed instead of resolving the ancestor 0.1.1 copy`,
    );

    // The older ancestor install is still valid; it must not have been used.
    const ancestor = resolveInstalledDesignSystem({ consumerRoot: outer, packageName });
    assert.equal(ancestor.packageJson.version, "0.1.1");
  }
});

test("a direct manifest link outside the package directory is rejected", (t) => {
  const root = mkdtempSync(join(tmpdir(), "prism-manifest-escape-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const packageName = "@prism-system/ui-manifest-escape";
  writeConsumerPackage(root);
  const packageDir = join(root, "node_modules", ...packageName.split("/"));
  writeJson(join(packageDir, "package.json"), {
    name: packageName,
    version: "0.2.0",
    exports: { "./manifest": "./design-system.json" },
  });
  const outsideManifest = join(root, "outside", "design-system.json");
  writeFile(root, "outside/design-system.json", "{ not json }\n");

  try {
    symlinkSync(outsideManifest, join(packageDir, "design-system.json"), "file");
  } catch {
    t.skip("file symlinks are not available in this environment");
    return;
  }

  assert.throws(
    () => resolveInstalledDesignSystem({ consumerRoot: root, packageName }),
    /escapes/,
    "the real manifest target must stay inside the installed package directory",
  );
});
