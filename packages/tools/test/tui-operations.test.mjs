/**
 * Focused tests for the UI-neutral TUI operations facade.
 *
 * Every operation is injected as a fake, and the registry/package-manager
 * dependencies are injected through `fetchImpl`/`spawnImpl`. No network call,
 * no registry, and no user-directory write happens here: the facade is exercised
 * entirely against in-memory plans.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { createTuiOperations, PROJECT_STATES } from "../src/tui-operations.mjs";

const TARGET = "@prism-system/ui-system-a";
const TARGET_B = "@prism-system/ui-system-b";
const TEST_CWD = "virtual-consumer";
const RESOLVED_CWD = resolve(TEST_CWD);
const CONSUMER_ROOT = "/virtual/consumer";
const REGISTRY = "https://registry.npmjs.org";

const OPERATION_NAMES = Object.freeze([
  "search",
  "inspect",
  "install",
  "use",
  "connect",
  "upgrade",
  "components",
  "tokens",
  "check",
  "doctor",
  "usage",
  "tailwind",
  "resolveRoot",
  "readConfig",
  "discover",
  "resolveInstalled",
  "verifyInstalled",
]);

function spy(impl) {
  const fn = (...args) => {
    fn.calls.push(args);
    return impl(...args);
  };
  fn.calls = [];
  return fn;
}

/**
 * Build the facade with recording fakes. Every operation records its call
 * arguments; an operation without an override throws if it is ever called, so a
 * test that forgets to provide one detects the unexpected work immediately.
 */
function createHarness(overrides = {}, options = {}) {
  const calls = {};
  const operations = {};
  for (const name of OPERATION_NAMES) {
    calls[name] = [];
    const impl = overrides[name];
    operations[name] = (...args) => {
      calls[name].push(args);
      if (typeof impl !== "function") {
        throw new Error(`Unexpected operation call: ${name}`);
      }
      return impl(...args);
    };
  }
  const fetchImpl =
    options.fetchImpl ??
    spy(() => {
      throw new Error("Unexpected fetchImpl call.");
    });
  const spawnImpl =
    options.spawnImpl ??
    spy(() => {
      throw new Error("Unexpected spawnImpl call.");
    });
  const tui = createTuiOperations({
    cwd: options.cwd ?? TEST_CWD,
    operations,
    fetchImpl,
    spawnImpl,
  });
  return { tui, calls, fetchImpl, spawnImpl };
}

