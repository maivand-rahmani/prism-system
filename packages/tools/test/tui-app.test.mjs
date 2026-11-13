import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry, useKeyHandler } from "runeframe";
import { createWindowsInputTransport } from "runeframe/windows-input";

import TuiApp, { ChangePreviewModal } from "../src/tui-app.mjs";
import { dispatchFocusedAction } from "../src/tui/hooks/use-navigation-keys.mjs";

const h = React.createElement;
let activeModalEscapeEvents = null;
const registry = new ScreenRegistry();
registry.register({
  id: "tui-test",
  title: "TUI test host",
  component: () => null,
});
registry.register({
  id: "change-preview",
  title: "Change preview",
  component: (props) =>
    h(
      React.Fragment,
      null,
      activeModalEscapeEvents && h(NormalizedEscapeProbe, { events: activeModalEscapeEvents }),
      h(ChangePreviewModal, props),
    ),
});

function NormalizedEscapeProbe({ events }) {
  const captureEscape = (event) => {
    if (event.rawInput === "\u001b" || event.escape) {
      events.push({ key: event.key, escape: event.escape, rawInput: event.rawInput });
    }
    return false;
  };
  useKeyHandler(captureEscape, "modal", { priority: 300 });
  useKeyHandler(captureEscape, "list", { priority: 300 });
  return null;
}

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

function iconCatalog() {
  return {
    ok: true,
    package: "@prism-system/ui-a",
    version: "1.2.3",
    contractVersion: 4,
    id: "system-a",
    name: "System A",
    showcase: { route: "/showcase/system-a/icons" },
    supported: true,
    entrypoint: "./icons",
    importPath: "@prism-system/ui-a/icons",
    counts: { total: 3, available: 2, unavailable: 1 },
    icons: [
      {
        name: "ArrowLeft",
        exportName: "ArrowLeftIcon",
        category: "navigation",
        available: true,
        entrypoint: "./icons",
        importPath: "@prism-system/ui-a/icons",
        importStatement: 'import { ArrowLeftIcon } from "@prism-system/ui-a/icons";',
        requirements: [{ name: "lucide-react", kind: "peer", range: "^0.468.0", optional: false }],
      },
      {
        name: "Search",
        exportName: "SearchIcon",
        category: "actions",
        available: true,
        entrypoint: "./icons",
        importPath: "@prism-system/ui-a/icons",
        importStatement: 'import { SearchIcon } from "@prism-system/ui-a/icons";',
        requirements: [{ name: "lucide-react", kind: "peer", range: "^0.468.0", optional: false }],
      },
      {
        name: "Home",
        exportName: "HomeIcon",
        category: "navigation",
        available: false,
        entrypoint: "./icons",
        importPath: "@prism-system/ui-a/icons",
        importStatement: null,
        requirements: [{ name: "lucide-react", kind: "peer", range: "^0.468.0", optional: false }],
      },
    ],
    available: ["ArrowLeft", "Search"],
    unavailable: ["Home"],
    categories: {
      navigation: { names: ["ArrowLeft", "Home"], available: ["ArrowLeft"], unavailable: ["Home"] },
      actions: { names: ["Search"], available: ["Search"], unavailable: [] },
      files: { names: [], available: [], unavailable: [] },
      feedback: { names: [], available: [], unavailable: [] },
      interface: { names: [], available: [], unavailable: [] },
    },
    requested: null,
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
      : [{ kind: "package-json", path: "/consumer/demo-app/package.json", changed: true }],
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
    listIcons: () => iconCatalog(),
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

function tree(services, { mouseEventSource, mouseDiagnostics, normalizedKeyEvents } = {}) {
  return h(
    MouseLayout,
    { origin: { x: 0, y: 0 }, flexDirection: "column" },
    h(
      FrameworkProvider,
      { registry, defaultScreen: "tui-test", mouseEventSource, mouseDiagnostics },
      h(
        React.Fragment,
        null,
        h(TuiApp, { services }),
        normalizedKeyEvents && h(NormalizedEscapeProbe, { events: normalizedKeyEvents }),
      ),
    ),
  );
}

function start(services, options = {}) {
  const { mouseEventSource, mouseDiagnostics, columns, rows, normalizedKeyEvents } = options;
  const app = render(tree(services, { mouseEventSource, mouseDiagnostics, normalizedKeyEvents }));
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

function createFakeWindowsHelper() {
  const helper = new EventEmitter();
  helper.stdout = new PassThrough();
  helper.exitCode = null;
  helper.emitRecord = (record) => helper.stdout.write(`${JSON.stringify(record)}\n`);
  const stop = () => {
    if (helper.exitCode !== null) return;
    helper.exitCode = 0;
    helper.stdout.end();
    queueMicrotask(() => helper.emit("exit", 0, null));
  };
  helper.stdin = {
    write(chunk) {
      if (chunk === "stop\n") stop();
      return true;
    },
  };
  helper.kill = () => {
    stop();
    return true;
  };
  queueMicrotask(() => {
    helper.emitRecord({ type: "ready", originalMode: 0, mode: 0 });
  });
  return helper;
}

function windowsKeyRecord(key) {
  if (key === "escape") {
    return {
      type: "key",
      down: true,
      repeat: 1,
      char: "",
      virtualKey: 27,
      virtualScanCode: 1,
      control: 0,
    };
  }
  if (key === "enter") {
    return {
      type: "key",
      down: true,
      repeat: 1,
      char: "\r",
      virtualKey: 13,
      virtualScanCode: 28,
      control: 0,
    };
  }
  return {
    type: "key",
    down: true,
    repeat: 1,
    char: key,
    virtualKey: 0,
    virtualScanCode: null,
    control: 0,
  };
}

async function pressWindowsKey(helper, key) {
  helper.emitRecord(windowsKeyRecord(key));
  await pause(key === "escape" ? 100 : 30);
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
      tab: "\t",
      "shift-tab": "\u001b[Z",
    }[key] ?? key;
  return send(app, input);
}

async function settle(app) {
  await pause(30);
  currentFrame = app.lastFrame() ?? "";
  return currentFrame;
}

async function scrollDownUntil(app, pattern, description, limit = 80) {
  const visibleText = () => (app.lastFrame() ?? "").replace(/\s+/g, " ");
  for (let index = 0; index < limit && !pattern.test(visibleText()); index += 1) {
    await press(app, "down");
  }
  assert.match(visibleText(), pattern, `${description} should be reachable by scrolling`);
  return app.lastFrame();
}

async function scrollUpUntil(app, pattern, description, limit = 80) {
  const visibleText = () => (app.lastFrame() ?? "").replace(/\s+/g, " ");
  for (let index = 0; index < limit && !pattern.test(visibleText()); index += 1) {
    await send(app, "\u001b[A");
  }
  assert.match(visibleText(), pattern, `${description} should be reachable by scrolling up`);
  return app.lastFrame();
}

async function collectScrollableFrames(app, targets) {
  const frames = [app.lastFrame() ?? ""];
  for (const { pattern, description } of targets) {
    if (pattern.test((app.lastFrame() ?? "").replace(/\s+/g, " "))) continue;
    frames.push(await scrollDownUntil(app, pattern, description));
  }
  return frames.join("\n");
}

/**
 * The shell anchors a footer at the bottom of the terminal, separated from the
 * scrollable body by its top border. Content rules (CHANGE PREVIEW, ACTIVITY,
 * etc.) also use horizontal rules, so the footer is the region after the LAST
 * rule, not anything inferred from removed section headings.
 */
function frameSections(frame) {
  const lines = (frame ?? "").split("\n");
  let footerStart = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*─{10,}\s*$/.test(lines[index])) {
      footerStart = index;
      break;
    }
  }
  if (footerStart < 0) {
    const navIndex = lines.findLastIndex((line) => /^\s*Navigate:/.test(line));
    if (navIndex >= 0) footerStart = Math.max(0, navIndex - 1);
  }
  return {
    lines,
    footerStart,
    body: footerStart < 0 ? (frame ?? "") : lines.slice(0, footerStart).join("\n"),
    footer: footerStart < 0 ? "" : lines.slice(footerStart + 1).join("\n"),
  };
}

function bodyFrame(frame) {
  return frameSections(frame).body;
}

function footerFrame(frame) {
  return frameSections(frame).footer;
}

