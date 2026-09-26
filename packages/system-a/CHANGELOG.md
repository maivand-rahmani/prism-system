# Changelog — @prism-system/ui-system-a

## 3.0.0

### Major Changes

- 061dcaf: Shipped `design-system.json` manifests are now `schemaVersion: 4` with the numeric
  `contractVersion: 4` and publish the full 29-required-component catalog. The
  package-owned `design-system.source.json` stays a repository-only `schemaVersion: 3`
  input and is never shipped or read from consumers.

  Readers built for schema 3 cannot consume schema-4 manifests, so this upgrade needs
  explicit lockstep coordination: publish `@prism-system/ui-core`, both systems, and
  `@prism-system/tools` in the same release, and upgrade `prism-ds` together with the
  installed system. An older `prism-ds` cannot read a schema-4 manifest, and the current
  tooling rejects schema 3.

### Patch Changes

- 5a362b0: Preserve refs, handlers, and existing ARIA descriptions when composing FormField
  controls. Associate mounted help and error parts, keep default Control as a div
  wrapper, and apply invalid appearance from aria-invalid to Input and Textarea.
  Clarify the shared FormField contract, correct Stack metadata, and ship complete
  required-component composition examples with both systems.
- Updated dependencies [061dcaf]
- Updated dependencies [5a362b0]
  - @prism-system/ui-core@3.0.0

Historical release notes are archived at
[`docs/archive/release-history/ui-system-a.md`](../../docs/archive/release-history/ui-system-a.md).

Record every user-visible change with Changesets (`pnpm changeset`). Versioning and
publishing remain explicit, human-controlled steps; no local command publishes a
package. The current contract and lifecycle are documented in
[`docs/v4/README.md`](../../docs/v4/README.md) and
[`docs/guide.md`](../../docs/guide.md).
