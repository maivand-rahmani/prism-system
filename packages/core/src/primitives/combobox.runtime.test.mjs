#!/usr/bin/env node
/**
 * Runtime tests for the unstyled core Combobox primitive.
 *
 * Node's built-in test runner, no test-framework dependency and no DOM: the
 * component tree is rendered with `react-dom/server`, so these tests prove the
 * server-renderable behavior of the primitive (ARIA wiring, semantic markup,
 * controlled/uncontrolled initial state, required/disabled form value, the
 * invalidation, reset-state/reset-scheduling, and required-validity helpers)
 * and the pure navigation model. They import the compiled package from `dist`,
 * so they must run after a core build:
 *
 *   pnpm --filter @prism-system/ui-core build
 *   node --test packages/core/src/primitives/combobox.runtime.test.mjs
 *
 * Interaction gaps (open/close, arrow-key activation after mount, selection by
 * pointer or Enter, edit invalidation, `onValueChange("")`, the DOM wiring of
 * the native reset event, and `setCustomValidity`) require a DOM and must be
 * verified in a browser. The reset decision itself is DOM-free: `reset` is
 * cancelable, so the primitive defers the reset to a microtask and skips it
 * when a later listener called `preventDefault()` or the root unmounted; that
 * deferral and its mount guard are covered here through `deferAcceptedReset`
 * and `shouldApplyDeferredReset`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Combobox,
  REQUIRED_FALLBACK_MESSAGE,
  deferAcceptedReset,
  getNextEnabledIndex,
  getRequiredValidityMessage,
  hasCommittedSelection,
  resolveCommittedValue,
  resolveResetState,
  shouldApplyDeferredReset,
} from "../../dist/primitives/combobox.js";

const h = React.createElement;

/** Render a React element to static markup. */
function render(element) {
  return renderToStaticMarkup(element);
}

/** Extract the first tag carrying `attribute` from `markup`. */
function findTag(markup, attribute) {
  const match = markup.match(new RegExp(`<[^>]*${attribute}[^>]*>`));
  assert.ok(match, `expected markup to contain a tag with ${attribute}`);
  return match[0];
}

/** Read an attribute value from a tag string, or `undefined` when absent. */
function attributeValue(tag, attribute) {
  const match = tag.match(new RegExp(`${attribute}="([^"]*)"`));
  return match ? match[1] : undefined;
}

test("the compound root and its parts are callable forwardRef components", () => {
  const forwardRefType = Symbol.for("react.forward_ref");

  assert.equal(Combobox.$$typeof, forwardRefType);
  assert.equal(Combobox.displayName, "Combobox");
  assert.equal(Combobox.Input.$$typeof, forwardRefType);
  assert.equal(Combobox.Content.$$typeof, forwardRefType);
  assert.equal(Combobox.Item.$$typeof, forwardRefType);
});

test("initial closed state wires combobox semantics, ids, and options", () => {
  const markup = render(
    h(
      Combobox,
      { name: "fruit" },
      h(Combobox.Input, { "aria-describedby": "fruit-help" }),
      h(
        Combobox.Content,
        null,
        h(Combobox.Item, { value: "apple" }, "Apple"),
        h(Combobox.Item, { value: "banana", disabled: true }, "Banana"),
      ),
    ),
  );

  const input = findTag(markup, 'role="combobox"');
  assert.match(input, /type="text"/);
  assert.match(input, /aria-expanded="false"/);
  assert.match(input, /aria-haspopup="listbox"/);
  assert.match(input, /aria-autocomplete="list"/);
  assert.match(input, /aria-describedby="fruit-help"/);
  assert.doesNotMatch(input, /aria-activedescendant/);
  assert.doesNotMatch(input, /required=""/);

  const listbox = findTag(markup, 'role="listbox"');
  assert.match(listbox, /hidden=""/);
  assert.equal(attributeValue(input, "aria-controls"), attributeValue(listbox, "id"));

  const hidden = findTag(markup, 'type="hidden"');
  assert.match(hidden, /name="fruit"/);
  assert.match(hidden, /value=""/);

  const options = markup.match(/<div[^>]*role="option"[^>]*>/g) ?? [];
  assert.equal(options.length, 2);
  assert.match(options[0], /aria-selected="false"/);
  assert.match(options[1], /aria-disabled="true"/);
  assert.notEqual(attributeValue(options[0], "id"), attributeValue(options[1], "id"));
});

test("uncontrolled defaultValue and defaultInputValue seed selection and query", () => {
  const markup = render(
    h(
      Combobox,
      { name: "fruit", defaultValue: "apple", defaultInputValue: "Apple" },
      h(Combobox.Input),
      h(Combobox.Content, null, h(Combobox.Item, { value: "apple" }, "Apple")),
    ),
  );

  const hidden = findTag(markup, 'type="hidden"');
  assert.match(hidden, /value="apple"/);
  assert.match(findTag(markup, 'role="combobox"'), /value="Apple"/);
  assert.match(findTag(markup, 'role="option"'), /aria-selected="true"/);
});