function dryRunFlags(calls, name) {
  return calls[name].map(([options]) => options.dryRun);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function validConfig() {
  return {
    schemaVersion: 1,
    package: TARGET,
    version: "1.2.3",
    manifest: "./manifest",
    strict: true,
    ignore: [],
    path: `${CONSUMER_ROOT}/.design-system/config.json`,
  };
}

function installedFixture(version = "1.2.3") {
  return {
    packageDir: `${CONSUMER_ROOT}/node_modules/${TARGET}`,
    packageJson: { name: TARGET, version },
    manifest: { package: TARGET, version, schemaVersion: 4, contractVersion: 4 },
    manifestPath: `${CONSUMER_ROOT}/node_modules/${TARGET}/design-system.json`,
  };
}

function commandFor(version, manager = "pnpm") {
  return {
    manager,
    verb: manager === "npm" ? "install" : "add",
    args: [
      manager === "npm" ? "install" : "add",
      "--save-prod",
      "--ignore-scripts",
      `--registry=${REGISTRY}`,
      `${TARGET}@${version}`,
    ],
  };
}

function installDryRun({ version = "1.2.3", manager = "pnpm" } = {}) {
  const command = commandFor(version, manager);
  return {
    ok: true,
    dryRun: true,
    changed: false,
    failures: [],
    consumerRoot: CONSUMER_ROOT,
    manager,
    managerSource: "pnpm-lock.yaml",
    package: TARGET,
    version,
    registry: REGISTRY,
    command,
    plannedChanges: [{ kind: "dependency", manager, command }],
  };
}

function makeUseConnectPlan() {
  return {
    consumerRoot: CONSUMER_ROOT,
    packageName: TARGET,
    version: "1.2.3",
    strict: true,
    source: "target",
    check: false,
    files: [
      {
        kind: "config",
        path: `${CONSUMER_ROOT}/.design-system/config.json`,
        before: null,
        after: `{\n  "package": "${TARGET}",\n  "version": "1.2.3"\n}\n`,
        changed: true,
      },
      {
        kind: "agents",
        path: `${CONSUMER_ROOT}/.design-system/AGENTS.md`,
        before: null,
        after: "# Design system consumer contract\n",
        changed: true,
      },
      {
        kind: "root-agents",
        path: `${CONSUMER_ROOT}/AGENTS.md`,
        before: "# Root\n",
        after: "# Root\n\n<!-- BEGIN managed -->\nblock\n<!-- END managed -->\n",
        changed: true,
      },
    ],
  };
}

function upgradeConnectPlan(toVersion = "2.0.0") {
  return {
    consumerRoot: CONSUMER_ROOT,
    packageName: TARGET,
    version: toVersion,
    strict: true,
    source: "target",
    check: false,
    files: [
      {
        kind: "config",
        path: `${CONSUMER_ROOT}/.design-system/config.json`,
        before: `{\n  "package": "${TARGET}",\n  "version": "1.2.3"\n}\n`,
        after: `{\n  "package": "${TARGET}",\n  "version": "${toVersion}"\n}\n`,
        changed: true,
      },
      {
        kind: "agents",
        path: `${CONSUMER_ROOT}/.design-system/AGENTS.md`,
        before: "# Design system consumer contract\n",
        after: "# Design system consumer contract\n",
        changed: false,
      },
      {
        kind: "root-agents",
        path: `${CONSUMER_ROOT}/AGENTS.md`,
        before: null,
        after: "<!-- BEGIN managed -->\nblock\n<!-- END managed -->\n",
        changed: true,
      },
    ],
  };
}

/** The exact planned effects a target-version connect plan contributes. */
function connectPlanChanges(connectPlan) {
  return connectPlan.files.map((file) => ({
    kind: "connect",
    fileKind: file.kind,
    path: file.path,
    changed: file.changed,
    before: file.before,
    after: file.after,
  }));
}

function makeUseDryRun() {
  const install = installDryRun();
  const tailwindPlan = {
    cssPath: `${CONSUMER_ROOT}/app/globals.css`,
    packageName: TARGET,
    version: "1.2.3",
    tailwindVersion: "4.1.0",
    before: '@import "tailwindcss";\n',
    after:
      '@import "tailwindcss";\n' +
      `@import "${TARGET}/tailwind.css";\n` +
      `@import "${TARGET}/styles.css";\n`,
    changed: true,
    bridge: { "./tailwind.css": "./dist/tailwind.css" },
  };
  const connectPlan = makeUseConnectPlan();
  return {
    ok: true,
    dryRun: true,
    changed: false,
    failures: [],
    install,
    connect: null,
    usage: null,
    tailwind: tailwindPlan,
    connectPlan,
    plannedChanges: [
      { kind: "dependency", manager: install.manager, command: install.command },
      {
        kind: "css",
        path: tailwindPlan.cssPath,
        changed: true,
        before: tailwindPlan.before,
        after: tailwindPlan.after,
      },
      ...connectPlanChanges(connectPlan),
    ],
  };
}

function connectDryRun() {
  const plan = {
    consumerRoot: CONSUMER_ROOT,
    packageName: TARGET,
    version: "1.2.3",
    strict: true,
    source: "dependency",
    check: false,
    files: [
      {
        kind: "config",
        path: `${CONSUMER_ROOT}/.design-system/config.json`,
        before: null,
        after: `{"package":"${TARGET}"}\n`,
      },
      {
        kind: "agents",
        path: `${CONSUMER_ROOT}/.design-system/AGENTS.md`,
        before: null,
        after: "# Design system consumer contract\n",
      },
      {
        kind: "root-agents",
        path: `${CONSUMER_ROOT}/AGENTS.md`,
        before: "# Root\n",
        after: "# Root\n\n<!-- BEGIN managed -->\nblock\n<!-- END managed -->\n",
      },
    ],
  };
  return {
    ok: true,
    changed: false,
    check: false,
    dryRun: true,
    failures: [],
    plan,
    changes: plan.files
      .filter((file) => file.before !== file.after)
      .map((file) => ({ kind: file.kind, path: file.path })),
  };
}

function upgradeDiff() {
  return {
    components: {
      added: ["Metric"],
      removed: [],
      changed: [{ name: "Button", fields: { sizes: { added: ["xl"], removed: [] } } }],
    },
    tokens: { added: { radius: ["xl"] }, removed: {} },
    metadata: {},
    exports: { added: [], removed: [], changed: [] },
  };
}

function upgradeDryRun({ toVersion = "2.0.0", diff = upgradeDiff(), manager = "pnpm" } = {}) {
  const command = commandFor(toVersion, manager);
  const connectPlan = upgradeConnectPlan(toVersion);
  return {
    ok: true,
    dryRun: true,
    changed: false,
    failures: [],
    consumerRoot: CONSUMER_ROOT,
    package: TARGET,
    fromVersion: "1.2.3",
    toVersion,
    registry: REGISTRY,
    manager,
    managerSource: "pnpm-lock.yaml",
    command,
    diff,
    preview: [`upgrade ${TARGET}: 1.2.3 -> ${toVersion}`],
    connectPlan,
    plannedChanges: [{ kind: "dependency", manager, command }, ...connectPlanChanges(connectPlan)],
  };
}

/* -------------------------------------------------------------------------- */
/* Construction                                                               */
/* -------------------------------------------------------------------------- */

test("construction resolves cwd and performs no operation, network, or spawn work", () => {
  const { tui, calls, fetchImpl, spawnImpl } = createHarness();

  assert.equal(tui.cwd, RESOLVED_CWD);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(spawnImpl.calls.length, 0);
  for (const name of OPERATION_NAMES) {
    assert.equal(calls[name].length, 0, `${name} must not run on construction`);
  }
  assert.equal(typeof tui.getProjectState, "function");
  assert.equal(typeof tui.previewMutation, "function");
  assert.equal(typeof tui.executeMutation, "function");
});

test("construction rejects invalid cwd, unknown operations, and non-function operations", () => {
  assert.throws(() => createTuiOperations({ cwd: "" }), TypeError);
  assert.throws(() => createTuiOperations({ operations: null }), TypeError);
  assert.throws(
    () => createTuiOperations({ operations: { install: "not-a-function" } }),
    /must be a function/,
  );
  assert.throws(
    () => createTuiOperations({ operations: { installStyle: () => {} } }),
    /Unknown operation/,
  );
});

test("constructing with the real default operations is inert", () => {
  const tui = createTuiOperations({ cwd: RESOLVED_CWD });
  assert.equal(tui.cwd, RESOLVED_CWD);
  assert.deepEqual(Object.keys(PROJECT_STATES), ["CONNECTED", "INSTALLED", "EMPTY", "ERROR"]);
});

/* -------------------------------------------------------------------------- */
/* Project state                                                              */
/* -------------------------------------------------------------------------- */

test("getProjectState reports connected for a validated config and verified public manifest", () => {
  const config = validConfig();
  const { tui, calls, fetchImpl, spawnImpl } = createHarness({
    resolveRoot: () => CONSUMER_ROOT,
    readConfig: () => config,
    discover: () => ({ packageName: TARGET, expectedVersion: "1.2.3", source: "config", config }),
    resolveInstalled: ({ consumerRoot, packageName }) => {
      assert.equal(consumerRoot, CONSUMER_ROOT);
      assert.equal(packageName, TARGET);
      return installedFixture();
    },
    verifyInstalled: ({ packageName, expectedVersion }) => {
      assert.equal(packageName, TARGET);
      assert.equal(expectedVersion, "1.2.3");
      return { version: "1.2.3", contractVersion: 4 };
    },
  });

  const state = tui.getProjectState();

  assert.equal(state.status, PROJECT_STATES.CONNECTED);
  assert.equal(state.ok, true);
  assert.equal(state.connected, true);
  assert.equal(state.cwd, RESOLVED_CWD);
  assert.equal(state.consumerRoot, CONSUMER_ROOT);
  assert.equal(state.packageName, TARGET);
  assert.equal(state.version, "1.2.3");
  assert.equal(state.contractVersion, 4);
  assert.equal(state.source, "config");
  assert.deepEqual(state.config, config);
  assert.deepEqual(state.failures, []);
  assert.equal(state.reason, null);
  assert.deepEqual(calls.resolveRoot, [[{ cwd: RESOLVED_CWD }]]);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(spawnImpl.calls.length, 0);
});

test("getProjectState reports installed-but-unconnected for an unambiguous discovered package", () => {
  const { tui } = createHarness({
    resolveRoot: () => CONSUMER_ROOT,
    readConfig: () => null,
    discover: () => ({
      packageName: TARGET,
      expectedVersion: null,
      source: "dependency",
      config: null,
    }),
    resolveInstalled: () => installedFixture(),
    verifyInstalled: () => ({ version: "1.2.3", contractVersion: 4 }),
  });

  const state = tui.getProjectState();

  assert.equal(state.status, PROJECT_STATES.INSTALLED);
  assert.equal(state.ok, true);
  assert.equal(state.connected, false);
  assert.equal(state.config, null);
  assert.equal(state.packageName, TARGET);
  assert.equal(state.version, "1.2.3");
  assert.equal(state.source, "dependency");
});

test("getProjectState reports empty with a useful reason when nothing is selected or installed", () => {
  const reasons = [
    "No supported @prism-system/ui-* package found in consumer dependencies; " +
      "install one and re-run the consumer command, or add .design-system/config.json.",
    "Cannot discover a design system: no .design-system/config.json and no consumer " +
      `package.json at ${CONSUMER_ROOT}/package.json.`,
  ];

  for (const reason of reasons) {
    const { tui, calls } = createHarness({
      resolveRoot: () => CONSUMER_ROOT,
      readConfig: () => null,
      discover: () => {
        throw new Error(reason);
      },
    });

    const state = tui.getProjectState();

    assert.equal(state.status, PROJECT_STATES.EMPTY);
    assert.equal(state.ok, false);
    assert.equal(state.connected, false);
    assert.equal(state.reason, reason);
    assert.deepEqual(state.failures, []);
    assert.equal(state.packageName, null);
    assert.equal(calls.resolveInstalled.length, 0);
  }
});

test("getProjectState reports an error for an invalid consumer config", () => {
  const reason = `Invalid consumer config ${CONSUMER_ROOT}/.design-system/config.json: bad JSON`;
  const { tui, calls } = createHarness({
    resolveRoot: () => CONSUMER_ROOT,
    readConfig: () => {
      throw new Error(reason);
    },
  });

  const state = tui.getProjectState();

  assert.equal(state.status, PROJECT_STATES.ERROR);
  assert.equal(state.reason, reason);
  assert.deepEqual(state.failures, [reason]);
  assert.equal(state.consumerRoot, CONSUMER_ROOT);
  assert.equal(calls.discover.length, 0);
});

test("getProjectState reports an error for ambiguous discovery and never guesses", () => {
  const reason =
    `Multiple supported @prism-system/ui-* packages found (${TARGET}, ${TARGET_B}); ` +
    "select one explicitly or add .design-system/config.json.";
  const { tui, calls } = createHarness({
    resolveRoot: () => CONSUMER_ROOT,
    readConfig: () => null,
    discover: () => {
      throw new Error(reason);
    },
  });

  const state = tui.getProjectState();

  assert.equal(state.status, PROJECT_STATES.ERROR);
  assert.deepEqual(state.failures, [reason]);
  assert.equal(calls.resolveInstalled.length, 0);
});

test("getProjectState reports an error when public manifest verification fails", () => {
  const reason = "Shipped manifest contractVersion null must be the numeric 4.";
  const { tui } = createHarness({
    resolveRoot: () => CONSUMER_ROOT,
    readConfig: () => null,
    discover: () => ({
      packageName: TARGET,
      expectedVersion: null,
      source: "metadata",
      config: null,
    }),
    resolveInstalled: () => installedFixture(),
    verifyInstalled: () => {
      throw new Error(reason);
    },
  });

  const state = tui.getProjectState();

  assert.equal(state.status, PROJECT_STATES.ERROR);
  assert.equal(state.packageName, TARGET);
  assert.equal(state.source, "metadata");
  assert.deepEqual(state.failures, [reason]);
});

test("getProjectState reports an error when the consumer root cannot be resolved", () => {
  const { tui, calls } = createHarness({
    resolveRoot: () => {
      throw new Error("Consumer root does not exist or is not a directory.");
    },
  });

  const state = tui.getProjectState();

  assert.equal(state.status, PROJECT_STATES.ERROR);
  assert.equal(state.consumerRoot, null);
  assert.equal(calls.readConfig.length, 0);
});

/* -------------------------------------------------------------------------- */
/* Read-only routing                                                          */
/* -------------------------------------------------------------------------- */

test("catalog and check methods route to the offline operations with exact arguments", () => {
  const { tui, calls } = createHarness({
    components: ({ cwd, name }) => ({ ok: true, cwd, name, components: [] }),
    tokens: ({ cwd, group }) => ({ ok: true, cwd, group, groups: [] }),
    check: ({ cwd, cssPath }) => ({ ok: true, cwd, cssPath, checks: [] }),
    doctor: ({ cwd }) => ({ ok: true, cwd, checks: [] }),
    usage: ({ cwd }) => ({ ok: true, cwd, findings: [] }),
  });

  const catalog = tui.listComponents({ name: "Button" });
  assert.equal(catalog.ok, true);
  assert.equal(calls.components[0][0].cwd, RESOLVED_CWD);
  assert.equal(calls.components[0][0].name, "Button");
  tui.listComponents();
  assert.equal(calls.components[1][0].name, undefined);

  const tokens = tui.listTokens({ group: "radius" });
  assert.equal(tokens.ok, true);
  assert.equal(calls.tokens[0][0].cwd, RESOLVED_CWD);
  assert.equal(calls.tokens[0][0].group, "radius");

  const check = tui.runCheck({ cssPath: "app/globals.css" });
  assert.equal(check.ok, true);
  assert.equal(calls.check[0][0].cwd, RESOLVED_CWD);
  assert.equal(calls.check[0][0].cssPath, "app/globals.css");
  tui.runCheck();
  assert.equal(calls.check[1][0].cssPath, undefined);

  const doctor = tui.runDoctor();
  assert.equal(doctor.ok, true);
  assert.deepEqual(calls.doctor, [[{ cwd: RESOLVED_CWD }]]);

  const usage = tui.runUsageCheck();
  assert.equal(usage.ok, true);
  assert.deepEqual(calls.usage, [[{ cwd: RESOLVED_CWD }]]);
});

test("read-only methods wrap thrown failures instead of crashing the UI", () => {
  const { tui } = createHarness({
    components: () => {
      throw new Error("not installed");
    },
    tokens: () => {
      throw new Error("missing prefixes");
    },
    doctor: () => {
      throw new Error("root missing");
    },
    usage: () => {
      throw new Error("usage failed");
    },
  });

  assert.deepEqual(tui.listComponents(), {
    ok: false,
    boundary: "components",
    failures: ["not installed"],
  });
  assert.deepEqual(tui.listTokens(), {
    ok: false,
    boundary: "tokens",
    failures: ["missing prefixes"],
  });
  assert.deepEqual(tui.runDoctor(), {
    ok: false,
    boundary: "doctor",
    failures: ["root missing"],
    checks: [],
  });
  assert.deepEqual(tui.runUsageCheck(), {
    ok: false,
    boundary: "usage",
    failures: ["usage failed"],
    findings: [],
  });
});

test("runTailwindCheck plans read-only with the explicit cssPath and never writes", () => {
  const plan = {
    cssPath: `${CONSUMER_ROOT}/app/globals.css`,
    packageName: TARGET,
    version: "1.2.3",
    before: '@import "tailwindcss";\n',
    after: `@import "tailwindcss";\n@import "${TARGET}/styles.css";\n`,
    changed: true,
  };
  const { tui, calls } = createHarness({
    tailwind: ({ cssPath, dryRun }) => ({
      ok: true,
      changed: false,
      dryRun,
      failures: [],
      plan: { ...plan, cssPath },
      changes: [{ kind: "css", path: `${CONSUMER_ROOT}/app/globals.css` }],
    }),
  });

  const result = tui.runTailwindCheck({ cssPath: "app/globals.css" });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.deepEqual(calls.tailwind, [
    [{ cwd: RESOLVED_CWD, cssPath: "app/globals.css", dryRun: true }],
  ]);
  assert.equal(result.plan.changed, true);

  const missing = tui.runTailwindCheck();
  assert.equal(missing.ok, false);
  assert.equal(missing.boundary, "arguments");
  assert.equal(missing.plan, null);
  assert.deepEqual(missing.changes, []);
  assert.equal(calls.tailwind.length, 1, "a missing cssPath must not call the planner");
});

test("search and inspect are explicit and forward the injected fetch implementation", async () => {
  const { tui, calls, fetchImpl } = createHarness({
    search: ({ query, size }) => ({
      registry: REGISTRY,
      query,
      size,
      results: [{ name: TARGET, version: "1.2.3" }],
    }),
    inspect: ({ package: packageName, version }) => ({
      package: packageName,
      version,
      registry: REGISTRY,
      manifest: { id: "system-a" },
    }),
  });

  const search = await tui.searchSystems({ query: "system", size: 5 });
  assert.equal(search.ok, true);
  assert.equal(search.results[0].name, TARGET);
  assert.deepEqual(calls.search, [[{ query: "system", size: 5, fetchImpl }]]);

  const inspect = await tui.inspectSystem({ packageName: TARGET, version: "1.2.3" });
  assert.equal(inspect.ok, true);
  assert.equal(inspect.manifest.id, "system-a");
  assert.deepEqual(calls.inspect, [[{ package: TARGET, version: "1.2.3", fetchImpl }]]);
});

test("search and inspect failures are reported, not thrown", async () => {
  const registryError = new Error("registry response exceeds the size limit");
  const { tui } = createHarness({
    search: () => {
      throw registryError;
    },
    inspect: () => {
      throw registryError;
    },
  });

  assert.deepEqual(await tui.searchSystems({ query: "x" }), {
    ok: false,
    boundary: "registry",
    failures: [registryError.message],
  });
  assert.deepEqual(await tui.inspectSystem({ packageName: TARGET }), {
    ok: false,
    boundary: "registry",
    failures: [registryError.message],
  });
});

/* -------------------------------------------------------------------------- */
/* Mutation previews                                                          */
/* -------------------------------------------------------------------------- */

test("previewMutation('install') runs one dry run and returns the package-manager plan", async () => {
  const { tui, calls, fetchImpl, spawnImpl } = createHarness({
    install: () => installDryRun(),
  });

  const preview = await tui.previewMutation({
    kind: "install",
    packageName: TARGET,
    version: "1.2.3",
    exact: true,
  });

  assert.equal(calls.install.length, 1);
  const options = calls.install[0][0];
  assert.equal(options.cwd, RESOLVED_CWD);
  assert.equal(options.package, TARGET);
  assert.equal(options.version, "1.2.3");
  assert.equal(options.saveDev, false);
  assert.equal(options.exact, true);
  assert.equal(options.dryRun, true);
  assert.equal(options.fetchImpl, fetchImpl);
  assert.equal(options.spawnImpl, spawnImpl);

  assert.equal(preview.ok, true);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.kind, "install");
  assert.equal(preview.packageName, TARGET);
  assert.equal(preview.version, "1.2.3");
  assert.equal(preview.manager, "pnpm");
  assert.deepEqual(preview.material.command, commandFor("1.2.3"));
  assert.deepEqual(preview.material.effects, [
    { kind: "dependency", manager: "pnpm", command: commandFor("1.2.3") },
  ]);
  assert.deepEqual(preview.plannedChanges, preview.material.effects);
  assert.deepEqual(preview.failures, []);
});

