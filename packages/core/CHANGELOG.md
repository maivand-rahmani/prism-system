# @prism-system/ui-core

## 1.0.0

### Major Changes

- 48a5cd9: Promote the V2 component contract to the canonical, only supported contract (breaking),
  and reject the historical V1 contract.

  - The shared contract is now exactly fourteen components in canonical order:
    `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`, `Switch`,
    `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`.
  - `DesignSystemComponents` is the canonical fourteen-entry map, described by
    `DesignSystemComponentName`, `DesignSystemComponent`, and `REQUIRED_COMPONENTS`. The
    `DesignSystemComponentsV2`, `DesignSystemComponentNameV2`, `DesignSystemComponentV2`,
    and `REQUIRED_COMPONENTS_V2` names are exact source-compatible aliases.
  - `DesignSystem` is V2-only and requires `componentContract: "v2"`. `defineDesignSystem`
    and `defineDesignSystemV2` both enforce the full fourteen-entry shape, and the
    registry rejects anything without the `"v2"` marker.
  - The historical eight-component V1 contract (`Button`, `Input`, `Card`, `Badge`,
    `Checkbox`, `Tabs`, `Dialog`, `Select`) is rejected: eight-component maps no longer
    typecheck and are refused at registration.
  - New styling-agnostic contract files for `Textarea`, `RadioGroup`, `Switch`,
    `DropdownMenu`, `Tooltip`, and `Separator`.
  - New unstyled primitives for those six components, re-exporting the matching Radix
    namespace and adding `data-slot`/`className`/ref conventions only.

## 0.1.1

### Patch Changes

- cccaafd: Add `repository` metadata to the publishable package manifests so npm can verify the source repository when releases are published through Trusted Publishing (OIDC) from GitHub Actions.