/** Locate a visible control's rendered label and return its measured hitbox. */
function actionAreaFor(diagnostics, frame, pattern, description) {
  const lines = (frame ?? "").split("\n");
  const rowIndex = lines.findIndex((line) => pattern.test(line));
  assert.notEqual(rowIndex, -1, `${description} must be rendered before it can be clicked`);
  const column = lines[rowIndex].search(pattern);
  const areas = diagnostics.at(-1)?.areas ?? [];
  const area = areas.find(
    (candidate) =>
      !candidate.wheelOnly &&
      candidate.eligible &&
      candidate.hasHandler &&
      !candidate.disabled &&
      column >= candidate.bounds.x &&
      column < candidate.bounds.x + candidate.bounds.width &&
      rowIndex >= candidate.bounds.y &&
      rowIndex < candidate.bounds.y + candidate.bounds.height,
  );
  assert.ok(area, `${description} must have a measured pointer hitbox over its visible label`);
  return area;
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
  assert.match(bodyFrame(empty.lastFrame()), /Browse catalog\s+\(b\)/i);
  assert.match(bodyFrame(empty.lastFrame()), /Search catalog\s+\(s\)/i);
  assert.doesNotMatch(footerFrame(empty.lastFrame()), /Browse catalog|Search catalog/i);
  assert.match(footerFrame(empty.lastFrame()), /Navigate:.*Manage/i);
  assert.match(footerFrame(empty.lastFrame()), /navigation only/i);
  assert.equal(searches, 0, "mount only reads local project state");
  await press(empty, "s");
  assert.match(empty.lastFrame(), /Search the registry/);
  assert.match(bodyFrame(empty.lastFrame()), /Search catalog\s+\(Enter\)/i);
  assert.match(bodyFrame(empty.lastFrame()), /Cancel\s+\(Esc\)/i);
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
  await scrollDownUntil(connected, /Inspect manifest\s+\(d\)/i, "inline connected-system actions");
  assert.match(
    bodyFrame(connected.lastFrame()),
    /Inspect manifest\s+\(d\)/i,
    "connected-system actions sit inline with the screen content",
  );
  assert.match(bodyFrame(connected.lastFrame()), /Reconnect\s+\(c\)/i);
  assert.doesNotMatch(
    footerFrame(connected.lastFrame()),
    /Inspect manifest|Reconnect|Upgrade version|Refresh state/i,
  );
  assert.match(footerFrame(connected.lastFrame()), /navigation only/i);
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
  assert.equal(calls[0].size, 250);
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
  assert.equal(
    app.lastFrame().includes("Published manifest details"),
    false,
    "browse alone never inspects a result",
  );
  assert.equal(mutations.length, 0, "browsing the catalog cannot start a preview");
  await press(app, "enter");
  await waitFor(
    () => /Published manifest details/.test(app.lastFrame() ?? ""),
    "explicit manifest inspection",
  );
  assert.match(app.lastFrame(), /Exact version: 1\.2\.3/);
  await scrollDownUntil(app, /Install only\s+\(i\)/i, "inline install control on manifest details");
  assert.match(bodyFrame(app.lastFrame()), /Install only\s+\(i\)/i);
  assert.match(bodyFrame(app.lastFrame()), /Use\s*&\s*connect\s+\(u\)/i);
  assert.doesNotMatch(footerFrame(app.lastFrame()), /Install only|Use\s*&\s*connect/i);
  assert.match(footerFrame(app.lastFrame()), /Navigate:.*Back/i);
  await press(app, "i");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "install confirmation");
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].kind, "install");
  assert.equal(mutations[0].version, "1.2.3");
  assert.match(app.lastFrame(), /PACKAGE MANAGER/);
  await scrollDownUntil(app, /pnpm add/, "the exact install command");
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
          kind: "package-json",
          path: "/consumer/demo-app/package.json",
          changed: true,
          before: configBefore,
          after: configAfter,
        },
        {
          kind: "root-agents",
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
  for (
    let index = 0;
    index < 40 && !/Strict usage check: not included/.test(app.lastFrame() ?? "");
    index += 1
  ) {
    await press(app, "down");
  }
  assert.match(app.lastFrame(), /Strict usage check: not included/);
  assert.match(app.lastFrame(), /CSS changes: not included/);
  for (
    let index = 0;
    index < 30 && !/Exact managed file content · 2 files/.test(app.lastFrame() ?? "");
    index += 1
  ) {
    await press(app, "down");
  }
  assert.match(app.lastFrame(), /Exact managed file content · 2 files/);
  assert.match(app.lastFrame(), /\/consumer\/demo-app\/package\.json/);
  assert.equal(executed.length, 0);

  await press(app, "v");
  await waitFor(
    () => /CONFIG_BEFORE_EXACT/.test(app.lastFrame() ?? ""),
    "exact config before content in the modal",
  );
  assert.match(app.lastFrame(), /AFTER · PRESENT/);
  assert.match(app.lastFrame(), /DIFF 1\/2/);
  assert.doesNotMatch(app.lastFrame(), /USE_AFTER_MARKER/);
  assert.doesNotMatch(app.lastFrame(), /Scroll up|Scroll down|Previous file|Next file/i);

  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 38 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 12 });
  app.stdout.emit("resize");
  await settle(app);
  assert.match(
    app.lastFrame().replace(/\s/g, ""),
    /\/consumer\/demo-app\/package\.json/,
    `the modal's path remains readable after a narrow resize:\n${app.lastFrame()}`,
  );
  assert.match(app.lastFrame(), /DIFF 1\/2/);
  assert.match(app.lastFrame().replace(/[│]/g, ""), /Esc\s+close/i);
  for (let index = 0; index < 80 && !/USE_AFTER_MAR/.test(app.lastFrame() ?? ""); index += 1) {
    await press(app, "down");
  }
  assert.match(app.lastFrame(), /USE_AFTER_MAR/, "the wrapped after content is reachable");
  await press(app, "down");
  assert.match(app.lastFrame(), /KER"/, "the rest of the wrapped marker is reachable");

  await press(app, "right");
  await waitFor(
    () => /\/consumer\/demo-app\/AGENTS\.md/.test(app.lastFrame() ?? ""),
    "next managed-file diff",
  );
  assert.match(app.lastFrame(), /DIFF 2\/2 · ROOT AGENTS \(MANAGED\)/);
  for (
    let index = 0;
    index < 80 && !/AGENTS_AFTER_MARKER/.test(app.lastFrame() ?? "");
    index += 1
  ) {
    await press(app, "down");
  }
  assert.match(app.lastFrame(), /AGENTS_AFTER_MARKER/);
  await press(app, "escape");
  await settle(app);
  assert.match(app.lastFrame(), /Review controls/);
  await press(app, "tab");
  await press(app, "tab");
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
  const app = start(services, { columns: 80, rows: 14 });
  await settle(app);
  await press(app, "b");
  await settle(app);
  await press(app, "enter");
  await waitFor(
    () => /Published manifest details/.test(app.lastFrame() ?? ""),
    "published manifest details",
  );
  await scrollDownUntil(
    app,
    /Manifest token groups:/,
    "manifest details before the install preview",
  );

  await press(app, "i");
  await waitFor(() => /published manifest changed/.test(app.lastFrame() ?? ""), "preview failure");
  assert.match(app.lastFrame(), /Preview failed/i, "the failure status stays above the page body");
  assert.doesNotMatch(app.lastFrame(), /Confirm planned change/);
  assert.equal(executions.length, 0, "a failed preview cannot be executed");

  await scrollDownUntil(app, /Manifest token groups:/, "the rest of the inspected manifest");
  await scrollDownUntil(app, /Install only\s+\(i\)/i, "the inline install control");
  assert.match(bodyFrame(app.lastFrame()), /Install only\s+\(i\)/i);
  assert.match(footerFrame(app.lastFrame()), /↑\/↓ scroll/);
  assert.match(footerFrame(app.lastFrame()), /navigation only/);

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
  assert.match(bodyFrame(app.lastFrame()), /Required\s+\(r\)/i);
  assert.match(bodyFrame(app.lastFrame()), /Optional\s+\(o\)/i);
  assert.doesNotMatch(footerFrame(app.lastFrame()), /Required|Optional|Categories/i);
  assert.match(footerFrame(app.lastFrame()), /navigation only/i);
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
  assert.doesNotMatch(app.lastFrame(), /SELECTED COMPONENT|j\/k select|required entries/);
  assert.match(app.lastFrame(), /Category membership and availability/);
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
    { columns: 80, rows: 24 },
  );
  await settle(app);
  await press(app, "2");
  await settle(app);
  assert.match(app.lastFrame(), /AVAILABLE\s+Button/);
  assert.match(bodyFrame(app.lastFrame()), /Required\s+\(r\)/i);

  await press(app, "x");
  await settle(app);
  assert.match(app.lastFrame(), /EXTENSION\s+KeyboardScene/);
  assert.match(footerFrame(app.lastFrame()), /↑\/↓ scroll/);
  const extensionFrames = [app.lastFrame() ?? ""];
  for (let index = 0; index < 80 && !/DOCS \/ EXAMPLE/.test(app.lastFrame() ?? ""); index += 1) {
    await press(app, "down");
    extensionFrames.push(app.lastFrame() ?? "");
  }
  const accessibleExtensionDetails = extensionFrames.join("\n").replace(/\s+/g, " ");
  assert.match(accessibleExtensionDetails, /SELECTED EXTENSION/);
  assert.match(accessibleExtensionDetails, /An interactive keyboard preview/);
  assert.match(
    accessibleExtensionDetails,
    /import\s*\{\s*KeyboardScene\s*\}\s*from\s+"@prism-system\/ui-b\/custom\/keyboard-scene"/,
  );
  assert.match(accessibleExtensionDetails, /API \/ ENTRYPOINT\s+v2.*\.\/custom\/keyboard-scene/);
  assert.match(
    accessibleExtensionDetails,
    /3d, motion.*rendering: webgl.*reduced motion: yes.*fallback: static/,
  );
  assert.match(accessibleExtensionDetails, /three@\^0\.186\.0.*peer.*optional/);
  assert.match(accessibleExtensionDetails, /@react-three\/fiber@\^8\.18\.0/);
  assert.match(
    accessibleExtensionDetails,
    /DOCS \/ EXAMPLE\s+docs\/keyboard-scene\.md.*examples\/keyboard-scene\.tsx/,
  );
  assert.match(app.lastFrame(), /DOCS \/ EXAMPLE/);
  await press(app, "r");
  await settle(app);
  assert.match(
    app.lastFrame(),
    /AVAILABLE\s+Button/,
    "inline shortcuts still work after scrolling",
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
  assert.match(bodyFrame(app.lastFrame()), /Browse catalog\s+\(b\)/i);
  assert.match(bodyFrame(app.lastFrame()), /Search catalog\s+\(s\)/i);
  assert.doesNotMatch(footerFrame(app.lastFrame()), /Browse catalog|Search catalog/i);
  assert.match(footerFrame(app.lastFrame()), /Navigate:.*Manage/i);

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
  assert.equal(
    measuredButtons.length,
    3,
    "Browse and Search are inline; Manage stays in the footer",
  );
  const searchAction = actionAreaFor(
    diagnostics,
    app.lastFrame(),
    /Search catalog\s+\(s\)/i,
    "inline search action",
  );
  await publishClick(mouse, searchAction.bounds);
  await waitFor(
    () => /Search the registry/.test(app.lastFrame() ?? ""),
    "clickable inline search action",
  );
  await settle(app);
  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const inputAreas = diagnostics
    .at(-1)
    .areas.filter((area) => !area.wheelOnly && area.eligible && area.hasHandler && !area.disabled);
  const searchField = inputAreas.find((area) => area.bounds.width >= 40);
  assert.ok(searchField, "the search field remains a distinct clickable input");
  await publishClick(mouse, searchField.bounds);
  await settle(app);
  assert.match(bodyFrame(app.lastFrame()), /Search catalog\s+\(Enter\)/i);
  assert.match(bodyFrame(app.lastFrame()), /Cancel\s+\(Esc\)/i);
  assert.doesNotMatch(footerFrame(app.lastFrame()), /Cancel|Search catalog/i);
  const cancelAction = actionAreaFor(
    diagnostics,
    app.lastFrame(),
    /Cancel\s+\(Esc\)/i,
    "inline search cancel",
  );
  await publishClick(mouse, cancelAction.bounds);
  await settle(app);
  assert.match(
    app.lastFrame(),
    /Choose a design system/,
    "inline cancel returns to the catalog home",
  );

  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const browseAction = actionAreaFor(
    diagnostics,
    app.lastFrame(),
    /Browse catalog\s+\(b\)/i,
    "inline browse action",
  );
  await publishClick(mouse, browseAction.bounds);

  await waitFor(
    () => searches.length === 1 && /Mouse-selected system/.test(app.lastFrame() ?? ""),
    "mouse browse action",
  );
  assert.deepEqual(searches, [{ query: "", size: 250 }]);
  const release = diagnostics.filter((event) => event.action === "release").at(-1);
  assert.equal(
    release.dispatched,
    true,
    "the measured left press/release pair hit a registered action",
  );
  assert.match(app.lastFrame(), /Mouse-selected system/);
  app.unmount();
});

