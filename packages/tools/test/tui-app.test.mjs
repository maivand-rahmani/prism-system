import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";

import TuiApp from "../src/tui-app.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({
  id: "tui-test",
  title: "TUI test host",
  component: () => null,
});

const TICK = 8;
const pause = (milliseconds = TICK) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, description, timeout = 1200) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await pause();
  }
  assert.fail(`Timed out waiting for ${description}. Last frame:\n${currentFrame}`);
}

let currentFrame = "<no frame>";

function state(status, additions = {}) {
  return {
    ok: status === "connected" || status === "installed",
    status,
    cwd: "/consumer/demo-app",
    packageName: status === "empty" ? null : "@prism-system/ui-a",
    version: status === "empty" ? null : "1.2.3",
    contractVersion: status === "connected" || status === "installed" ? 4 : null,
    reason: status === "empty" ? "No system selected yet." : null,
    failures: [],
    config:
      status === "connected"
        ? { package: "@prism-system/ui-a", version: "1.2.3", strict: true }
        : null,
    ...additions,
  };
}

function connectedState() {
  return state("connected");
}

function componentCatalog() {
  const components = [
    { name: "Button", required: true, optional: false, available: true, variants: ["primary"] },
    { name: "Input", required: true, optional: false, available: true, variants: [] },
    { name: "Card", required: true, optional: false, available: true, variants: [] },
    { name: "Accordion", required: false, optional: true, available: false, variants: null },
    { name: "DatePicker", required: false, optional: true, available: true, variants: ["compact"] },
  ];
  return {
    ok: true,
    package: "@prism-system/ui-a",
    version: "1.2.3",
    contractVersion: 4,
    components,
    available: ["Button", "Input", "Card", "DatePicker"],
    unavailable: ["Accordion"],
    capabilities: {
      categories: {
        composition: {
          required: ["Card"],
          optional: ["Accordion"],
          available: ["Card"],
          unavailable: ["Accordion"],
        },
        forms: {
          required: ["Input"],
          optional: ["DatePicker"],
          available: ["Input", "DatePicker"],
          unavailable: [],
        },
      },
    },
  };
}

function tokenCatalog() {
  return {
    ok: true,
    package: "@prism-system/ui-a",
    version: "1.2.3",
    contractVersion: 4,
    groupNames: ["themes", "spacing"],
    groups: [
      {
        group: "themes",
        tokens: [
          {
            name: "color.text.primary",
            path: "light.color.text.primary",
            cssVariable: "--maivand-color-text-primary",
            tailwind: {
              namespace: "color",
              variable: "--color-maivand-text-primary",
              utility: "text-maivand-text-primary",
              variant: null,
            },
          },
          {
            name: "color.surface.canvas",
            path: "light.color.surface.canvas",
            cssVariable: "--maivand-color-surface-canvas",
            tailwind: {
              namespace: "color",
              variable: "--color-maivand-surface-canvas",
              utility: "bg-maivand-surface-canvas",
              variant: null,
            },
          },
        ],
      },
      {
        group: "spacing",
        tokens: [
          {
            name: "spacing.scale.4",
            path: "scale.4",
            cssVariable: "--maivand-spacing-4",
            tailwind: null,
          },
        ],
      },
    ],
  };
}

function previewFor(action) {
  const manager = action.kind === "connect" ? null : "pnpm";
  const command = manager
    ? {
        manager,
        verb: action.kind === "upgrade" ? "add" : "add",
        args: ["add", `${action.packageName}@${action.version}`],
      }
    : null;
  return {
    ok: true,
    dryRun: true,
    kind: action.kind,
    cwd: "/consumer/demo-app",
    packageName: action.packageName,
    version: action.version ?? "1.2.3",
    manager,
    command,
    plannedChanges: manager
      ? [{ kind: "dependency", manager, command }]
      : [{ kind: "connect", path: "/consumer/demo-app/.design-system/config.json", changed: true }],
    diff:
      action.kind === "upgrade"
        ? {
            components: { added: ["Meter"], removed: ["Avatar"], changed: [] },
            tokens: { added: { spacing: ["scale.8"] }, removed: {} },
            metadata: {},
            exports: { added: [], removed: [], changed: [] },
          }
        : null,
    tailwind: null,
    material: { kind: action.kind },
    result: { ok: true },
  };
}

function makeServices(overrides = {}) {
  return {
    cwd: "/consumer/demo-app",
    getProjectState: () => state("empty"),
    searchSystems: async () => ({ ok: true, results: [] }),
    inspectSystem: async ({ packageName, version }) => ({
      ok: true,
      package: packageName,
      version,
      manifest: {
        package: packageName,
        name: "System A",
        version,
        contractVersion: 4,
        design: { density: "comfortable", theme: "night", radius: "soft" },
        components: { Button: {}, Input: {}, Card: {} },
        tokens: { groups: { themes: ["light.color.text.primary"] } },
      },
    }),
    listComponents: () => componentCatalog(),
    listTokens: () => tokenCatalog(),
    runCheck: () => ({ ok: true, status: "passed", summary: "3 passed, 0 failed", checks: [] }),
    runDoctor: () => ({
      ok: true,
      checks: [{ label: "consumer config", ok: true, detail: "connected" }],
    }),
    runUsageCheck: () => ({
      ok: true,
      scanned: 2,
      findings: [],
      summary: "Scanned 2 file(s); 0 error(s), 0 warning(s).",
    }),
    runTailwindCheck: ({ cssPath }) => ({
      ok: true,
      dryRun: true,
      plan: {
        cssPath: `/consumer/demo-app/${cssPath}`,
        packageName: "@prism-system/ui-a",
        version: "1.2.3",
        changed: true,
      },
      changes: [{ kind: "css", path: `/consumer/demo-app/${cssPath}` }],
      failures: [],
    }),
    previewMutation: async (action) => previewFor(action),
    executeMutation: async () => ({ ok: true, applied: true, changed: true, failures: [] }),
    ...overrides,
  };
}

