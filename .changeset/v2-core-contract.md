---
"@prism-system/ui-core": minor
---

Add an additive V2 component contract and unstyled behavior-only adapters.

- New styling-agnostic contract files for `Textarea`, `RadioGroup`, `Switch`,
  `DropdownMenu`, `Tooltip`, and `Separator`.
- New unstyled primitives for those six components, re-exporting the matching
  Radix namespace and adding `data-slot`/`className`/ref conventions only.
- `DesignSystemComponentsV2` (14 required components), `DesignSystemComponentNameV2`,
  `DesignSystemComponentV2`, and the exact `REQUIRED_COMPONENTS_V2` tuple.
- `DesignSystem` is now generic with a V1 default; `DesignSystemV2` and
  `defineDesignSystemV2` add the opt-in V2 shape and marker. `DesignSystemComponents`,
  `DesignSystemComponentName`, `REQUIRED_COMPONENTS`, and the registry remain V1 and
  unchanged, so existing systems continue to compile.
