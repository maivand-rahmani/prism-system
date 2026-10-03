---
"@prism-system/tools": minor
---

Add five first-class lifecycle capabilities to `prism-ds` (seventeen root commands total):

- `switch <target> [version] --cwd <root>` — move a consumer to another exact system
  release. Previews manifest and actual-usage compatibility (components, variants, sizes,
  compound members, extensions, entrypoints, token names); missing target support for
  actively used APIs blocks the switch and dynamic usage stays unverified. Applies only
  reviewed literal module/CSS substitutions and managed integration changes, never
  rewrites product UI, and retains the previous dependency. `--css` must name the CSS file
  explicitly; `--with-entry`/`--peer` plan selected target entry requirements.
- `remove [package] --cwd <root>` — remove the selected system only when no active source
  or style references remain; removes the dependency plus unchanged attributable
  integration, preserves unrelated dependencies/peers/CSS/edited generated files, and
  mutates only with `--yes`.
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