function tree(services, { mouseEventSource, mouseDiagnostics } = {}) {
  return h(
    FrameworkProvider,
    { registry, defaultScreen: "tui-test", mouseEventSource, mouseDiagnostics },
    h(MouseLayout, { origin: { x: 0, y: 0 }, flexDirection: "column" }, h(TuiApp, { services })),
  );
}

function start(services, options = {}) {
  const { mouseEventSource, mouseDiagnostics, columns, rows } = options;
  const app = render(tree(services, { mouseEventSource, mouseDiagnostics }));
  if (columns !== undefined) {
    Object.defineProperty(app.stdout, "columns", {
      configurable: true,
      value: columns,
    });
  }
  if (rows !== undefined) {
    Object.defineProperty(app.stdout, "rows", {
      configurable: true,
      value: rows,
    });
  }
  if (columns !== undefined || rows !== undefined) app.stdout.emit("resize");
  currentFrame = app.lastFrame() ?? "";
  return app;
}

function createMouseEventSource() {
  const listeners = new Set();
  return {
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    publish(event) {
      for (const listener of [...listeners]) listener(event);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function mousePacket(type, x, y, extra = {}) {
  const base = { x, y, shift: false, alt: false, ctrl: false };
  if (type === "press" || type === "release") return { ...base, type, button: "left" };
  if (type === "move") return { ...base, type, button: "none" };
  return { ...base, type: "wheel", direction: extra.direction };
}

function centerOfMeasuredBounds(bounds) {
  assert.ok(bounds.width > 0 && bounds.height > 0, "mouse hit target must have measured area");
  return {
    x: bounds.x + Math.floor(bounds.width / 2),
    y: bounds.y + Math.floor(bounds.height / 2),
  };
}

async function publishClick(mouseSource, bounds) {
  const { x, y } = centerOfMeasuredBounds(bounds);
  mouseSource.publish(mousePacket("press", x, y));
  mouseSource.publish(mousePacket("release", x, y));
  await pause();
}

async function send(app, input) {
  app.stdin.write(input);
  await pause();
  currentFrame = app.lastFrame() ?? "";
  return currentFrame;
}

async function typeText(app, text) {
  for (const character of text) await send(app, character);
  return app.lastFrame();
}

async function press(app, key) {
  const input =
    {
      enter: "\r",
      escape: "\u001b",
      down: "\u001b[B",
      right: "\u001b[C",
      left: "\u001b[D",
    }[key] ?? key;
  return send(app, input);
}

async function settle(app) {
  await pause(30);
  currentFrame = app.lastFrame() ?? "";
  return currentFrame;
}

function bodyFrame(frame) {
  const footerStart = frame.toUpperCase().lastIndexOf("ACTIONS");
  return footerStart < 0 ? frame : frame.slice(0, footerStart);
}

function footerFrame(frame) {
  const footerStart = frame.toUpperCase().lastIndexOf("ACTIONS");
  return footerStart < 0 ? "" : frame.slice(footerStart);
}

test("renders empty, installed-unconnected, and connected states without loading a catalog", async () => {
  let searches = 0;
  const emptyServices = makeServices({
    searchSystems: async () => {
      searches += 1;
      return { ok: true, results: [] };
    },
  });
  const empty = start(emptyServices);
  await settle(empty);
  assert.match(empty.lastFrame(), /No system connected/i);
  assert.match(empty.lastFrame(), /Browse catalog/i);
  assert.doesNotMatch(bodyFrame(empty.lastFrame()), /Browse catalog|Search catalog|\bSearch\b/i);
  assert.match(footerFrame(empty.lastFrame()), /Browse catalog\s+\(b\)/i);
  assert.match(footerFrame(empty.lastFrame()), /Search catalog\s+\(s\)/i);
  assert.equal(searches, 0, "mount only reads local project state");
  await press(empty, "s");
  assert.match(empty.lastFrame(), /Search the registry/);
  assert.match(footerFrame(empty.lastFrame()), /Search catalog\s+\(Enter\)/i);
  empty.unmount();

  const installed = start(makeServices({ getProjectState: () => state("installed") }));
  await settle(installed);
  assert.match(installed.lastFrame(), /Installed · not connected/i);
  assert.match(installed.lastFrame(), /Configure \/ Connect/i);
  assert.doesNotMatch(installed.lastFrame(), /Browse catalog|Install only/i);
  installed.unmount();

  const connected = start(makeServices({ getProjectState: connectedState }));
  await settle(connected);
  const frame = connected.lastFrame();
  assert.match(frame, /CONNECTED/i);
  assert.match(frame, /@prism-system\/ui-a@1\.2\.3/);
  assert.match(frame, /contract 4/i);
  assert.match(frame, /\/consumer\/demo-app/);
  assert.match(frame, /Systems/);
  assert.match(frame, /Components/);
  assert.match(frame, /Tokens/);
  assert.match(frame, /Checks/);
  assert.doesNotMatch(
    bodyFrame(frame),
    /Inspect manifest|Reconnect|Upgrade version|Refresh state/i,
    "connected-system actions are kept in the footer",
  );
  assert.match(footerFrame(frame), /Inspect manifest/);
  connected.unmount();
});

test("catalog loads only on explicit browse; query submit, refresh, loading, and registry errors stay explicit", async () => {
  let releaseSearch;
  const calls = [];
  const services = makeServices({
    searchSystems: ({ query, size }) => {
      calls.push({ query, size });
      if (calls.length === 1)
        return new Promise((resolve) => {
          releaseSearch = resolve;
        });
      if (calls.length === 2)
        return Promise.resolve({
          ok: true,
          results: [
            {
              name: "@prism-system/ui-a",
              version: "1.2.3",
              description: "Quiet, focused surfaces.",
            },
          ],
        });
      return Promise.resolve({ ok: false, failures: ["registry unavailable"] });
    },
  });
  const app = start(services);
  await settle(app);
  assert.equal(calls.length, 0);
  await press(app, "b");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, "");
  assert.equal(calls[0].size, 50);
  assert.match(app.lastFrame(), /Searching catalog/i);
  releaseSearch({
    ok: true,
    results: [
      { name: "@prism-system/ui-a", version: "1.2.3", description: "Quiet, focused surfaces." },
    ],
  });
  await waitFor(() => /Quiet, focused surfaces/.test(app.lastFrame() ?? ""), "catalog results");

  await press(app, "/");
  await typeText(app, "maivand");
  await press(app, "enter");
  await waitFor(() => calls.length === 2, "query search");
  await waitFor(() => /@prism-system\/ui-a@1\.2\.3/.test(app.lastFrame() ?? ""), "query results");
  assert.deepEqual(calls[1], { query: "maivand", size: 50 });

  await press(app, "r");
  await waitFor(() => calls.length === 3, "explicit catalog refresh");
  await waitFor(() => /registry unavailable/.test(app.lastFrame() ?? ""), "registry failure");
  assert.match(app.lastFrame(), /ERROR|Registry error/i);
  app.unmount();
});

test("inspects a selected system before install and requires confirmation; Escape never executes", async () => {
  const mutations = [];
  const executions = [];
  let projectReads = 0;
  const services = makeServices({
    getProjectState: () => {
      projectReads += 1;
      return projectReads === 1 ? state("empty") : state("installed");
    },
    searchSystems: async () => ({
      ok: true,
      results: [{ name: "@prism-system/ui-a", version: "1.2.3", description: "System A" }],
    }),
    previewMutation: async (action) => {
      mutations.push(action);
      return previewFor(action);
    },
    executeMutation: async (action, acceptedPreview) => {
      executions.push({ action, acceptedPreview });
      return { ok: true, applied: true, changed: true, failures: [] };
    },
  });
  const app = start(services);
  await settle(app);
  await press(app, "b");
  await settle(app);
  assert.equal(mutations.length, 0);
  await press(app, "enter");
  await waitFor(
    () => /Published manifest details/.test(app.lastFrame() ?? ""),
    "explicit manifest inspection",
  );
  assert.match(app.lastFrame(), /Exact version: 1\.2\.3/);
  assert.match(app.lastFrame(), /Install only/);
  assert.doesNotMatch(bodyFrame(app.lastFrame()), /Install only|Use\s*&\s*connect/i);
  assert.match(footerFrame(app.lastFrame()), /Install only/);
  assert.match(footerFrame(app.lastFrame()), /Use\s*&\s*connect/i);
  await press(app, "i");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "install confirmation");
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].kind, "install");
  assert.equal(mutations[0].version, "1.2.3");
  assert.match(app.lastFrame(), /PACKAGE MANAGER/);
  assert.match(app.lastFrame(), /pnpm add/);
  assert.match(app.lastFrame(), /\/consumer\/demo-app/);
  await press(app, "escape");
  await settle(app);
  assert.equal(executions.length, 0, "cancel is read-only and must not call executeMutation");
  assert.match(app.lastFrame(), /Cancelled/i);

  await press(app, "i");
  await waitFor(
    () => /Confirm planned change/.test(app.lastFrame() ?? ""),
    "second install confirmation",
  );
  await press(app, "y");
  await waitFor(
    () => /Configure this system/.test(app.lastFrame() ?? ""),
    "refreshed installed state",
  );
  assert.equal(
    executions.length,
    1,
    "one explicit yes results in exactly one executeMutation call",
  );
  assert.equal(executions[0].action.kind, "install");
  assert.equal(executions[0].acceptedPreview.kind, "install");
  assert.equal(projectReads, 2, "local project state refreshes after mutation");
  app.unmount();
});