test("inline mouse controls change token groups and the keyboard shortcut remains available", async () => {
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
  assert.match(bodyFrame(app.lastFrame()), /Next group\s+\(\]/i);
  assert.match(bodyFrame(app.lastFrame()), /Previous group\s+\(\[\)/i);

  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const nextGroup = actionAreaFor(
    diagnostics,
    app.lastFrame(),
    /Next group\s+\(\]/i,
    "inline next token group control",
  );
  await publishClick(mouse, nextGroup.bounds);
  await waitFor(() => /spacing · 1\/1 token names/.test(app.lastFrame() ?? ""), "next token group");

  await press(app, "[");
  await settle(app);
  assert.match(app.lastFrame(), /themes · 2\/2 token names/);
  app.unmount();
});

test("token group labels are directly mouse-selectable without losing footer or keyboard navigation", async () => {
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

  const groupRow = app
    .lastFrame()
    .split("\n")
    .findIndex((row) => row.includes("themes") && row.includes("spacing"));
  assert.notEqual(groupRow, -1, "both returned group labels render on the token page");
  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const groupButtons = diagnostics
    .at(-1)
    .areas.filter(
      (area) =>
        !area.wheelOnly &&
        area.eligible &&
        area.hasHandler &&
        !area.disabled &&
        area.bounds.y === groupRow,
    )
    .sort((left, right) => left.bounds.x - right.bounds.x);
  assert.equal(groupButtons.length, 2, "each visible group name has its own measured mouse target");
  await publishClick(mouse, groupButtons[1].bounds);
  await waitFor(
    () => /spacing · 1\/1 token names/.test(app.lastFrame() ?? ""),
    "direct group click",
  );

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
  await scrollDownUntil(app, /AVAILABLE\s+Button/, "the component catalog viewport");
  assert.doesNotMatch(app.lastFrame(), /AVAILABLE\s+Alert/);

  // Probe from the top-right terminal cell, away from the list. The wheel
  // diagnostic reports the list's measured viewport bounds for targeting.
  mouse.publish(mousePacket("wheel", 79, 0, { direction: "down" }));
  await pause();
  const probe = diagnostics.at(-1);
  assert.equal(probe.action, "wheel-down");
  assert.equal(probe.targetId, null, "the measurement probe is outside the catalog viewport");
  const measuredLists = probe.areas
    .filter((area) => area.wheelOnly && area.eligible && area.hasHandler)
    .sort((left, right) => left.bounds.height - right.bounds.height);
  assert.ok(measuredLists.length >= 1, "the catalog exposes a scrollable list viewport");
  const list = measuredLists[0];
  const target = centerOfMeasuredBounds(list.bounds);

  for (let index = 0; index < 6 && !/AVAILABLE\s+Alert/.test(app.lastFrame() ?? ""); index += 1) {
    mouse.publish(mousePacket("wheel", target.x, target.y, { direction: "down" }));
    await pause();
  }
  assert.match(app.lastFrame(), /AVAILABLE\s+Alert/);
  const scrolledDown = diagnostics.at(-1);
  assert.equal(scrolledDown.action, "wheel-down");
  assert.equal(scrolledDown.targetId, list.id);
  assert.equal(scrolledDown.dispatched, true);
  assert.doesNotMatch(app.lastFrame(), /AVAILABLE\s+Button/);

  for (let index = 0; index < 6 && !/AVAILABLE\s+Button/.test(app.lastFrame() ?? ""); index += 1) {
    mouse.publish(mousePacket("wheel", target.x, target.y, { direction: "up" }));
    await pause();
  }
  assert.match(app.lastFrame(), /AVAILABLE\s+Button/);
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

test("icons load lazily on the fifth tab and list only available canonical names", async () => {
  let iconReads = 0;
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listIcons: () => {
        iconReads += 1;
        return iconCatalog();
      },
    }),
  );
  await settle(app);
  assert.equal(iconReads, 0, "icon catalog does not load on connected mount");
  assert.match(app.lastFrame(), /Icons/);

  await press(app, "5");
  await settle(app);
  assert.equal(iconReads, 1);
  assert.match(app.lastFrame(), /Icon catalog/);
  assert.match(app.lastFrame(), /ArrowLeft\s+ArrowLeftIcon/);
  assert.match(app.lastFrame(), /Search\s+SearchIcon/);
  assert.doesNotMatch(bodyFrame(app.lastFrame()), /Home\s+HomeIcon/);
  assert.match(bodyFrame(app.lastFrame()), /Filter names\s+\(\/\)/i);
  assert.match(bodyFrame(app.lastFrame()), /Reload\s+\(l\)/i);
  assert.doesNotMatch(footerFrame(app.lastFrame()), /Filter names|Reload/i);
  app.unmount();
});

test("icons filter locally with / and show the selected import and entrypoint requirements", async () => {
  const app = start(makeServices({ getProjectState: connectedState }), { columns: 80, rows: 20 });
  await settle(app);
  await press(app, "5");
  await settle(app);
  await press(app, "/");
  assert.match(app.lastFrame(), /Filter icon names/);
  await typeText(app, "search");
  await press(app, "enter");
  await settle(app);
  assert.match(app.lastFrame(), /filter: search/);
  assert.match(app.lastFrame(), /Search\s+SearchIcon/);
  assert.doesNotMatch(bodyFrame(app.lastFrame()), /ArrowLeft/);
  assert.match(bodyFrame(app.lastFrame()), /Filter names\s+\(\/\)/i);

  const detailFrames = await collectScrollableFrames(app, [
    { pattern: /lucide-react@\^0\.468\.0/, description: "selected icon requirement details" },
  ]);
  const details = detailFrames.replace(/\s+/g, " ");
  assert.match(details, /SELECTED ICON/);
  assert.match(details, /SearchIcon/);
  assert.match(details, /import \{ SearchIcon \} from "@prism-system\/ui-a\/icons"/);
  assert.match(details, /ENTRYPOINT\s+\.\/icons.*@prism-system\/ui-a\/icons/);
  assert.match(details, /lucide-react@\^0\.468\.0.*peer/);
  app.unmount();
});

test("q is ordinary input in icon search and does not exit the TUI", async () => {
  const app = start(makeServices({ getProjectState: connectedState }), { columns: 80, rows: 20 });
  await settle(app);
  await press(app, "5");
  await settle(app);
  await press(app, "/");
  await typeText(app, "q");
  assert.match(app.lastFrame(), /Filter icon names/);
  assert.match(app.lastFrame(), /q/);
  assert.doesNotMatch(app.lastFrame(), /PRISM DS {2}\/ {2}CONSUMER TERMINAL\s*$/);
  app.unmount();
});

test("successful system mutation invalidates the lazy icon catalog cache", async () => {
  let iconReads = 0;
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listIcons: () => {
        iconReads += 1;
        return iconCatalog();
      },
      executeMutation: async () => ({ ok: true, applied: true, changed: true, failures: [] }),
    }),
  );
  await settle(app);
  await press(app, "5");
  await settle(app);
  assert.equal(iconReads, 1);
  await press(app, "1");
  await press(app, "g");
  await typeText(app, "2.0.0");
  await press(app, "enter");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "upgrade confirmation");
  await press(app, "y");
  await waitFor(() => /connected/i.test(app.lastFrame() ?? ""), "mutation completion");
  await pause(80);
  await press(app, "5");
  await settle(app);
  assert.equal(iconReads, 2, "icons reload after a system-changing operation");
  app.unmount();
});

test("icons reload with l without leaving the tab", async () => {
  let iconReads = 0;
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listIcons: () => {
        iconReads += 1;
        return iconCatalog();
      },
    }),
  );
  await settle(app);
  await press(app, "5");
  await settle(app);
  assert.equal(iconReads, 1);
  await press(app, "l");
  await settle(app);
  assert.equal(iconReads, 2);
  assert.match(app.lastFrame(), /ArrowLeft\s+ArrowLeftIcon/);
  assert.match(bodyFrame(app.lastFrame()), /Reload\s+\(l\)/i);
  assert.doesNotMatch(footerFrame(app.lastFrame()), /Reload/i);
  app.unmount();
});

test("a system without an icon catalog shows neutral guidance instead of an error", async () => {
  const base = iconCatalog();
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listIcons: () => ({
        ...base,
        supported: false,
        entrypoint: null,
        importPath: null,
        counts: { total: base.icons.length, available: 0, unavailable: base.icons.length },
        icons: base.icons.map((icon) => ({
          ...icon,
          available: false,
          entrypoint: null,
          importPath: null,
          importStatement: null,
        })),
        available: [],
        unavailable: base.icons.map((icon) => icon.name),
      }),
    }),
  );
  await settle(app);
  await press(app, "5");
  await settle(app);
  const frame = app.lastFrame();
  assert.match(frame, /No icon catalog is declared by this design system\./);
  assert.match(frame, /0 available · 3 unavailable/);
  assert.doesNotMatch(frame, /Icon catalog unavailable/);
  assert.doesNotMatch(bodyFrame(frame), /No icon names match this filter/);
  assert.doesNotMatch(bodyFrame(frame), /publishes no available icon names/);
  app.unmount();
});

test("narrow terminals keep the fifth Icons tab discoverable", async () => {
  const app = start(makeServices({ getProjectState: connectedState }), {
    columns: 46,
    rows: 18,
  });
  await settle(app);
  assert.match(app.lastFrame(), /1 Sys/);
  assert.match(app.lastFrame(), /4 Check/);
  assert.match(app.lastFrame(), /5 Icons/);
  await press(app, "5");
  await settle(app);
  assert.match(app.lastFrame(), /Icon catalog/);
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
  assert.match(app.lastFrame(), /Run check\s+\(c\)/i);
  assert.match(app.lastFrame(), /Run doctor\s+\(d\)/i);
  assert.match(app.lastFrame(), /Check usage\s+\(u\)/i);
  assert.match(app.lastFrame(), /Check CSS path\s+\(t\)/i);
  assert.doesNotMatch(
    app.lastFrame().slice(app.lastFrame().indexOf("Navigate:")),
    /Run check|Run doctor|Check usage|Check CSS/i,
  );

  await press(app, "c");
  await waitFor(() => calls.some(([name]) => name === "check"), "health report");
  assert.match(app.lastFrame(), /7 passed, 1 not checked/);
  assert.doesNotMatch(
    app.lastFrame(),
    /not_checked/i,
    "individual status details begin below the viewport",
  );
  await scrollDownUntil(app, /not_checked/i, "the individual health-check status");
  assert.match(app.lastFrame(), /not_checked/i);
  assert.match(app.lastFrame(), /Run check\s+\(c\)/i);
  await press(app, "d");
  await waitFor(() => calls.some(([name]) => name === "doctor"), "doctor diagnostics");
  assert.match(app.lastFrame(), /export missing/);
  await press(app, "u");
  await waitFor(() => calls.some(([name]) => name === "usage"), "strict usage check");
  assert.match(app.lastFrame(), /strict AST validation/i);
  assert.doesNotMatch(app.lastFrame(), /src\/view\.tsx:2/);
  await scrollDownUntil(app, /src\/view\.tsx:2/, "the strict usage finding");
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
  await waitFor(
    () => /Tailwind bridge plan is pending/i.test(app.lastFrame() ?? ""),
    "rendered Tailwind bridge plan status",
  );
  assert.deepEqual(
    calls.find(([name]) => name === "tailwind"),
    ["tailwind", "src/app.css"],
  );
  assert.match(app.lastFrame(), /Tailwind bridge plan is pending/i);
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 14 });
  app.stdout.emit("resize");
  await settle(app);
  await scrollDownUntil(app, /CSS target:/, "the explicit CSS bridge result");
  assert.match(app.lastFrame(), /WARNING · CSS bridge changes are pending/);
  assert.doesNotMatch(app.lastFrame(), /Read-only preview\. Nothing was written\./);
  await scrollDownUntil(
    app,
    /Read-only preview\. Nothing was written\./,
    "the read-only result scope",
  );
  assert.match(app.lastFrame(), /CSS target:/);
  assert.match(app.lastFrame(), /Read-only preview|no CSS was written/i);
  await scrollUpUntil(app, /Run check\s+\(c\)/i, "the inline check control after scrolling");
  assert.doesNotMatch(app.lastFrame().slice(app.lastFrame().indexOf("Navigate:")), /Run check/i);
  const completedChecks = calls.filter(([name]) => name === "check").length;
  await press(app, "c");
  await waitFor(
    () => calls.filter(([name]) => name === "check").length === completedChecks + 1,
    "the inline check action after scrolling",
  );
  app.unmount();
});

