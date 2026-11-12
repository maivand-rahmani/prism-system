# @prism-system/ui-system-plr

## 0.4.0

### Minor Changes

- 1e3b1c5: Add fourteen optional component contracts and their Plan Like Rahmani implementations:
  Popover, AlertDialog, ToggleGroup, Toolbar, TagGroup, ListBox, TreeView, TimeField,
  SearchField, CheckboxGroup, RangeSlider, DateRangePicker, Spinner, and FileDropzone.
  The twenty-nine required components and optional omission semantics are unchanged.

  Update `prism-ds` to recognize the expanded catalog and improve narrow-terminal
  confirmation, project details, and large-catalog navigation. Older `prism-ds` versions
  reject manifests containing the new component names; upgrade the CLI before installing
  or upgrading to a design system that declares them.

### Patch Changes

- Updated dependencies [1e3b1c5]
  - @prism-system/ui-core@3.2.0

## 0.3.0

### Minor Changes

- 0938ef8: Add the shared fifty-icon Prism catalog. Core now exports the canonical
  `ICON_NAMES`, `ICON_CATEGORIES`, `IconName`, `IconProps`, and `IconComponent`
  contract without any SVG, colors, or Lucide dependency. `@prism-system/ui-system-plr`
  ships all fifty icons from its `./icons` entrypoint, inherits the system's ink and
  themes, and validates its declaration against the real source and build exports.
  The template now generates the same fifty-icon entrypoint, and `prism-ds` gains an
  offline `icons [name] --cwd <root> [--json]` catalog plus icon-aware check-usage,
  switch, check, and doctor behavior. The shipped manifest stays schema 5: icon
  availability is the real `publicApi["./icons"]` list, so released readers continue
  to accept the manifest and simply do not expose the new catalog command.

### Patch Changes

- 530ae84: Support dependency updates and local CLI self-updates at pnpm workspace roots, and
  verify the current installed package after pnpm replaces its link. Align Radix overlay
  dependencies so nested dialogs and selects share the same dismissal layer in supported
  installations. Give PLR icon buttons a 3rem minimum target in both dimensions and prevent
  them from shrinking in flex layouts.
- Updated dependencies [530ae84]
- Updated dependencies [0938ef8]
  - @prism-system/ui-core@3.1.0

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
