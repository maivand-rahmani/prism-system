# Changelog — @prism-system/tools

## 5.2.0

### Minor Changes

- 1e3b1c5: Add fourteen optional component contracts and their Plan Like Rahmani implementations:
  Popover, AlertDialog, ToggleGroup, Toolbar, TagGroup, ListBox, TreeView, TimeField,
  SearchField, CheckboxGroup, RangeSlider, DateRangePicker, Spinner, and FileDropzone.
  The twenty-nine required components and optional omission semantics are unchanged.

  Update `prism-ds` to recognize the expanded catalog and improve narrow-terminal
  confirmation, project details, and large-catalog navigation. Older `prism-ds` versions
  reject manifests containing the new component names; upgrade the CLI before installing
  or upgrading to a design system that declares them.

## 5.1.0

### Minor Changes

- 0938ef8: Add the shared fifty-icon Prism catalog. Core now exports the canonical
  `ICON_NAMES`, `ICON_CATEGORIES`, `IconName`, `IconProps`, and `IconComponent`
  contract without any SVG, colors, or Lucide dependency. `@prism-system/ui-system-plr`
  ships all fifty icons from its `./icons` entrypoint, inherits the system's ink and
  themes, and validates its declaration against the real source and build exports.
  The template now generates the same fifty-icon entrypoint, and `prism-ds` gains an
  offline `icons [name] --cwd <root> [--json]` catalog plus icon-aware check-usage,
  switch, check, and doctor behavior. The shipped manifest stays schema 5: icon
  availability is the real `publicApi["./icons"]` list, so released readers continue
  to accept the manifest and simply do not expose the new catalog command.

### Patch Changes

- 530ae84: Support dependency updates and local CLI self-updates at pnpm workspace roots, and
  verify the current installed package after pnpm replaces its link. Align Radix overlay
  dependencies so nested dialogs and selects share the same dismissal layer in supported
  installations. Give PLR icon buttons a 3rem minimum target in both dimensions and prevent
  them from shrinking in flex layouts.

## 5.0.0

### Major Changes

- cef4932: Make the consumer `package.json` the primary source of design-system configuration.

  `prism-ds connect` now writes a `"designSystem"` field in the root `package.json` and one
  managed section in the root `AGENTS.md`. It no longer creates `.design-system/config.json`
  or `.design-system/AGENTS.md`, and it no longer creates the `.design-system/` directory at
  all. The directory stays optional and is reserved for tool-managed state that does not
  belong in `package.json` (currently `skills.json`) and for future configuration that
  genuinely outgrows the field.

  The field is:

  ```json
  "designSystem": {
    "schemaVersion": 1,
    "package": "@prism-system/ui-system-a",
    "version": "1.2.3",
    "strict": true
  }
  ```

  `version` is optional when hand-written (`connect` always records the exact verified
  version) and `ignore` remains an optional root-relative glob list. `$schema` and `manifest`
  are gone from the written configuration: the manifest subpath is a fixed public contract,
  not consumer configuration.

  The root `AGENTS.md` managed section now carries the full instruction set that used to be
  split across `.design-system/AGENTS.md`, so no separate generated instructions file is
  needed. It is still delimited by `<!-- BEGIN @prism-system design system contract (managed) -->`
  and `<!-- END ... -->`, still replaces itself in place instead of appending duplicates, and
  still never modifies content outside the markers.

  Existing installations migrate on the next `prism-ds connect` (directly, or through `use`,
  `upgrade`, `switch`, or `recover --action`): the legacy `.design-system/config.json` is moved
  into `package.json`, the generated `.design-system/AGENTS.md` is retired, and the directory
  is removed only once it is empty. A legacy configuration keeps working read-only until then,
  and a legacy config that names a different package than the `package.json` field fails
  closed instead of silently picking one.

  `remove` now strips the `designSystem` field only when it is unchanged from the generated
  configuration, and still deletes legacy files only when they are byte-identical to what an
  older `connect` wrote.

  ## New `prism-ds config` command

  `prism-ds config [package-json|design-system] --cwd <root> [--check] [--dry-run] [--json]`
  shows or moves where a consumer stores its configuration:

  - `config` with no argument reports the active location (read-only).
  - `config package-json` moves the configuration into `package.json#designSystem`.
  - `config design-system` moves it into `.design-system/config.json` in an extended layout
    that wraps the _identical_ subtree:

    ```json
    { "designSystem": { "schemaVersion": 1, "package": "…", "version": "…", "strict": true } }
    ```

    The `package.json` field is removed, so there is exactly one configuration.

  Both locations are equally supported; only the location changes. The extended file
  describes itself, so a consumer can never hold two competing configurations, and the
  pre-package.json root-level layout stays unambiguous and auto-migratable. Moving never
  installs packages, never edits dependencies, and never changes the selected package or
  version; moving back restores the exact prior `package.json` bytes and retires the emptied
  directory.

  `connect` now keeps whichever location is already active, so it never migrates a deliberate
  `.design-system/config.json` back into `package.json`, while still auto-migrating a legacy
  root-level file. `config --check` reports whether the target location is active (exit 1 when
  a move is pending); `--dry-run` writes nothing.

## 4.1.1

### Patch Changes

- 598b2da: List every published `@prism-system/ui-*` package when `prism-ds search` is run without a
  query. The new scope-index path enumerates npm's replication `_all_docs` key range and
  reads each package's latest packument, so a newly published design system appears
  immediately instead of waiting for the ranked search index. A one-token package name or
  system id also resolves directly, so an exact query finds a newly published package even
  when ranked search does not. When the scope index is unavailable, the command falls back
  to ranked search and reports the incomplete source.

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