test("Checks owns its four non-paginated task controls at normal and narrow sizes", async () => {
  const calls = [];
  const services = makeServices({
    getProjectState: connectedState,
    runCheck: () => {
      calls.push("check");
      return { ok: true, summary: "Health report ready", checks: [] };
    },
    runDoctor: () => {
      calls.push("doctor");
      return { ok: true, summary: "Doctor ready", checks: [] };
    },
    runUsageCheck: () => {
      calls.push("usage");
      return { ok: true, summary: "Usage ready", findings: [] };
    },
  });
  const mouse = createMouseEventSource();
  const diagnostics = [];
  const app = start(services, {
    mouseEventSource: mouse.source,
    mouseDiagnostics: (event) => diagnostics.push(event),
    columns: 80,
    rows: 24,
  });
  await settle(app);
  await press(app, "4");
  await settle(app);
  const controls = ["Run check (c)", "Run doctor (d)", "Check usage (u)", "Check CSS path (t)"];
  for (const action of controls)
    assert.match(app.lastFrame(), new RegExp(action.replace(/[()]/g, "\\$&")));
  const lines = app.lastFrame().split("\n");
  const row = lines.findIndex((line) => line.includes("Run doctor (d)"));
  const column = lines[row].indexOf("Run doctor (d)") + 2;
  mouse.publish(mousePacket("move", column, row));
  await pause();
  const targetId = diagnostics.at(-1)?.targetId;
  assert.ok(targetId, "the visible doctor button is the actual mouse target");
  mouse.publish(mousePacket("press", column, row));
  mouse.publish(mousePacket("release", column, row));
  await waitFor(() => calls.includes("doctor"), "doctor callback from contextual mouse button");
  assert.equal(diagnostics.at(-1)?.targetId, targetId);
  await press(app, "c");
  await waitFor(() => calls.includes("check"), "existing check hotkey callback");
  assert.doesNotMatch(
    app.lastFrame().slice(app.lastFrame().indexOf("Navigate:")),
    /Run check|Run doctor|Check usage|Check CSS path/,
  );
  app.unmount();

  const narrow = start(services, { columns: 46, rows: 14 });
  await settle(narrow);
  await press(narrow, "4");
  await settle(narrow);
  assert.doesNotMatch(narrow.lastFrame(), /More actions|Previous actions/i);
  await scrollDownUntil(narrow, /Run doctor \(d\)/, "the Checks controls while content scrolls");
  assert.match(
    narrow.lastFrame(),
    /Run doctor \(d\)/,
    "Checks controls remain reachable while content scrolls",
  );
  await scrollUpUntil(narrow, /Run check\s+\(c\)/i, "the first Checks control");
  const doctorsBefore = calls.filter((name) => name === "doctor").length;
  const checksBefore = calls.filter((name) => name === "check").length;
  await press(narrow, "tab");
  await press(narrow, "tab");
  assert.match(
    narrow.lastFrame(),
    />\s+Run doctor/,
    "focus is marked on the visible doctor control",
  );
  await press(narrow, "enter");
  await waitFor(
    () => calls.filter((name) => name === "doctor").length === doctorsBefore + 1,
    "narrow doctor callback",
  );
  await scrollDownUntil(narrow, /Doctor ready/, "the narrow doctor result");
  assert.equal(
    calls.filter((name) => name === "doctor").length,
    doctorsBefore + 1,
    "Enter invokes the focused doctor action exactly once",
  );
  assert.equal(calls.filter((name) => name === "check").length, checksBefore);
  await scrollUpUntil(narrow, /Run check\s+\(c\)/i, "the top Checks controls");
  for (const action of controls) {
    const pattern = new RegExp(action.replace(/[()]/g, "\\$&"));
    if (!pattern.test(narrow.lastFrame() ?? "")) await scrollDownUntil(narrow, pattern, action);
    assert.match(narrow.lastFrame(), pattern, `${action} remains reachable at 46×14`);
  }
  narrow.unmount();
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
  assert.match(bodyFrame(app.lastFrame()), /Browse catalog\s+\(b\)/i);
  assert.match(footerFrame(app.lastFrame()), /q or Ctrl\+C exit/i);
  assert.match(footerFrame(app.lastFrame()), /navigation only/i);
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
  const mouse = createMouseEventSource();
  const diagnostics = [];
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
              kind: "package-json",
              path: "/consumer/demo-app/package.json",
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
    {
      mouseEventSource: mouse.source,
      mouseDiagnostics: (event) => diagnostics.push(event),
      columns: 80,
      rows: 24,
    },
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
  await press(app, "tab");
  await press(app, "tab");
  assert.match(app.lastFrame(), />\s+View manifest diff/);
  await press(app, "enter");
  await waitFor(() => /Manifest diff/.test(app.lastFrame() ?? ""), "focused manifest diff review");
  assert.equal(executions.length, 0, "focused diff Enter opens review only");
  await press(app, "escape");
  await waitFor(
    () => /Confirm planned change/.test(app.lastFrame() ?? ""),
    "return from manifest review",
  );
  await press(app, ".");
  await settle(app);
  assert.match(app.lastFrame(), /View manifest diff\s+\(m\)/);
  assert.doesNotMatch(app.lastFrame(), /Component added: Meter/);
  assert.equal(executions.length, 0);

  await press(app, "m");
  await waitFor(() => /Manifest diff/.test(app.lastFrame() ?? ""), "manifest diff modal");
  assert.match(app.lastFrame(), /Component added: Meter/);
  assert.match(app.lastFrame(), /Component removed: Avatar/);
  assert.match(app.lastFrame(), /↑\/↓ scroll/);
  await press(app, "escape");
  await settle(app);
  assert.match(app.lastFrame(), /Confirm planned change/);
  assert.equal(executions.length, 0, "closing a read-only manifest diff is safe");

  await press(app, "v");
  await waitFor(
    () => /UPGRADE_CONFIG_BEFORE_EXACT/.test(app.lastFrame() ?? ""),
    "exact upgrade config in the managed-file modal",
  );
  assert.match(app.lastFrame(), /UPGRADE_CONFIG_AFTER_EXACT/);
  assert.match(app.lastFrame(), /DIFF 1\/2/);
  assert.match(app.lastFrame(), /Previous diff|Prev diff/i);
  assert.match(app.lastFrame(), /Next diff/i);
  assert.doesNotMatch(app.lastFrame(), /Scroll up|Scroll down|Previous file|Next file/i);

  await press(app, "right");
  assert.match(app.lastFrame(), /PATH\s+\/consumer\/AGENTS\.md/);
  assert.match(app.lastFrame(), /DIFF 2\/2 · ROOT AGENTS \(MANAGED\)/);
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

  // Re-open the same diff from its beginning, then prove the Runeframe List's
  // normalized wheel target scrolls it without a footer scroll action.
  await press(app, "right");
  await press(app, "right");
  await settle(app);
  assert.match(app.lastFrame(), /DIFF 2\/2/);
  assert.doesNotMatch(app.lastFrame(), /UPGRADE_ROOT_AFTER_EXACT_SENTINEL/);
  mouse.publish(mousePacket("move", 79, 0));
  await pause();
  const visibleListRow = diagnostics
    .at(-1)
    .areas.find(
      (area) =>
        !area.wheelOnly &&
        area.eligible &&
        area.hasHandler &&
        area.bounds.width > 40 &&
        area.bounds.y < 19,
    );
  assert.ok(visibleListRow, "a visible preview row provides a safe wheel target");
  const wheelTarget = centerOfMeasuredBounds(visibleListRow.bounds);
  mouse.publish(mousePacket("move", wheelTarget.x, wheelTarget.y));
  await pause();
  mouse.publish(mousePacket("wheel", wheelTarget.x, wheelTarget.y, { direction: "down" }));
  await pause();
  const wheelDiagnostic = diagnostics.at(-1);
  const previewList = wheelDiagnostic.areas.find(
    (area) => area.wheelOnly && area.id === wheelDiagnostic.targetId,
  );
  assert.ok(previewList?.hasHandler, "the preview List owns the normalized wheel event");
  for (
    let index = 0;
    index < 60 && !/UPGRADE_ROOT_AFTER_EXACT_SENTINEL/.test(app.lastFrame() ?? "");
    index += 1
  ) {
    mouse.publish(mousePacket("wheel", wheelTarget.x, wheelTarget.y, { direction: "down" }));
    await pause();
  }
  assert.match(app.lastFrame(), /UPGRADE_ROOT_AFTER_EXACT_SENTINEL/);
  assert.equal(diagnostics.at(-1).action, "wheel-down");
  assert.equal(diagnostics.at(-1).targetId, previewList.id);
  for (let index = 0; index < 50; index += 1) {
    mouse.publish(mousePacket("wheel", wheelTarget.x, wheelTarget.y, { direction: "up" }));
    await pause();
  }
  assert.match(app.lastFrame(), /UPGRADE_ROOT_BEFORE_EXACT/);
  assert.doesNotMatch(app.lastFrame(), /UPGRADE_ROOT_AFTER_EXACT_SENTINEL/);

  await press(app, "escape");
  await settle(app);
  assert.match(app.lastFrame(), /Confirm planned change/);
  assert.equal(executions.length, 0);
  await press(app, "escape");
  await settle(app);
  assert.doesNotMatch(app.lastFrame(), /Confirm planned change/);
  assert.equal(executions.length, 0, "Escape closes preview, then cancels without applying");
  app.unmount();
});

test("Windows adapter normalizes raw Escape, closes a modal, then cancels without applying", async () => {
  const helper = createFakeWindowsHelper();
  const transport = await createWindowsInputTransport({
    platform: "win32",
    arch: "x64",
    executablePath: "Runeframe.Win32Input.exe",
    fileExists: () => true,
    spawnHelper: () => helper,
    readyTimeoutMs: 1000,
    stopTimeoutMs: 100,
    killGraceMs: 100,
  });
  const normalizedKeyEvents = [];
  activeModalEscapeEvents = normalizedKeyEvents;
  const executions = [];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      executeMutation: async (action) => {
        executions.push(action);
        return { ok: true, applied: true, failures: [] };
      },
    }),
    { normalizedKeyEvents },
  );
  const translatedWindowsChunks = [];
  const forwardWindowsInput = (chunk) => {
    translatedWindowsChunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    app.stdin.write(chunk);
  };
  transport.stdin.on("data", forwardWindowsInput);

  try {
    await settle(app);
    await pressWindowsKey(helper, "g");
    await waitFor(
      () => /Choose an exact upgrade version/.test(app.lastFrame() ?? ""),
      "upgrade version input from Windows key records",
    );
    for (const character of "2.0.0") await pressWindowsKey(helper, character);
    await pressWindowsKey(helper, "enter");
    await waitFor(
      () => /Confirm planned change/.test(app.lastFrame() ?? ""),
      "upgrade confirmation",
    );
    await pressWindowsKey(helper, "m");
    await waitFor(() => /Manifest diff/.test(app.lastFrame() ?? ""), "manifest diff modal");
    assert.equal(executions.length, 0);

    await pressWindowsKey(helper, "escape");
    await waitFor(
      () => /Confirm planned change/.test(app.lastFrame() ?? ""),
      "modal Escape returns to its pending confirmation",
    );
    assert.equal(executions.length, 0);
    assert.equal(translatedWindowsChunks.filter((chunk) => chunk === "\u001b").length, 1);
    assert.deepEqual(
      normalizedKeyEvents.at(-1),
      {
        key: "escape",
        escape: true,
        rawInput: "",
      },
      "Ink's Escape key flag normalizes Runeframe's non-printable input",
    );

    await settle(app);
    await pressWindowsKey(helper, "escape");
    await waitFor(
      () => !/Confirm planned change/.test(app.lastFrame() ?? ""),
      "second Escape cancels the pending confirmation",
    );
    assert.equal(executions.length, 0, "Escape closes the preview, then cancels without applying");
    assert.deepEqual(
      normalizedKeyEvents.slice(-2),
      [
        { key: "escape", escape: true, rawInput: "" },
        { key: "escape", escape: true, rawInput: "" },
      ],
      "both translated ESC bytes reach Runeframe as normalized Escape events",
    );
    assert.equal(translatedWindowsChunks.filter((chunk) => chunk === "\u001b").length, 2);
  } finally {
    transport.stdin.removeListener("data", forwardWindowsInput);
    app.unmount();
    await transport.close();
    activeModalEscapeEvents = null;
  }
});

