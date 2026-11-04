---
"@prism-system/ui-core": patch
"@prism-system/ui-system-plr": patch
---

Fix the shared Select listbox and the Plan Like Rahmani font delivery.

- Core `SelectContent` now renders the required Radix viewport, restoring
  ArrowUp/ArrowDown/Home/End navigation, typeahead, and scroll buttons.
- Core `SelectItem` now routes children through `SelectItemText`, restoring the
  selected-value display, native form options, and controlled value stability
  when a form option list changes dynamically.
- Core upgrades `@radix-ui/react-select` to 2.4.1 for its controlled-value
  synchronization fixes.
- `@prism-system/ui-system-plr` self-hosts Literata and Manrope WOFF2 subsets,
  so `styles.css` no longer emits a remote Google Fonts `@import` that breaks
  Turbopack or gets dropped in production builds.
- Document that `Stack` owns its gap and that product wrappers are the intended
  way to change spacing.