test("use preview clearly separates install-and-connect and never executes before yes", async (t) => {
  const previousNoColor = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  t.after(() => {
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
  });
  const executed = [];
  const configBefore = '{\n  "strict": false,\n  "marker": "CONFIG_BEFORE_EXACT"\n}';
  const configAfter = [
    "{",
    '  "strict": true,',
    ...Array.from(
      { length: 34 },
      (_, index) => `  "reviewLine${index}": "exact planned content ${index}",`,
    ),
    '  "marker": "USE_AFTER_MARKER"',
    "}",
  ].join("\n");
  const agentsAfter = [
    "# Consumer guidance",
    ...Array.from(
      { length: 34 },
      (_, index) => `Managed guidance line ${index + 1}: exact content.`,
    ),
    "AGENTS_AFTER_MARKER",
  ].join("\n");
  const services = makeServices({
    searchSystems: async () => ({
      ok: true,
      results: [{ name: "@prism-system/ui-a", version: "1.2.3", description: "System A" }],
    }),
    previewMutation: async (action) => ({
      ...previewFor(action),
      plannedChanges: [
        ...previewFor(action).plannedChanges,
        {
          kind: "config",
          path: "/consumer/demo-app/.design-system/config.json",
          changed: true,
          before: configBefore,
          after: configAfter,
        },
        {
          kind: "agents",
          path: "/consumer/demo-app/AGENTS.md",
          changed: true,
          before: null,
          after: agentsAfter,
        },
      ],
    }),
    executeMutation: async (action, preview) => {
      executed.push({ action, preview });
      return { ok: true, applied: true, failures: [] };
    },
  });
  const app = start(services);
  await settle(app);
  await press(app, "b");
  await settle(app);
  await press(app, "enter");
  await waitFor(
    () => /Published manifest details/.test(app.lastFrame() ?? ""),
    "published manifest details",
  );
  await press(app, "u");
  await waitFor(
    () => /Use · installs and connects/.test(app.lastFrame() ?? ""),
    "use confirmation scope",
  );
  assert.match(app.lastFrame(), /Strict usage check: not included/);
  assert.match(app.lastFrame(), /CSS changes: not included/);
  assert.match(app.lastFrame(), /Exact managed file content · 2 files/);
  assert.match(app.lastFrame(), /\.design-system\/config\.json/);
  assert.equal(executed.length, 0);

  await press(app, "v");
  await waitFor(
    () => /CONFIG_BEFORE_EXACT/.test(app.lastFrame() ?? ""),
    "exact config before content",
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 38 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 12 });
  app.stdout.emit("resize");
  await settle(app);
  assert.ok(
    app
      .lastFrame()
      .replace(/\s/g, "")
      .includes("PATH/consumer/demo-app/.design-system/config.json"),
    "the wrapped path remains readable on a narrow terminal",
  );
  assert.match(app.lastFrame(), /BEFORE\s+PRESENT/);
  assert.match(app.lastFrame(), /AFTER\s+PRESENT/);
  assert.match(app.lastFrame().replace(/\s+/g, " "), /Confirm & apply\s+\(y \/ Enter\)/);
  assert.doesNotMatch(app.lastFrame(), /USE_AFTER_MARKER/);
  for (let index = 0; index < 80 && !/USE_AFTER_MARKER/.test(app.lastFrame() ?? ""); index += 1) {
    await press(app, "down");
  }
  assert.match(
    app.lastFrame(),
    /USE_AFTER_MARKER/,
    "the full after content is reachable by scrolling",
  );

  await press(app, "right");
  await waitFor(
    () => /\/consumer\/demo-app\/AGENTS\.md/.test(app.lastFrame() ?? ""),
    "next managed file",
  );
  assert.match(app.lastFrame(), /AGENTS · CHANGED/);
  assert.match(app.lastFrame(), /BEFORE\s+MISSING/);
  for (
    let index = 0;
    index < 80 && !/AGENTS_AFTER_MARKER/.test(app.lastFrame() ?? "");
    index += 1
  ) {
    await press(app, "down");
  }
  assert.match(app.lastFrame(), /AGENTS_AFTER_MARKER/);
  await press(app, "v");
  await press(app, "enter");
  await waitFor(() => executed.length === 1, "one confirmed use mutation");
  assert.equal(executed.length, 1);
  assert.equal(executed[0].action.kind, "use");
  assert.equal(executed[0].action.checkUsage, false);
  assert.equal(executed[0].action.tailwind, false);
  app.unmount();
});