test("narrow terminals keep paths and action hints reachable without paging", async () => {
  const app = start(makeServices({ getProjectState: connectedState }));
  await settle(app);
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: 38 });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: 12 });
  app.stdout.emit("resize");
  await settle(app);
  const frame = app.lastFrame();
  assert.match(frame, /\/consumer\/demo-app/);
  assert.match(footerFrame(frame), /Navigate:.*Manage/i);
  assert.match(footerFrame(frame), /q or Ctrl\+C exit/i);
  assert.doesNotMatch(frame, /More actions\s+\[\.\]|Previous actions/i);
  await scrollDownUntil(app, /Inspect manifest\s+\(d\)/i, "inline inspect control at 38x12");
  await scrollDownUntil(app, /Reconnect\s+\(c\)/i, "inline reconnect control at 38x12");
  assert.match(app.lastFrame(), /Reconnect\s+\(c\)/i);
  await press(app, ".");
  await settle(app);
  assert.doesNotMatch(app.lastFrame(), /Confirm planned change|Apply\s+\(/i);
  await scrollDownUntil(
    app,
    /Upgrade to exact version\s+\(g\)/i,
    "inline upgrade control at 38x12",
  );
  assert.match(app.lastFrame(), /Upgrade to exact version\s+\(g\)/i);
  app.unmount();
});

test("short resized terminals keep the footer anchored and inline actions clickable", async () => {
  const mouse = createMouseEventSource();
  const diagnostics = [];
  const executions = [];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      executeMutation: async (action) => {
        executions.push(action);
        return { ok: true, applied: true, failures: [] };
      },
    }),
    {
      mouseEventSource: mouse.source,
      mouseDiagnostics: (event) => diagnostics.push(event),
      columns: 38,
      rows: 12,
    },
  );
  await settle(app);
  const frame = app.lastFrame() ?? "";
  assert.match(frame.replace(/\s+/g, " "), /q or Ctrl\+C exit/);
  const sections = frameSections(frame);
  assert.notEqual(sections.footerStart, -1, "the anchored footer is separated by its top border");
  assert.match(sections.footer, /Navigate:/);
  assert.match(sections.footer, /q or Ctrl\+C exit/i);
  assert.match(sections.footer, /navigation only/i);
  assert.equal(sections.lines.length, 12, "the short terminal frame keeps its exact height");
  assert.ok(
    sections.footerStart < 12 && sections.footerStart >= 8,
    "the footer remains anchored at the bottom of the short terminal",
  );
  assert.doesNotMatch(sections.footer, /Inspect manifest|Reconnect|More actions/i);

  await scrollDownUntil(app, /Reconnect\s+\(c\)/i, "inline reconnect control at 38x12");
  mouse.publish(mousePacket("move", 37, 0));
  await pause();
  const reconnect = actionAreaFor(
    diagnostics,
    app.lastFrame(),
    /Reconnect\s+\(c\)/i,
    "inline reconnect action",
  );
  const measuredActions = diagnostics
    .at(-1)
    .areas.filter((area) => !area.wheelOnly && area.eligible && area.hasHandler && !area.disabled);
  assert.ok(measuredActions.length >= 1, "the visible inline actions have measured hitboxes");
  assert.ok(
    measuredActions.every(
      (area) =>
        area.bounds.x >= 0 &&
        area.bounds.y >= 0 &&
        area.bounds.x + area.bounds.width <= 38 &&
        area.bounds.y + area.bounds.height <= 12,
    ),
    "no inline target is clipped beyond the resized terminal bounds",
  );
  await publishClick(mouse, reconnect.bounds);
  assert.equal(
    diagnostics.at(-1).dispatched,
    true,
    "the inline action is a real mouse target at the resized terminal origin",
  );
  assert.equal(diagnostics.at(-1).targetId, reconnect.id);
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "reconnect preview");
  assert.equal(executions.length, 0, "opening an inline action never executes the preview");
  await press(app, "escape");
  await settle(app);
  assert.equal(executions.length, 0, "Escape cancels without mutation");
  app.unmount();
});

test("Manage exposes lifecycle actions, an explicit CSS target, compatibility review, and cancellation", async () => {
  const previews = [];
  const executions = [];
  const target = "@prism-system/ui-b";
  const app = start(
    makeServices({
      getProjectState: connectedState,
      searchSystems: async () => ({
        ok: true,
        results: [{ name: target, version: "2.0.0", description: "System B" }],
      }),
      previewMutation: async (action) => {
        previews.push(action);
        return {
          ...previewFor(action),
          from: { package: "@prism-system/ui-a", version: "1.2.3" },
          to: { package: action.packageName, version: action.version },
          compatibility: {
            blockers: [],
            warnings: [{ code: "appearance-unknown", message: "Token values cannot be compared." }],
            coverage: {
              filesScanned: 4,
              components: 3,
              extensions: 1,
              tokenReferences: 2,
              unverified: 0,
              skippedFiles: 0,
              limitations: ["Visual output is not tested."],
            },
          },
          material: {
            kind: "switch",
            entrySelection: {
              entries: [
                {
                  extension: "KeyboardScene",
                  entrypoint: "./custom/keyboard-scene",
                  file: "src/scene.tsx",
                },
              ],
            },
            peers: [
              {
                name: "three",
                kind: "peer",
                range: "^0.186.0",
                optional: true,
                action: "install",
                version: "0.186.1",
                installed: null,
                source: "active-usage",
              },
              {
                name: "react",
                kind: "peer",
                range: "^19",
                optional: false,
                action: "retain",
                version: "19.0.0",
                installed: "19.0.0",
                source: "installed",
              },
            ],
          },
          result: {
            ok: true,
            autoSelectedEntries: [
              {
                name: "KeyboardScene",
                entrypoint: "./custom/keyboard-scene",
                source: "active-usage",
                file: "src/scene.tsx",
                line: 4,
              },
            ],
          },
          preserved:
            action.kind === "remove"
              ? [{ path: "/consumer/demo-app/AGENTS.md", reason: "edited content" }]
              : [],
        };
      },
      executeMutation: async (action, preview) => {
        executions.push({ action, preview });
        return { ok: true, applied: true, changed: true, failures: [] };
      },
    }),
  );
  await settle(app);
  assert.match(app.lastFrame(), /Navigate:.*Manage/i);

  await press(app, "m");
  assert.match(app.lastFrame(), /Manage project and tooling/);
  assert.match(app.lastFrame(), /System lifecycle\s+\(s\)/i);
  await press(app, "s");
  assert.match(app.lastFrame(), /System lifecycle/);
  assert.match(app.lastFrame(), /Switch system\s+\(w\)/i);
  assert.match(app.lastFrame(), /Remove system\s+\(x\)/i);

  await press(app, "c");
  assert.match(app.lastFrame(), /Choose an explicit CSS file/);
  await typeText(app, "src/app.css");
  await press(app, "enter");
  assert.match(app.lastFrame(), /EXPLICIT CSS\s+src\/app\.css/);

  await press(app, "w");
  await waitFor(() => /System B/.test(app.lastFrame() ?? ""), "switch search results");
  await press(app, "enter");
  await waitFor(
    () => /Published manifest details/.test(app.lastFrame() ?? ""),
    "switch target details",
  );
  assert.match(app.lastFrame(), /@prism-system\/ui-b@2\.0\.0/);
  await scrollDownUntil(app, /Preview switch\s+\(w\)/i, "switch target preview control");
  assert.match(app.lastFrame(), /Preview switch\s+\(w\)/i);
  await press(app, "w");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "switch preview");
  assert.equal(previews[0].kind, "switch");
  assert.equal(previews[0].packageName, target);
  assert.equal(previews[0].version, "2.0.0");
  assert.equal(previews[0].cssPath, "src/app.css");
  const switchFrame = (
    await collectScrollableFrames(app, [
      { pattern: /Compatibility review/, description: "switch compatibility review" },
      { pattern: /Coverage: 4 files/, description: "switch usage coverage" },
      { pattern: /Token values cannot be compared/, description: "switch compatibility warning" },
      { pattern: /Visual output is not tested/, description: "switch coverage limitation" },
      { pattern: /Automatically selected from usage/, description: "auto-selected entries" },
      {
        pattern: /KeyboardScene \(\.\/custom\/keyboard-scene\)/,
        description: "selected entry details",
      },
      { pattern: /Selected peer actions/, description: "selected peer actions" },
      { pattern: /react \[peer\]/, description: "retained peer action" },
    ])
  ).replace(/\s+/g, " ");
  assert.match(switchFrame, /Compatibility review/);
  assert.match(switchFrame, /Coverage: 4 files/);
  assert.match(switchFrame, /Token values cannot be compared/);
  assert.match(switchFrame, /Visual output is not tested/);
  assert.match(switchFrame, /Automatically selected from usage/);
  assert.match(switchFrame, /KeyboardScene \(\.\/custom\/keyboard-scene\) · src\/scene\.tsx/);
  assert.match(switchFrame, /Selected peer actions/);
  assert.match(switchFrame, /three \[peer\] · \^0\.186\.0 · optional · install 0\.186\.1/);
  assert.match(switchFrame, /react \[peer\] · \^19 · required · retain installed 19\.0\.0/);
  assert.equal(executions.length, 0);
  await press(app, "escape");
  await settle(app);
  assert.equal(executions.length, 0, "canceling the reviewed switch never executes it");

  await press(app, "b");
  await settle(app);
  assert.match(app.lastFrame(), /System lifecycle/);
  await press(app, "x");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "remove preview");
  assert.equal(previews.at(-1).kind, "remove");
  const removalReview = await collectScrollableFrames(app, [
    { pattern: /Removal review/, description: "removal review" },
    {
      pattern: /Preserved: \/consumer\/demo-app\/AGENTS\.md/,
      description: "preserved managed file",
    },
  ]);
  assert.match(removalReview, /Removal review/);
  assert.match(removalReview, /Preserved: \/consumer\/demo-app\/AGENTS\.md/);
  await press(app, "n");
  assert.equal(executions.length, 0, "canceling removal never executes it");
  app.unmount();
});

