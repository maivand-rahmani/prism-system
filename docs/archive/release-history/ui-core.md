# @prism-system/ui-core

> **Archived release history.** Historical release notes of `@prism-system/ui-core`,
> preserved for reference. Not current guidance: see
> [the current specification](../../v4/README.md) and
> [the human guide](../../guide.md). New user-visible changes are recorded with
> Changesets.

## 2.0.0

### Major Changes

- Release Prism V4: the visual system for whole interfaces, as an additive layer over the unchanged V2 contract.

  - `@prism-system/ui-core`: the V4 contract layer — 20 required components, 12 optional contracts, `DesignSystemComponentsV4`, separate required/optional lists, `defineDesignSystemV4`, and a separate V4 registry. The V2 types, exports, and registry stay unchanged.
  - `@prism-system/ui-system-a` / `@prism-system/ui-system-b`: all 20 required components, only the optional components each system actually declares (no stubs), `tokens.source.json` as the token source of truth, and a `schemaVersion: 2` / `contract: "v4"` manifest next to the generated ordinary `styles.css` and the Tailwind v4 `tailwind.css` bridge.
  - Manifest readers strictly distinguish `(schemaVersion: 1, contract: "v2")` from `(schemaVersion: 2, contract: "v4")`; a missing optional component key means "unavailable".
  - `@prism-system/tools`: offline `components`, `tokens`, `check`, and `setup-tailwind`, plus the explicit `upgrade <package> <exact-version>`; V2 and V4 are read by their own schema rules while existing command behavior and machine output stay compatible.

  The V4 manifest form and public contract are not backward compatible for the systems and `ui-core`, so they take a major bump; the new tooling commands are additive, so `@prism-system/tools` takes a minor bump.

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