test("controlled value, inputValue, and open drive the rendered state", () => {
  const markup = render(
    h(
      Combobox,
      { name: "fruit", value: "banana", inputValue: "Ban", open: true },
      h(Combobox.Input),
      h(
        Combobox.Content,
        null,
        h(Combobox.Item, { value: "apple" }, "Apple"),
        h(Combobox.Item, { value: "banana" }, "Banana"),
      ),
    ),
  );

  assert.match(findTag(markup, 'type="hidden"'), /value="banana"/);
  assert.match(findTag(markup, 'role="combobox"'), /value="Ban"/);
  assert.match(findTag(markup, 'role="combobox"'), /aria-expanded="true"/);
  assert.doesNotMatch(findTag(markup, 'role="listbox"'), /hidden=""/);

  const options = markup.match(/<div[^>]*role="option"[^>]*>/g) ?? [];
  assert.match(options[1], /aria-selected="true"/);
});

test("the hidden form value is disabled and omitted when no name is given", () => {
  const disabled = render(h(Combobox, { name: "fruit", disabled: true }, h(Combobox.Input)));

  assert.match(findTag(disabled, 'role="combobox"'), /disabled=""/);
  assert.match(findTag(disabled, 'type="hidden"'), /disabled=""/);

  const unnamed = render(h(Combobox, null, h(Combobox.Input)));
  assert.doesNotMatch(unnamed, /type="hidden"/);
});

test("required maps to aria-required and exposes the localized message", () => {
  const markup = render(
    h(
      Combobox,
      { name: "fruit", required: true, requiredMessage: "Pick a fruit" },
      h(Combobox.Input),
      h(Combobox.Content, null, h(Combobox.Item, { value: "apple" }, "Apple")),
    ),
  );

  assert.match(findTag(markup, 'role="combobox"'), /aria-required="true"/);
  assert.doesNotMatch(findTag(markup, 'role="combobox"'), /required=""/);

  const message = findTag(markup, 'role="alert"');
  assert.match(message, /hidden=""/); // Not touched yet: present but not announced.
  assert.match(markup, /Pick a fruit/);

  const selected = render(
    h(
      Combobox,
      { name: "fruit", required: true, requiredMessage: "Pick a fruit", defaultValue: "apple" },
      h(Combobox.Input),
    ),
  );
  assert.doesNotMatch(selected, /role="alert"/);
});

test("invalid maps to aria-invalid on the input from the root or the input", () => {
  const fromRoot = render(h(Combobox, { invalid: true }, h(Combobox.Input)));
  assert.match(findTag(fromRoot, 'role="combobox"'), /aria-invalid="true"/);

  const fromInput = render(h(Combobox, null, h(Combobox.Input, { invalid: true })));
  assert.match(findTag(fromInput, 'role="combobox"'), /aria-invalid="true"/);
});

test("an empty committed value counts as no selection for required", () => {
  const markup = render(
    h(
      Combobox,
      {
        name: "fruit",
        required: true,
        requiredMessage: "Pick a fruit",
        value: "",
        inputValue: "Ap",
      },
      h(Combobox.Input),
    ),
  );

  const input = findTag(markup, 'role="combobox"');
  assert.match(input, /aria-required="true"/);
  // Native `required` would accept the query text, so it must not be rendered.
  assert.doesNotMatch(input, /required=""/);
  assert.doesNotMatch(input, /aria-invalid/); // Not interacted with yet.
  assert.match(findTag(markup, 'type="hidden"'), /value=""/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Pick a fruit/);
});

test("required maps from the input and the hidden input stays value transport only", () => {
  const markup = render(h(Combobox, { name: "fruit" }, h(Combobox.Input, { required: true })));

  const input = findTag(markup, 'role="combobox"');
  assert.match(input, /aria-required="true"/);
  assert.doesNotMatch(input, /required=""/);

  const hidden = findTag(markup, 'type="hidden"');
  assert.match(hidden, /name="fruit"/);
  assert.match(hidden, /value=""/);
  assert.doesNotMatch(hidden, /required=""/);
  assert.doesNotMatch(hidden, /role=/);
  assert.doesNotMatch(hidden, /aria-/);
});

test("editing invalidation helpers suppress the stale value until a fresh commit", () => {
  assert.equal(hasCommittedSelection(undefined), false);
  assert.equal(hasCommittedSelection(""), false);
  assert.equal(hasCommittedSelection("apple"), true);

  assert.equal(resolveCommittedValue("apple", undefined), "apple");
  assert.equal(resolveCommittedValue(undefined, undefined), undefined);
  assert.equal(resolveCommittedValue("apple", "apple"), "");
  assert.equal(resolveCommittedValue("", "apple"), "");
  assert.equal(resolveCommittedValue("banana", "apple"), "banana");
});

test("native reset clears edit invalidation and restores uncontrolled defaults", () => {
  // Uncontrolled: selection returns to defaultValue (or an empty string).
  assert.deepEqual(resolveResetState(undefined, "apple"), {
    invalidatedValue: undefined,
    value: "apple",
  });
  assert.deepEqual(resolveResetState(undefined, undefined), {
    invalidatedValue: undefined,
    value: "",
  });

  // Controlled: reset clears any edit invalidation and leaves the
  // parent-owned value untouched for the parent to reset itself.
  assert.deepEqual(resolveResetState("apple", "apple"), {
    invalidatedValue: undefined,
    value: undefined,
  });
  assert.deepEqual(resolveResetState("apple", "banana"), {
    invalidatedValue: undefined,
    value: undefined,
  });
});