test("previewMutation('use') forwards explicit flags and includes the Tailwind CSS plan", async () => {
  const { tui, calls } = createHarness({
    use: () => makeUseDryRun(),
  });

  const preview = await tui.previewMutation({
    kind: "use",
    packageName: TARGET,
    version: "1.2.3",
    saveDev: true,
    exact: true,
    strict: false,
    ignore: ["dist/**"],
    checkUsage: true,
    tailwind: true,
    cssPath: "app/globals.css",
  });

  assert.equal(calls.use.length, 1);
  const options = calls.use[0][0];
  assert.equal(options.cwd, RESOLVED_CWD);
  assert.equal(options.package, TARGET);
  assert.equal(options.version, "1.2.3");
  assert.equal(options.saveDev, true);
  assert.equal(options.exact, true);
  assert.equal(options.strict, false);
  assert.deepEqual(options.ignore, ["dist/**"]);
  assert.equal(options.checkUsage, true);
  assert.equal(options.tailwind, true);
  assert.equal(options.cssPath, "app/globals.css");
  assert.equal(options.dryRun, true);

  assert.equal(preview.ok, true);
  assert.deepEqual(
    preview.plannedChanges.map((change) => change.kind),
    ["dependency", "css", "connect", "connect", "connect"],
  );
  assert.equal(preview.material.tailwind.changed, true);
  assert.match(preview.material.tailwind.after, /ui-system-a\/tailwind\.css/);
  assert.equal(preview.material.requested.checkUsage, true);
  assert.equal(preview.material.requested.cssPath, "app/globals.css");
});

