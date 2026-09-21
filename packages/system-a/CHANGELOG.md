# @prism-system/ui-system-a

## 1.1.0

### Minor Changes

- 9a71ca9: Add the V3 consumer contract foundation: a generated, shipped
  `design-system.json` manifest plus a package-owned `design-system.source.json`
  descriptor.

  - Each package now exposes its manifest through the `./manifest` export subpath
    and ships `design-system.json` and `design-brief.json` in the tarball.
  - `package.json.version` is authoritative. The generated manifest version, the
    runtime `DesignSystem.version`, and the registry entry version must all match
    it; `pnpm ds:check` detects drift.
  - The generated manifest records the exact version, the fourteen-component
    catalog with declared variants, sizes, and compound members, the public export
    subpaths, design metadata, and strict usage rules.
  - `pnpm ds:manifest <id> --write` regenerates the manifest, and release
    preparation synchronizes and regenerates it before build/pack.
  - `pnpm ds:sync-versions` (with `--check` for drift-only) aligns the runtime
    version, generated manifest, and registry entry to `package.json.version`
    after `changeset version`; `pnpm release` gates publishing on `--check`.
  - `exports["./manifest"]` must be exactly `"./design-system.json"`, and the
    required `files` entries plus the packed tarball's manifest subpath are
    validated.
  - Package `AGENTS.md` / `README.md` now describe the V3 consumer contract:
    identity, available UI, usage rules, restrictions, and extension rules.
  - Package `AGENTS.md` also cross-links the `use-design-system` and
    `modify-design-system` lifecycle skills.

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