test("preview and execution failures remain explicit and never look successful", async () => {
  let projectReads = 0;
  let previewCalls = 0;
  const executions = [];
  const services = makeServices({
    getProjectState: () => {
      projectReads += 1;
      return state("empty");
    },
    searchSystems: async () => ({
      ok: true,
      results: [{ name: "@prism-system/ui-a", version: "1.2.3", description: "System A" }],
    }),
    previewMutation: async (action) => {
      previewCalls += 1;
      if (previewCalls === 1) return { ok: false, failures: ["published manifest changed"] };
      return previewFor(action);
    },
    executeMutation: async (action) => {
      executions.push(action);
      return { ok: false, failures: ["package manager exited with code 1"] };
    },
  });
  const app = start(services);
  await settle(app);
  await press(app, "b");
  await settle(app);
  await press(app, "enter");
  await waitFor(
    () => /Published manifest details/.test(app.lastFrame() ?? ""),
    "published manifest details",
  );

  await press(app, "i");
  await waitFor(() => /published manifest changed/.test(app.lastFrame() ?? ""), "preview failure");
  assert.doesNotMatch(app.lastFrame(), /Confirm planned change/);
  assert.equal(executions.length, 0, "a failed preview cannot be executed");

  await press(app, "i");
  await waitFor(
    () => /Confirm planned change/.test(app.lastFrame() ?? ""),
    "successful retry preview",
  );
  await press(app, "y");
  await waitFor(
    () => /package manager exited with code 1/.test(app.lastFrame() ?? ""),
    "execution failure",
  );
  assert.match(app.lastFrame(), /ERROR|failed/i);
  assert.doesNotMatch(app.lastFrame(), /Install complete/i);
  assert.equal(executions.length, 1);
  assert.equal(projectReads, 2, "local project state is refreshed after the failed execution");
  app.unmount();
});

test("installed-unconnected users can Configure / Connect without a catalog or reinstall route", async () => {
  let searches = 0;
  let reads = 0;
  const actions = [];
  const services = makeServices({
    getProjectState: () => {
      reads += 1;
      return reads === 1 ? state("installed") : connectedState();
    },
    searchSystems: async () => {
      searches += 1;
      return { ok: true, results: [] };
    },
    previewMutation: async (action) => {
      actions.push(action);
      return previewFor(action);
    },
    executeMutation: async () => ({ ok: true, applied: true, failures: [] }),
  });
  const app = start(services);
  await settle(app);
  assert.equal(searches, 0);
  assert.match(app.lastFrame(), /Configure \/ Connect/);
  assert.doesNotMatch(app.lastFrame(), /Install only|Browse catalog/i);
  await press(app, "c");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "connect confirmation");
  assert.equal(actions[0].kind, "connect");
  assert.equal(actions[0].packageName, "@prism-system/ui-a");
  await press(app, "y");
  await waitFor(() => /CONNECTED/.test(app.lastFrame() ?? ""), "connected state after config");
  assert.equal(reads, 2);
  app.unmount();
});

