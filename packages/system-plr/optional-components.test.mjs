#!/usr/bin/env node
/**
 * Focused render regressions for the four additive PLR components.
 *
 * Most tests transpile the component sources and render them with React's server renderer;
 * they need no shared package build, browser, or DOM harness. They verify the native/ARIA
 * structure and public compound members, not client-side keyboard or form interactions.
 *
 * The CheckboxGroup reset tests at the end additionally drive the component's effect through
 * a synthetic in-memory React hook/form harness (mocked hook runtime, no DOM); scheduled
 * reset tasks are flushed with a real timer. That is source and handler evidence, and the
 * microtask-cancellation test only emulates browser ordering; it is not real browser/DOM
 * evidence, so real reset behavior still needs a browser check.
 * Run with: node --test optional-components.test.mjs
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
const h = React.createElement;

function useControllableState({ prop, defaultProp, onChange }) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultProp);
  const controlled = prop !== undefined;
  const value = controlled ? prop : uncontrolled;
  const setValue = (next) => {
    const resolved = typeof next === "function" ? next(value) : next;
    if (!controlled) setUncontrolled(resolved);
    if (!Object.is(value, resolved)) onChange?.(resolved);
  };
  return [value, setValue];
}

const mockCore = {
  cn: (...values) => values.filter(Boolean).join(" "),
  Keys: {
    Enter: "Enter",
    Space: " ",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Home: "Home",
    End: "End",
  },
  useControllableState,
  useComposedRefs:
    (...refs) =>
    (node) => {
      for (const ref of refs) {
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }
    },
};

const mockFieldset = {
  Fieldset: React.forwardRef(function MockFieldset({ children, ...props }, ref) {
    return h("fieldset", { ...props, ref }, children);
  }),
  FieldsetLegend: React.forwardRef(function MockFieldsetLegend(props, ref) {
    return h("legend", { ...props, ref });
  }),
};

function loadComponent(relativePath) {
  const sourcePath = join(here, "src", "components", relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const filename = join(here, `${relativePath.replace(/[\\/.]/g, "-")}.transpiled.cjs`);
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(here);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = function requireComponent(id) {
    if (id === "@prism-system/ui-core") return mockCore;
    if (id === "../fieldset/Fieldset") return mockFieldset;
    return originalRequire(id);
  };
  loaded._compile(outputText, filename);
  return loaded.exports;
}

/**
 * Synthetic client-runtime harness for the CheckboxGroup reset effect.
 *
 * It replaces React hooks with a deterministic slot runtime and the owning form with a
 * recording event target. The component function is executed for real (including its
 * effects), but nothing is rendered into a document. This makes the reset listener and its
 * deferred decision observable without a browser; it does not replace browser evidence for
 * native reset, checkboxes, or constraint validity.
 */
function createCheckboxGroupHarness() {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const refs = [];
  const setCalls = [];
  const onChangeCalls = [];

  const React = {
    createContext(defaultValue) {
      return {
        Provider: function Provider() {},
        Consumer: function Consumer() {},
        _defaultValue: defaultValue,
      };
    },
    forwardRef(render) {
      return render;
    },
    useContext(context) {
      return context._defaultValue;
    },
    useEffect(effect) {
      cursor += 1;
      effects.push(effect);
    },
    useId() {
      return "harness";
    },
    useMemo(factory, deps) {
      const index = cursor++;
      const slot = slots[index];
      const unchanged =
        slot &&
        slot.deps &&
        deps &&
        slot.deps.length === deps.length &&
        deps.every((dep, position) => Object.is(dep, slot.deps[position]));
      if (!unchanged) slots[index] = { value: factory(), deps };
      return slots[index].value;
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
        slots[index] = typeof initial === "function" ? initial() : initial;
      }
      const value = slots[index];
      return [
        value,
        (next) => {
          slots[index] = typeof next === "function" ? next(slots[index]) : next;
        },
      ];
    },
  };

  function useControllableState({ prop, defaultProp, onChange }) {
    const [uncontrolled, setUncontrolled] = React.useState(defaultProp);
    const controlled = prop !== undefined;
    const current = controlled ? prop : uncontrolled;
    return [
      current,
      (next) => {
        const resolved = typeof next === "function" ? next(current) : next;
        setCalls.push(resolved);
        if (!controlled) setUncontrolled(resolved);
        if (!Object.is(current, resolved)) {
          if (onChange) {
            onChangeCalls.push(resolved);
            onChange(resolved);
          }
        }
      },
    ];
  }

  const sourcePath = join(here, "src", "components", "checkbox-group", "CheckboxGroup.tsx");
  const { outputText } = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    fileName: sourcePath,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const filename = join(here, "checkbox-group-harness.transpiled.cjs");
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(here);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = function requireHarness(id) {
    if (id === "react") return React;
    if (id === "@prism-system/ui-core") {
      return {
        cn: (...values) => values.filter(Boolean).join(" "),
        useComposedRefs:
          (...composedRefs) =>
          (node) => {
            for (const current of composedRefs) {
              if (typeof current === "function") current(node);
              else if (current) current.current = node;
            }
          },
        useControllableState,
      };
    }
    if (id === "../fieldset/Fieldset") {
      return {
        Fieldset: function Fieldset() {
          return null;
        },
        FieldsetLegend: function FieldsetLegend() {
          return null;
        },
      };
    }
    return originalRequire(id);
  };
  loaded._compile(outputText, filename);

  return {
    CheckboxGroup: loaded.exports.CheckboxGroup,
    effects,
    onChangeCalls,
    refs,
    setCalls,
    beginRender() {
      cursor = 0;
      effects.length = 0;
      refs.length = 0;
      return this;
    },
  };
}

