# Changelog — @prism-system/ui-core

## 3.1.0

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

## 3.0.1

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

## 3.0.0

### Major Changes

- fd0605b: The shared contract now requires the full 29-component map. Nine contracts are newly
  required on top of the previous V4 layer's twenty: `Center`, `Cluster`, `Sidebar`,
  `AspectRatio`, `Combobox`, `DatePicker`, `NumberField`, `Slider`, and `FileUpload`. The
  parallel V2/V4 aliases and the separate V4 registry are gone in favor of one
  `DesignSystemComponents` map, one `DesignSystem` type, and one
  `createDesignSystemRegistry`; `contractVersion` stays the numeric `4`.

  Design-system implementers must now provide all 29 entries: maps with only the previous
  twenty no longer typecheck and are rejected at registration. Release in lockstep with
  the schema-4 systems and `@prism-system/tools`.

### Patch Changes

- fd0605b: Preserve refs, handlers, and existing ARIA descriptions when composing FormField
  controls. Associate mounted help and error parts, keep default Control as a div
  wrapper, and apply invalid appearance from aria-invalid to Input and Textarea.
  Clarify the shared FormField contract, correct Stack metadata, and ship complete
  required-component composition examples with both systems.

Historical release notes are archived at
[`docs/archive/release-history/ui-core.md`](../../docs/archive/release-history/ui-core.md).

Record every user-visible change with Changesets (`pnpm changeset`). Versioning and
publishing remain explicit, human-controlled steps; no local command publishes a
package. The current contract and lifecycle are documented in
[`docs/v4/README.md`](../../docs/v4/README.md) and
[`docs/guide.md`](../../docs/guide.md).
