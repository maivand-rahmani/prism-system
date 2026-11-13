import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { FrameworkProvider, MouseLayout, ScreenRegistry } from "runeframe";
import TuiApp from "../src/tui-app.mjs";

const h = React.createElement;
const registry = new ScreenRegistry();
registry.register({ id: "tui-test", title: "TUI test host", component: () => null });
const skill = {
  id: "use-design-system",
  skill: "use-design-system",
  type: "prism",
  source: "prism",
  publisher: "Prism",
  role: "consumer",
  reviewStatus: "firstparty",
  description: "A practical skill description.",
};
const pause = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const packet = (type, x, y) => ({
  type,
  x,
  y,
  button: type === "move" ? "none" : "left",
  shift: false,
  alt: false,
  ctrl: false,
});

function state() {
  return {
    ok: true,
    status: "connected",
    cwd: "/consumer/demo-app",
    packageName: "@prism-system/ui-a",
    version: "1.2.3",
    contractVersion: 4,
    config: { package: "@prism-system/ui-a", version: "1.2.3", strict: true },
    failures: [],
  };
}

function makeHarness({ inventory, columns = 80, rows = 24 } = {}) {
  const calls = { preview: [], previewResponses: [], execute: [], inventory: 0 };
  const listeners = new Set();
  const mouseSource = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(event) {
      for (const listener of [...listeners]) listener(event);
    },
  };
  const services = {
    cwd: "/consumer/demo-app",
    getProjectState: state,
    skillAgentIds: ["claude-code", "codex"],
    listSkills: async () => {
      calls.inventory += 1;
      return inventory ?? { ok: true, catalog: [skill], installed: [], failures: [] };
    },
    previewSkillMutation: async (action) => {
      calls.preview.push(action);
      const response = {
        ok: true,
        dryRun: true,
        kind: "skill",
        material: action,
        result: {
          ok: true,
          expectedPlan: { revision: "reviewed-revision", targets: [] },
          targets: [],
          warnings: [],
        },
      };
      calls.previewResponses.push(response);
      return response;
    },
    executeSkillMutation: async (action, preview) => {
      calls.execute.push({ action, preview });
      return { ok: true, applied: true, changed: true, failures: [] };
    },
  };
  const diagnostics = [];
  const app = render(
    h(
      MouseLayout,
      { origin: { x: 0, y: 0 }, flexDirection: "column" },
      h(
        FrameworkProvider,
        {
          registry,
          defaultScreen: "tui-test",
          mouseEventSource: mouseSource,
          mouseDiagnostics: (event) => diagnostics.push(event),
        },
        h(TuiApp, { services }),
      ),
    ),
  );
  Object.defineProperty(app.stdout, "columns", { configurable: true, value: columns });
  Object.defineProperty(app.stdout, "rows", { configurable: true, value: rows });
  app.stdout.emit("resize");
  return { app, calls, diagnostics, mouseSource };
}

async function openSkills(harness) {
  harness.app.stdin.write("m");
  await pause();
  harness.app.stdin.write("k");
  await pause();
}

async function click(harness, x, y) {
  harness.mouseSource.publish(packet("press", x, y));
  harness.mouseSource.publish(packet("release", x, y));
  await pause();
}

async function probeTargetAt(harness, x, y) {
  harness.mouseSource.publish(packet("move", x, y));
  await pause();
  const diagnostic = harness.diagnostics.at(-1);
  return diagnostic?.targetId ?? null;
}

async function targetAt(harness, x, y) {
  const targetId = await probeTargetAt(harness, x, y);
  assert.ok(targetId, `pointer at (${x}, ${y}) hits an active control`);
  assert.ok(
    harness.diagnostics.at(-1)?.areas?.some((area) => area.id === targetId),
    `target ${targetId} is present among measured areas`,
  );
  return targetId;
}