function createFakeForm() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const current = listeners.get(type) ?? [];
      listeners.set(type, [...current, handler]);
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

function mountCheckboxGroup(props) {
  const harness = createCheckboxGroupHarness();
  const form = createFakeForm();
  harness.beginRender();
  const tree = harness.CheckboxGroup(props, null);
  // The root fieldset ref is the first ref created by the component.
  harness.refs[0].current = { form, children: [] };
  const cleanups = [];
  for (const effect of harness.effects) {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  return {
    form,
    harness,
    tree,
    unmount() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}

/** Execute the reset task and any later microtask cancellation scheduled by a test. */
function flushScheduledTasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function findCheckboxGroupContext(node) {
  if (!node || typeof node !== "object") return undefined;
  if (node.props && Array.isArray(node.props.value?.selected)) return node.props.value;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findCheckboxGroupContext(child);
    if (found) return found;
  }
  return undefined;
}

const { TagGroup } = loadComponent("tag-group/TagGroup.tsx");
const { ListBox } = loadComponent("list-box/ListBox.tsx");
const { TreeView } = loadComponent("tree-view/TreeView.tsx");
const { CheckboxGroup } = loadComponent("checkbox-group/CheckboxGroup.tsx");

test("TagGroup renders separately labeled, keyboard-reachable removal buttons", () => {
  const markup = renderToStaticMarkup(
    h(TagGroup, {
      label: "Selected tags",
      items: [
        { value: "work", label: "Work" },
        { value: "rest", label: "Отдых" },
      ],
      onRemove() {},
    }),
  );

  assert.match(markup, /role="group"[^>]*aria-labelledby=/);
  assert.match(markup, /<button[^>]*type="button"[^>]*aria-label="Remove Work"/);
  assert.match(markup, /aria-label="Remove Отдых"/);
  assert.match(markup, /role="list"/);
  assert.doesNotMatch(markup, /aria-selected=/, "tags are not a selection control");
  assert.equal(typeof TagGroup, "object", "TagGroup is a forwardRef component");
});

test("ListBox uses a native multiple select, plain option text, and form naming", () => {
  const markup = renderToStaticMarkup(
    h(
      ListBox,
      { label: "Plans", name: "plans", multiple: true, defaultValue: ["week"], size: 4 },
      h(ListBox.Option, { value: "week" }, "This week"),
      h(ListBox.Group, { label: "Archive" }, h(ListBox.Option, { value: "past" }, "Last week")),
    ),
  );

  assert.match(markup, /<label[^>]*for="maivand-plr-list-box-/);
  assert.match(markup, /<select[^>]*name="plans"[^>]*multiple=""[^>]*size="4"/);
  assert.match(markup, /<option[^>]*value="week"[^>]*selected=""[^>]*>This week<\/option>/);
  assert.match(markup, /<optgroup[^>]*label="Archive"/);
  assert.ok(ListBox.Option);
  assert.ok(ListBox.Group);
});

test("TreeView exposes a named hierarchical tree with separate focus and selection", () => {
  const markup = renderToStaticMarkup(
    h(TreeView, {
      label: "Folders",
      defaultExpandedValues: ["projects"],
      defaultValue: "notes",
      nodes: [
        {
          value: "projects",
          label: "Projects",
          children: [{ value: "notes", label: "Notes" }],
        },
      ],
    }),
  );

  assert.match(markup, /role="tree"[^>]*aria-labelledby=/);
  assert.match(markup, /role="treeitem"[^>]*aria-expanded="true"/);
  assert.match(markup, /role="group"/);
  assert.match(markup, /data-value="notes"[^>]*aria-selected="true"/);
  assert.match(markup, /tabindex="0"/);
});

test("CheckboxGroup uses a native fieldset and named checkboxes without making each required", () => {
  const markup = renderToStaticMarkup(
    h(
      CheckboxGroup,
      { legend: "Days", name: "days", required: true, defaultValue: ["mon"] },
      h(CheckboxGroup.Item, { value: "mon", label: "Monday" }),
      h(CheckboxGroup.Item, { value: "tue", label: "Tuesday" }),
    ),
  );

  assert.match(markup, /<fieldset[^>]*>/);
  assert.match(markup, /<legend[^>]*>Days<\/legend>/);
  assert.match(markup, /type="checkbox"[^>]*name="days"[^>]*checked=""[^>]*value="mon"/);
  assert.match(markup, /type="checkbox"[^>]*name="days"[^>]*value="tue"/);
  assert.equal((markup.match(/ required(?:="")?/g) ?? []).length, 0);
  assert.ok(CheckboxGroup.Item);
});

test("CheckboxGroup preserves consumer item ARIA while adding group descriptions", () => {
  const markup = renderToStaticMarkup(
    h(
      CheckboxGroup,
      { legend: "Days", name: "days", invalid: true },
      h(CheckboxGroup.Item, {
        value: "mon",
        label: "Monday",
        description: "Start of the week",
        "aria-describedby": "consumer-help",
        "aria-invalid": false,
      }),
    ),
  );

  assert.match(
    markup,
    /aria-describedby="maivand-plr-checkbox-group-item-[^"]+-description consumer-help"/,
  );
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /id="maivand-plr-checkbox-group-item-[^"]+-description"/);
});

