# Issue 17: CLI and TUI lifecycle plan

Status: implementation in progress on `feature/issue-17-cli-workflows`.

## Scope

Deliver five capabilities through shared CLI backends and the existing TUI:

1. Switch between design systems with usage-aware compatibility checks.
2. Remove an unused design system with attributable integration cleanup.
3. Manage official Prism skills and curated general-design skills.
4. Check for and explicitly install an update to the CLI itself.
5. Turn project-state failures into applicable recovery actions.

The work is isolated in a worktree based on committed `main`. Uncommitted issue-16
work remains in the original checkout. Reconcile their overlapping TUI changes
before any future integration; this plan does not authorize a merge or push.

## Shared operation contract

CLI and TUI use the same planners, validators and mutation functions. A preview
must describe the actual package-manager command, affected files, prerequisites,
blockers, warnings and coverage limits. Mutation requires explicit confirmation.
Dry-run never writes files or starts a mutating subprocess.

Validate contained paths, source revision and before-bytes before mutation, and
again before writing. Reject material drift rather than applying a stale preview.
Package-manager and filesystem changes are not one atomic transaction. Report
partial effects and recovery guidance; never promise automatic rollback of a
completed package-manager mutation.

## 1. Switch

Planned surface:

```text
prism-ds switch <target> [version] --cwd <root> [--css <file>] [--with-entry <entry>] [--peer <spec>] [--dry-run] [--yes]
```

- Discover the current system and resolve an exact, validated target release.
- Inspect actual imported components, entrypoints and extensions, and supported
  literal variant, size, compound-member and token references.
- Classify missing support as blockers. Expose dynamic and unsupported usage as
  unverified rather than declaring blanket compatibility.
- Preview only literal module/CSS import substitutions and managed integration
  changes. Do not rewrite component structure or props, restyle controls, or delete
  application source.
- Install and verify the target using fixed npm/pnpm arguments, then apply the
  reviewed source/integration changes and check the resulting state.
- Retain the previous dependency. Removal is a separate explicit operation.
- CSS changes require an explicitly named contained file. Never guess one.

Token names do not reveal token values. API compatibility does not establish
visual equality, rendering behavior, accessibility or runtime compatibility.

## 2. Remove

```text
prism-ds remove [package] --cwd <root> [--css <file>] [--dry-run] [--yes]
```

- Refuse removal while active source or style references remain.
- Preview removal of the selected dependency and unchanged, attributable
  integration files/managed blocks.
- Never delete or rewrite an import that cannot be attributed to the tool:
  `setup-tailwind` writes no ownership marker, so an exact package bridge
  `@import` in the named `--css` file blocks the plan (including `--dry-run`)
  with manual-cleanup guidance and zero mutations, and the CSS bytes are
  preserved.
- Preserve unrelated dependencies, peers, instructions and consumer CSS.
- Preserve edited generated files and explain any required manual cleanup.
- Do not delete product UI, whole configuration directories or arbitrary files.
- Verify the dependency and the planned owned integration are absent afterward;
  report any residual or partial state precisely.

## 3. Skills

```text
prism-ds skills list --cwd <root> [--global]
prism-ds skills add <id> --cwd <root> --agent <id> [--global] [--dry-run] [--yes]
prism-ds skills update <id> --cwd <root> --agent <id> [--global] [--dry-run] [--yes]
prism-ds skills remove <id> --cwd <root> --agent <id> [--global] [--dry-run] [--yes]
```

Skill type and installation scope are independent:

- **Prism:** use, create, modify and switch instructions, with consumer/author roles.
- **Design:** curated UI, UX, accessibility, component-composition, motion and 3D
  instructions. Technology names are tags, not additional lifecycle contracts.
- **Scope:** project or global, with explicit supported-agent selection.

The approved first-party remote source is `maivand-rahmani/prism-system`. Each
selected first-party skill must have portable, self-contained references. Runtime
consumers never read this checkout or import repository source.

Installation uses a pinned Skills CLI executable and a trusted catalog source
resolved to an immutable commit during explicit planning. Freeze that commit into
the confirmed operation. Inventory is offline and observes actual files in both
scopes, including installations made outside Prism; a lock entry alone does not
establish existence or integrity.

Never silently replace an existing skill. Updates require verified, unchanged
managed content; modified or unverifiable installations need manual preservation.
Report shared canonical placement rather than promising per-agent isolation that
the upstream installer cannot provide. Installing instructions does not execute
them or install Three.js, GSAP or any other product dependency.

`use` includes the consumer-use skill in its visible setup plan when an agent can
be explicitly selected or reliably identified. Provide an opt-out and actionable
guidance when agent selection or skill installation is unresolved. Do not guess a
provider or install all authoring skills.

Independent product-specific visuals may remain in the consumer. General-design
skills do not permit copying, restyling or manipulating private internals of system
primitives, inventing variants/entrypoints, or bypassing the installed public API.

## 4. CLI self-update

```text
prism-ds self-update [--check] [--cwd <root>] [--global] [--manager npm|pnpm] [--dry-run] [--yes]
```

Keep this separate from `upgrade`, which upgrades a design-system package.
Detect local, global, ephemeral and unknown invocation contexts. Use fixed exact
package-manager arguments only for an identified or explicitly selected supported
installation. Unknown/source/ephemeral contexts get accurate advice instead of a
guessed global update.

TUI startup may make a bounded, nonblocking, disableable read-only update check.
Never update automatically or prevent startup because the network is unavailable.
Declare this exception to the prior explicit-network policy in package/root docs.

## 5. Project recovery

```text
prism-ds recover --cwd <root> [--css <file>] [--entry <entry>]
prism-ds recover --cwd <root> --action <id> [--css <file>] [--dry-run] [--yes]
```

Diagnose first, then offer only actions valid for the observed state. Reuse existing
connect and Tailwind planners where applicable. Missing/malformed configuration,
multiple candidates, missing peers and schema mismatches need distinct guidance;
do not recommend an upgrade as a universal repair.

Preview a selected mutation, confirm it and recheck the targeted diagnosis.
Distinguish an action completing from the issue being repaired or the whole project
being healthy. Unknown errors remain manual, with their reason visible.

## Delivery and evidence

1. Parallel backend lanes: lifecycle/usage, skills, update/recovery; independent
   preparation makes Prism instructions portable.
2. One integration owner adds CLI routing/help/exports and use-skill integration;
   a disjoint lane updates policy declarations, consumer command guidance, packed
   gates and the pending changeset alongside the backend contract.
3. Backend tests and Oracle safety gate; local checkpoint commit after acceptance.
4. Designer owns TUI integration and interaction tests. Update final TUI-facing
   guidance against the delivered interactions without duplicating backend logic.
5. Final integrated evidence and Oracle gate, then a local checkpoint commit.

Evidence includes snapshot-based dry-run/no-consent/drift checks; compatible and
blocked migrations; attributable removal and partial-failure behavior; mocked skill
commands and offline inventory; update installation modes and timeout cases;
recovery applicability and unresolved postchecks; TUI confirmation/cancellation,
keyboard and small-terminal tests; and the required packed-artifact acceptance,
documentation, formatting, build, lint, typecheck and regression checks.

No test installs real user skills, updates the real global CLI, deletes product
source, publishes packages or consumes a pending changeset through local versioning.