test("a canceled native reset is deferred and never applied", async () => {
  const applied = [];
  const accepted = { defaultPrevented: false };

  deferAcceptedReset(accepted, () => applied.push("accepted"));
  // Still inside synchronous dispatch: the reset must not run yet, because a
  // listener registered after the primitive's can still cancel the event.
  assert.deepEqual(applied, []);
  await Promise.resolve();
  assert.deepEqual(applied, ["accepted"]);

  const canceled = { defaultPrevented: false };
  deferAcceptedReset(canceled, () => applied.push("canceled"));
  canceled.defaultPrevented = true; // a later listener calls preventDefault()
  await Promise.resolve();
  assert.deepEqual(applied, ["accepted"]);
});

test("the deferred-reset decision is cancellation- and mount-aware", () => {
  assert.equal(shouldApplyDeferredReset({ defaultPrevented: false }, true), true);
  assert.equal(shouldApplyDeferredReset({ defaultPrevented: false }, false), false);
  assert.equal(shouldApplyDeferredReset({ defaultPrevented: true }, true), false);
  assert.equal(shouldApplyDeferredReset({ defaultPrevented: true }, false), false);
});

test("an accepted reset survives listener re-subscription but not unmount", async () => {
  // Regression: the form listener effect re-runs whenever controlled
  // `value`/`inputValue` change. The old per-effect `active` flag treated that
  // re-subscription as invalidation, so a reset whose later listener updated
  // parent state synchronously was dropped even though the component stayed
  // mounted. Only an actual unmount may invalidate an accepted reset.
  const applied = [];
  let mounted = true;

  // Ordinary re-subscription: the effect cleanup/re-attach replaced the
  // listener, but the component is still mounted and the reset must apply.
  deferAcceptedReset(
    { defaultPrevented: false },
    () => applied.push("resubscribed"),
    () => mounted,
  );
  await Promise.resolve();
  assert.deepEqual(applied, ["resubscribed"]);

  // A canceled reset is never applied, even while mounted.
  deferAcceptedReset(
    { defaultPrevented: true },
    () => applied.push("canceled"),
    () => mounted,
  );
  await Promise.resolve();
  assert.deepEqual(applied, ["resubscribed"]);

  // A real unmount invalidates the deferred reset; the stale event must not
  // touch state after the component is gone.
  const unmounting = { defaultPrevented: false };
  deferAcceptedReset(
    unmounting,
    () => applied.push("unmounted"),
    () => mounted,
  );
  mounted = false;
  await Promise.resolve();
  assert.deepEqual(applied, ["resubscribed"]);
});

test("a same-value controlled reset restores the committed selection", () => {
  // Regression: reset used to mark the controlled current value invalidated.
  // When that value already equaled the parent's reset value there was no
  // value change to clear the marker, so the selection stayed suppressed
  // forever. Reset must clear the invalidation, letting the parent's current
  // value represent the committed selection again.
  const reset = resolveResetState("apple", "apple");
  assert.equal(resolveCommittedValue("apple", reset.invalidatedValue), "apple");
  assert.equal(hasCommittedSelection(resolveCommittedValue("apple", reset.invalidatedValue)), true);
});

test("required validity is selection-based and always yields a message", () => {
  assert.equal(getRequiredValidityMessage(false, false, "Pick a fruit"), "");
  assert.equal(getRequiredValidityMessage(true, true, "Pick a fruit"), "");
  assert.equal(getRequiredValidityMessage(true, false, "Pick a fruit"), "Pick a fruit");
  assert.equal(getRequiredValidityMessage(true, false, undefined), REQUIRED_FALLBACK_MESSAGE);
  assert.equal(getRequiredValidityMessage(true, false, ""), REQUIRED_FALLBACK_MESSAGE);
  assert.notEqual(REQUIRED_FALLBACK_MESSAGE.trim(), "");
});

test("parts used outside the root fail with a clear message", () => {
  assert.throws(
    () => render(h(Combobox.Input)),
    /Combobox\.Input must be rendered inside <Combobox>\./,
  );
});

test("arrow navigation activates first/last and clamps without wrapping", () => {
  assert.equal(getNextEnabledIndex(0, -1, 1), -1);
  assert.equal(getNextEnabledIndex(3, -1, 1), 0);
  assert.equal(getNextEnabledIndex(3, -1, -1), 2);
  assert.equal(getNextEnabledIndex(3, 0, 1), 1);
  assert.equal(getNextEnabledIndex(3, 2, -1), 1);
  assert.equal(getNextEnabledIndex(3, 0, -1), 0);
  assert.equal(getNextEnabledIndex(3, 2, 1), 2);
  assert.equal(getNextEnabledIndex(3, 9, 1), 0);
  assert.equal(getNextEnabledIndex(3, 9, -1), 2);
});
