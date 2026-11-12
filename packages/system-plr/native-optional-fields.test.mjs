/**
 * Native-field regressions for TimeField, SearchField, RangeSlider, and DateRangePicker.
 *
 * Most tests transpile the real component sources and render them with React's server
 * renderer, so they need no shared package build, browser, or DOM dependency.
 *
 * The final RangeSlider/DateRangePicker reset tests execute the real component effects in a
 * synthetic in-memory React hook/form harness (mocked hooks, recording form/input stand-ins,
 * no document). Synthetic timers stand in for the browser's later task, proving that reset
 * reconciliation is deferred, observes `defaultPrevented` after all listeners, restores
 * uncontrolled defaults/controlled values, and rebinds on an explicit form change. These are
 * source/handler/timer-order evidence, not real browser/DOM evidence; the Chromium ordering
 * of native reset, microtasks, delegated React onReset, and the native default action still
 * requires a real-browser check.
 *
 * Run with: node --test native-optional-fields.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "src", "components");
const mockCore = {
  cn: (...values) => values.filter(Boolean).join(" "),
  useIsomorphicLayoutEffect: React.useEffect,
  useComposedRefs:
    (...refs) =>
    (value) => {
      for (const ref of refs) {
        if (typeof ref === "function") ref(value);
        else if (ref) ref.current = value;
      }
    },
};

function loadComponent(folder, file, name) {
  const sourcePath = join(root, folder, file);
  const { outputText } = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    fileName: sourcePath,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const filename = join(here, `${folder}.transpiled.cjs`);
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(here);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === "@prism-system/ui-core") return mockCore;
    if (id.endsWith(".css")) return {};
    return originalRequire(id);
  };
  loaded._compile(outputText, filename);
  return loaded.exports[name];
}

const TimeField = loadComponent("time-field", "TimeField.tsx", "TimeField");
const SearchField = loadComponent("search-field", "SearchField.tsx", "SearchField");
const RangeSlider = loadComponent("range-slider", "RangeSlider.tsx", "RangeSlider");
const DateRangePicker = loadComponent(
  "date-range-picker",
  "DateRangePicker.tsx",
  "DateRangePicker",
);
const h = React.createElement;

/**
 * Synthetic client-runtime harness for the DateRangePicker/RangeSlider reset effects.
 *
 * React hooks are replaced with a deterministic slot runtime, the owning form is a recording
 * event target, and native inputs are plain objects. The real component functions and effects
 * execute, so the deferred reset task, its cancellation check, state writes, callbacks, and
 * listener rebinding are observable without a document.
 */
function createResetHarness(folder, file, exportName) {
  const slots = [];
  const refs = [];
  const setCalls = [];
  let cursor = 0;
  let pendingEffects = [];

  function sameDependencies(previous, next) {
    return Boolean(
      previous &&
      next &&
      previous.length === next.length &&
      next.every((dependency, index) => Object.is(dependency, previous[index])),
    );
  }

  const HarnessReact = {
    forwardRef(render) {
      return render;
    },
    useId() {
      cursor += 1;
      return "harness";
    },
    useRef(initial) {
      const index = cursor++;
      if (slots[index] === undefined) slots[index] = { current: initial };
      refs.push(slots[index]);
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (slots[index] === undefined) {
        slots[index] = { value: typeof initial === "function" ? initial() : initial };
      }
      const slot = slots[index];
      return [
        slot.value,
        (next) => {
          const resolved = typeof next === "function" ? next(slot.value) : next;
          slot.value = resolved;
          setCalls.push(resolved);
        },
      ];
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        slots[index] = { dependencies, value: callback };
      }
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        pendingEffects.push({ dependencies, effect, index, previous });
      }
    },
  };

  const sourcePath = join(here, "src", "components", folder, file);
  const { outputText } = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    fileName: sourcePath,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const filename = join(here, `${folder}-reset-harness.transpiled.cjs`);
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(here);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === "react") return HarnessReact;
    if (id === "@prism-system/ui-core") {
      return {
        cn: (...values) => values.filter(Boolean).join(" "),
        useIsomorphicLayoutEffect: HarnessReact.useEffect,
      };
    }
    if (id.endsWith(".css")) return {};
    return originalRequire(id);
  };
  loaded._compile(outputText, filename);
  const Component = loaded.exports[exportName];

  return {
    refs,
    setCalls,
    render(props) {
      cursor = 0;
      pendingEffects = [];
      refs.length = 0;
      return Component(props, null);
    },
    runEffects() {
      for (const { dependencies, effect, index, previous } of pendingEffects) {
        previous?.cleanup?.();
        slots[index] = { cleanup: effect(), dependencies };
      }
      pendingEffects = [];
    },
    runCleanups() {
      for (const slot of slots) {
        if (typeof slot?.cleanup === "function") {
          slot.cleanup();
          slot.cleanup = undefined;
        }
      }
    },
  };
}

