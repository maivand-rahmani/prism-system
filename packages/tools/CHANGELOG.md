# Changelog — @prism-system/tools

## 4.0.0

### Major Changes

- bf53e2c: Shipped `design-system.json` manifests are now `schemaVersion: 5` with the same numeric
  `contractVersion: 4`. Every manifest carries a required `entrypoints` map whose
  requirements are resolved from `package.json` dependency/peer metadata, optional
  per-component `effects` (features, rendering, reduced-motion, graphics fallback), and an
  optional nonempty `extensions` map for verified custom PascalCase exports with an
  `apiVersion`, entrypoint, description, docs/example references, and effects. The
  package-owned `design-system.source.json` descriptor moves to `schemaVersion: 4` and
  gains the same optional `entrypoints`/`extensions`/`effects` declarations; it stays
  repository-only and is never shipped. `@prism-system/ui-core` and the shared component
  contract are unchanged.

  Readers built for schema 4 (or schema 3) cannot consume schema-5 manifests, so this
  upgrade needs explicit lockstep coordination: publish `@prism-system/tools` together
  with both systems, and upgrade `prism-ds` together with the installed system.
  `prism-ds` now requires `schemaVersion: 5`, rejects older manifests, and reads the
  entrypoint requirements and custom extension catalog only from the installed public
  manifest without executing package code. An older `prism-ds` cannot read a schema-5
  manifest.

## 3.0.0

### Major Changes

- 27f9421: Require Node.js 22 or newer and add an inline TUI when invoking `prism-ds` without arguments. Interactive use and upgrade confirmations show the managed-file plan and refuse reconnect if it drifts during installation.

## 2.0.0

### Major Changes

- fd0605b: `prism-ds` now supports only the current manifest shape (`schemaVersion: 4`, numeric
  `contractVersion: 4`) and fails closed on everything else, including schema 3 and the
  retired string `contract` markers. Because the tooling can no longer read schema-3
  manifests, `@prism-system/tools` must be published in lockstep with
  `@prism-system/ui-core` and the schema-4 systems; an older `prism-ds` cannot read a
  schema-4 manifest.

### Minor Changes

- fd0605b: Include contract/schema metadata, component variants, sizes, compound members,
  and public export changes in upgrade previews and JSON diff output. Compare
  capability arrays as sets and document that token values are absent from manifests.

Historical release notes are archived at
[`docs/archive/release-history/tools.md`](../../docs/archive/release-history/tools.md).

Record every user-visible change with Changesets (`pnpm changeset`). Versioning and
publishing remain explicit, human-controlled steps; no local command publishes a
package. The current contract and lifecycle are documented in
[`docs/v4/README.md`](../../docs/v4/README.md) and
[`docs/guide.md`](../../docs/guide.md).
