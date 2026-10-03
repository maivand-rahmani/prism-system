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
- [Switch systems and remove an unused package](#switch-systems-and-remove-an-unused-package)
  — when the product moves to a different released system or drops the previous package.
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

Dependency-mutating commands (`install`, `use`, `upgrade`, `switch`, `remove`) run only on
the user's explicit intent; never install, switch, upgrade, or remove a design system
silently. They resolve and validate an exact version from the registry first, detect
npm/pnpm from the consumer (missing or ambiguous managers fail closed, never a silent npm
default), and verify the installed package identity afterward. `install` stops at install
and verification — it does not write the consumer config, so run `connect` explicitly
afterward. `use` and `upgrade` reconnect the consumer after verifying (`use` can also run
the usage check and Tailwind setup). A completed package-manager mutation is not rolled
back automatically.

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
  additions/removals, changed variants/sizes/compound members and effects,
  custom-extension and entrypoint-requirement changes, public export targets,
  metadata, and token-name additions/removals. Names are compared as sets; the manifest
  has no token values, so the diff cannot reveal visual value changes — review package
  docs and rendered screens too. Only after the user has explicitly selected the upgrade,
  run the command for real, re-read the installed manifest, types, and docs, repair call
  sites using only the new public API, then run `check` once (with an explicit `--css`
  path for Tailwind import-order validation).
- **Using a declared system extension:** import it only from its entrypoint declared in
  `manifest.extensions`, never from the package root. Its requirements belong to that
  entry: select it explicitly with `--with-entry <name|entrypoint|consumer-file>` on
  `install`/`use`/`upgrade`, pass `--peer name@exact-version` for a missing peer with a
  non-exact declared range, and validate offline with `check --entry <...>` or
  `doctor --entry <...>`. A missing peer of an unused extension is not a product failure.
- **Discovery:** `search` and `info` are explicit network, read-only. Use them to ground
  options; they never write or install.

## Switch systems and remove an unused package

Changing the selected system is a dependency mutation with the same explicit-intent rule as
install/upgrade, and it works from the installed and target public manifests only — no
source checkout. The `switch-design-system` skill owns the full migration process.

- **Preview:** `npx prism-ds switch <target> [version] --cwd <consumer-root> --dry-run`
  resolves and validates the target release, compares the installed and target public
  manifests, and reports the plan without spawning a package manager or writing anything.
  Review component additions/removals, changed variants/sizes/compound members, extension
  and entrypoint-requirement changes, public export targets, and token-name
  additions/removals. Names are compared as sets; token values are absent from the
  manifest, so the diff cannot reveal visual value changes — review the target's docs and
  rendered screens too. Declared target extensions detected as literally imported are
  automatically included in peer planning (deduplicated by name; compatibility already
  proved the target declares the same name and entrypoint) and reported as auto-selected
  entries; only literally detected usage counts, so installed-but-unused extensions and
  arbitrary entry files are never selected. Scanner coverage is bounded to declared
  manifest metadata, literal import/require specifiers, and the explicit CSS file;
  dynamically composed imports, runtime lookups, and unnamed CSS files are not scanned.
- **Apply:** `npx prism-ds switch <target> [version] --cwd <consumer-root> --yes
[--css <file>] [--with-entry <value>] [--peer <name@version>]` only after the user has
  confirmed the reviewed target and resolved every reported blocker. Missing target
  support for an actively used component, variant, size, compound member, extension, or
  token name blocks the switch; dynamic or unsupported usage stays unverified, never
  compatible. Review the auto-selected entries and the required peer changes before
  approving. `--with-entry` explicitly adds entries beyond detected usage, and
  `--peer name@exact-version` resolves a missing peer with a non-exact declared range (a
  satisfying installed peer is retained, an exact declared range is installed at that
  exact version, and selected peers are verified against the declared ranges).
  `--with-entry`/`--peer` can extend or resolve the plan but never bypass a compatibility
  blocker. `--yes` authorizes the mutation; without it the command must not mutate.
  It performs only exact literal replacements it can determine — import specifiers, the
  explicit CSS file, and the consumer config — and never rewrites JSX, props, component
  usage, or product UI. The previous package dependency is preserved; do not remove it in
  the same step. A completed package-manager mutation is not rolled back automatically.
- **Repair:** re-read the installed target manifest, declarations, README, shipped
  `AGENTS.md`, and the shipped usage document when the manifest declares `docs.usage`;
  repair call sites using only the target public API, then run `check` once (with an
  explicit `--css` file in a Tailwind project).
- **Remove the previous package once unused:** `npx prism-ds remove [package] --cwd
<consumer-root> --dry-run` previews and `--yes` mutates. Remove only after no import,
  CSS import, config entry, or build reference needs the package; `remove` never edits
  product source. Removing the only selected system is a separate explicit dependency
  decision, not part of a switch.

`@prism-system/tools` is optional tooling, not a requirement to consume a released
package. Every command above assumes `prism-ds` is already available in the consumer;
without it, keep building from the installed public manifest, declarations, and docs, and
use the consumer's existing build/tests. Installing `@prism-system/tools` is an explicit
dependency change that needs the user's agreement; do not trigger silent downloads. If
the user declines, report the Prism CLI check as skipped, never as passed.

## Contract and version rules

- Use the exact installed release only: imports, docs, config, and manifest must describe
  the same package and exact version.
- Current shipped manifests are `schemaVersion: 5` with numeric `contractVersion: 4`;
  readers built for schema 4 or older must be upgraded in lockstep, and an older
  `prism-ds` cannot read a schema-5 manifest.
- Contract availability is only the presence of a key in `manifest.components`;
  custom extensions are available only as declared in `manifest.extensions`;
  `capabilities.categories` is canonical category membership, not availability.
- If the installed package, config, manifest, and declarations disagree, fail closed,
  report the inconsistency, and do not patch the package or assume the conflicting
  capability works.
