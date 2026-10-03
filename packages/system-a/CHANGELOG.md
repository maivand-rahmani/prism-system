# Changelog — @prism-system/ui-system-a

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

## 3.1.1

### Patch Changes

- 144aef9: Clarify the React Server Components boundary for compound Card parts: in a Next.js App Router Server Component, render `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter` from the package root instead of `Card.Header`, which stays available inside client components. The shipped README, AGENTS.md, and USAGE.md docs document the flat exports and a small `"use client"` wrapper alternative.

## 3.1.0

### Minor Changes

- 63c74ec: Publish the package root as a client entry: both the ESM and CJS bundles now open with a top-level `"use client"` directive, so a Next.js App Router Server Component can import and render the components as client references. The `./tokens` subpath stays server-safe in both formats.

## 3.0.0

### Major Changes

- fd0605b: Shipped `design-system.json` manifests are now `schemaVersion: 4` with the numeric
  `contractVersion: 4` and publish the full 29-required-component catalog. The
  package-owned `design-system.source.json` stays a repository-only `schemaVersion: 3`
  input and is never shipped or read from consumers.

  Readers built for schema 3 cannot consume schema-4 manifests, so this upgrade needs
  explicit lockstep coordination: publish `@prism-system/ui-core`, both systems, and
  `@prism-system/tools` in the same release, and upgrade `prism-ds` together with the
  installed system. An older `prism-ds` cannot read a schema-4 manifest, and the current
  tooling rejects schema 3.

### Patch Changes

- fd0605b: Preserve refs, handlers, and existing ARIA descriptions when composing FormField
  controls. Associate mounted help and error parts, keep default Control as a div
  wrapper, and apply invalid appearance from aria-invalid to Input and Textarea.
  Clarify the shared FormField contract, correct Stack metadata, and ship complete
  required-component composition examples with both systems.
- Updated dependencies [fd0605b]
- Updated dependencies [fd0605b]
  - @prism-system/ui-core@3.0.0

Historical release notes are archived at
[`docs/archive/release-history/ui-system-a.md`](../../docs/archive/release-history/ui-system-a.md).

Record every user-visible change with Changesets (`pnpm changeset`). Versioning and
publishing remain explicit, human-controlled steps; no local command publishes a
package. The current contract and lifecycle are documented in
[`docs/v4/README.md`](../../docs/v4/README.md) and
[`docs/guide.md`](../../docs/guide.md).