test("previewMutation('connect') plans configure-only file effects and never passes check mode", async () => {
  const { tui, calls } = createHarness({
    connect: () => connectDryRun(),
  });

  const preview = await tui.previewMutation({ kind: "connect", strict: true });

  assert.equal(calls.connect.length, 1);
  const options = calls.connect[0][0];
  assert.equal(options.cwd, RESOLVED_CWD);
  assert.equal(options.strict, true);
  assert.equal(options.dryRun, true);
  assert.equal(Object.prototype.hasOwnProperty.call(options, "check"), false);

  assert.equal(preview.ok, true);
  assert.equal(preview.packageName, TARGET);
  assert.equal(preview.version, "1.2.3");
  assert.deepEqual(
    preview.material.effects.map((effect) => [effect.kind, effect.changed]),
    [
      ["config", true],
      ["agents", true],
      ["root-agents", true],
    ],
  );
  assert.equal(preview.material.effects[0].before, null);
  assert.match(preview.material.effects[0].after, new RegExp(TARGET));
});

test("previewMutation('upgrade') forwards the exact version and exposes the manifest diff", async () => {
  const { tui, calls } = createHarness({
    upgrade: () => upgradeDryRun(),
  });

  const preview = await tui.previewMutation({
    kind: "upgrade",
    packageName: TARGET,
    version: "2.0.0",
  });

  assert.equal(calls.upgrade[0][0].package, TARGET);
  assert.equal(calls.upgrade[0][0].version, "2.0.0");
  assert.equal(calls.upgrade[0][0].dryRun, true);
  assert.equal(preview.ok, true);
  assert.equal(preview.material.requested.package, TARGET);
  assert.equal(preview.material.requested.version, "2.0.0");
  assert.equal(preview.material.fromVersion, "1.2.3");
  assert.equal(preview.material.toVersion, "2.0.0");
  assert.deepEqual(preview.material.diff.components.added, ["Metric"]);
  assert.deepEqual(preview.material.diff.tokens.added, { radius: ["xl"] });
  assert.equal(preview.manager, "pnpm");
});