test("CheckboxGroup validity is scoped, ignores disabled checked items, and tracks its own messages", () => {
  const source = readFileSync(
    join(here, "src", "components", "checkbox-group", "CheckboxGroup.tsx"),
    "utf8",
  );

  assert.match(source, /Array\.from\(root\.children\)\.find/);
  assert.match(source, /Array\.from\(list\.children\)/);
  assert.match(source, /!box\.matches\(":disabled"\)\s*&&\s*box\.checked/);
  assert.match(
    source,
    /box\.validity\.customError\s*&&\s*box\.validationMessage\s*===\s*owned\.message/,
  );
  assert.match(source, /!box\.matches\(":disabled"\)\s*&&\s*!box\.validity\.customError/);
});

test("CheckboxGroup retains its owned validity record while the input is disabled", () => {
  const source = readFileSync(
    join(here, "src", "components", "checkbox-group", "CheckboxGroup.tsx"),
    "utf8",
  );
  const disabledGuard = source.indexOf('if (owned && box.matches(":disabled")) continue;');
  const ownedMessageCheck = source.indexOf(
    "box.validity.customError && box.validationMessage === owned.message",
  );
  const ownershipDelete = source.indexOf("ownedValidity.current.delete(box)");

  assert.notEqual(disabledGuard, -1, "disabled owned controls retain their ownership record");
  assert.ok(
    disabledGuard < ownedMessageCheck,
    "the disabled guard runs before browser validity checks",
  );
  assert.ok(
    ownedMessageCheck < ownershipDelete,
    "ownership is deleted only after re-enable checks",
  );
});

test("CheckboxGroup controlled value decides the rendered selection", () => {
  const markup = renderToStaticMarkup(
    h(
      CheckboxGroup,
      { legend: "Days", name: "days", value: ["tue"], defaultValue: ["mon"] },
      h(CheckboxGroup.Item, { value: "mon", label: "Monday" }),
      h(CheckboxGroup.Item, { value: "tue", label: "Tuesday" }),
    ),
  );

  assert.match(markup, /type="checkbox"[^>]*checked=""[^>]*value="tue"/);
  assert.doesNotMatch(markup, /type="checkbox"[^>]*checked=""[^>]*value="mon"/);
});

