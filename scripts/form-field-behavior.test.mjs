import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

for (const system of ["a", "b"]) {
  const appRequire = createRequire(resolve(here, "../apps/showcase/package.json"));
  const packageRequire = createRequire(resolve(here, `../packages/system-${system}/package.json`));
  const React = appRequire("react");
  const { renderToStaticMarkup } = appRequire("react-dom/server");
  const { FormField, Input, Textarea } = packageRequire(`../system-${system}/dist/index.js`);
  const prefix = `maivand-${system}`;

  test(`system-${system}: default FormField.Control is only a wrapper`, () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        FormField,
        { id: "field" },
        React.createElement(FormField.Control, null, "content"),
      ),
    );

    assert.match(markup, new RegExp(`<div class="${prefix}-form-field-control">content</div>`));
    assert.doesNotMatch(markup, /aria-(?:invalid|required|disabled|describedby)=| id="field"/);
  });

  test(`system-${system}: asChild preserves child state and root invalid reaches Input chrome`, () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        FormField,
        { id: "field", invalid: true },
        React.createElement(
          FormField.Control,
          { asChild: true, "aria-describedby": "shared external-help" },
          React.createElement(Input, {
            disabled: true,
            "aria-invalid": false,
            "aria-required": true,
            "aria-describedby": "external-help",
          }),
        ),
      ),
    );

    assert.match(markup, new RegExp(`class="[^"]*${prefix}-input-shell-error`));
    assert.match(markup, /<input[^>]*id="field"[^>]*disabled=""/);
    assert.match(markup, /aria-invalid="true"/);
    assert.match(markup, /aria-required="true"/);
    assert.match(markup, /aria-describedby="shared external-help"/);
    assert.doesNotMatch(markup, /field-description|field-error/);
  });

  test(`system-${system}: Input and Textarea merge help and caller descriptions`, () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Input, { id: "input", hint: "Hint", "aria-describedby": "external" }),
        React.createElement(Textarea, {
          id: "area",
          hint: "Hint",
          "aria-describedby": "external",
        }),
      ),
    );

    assert.match(markup, /aria-describedby="input-hint external"/);
    assert.match(markup, /aria-describedby="area-hint external"/);
  });
}

test("mergeProps preserves child values when root values are undefined and chains handlers", () => {
  const packageRequire = createRequire(resolve(here, "../packages/system-a/package.json"));
  const { mergeProps } = packageRequire("@prism-system/ui-core");
  const calls = [];
  const merged = mergeProps(
    { disabled: true, "aria-invalid": true, onClick: () => calls.push("child") },
    { disabled: undefined, "aria-invalid": undefined, onClick: () => calls.push("control") },
  );

  assert.equal(merged.disabled, true);
  assert.equal(merged["aria-invalid"], true);
  merged.onClick();
  assert.deepEqual(calls, ["child", "control"]);
});