/* -------------------------------------------------------------------------- */
/* Preview/execute safety                                                     */
/* -------------------------------------------------------------------------- */

test("a canceled flow is supported: previewing alone never invokes the real mutation", async () => {
  const { tui, calls } = createHarness({
    install: () => installDryRun(),
  });

  const preview = await tui.previewMutation({ kind: "install", packageName: TARGET });

  assert.equal(preview.ok, true);
  assert.equal(calls.install.length, 1);
  assert.deepEqual(dryRunFlags(calls, "install"), [true]);
  // The UI cancels by simply not calling executeMutation.
});

test("executeMutation re-runs the dry run and then invokes the operation exactly once for real", async () => {
  const { tui, calls } = createHarness({
    install: (options) =>
      options.dryRun
        ? installDryRun()
        : {
            ok: true,
            failures: [],
            consumerRoot: CONSUMER_ROOT,
            manager: "pnpm",
            package: TARGET,
            version: "1.2.3",
            command: commandFor("1.2.3"),
            installedDir: `${CONSUMER_ROOT}/node_modules/${TARGET}`,
          },
  });

  const action = { kind: "install", packageName: TARGET, version: "1.2.3" };
  const preview = await tui.previewMutation(action);
  const outcome = await tui.executeMutation(action, preview);

  assert.deepEqual(dryRunFlags(calls, "install"), [true, true, false]);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.applied, true);
  assert.equal(outcome.changed, true);
  assert.equal(outcome.boundary, null);
  assert.equal(outcome.result.version, "1.2.3");
  assert.deepEqual(outcome.failures, []);
  assert.equal(outcome.preview.material.command.args.at(-1), `${TARGET}@1.2.3`);
});