function createFakeForm() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener(type, handler) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== handler),
      );
    },
    handlersFor(type) {
      return listeners.get(type) ?? [];
    },
  };
}

function createDateInput(form) {
  return {
    customValidity: "",
    form,
    setCustomValidity(message) {
      this.customValidity = message;
    },
  };
}

function mountDateRangePicker(props, form = createFakeForm()) {
  const harness = createResetHarness("date-range-picker", "DateRangePicker.tsx", "DateRangePicker");
  const tree = harness.render(props);
  const start = createDateInput(form);
  const end = createDateInput(form);
  harness.refs[0].current = start;
  harness.refs[1].current = end;
  harness.runEffects();
  return { end, form, harness, start, tree };
}

function rerenderDateRangePicker(harness, props) {
  const tree = harness.render(props);
  harness.runEffects();
  return tree;
}

function mountRangeSlider(props, form = createFakeForm()) {
  const harness = createResetHarness("range-slider", "RangeSlider.tsx", "RangeSlider");
  const tree = harness.render(props);
  const start = { form };
  harness.refs[0].current = start;
  harness.runEffects();
  return { form, harness, start, tree };
}

function rerenderRangeSlider(harness, props) {
  const tree = harness.render(props);
  harness.runEffects();
  return tree;
}

function collectNativeInputs(node, type, found = []) {
  if (!node || typeof node !== "object") return found;
  if (node.props?.type === type) found.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    collectNativeInputs(child, type, found);
  }
  return found;
}

function changeDate(tree, index, value) {
  collectNativeInputs(tree, "date")[index].props.onChange({ currentTarget: { value } });
}

function changeRange(tree, index, valueAsNumber) {
  collectNativeInputs(tree, "range")[index].props.onChange({ currentTarget: { valueAsNumber } });
}

/**
 * Record the component's later-task scheduling instead of running a real timer, then let the
 * test settle listeners and mutate `event.defaultPrevented` before running captured tasks.
 */
function dispatchResetsWithRecordedTimers(form, events) {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (callback) => {
    timers.push(callback);
    return timers.length;
  };
  globalThis.clearTimeout = (timer) => {
    if (typeof timer === "number" && timer > 0) timers[timer - 1] = null;
  };
  try {
    for (const event of events) {
      for (const listener of [...form.handlersFor("reset")]) listener(event);
    }
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
  return {
    cancel(timer) {
      if (typeof timer === "number" && timer > 0) timers[timer - 1] = null;
    },
    get pending() {
      return timers.filter(Boolean).length;
    },
    run() {
      for (let index = 0; index < timers.length; index += 1) {
        const task = timers[index];
        if (!task) continue;
        timers[index] = null;
        task();
      }
    },
  };
}

function dispatchResetWithRecordedTimers(form, event) {
  return dispatchResetsWithRecordedTimers(form, [event]);
}

function unmountWithRecordedTimers(harness, timers) {
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.clearTimeout = (timer) => timers.cancel(timer);
  try {
    harness.runCleanups();
  } finally {
    globalThis.clearTimeout = originalClearTimeout;
  }
}

test("TimeField retains native time, label, constraints, and error semantics", () => {
  const markup = renderToStaticMarkup(
    h(TimeField, {
      label: "Start time",
      name: "startTime",
      min: "08:00",
      max: "18:00",
      step: 900,
      required: true,
      disabled: true,
      error: "Choose a time in the workday.",
    }),
  );
  assert.match(markup, /<label[^>]*for="([^"]+)"[^>]*>Start time<\/label>/);
  const [, id] = markup.match(/<label[^>]*for="([^"]+)"/);
  assert.match(markup, new RegExp(`<input[^>]*id="${id}"[^>]*type="time"`));
  assert.match(markup, /name="startTime"/);
  assert.match(markup, /min="08:00"/);
  assert.match(markup, /max="18:00"/);
  assert.match(markup, /step="900"/);
  assert.match(markup, /required=""/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /role="alert"/);
});

