---
name: switch-design-system
description: Switch a consumer repository from one installed Prism design-system package to another released system using only public manifests and the prism-ds switch/remove commands, reviewing capability, extension, export, and token-name changes before applying literal replacements.
---

# Switch Design Systems

Use this skill when a consumer repository with one selected `@prism-system` design-system
package must move to a different released package. This is consumer migration work, not a
fresh install, not an upgrade of the same package, and not package authoring:

- first install or connection belongs to the `use-design-system` skill;
- a newer exact version of the same package belongs to `upgrade` in
  [consumer workflows](./references/consumer-workflows.md#install-connect-and-upgrade);
- changing the package itself belongs to the author-workspace `modify-design-system`
  skill; maintainer `pnpm ds:*` commands stay in the author workspace and never move into
  consumer tooling.

Everything here works from the installed and target public manifests, declarations, and
shipped docs alone — no design-system monorepo, package source, or `tokens.source.json` is
required. Read [lifecycle guidance](./references/lifecycle.md) for the contract and
manifest invariants, and the
[visual effects and custom components reference](./references/visual-effects-and-custom-components.md)
when the review touches declared extensions or effects. Both installed and target
manifests must be the current shipped shape (`schemaVersion: 5`, numeric
`contractVersion: 4`); an older `prism-ds` or a schema-4 manifest fails closed, and there
are no retired contract aliases to bridge.

## Preview before any mutation

Switching is a dependency mutation and needs the user's explicit intent. Resolve the
target with the user (`search` and `info` are explicit network, read-only), then preview:

```bash
npx prism-ds switch <target> [version] --cwd <consumer-root> --dry-run
```

The dry run resolves and validates the exact target release from the registry, compares
the installed and target public manifests, and reports the plan without spawning a package
manager or writing anything. When `version` is omitted, the preview must report the exact
resolved version; the applied dependency is exact, never a floating tag.

Review every reported field before asking for approval:

- **Components added or removed.** Target availability is only the presence of a key in
  the target `manifest.components`; a name absent there does not exist in that release.
- **Blockers versus unverified.** Missing target support for an actively used component,
  variant, size, compound member, extension, or token name is a **blocker**; dynamic or
  otherwise unsupported usage is reported as **unverified**, never as compatible. Resolve
  blockers before applying the switch.
- **Changed variants, sizes, and compound members** on names both systems export. Compare
  against the product's actual call sites; the manifest is the authority, not memory of
  the previous system.
- **Extensions added or removed** and entrypoint requirement changes. A custom export is
  usable only from its declared target entrypoint, and only when the installed target
  release's `manifest.extensions` record is real; never infer one from a name or example.
- **Auto-selected entries and peer changes.** The bounded literal active-usage scan
  automatically includes every target extension it found imported in peer planning
  (deduplicated by name; compatibility has already proved the target declares the same
  name and entrypoint) and reports them as auto-selected entries. Review those entries and
  every planned peer action (retained or installed at an exact version) before approving.
  Only literally detected usage is selected: installed-but-unused extensions and arbitrary
  entry files are never auto-selected, and dynamic usage stays a blocker or unverified.
- **Public export target changes** that affect import paths or CSS subpaths.
- **Token names added or removed** per group. Names are compared as sets; the manifest has
  no token values, so the diff cannot reveal visual value changes — review the target's
  docs and rendered screens too.
- **Scanner coverage.** The review covers declared manifest metadata, literal
  import/require specifiers, and the explicit CSS file only. It does not see dynamically
  composed imports, runtime lookups, or CSS files it was not given. Grep and lint the
  product for the previous package name before treating the migration as complete.

If the target manifest cannot be validated, the installed and target versions do not match
their declarations, or the report conflicts with installed docs, fail closed: report the
inconsistency and do not switch.

Resolve reported compatibility blockers before applying the switch. Do not force past
missing APIs or unverified dynamic usage; `--with-entry`/`--peer` can extend or resolve
the entry/peer plan but never bypass a blocker, and the later checks are not permission
to leave known broken call sites in the migration plan.

## Apply the reviewed switch

Only after the user has explicitly confirmed the target and the reviewed plan:

```bash
npx prism-ds switch <target> [version] --cwd <consumer-root> --yes [--css <explicit-file>] [--with-entry <entry>] [--peer <name@exact-version>]
```

- `--yes` authorizes the dependency mutation. Without it the command must not mutate;
  `--dry-run` and `--yes` are separate preview and apply modes, never combined.
- Add `--css <explicit-file>` when the product builds a CSS file so exact literal
  package-name replacements in that one file are planned. The tool never guesses or scans
  for a CSS file; with ordinary CSS, pass the file explicitly.
- `--with-entry <extension|entrypoint|consumer-file>` explicitly adds a target entry
  beyond the auto-selected ones and plans its declared requirements; a missing peer with
  a non-exact range needs an explicit `--peer name@exact-version` that satisfies the
  declared range. Selected-entry peers use the same safe planner as
  `install`/`use`/`upgrade`: a satisfying installed peer is retained, an exact declared
  range is installed at that exact version, and installed peers are verified against the
  declared ranges. `--with-entry`/`--peer` can extend or resolve the plan but never bypass
  a reported compatibility blocker. Validate the selected entry offline with
  `check --entry` (or `doctor --entry`) afterward. A missing peer of an unused extension
  is not a product failure.
- The tool performs only exact literal replacements it can determine — import specifiers,
  the explicit CSS file, and the consumer config. It never rewrites JSX, props, component
  usage, or product UI, and it does not translate API calls between systems.
- The previous package dependency is preserved; it is not removed automatically. Do not
  remove it in the same step.
- A completed package-manager mutation is not rolled back automatically. If the switch
  fails after mutation, stop, report the actual installed state, and do not guess.

## Repair call sites from the target's public API

Re-read the installed target manifest, the package's shipped `AGENTS.md`, README, public
declarations, and the shipped usage document when the manifest declares `docs.usage`.
Then run the offline health report and repair only what the target actually provides:

```bash
npx prism-ds check --cwd <consumer-root> [--css <explicit-file>] [--entry <path-or-extension>]
```

- Replace removed or renamed components by composing the same semantics from target
  primitives and product layout; use an optional target component only when the target
  manifest declares it. A missing reusable primitive is a package-evolution request, not a
  reason to vendor a clone or restyle a local replacement.
- Use only the target's documented variants, sizes, compound members, and token names.
  Never fabricate a component, variant, or entrypoint, and never keep using the previous
  system's names as aliases.
- For a declared target extension, import it only from its entrypoint in
  `manifest.extensions`, verify the selected entry's requirements offline with
  `check --entry` (or `doctor --entry`), and install only what that entry actually
  requires with explicit user approval.
- Run `check` again after repairs; run `check-usage` separately only when usage validation
  is all that is needed.

## Remove the previous package once unused

After the target is connected and the product no longer imports, styles, or configures the
previous package, and only when the user explicitly wants that dependency gone:

```bash
npx prism-ds remove [package] --cwd <consumer-root> --dry-run
npx prism-ds remove [package] --cwd <consumer-root> --yes
```

`remove` previews the exact installed package and mutates dependencies only with `--yes`;
it never edits product source. Confirm no import, CSS import, config entry, or build
reference still needs the package (a product grep plus `check`/`check-usage`), and report
anything still referencing it instead of removing. Removing the only selected system is a
separate explicit dependency decision, not part of a switch.

## Check and report

Finish with a short summary: previous and target package with exact versions, the dry-run
fields reviewed, each command actually run and its result, the literal replacements
applied, call sites repaired and any left unresolved, scanner coverage limits, and what
remains unverified. A passing `check` does not prove runtime appearance, accessibility,
responsive behavior, or visual equivalence; review the affected screens against the
target system's documented appearance.

## Boundaries

- Work from public manifests and shipped docs only; never copy package source, patch
  `node_modules`, or import package internals.
- Never fabricate target components, variants, entrypoints, token names, or extension
  records, and never treat the previous system's behavior as the target's.
- There is one current contract and one shipped manifest shape; do not rely on retired
  contract versions, aliases, or schema-4 readers.
- Never install, switch, upgrade, or remove a design system silently; every mutation needs
  the user's explicit intent, and installing `@prism-system/tools` itself is an explicit
  dependency change that needs agreement.