test("executeMutation('connect') applies one configure-only write after a matching plan", async () => {
  const { tui, calls } = createHarness({
    connect: (options) =>
      options.dryRun
        ? connectDryRun()
        : {
            ok: true,
            changed: true,
            check: false,
            dryRun: false,
            failures: [],
            plan: connectDryRun().plan,
            changes: connectDryRun().changes,
          },
  });

  const action = { kind: "connect", strict: true };
  const preview = await tui.previewMutation(action);
  const outcome = await tui.executeMutation(action, preview);

  assert.deepEqual(dryRunFlags(calls, "connect"), [true, true, false]);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.applied, true);
  assert.equal(outcome.changed, true);
  assert.equal(calls.connect[2][0].check, undefined);
});

test("executeMutation fails closed without a real invocation when the upgrade diff drifts", async () => {
  let dryRuns = 0;
  const { tui, calls } = createHarness({
    upgrade: (options) => {
      if (options.dryRun !== true) {
        throw new Error("The real upgrade must never run after plan drift.");
      }
      dryRuns += 1;
      if (dryRuns === 1) return upgradeDryRun();
      const drifted = upgradeDiff();
      drifted.components.removed.push("Timeline");
      return upgradeDryRun({ toVersion: "2.0.1", diff: drifted });
    },
  });

  const action = { kind: "upgrade", packageName: TARGET, version: "2.0.0" };
  const preview = await tui.previewMutation(action);

  assert.deepEqual(preview.material.diff.components.added, ["Metric"]);
  assert.equal(preview.material.toVersion, "2.0.0");

  const outcome = await tui.executeMutation(action, preview);

  assert.equal(outcome.ok, false);
  assert.equal(outcome.boundary, "preview-drift");
  assert.equal(outcome.applied, false);
  assert.equal(outcome.changed, false);
  assert.deepEqual(dryRunFlags(calls, "upgrade"), [true, true]);
  // The drift is reported as material: the fresh preview exposes the new diff/version.
  assert.equal(outcome.preview.material.toVersion, "2.0.1");
  assert.deepEqual(outcome.preview.material.diff.components.removed, ["Timeline"]);
});

