---
name: use-design-system
description: Build product interfaces with an installed Prism design system and its published API.
---

# Use a Design System

Use this skill when writing product UI with an installed `@prism-system` package. The
product owns data, behavior, routes, and page composition; the package owns component
appearance and reusable visual patterns. This works from the installed package alone:
the consumer does not need the design-system monorepo, package source, or
`tokens.source.json`.

For contract rules and the V2/V4 CSS distinction, read
[V4 lifecycle guidance](../references/v4-lifecycle.md). To create or evolve a package,
use [`create-design-system`](../create-design-system/SKILL.md) or
[`modify-design-system`](../modify-design-system/SKILL.md).

## Discover the exact installed system

Use config-first discovery:

1. Read `.design-system/config.json` for the selected package and exact version.
2. Read the installed package's public manifest subpath, normally
   `<package>/manifest` (for example `@prism-system/ui-system-a/manifest`).
3. Read the package's shipped `AGENTS.md` and README, then inspect its public TypeScript
   exports and declarations. Use documented exports only.

For whole-page or form composition, read the shipped usage document when the installed
manifest declares `docs.usage`. Its examples must match that installed version; do not
substitute examples from a newer source checkout.

The manifest is the authority for the shipped component catalog, variants, sizes,
compound members, usage rules, token names, and CSS/documentation paths. Check that the
installed package, config, and manifest versions match exactly. Do not infer installed
features from repository sources, another system, or a newer manifest. When config is
absent or stale, configure/update explicitly with `prism-ds use` or `prism-ds connect`
and validate before coding.

For either installed contract, use the offline component catalog as needed:

```bash
npx prism-ds components --cwd <consumer-root>
npx prism-ds tokens --cwd <consumer-root>
```

`tokens` is the V4 token-name catalog and is unsupported for V2. For diagnostics, choose
the package/config check (which also runs strict usage validation) or the standalone
usage check when that is all that is needed:

```bash
npx prism-ds check --cwd <consumer-root> [--css <explicit-file>]
npx prism-ds check-usage --cwd <consumer-root>
```

To discover published choices, `search` and `info` are explicit network reads. Install
or switch only through an explicit `install` or `use` command. Preview an exact target
with `prism-ds upgrade <package> <exact-version> --cwd <consumer-root> --dry-run`; review
the reported component, public export, metadata, and token-name changes. Token values
are not in the manifest, so this diff cannot reveal actual visual-value changes. Only
after the user has explicitly selected the upgrade, run the command without
`--dry-run`, then refresh config and re-read the installed manifest, types, and docs.
Upgrade never publishes packages.

Treat the preview as an API/capability migration diagnostic: compare required and
optional component availability, changed variants/sizes/compound members, public exports,
metadata, and removed/added token names against the product's actual imports and usage.
The manifest does not contain token values, so review package documentation and rendered
screens for visual changes as well. After upgrading, rediscover the selected version and
manifest; repair call sites using only the new public API, then run `check` once (with an
explicit `--css` path for V4 Tailwind import-order validation).

## Compose semantically

Import UI and CSS only through the package's public exports. Never copy components,
source, generated tokens, or CSS into the consumer; never import package internals.
Compose the product interface using real HTML semantics and the installed contract:

- **V4:** use `Heading` levels to reflect the page's heading hierarchy and `FormField`
  where its contract fits to associate labels, descriptions, and errors. Preserve
  accessible names for controls and links; keep validation and submission behavior in
  the product. Use the preserved control ref to focus the first invalid field when
  requested. Choose native validation or product-timed validation deliberately; with
  custom submit handling, `noValidate` prevents the browser from intercepting submission
  before the product displays its error.
- **V2:** its contract does not include `Heading` or `FormField`. Use semantic native
  headings and labels/fieldset/description associations composed with the installed V2
  controls, guided by their shipped types and docs. Do not assume newer props or exports.
- Use optional components only when the installed manifest declares them. If a needed
  optional capability is absent, compose the same semantic result from available system
  primitives and layout utilities. For example, render a labeled feedback region without
  `Alert`, a list of links without `Breadcrumbs`, or a data table with native table
  semantics when `Table` is absent. Do not create a visually restyled local primitive.
- Use the design system for reusable appearance and states; use Tailwind/layout utilities
  for product-owned placement and responsive composition. Avoid arbitrary product colors,
  radii, shadows, or overrides of system components.

For either contract with ordinary CSS, import `<package>/styles.css`. The Tailwind bridge
workflow applies only when the installed manifest identifies V4. For V4 and Tailwind v4,
run setup against the explicitly chosen CSS file:

```bash
npx prism-ds setup-tailwind --cwd <consumer-root> --css <file>
```

For V4, the required Tailwind order is Tailwind, the selected package bridge, then its
ordinary styles:

```css
@import "tailwindcss";
@import "@prism-system/ui-system-a/tailwind.css";
@import "@prism-system/ui-system-a/styles.css";
```

Use one selected V4 system bridge per build. The setup command checks/maintains these
imports in the explicitly named file; it does not install Tailwind or edit other files.
V2 packages keep their existing manifest and stylesheet behavior and do not provide a
V4 bridge or V4 token catalog. Tailwind can still handle product layout independently;
do not require a Prism bridge for V2.

## Check and report

Run `npx prism-ds check --cwd <consumer-root>` for package/config diagnostics; it also
runs strict usage validation. For a V4 Tailwind project, run
`npx prism-ds check --cwd <consumer-root> --css <explicit-file>` when checking import
order, because the tool does not guess which CSS file the product builds. `--css`
requires an explicit CSS file path.
Do not run a duplicate `check-usage` after a completed `check`. Neither command proves
semantic component identity or scans arbitrary CSS outside its documented TS/TSX AST
scope. Do not claim a command passed unless it ran. Review responsive, loading, error,
and empty states where the change touches them. Keep a missing reusable capability as a
design-system request rather than pretending it is present in the installed package.
