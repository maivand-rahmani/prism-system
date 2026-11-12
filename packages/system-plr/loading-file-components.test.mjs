#!/usr/bin/env node
/**
 * Isolated render and wiring regressions for Spinner and FileDropzone.
 *
 * This test transpiles each real component source and uses React's server
 * renderer, so it runs without a shared package build, browser, or DOM
 * dependency. It checks rendered native and ARIA semantics plus the source
 * wiring that keeps dropped files in the native input/FormData.
 *
 * The FileDropzone reset-listener and drop-rejection tests also execute the real
 * component in a synthetic client-runtime harness (mocked hooks and recording
 * form/input/DataTransfer stand-ins, no document). That harness proves listener
 * identity, latest-callback behavior, and synchronous drop rejection wiring; native
 * reset, real DataTransfer drops, and FormData still need the real-browser harness.
 *
 * Run with: node --test loading-file-components.test.mjs
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
const componentsRoot = join(here, "src", "components");
const h = React.createElement;
const mockCore = {
  cn: (...values) => values.filter(Boolean).join(" "),
  useComposedRefs:
    (...refs) =>
    (node) => {
      for (const ref of refs) {
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }
    },
};

function loadComponent(folder, file, exportName) {
  const sourcePath = join(componentsRoot, folder, file);
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
  return loaded.exports[exportName];
}

const Spinner = loadComponent("spinner", "Spinner.tsx", "Spinner");
const FileDropzone = loadComponent("file-dropzone", "FileDropzone.tsx", "FileDropzone");

/**
 * Synthetic client-runtime harness for the FileDropzone form-reset effect.
 *
 * This is synthetic, not a DOM render: React hooks are replaced with a deterministic
 * slot runtime and the owning form/input are recording stand-ins. The real component
 * function and its effects still execute, making listener identity, rebinding, and the
 * latest callback observable without a browser.
 */
function createFileDropzoneHarness() {
  const slots = [];
  const refs = [];
  const stateSlots = [];
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

  const React = {
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
      stateSlots[index] = slot;
      return [
        slot.value,
        (next) => {
          slot.value = typeof next === "function" ? next(slot.value) : next;
        },
      ];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !dependencies || !sameDependencies(previous.dependencies, dependencies)) {
        pendingEffects.push({ dependencies, effect, index, previous });
      }
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !dependencies || !sameDependencies(previous.dependencies, dependencies)) {
        slots[index] = { dependencies, value: callback };
      }
      return slots[index].value;
    },
  };

  const sourcePath = join(componentsRoot, "file-dropzone", "FileDropzone.tsx");
  const { outputText } = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    fileName: sourcePath,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const filename = join(here, "file-dropzone-harness.transpiled.cjs");
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(here);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (id) => {
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
      };
    }
    if (id.endsWith(".css")) return {};
    return originalRequire(id);
  };
  loaded._compile(outputText, filename);
  const HarnessedFileDropzone = loaded.exports.FileDropzone;

  return {
    refs,
    getStateValues() {
      return stateSlots.filter(Boolean).map((slot) => slot.value);
    },
    render(props) {
      cursor = 0;
      pendingEffects = [];
      refs.length = 0;
      return HarnessedFileDropzone(props, null);
    },
    runEffects() {
      for (const { dependencies, effect, index, previous } of pendingEffects) {
        previous?.cleanup?.();
        slots[index] = { cleanup: effect(), dependencies };
      }
      pendingEffects = [];
    },
  };
}

function createRecordingForm() {
  const listeners = new Map();
  let addCalls = 0;
  let removeCalls = 0;

  return {
    addEventListener(type, listener) {
      addCalls += 1;
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      removeCalls += 1;
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== listener),
      );
    },
    dispatchReset(event) {
      for (const listener of [...(listeners.get("reset") ?? [])]) listener(event);
    },
    listenerCount(type = "reset") {
      return (listeners.get(type) ?? []).length;
    },
    get addCalls() {
      return addCalls;
    },
    get removeCalls() {
      return removeCalls;
    },
  };
}

function createFakeFileInput(form) {
  return {
    files: [],
    form,
    isConnected: true,
    onChange: null,
    dispatchEvent(event) {
      this.onChange?.({ currentTarget: this, nativeEvent: event, target: this });
      return true;
    },
  };
}