test("connected tabs use only returned manifest component keys and declared categories", async () => {
  let componentReads = 0;
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listComponents: () => {
        componentReads += 1;
        return componentCatalog();
      },
    }),
  );
  await settle(app);
  assert.equal(componentReads, 0, "catalog does not load on connected mount");
  await press(app, "2");
  await settle(app);
  assert.equal(componentReads, 1);
  assert.match(app.lastFrame(), /AVAILABLE\s+Button/);
  assert.match(app.lastFrame(), /Required/i);
  assert.doesNotMatch(bodyFrame(app.lastFrame()), /R Required|O Optional|G Categories/i);
  assert.match(footerFrame(app.lastFrame()), /Required\s+\(r\)/i);
  await press(app, "o");
  await settle(app);
  assert.match(app.lastFrame(), /UNAVAILABLE\s+Accordion/);
  assert.match(app.lastFrame(), /AVAILABLE\s+DatePicker/);
  await press(app, "g");
  await settle(app);
  assert.match(app.lastFrame(), /composition/);
  assert.match(app.lastFrame(), /forms/);
  assert.doesNotMatch(app.lastFrame(), /data-display|invented/);
  assert.match(app.lastFrame(), /Available: Card/);
  app.unmount();
});

test("declared extensions are a separate TUI catalog view with their import and entry requirements", async () => {
  const extension = {
    kind: "extension",
    name: "KeyboardScene",
    apiVersion: 2,
    entrypoint: "./custom/keyboard-scene",
    importPath: "@prism-system/ui-b/custom/keyboard-scene",
    available: true,
    description: "An interactive keyboard preview.",
    docs: "docs/keyboard-scene.md",
    example: "examples/keyboard-scene.tsx",
    effects: {
      features: ["3d", "motion"],
      rendering: "webgl",
      reducedMotion: true,
      fallback: "static",
    },
    requirements: [
      { name: "three", kind: "peer", range: "^0.186.0", optional: true },
      { name: "@react-three/fiber", kind: "peer", range: "^8.18.0", optional: true },
    ],
  };
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listComponents: () => ({ ...componentCatalog(), extensions: [extension] }),
    }),
  );
  await settle(app);
  await press(app, "2");
  await settle(app);
  assert.match(app.lastFrame(), /AVAILABLE\s+Button/);
  assert.match(footerFrame(app.lastFrame()), /Extensions\s+\(x\)/i);
  assert.match(footerFrame(app.lastFrame()), /Required\s+\(r\)/i);

  await press(app, "x");
  await settle(app);
  assert.match(app.lastFrame(), /EXTENSION\s+KeyboardScene/);
  assert.match(app.lastFrame(), /SELECTED EXTENSION/);
  assert.match(app.lastFrame(), /An interactive keyboard preview/);
  assert.match(
    app.lastFrame(),
    /import\s*\{\s*KeyboardScene\s*\}\s*from\s+"@prism-system\/ui-b\/custom\/keyboard-scene"/,
  );
  assert.match(app.lastFrame(), /API \/ ENTRYPOINT\s+v2.*\.\/custom\/keyboard-scene/);
  assert.match(
    app.lastFrame(),
    /3d, motion.*rendering: webgl.*reduced motion: yes.*fallback: static/,
  );
  assert.match(app.lastFrame(), /three@\^0\.186\.0.*peer.*optional/);
  assert.match(app.lastFrame(), /@react-three\/fiber@\^8\.18\.0/);
  assert.match(
    app.lastFrame(),
    /DOCS \/ EXAMPLE\s+docs\/keyboard-scene\.md.*examples\/keyboard-scene\.tsx/,
  );
  app.unmount();
});

