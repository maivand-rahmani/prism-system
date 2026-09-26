---
"@prism-system/ui-core": major
---

The shared contract now requires the full 29-component map. Nine contracts are newly
required on top of the previous V4 layer's twenty: `Center`, `Cluster`, `Sidebar`,
`AspectRatio`, `Combobox`, `DatePicker`, `NumberField`, `Slider`, and `FileUpload`. The
parallel V2/V4 aliases and the separate V4 registry are gone in favor of one
`DesignSystemComponents` map, one `DesignSystem` type, and one
`createDesignSystemRegistry`; `contractVersion` stays the numeric `4`.

Design-system implementers must now provide all 29 entries: maps with only the previous
twenty no longer typecheck and are rejected at registration. Release in lockstep with
the schema-4 systems and `@prism-system/tools`.
