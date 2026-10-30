#!/usr/bin/env node
/**
 * Toast.Close dismissal regression (headless).
 *
 * Regression: `Toast.Root` provided a close callback through
 * `ToastCloseContext`, but `Toast.Close` never consumed it and rendered a plain
 * button. Neither a click nor native Enter/Space activation dismissed the
 * toast, even though the Showcase composition was correct.
 *
 * This package has no DOM harness. The test transpiles the real component
 * source, renders it with real React context through `react-dom/server`, and
 * captures the props the close control hands to an `asChild` probe so the
 * wrapper's own handler can be invoked. The assertions cover:
 *
 *   1. activating the close control calls the owning root's `onOpenChange(false)`;
 *   2. a consumer `onClick` still runs and can cancel dismissal with
 *      `preventDefault()`;
 *   3. the default close control is still a plain `<button>` (native Enter and
 *      Space activation therefore reach the same handler);
 *   4. every compound static member stays attached.
 *
 * Run with: node --test toast-close.test.mjs
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
const sourcePath = join(here, "src", "components", "toast", "Toast.tsx");
const h = React.createElement;

/**
 * Minimal stand-in for Radix Slot composition: merge slot props onto the single
 * child, combining class names and composing event handlers child-first, the
 * same order the real `@radix-ui/react-slot` uses.
 */
function mergeSlotProps(slotProps, childProps) {
  const overrideProps = { ...childProps };
  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];
    if (/^on[A-Z]/.test(propName)) {
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args) => {
          const result = childPropValue(...args);
          slotPropValue(...args);
          return result;
        };
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
    } else if (propName === "style") {
      overrideProps[propName] = { ...slotPropValue, ...childPropValue };
    } else if (propName === "className") {
      overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
    }
  }
  return { ...slotProps, ...overrideProps };
}

const Slot = React.forwardRef(function MockSlot({ children, ...slotProps }, ref) {
  const child = React.Children.only(children);
  const merged = mergeSlotProps(slotProps, child.props);
  if (ref) merged.ref = ref;
  return React.cloneElement(child, merged);
});

/** Minimal stand-in for only the core exports Toast.tsx consumes. */
const mockCore = {
  Slot,
  cn: (...inputs) => inputs.filter(Boolean).join(" "),
};

/** Transpile and evaluate Toast.tsx with the mock core. */
function loadToast() {
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

  const filename = join(here, "toast-close.transpiled.cjs");
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(here);

  const originalRequire = loaded.require.bind(loaded);
  loaded.require = function requireToastDependency(id) {
    return id === "@prism-system/ui-core" ? mockCore : originalRequire(id);
  };
  loaded._compile(outputText, filename);

  return loaded.exports;
}

const { Toast } = loadToast();

/** Captures the props `Toast.Close` merges onto its single `asChild` child. */
let capturedCloseProps;

const Probe = React.forwardRef(function Probe(props, ref) {
  capturedCloseProps = props;
  const { children, ...rest } = props;
  return h("button", { ref, ...rest }, children);
});

/** Render a root plus a close control and expose the close control's props. */
function renderClose(closeProps, rootProps) {
  capturedCloseProps = undefined;
  const markup = renderToStaticMarkup(
    h(
      Toast.Provider,
      { duration: null },
      h(
        Toast.Viewport,
        { "aria-label": "Notifications" },
        h(Toast.Root, { open: true, duration: null, ...rootProps }, h(Toast.Close, closeProps)),
      ),
    ),
  );
  return { markup, closeProps: capturedCloseProps };
}

test("activating Toast.Close asks the owning root to close", () => {
  const changes = [];
  const { closeProps } = renderClose(
    {
      asChild: true,
      "aria-label": "Dismiss notification",
      children: h(Probe, null, "×"),
    },
    { onOpenChange: (open) => changes.push(open) },
  );

  assert.equal(
    typeof closeProps?.onClick,
    "function",
    "Toast.Close should wire an onClick handler",
  );
  closeProps.onClick({ defaultPrevented: false });

  assert.deepEqual(changes, [false]);
});

test("a consumer onClick still runs and can cancel dismissal", () => {
  const changes = [];
  const seen = [];
  const event = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  const { closeProps } = renderClose(
    {
      asChild: true,
      "aria-label": "Dismiss notification",
      children: h(Probe, null, "×"),
      onClick: (clickEvent) => {
        seen.push(clickEvent);
        clickEvent.preventDefault();
      },
    },
    { onOpenChange: (open) => changes.push(open) },
  );

  closeProps.onClick(event);

  assert.deepEqual(seen, [event]);
  assert.deepEqual(changes, []);
});

test("the default close control is still a plain button", () => {
  const { markup } = renderClose({ "aria-label": "Dismiss notification", children: "×" }, {});
  const button = markup.match(/<button[^>]*>/)?.[0] ?? "";

  assert.match(markup, /<li[^>]*data-state="open"/);
  assert.match(button, /class="maivand-plr-toast-close"/);
  assert.match(button, /aria-label="Dismiss notification"/);
  assert.match(markup, />×<\/button>/);
});

test("every Toast compound member stays attached", () => {
  for (const part of ["Provider", "Viewport", "Root", "Title", "Description", "Action", "Close"]) {
    assert.ok(Toast[part], `Toast.${part} should stay attached`);
  }
});