test("normalized mouse clicks activate a measured catalog action", async () => {
  const mouse = createMouseEventSource();
  const diagnostics = [];
  const searches = [];
  const app = start(
    makeServices({
      searchSystems: async (request) => {
        searches.push(request);
        return {
          ok: true,
          results: [
            { name: "@prism-system/ui-a", version: "1.2.3", description: "Mouse-selected system" },
          ],
        };
      },
    }),
    {
      mouseEventSource: mouse.source,
      mouseDiagnostics: (event) => diagnostics.push(event),
      columns: 80,
      rows: 24,
    },
  );
  await settle(app);
  assert.equal(mouse.listenerCount, 1, "FrameworkProvider subscribes to the injected event source");
  assert.match(app.lastFrame(), /Browse catalog/);
  assert.doesNotMatch(bodyFrame(app.lastFrame()), /Browse catalog|Search catalog|\bSearch\b/i);
  assert.match(footerFrame(app.lastFrame()), /Browse catalog\s+\(b\)/i);
  assert.match(footerFrame(app.lastFrame()), /Search catalog\s+\(s\)/i);

  // This is a real terminal cell outside the content area. Runeframe's
  // diagnostics expose the measured, registered hitboxes without inferring
  // positions from Ink's text frame.
  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const probe = diagnostics.at(-1);
  assert.equal(probe.action, "move");
  assert.equal(probe.targetId, null, "the measurement probe does not hover a control");
  const measuredButtons = probe.areas.filter(
    (area) => !area.wheelOnly && area.eligible && area.hasHandler && !area.disabled,
  );
  assert.equal(measuredButtons.length, 2, "Browse and Search each have one footer hitbox");
  assert.match(app.lastFrame(), /ACTIONS/i);
  const footerRow = Math.max(...measuredButtons.map((area) => area.bounds.y));
  const footerButtons = measuredButtons
    .filter((area) => area.bounds.y === footerRow)
    .sort((left, right) => left.bounds.x - right.bounds.x);
  assert.equal(footerButtons.length, 2, "the footer keeps its two actions on a measured row");
  await publishClick(mouse, footerButtons[1].bounds);
  await waitFor(
    () => /Search the registry/.test(app.lastFrame() ?? ""),
    "clickable footer search action",
  );
  await settle(app);
  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const inputAreas = diagnostics
    .at(-1)
    .areas.filter((area) => !area.wheelOnly && area.eligible && area.hasHandler && !area.disabled);
  const lastActionRow = Math.max(...inputAreas.map((area) => area.bounds.y));
  const searchField = inputAreas.find((area) => area.bounds.y < lastActionRow);
  assert.ok(searchField, "the search field remains a distinct clickable input");
  await publishClick(mouse, searchField.bounds);
  await settle(app);
  const inputFooterButtons = inputAreas
    .filter((area) => area.bounds.y === lastActionRow)
    .sort((left, right) => left.bounds.x - right.bounds.x);
  assert.equal(inputFooterButtons.length, 2, "search submit and cancel stay in the footer");
  assert.match(footerFrame(app.lastFrame()), /Cancel\s+\(Esc\)/i);
  await publishClick(mouse, inputFooterButtons[1].bounds);
  await settle(app);
  assert.match(
    app.lastFrame(),
    /Choose a design system/,
    "footer cancel returns to the catalog home",
  );

  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const refreshedProbe = diagnostics.at(-1);
  const refreshedButtons = refreshedProbe.areas
    .filter((area) => !area.wheelOnly && area.eligible && area.hasHandler && !area.disabled)
    .sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
  assert.equal(refreshedButtons.length, 2, "the home footer returns to Browse and Search");
  await publishClick(mouse, refreshedButtons[0].bounds);

  await waitFor(
    () => searches.length === 1 && /Mouse-selected system/.test(app.lastFrame() ?? ""),
    "mouse browse action",
  );
  assert.deepEqual(searches, [{ query: "", size: 50 }]);
  const release = diagnostics.filter((event) => event.action === "release").at(-1);
  assert.equal(
    release.dispatched,
    true,
    "the measured left press/release pair hit a registered action",
  );
  assert.match(app.lastFrame(), /Mouse-selected system/);
  app.unmount();
});

test("footer mouse controls change token groups and the keyboard shortcut remains available", async () => {
  const mouse = createMouseEventSource();
  const diagnostics = [];
  const app = start(makeServices({ getProjectState: connectedState }), {
    mouseEventSource: mouse.source,
    mouseDiagnostics: (event) => diagnostics.push(event),
    columns: 80,
    rows: 24,
  });
  await settle(app);
  await press(app, "3");
  await settle(app);
  assert.match(app.lastFrame(), /themes · 2\/2 token names/);

  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const probe = diagnostics.at(-1);
  const controls = probe.areas.filter(
    (area) => !area.wheelOnly && area.eligible && area.hasHandler && !area.disabled,
  );
  const contentBottom = Math.max(
    ...controls
      .filter((area) => area.bounds.width >= 40)
      .map((area) => area.bounds.y + area.bounds.height),
  );
  const footerButtons = controls
    .filter((area) => area.bounds.width < 40 && area.bounds.y >= contentBottom)
    .sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
  assert.equal(
    footerButtons.length,
    5,
    "token actions and local refresh are clickable in the footer",
  );
  await publishClick(mouse, footerButtons[1].bounds);
  await waitFor(() => /spacing · 1\/1 token names/.test(app.lastFrame() ?? ""), "next token group");

  await press(app, "[");
  await settle(app);
  assert.match(app.lastFrame(), /themes · 2\/2 token names/);
  app.unmount();
});

test("normalized vertical wheel events scroll the measured component catalog list", async () => {
  const mouse = createMouseEventSource();
  const diagnostics = [];
  const components = ["Button", "Input", "Card", "Alert", "Avatar", "Badge"].map((name) => ({
    name,
    required: true,
    optional: false,
    variants: [],
  }));
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listComponents: () => ({
        ...componentCatalog(),
        components,
        available: components.map((component) => component.name),
        unavailable: [],
      }),
    }),
    {
      mouseEventSource: mouse.source,
      mouseDiagnostics: (event) => diagnostics.push(event),
      columns: 80,
      rows: 14,
    },
  );
  await settle(app);
  assert.equal(mouse.listenerCount, 1);
  await press(app, "2");
  await settle(app);
  assert.match(app.lastFrame(), /AVAILABLE\s+Button/);
  assert.match(app.lastFrame(), /AVAILABLE\s+Card/);
  assert.doesNotMatch(app.lastFrame(), /AVAILABLE\s+Alert/);

  // Probe from the top-right terminal cell, away from the list. The wheel
  // diagnostic reports the list's measured viewport bounds for targeting.
  mouse.publish(mousePacket("wheel", 79, 0, { direction: "down" }));
  await pause();
  const probe = diagnostics.at(-1);
  assert.equal(probe.action, "wheel-down");
  assert.equal(probe.targetId, null, "the measurement probe is outside the catalog viewport");
  const measuredLists = probe.areas.filter(
    (area) => area.wheelOnly && area.eligible && area.hasHandler,
  );
  assert.equal(measuredLists.length, 1, "the catalog exposes one scrollable list viewport");
  const list = measuredLists[0];
  const target = centerOfMeasuredBounds(list.bounds);

  mouse.publish(mousePacket("wheel", target.x, target.y, { direction: "down" }));
  await waitFor(() => /AVAILABLE\s+Alert/.test(app.lastFrame() ?? ""), "catalog scroll down");
  const scrolledDown = diagnostics.at(-1);
  assert.equal(scrolledDown.action, "wheel-down");
  assert.equal(scrolledDown.targetId, list.id);
  assert.equal(scrolledDown.dispatched, true);
  assert.doesNotMatch(app.lastFrame(), /AVAILABLE\s+Button/);

  mouse.publish(mousePacket("wheel", target.x, target.y, { direction: "up" }));
  await waitFor(() => /AVAILABLE\s+Button/.test(app.lastFrame() ?? ""), "catalog scroll up");
  const scrolledUp = diagnostics.at(-1);
  assert.equal(scrolledUp.action, "wheel-up");
  assert.equal(scrolledUp.targetId, list.id);
  assert.equal(scrolledUp.dispatched, true);
  assert.doesNotMatch(app.lastFrame(), /AVAILABLE\s+Alert/);
  app.unmount();
});