test("executeMutation fails closed when the accepted preview was tampered with or failed", async () => {
  const { tui, calls } = createHarness({
    install: () => installDryRun(),
  });
  const action = { kind: "install", packageName: TARGET };

  const rejected = await tui.executeMutation(action, {
    ok: false,
    dryRun: true,
    kind: "install",
    material: null,
  });
  assert.equal(rejected.boundary, "preview");
  assert.equal(calls.install.length, 0);

  const preview = await tui.previewMutation(action);
  const tampered = {
    ...preview,
    material: {
      ...preview.material,
      command: { manager: "npm", args: ["install", `${TARGET}@9.9.9`] },
    },
  };
  const outcome = await tui.executeMutation(action, tampered);

  assert.equal(outcome.boundary, "preview-drift");
  assert.deepEqual(dryRunFlags(calls, "install"), [true, true]);
  assert.equal(outcome.result, null);
});

test("executeMutation returns the operation failure without a rollback claim", async () => {
  const { tui, calls } = createHarness({
    install: (options) =>
      options.dryRun
        ? installDryRun()
        : {
            ok: false,
            boundary: "manager",
            failures: ["pnpm exited with code 1."],
            command: commandFor("1.2.3"),
          },
  });

  const action = { kind: "install", packageName: TARGET };
  const preview = await tui.previewMutation(action);
  const outcome = await tui.executeMutation(action, preview);

  assert.deepEqual(dryRunFlags(calls, "install"), [true, true, false]);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.applied, false);
  assert.equal(outcome.changed, false);
  assert.equal(outcome.boundary, "manager");
  assert.deepEqual(outcome.failures, ["pnpm exited with code 1."]);
});

test("previewMutation('use') retains each managed file's exact before/after material", async () => {
  const { tui } = createHarness({ use: () => makeUseDryRun() });

  const preview = await tui.previewMutation({
    kind: "use",
    packageName: TARGET,
    version: "1.2.3",
  });

  assert.equal(preview.ok, true);
  const connectEffects = preview.material.effects.filter((effect) => effect.kind === "connect");
  assert.deepEqual(
    connectEffects.map((effect) => effect.fileKind),
    ["config", "agents", "root-agents"],
  );
  assert.equal(connectEffects[0].before, null);
  assert.match(connectEffects[0].after, new RegExp(TARGET));
  assert.equal(connectEffects[2].before, "# Root\n");
  assert.match(connectEffects[2].after, /BEGIN managed/);
  assert.ok(connectEffects.every((effect) => effect.changed === true));
  assert.deepEqual(
    connectEffects.map((effect) => effect.path),
    [
      `${CONSUMER_ROOT}/.design-system/config.json`,
      `${CONSUMER_ROOT}/.design-system/AGENTS.md`,
      `${CONSUMER_ROOT}/AGENTS.md`,
    ],
  );
});

