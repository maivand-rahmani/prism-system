---
name: use-design-system
description: Select, connect, and build product screens with a released Prism design-system package, composing from the selected exact version's public API and CSS with product-owned layout and behavior.
---

# Use a Design System

Use this skill for product UI work in a consumer repository with a released
`@prism-system` package: select or connect it when needed, then build screens, forms,
flows, and fixes from its public API. The package owns accessible component primitives
and their built-in behavior, component appearance, and reusable visual patterns; the
product owns semantic composition, labels, validation, data, routes, behavior, and
accessible use of those primitives. Work from the installed package alone — no
design-system monorepo, package source, or `tokens.source.json` is required. To change
the package itself, use the author-workspace `modify-design-system` skill; maintainer
commands such as `pnpm ds:create`, `ds:check`, and `ds:manifest` stay in the author
workspace and are not consumer tooling. To move this consumer to a different released
system, use the `switch-design-system` skill. For contract rules, read the local
[lifecycle reference](./references/lifecycle.md).

## Start from the task and the installed system

Identify the user's intended screen, task, or fix before choosing components. Then branch
on the consumer state:

1. **Selected package with current config** — read `.design-system/config.json` and the
   generated `.design-system/AGENTS.md` (plus the managed design-system block in the
   consumer root `AGENTS.md` when present), the installed public manifest
   (`<package>/manifest`), the package's shipped `AGENTS.md` and README, its public
   TypeScript exports/declarations, and the shipped usage document when the manifest
   declares `docs.usage`. These describe the exact installed release. The `.design-system`
   files are generated: read them, never hand-edit them, and re-run `connect` when the
   selected package or version changes.
2. **Package installed but unconnected or stale** — establish the selected package and
   exact version, then verify before coding. With the CLI, configure or update the
   connection explicitly. Without it, use the verified installed manifest, declarations,
   and docs; do not fabricate config or silently install tooling.
3. **No selected package** — resolve the choice with the user first. `search` and `info`
   are explicit network reads; installing or switching is a dependency mutation that
   requires the user's explicit intent.

Ask only unresolved choices that change the work: the target package/version, the
screen's data and behavior, and which CSS entry the product builds. Do not interview the
user about the whole system's appearance, and do not ask for monorepo sources. Ground
options in the actual installed capability, declarations, and docs. When config, manifest,
runtime exports, and docs conflict, fail closed: report the inconsistency and do not use
a conflicting capability.

Communicate in the user's language. When the environment exposes a structured question
tool, use it for genuine blocking choices; otherwise present concise options and allow the
user's own answer. Recommend a default only when a defensible technical choice exists. For subjective visual or product
preferences, offer the options and let the user choose rather than pushing a
recommendation.

The manifest is the authority for the installed component catalog, variants, sizes,
compound members, declared effects, token names, and CSS/documentation paths. Check that the
installed package, manifest, and config (when present) versions match exactly. Use documented exports
only. For whole-page or form composition, read the shipped usage document when the
installed manifest declares `docs.usage`; its examples must match that installed version.
Do not infer installed features or substitute examples from repository sources, another
system, or a newer manifest. Current shipped manifests are `schemaVersion: 5`
(`contractVersion: 4`); tools that only understand schema 4 or older cannot read them and
must be upgraded in lockstep with the package.

The commands below assume `prism-ds` is already available in the consumer (installed as
a dev dependency or on `node_modules/.bin`). `@prism-system/tools` is optional tooling,
not a requirement to consume a released package: when it is absent, ground the work in
the installed public manifest, declarations, and shipped docs, and use the consumer's
existing build/tests. Do not trigger a silent tooling download. If a CLI setup or
diagnostic is genuinely necessary — for example connecting or changing the selected
dependency — ask the user first; otherwise report the Prism CLI check as skipped instead
of blocking UI work on it.

```bash
npx prism-ds components --cwd <consumer-root>
npx prism-ds tokens --cwd <consumer-root>
npx prism-ds check --cwd <consumer-root> [--css <explicit-file>] [--entry <path-or-extension>]
npx prism-ds check-usage --cwd <consumer-root>
```

`check` is the primary offline health report and also runs strict usage validation; add
`--css <explicit-file>` in a Tailwind project to check import order, because the tool
never guesses which CSS file the product builds. Add `--entry <path-or-extension>` when
the product uses a declared extension or additional entrypoint: it validates that
selected entry's declared requirements offline (`doctor --entry` reports the same
prerequisites). Run standalone `check-usage` only when
usage validation is all you need — do not duplicate a completed `check`.

## Compose semantically

Import UI and CSS only through the package's public exports. Never copy components,
source, generated tokens, or CSS into the consumer; never import package internals; never
patch `node_modules`.

- Use `Heading` levels to reflect the page's heading hierarchy and `FormField` where its
  contract fits to associate labels, descriptions, and errors. Preserve accessible names
  for controls and links; keep validation and submission behavior in the product. Use the
  preserved control ref to focus the first invalid field when requested. Choose native
  validation or product-timed validation deliberately; with custom submit handling,
  `noValidate` prevents the browser from intercepting submission before the product
  displays its error.
