# Changelog — @prism-system/ui-core

## 3.0.0

### Major Changes

- 061dcaf: The shared contract now requires the full 29-component map. Nine contracts are newly
  required on top of the previous V4 layer's twenty: `Center`, `Cluster`, `Sidebar`,
  `AspectRatio`, `Combobox`, `DatePicker`, `NumberField`, `Slider`, and `FileUpload`. The
  parallel V2/V4 aliases and the separate V4 registry are gone in favor of one
  `DesignSystemComponents` map, one `DesignSystem` type, and one
  `createDesignSystemRegistry`; `contractVersion` stays the numeric `4`.

  Design-system implementers must now provide all 29 entries: maps with only the previous
  twenty no longer typecheck and are rejected at registration. Release in lockstep with
  the schema-4 systems and `@prism-system/tools`.

### Patch Changes

- 5a362b0: Preserve refs, handlers, and existing ARIA descriptions when composing FormField
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
