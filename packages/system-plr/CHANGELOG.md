# @prism-system/ui-system-plr

## 0.2.0

### Minor Changes

- 28020df: Add self-hosted handwritten typography for diary entries.

  - Bundle Caveat variable WOFF2 subsets (Latin, Latin Extended, Cyrillic,
    Cyrillic Extended) so handwriting works offline with `styles.css` and covers
    Russian, English, and digits.
  - Publish `typography.family.handwriting` as a token: available in the
    `@prism-system/ui-system-plr/tokens` export,
    `--maivand-plr-typography-family-handwriting` in CSS, and
    `--font-prism-handwriting` in the Tailwind bridge.
  - Add `Text variant="handwriting"` alongside the default `body` treatment for
    short reflective copy.

### Patch Changes

- 3ba09d6: Fix the shared Select listbox and the Plan Like Rahmani font delivery.

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

- Updated dependencies [3ba09d6]
  - @prism-system/ui-core@3.0.1

## 0.1.1

### Patch Changes

- 4003588: Prepare the Plan Like Rahmani design system for automated releases.