test("tokens use returned groups and mappings, filter locally, and never show fabricated literal values", async () => {
  let tokenReads = 0;
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listTokens: () => {
        tokenReads += 1;
        return tokenCatalog();
      },
    }),
  );
  await settle(app);
  assert.equal(tokenReads, 0);
  await press(app, "3");
  await settle(app);
  assert.equal(tokenReads, 1);
  assert.match(app.lastFrame(), /themes/);
  assert.match(app.lastFrame(), /spacing/);
  assert.match(app.lastFrame(), /color\.text\.primary/);
  assert.match(app.lastFrame(), /--maivand-color-text-primary/);
  assert.match(app.lastFrame(), /text-maivand-text-primary/);
  assert.match(app.lastFrame(), /Literal CSS values are not published/);
  assert.doesNotMatch(app.lastFrame(), /rgb\(|#[0-9a-f]{3,8}\b/i);

  await press(app, "]");
  await settle(app);
  assert.match(app.lastFrame(), /spacing · 1\/1 token names/);
  assert.match(app.lastFrame(), /No named Tailwind mapping/);
  await press(app, "/");
  await typeText(app, "spacing.scale");
  await press(app, "enter");
  await settle(app);
  assert.match(app.lastFrame(), /filter: spacing\.scale/);
  assert.match(app.lastFrame(), /spacing\.scale\.4/);
  app.unmount();
});

test("Checks explain scope, report results, and require an explicit CSS path for Tailwind", async () => {
  const calls = [];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      runCheck: () => {
        calls.push(["check"]);
        return {
          ok: true,
          status: "passed",
          summary: "7 passed, 1 not checked",
          checks: [
            {
              id: "css-imports",
              label: "css imports",
              status: "not_checked",
              detail: "No explicit CSS path.",
            },
          ],
        };
      },
      runDoctor: () => {
        calls.push(["doctor"]);
        return {
          ok: false,
          checks: [{ label: "public manifest", ok: false, detail: "export missing" }],
          failures: ["export missing"],
        };
      },
      runUsageCheck: () => {
        calls.push(["usage"]);
        return {
          ok: false,
          scanned: 3,
          findings: [
            { file: "src/view.tsx", line: 2, severity: "error", message: "visual override" },
          ],
          summary: "Scanned 3 file(s); 1 error(s), 0 warning(s).",
        };
      },
      runTailwindCheck: ({ cssPath }) => {
        calls.push(["tailwind", cssPath]);
        return {
          ok: true,
          plan: {
            cssPath: `/consumer/demo-app/${cssPath}`,
            packageName: "@prism-system/ui-a",
            version: "1.2.3",
            changed: true,
          },
          changes: [{ kind: "css", path: `/consumer/demo-app/${cssPath}` }],
          failures: [],
        };
      },
    }),
  );
  await settle(app);
  await press(app, "4");
  await settle(app);
  assert.match(app.lastFrame(), /not application tests/i);
  assert.match(app.lastFrame(), /never searches for or guesses/i);
  assert.doesNotMatch(
    bodyFrame(app.lastFrame()),
    /Run check|Run doctor|Check usage|Check CSS path/i,
    "check actions are described in the body and offered once in Actions",
  );
  assert.match(footerFrame(app.lastFrame()), /Run check\s+\(c\)/i);
  assert.match(footerFrame(app.lastFrame()), /Run doctor\s+\(d\)/i);

  await press(app, "c");
  await waitFor(() => calls.some(([name]) => name === "check"), "health report");
  assert.match(app.lastFrame(), /7 passed, 1 not checked/);
  assert.match(app.lastFrame(), /not_checked/i);
  await press(app, "d");
  await waitFor(() => calls.some(([name]) => name === "doctor"), "doctor diagnostics");
  assert.match(app.lastFrame(), /export missing/);
  await press(app, "u");
  await waitFor(() => calls.some(([name]) => name === "usage"), "strict usage check");
  assert.match(app.lastFrame(), /strict AST validation/i);
  assert.match(app.lastFrame(), /src\/view\.tsx:2/);

  await press(app, "t");
  await settle(app);
  assert.match(app.lastFrame(), /Enter one existing CSS path/);
  assert.equal(
    calls.some(([name]) => name === "tailwind"),
    false,
    "no path is auto-selected",
  );
  await typeText(app, "src/app.css");
  await press(app, "enter");
  await waitFor(() => calls.some(([name]) => name === "tailwind"), "explicit Tailwind check");
  assert.deepEqual(
    calls.find(([name]) => name === "tailwind"),
    ["tailwind", "src/app.css"],
  );
  assert.match(app.lastFrame(), /WARNING · explicit CSS bridge setup is pending/);
  assert.match(app.lastFrame(), /Read-only preview|no CSS was written/i);
  app.unmount();
});