test("SearchField has one labeled native search input and an accessible clear action", () => {
  const markup = renderToStaticMarkup(
    h(SearchField, {
      label: "Find a plan",
      name: "query",
      defaultValue: "weekly",
      clearLabel: "Clear query",
    }),
  );
  assert.match(markup, /<label[^>]*for="([^"]+)"[^>]*>Find a plan<\/label>/);
  const [, id] = markup.match(/<label[^>]*for="([^"]+)"/);
  assert.match(markup, new RegExp(`<input[^>]*id="${id}"[^>]*type="search"`));
  assert.match(markup, /name="query"/);
  assert.match(markup, /value="weekly"/);
  assert.match(markup, /aria-label="Clear query"/);
  assert.equal((markup.match(/<input[^>]*type="search"/g) ?? []).length, 1);
});

test("RangeSlider renders two labeled native thumbs, names, bounds, and ordered defaults", () => {
  const markup = renderToStaticMarkup(
    h(RangeSlider, {
      label: "Focus window",
      startLabel: "From",
      endLabel: "Until",
      startName: "from",
      endName: "until",
      min: 0,
      max: 20,
      step: 2,
      defaultValue: [16, 4],
    }),
  );
  assert.equal((markup.match(/type="range"/g) ?? []).length, 2);
  assert.match(markup, /aria-label="From"/);
  assert.match(markup, /aria-label="Until"/);
  assert.match(markup, /name="from"/);
  assert.match(markup, /name="until"/);
  assert.match(markup, /value="4"/);
  assert.match(markup, /value="16"/);
  assert.equal((markup.match(/min="0" max="20" step="2"/g) ?? []).length, 2);
  assert.match(markup, /aria-valuemin="0" aria-valuemax="16"/);
  assert.match(markup, /aria-valuemin="4" aria-valuemax="20"/);
});

test("DateRangePicker keeps two independently named native date fields and reports reversed values", () => {
  const markup = renderToStaticMarkup(
    h(DateRangePicker, {
      label: "Planning period",
      startLabel: "From",
      endLabel: "Through",
      startName: "fromDate",
      endName: "throughDate",
      min: "2026-01-01",
      max: "2026-12-31",
      defaultValue: ["2026-08-12", "2026-08-01"],
      rangeErrorMessage: "Start must not follow end.",
    }),
  );
  assert.equal((markup.match(/type="date"/g) ?? []).length, 2);
  assert.match(markup, /name="fromDate"/);
  assert.match(markup, /name="throughDate"/);
  assert.match(markup, /<label[^>]*>From<\/label>/);
  assert.match(markup, /<label[^>]*>Through<\/label>/);
  assert.match(markup, /min="2026-01-01"/);
  assert.match(markup, /max="2026-12-31"/);
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /Start must not follow end\./);
});

test("DateRangePicker accepts early four-digit years but rejects year zero", () => {
  const earlyYear = renderToStaticMarkup(
    h(DateRangePicker, {
      label: "Early dates",
      value: ["0099-02-28", "0099-03-01"],
    }),
  );
  assert.match(earlyYear, /value="0099-02-28"/);
  assert.doesNotMatch(earlyYear, /aria-invalid="true"/);

  const yearZero = renderToStaticMarkup(
    h(DateRangePicker, {
      label: "Invalid year",
      value: ["0000-02-28", "0000-03-01"],
    }),
  );
  assert.match(yearZero, /aria-invalid="true"/);
  assert.match(yearZero, /Enter a valid calendar date\./);
});