test("CheckboxGroup reset restores its uncontrolled default without a value-change event", async () => {
  const valueChanges = [];
  const { form, harness, tree } = mountCheckboxGroup({
    legend: "Days",
    defaultValue: ["mon"],
    onValueChange: (next) => valueChanges.push(next),
  });

  assert.equal(
    form.handlersFor("reset").length,
    1,
    "the reset listener is attached to the owning form",
  );

  // Simulate a user edit after mount so the reset has something to restore.
  findCheckboxGroupContext(tree).toggle("tue", true);
  assert.deepEqual(valueChanges, [["mon", "tue"]], "an edit still reports a value change");

  const event = { defaultPrevented: false };
  form.handlersFor("reset")[0](event);
  await flushScheduledTasks();

  assert.deepEqual(
    harness.setCalls,
    [["mon", "tue"], ["mon"]],
    "uncontrolled selection returns to defaultValue",
  );
  assert.deepEqual(
    valueChanges,
    [["mon", "tue"]],
    "a reset is not an edit and reports no value change",
  );
  assert.deepEqual(
    harness.onChangeCalls,
    [],
    "the reset path never reaches the controllable-state onChange callback",
  );
});

test("CheckboxGroup keeps an accepted reset when a later synchronous reset is cancelled", async () => {
  const valueChanges = [];
  const { form, harness, tree } = mountCheckboxGroup({
    legend: "Days",
    defaultValue: ["mon"],
    onValueChange: (next) => valueChanges.push(next),
  });

  findCheckboxGroupContext(tree).toggle("tue", true);
  const reset = form.handlersFor("reset")[0];
  const accepted = { defaultPrevented: false };
  const cancelled = { defaultPrevented: false };

  reset(accepted);
  reset(cancelled);
  cancelled.defaultPrevented = true;
  await flushScheduledTasks();

  assert.deepEqual(
    harness.setCalls,
    [["mon", "tue"], ["mon"]],
    "the first accepted reset restores exactly once even though the second is cancelled",
  );
  assert.deepEqual(valueChanges, [["mon", "tue"]], "neither reset reports a value change");
});

test("CheckboxGroup reset honors cancellation from an earlier or later listener", async () => {
  const { form, harness } = mountCheckboxGroup({ legend: "Days", defaultValue: ["mon"] });
  const reset = form.handlersFor("reset")[0];

  reset({ defaultPrevented: true });
  await flushScheduledTasks();
  assert.deepEqual(harness.setCalls, [], "an already-cancelled reset leaves selection untouched");

  const event = { defaultPrevented: false };
  reset(event);
  event.defaultPrevented = true;
  await flushScheduledTasks();
  assert.deepEqual(
    harness.setCalls,
    [],
    "a later listener can still cancel the same reset before the scheduled task runs",
  );
});

test("CheckboxGroup reset task outlives a microtask-checkpoint cancellation", async () => {
  const { form, harness } = mountCheckboxGroup({ legend: "Days", defaultValue: ["mon"] });
  const event = { defaultPrevented: false };

  form.handlersFor("reset")[0](event);
  // Emulates a delegated React onReset that reaches preventDefault only after the
  // native listener's former microtask checkpoint but before the later task runs.
  queueMicrotask(() => {
    event.defaultPrevented = true;
  });
  await flushScheduledTasks();

  assert.deepEqual(
    harness.setCalls,
    [],
    "a task-deferred reset observes cancellation that a microtask would have missed",
  );
});

test("CheckboxGroup cancels a pending reset task on unmount", async () => {
  const { form, harness, unmount } = mountCheckboxGroup({
    legend: "Days",
    defaultValue: ["mon"],
  });

  form.handlersFor("reset")[0]({ defaultPrevented: false });
  unmount();
  await flushScheduledTasks();

  assert.deepEqual(harness.setCalls, [], "an unmounted group never applies a pending reset");
});

test("CheckboxGroup reset never writes a controlled selection", async () => {
  const valueChanges = [];
  const { form, harness } = mountCheckboxGroup({
    legend: "Days",
    value: ["tue"],
    defaultValue: ["mon"],
    onValueChange: (next) => valueChanges.push(next),
  });

  form.handlersFor("reset")[0]({ defaultPrevented: false });
  await flushScheduledTasks();

  assert.deepEqual(harness.setCalls, [], "the caller-owned controlled value is not rewritten");
  assert.deepEqual(valueChanges, [], "reset alone never reports a value change");
});

test("CheckboxGroup toggles still report a value change through the synthetic harness", () => {
  const valueChanges = [];
  const { harness, tree } = mountCheckboxGroup({
    legend: "Days",
    defaultValue: ["mon"],
    onValueChange: (next) => valueChanges.push(next),
  });
  const context = findCheckboxGroupContext(tree);

  assert.ok(context, "the group context is rendered");
  context.toggle("tue", true);
  assert.deepEqual(valueChanges, [["mon", "tue"]]);
  assert.deepEqual(harness.setCalls, [["mon", "tue"]]);
});
