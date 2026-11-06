import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync(new URL("./src/components/button/button.css", import.meta.url), "utf8");
const sizeRules = new Map(
  [
    ...styles.matchAll(
      /:where\(\.maivand-plr-ui\)\.maivand-plr-button-(sm|md|lg|icon)\s*\{([^}]*)\}/g,
    ),
  ].map(([, size, declarations]) => [size, declarations]),
);

test("icon buttons keep a token-sized target without shrinking in flex layouts", () => {
  const iconRule = sizeRules.get("icon");

  assert.ok(iconRule, "the scoped icon-size rule should remain present");
  assert.match(iconRule, /min-inline-size:\s*var\(--maivand-plr-spacing-scale-12\)/);
  assert.match(iconRule, /min-block-size:\s*var\(--maivand-plr-spacing-scale-12\)/);
  assert.match(iconRule, /flex-shrink:\s*0/);
});

test("text button sizes keep their established dimensions", () => {
  assert.match(sizeRules.get("sm") ?? "", /min-height:\s*32px/);
  assert.match(sizeRules.get("md") ?? "", /min-height:\s*40px/);
  assert.match(sizeRules.get("lg") ?? "", /min-height:\s*48px/);
});