test("compact switch review bounds long detected-entry and peer lists without hiding confirmation", async () => {
  const executions = [];
  const target = "@prism-system/ui-b";
  const app = start(
    makeServices({
      getProjectState: connectedState,
      searchSystems: async () => ({
        ok: true,
        results: [{ name: target, version: "2.0.0", description: "System B" }],
      }),
      previewMutation: async (action) => ({
        ...previewFor(action),
        from: { package: "@prism-system/ui-a", version: "1.2.3" },
        to: { package: action.packageName, version: action.version },
        compatibility: { blockers: [], warnings: [], coverage: {} },
        material: {
          peers: [
            {
              name: "three",
              kind: "peer",
              range: "^0.186.0",
              optional: true,
              action: "install",
              version: "0.186.1",
            },
            {
              name: "react",
              kind: "peer",
              range: "^19",
              optional: false,
              action: "retain",
              installed: "19.0.0",
            },
            {
              name: "vite",
              kind: "peer",
              range: "^6",
              optional: true,
              action: "retain",
              installed: "6.0.0",
            },
            {
              name: "motion",
              kind: "peer",
              range: "^12",
              optional: true,
              action: "install",
              version: "12.0.0",
            },
          ],
        },
        result: {
          autoSelectedEntries: [
            { name: "KeyboardScene", entrypoint: "./custom/keyboard-scene", file: "src/scene.tsx" },
            { name: "WorkflowMap", entrypoint: "./custom/workflow-map", file: "src/workflow.tsx" },
            { name: "CanvasScene", entrypoint: "./custom/canvas-scene", file: "src/canvas.tsx" },
          ],
        },
      }),
      executeMutation: async (action) => {
        executions.push(action);
        return { ok: true, applied: true, failures: [] };
      },
    }),
    { columns: 46, rows: 15 },
  );

  await settle(app);
  await press(app, "m");
  await press(app, "s");
  await press(app, "w");
  await waitFor(() => /System B/.test(app.lastFrame() ?? ""), "compact switch results");
  await press(app, "enter");
  await waitFor(
    () => /Published manifest details/.test(app.lastFrame() ?? ""),
    "compact switch target details",
  );
  await scrollDownUntil(app, /Preview switch\s+\(w\)/i, "compact switch target preview control");
  assert.match(app.lastFrame(), /Preview switch\s+\(w\)/i);
  await press(app, "w");
  await waitFor(
    () => /Confirm planned change/.test(app.lastFrame() ?? ""),
    "compact switch preview",
  );

  const frame = (
    await collectScrollableFrames(app, [
      {
        pattern: /KeyboardScene \(\.\/custom\/keyboard-scene\)/,
        description: "first auto-selected entry",
      },
      {
        pattern: /\+2 more auto-selected entries not shown/,
        description: "remaining auto-selected entry count",
      },
      { pattern: /Selected peer actions/, description: "compact selected peer actions" },
      { pattern: /three \[peer\]/, description: "first compact peer action" },
      { pattern: /\+3 more peer actions not shown/, description: "remaining peer action count" },
    ])
  ).replace(/\s+/g, " ");
  assert.match(frame, /Confirm planned change/);
  assert.match(frame, /@prism-system\/ui-b@2\.0\.0/);
  assert.match(frame, /KeyboardScene \(\.\/custom\/keyboard-scene\)/);
  assert.match(frame, /\+2 more auto-selected entries not shown/);
  assert.match(frame, /three \[peer\] · \^0\.186\.0 · optional · install 0\.186\.1/);
  assert.match(frame, /\+3 more peer actions not shown/);
  assert.match(frame, /Confirm & apply\s+\(y \/ Enter\)/i);
  assert.equal(executions.length, 0);
  await press(app, "escape");
  assert.equal(executions.length, 0, "canceling a compact preview does not mutate the project");
  app.unmount();
});

test("Use offers pending automatic skill setup, an explicit agent, and a clear no-skill opt-out", async () => {
  const actions = [];
  const executions = [];
  const services = makeServices({
    searchSystems: async () => ({
      ok: true,
      results: [{ name: "@prism-system/ui-a", version: "1.2.3", description: "System A" }],
    }),
    previewMutation: async (action) => {
      actions.push(action);
      return {
        ...previewFor(action),
        ...(action.skills
          ? {
              skillSetup: {
                enabled: true,
                status: action.skillAgents?.length ? "planned" : "pending",
                agents: action.skillAgents ?? [],
                guidance: action.skillAgents?.length
                  ? "The selected agent is explicit."
                  : "No agent was detected; skill setup remains pending and does not block system setup.",
              },
            }
          : {}),
      };
    },
    executeMutation: async (action) => {
      executions.push(action);
      return { ok: true, applied: true, failures: [] };
    },
  });
  const app = start(services);
  await settle(app);
  await press(app, "b");
  await settle(app);
  await press(app, "enter");
  await waitFor(() => /Published manifest details/.test(app.lastFrame() ?? ""), "catalog details");
  await scrollDownUntil(
    app,
    /Use without skill setup\s+\(n\)/i,
    "inline use-without-skill control",
  );
  assert.match(bodyFrame(app.lastFrame()), /Use without skill setup\s+\(n\)/i);
  await scrollDownUntil(app, /Choose skill agent\s+\(a\)/i, "inline choose-agent control");
  assert.match(bodyFrame(app.lastFrame()), /Choose skill agent\s+\(a\)/i);

  await press(app, "u");
  await waitFor(
    () => /Confirm planned change/.test(app.lastFrame() ?? ""),
    "automatic use preview",
  );
  assert.equal(actions.at(-1).skills, true);
  assert.deepEqual(actions.at(-1).skillAgents, []);
  const usePreview = await collectScrollableFrames(app, [
    { pattern: /Consumer skill setup: pending/, description: "pending consumer skill setup" },
    {
      pattern: /remains pending and does not block system setup/,
      description: "pending skill setup guidance",
    },
  ]);
  assert.match(usePreview, /Consumer skill setup: pending/);
  assert.match(usePreview.replace(/\s+/g, " "), /remains pending and does not block system setup/);
  await press(app, "escape");
  await settle(app);
  assert.equal(executions.length, 0);

  await press(app, "n");
  await waitFor(
    () => /Confirm planned change/.test(app.lastFrame() ?? ""),
    "use without skill preview",
  );
  assert.equal(actions.at(-1).skills, false);
  assert.doesNotMatch(app.lastFrame(), /Consumer skill setup:/);
  await press(app, "escape");
  await settle(app);

  await press(app, "a");
  assert.match(app.lastFrame(), /Choose an agent for the use skill/);
  assert.match(app.lastFrame().replace(/\s+/g, " "), /no provider is guessed/i);
  await typeText(app, "codex");
  await press(app, "enter");
  await waitFor(
    () => /Confirm planned change/.test(app.lastFrame() ?? ""),
    "explicit-agent use preview",
  );
  assert.equal(actions.at(-1).skills, true);
  assert.deepEqual(actions.at(-1).skillAgents, ["codex"]);
  const explicitUsePreview = await collectScrollableFrames(app, [
    { pattern: /Agents: codex/, description: "explicit use skill agent" },
  ]);
  assert.match(explicitUsePreview, /Agents: codex/);
  assert.equal(executions.length, 0, "use previews never install until the user confirms");
  app.unmount();
});

test("skills screen observes inventory offline, requires an agent, and cancellation never installs", async () => {
  let inventoryCalls = 0;
  const previews = [];
  const previewResponses = [];
  const executions = [];
  const catalog = [
    {
      id: "use-design-system",
      skill: "use-design-system",
      type: "prism",
      source: "prism",
      publisher: "Prism",
      categories: ["lifecycle"],
      tags: ["consumer"],
      role: "consumer",
      reviewStatus: "firstparty",
    },
    {
      id: "frontend-design",
      skill: "frontend-design",
      type: "design",
      source: "vercel-labs/agent-skills",
      publisher: "Vercel Labs",
      categories: ["design"],
      tags: ["ui"],
      role: "design-craft",
      reviewStatus: "reviewed",
    },
  ];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      skillAgentIds: ["codex", "unverified-agent", "claude-code", "cursor", "opencode"],
      listSkills: async ({ scope }) => {
        inventoryCalls += 1;
        return {
          ok: true,
          catalog,
          installed: [
            {
              catalogId: "use-design-system",
              scope: "project",
              managed: true,
              modified: false,
              drift: false,
              placements: [{ relativePath: ".agents/skills/use-design-system", agent: null }],
              relativePath: ".agents/skills/use-design-system",
            },
            {
              name: "use-design-system",
              scope: "global",
              managed: false,
              modified: false,
              drift: false,
              relativePath: "skills/use-design-system",
            },
          ],
          scope,
        };
      },
      previewSkillMutation: async (action) => {
        previews.push(action);
        const result = {
          ok: true,
          dryRun: true,
          kind: "skill",
          material: { ...action, revision: "a".repeat(40) },
          result: {
            ok: true,
            expectedPlan: { revision: "a".repeat(40), targets: [] },
            command: { executable: "npx", package: "skills@1.7.0", args: ["--yes", "add"] },
            targets: [
              {
                path: "/consumer/demo-app/.agents/skills/use-design-system",
                selected: true,
                exists: true,
              },
            ],
            warnings: [],
          },
        };
        previewResponses.push(result);
        return result;
      },
      executeSkillMutation: async (action, preview) => {
        executions.push({ action, preview });
        return executions.length === 1
          ? { ok: true, applied: true, changed: true, failures: [] }
          : { ok: true, applied: false, changed: false, failures: [] };
      },
    }),
  );
  await settle(app);
  await press(app, "m");
  await press(app, "k");
  await waitFor(() => /Prism skills/.test(app.lastFrame() ?? ""), "skill inventory");
  assert.equal(inventoryCalls, 1);
  assert.match(app.lastFrame(), /AGENT\s+not selected/);
  assert.match(app.lastFrame(), /Instructions only/);
  assert.doesNotMatch(footerFrame(app.lastFrame()), /Add skill|Choose agent/i);
  assert.match(app.lastFrame(), /Enter or click a skill to view details/);

  await press(app, "enter");
  assert.match(app.lastFrame(), /use-design-system/);
  assert.match(app.lastFrame(), /Agent: not selected/i);
  assert.match(app.lastFrame(), /Scope: project/i);
  assert.match(app.lastFrame(), /\[i\] Update \(preview\)/);
  assert.match(app.lastFrame(), /\[x\] Remove/);
  assert.match(app.lastFrame(), /Source: prism · Publisher: Prism · Trust: firstparty/);
  assert.match(app.lastFrame(), /Managed/);
  assert.doesNotMatch(app.lastFrame(), /modified files detected|placement drift detected/i);
  assert.match(app.lastFrame(), /Paths: \.agents\/skills\/use-design-system/);
  assert.match(app.lastFrame(), /No description is published/);
  assert.equal(previews.length, 0, "an absent agent selection never produces a plan");
  await press(app, "escape");
  assert.doesNotMatch(app.lastFrame(), /ID \/ TYPE/);
  assert.equal(previews.length, 0, "closing the details dialog does not plan or mutate");
  await press(app, "enter");
  await press(app, "a");
  assert.match(app.lastFrame(), /Agent: codex/i);
  await press(app, "g");
  assert.match(app.lastFrame(), /Scope: global/i);
  assert.match(app.lastFrame(), /External\/unmanaged/i);
  assert.match(app.lastFrame(), /overwrite\/remove unavailable/);
  assert.doesNotMatch(app.lastFrame(), /\[i\] Update|\[x\] Remove/);
  await press(app, "g");
  assert.match(app.lastFrame(), /Scope: project/i);
  await press(app, "u");
  await waitFor(
    () => /Confirm skill update/.test(app.lastFrame() ?? ""),
    "skill update confirmation",
  );
  assert.equal(previews.length, 1);
  assert.deepEqual(previews[0].agents, ["codex"]);
  const skillPreview = await collectScrollableFrames(app, [
    { pattern: /SOURCE REVISION/, description: "skill source revision" },
    { pattern: /Planned skill placements/, description: "planned skill placement" },
    {
      pattern: /Universal agents may share the canonical placement/,
      description: "shared skill placement guidance",
    },
  ]);
  assert.match(skillPreview, /SOURCE REVISION/);
  assert.match(skillPreview, /Planned skill placements/);
  assert.match(skillPreview, /Universal agents may share the canonical placement/);
  assert.equal(executions.length, 0);
  await press(app, "escape");
  assert.equal(executions.length, 0, "cancellation does not call the skill installer");

  await settle(app);
  await press(app, "enter");
  await press(app, "u");
  await waitFor(
    () => /Confirm skill update/.test(app.lastFrame() ?? ""),
    "second skill update preview",
  );
  assert.equal(executions.length, 0);
  await press(app, "y");
  await waitFor(() => executions.length === 1, "confirmed skill update");
  assert.equal(
    executions[0].preview,
    previewResponses[1],
    "execution receives the unchanged reviewed preview",
  );
  await waitFor(() => inventoryCalls === 2, "inventory refresh after skill update");

  await settle(app);
  await press(app, "enter");
  await press(app, "u");
  await waitFor(() => /Confirm skill update/.test(app.lastFrame() ?? ""), "no-op skill preview");
  await press(app, "y");
  await waitFor(
    () => /Skill action made no changes/.test(app.lastFrame() ?? ""),
    "truthful no-op status",
  );
  assert.equal(executions.length, 2);
  await waitFor(() => inventoryCalls === 3, "inventory refresh after no-op");

  await settle(app);
  await press(app, "escape");
  await press(app, "k");
  await press(app, "d");
  await press(app, "enter");
  assert.match(app.lastFrame(), /frontend-design/);
  assert.match(app.lastFrame(), /\[i\] Install \(preview\)/);
  await press(app, "a");
  await press(app, "g");
  assert.match(app.lastFrame(), /Scope: global/i);
  assert.match(
    app.lastFrame(),
    /Agent: (codex|unverified-agent|claude-code|cursor|opencode)/i,
    "an explicit supported agent remains selected",
  );
  app.unmount();
});