test("executeMutation('use') passes the final fresh preview's connect plan as the write precondition", async () => {
  const { tui, calls } = createHarness({
    use: (options) =>
      options.dryRun
        ? makeUseDryRun()
        : {
            ok: true,
            failures: [],
            install: installDryRun(),
            connect: { ok: true, changed: true },
            usage: null,
          },
  });

  const action = { kind: "use", packageName: TARGET, version: "1.2.3" };
  const preview = await tui.previewMutation(action);
  const outcome = await tui.executeMutation(action, preview);

  assert.deepEqual(dryRunFlags(calls, "use"), [true, true, false]);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.applied, true);
  assert.deepEqual(calls.use[2][0].expectedConnectPlan, makeUseConnectPlan());
  assert.equal(
    calls.use[2][0].expectedConnectPlan.files[0].after,
    preview.result.connectPlan.files[0].after,
  );
});

test("executeMutation('upgrade') forwards the precondition and reports a refused reconnect", async () => {
  const { tui, calls } = createHarness({
    upgrade: (options) => {
      if (options.dryRun) return upgradeDryRun();
      return {
        ok: false,
        boundary: "connect-precondition",
        failures: [
          "Refusing to write the consumer contract: the current connect plan no longer " +
            "matches the previewed plan (root-agents (...): before). No connect files were " +
            "written and the dependency change is not rolled back; preview again and confirm " +
            "the new plan.",
        ],
        note:
          "The package was updated and verified, but reconnect did not complete because the " +
          "consumer files changed after the preview. No connect files were written. No rollback " +
          "was attempted; the dependency change remains.",
        connect: { ok: false, boundary: "precondition" },
      };
    },
  });

  const action = { kind: "upgrade", packageName: TARGET, version: "2.0.0" };
  const preview = await tui.previewMutation(action);
  const outcome = await tui.executeMutation(action, preview);

  assert.deepEqual(dryRunFlags(calls, "upgrade"), [true, true, false]);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.applied, true);
  assert.equal(outcome.changed, true);
  assert.equal(outcome.partial, true);
  assert.equal(outcome.boundary, "connect-precondition");
  assert.match(outcome.failures.join(" "), /No connect files were written/);
  assert.match(outcome.result.note, /No rollback was attempted/);
  assert.deepEqual(calls.upgrade[2][0].expectedConnectPlan, upgradeConnectPlan("2.0.0"));
});

test("executeMutation omits the precondition when the preview exposes no connect plan", async () => {
  const bare = makeUseDryRun();
  delete bare.connectPlan;
  const { tui, calls } = createHarness({
    use: (options) =>
      options.dryRun
        ? bare
        : {
            ok: true,
            failures: [],
            install: installDryRun(),
            connect: { ok: true, changed: true },
          },
  });

  const action = { kind: "use", packageName: TARGET, version: "1.2.3" };
  const preview = await tui.previewMutation(action);
  const outcome = await tui.executeMutation(action, preview);

  assert.equal(outcome.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(calls.use[2][0], "expectedConnectPlan"), false);
});

test("executeMutation fails closed when a managed file changes between preview and confirmation", async () => {
  let dryRuns = 0;
  const { tui, calls } = createHarness({
    use: (options) => {
      if (options.dryRun !== true) {
        throw new Error("The real use must never run after managed-file drift.");
      }
      dryRuns += 1;
      const result = makeUseDryRun();
      if (dryRuns === 2) {
        const injected = '{"injected":true}\n';
        result.connectPlan.files[0].before = injected;
        result.plannedChanges = result.plannedChanges.map((change) =>
          change.kind === "connect" && change.fileKind === "config"
            ? { ...change, before: injected }
            : change,
        );
      }
      return result;
    },
  });

  const action = { kind: "use", packageName: TARGET, version: "1.2.3" };
  const preview = await tui.previewMutation(action);
  const outcome = await tui.executeMutation(action, preview);

  assert.equal(outcome.ok, false);
  assert.equal(outcome.boundary, "preview-drift");
  assert.equal(outcome.applied, false);
  assert.deepEqual(dryRunFlags(calls, "use"), [true, true]);
  assert.equal(
    outcome.preview.material.effects.find((effect) => effect.fileKind === "config").before,
    '{"injected":true}\n',
  );
});

/* -------------------------------------------------------------------------- */
/* Invalid actions                                                            */
/* -------------------------------------------------------------------------- */

test("unsupported or incomplete actions fail before any operation runs", async () => {
  const { tui, calls } = createHarness();

  const actions = [
    null,
    {},
    { kind: "tailwind", packageName: TARGET },
    { kind: "install" },
    { kind: "use" },
    { kind: "use", packageName: TARGET, tailwind: true },
    { kind: "use", packageName: TARGET, ignore: ["dist/**"], checkUsage: false },
    { kind: "upgrade", packageName: TARGET },
  ];

  for (const action of actions) {
    const preview = await tui.previewMutation(action);
    assert.equal(preview.ok, false, JSON.stringify(action));
    assert.equal(preview.boundary, "action", JSON.stringify(action));
    assert.equal(preview.material, null);
  }

  const outcome = await tui.executeMutation({ kind: "install" }, null);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.boundary, "action");

  for (const name of OPERATION_NAMES) {
    assert.equal(calls[name].length, 0, `${name} must not run for invalid actions`);
  }
});