test("loading, mutation failures, resize, keyboard back navigation, and NO_COLOR keep text status clear", async (t) => {
  const previousNoColor = process.env.NO_COLOR;
  const previousTerm = process.env.TERM;
  process.env.NO_COLOR = "1";
  process.env.TERM = "xterm-256color";
  t.after(() => {
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  });
  let rejectSearch;
  const app = start(
    makeServices({
      searchSystems: () =>
        new Promise((_resolve, reject) => {
          rejectSearch = reject;
        }),
    }),
  );
  await settle(app);
  assert.match(
    app.lastFrame(),
    /NO SYSTEM CONNECTED/i,
    "the empty state is named in text, not just by color",
  );
  assert.match(app.lastFrame(), /ACTIONS/i);
  assert.match(app.lastFrame(), /Browse catalog\s+\(b\)/i);
  assert.match(app.lastFrame(), /q or Ctrl\+C exit/i);
  await press(app, "b");
  assert.match(app.lastFrame(), /Searching catalog/i);
  rejectSearch(new Error("offline"));
  await waitFor(() => /offline/.test(app.lastFrame() ?? ""), "registry error detail");
  assert.match(
    app.lastFrame(),
    /REGISTRY ERROR/i,
    "the failure state remains explicit without color",
  );
  await press(app, "escape");
  await settle(app);
  assert.match(app.lastFrame(), /NO SYSTEM CONNECTED/i);

  const connected = start(makeServices({ getProjectState: connectedState }));
  await settle(connected);
  assert.match(connected.lastFrame(), /CONNECTED/i, "the success state is visible as plain text");
  connected.unmount();

  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 38 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 12 });
  app.stdout.emit("resize");
  await settle(app);
  assert.match(app.lastFrame(), /\/consumer\/demo-app/);
  assert.match(app.lastFrame().replace(/\s+/g, " "), /q or Ctrl\+C exit/);
  app.unmount();
});

test("upgrade requires a user-entered exact version and shows the manifest diff before confirmation", async () => {
  const previews = [];
  const executions = [];
  const upgradeConfigBefore =
    '{\n  "version": "1.2.3",\n  "marker": "UPGRADE_CONFIG_BEFORE_EXACT"\n}';
  const upgradeConfigAfter =
    '{\n  "version": "2.0.0",\n  "marker": "UPGRADE_CONFIG_AFTER_EXACT"\n}';
  const rootAgentsBefore = "# Root instructions\nUPGRADE_ROOT_BEFORE_EXACT\n";
  const rootAgentsAfter = [
    "# Root instructions",
    ...Array.from(
      { length: 36 },
      (_, index) => `Updated root guidance ${index + 1}: exact proposed text.`,
    ),
    "UPGRADE_ROOT_AFTER_EXACT_SENTINEL",
  ].join("\n");
  const app = start(
    makeServices({
      getProjectState: connectedState,
      previewMutation: async (action) => {
        previews.push(action);
        return {
          ...previewFor(action),
          plannedChanges: [
            ...previewFor(action).plannedChanges,
            {
              kind: "config",
              path: "/consumer/demo-app/.design-system/config.json",
              changed: true,
              before: upgradeConfigBefore,
              after: upgradeConfigAfter,
            },
            {
              kind: "root-agents",
              path: "/consumer/AGENTS.md",
              changed: true,
              before: rootAgentsBefore,
              after: rootAgentsAfter,
            },
          ],
        };
      },
      executeMutation: async (action) => {
        executions.push(action);
        return { ok: true, applied: true, failures: [] };
      },
    }),
  );
  await settle(app);
  await press(app, "g");
  assert.match(app.lastFrame(), /Choose an exact upgrade version/);
  assert.equal(previews.length, 0, "no version is silently chosen");
  await typeText(app, "2.0.0");
  await press(app, "enter");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "upgrade confirmation");
  assert.equal(previews.length, 1);
  assert.equal(previews[0].version, "2.0.0");
  assert.match(app.lastFrame(), /Existing manifest diff/);
  assert.match(app.lastFrame(), /Component added: Meter/);
  assert.match(app.lastFrame(), /Component removed: Avatar/);
  assert.equal(executions.length, 0);
  await press(app, "v");
  await waitFor(
    () => /UPGRADE_CONFIG_BEFORE_EXACT/.test(app.lastFrame() ?? ""),
    "exact upgrade config before content",
  );
  assert.match(app.lastFrame(), /UPGRADE_CONFIG_AFTER_EXACT/);
  assert.match(app.lastFrame(), /BEFORE\s+PRESENT/);
  await press(app, "right");
  assert.match(app.lastFrame(), /PATH\s+\/consumer\/AGENTS\.md/);
  assert.match(app.lastFrame(), /ROOT AGENTS · CHANGED/);
  assert.match(app.lastFrame(), /UPGRADE_ROOT_BEFORE_EXACT/);
  assert.doesNotMatch(app.lastFrame(), /UPGRADE_ROOT_AFTER_EXACT_SENTINEL/);
  for (
    let index = 0;
    index < 80 && !/UPGRADE_ROOT_AFTER_EXACT_SENTINEL/.test(app.lastFrame() ?? "");
    index += 1
  ) {
    await press(app, "down");
  }
  assert.match(app.lastFrame(), /UPGRADE_ROOT_AFTER_EXACT_SENTINEL/);
  await press(app, "escape");
  assert.equal(executions.length, 0);
  app.unmount();
});

test("narrow terminals keep paths and action hints visible", async () => {
  const app = start(makeServices({ getProjectState: connectedState }));
  await settle(app);
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 38 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 12 });
  app.stdout.emit("resize");
  await settle(app);
  const frame = app.lastFrame();
  assert.match(frame, /\/consumer\/demo-app/);
  assert.match(frame, /Upgrade to exact version|exact-version upgrade/i);
  assert.match(frame.replace(/\s+/g, " "), /q or Ctrl\+C exit/);
  app.unmount();
});