test("skill modal disables shell navigation mouse targets behind the overlay", async () => {
  const mouse = createMouseEventSource();
  const diagnostics = [];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      skillAgentIds: ["codex"],
      listSkills: async () => ({
        ok: true,
        catalog: [
          {
            id: "use-design-system",
            skill: "use-design-system",
            type: "prism",
            source: "prism",
            role: "consumer",
          },
        ],
        installed: [],
        scope: "project",
      }),
    }),
    {
      mouseEventSource: mouse.source,
      mouseDiagnostics: (event) => diagnostics.push(event),
      columns: 80,
      rows: 24,
    },
  );
  await settle(app);
  await press(app, "m");
  await press(app, "k");
  await waitFor(() => /use-design-system/.test(app.lastFrame() ?? ""), "skill list");
  await press(app, "enter");
  assert.match(app.lastFrame(), /Agent: not selected/);

  // Probe the old Manage-button location at the bottom of the terminal. Use
  // the event's actual target, not an arbitrary eligible-area snapshot entry.
  mouse.publish(mousePacket("move", 10, 22));
  await pause();
  assert.equal(
    diagnostics.at(-1)?.targetId ?? null,
    null,
    "the hidden shell footer has no target while the dialog is open",
  );
  app.unmount();
});

test("slow startup update check does not block the connected screen; global update needs a selected manager", async () => {
  let resolveCheck;
  const checkCalls = [];
  const previews = [];
  const executions = [];
  const plan = {
    packageName: "@prism-system/tools",
    currentVersion: "2.9.0",
    targetVersion: "3.0.0",
    scope: "global",
    installation: { kind: "global", manager: "npm", verified: true },
    command: {
      manager: "npm",
      verb: "install",
      args: ["install", "-g", "@prism-system/tools@3.0.0"],
    },
    postVerifySupported: true,
  };
  const app = start(
    makeServices({
      getProjectState: connectedState,
      checkCliUpdate: (options) => {
        checkCalls.push(options);
        return new Promise((resolve) => {
          resolveCheck = resolve;
        });
      },
      previewCliUpdate: async (options) => {
        previews.push(options);
        return {
          ok: true,
          dryRun: true,
          kind: "self-update",
          updateAvailable: true,
          plan: { ...plan, scope: options.global ? "global" : "local" },
          material: { plan, plannedChanges: [] },
        };
      },
      executeCliUpdate: async (options, preview) => {
        executions.push({ options, preview });
        return { ok: true, applied: true, changed: true, failures: [] };
      },
    }),
  );
  await waitFor(() => checkCalls.length === 1, "nonblocking startup update check");
  assert.match(
    app.lastFrame(),
    /CONNECTED/i,
    "local project state renders while the registry request is pending",
  );
  assert.deepEqual(checkCalls[0], { timeoutMs: 2500 });

  await press(app, "m");
  await press(app, "u");
  assert.match(app.lastFrame(), /Checking in background/i);
  assert.match(app.lastFrame(), /Update the prism-ds CLI only/);
  assert.match(app.lastFrame(), /does not upgrade your design system/i);
  resolveCheck({
    ok: true,
    available: true,
    current: "2.9.0",
    latest: "3.0.0",
    installation: { kind: "unknown", manager: null, verified: false },
    advice: "A newer release is available; installation context is unknown.",
  });
  await waitFor(() => /UPDATE AVAILABLE/i.test(app.lastFrame() ?? ""), "startup update result");
  assert.equal(executions.length, 0, "startup only checks; it never installs");

  await press(app, "g");
  assert.match(app.lastFrame(), /Choose npm or pnpm first/);
  assert.equal(previews.length, 0, "global scope is never guessed");
  await press(app, "n");
  await settle(app);
  await press(app, "g");
  await waitFor(
    () => /Confirm prism-ds CLI update/.test(app.lastFrame() ?? ""),
    "explicit global update preview",
  );
  assert.deepEqual(previews[0], { global: true, manager: "npm" });
  const updatePreview = await collectScrollableFrames(app, [
    { pattern: /npm install -g/, description: "explicit global CLI update command" },
  ]);
  assert.match(updatePreview, /PACKAGE\s+@prism-system\/tools/);
  assert.match(updatePreview, /TARGET VERSION\s+3\.0\.0/);
  assert.match(updatePreview, /npm install -g/);
  assert.equal(executions.length, 0);
  await press(app, "escape");
  assert.equal(executions.length, 0, "canceling the CLI update leaves the installation untouched");
  app.unmount();
});

test("recovery keeps guidance separate and requires confirmation for an applicable repair", async () => {
  const previews = [];
  const executions = [];
  const suggestions = [
    {
      id: "repair-config",
      label: "Repair the consumer config",
      reason: "The config is malformed; manual editing is required.",
      executable: false,
    },
    {
      id: "connect",
      label: "Reconnect the consumer contract",
      reason: "The installed package is not connected.",
      executable: true,
      kind: "connect",
      command: { bin: "prism-ds", args: ["connect"] },
    },
  ];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      runRecovery: () => ({
        ok: false,
        report: {
          ok: false,
          summary: "2 issues at /consumer/demo-app",
          issues: [
            { id: "consumer-config", label: "Consumer config", detail: "Malformed JSON." },
            { id: "connection", label: "Connection", detail: "Not connected." },
          ],
        },
        suggestions,
        failures: [],
      }),
      previewRecoveryAction: (action) => {
        previews.push(action);
        return {
          ok: true,
          dryRun: true,
          actionId: "connect",
          kind: "connect",
          suggestion: suggestions[1],
          plan: {
            packageName: "@prism-system/ui-a",
            version: "1.2.3",
            files: [
              {
                kind: "package-json",
                path: "/consumer/demo-app/package.json",
                before: null,
                after: "{}",
              },
            ],
          },
          material: { actionId: "connect" },
        };
      },
      executeRecoveryAction: async (action, preview) => {
        executions.push({ action, preview });
        return {
          ok: true,
          actionCompleted: true,
          repaired: false,
          healthy: false,
          stillRemaining: ["consumer-config"],
          failures: ["A malformed file still needs manual repair."],
        };
      },
    }),
  );
  await settle(app);
  await press(app, "m");
  await press(app, "r");
  await waitFor(() => /2 issues at/.test(app.lastFrame() ?? ""), "recovery diagnosis");
  const diagnosisFrame = app.lastFrame() ?? "";
  assert.match(
    diagnosisFrame,
    /GUIDANCE\s+Repair the consumer config/,
    "normal recovery guidance is visible immediately above the secondary CSS/entry controls",
  );
  assert.match(diagnosisFrame, /REPAIR\s+Reconnect the consumer contract/);
  const normalizedDiagnosis = diagnosisFrame.replace(/\s+/g, " ");
  if (/Set a CSS target/.test(normalizedDiagnosis)) {
    assert.ok(
      normalizedDiagnosis.search(/GUIDANCE\s+Repair the consumer config/) <
        normalizedDiagnosis.search(/Set a CSS target/),
      "recovery suggestions stay above secondary CSS/entry controls",
    );
    assert.ok(
      normalizedDiagnosis.search(/Preview selected repair/i) <
        normalizedDiagnosis.search(/Set a CSS target/),
      "the repair preview control stays above secondary CSS/entry controls",
    );
  }

  await press(app, "enter");
  assert.equal(previews.length, 0, "guidance-only recommendations never invoke a planner");
  assert.match(app.lastFrame(), /Guidance only/);
  await scrollDownUntil(
    app,
    /2\s+REPAIR\s+Reconnect the consumer contract/,
    "the applicable recovery repair choice",
  );
  await press(app, "2");
  await scrollDownUntil(
    app,
    /Preview selected repair/i,
    "the inline repair preview control before optional CSS/entry controls",
  );
  assert.match(app.lastFrame(), /Preview selected repair/i);
  await press(app, "enter");
  await waitFor(
    () => /Confirm targeted recovery action/.test(app.lastFrame() ?? ""),
    "recovery action preview",
  );
  assert.equal(previews.length, 1);
  assert.equal(previews[0].actionId, "connect");
  const recoveryPreview = await collectScrollableFrames(app, [
    { pattern: /Planned file effects/, description: "targeted recovery file effects" },
  ]);
  assert.match(recoveryPreview, /Confirm targeted recovery action/);
  assert.match(recoveryPreview, /Planned file effects/);
  assert.equal(executions.length, 0);
  await press(app, "escape");
  assert.equal(executions.length, 0, "canceling recovery never applies the repair");
  app.unmount();
});

test("compact project facts keep labels and values readable without column collisions", async () => {
  const app = start(makeServices({ getProjectState: connectedState }), { columns: 46, rows: 16 });
  await settle(app);
  const frames = await collectScrollableFrames(app, [
    { pattern: /EXACT VERSION\s+1\.2\.3/, description: "project version fact" },
    { pattern: /CONTRACT\s+4/, description: "contract fact" },
    { pattern: /TARGET\s+\/consumer\/demo-app/, description: "consumer target fact" },
  ]);
  assert.match(frames, /PACKAGE\s+@prism-system\/ui-a/);
  assert.match(frames, /EXACT VERSION\s+1\.2\.3/);
  assert.match(frames, /CONTRACT\s+4/);
  assert.match(frames, /TARGET\s+\/consumer\/demo-app/);
  assert.doesNotMatch(frames, /CONTRACTARGET|ui-a1\.2\.3/);
  app.unmount();
});

