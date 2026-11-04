# Plan Like Rahmani components

The generated [design-system manifest](../design-system.json) is the authoritative component
catalog: it records actual availability, variants, sizes, compound members, and effect metadata.
This package implements all required and optional shared contracts and declares no custom
extensions.

## Material and type

The light palette layers warm paper, a darker writing surface, oak-toned edges, and muted leaf
green. The dark theme shifts those surfaces to deep wood and keeps the text and focus ring clear.
The stylesheet uses Literata for editorial headings and reflective text, and Manrope for controls
and numbers. Both font families support Cyrillic and are self-hosted as packaged WOFF2 assets; no
third-party font request is required.

Cards have a faint paper grain and an inset edge. Primary actions use a short pressed depth;
inputs have a recessed writing surface. The treatments stay restrained so the interface remains
easy to scan and useful for everyday planning.

## Layout and spacing

`Stack` intentionally exposes only structural flow props (`as`, `direction`, `wrap`). Its gap is
a visual value owned by this system, so Tailwind `gap-*` utilities do not override it: component
rules are unlayered and take precedence over the utility layer. This is the intended API boundary,
not a missing utility. When a product composition needs a different rhythm, wrap the group in a
product-owned layout element and apply Tailwind spacing or Prism spacing tokens there; do not
restyle or replace `Stack` itself.

## Interaction and access

- Interactive controls provide a visible keyboard focus state and a short hover/press response.
- Selection, completion, disabled, invalid, loading, and open states remain distinct without
  depending on color alone.
- Dialogs and popovers retain their core keyboard and focus behavior.
- `prefers-reduced-motion` turns down transitions, pulsing placeholders, and other motion.
- Page composition and zooming transitions between sections remain application-owned.

Use the [product compositions](../examples/diary-compositions.md) for examples of a day plan,
evening review, and weekly report made from the public component API.