test("controlled date edits do not validate an uncommitted proposal", () => {
  const source = readFileSync(join(root, "date-range-picker", "DateRangePicker.tsx"), "utf8");
  const changeHandler = source.match(/const change = \(index: 0 \| 1,[\s\S]*?\n {4}};/)?.[0];
  assert.ok(changeHandler, "expected the date change handler");
  const beforeUncontrolledBranch = changeHandler.split("if (!isControlled)")[0];

  assert.doesNotMatch(beforeUncontrolledBranch, /current\.current\.value\s*=/);
  assert.doesNotMatch(beforeUncontrolledBranch, /syncValidity\(\)/);
  assert.match(
    changeHandler,
    /if \(!isControlled\)\s*\{[\s\S]*?current\.current\.value = next;[\s\S]*?syncValidity\(\);/,
  );
});

test("RangeSlider uses the same native domain for both thumb tracks", () => {
  const markup = renderToStaticMarkup(
    h(RangeSlider, {
      label: "Shared scale",
      min: -10,
      max: 30,
      defaultValue: [0, 20],
    }),
  );
  assert.equal((markup.match(/min="-10" max="30"/g) ?? []).length, 2);
  assert.match(markup, /aria-valuemin="-10" aria-valuemax="20"/);
  assert.match(markup, /aria-valuemin="0" aria-valuemax="30"/);
});

test("DateRangePicker ignores a reset cancelled after its native listener (synthetic later task)", () => {
  const valueChanges = [];
  const props = {
    label: "Planning period",
    defaultValue: ["2026-08-01", "2026-08-10"],
    onValueChange: (next) => valueChanges.push(next),
  };
  const { form, harness, tree } = mountDateRangePicker(props);

  assert.equal(form.handlersFor("reset").length, 1, "the owning form has one reset listener");
  changeDate(tree, 0, "2026-08-20");
  rerenderDateRangePicker(harness, props);
  assert.deepEqual(valueChanges, [["2026-08-20", "2026-08-10"]], "the edit is reported");
  const setCallsAfterEdit = harness.setCalls.length;

  const event = { defaultPrevented: false };
  const timers = dispatchResetWithRecordedTimers(form, event);
  assert.equal(timers.pending, 1, "reset reconciliation is deferred to a later task");
  // A delegated React onReset runs after this native listener but before the captured task.
  event.defaultPrevented = true;
  timers.run();

  assert.equal(
    harness.setCalls.length,
    setCallsAfterEdit,
    "a reset cancelled later writes no uncontrolled state",
  );
  assert.deepEqual(
    valueChanges,
    [["2026-08-20", "2026-08-10"]],
    "a reset cancelled later does not call onValueChange",
  );
});

test("DateRangePicker restores only uncontrolled defaults after an accepted reset task", () => {
  const valueChanges = [];
  const props = {
    label: "Planning period",
    defaultValue: ["2026-08-01", "2026-08-10"],
    rangeErrorMessage: "Start must not follow end.",
    onValueChange: (next) => valueChanges.push(next),
  };
  const { end, form, harness, start, tree } = mountDateRangePicker(props);

  changeDate(tree, 0, "2026-08-20");
  rerenderDateRangePicker(harness, props);
  assert.equal(start.customValidity, "Start must not follow end.");
  assert.equal(end.customValidity, "Start must not follow end.");

  dispatchResetWithRecordedTimers(form, { defaultPrevented: false }).run();

  assert.deepEqual(
    harness.setCalls.at(-1),
    ["2026-08-01", "2026-08-10"],
    "an accepted reset restores the uncontrolled default pair",
  );
  assert.deepEqual(
    valueChanges.at(-1),
    ["2026-08-01", "2026-08-10"],
    "an accepted reset reports the restored pair",
  );
  assert.equal(start.customValidity, "", "validity is synchronized after the restore");
  assert.equal(end.customValidity, "", "validity is synchronized after the restore");

  const controlledChanges = [];
  const controlled = mountDateRangePicker({
    label: "Fixed period",
    value: ["2026-08-05", "2026-08-15"],
    defaultValue: ["2026-08-01", "2026-08-10"],
    onValueChange: (next) => controlledChanges.push(next),
  });
  const controlledSetCalls = controlled.harness.setCalls.length;
  dispatchResetWithRecordedTimers(controlled.form, { defaultPrevented: false }).run();
  assert.equal(
    controlled.harness.setCalls.length,
    controlledSetCalls,
    "an accepted reset never writes a controlled pair",
  );
  assert.deepEqual(controlledChanges, [], "a reset is not an edit of the controlled pair");
});

test("RangeSlider ignores a reset cancelled after its native listener (synthetic later task)", () => {
  const valueChanges = [];
  const props = {
    label: "Focus window",
    defaultValue: [4, 16],
    onValueChange: (next) => valueChanges.push(next),
  };
  const { form, harness, tree } = mountRangeSlider(props);

  assert.equal(form.handlersFor("reset").length, 1, "the owning form has one reset listener");
  changeRange(tree, 0, 8);
  rerenderRangeSlider(harness, props);
  assert.deepEqual(valueChanges, [[8, 16]], "the edit is reported");
  const setCallsAfterEdit = harness.setCalls.length;

  const event = { defaultPrevented: false };
  const timers = dispatchResetWithRecordedTimers(form, event);
  assert.equal(timers.pending, 1, "reset reconciliation is deferred to a later task");
  event.defaultPrevented = true;
  timers.run();

  assert.equal(
    harness.setCalls.length,
    setCallsAfterEdit,
    "a reset cancelled later writes no uncontrolled state",
  );
  assert.deepEqual(valueChanges, [[8, 16]], "a reset cancelled later does not call onValueChange");
});

test("RangeSlider restores only uncontrolled defaults after an accepted reset task", () => {
  const valueChanges = [];
  const props = {
    label: "Focus window",
    defaultValue: [4, 16],
    onValueChange: (next) => valueChanges.push(next),
  };
  const { form, harness, tree } = mountRangeSlider(props);

  changeRange(tree, 0, 8);
  rerenderRangeSlider(harness, props);
  dispatchResetWithRecordedTimers(form, { defaultPrevented: false }).run();

  assert.deepEqual(
    harness.setCalls.at(-1),
    [4, 16],
    "an accepted reset restores the uncontrolled default pair",
  );
  assert.deepEqual(valueChanges.at(-1), [4, 16], "an accepted reset reports the restored pair");

  const controlledChanges = [];
  const controlled = mountRangeSlider({
    label: "Fixed focus window",
    value: [8, 12],
    defaultValue: [4, 16],
    onValueChange: (next) => controlledChanges.push(next),
  });
  const controlledSetCalls = controlled.harness.setCalls.length;
  dispatchResetWithRecordedTimers(controlled.form, { defaultPrevented: false }).run();
  assert.equal(
    controlled.harness.setCalls.length,
    controlledSetCalls,
    "an accepted reset never writes a controlled pair",
  );
  assert.deepEqual(controlledChanges, [], "a reset is not an edit of the controlled pair");
});

test("DateRangePicker rebinds a changed form association and cancels pending tasks on unmount", () => {
  const valueChanges = [];
  const firstForm = createFakeForm();
  const props = {
    label: "Planning period",
    form: "first-plan",
    defaultValue: ["2026-08-01", "2026-08-10"],
    onValueChange: (next) => valueChanges.push(next),
  };
  const { end, harness, start } = mountDateRangePicker(props, firstForm);
  assert.equal(firstForm.handlersFor("reset").length, 1);

  const secondForm = createFakeForm();
  start.form = secondForm;
  end.form = secondForm;
  rerenderDateRangePicker(harness, { ...props, form: "second-plan" });

  assert.equal(firstForm.handlersFor("reset").length, 0, "the old form association is released");
  assert.equal(secondForm.handlersFor("reset").length, 1, "the new form association is observed");

  const timers = dispatchResetWithRecordedTimers(secondForm, { defaultPrevented: false });
  assert.equal(timers.pending, 1);
  unmountWithRecordedTimers(harness, timers);
  timers.run();

  assert.deepEqual(valueChanges, [], "unmount cancels the pending reset task");
});

test("RangeSlider rebinds a changed form association and cancels pending tasks on unmount", () => {
  const valueChanges = [];
  const firstForm = createFakeForm();
  const props = {
    label: "Focus window",
    form: "first-plan",
    defaultValue: [4, 16],
    onValueChange: (next) => valueChanges.push(next),
  };
  const { harness, start } = mountRangeSlider(props, firstForm);
  assert.equal(firstForm.handlersFor("reset").length, 1);

  const secondForm = createFakeForm();
  start.form = secondForm;
  rerenderRangeSlider(harness, { ...props, form: "second-plan" });

  assert.equal(firstForm.handlersFor("reset").length, 0, "the old form association is released");
  assert.equal(secondForm.handlersFor("reset").length, 1, "the new form association is observed");

  const timers = dispatchResetWithRecordedTimers(secondForm, { defaultPrevented: false });
  assert.equal(timers.pending, 1);
  unmountWithRecordedTimers(harness, timers);
  timers.run();

  assert.deepEqual(valueChanges, [], "unmount cancels the pending reset task");
});

test("a synchronously cancelled reset does not discard an earlier accepted reset task", () => {
  const dateChanges = [];
  const dateProps = {
    label: "Planning period",
    defaultValue: ["2026-08-01", "2026-08-10"],
    onValueChange: (next) => dateChanges.push(next),
  };
  const date = mountDateRangePicker(dateProps);
  changeDate(date.tree, 0, "2026-08-20");
  rerenderDateRangePicker(date.harness, dateProps);

  const acceptedDateReset = { defaultPrevented: false };
  const cancelledDateReset = { defaultPrevented: false };
  const dateTimers = dispatchResetsWithRecordedTimers(date.form, [
    acceptedDateReset,
    cancelledDateReset,
  ]);
  cancelledDateReset.defaultPrevented = true;
  assert.equal(dateTimers.pending, 2, "DateRangePicker keeps one task per reset event");
  dateTimers.run();

  assert.deepEqual(
    date.harness.setCalls.at(-1),
    ["2026-08-01", "2026-08-10"],
    "the accepted DateRangePicker reset still restores its defaults",
  );
  assert.deepEqual(
    dateChanges,
    [
      ["2026-08-20", "2026-08-10"],
      ["2026-08-01", "2026-08-10"],
    ],
    "the cancelled DateRangePicker reset adds no second restore",
  );

  const rangeChanges = [];
  const rangeProps = {
    label: "Focus window",
    defaultValue: [4, 16],
    onValueChange: (next) => rangeChanges.push(next),
  };
  const range = mountRangeSlider(rangeProps);
  changeRange(range.tree, 0, 8);
  rerenderRangeSlider(range.harness, rangeProps);

  const acceptedRangeReset = { defaultPrevented: false };
  const cancelledRangeReset = { defaultPrevented: false };
  const rangeTimers = dispatchResetsWithRecordedTimers(range.form, [
    acceptedRangeReset,
    cancelledRangeReset,
  ]);
  cancelledRangeReset.defaultPrevented = true;
  assert.equal(rangeTimers.pending, 2, "RangeSlider keeps one task per reset event");
  rangeTimers.run();

  assert.deepEqual(
    range.harness.setCalls.at(-1),
    [4, 16],
    "the accepted RangeSlider reset still restores its defaults",
  );
  assert.deepEqual(
    rangeChanges,
    [
      [8, 16],
      [4, 16],
    ],
    "the cancelled RangeSlider reset adds no second restore",
  );
});
