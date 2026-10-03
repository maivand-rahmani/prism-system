# Changelog — @prism-system/tools

## 4.1.0

### Minor Changes

- e4eac28: Add five first-class lifecycle capabilities to `prism-ds` (seventeen root commands total):

  - `switch <target> [version] --cwd <root>` — move a consumer to another exact system
    release. Previews manifest and actual-usage compatibility (components, variants, sizes,
    compound members, extensions, entrypoints, token names); missing target support for
    actively used APIs blocks the switch and dynamic usage stays unverified. Applies only
    reviewed literal module/CSS substitutions and managed integration changes, never
    rewrites product UI, and retains the previous dependency. `--css` must name the CSS file
    explicitly; `--with-entry`/`--peer` plan selected target entry requirements.
  - `remove [package] --cwd <root>` — remove the selected system only when no active source
    imports or token references remain; an explicit `--css` file is additionally checked for
    unmarked package bridge imports (which fail the plan closed), while without `--css` no
    CSS is inspected and the plan reports a `css-not-inspected` warning. Removes the
    dependency plus unchanged attributable integration, preserves unrelated
    dependencies/peers/CSS/edited generated files, and mutates only with `--yes`.
  - `skills list/add/update/remove` — manage official Prism and curated general-design
    instructions. `list` is an offline inventory of actual files in both scopes (no invented
    statistics, shared placement reported); add/update/remove require an explicit
    scope/agent and confirmation, may bootstrap the pinned `npx skills@1.7.0`, never
    silently replace local modifications, and install instructions only (no execution and no
    Three.js/GSAP/product dependencies).
  - `self-update [--check] [--dry-run] [--yes]` — check for or explicitly install a newer
    CLI, separate from design-system `upgrade`. Detects local/global/ephemeral/source/
    unknown contexts; unknown contexts get advice, not a guessed global mutation. TUI
    startup may run one bounded, nonblocking, read-only update check, disableable with
    `PRISM_DS_UPDATE_CHECK=0`; no automatic mutation or consumer writes.
  - `recover --cwd <root> [--action <id>] [--dry-run] [--yes]` — turn project-state
    diagnostics into applicable offline advice, reusing the existing connect/Tailwind
    planners only for an explicitly selected action. No guessed CSS or version; a completed
    action is not reported as a repaired or healthy project.

  No new runtime dependencies; TypeScript stays lazily loaded for scanner-backed
  operations. Existing commands, boundaries, and the current `schemaVersion: 5` /
  `contractVersion: 4` manifest contract are unchanged.

### Patch Changes

- 6e65a94: Improve TUI navigation, terminal-size handling, and change previews.

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
