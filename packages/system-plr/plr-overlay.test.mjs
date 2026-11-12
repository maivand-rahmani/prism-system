#!/usr/bin/env node
/**
 * Headless regressions for the Plan Like Rahmani overlay/action components.
 *
 * These tests transpile the real component files and render them against minimal
 * Radix-shaped primitives. They verify PLR's wrappers, styling scope, and public
 * compound API without rebuilding core or requiring a browser. Radix keyboard,
 * focus, portal, and dismissal behavior is covered separately in the focused
 * browser check documented in the implementation report.
 *
 * Run with: node --test packages/system-plr/plr-overlay.test.mjs
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
const components = join(here, "src", "components");
const h = React.createElement;

function primitive(name, tag = "div") {
  return React.forwardRef(function MockPrimitive(
    {
      children,
      className,
      forceMount: _forceMount,
      side: _side,
      sideOffset: _sideOffset,
      align: _align,
      alignOffset: _alignOffset,
      collisionPadding: _collisionPadding,
      avoidCollisions: _avoidCollisions,
      sticky: _sticky,
      hideWhenDetached: _hideWhenDetached,
      type: _type,
      ...props
    },
    ref,
  ) {
    return h(tag, { ...props, ref, className, "data-mock-radix-part": name }, children);
  });
}

function root(name) {
  return function MockRoot({ children, ...props }) {
    return h("div", { ...props, "data-mock-radix-root": name }, children);
  };
}

const PopoverPrimitive = {
  Root: root("popover"),
  Trigger: primitive("popover-trigger", "button"),
  Anchor: primitive("popover-anchor"),
  Portal: ({ children }) => h(React.Fragment, null, children),
  Content: primitive("popover-content"),
  Close: primitive("popover-close", "button"),
  Title: primitive("popover-title", "h2"),
  Description: primitive("popover-description", "p"),
  Arrow: primitive("popover-arrow", "svg"),
};

const AlertDialogPrimitive = {
  Root: root("alert-dialog"),
  Trigger: primitive("alert-dialog-trigger", "button"),
  Portal: ({ children }) => h(React.Fragment, null, children),
  Overlay: primitive("alert-dialog-overlay"),
  Content: primitive("alert-dialog-content"),
  Title: primitive("alert-dialog-title", "h2"),
  Description: primitive("alert-dialog-description", "p"),
  Cancel: primitive("alert-dialog-cancel", "button"),
  Action: primitive("alert-dialog-action", "button"),
};

const ToggleGroupPrimitive = {
  Root: primitive("toggle-group-root"),
  Item: primitive("toggle-group-item", "button"),
};

const ToolbarPrimitive = {
  Root: primitive("toolbar-root"),
  Button: primitive("toolbar-button", "button"),
  Link: primitive("toolbar-link", "a"),
  Separator: primitive("toolbar-separator"),
  ToggleGroup: primitive("toolbar-toggle-group"),
  ToggleItem: primitive("toolbar-toggle-item", "button"),
};

const mockCore = {
  AlertDialogPrimitive,
  PopoverPrimitive,
  ToggleGroupPrimitive,
  ToolbarPrimitive,
  cn: (...inputs) => inputs.filter(Boolean).join(" "),
};

function loadComponent(folder, file) {
  const sourcePath = join(components, folder, file);
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
  loaded.require = (id) => (id === "@prism-system/ui-core" ? mockCore : originalRequire(id));
  loaded._compile(outputText, filename);
  return loaded.exports;
}

const popover = loadComponent("popover", "Popover.tsx");
const alertDialog = loadComponent("alert-dialog", "AlertDialog.tsx");
const toggleGroup = loadComponent("toggle-group", "ToggleGroup.tsx");
const toolbar = loadComponent("toolbar", "Toolbar.tsx");

test("overlay components retain every documented compound member", () => {
  for (const name of ["Trigger", "Anchor", "Content", "Close", "Title", "Description", "Arrow"]) {
    assert.ok(popover.Popover[name], `Popover.${name} should be attached`);
  }
  for (const name of [
    "Trigger",
    "Content",
    "Header",
    "Title",
    "Description",
    "Footer",
    "Cancel",
    "Action",
  ]) {
    assert.ok(alertDialog.AlertDialog[name], `AlertDialog.${name} should be attached`);
  }
  assert.ok(toggleGroup.ToggleGroup.Item, "ToggleGroup.Item should be attached");
  for (const name of ["Button", "Link", "Separator", "ToggleGroup", "ToggleItem"]) {
    assert.ok(toolbar.Toolbar[name], `Toolbar.${name} should be attached`);
  }
});

test("Popover portal content and semantic parts carry their PLR styling hooks", () => {
  const markup = renderToStaticMarkup(
    h(
      popover.Popover,
      null,
      h(popover.Popover.Trigger, { "aria-label": "Open notes" }, "Notes"),
      h(
        popover.Popover.Content,
        { forceMount: true },
        h(popover.Popover.Title, null, "Planning note"),
        h(popover.Popover.Description, null, "Add a note."),
        h(popover.Popover.Close, null, "Close"),
      ),
    ),
  );

  assert.match(markup, /class="maivand-plr-ui maivand-plr-button maivand-plr-button-outline/);
  assert.match(markup, /class="maivand-plr-ui maivand-plr-popover-content"/);
  assert.match(markup, /class="maivand-plr-popover-title"/);
  assert.match(markup, /class="maivand-plr-popover-description"/);
  assert.match(
    markup,
    /class="maivand-plr-ui maivand-plr-button maivand-plr-button-outline maivand-plr-button-md maivand-plr-popover-close"/,
  );
  assert.match(markup, /Planning note/);
  assert.match(markup, /Add a note\./);
});

test("Popover.Arrow stays decorative even when a forwarded prop conflicts", () => {
  const markup = renderToStaticMarkup(
    h(popover.Popover.Arrow, { "aria-hidden": false, className: "consumer-arrow" }),
  );

  assert.match(markup, /aria-hidden="true"/);
  assert.doesNotMatch(markup, /aria-hidden="false"/);
  assert.match(markup, /class="maivand-plr-popover-arrow consumer-arrow"/);
});

test("AlertDialog keeps its portal surface and actions inside the PLR class scope", () => {
  const markup = renderToStaticMarkup(
    h(
      alertDialog.AlertDialog,
      null,
      h(alertDialog.AlertDialog.Trigger, { variant: "destructive" }, "Delete"),
      h(
        alertDialog.AlertDialog.Content,
        { forceMount: true },
        h(alertDialog.AlertDialog.Header, null, h(alertDialog.AlertDialog.Title, null, "Delete?")),
        h(alertDialog.AlertDialog.Description, null, "This cannot be undone."),
        h(
          alertDialog.AlertDialog.Footer,
          null,
          h(alertDialog.AlertDialog.Cancel, null, "Keep"),
          h(alertDialog.AlertDialog.Action, { variant: "destructive" }, "Delete"),
        ),
      ),
    ),
  );

  assert.match(markup, /class="maivand-plr-ui maivand-plr-alert-dialog-overlay"/);
  assert.match(markup, /class="maivand-plr-ui maivand-plr-alert-dialog-content"/);
  assert.match(markup, /class="maivand-plr-alert-dialog-header"/);
  assert.match(markup, /class="maivand-plr-alert-dialog-footer"/);
  assert.match(markup, /maivand-plr-button-destructive/);
  assert.match(markup, /This cannot be undone\./);
});

test("ToggleGroup and Toolbar forward accessible names and PLR visual hooks", () => {
  const markup = renderToStaticMarkup(
    h(
      "main",
      null,
      h(
        toggleGroup.ToggleGroup,
        { type: "single", "aria-label": "Period" },
        h(toggleGroup.ToggleGroup.Item, { value: "day" }, "Day"),
      ),
      h(
        toolbar.Toolbar,
        { "aria-label": "Formatting" },
        h(toolbar.Toolbar.Button, null, "Bold"),
        h(toolbar.Toolbar.Link, { href: "/help" }, "Help"),
        h(toolbar.Toolbar.Separator, { orientation: "vertical" }),
        h(
          toolbar.Toolbar.ToggleGroup,
          { type: "single", "aria-label": "Alignment" },
          h(toolbar.Toolbar.ToggleItem, { value: "left", "aria-label": "Align left" }, "Left"),
        ),
      ),
    ),
  );

  assert.match(markup, /aria-label="Period"/);
  assert.match(markup, /class="maivand-plr-ui maivand-plr-toggle-group"/);
  assert.match(markup, /class="maivand-plr-toggle-group-item"/);
  assert.match(markup, /role="toolbar"|aria-label="Formatting"/);
  assert.match(markup, /class="maivand-plr-ui maivand-plr-toolbar"/);
  assert.match(markup, /maivand-plr-toolbar-button/);
  assert.match(markup, /maivand-plr-toolbar-link/);
  assert.match(markup, /maivand-plr-toolbar-separator/);
  assert.match(markup, /maivand-plr-toolbar-toggle-item/);
});

test("all overlay and action styles use PLR tokens and honor reduced motion", () => {
  const styles = [
    "popover/popover.css",
    "alert-dialog/alert-dialog.css",
    "toggle-group/toggle-group.css",
    "toolbar/toolbar.css",
  ].map((path) => readFileSync(join(components, path), "utf8"));

  for (const [index, css] of styles.entries()) {
    assert.match(
      css,
      /maivand-plr-/i,
      `component stylesheet ${index + 1} should use PLR class or tokens`,
    );
    assert.match(css, /prefers-reduced-motion/);
  }
  assert.match(styles[0], /--maivand-plr-color-surface-raised/);
  assert.match(styles[1], /--maivand-plr-color-surface-raised/);
  assert.match(styles[2], /--maivand-plr-color-action-primary/);
  assert.match(styles[3], /--maivand-plr-color-border-focus/);
});