- Use optional components only when the installed manifest declares them: support is the
  presence of the component name as a key in `manifest.components`. The manifest's
  `capabilities.categories` inventory maps names to composition/forms/data-display
  membership; it is not availability, and components outside those categories are still
  available by key. If a needed optional capability is absent, compose the same semantic
  result from available system primitives and layout utilities. For example, render a
  labeled feedback region without `Alert`, a list of links without `Breadcrumbs`, or a
  data table with native table semantics when `Table` is absent. Do not create a visually
  restyled local primitive, do not vendor a clone, and do not patch the installed
  package: report the missing capability as a package-evolution request instead.
- Use the design system for reusable appearance and states; use Tailwind/layout utilities
  for product-owned placement and responsive composition. Avoid arbitrary product colors,
  radii, shadows, or overrides of system components. Business logic, data fetching, and
  state ownership stay in the product.

## Use built-in effects and verify custom exports

A dimensional or animated Button is still the installed system's Button. Use its existing
public import and documented props; its appearance does not require a different component
name, special token setup, or direct control of a library-owned animation engine. Do not
invent `variant="3d"` or a `/spatial` import from a visual example. Effects declared in the
installed manifest (`features`, `rendering`, `reducedMotion`, `fallback`) describe the real
implementation; they never add props. For effects, motion
primitives, or an independent custom component, read the local
[visual effects and custom components reference](./references/visual-effects-and-custom-components.md).

Discover custom exports from the exact installed release: `manifest.extensions` declares a
custom export only when its entrypoint, docs, example, `apiVersion`, and public API are
real, and `prism-ds components [name]` lists it with its requirements and effects. Import
it only from its declared entrypoint. Install only its needed dependencies within existing
task authorization; a catalog read or `doctor` never installs them. A custom entry's
declared requirements are prerequisites of that entry, not of the standard root: verify
them offline with `prism-ds check --entry <name-or-path>` (or `doctor --entry`) before
use, and prefer the entry's documented loading, fallback, reduced-motion, and
client-boundary behavior over guessed props. A proposed architecture document is not
proof of installed support: trust only the installed manifest and shipped docs.

## Product-owned scenes and visual flexibility

The selected system owns the visual internals of its existing primitives; the consumer
composes their documented APIs. Within that boundary, a product may own independent,
product-specific scenes, visuals, and interactive custom displays — for example a
product's own animated illustration or data visualization — using general design or
3D/motion skills chosen for that product work, with explicit approval for any library
dependency.

- Use the system's public primitives and tokens where they apply; keep the scene's own
  appearance, data, and behavior in the product.
- Do not duplicate or restyle `Button`, `Input`, or any system primitive, fabricate a
  system component/variant/entrypoint, drive a primitive's private DOM, invent a second
  universal style source, or bypass the documented API.
- A missing reusable system primitive stays a package-evolution request: compose the
  semantic result from available primitives meanwhile, and do not ship a local clone.
- A selected external skill provides instructions and techniques only. It does not install
  Three.js, GSAP, or any other dependency and does not execute an effect by itself; adding
  a dependency needs explicit user approval, and approved product code still must not wrap
  or restyle system primitives or reach into their internals.

## Framework and setup paths

Keep to the installed system's public imports and CSS. These specialist paths are
expanded in the local [`consumer-workflows.md`](./references/consumer-workflows.md) — read
the matching section before acting:

- **Next.js App Router:** if a Server Component renders Card parts, use the flat exports
  `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter`, never
  `Card.Header`; the client-boundary rules are in
  [consumer-workflows.md § Next.js App Router](./references/consumer-workflows.md#nextjs-app-router-client-boundaries).
- **Tailwind v4:** only when the installed system ships a bridge, run setup against the
  explicitly chosen CSS file; the required order is Tailwind, the selected package
  bridge, then its ordinary styles. Command and checks:
  [consumer-workflows.md § Tailwind v4 setup](./references/consumer-workflows.md#tailwind-v4-setup).
  With ordinary CSS, import `<package>/styles.css` and skip Tailwind.
- **Install, connect, switch, or upgrade:** only on explicit user intent. For a move to a
  different system, use the `switch-design-system` skill and preview with
  `prism-ds switch --dry-run` before any `--yes`. Before an upgrade, preview the exact
  target with `--dry-run` and review its component, export, metadata, and token-name
  changes; the manifest has no token values, so it cannot reveal visual value changes.
  Details and post-upgrade rediscovery:
  [consumer-workflows.md § Install, connect, and upgrade](./references/consumer-workflows.md#install-connect-and-upgrade).

## Check and report

When `prism-ds` is available, run `prism-ds check --cwd <consumer-root>` once (with
`--css <explicit-file>` in a Tailwind project) and do not run a duplicate `check-usage`
after a completed `check`. If the CLI is absent and installing tooling for a diagnostic
is not agreed, report the Prism CLI check as skipped — never as passed.

Finish with a short summary: what was built or changed, the exact installed package and
version, the public imports used, each command actually run and its result, and what
remains unverified. `check`/`check-usage` are offline config/manifest/AST checks: they do
not prove runtime appearance, accessibility, responsive behavior, or semantic component
identity, and they do not scan arbitrary CSS outside their documented scope. Review
responsive, loading, error, empty, keyboard, focus, and reduced-motion states where the
change touches them, and never claim a command passed unless it ran.