test("full TUI keeps project context and both safe confirmation choices at short widths", async () => {
  for (const [columns, rows] of [
    [46, 14],
    [38, 12],
  ]) {
    const executions = [];
    const app = start(
      makeServices({
        getProjectState: connectedState,
        executeMutation: async (action, preview) => {
          executions.push({ action, preview });
          return { ok: true, applied: true, changed: true, failures: [] };
        },
      }),
      { columns, rows },
    );
    await settle(app);
    const home = app.lastFrame() ?? "";
    assert.match(home, /@prism-system\/ui-a@1\.2\.3/);
    assert.match(footerFrame(home).replace(/\s+/g, " "), /navigation only/i);
    assert.doesNotMatch(home, /More actions\s+\[\.\]|Previous actions/i);
    await scrollDownUntil(app, /Reconnect\s+\(c\)/i, `${columns}x${rows} inline reconnect control`);
    assert.match(bodyFrame(app.lastFrame()), /Inspect manifest\s+\(d\)/i);
    await scrollDownUntil(
      app,
      /Upgrade to exact version\s+\(g\)/i,
      `${columns}x${rows} inline upgrade control`,
    );
    assert.match(bodyFrame(app.lastFrame()), /Upgrade to exact version\s+\(g\)/i);

    await press(app, "g");
    await typeText(app, "2.0.0");
    await press(app, "enter");
    await waitFor(
      () => /CHANGE PREVIEW|Review controls/.test(app.lastFrame() ?? ""),
      `${columns}x${rows} preview`,
    );
    const approval = app.lastFrame() ?? "";
    assert.match(approval, /Apply\s+\(y \/ Enter\)/i);
    assert.match(approval, /Cancel\s+\(Esc \/ n\)/i);
    assert.equal(executions.length, 0, "preview rendering is read-only");
    await scrollDownUntil(app, /Confirm planned change/, `${columns}x${rows} confirmation title`);
    await press(app, "escape");
    assert.equal(executions.length, 0, "Escape cancels without executing");
    app.unmount();
  }
});

test("integrated footer focus is visible, wraps every action, and never steals list or input keys", async () => {
  for (const columns of [38, 46, 50, 68, 80, 100]) {
    const executions = [];
    const app = start(
      makeServices({
        getProjectState: connectedState,
        executeMutation: async (action, preview) => {
          executions.push({ action, preview });
          return { ok: true, applied: true, changed: true, failures: [] };
        },
      }),
      { columns, rows: columns < 50 ? 12 : 18 },
    );
    await settle(app);
    await scrollDownUntil(
      app,
      /Inspect manifest\s+\(d\)/i,
      `${columns} columns inline action controls`,
    );
    await scrollDownUntil(
      app,
      /Refresh state\s+\(p\)/i,
      `${columns} columns all inline action rows`,
    );
    const seen = new Set();
    let firstMarker = "";
    for (let index = 0; index < 30; index += 1) {
      await press(app, "tab");
      const frame = app.lastFrame() ?? "";
      const marker = frame.match(/\[>\s*[^\]]+\]/)?.[0] ?? "";
      assert.ok(marker, `${columns} columns shows a textual focused-action marker:\n${frame}`);
      if (!firstMarker) firstMarker = marker;
      seen.add(marker);
      if (index > 1 && marker === firstMarker) break;
    }
    assert.ok(seen.size >= 3, `${columns} columns exposes multiple actions through Tab`);
    assert.equal(executions.length, 0, "moving focus never executes a mutation");
    await press(app, "shift-tab");
    await settle(app);
    assert.doesNotMatch(app.lastFrame(), /Tab next · Shift\+Tab back · Enter activate/);
    app.unmount();
  }

  const app = start(makeServices({ getProjectState: connectedState }), { columns: 80, rows: 24 });
  await settle(app);
  await press(app, "5");
  await settle(app);
  await press(app, "/");
  await typeText(app, "q,.");
  assert.match(app.lastFrame(), /Filter icon names/);
  assert.match(app.lastFrame(), /q/);
  assert.match(app.lastFrame(), /,\./);
  assert.doesNotMatch(app.lastFrame(), /Tab actions/);
  app.unmount();
});

test("integrated focused Enter confirms exactly once and Escape still cancels", async () => {
  const executions = [];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      executeMutation: async (action, preview) => {
        executions.push({ action, preview });
        return { ok: true, applied: true, changed: true, failures: [] };
      },
    }),
    { columns: 80, rows: 24 },
  );
  await settle(app);
  await press(app, "g");
  await typeText(app, "2.0.0");
  await press(app, "enter");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "confirmation screen");
  assert.equal(executions.length, 0);
  await press(app, "tab");
  await press(app, "tab");
  assert.match(app.lastFrame(), />\s+Confirm & apply/);
  await press(app, "enter");
  await waitFor(() => executions.length === 1, "one confirmed execution");
  await pause(50);
  assert.equal(executions.length, 1, "Enter is not double-activated by Runeframe Button");
  app.unmount();

  const canceledExecutions = [];
  const canceled = start(
    makeServices({
      getProjectState: connectedState,
      executeMutation: async (action) => {
        canceledExecutions.push(action);
        return { ok: true, applied: true, failures: [] };
      },
    }),
    { columns: 46, rows: 14 },
  );
  await settle(canceled);
  await press(canceled, "g");
  await typeText(canceled, "2.0.0");
  await press(canceled, "enter");
  await waitFor(
    () => /Confirm planned change/.test(canceled.lastFrame() ?? ""),
    "short confirmation",
  );
  assert.match(canceled.lastFrame(), /Apply\s+\(y \/ Enter\)/i);
  assert.match(canceled.lastFrame(), /Cancel\s+\(Esc \/ n\)/i);
  await press(canceled, "escape");
  assert.equal(canceledExecutions.length, 0, "Escape from integrated confirmation never executes");
  canceled.unmount();
});

test("focused Cancel owns Enter and cannot execute a pending mutation", async () => {
  const executions = [];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      executeMutation: async (action) => {
        executions.push(action);
        return { ok: true, applied: true, failures: [] };
      },
    }),
    { columns: 80, rows: 24 },
  );
  await settle(app);
  await press(app, "g");
  await typeText(app, "2.0.0");
  await press(app, "enter");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "confirmation screen");
  // Walk focus to Cancel rather than using its direct n/Escape shortcut.
  for (let index = 0; index < 6; index += 1) await press(app, "tab");
  assert.match(app.lastFrame(), />\s+Cancel/);
  await press(app, "enter");
  await pause(30);
  assert.equal(executions.length, 0);
  assert.doesNotMatch(app.lastFrame(), /Confirm planned change/);
  app.unmount();
});

test("disabled or stale focused confirmation controls consume activation without applying", () => {
  const calls = [];
  const event = { enter: true, key: "Enter" };
  for (const key of ["cancel", "inspect-files"]) {
    const handled = dispatchFocusedAction({
      focusedKey: key,
      actions: [{ key, disabled: true, onActivate: () => calls.push(key) }],
      event,
      inputView: false,
      confirmationView: true,
    });
    assert.equal(handled, true);
  }
  assert.equal(
    dispatchFocusedAction({
      focusedKey: "cancel",
      actions: [],
      event,
      inputView: false,
      confirmationView: true,
    }),
    true,
    "a stale focused key still owns Enter",
  );
  assert.deepEqual(calls, [], "disabled/stale controls never invoke Apply or their own callbacks");
});

test("short confirmation keeps Apply and Cancel visible together and still requires explicit approval", async () => {
  const executions = [];
  const app = start(
    makeServices({
      getProjectState: connectedState,
      executeMutation: async (action, preview) => {
        executions.push({ action, preview });
        return { ok: true, applied: true, changed: true, failures: [] };
      },
    }),
    { columns: 46, rows: 16 },
  );
  await settle(app);
  await press(app, "g");
  await typeText(app, "2.0.0");
  await press(app, "enter");
  await waitFor(() => /Confirm planned change/.test(app.lastFrame() ?? ""), "short confirmation");

  const frame = app.lastFrame() ?? "";
  assert.match(frame, /Confirm & apply\s+\(y \/ Enter\)/i);
  assert.match(frame, /Cancel\s+\(Esc \/ n\)/i);
  assert.doesNotMatch(footerFrame(frame), /Apply\s+\(y \/ Enter\)|Cancel\s+\(Esc \/ n\)/i);
  const confirmationFrames = await collectScrollableFrames(app, [
    { pattern: /EXACT VERSION\s+2\.0\.0/, description: "exact version in the approval plan" },
  ]);
  assert.match(confirmationFrames, /EXACT VERSION\s+2\.0\.0/);
  assert.equal(executions.length, 0, "rendering the approval controls never executes the plan");

  await press(app, "escape");
  await settle(app);
  assert.equal(executions.length, 0, "Escape remains a safe cancellation on a small terminal");
  assert.match(app.lastFrame() ?? "", /Cancelled/);
  app.unmount();

  const approvingApp = start(
    makeServices({
      getProjectState: connectedState,
      executeMutation: async (action, preview) => {
        executions.push({ action, preview });
        return { ok: true, applied: true, changed: true, failures: [] };
      },
    }),
    { columns: 46, rows: 16 },
  );
  await settle(approvingApp);
  await press(approvingApp, "g");
  await typeText(approvingApp, "2.0.0");
  await press(approvingApp, "enter");
  await waitFor(
    () => /Confirm planned change/.test(approvingApp.lastFrame() ?? ""),
    "second short confirmation",
  );
  await press(approvingApp, "enter");
  await waitFor(() => executions.length === 1, "explicitly approved mutation");
  assert.equal(executions[0].action.kind, "upgrade");
  approvingApp.unmount();
});

test("31 optional components stay one-row navigable with selection details and an honest total", async () => {
  const optionalNames = [
    "Grid",
    "Section",
    "Fieldset",
    "Alert",
    "Progress",
    "Skeleton",
    "Toast",
    "Accordion",
    "Avatar",
    "Breadcrumbs",
    "Pagination",
    "Table",
    "Metric",
    "DescriptionList",
    "Timeline",
    "Meter",
    "EmptyState",
    "Popover",
    "AlertDialog",
    "ToggleGroup",
    "Toolbar",
    "TagGroup",
    "ListBox",
    "TreeView",
    "TimeField",
    "SearchField",
    "CheckboxGroup",
    "RangeSlider",
    "DateRangePicker",
    "Spinner",
    "FileDropzone",
  ];
  const components = optionalNames.map((name, index) => ({
    name,
    required: false,
    optional: true,
    variants: index % 2 === 0 ? ["solid", "ghost"] : [],
    description: `Optional ${name} component.`,
  }));
  const app = start(
    makeServices({
      getProjectState: connectedState,
      listComponents: () => ({
        ok: true,
        components,
        available: optionalNames.filter((_, index) => index % 3 !== 0),
        unavailable: optionalNames.filter((_, index) => index % 3 === 0),
        capabilities: { categories: {} },
        extensions: [],
      }),
    }),
    { columns: 80, rows: 24 },
  );
  await settle(app);
  await press(app, "2");
  await press(app, "o");
  await settle(app);
  assert.match(app.lastFrame() ?? "", /31 optional components/);
  assert.match(app.lastFrame() ?? "", /j\/k select · ↑\/↓ scroll/);
  assert.match(app.lastFrame() ?? "", /GRID[\s\S]*?Optional Grid component\./);
  await press(app, "j");
  const nextFrame = app.lastFrame() ?? "";
  assert.match(nextFrame, /SECTION[\s\S]*?Optional Section component\./);
  assert.match(nextFrame, /31 optional components/);
  app.unmount();
});
