# @prism-system/ui-system-a

> **Archived release history.** Historical release notes of `@prism-system/ui-system-a`,
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

### Patch Changes

- Updated dependencies
  - @prism-system/ui-core@2.0.0

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
