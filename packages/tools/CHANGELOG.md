# Changelog — @prism-system/tools

## 2.0.0

### Major Changes

- 061dcaf: `prism-ds` now supports only the current manifest shape (`schemaVersion: 4`, numeric
  `contractVersion: 4`) and fails closed on everything else, including schema 3 and the
  retired string `contract` markers. Because the tooling can no longer read schema-3
  manifests, `@prism-system/tools` must be published in lockstep with
  `@prism-system/ui-core` and the schema-4 systems; an older `prism-ds` cannot read a
  schema-4 manifest.

### Minor Changes

- f8e93ea: Include contract/schema metadata, component variants, sizes, compound members,
  and public export changes in upgrade previews and JSON diff output. Compare
  capability arrays as sets and document that token values are absent from manifests.

Historical release notes are archived at
[`docs/archive/release-history/tools.md`](../../docs/archive/release-history/tools.md).

Record every user-visible change with Changesets (`pnpm changeset`). Versioning and
publishing remain explicit, human-controlled steps; no local command publishes a
package. The current contract and lifecycle are documented in
[`docs/v4/README.md`](../../docs/v4/README.md) and
[`docs/guide.md`](../../docs/guide.md).
