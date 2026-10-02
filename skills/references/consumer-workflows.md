# Consumer workflows reference

Companion to [`use-design-system`](../use-design-system/SKILL.md). Read only the section
that matches the task. Everything here works from the installed package and its public
subpaths; no design-system monorepo, package source, or `tokens.source.json` is required.

- [Next.js App Router client boundaries](#nextjs-app-router-client-boundaries) — when the
  product is a Next.js App Router app rendering design-system components.
- [Tailwind v4 setup](#tailwind-v4-setup) — when the product uses Tailwind v4 and the
  installed system ships a bridge.
- [Install, connect, and upgrade](#install-connect-and-upgrade) — when the selected
  package is missing, unconfigured, or being changed.
- [Contract and version rules](#contract-and-version-rules) — the fail-closed invariants
  behind every path above.

## Next.js App Router client boundaries

The published root is a client entry. A Server Component receives each import as an
opaque client reference that exposes the export but not static compound members. A Server
Component may still import and render the named client components themselves, but it
renders Card parts through the flat exports `CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, and `CardFooter`, never `Card.Header`. Compound statics work inside client
components; when a Server Component wants compound syntax, extract a small `"use client"`
wrapper that composes the parts and render that wrapper from the server tree.

This is a framework-boundary rule, not a styling decision: keep product state, effects,
and event handlers in client components, and import design-system components from the
public entrypoints in both server and client code.

## Tailwind v4 setup

Only a system that ships a Tailwind bridge needs this. The required order is Tailwind,
the selected package bridge, then its ordinary styles (example package name shown;
substitute the installed one):

```css
@import "tailwindcss";
@import "@prism-system/ui-system-a/tailwind.css";
@import "@prism-system/ui-system-a/styles.css";
```

Run setup against the explicitly named CSS file the product builds:

```bash
npx prism-ds setup-tailwind --cwd <consumer-root> --css <file>
```

The command verifies the installed Tailwind v4 and the bridge, edits only that named file,
preserves every other line, fails closed on a second design-system bridge, and is
idempotent. `--check` is a read-only pass/fail gate; `--dry-run` previews without
writing. It never installs Tailwind or the design system and never edits dependencies.
With ordinary CSS, import `<package>/styles.css` and skip Tailwind entirely. Use one
selected system bridge per build; Tailwind can still handle product layout independently.

## Install, connect, and upgrade

Dependency-mutating commands (`install`, `use`, `upgrade`) run only on the user's explicit
intent; never install, switch, or upgrade a design system silently. They resolve and
validate an exact version from the registry first, detect npm/pnpm from the consumer
(missing or ambiguous managers fail closed, never a silent npm default), and verify the
installed package identity afterward. `install` stops at install and verification — it
does not write the consumer config, so run `connect` explicitly afterward. `use` and
`upgrade` reconnect the consumer after verifying (`use` can also run the usage check and
Tailwind setup). A completed package-manager mutation is not rolled back automatically.

- **Package installed but no config yet:** `npx prism-ds connect [package] --cwd
<consumer-root>` writes only `.design-system/config.json`, `.design-system/AGENTS.md`,
  and a managed block in the consumer root `AGENTS.md`. It never installs packages or
  edits dependencies. `--check` validates; `--dry-run` previews. Read both generated
  files before implementing UI; do not hand-edit them, and re-run `connect` when the
  selected package or version changes. The managed block preserves the consumer's own
  AGENTS content outside it.
- **Installing without connecting:** `npx prism-ds install <package> [version] --cwd
<consumer-root>` mutates dependencies and verifies the installed identity, but does not
  write the consumer config. Run `connect` separately (or use `use`).
- **Selecting or installing a package:** `npx prism-ds use <package> [version] --cwd
<consumer-root>` resolves, installs, verifies, connects, and optionally checks usage and
  configures Tailwind. The target is always explicit; the package is never discovered
  automatically.
- **Upgrading:** `npx prism-ds upgrade <package> <exact-version> --cwd <consumer-root>`.
  Always preview first with `--dry-run` and review the reported component
  additions/removals, changed variants/sizes/compound members, public export targets,
  metadata, and token-name additions/removals. Names are compared as sets; the manifest
  has no token values, so the diff cannot reveal visual value changes — review package
  docs and rendered screens too. Only after the user has explicitly selected the upgrade,
  run the command for real, re-read the installed manifest, types, and docs, repair call
  sites using only the new public API, then run `check` once (with an explicit `--css`
  path for Tailwind import-order validation).
- **Discovery:** `search` and `info` are explicit network, read-only. Use them to ground
  options; they never write or install.

`@prism-system/tools` is optional tooling, not a requirement to consume a released
package. Every command above assumes `prism-ds` is already available in the consumer;
without it, keep building from the installed public manifest, declarations, and docs, and
use the consumer's existing build/tests. Installing `@prism-system/tools` is an explicit
dependency change that needs the user's agreement; do not trigger silent downloads. If
the user declines, report the Prism CLI check as skipped, never as passed.

## Contract and version rules

- Use the exact installed release only: imports, docs, config, and manifest must describe
  the same package and exact version.
- Current shipped manifests are `schemaVersion: 4` with numeric `contractVersion: 4`;
  readers built for schema 3 must be upgraded in lockstep, and an older `prism-ds` cannot
  read a schema-4 manifest.
- Availability is only the presence of a key in `manifest.components`;
  `capabilities.categories` is canonical category membership, not availability.
- If the installed package, config, manifest, and declarations disagree, fail closed,
  report the inconsistency, and do not patch the package or assume the conflicting
  capability works.