async function clickVisibleLabel(harness, label) {
  const lines = (harness.app.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  assert.notEqual(row, -1, `visible action ${label}:\n${lines.join("\n")}`);
  const column = lines[row].indexOf(label) + Math.floor(label.length / 2);
  const x = Math.max(0, column);
  const targetId = await targetAt(harness, x, row);
  await click(harness, x, row);
  assert.equal(harness.diagnostics.at(-1)?.targetId, targetId);
}

test("keyboard selects without opening; focused agent/scope/install drive preview, cancel, and exact confirm", async () => {
  const app = makeHarness();
  await openSkills(app);
  assert.match(app.app.lastFrame(), /Prism skills/);
  app.app.stdin.write("\u001b[B");
  await pause();
  assert.doesNotMatch(app.app.lastFrame(), /Agent:|Install/);
  app.app.stdin.write("\r");
  await pause();
  assert.match(app.app.lastFrame(), /> \[a\] Agent: Choose/);
  app.app.stdin.write("\r");
  await pause();
  assert.match(app.app.lastFrame(), /Agent: claude-code/);
  app.app.stdin.write("\t");
  await pause();
  assert.match(app.app.lastFrame(), /> \[g\] Scope: project/);
  app.app.stdin.write("\r");
  await pause();
  assert.match(app.app.lastFrame(), /Scope: global/);
  app.app.stdin.write("\t");
  await pause();
  assert.match(app.app.lastFrame(), /> \[i\] Install \(preview\)/);
  app.app.stdin.write("\r");
  await pause();
  assert.equal(app.calls.preview.length, 1);
  assert.equal(app.calls.preview[0].action, "add");
  assert.equal(app.calls.preview[0].scope, "global");
  assert.deepEqual(app.calls.preview[0].agents, ["claude-code"]);
  assert.equal(app.calls.execute.length, 0, "install request only starts the preview flow");
  assert.match(app.app.lastFrame(), /Confirm skill add/);
  app.app.stdin.write("\u001b");
  await pause();
  assert.equal(app.calls.execute.length, 0, "cancel after preview performs no write");

  app.app.stdin.write("\r");
  await pause();
  app.app.stdin.write("\t");
  await pause();
  app.app.stdin.write("\t");
  await pause();
  assert.match(app.app.lastFrame(), /> \[i\] Install \(preview\)/);
  app.app.stdin.write("\r");
  await pause();
  assert.equal(app.calls.preview.length, 2);
  assert.equal(app.calls.execute.length, 0);
  const acceptedPreview = app.calls.previewResponses[1];
  app.app.stdin.write("y");
  await pause(80);
  assert.equal(app.calls.execute.length, 1);
  assert.strictEqual(app.calls.execute[0].preview, acceptedPreview);
  app.app.unmount();
});

test("cancel after skill preview never executes the accepted plan", async () => {
  const harness = makeHarness();
  await openSkills(harness);
  harness.app.stdin.write("\r");
  await pause();
  harness.app.stdin.write("a");
  await pause();
  await clickVisibleLabel(harness, "Install");
  assert.equal(harness.calls.preview.length, 1);
  assert.equal(harness.calls.execute.length, 0);
  harness.app.stdin.write("\u001b");
  await pause();
  assert.equal(harness.calls.execute.length, 0);
  harness.app.unmount();
});

test("multi-skill arrows only select, and later entries remain reachable on a short terminal", async () => {
  const catalog = Array.from({ length: 8 }, (_, index) => ({
    ...skill,
    id: `skill-${index + 1}`,
    skill: `skill-${index + 1}`,
  }));
  const harness = makeHarness({
    columns: 46,
    rows: 14,
    inventory: { ok: true, catalog, installed: [], failures: [] },
  });
  await openSkills(harness);
  for (let index = 0; index < 12 && !/skill-1/.test(harness.app.lastFrame() ?? ""); index += 1) {
    harness.app.stdin.write("\u001b[B");
    await pause(15);
  }
  assert.match(harness.app.lastFrame(), /skill-1/);
  for (let index = 0; index < catalog.length - 1; index += 1) {
    harness.app.stdin.write("\u001b[B");
    await pause(15);
  }
  for (let index = 0; index < 8 && !/skill-8/.test(harness.app.lastFrame() ?? ""); index += 1) {
    harness.app.stdin.write("\u001b[B");
    await pause(15);
  }
  assert.doesNotMatch(harness.app.lastFrame(), /Agent:|Install/);
  assert.match(harness.app.lastFrame(), /skill-8/);
  harness.app.stdin.write("\r");
  await pause();
  assert.match(harness.app.lastFrame(), /skill-8/);
  assert.match(harness.app.lastFrame(), /> \[a\] choose/);
  harness.app.unmount();
});

test("a real mouse click on the visible skill row opens that exact skill detail", async () => {
  const harness = makeHarness();
  await openSkills(harness);
  const lines = (harness.app.lastFrame() ?? "").split("\n");
  const rowIndex = lines.findIndex(
    (line) => line.includes("NOT INSTALLED") && line.includes(skill.skill),
  );
  assert.notEqual(rowIndex, -1, `visible skill row exists:\n${lines.join("\n")}`);
  const column = lines[rowIndex].indexOf(skill.skill) + 2;
  const targetId = await targetAt(harness, column, rowIndex);
  await click(harness, column, rowIndex);
  assert.equal(harness.diagnostics.at(-1)?.targetId, targetId);
  assert.match(harness.app.lastFrame(), /Agent: not selected/);
  assert.match(harness.app.lastFrame(), /use-design-system/);
  assert.deepEqual(harness.calls.preview, []);
  harness.app.unmount();
});

test("Enter on focused Agent, Scope, and Close performs only that control's action", async () => {
  const harness = makeHarness();
  await openSkills(harness);
  harness.app.stdin.write("\r");
  await pause();
  assert.match(harness.app.lastFrame(), /> \[a\] Agent: Choose/);
  harness.app.stdin.write("\r");
  await pause();
  assert.match(harness.app.lastFrame(), /Agent: claude-code/);
  assert.equal(harness.calls.preview.length, 0);
  harness.app.stdin.write("\t");
  await pause();
  assert.match(harness.app.lastFrame(), /> \[g\] Scope: project/);
  harness.app.stdin.write("\r");
  await pause();
  assert.match(harness.app.lastFrame(), /Scope: global/);
  assert.equal(harness.calls.preview.length, 0);
  // Install and close follow Scope; reaching Close must be visible before Enter.
  harness.app.stdin.write("\t");
  await pause();
  harness.app.stdin.write("\t");
  await pause();
  assert.match(harness.app.lastFrame(), /> \[Esc\] Close/);
  harness.app.stdin.write("\r");
  await pause();
  assert.doesNotMatch(harness.app.lastFrame(), /Agent: claude-code/);
  assert.equal(harness.calls.preview.length, 0);
  harness.app.unmount();
});

test("clicking outside the inline skill dialog cannot activate an underlying footer action", async () => {
  const harness = makeHarness();
  await openSkills(harness);
  const lines = (harness.app.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(skill.skill));
  const column = lines[row].indexOf(skill.skill) + 2;
  const backgroundTarget = await targetAt(harness, column, row);
  assert.ok(backgroundTarget, "the skill row is an active background hitbox before opening");
  harness.app.stdin.write("\r");
  await pause();
  assert.match(harness.app.lastFrame(), /Agent: not selected/);
  const modalTarget = await probeTargetAt(harness, column, row);
  assert.notEqual(modalTarget, backgroundTarget, "modal layer owns the previous row coordinate");
  await click(harness, column, row);
  assert.match(harness.app.lastFrame(), /Agent: not selected/);
  assert.deepEqual(harness.calls.preview, []);
  harness.app.unmount();
});

test("incomplete inventory stays unknown and blocks mutation; modified managed skill still permits explicit removal", async () => {
  const incomplete = makeHarness({
    inventory: { ok: false, catalog: [skill], installed: [], failures: ["scope unavailable"] },
  });
  await openSkills(incomplete);
  incomplete.app.stdin.write("\r");
  await pause();
  assert.match(incomplete.app.lastFrame(), /unknown|incomplete/i);
  assert.doesNotMatch(incomplete.app.lastFrame(), /\[Enter\] Install/);
  assert.equal(incomplete.calls.preview.length, 0);
  incomplete.app.unmount();

  const modified = makeHarness({
    inventory: {
      ok: true,
      catalog: [skill],
      installed: [{ catalogId: skill.id, scope: "project", managed: true, modified: true }],
      failures: [],
    },
  });
  await openSkills(modified);
  modified.app.stdin.write("\r");
  await pause();
  assert.match(modified.app.lastFrame().replace(/\s+/g, " "), /discard local edits/i);
  assert.doesNotMatch(modified.app.lastFrame(), /\[Enter\] Update/);
  modified.app.stdin.write("a");
  await pause();
  await clickVisibleLabel(modified, "Remove");
  assert.equal(modified.calls.preview[0]?.action, "remove");
  assert.equal(modified.calls.execute.length, 0);
  modified.app.unmount();
});

test("source mismatch blocks update and removal", async () => {
  const harness = makeHarness({
    inventory: {
      ok: true,
      catalog: [skill],
      installed: [{ catalogId: skill.id, scope: "project", managed: true, source: "other-source" }],
      failures: [],
    },
  });
  await openSkills(harness);
  harness.app.stdin.write("\r");
  await pause();
  assert.match(harness.app.lastFrame(), /source changed/i);
  harness.app.stdin.write("a");
  harness.app.stdin.write("x");
  await pause();
  assert.equal(harness.calls.preview.length, 0);
  harness.app.unmount();
});

test("compact detail keeps action and safety content reachable by scrolling", async () => {
  const harness = makeHarness({ columns: 46, rows: 14 });
  await openSkills(harness);
  harness.app.stdin.write("\r");
  await pause();
  const frame = harness.app.lastFrame() ?? "";
  assert.match(frame, /Install/);
  assert.match(frame.replace(/\s+/g, " "), /Review preview; confirm before writes/);
  harness.app.unmount();
});
