---
"@prism-system/ui-system-a": minor
"@prism-system/ui-system-b": minor
---

Add the V3 consumer contract foundation: a generated, shipped
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
