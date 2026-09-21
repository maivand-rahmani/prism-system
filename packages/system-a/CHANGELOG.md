# @prism-system/ui-system-a

## 1.0.0

### Major Changes

- f46ecb9: Adopt the canonical fourteen-component V2 contract (breaking public contract change).

  - The public API grows from the historical eight components (`Button`, `Input`, `Card`,
    `Badge`, `Checkbox`, `Tabs`, `Dialog`, `Select`) to the canonical fourteen by adding
    `Textarea`, `RadioGroup`, `Switch`, `DropdownMenu`, `Tooltip`, and `Separator`, in
    canonical order.
  - Each system declares the V2 marker (`componentContract: "v2"` /
    `defineDesignSystemV2`) and implements the new components' required compound statics
    (for example `RadioGroup.Item`, `Switch.Thumb`, `DropdownMenu.*`, `Tooltip.Content`).
  - Consumers must migrate from the eight-component V1 map to the fourteen-component V2
    contract; V1 is archived and unsupported.

### Patch Changes

- 5333f78: Refine the shared selection-control presentation across both systems, including
  radio groups, checkboxes, switches, selected states, disabled states, focus
  rings, and responsive hit targets.
- Updated dependencies [48a5cd9]
  - @prism-system/ui-core@1.0.0

## 0.1.1

### Patch Changes

- cccaafd: Add `repository` metadata to the publishable package manifests so npm can verify the source repository when releases are published through Trusted Publishing (OIDC) from GitHub Actions.
- Updated dependencies [cccaafd]
  - @prism-system/ui-core@0.1.1