function createResetEvent() {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function dispatchResetWithRecordedTimers(form, event) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const previousWindow = globalThis.window;
  const timers = [];
  globalThis.window = {
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
  };
  try {
    form.dispatchReset(event);
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
  return timers;
}

function runTimers(timers) {
  while (timers.length) timers.shift()();
}

function mountFileDropzone(harness, props, input) {
  const tree = harness.render(props);
  const inputRef = harness.refs.find((ref) => ref.current === null);
  assert.ok(inputRef, "the component exposes a native input ref");
  inputRef.current = input;
  harness.runEffects();
  return tree;
}

function rerenderFileDropzone(harness, props) {
  const tree = harness.render(props);
  harness.runEffects();
  return tree;
}

function findRenderedElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findRenderedElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function linkInputChangeHandler(tree, input) {
  const inputElement = findRenderedElement(tree, (node) => node.type === "input");
  assert.ok(inputElement, "the component renders a native input");
  input.onChange = inputElement.props.onChange;
}

function mountDropFileDropzone(harness, props, input) {
  const tree = mountFileDropzone(harness, props, input);
  linkInputChangeHandler(tree, input);
  return tree;
}

function rerenderDropFileDropzone(harness, props, input) {
  const tree = rerenderFileDropzone(harness, props);
  linkInputChangeHandler(tree, input);
  return tree;
}

function currentRejectionMessage(harness) {
  return harness.getStateValues().find((value) => typeof value === "string") ?? "";
}

function createDropEvent(files) {
  return {
    dataTransfer: { files },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function makeFile(name, type = "text/plain") {
  return { name, type };
}

function withFakeDataTransfer(callback) {
  const hadDataTransfer = Object.prototype.hasOwnProperty.call(globalThis, "DataTransfer");
  const previousDataTransfer = globalThis.DataTransfer;
  globalThis.DataTransfer = class {
    constructor() {
      const files = [];
      this.files = files;
      this.items = {
        add(file) {
          files.push(file);
        },
      };
    }
  };
  try {
    callback();
  } finally {
    if (hadDataTransfer) globalThis.DataTransfer = previousDataTransfer;
    else delete globalThis.DataTransfer;
  }
}

test("Spinner exposes a named status and hides its visual mark from assistive technology", () => {
  const markup = renderToStaticMarkup(h(Spinner, { label: "Saving your plan", size: "lg" }));

  assert.match(markup, /<span[^>]*role="status"[^>]*aria-label="Saving your plan"/);
  assert.match(markup, /maivand-plr-spinner-lg/);
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(markup, /aria-busy="true"/);
});

test("Spinner has a static, perceivable reduced-motion appearance", () => {
  const styles = readFileSync(join(componentsRoot, "spinner", "spinner.css"), "utf8");
  const reducedMotion =
    styles.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(reducedMotion, /animation:\s*none/);
  assert.match(reducedMotion, /stroke-dasharray:\s*none/);
  assert.match(styles, /\.maivand-plr-spinner-track\s*\{[^}]*opacity:\s*0\.3/s);
});

test("FileDropzone renders a labeled, focusable native input with form constraints", () => {
  const markup = renderToStaticMarkup(
    h(FileDropzone, {
      label: "Attach planning notes",
      hint: "PDF files only",
      accept: ".pdf,application/pdf",
      multiple: true,
      required: true,
      name: "attachments",
    }),
  );
  const labelId = markup.match(/<label[^>]*for="([^"]+)"[^>]*>Attach planning notes<\/label>/)?.[1];

  assert.ok(labelId, "the visible label should name the native file input");
  assert.match(markup, new RegExp(`<input[^>]*id="${labelId}"[^>]*type="file"`));
  assert.match(markup, /name="attachments"/);
  assert.match(markup, /accept="\.pdf,application\/pdf"/);
  assert.match(markup, /multiple=""/);
  assert.match(markup, /required=""/);
  assert.match(markup, /aria-describedby="[^"]+-hint"/);
  assert.doesNotMatch(markup, /tabindex="-1"/, "the native input stays keyboard reachable");
  assert.match(markup, /aria-hidden="true">Choose a file or drop it here/);
});

test("FileDropzone keeps single, disabled, and error states on the native control", () => {
  const single = renderToStaticMarkup(
    h(FileDropzone, { label: "One image", accept: "image/*", required: true }),
  );
  const disabled = renderToStaticMarkup(
    h(FileDropzone, { label: "Unavailable", disabled: true, error: "Cannot attach files." }),
  );

  assert.match(single, /accept="image\/\*"/);
  assert.doesNotMatch(single, /\smultiple=""/);
  assert.match(single, /required=""/);
  assert.match(disabled, /disabled=""/);
  assert.match(disabled, /aria-invalid="true"/);
  assert.match(disabled, /role="alert"[^>]*>Cannot attach files\.<\/span>/);
});

test("FileDropzone never forwards controlled file values, even from untyped callers", () => {
  const markup = renderToStaticMarkup(
    h(FileDropzone, {
      label: "Attach a note",
      value: "C:\\fakepath\\note.pdf",
      defaultValue: "C:\\fakepath\\old.pdf",
    }),
  );
  const input = markup.match(/<input[^>]*>/)?.[0] ?? "";

  assert.doesNotMatch(input, /\svalue=/);
  const source = readFileSync(join(componentsRoot, "file-dropzone", "FileDropzone.tsx"), "utf8");
  assert.match(source, /"value"[\s\S]*"defaultValue"/);
});

test("FileDropzone forwards either native accessible-name override", () => {
  const labelled = renderToStaticMarkup(
    h(FileDropzone, { label: "Visible upload label", "aria-label": "Upload a PDF" }),
  );
  const labelledBy = renderToStaticMarkup(
    h(FileDropzone, { label: "Visible upload label", "aria-labelledby": "upload-heading" }),
  );

  assert.match(labelled, /aria-label="Upload a PDF"/);
  assert.match(labelledBy, /aria-labelledby="upload-heading"/);
});

test("FileDropzone merges descriptions and invalid state without dangling hint IDs", () => {
  const describedHint = renderToStaticMarkup(
    h(FileDropzone, {
      label: "Attach a note",
      hint: "PDF only",
      "aria-describedby": "consumer-help",
    }),
  );
  const describedError = renderToStaticMarkup(
    h(FileDropzone, {
      label: "Attach a note",
      hint: "PDF only",
      error: "Choose a PDF.",
      "aria-describedby": "consumer-error-help",
      "aria-invalid": false,
    }),
  );
  const preservedInvalid = renderToStaticMarkup(
    h(FileDropzone, { label: "Attach a note", "aria-invalid": "grammar" }),
  );

  assert.match(describedHint, /aria-describedby="[^"]+-hint consumer-help"/);
  assert.match(describedError, /aria-describedby="[^"]+-error consumer-error-help"/);
  assert.match(describedError, /aria-invalid="true"/);
  assert.doesNotMatch(describedError, /id="[^"]+-hint"/);
  assert.match(preservedInvalid, /aria-invalid="grammar"/);
});

test("FileDropzone assigns accepted drops to the native input and reports native change", () => {
  const source = readFileSync(join(componentsRoot, "file-dropzone", "FileDropzone.tsx"), "utf8");

  assert.match(source, /"value"[\s\S]*"defaultValue"/);
  assert.match(source, /input\.files\s*=\s*transfer\.files/);
  assert.match(
    source,
    /input\?\.dispatchEvent\(new Event\("change",\s*\{\s*bubbles:\s*true\s*\}\)\)/,
  );
  assert.match(source, /onFilesChange\?\.\(chosen\)/);
  assert.match(source, /native-file-list-unavailable/);
  assert.match(source, /formatRejectionMessage\?\.\(rejections\)/);
  assert.match(source, /sameFileSelection\(previousFiles, currentFiles\)/);
  assert.match(
    source,
    /if \(event\.defaultPrevented[\s\S]*?latestOnFilesChange\.current\?\.\(\[\]\)/,
  );
  assert.match(source, /form\.addEventListener\("reset", handleFormReset\)/);
  assert.match(source, /onDrop=\{handleDrop\}/);
});

test("FileDropzone keeps one reset listener across callback changes and calls the latest callback (synthetic harness)", () => {
  const harness = createFileDropzoneHarness();
  const form = createRecordingForm();
  const input = createFakeFileInput(form);
  input.files = [{ name: "picker-final.txt", type: "text/plain" }];
  const firstCalls = [];
  const latestCalls = [];

  mountFileDropzone(
    harness,
    {
      label: "Attach planning notes",
      form: "plan-form",
      onFilesChange: (files) => firstCalls.push(files),
    },
    input,
  );
  assert.equal(form.addCalls, 1, "the reset listener is attached on mount");

  rerenderFileDropzone(harness, {
    label: "Attach planning notes",
    form: "plan-form",
    onFilesChange: (files) => latestCalls.push(files),
  });

  assert.equal(form.addCalls, 1, "a new callback identity does not rebind the listener");
  assert.equal(form.removeCalls, 0, "the existing reset listener stays attached");
  assert.equal(form.listenerCount(), 1, "exactly one reset listener remains");

  input.files = [{ name: "picker-final.txt", type: "text/plain" }];
  const event = createResetEvent();
  const timers = dispatchResetWithRecordedTimers(form, event);
  input.files = [];

  assert.deepEqual(firstCalls, [], "the reset notification is deferred until dispatch ends");
  assert.deepEqual(latestCalls, []);
  runTimers(timers);
  assert.deepEqual(latestCalls, [[]], "the latest callback receives the cleared selection");
  assert.deepEqual(firstCalls, [], "the callback captured on mount is not invoked");

  input.files = [{ name: "picker-final.txt", type: "text/plain" }];
  const cancelled = createResetEvent();
  const cancelledTimers = dispatchResetWithRecordedTimers(form, cancelled);
  cancelled.preventDefault();
  runTimers(cancelledTimers);
  assert.deepEqual(latestCalls, [[]], "a later preventDefault leaves consumer state unchanged");

  input.files = [{ name: "still-present.txt", type: "text/plain" }];
  runTimers(dispatchResetWithRecordedTimers(form, createResetEvent()));
  assert.deepEqual(latestCalls, [[]], "only an actually cleared selection is reported");
});

test("FileDropzone rebinds the reset listener when the explicit form association changes (synthetic harness)", () => {
  const harness = createFileDropzoneHarness();
  const firstForm = createRecordingForm();
  const secondForm = createRecordingForm();
  const input = createFakeFileInput(firstForm);
  const calls = [];
  const props = {
    label: "Attach planning notes",
    form: "first-form",
    onFilesChange: (files) => calls.push(files),
  };

  mountFileDropzone(harness, props, input);
  assert.equal(firstForm.addCalls, 1);

  input.form = secondForm;
  rerenderFileDropzone(harness, { ...props, form: "second-form" });

  assert.equal(firstForm.removeCalls, 1, "the old form association is released");
  assert.equal(secondForm.addCalls, 1, "the new form association is observed");
  assert.equal(secondForm.listenerCount(), 1);

  input.files = [{ name: "picker-final.txt", type: "text/plain" }];
  const timers = dispatchResetWithRecordedTimers(secondForm, createResetEvent());
  input.files = [];
  runTimers(timers);
  assert.deepEqual(calls, [[]], "reset is still reported after rebinding");
});

test("FileDropzone keeps partial drop rejections visible with synchronous native change dispatch (synthetic harness)", () => {
  const scenarios = [
    {
      acceptMessage: "1 extra file was not added; choose one file at a time.",
      dropped: [makeFile("first.txt"), makeFile("second.txt")],
      expectedRejection: "second.txt:multiple",
      name: "single-file multiple rejection",
      props: { multiple: false },
    },
    {
      acceptMessage: "1 file did not match the accepted file types.",
      dropped: [makeFile("first.txt"), makeFile("wrong.pdf", "application/pdf")],
      expectedRejection: "wrong.pdf:accept",
      name: "mixed accepted and wrong-type rejection",
      props: { multiple: true },
    },
  ];

  for (const scenario of scenarios) {
    const harness = createFileDropzoneHarness();
    const form = createRecordingForm();
    const input = createFakeFileInput(form);
    const changes = [];
    const rejected = [];
    const props = {
      accept: ".txt,text/plain",
      label: "Attach planning notes",
      ...scenario.props,
      onFilesChange: (files) => changes.push(files.map((file) => file.name)),
      onFilesRejected: (entries) =>
        rejected.push(entries.map((entry) => `${entry.file.name}:${entry.reason}`)),
    };
    const context = scenario.name;

    let tree = mountDropFileDropzone(harness, props, input);
    withFakeDataTransfer(() => tree.props.onDrop(createDropEvent(scenario.dropped)));

    assert.deepEqual(
      changes,
      [[scenario.dropped[0].name]],
      `${context}: the accepted selection is reported exactly once`,
    );
    assert.deepEqual(
      rejected,
      [[scenario.expectedRejection]],
      `${context}: the rejection is reported exactly once`,
    );
    assert.equal(
      currentRejectionMessage(harness),
      scenario.acceptMessage,
      `${context}: the synchronous change leaves the rejection message visible`,
    );

    tree = rerenderDropFileDropzone(harness, props, input);
    const alert = findRenderedElement(tree, (node) => node.props?.role === "alert");
    assert.ok(alert, `${context}: the rejection is rendered in a live alert`);
    assert.equal(alert.props.children, scenario.acceptMessage);

    const laterFile = makeFile("later.txt");
    withFakeDataTransfer(() => tree.props.onDrop(createDropEvent([laterFile])));
    assert.equal(
      currentRejectionMessage(harness),
      "",
      `${context}: a later successful drop clears the stale rejection message`,
    );
    tree = rerenderDropFileDropzone(harness, props, input);
    assert.equal(
      findRenderedElement(tree, (node) => node.props?.role === "alert"),
      null,
      `${context}: the stale alert is removed from the tree`,
    );
    assert.deepEqual(changes, [[scenario.dropped[0].name], [laterFile.name]]);
    assert.equal(rejected.length, 1, `${context}: no duplicate rejection callback`);
  }
});
