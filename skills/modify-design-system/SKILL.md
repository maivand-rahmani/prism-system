# Skill: Modify a Design System

Agent-neutral instructions for safely evolving an existing `@prism-system` design
system. Any compatible external coding agent can follow this document. It uses only
Markdown, repository files, and repository scripts — no model APIs, SDKs, MCP servers,
hosted agents, or agent-specific tool syntax.

This skill is the evolution side of the lifecycle. To create a new system use
[`../create-design-system/SKILL.md`](../create-design-system/SKILL.md); to consume an
installed system in a product use
[`../use-design-system/SKILL.md`](../use-design-system/SKILL.md). Do not duplicate their
content here.

## When to use this skill

Use this skill when an existing design system must change, for example:

> Add a SegmentedControl to System A.

> The buttons need a clearer destructive state.

The goal: new work should look as if it had always been part of this system. Never build
a mini design system inside one component.

**This repository contains no AI runtime.** The user runs their own coding agent; this
skill is the process that agent follows.

This skill operates on the design-systems source repository: it edits `packages/<id>`,
updates the generated manifest, and prepares a Changeset. It is **maintainer-only**.
External products that merely consume a released package never need this repository; they
use the published `@prism-system/tools` package (`prism-ds connect`, `prism-ds
check-usage`, `prism-ds doctor`) and the installed package's `AGENTS.md`/manifest.

## 1. Read before you write

Always inspect the existing system first. Do not invent a new visual language.

1. `packages/<id>/design-brief.json` — the confirmed visual contract.
2. `packages/<id>/AGENTS.md` — package rules, consumer contract, and restrictions.
3. `packages/<id>/src/tokens` — colors, typography, spacing, radius, borders, shadows,
   motion.
4. `packages/<id>/src/styles` — surfaces, states, and composition rules.
5. `packages/<id>/src/components` — existing components, variants, and states.
6. `packages/<id>/design-system.source.json` and the shipped
   `packages/<id>/design-system.json` — the declared public API.

Reuse the existing tokens, class prefix, spacing rhythm, radius, states, and motion.
A new component must continue the existing hierarchy and composition patterns.

## 2. Non-negotiables

- **Preserve the public V2 API.** The fourteen required components, their compound
  statics, and their documented props must stay intact:
  `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`, `Switch`,
  `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`. Never rename,
  remove, or alter a required export. V2 is the only supported contract.
- **Visual work belongs to the design system package.** Implement colors, typography,
  spacing, radius, borders, shadows, surfaces, variants, states, and motion only inside
  `packages/<id>`.
- **Core stays unstyled.** Never add visual decisions to `@prism-system/ui-core`.
- **No cross-system imports.** A system never imports another system; use only
  `@prism-system/ui-core`, React, and the package's own modules.
- **Additions are additive.** Optional components are package-local and must not reduce
  or substitute the required set.
- **Apps compose only.** Never edit Showcase or Reference App to restyle a system or work
  around a package gap.

## 3. Workflow

### Step 1 — Inspect the existing system

Read the design brief, tokens, styles, existing components, and the declared manifest
API (see section 1). Identify the closest existing pattern to extend or reuse.

### Step 2 — Implement the change (package only)

- Edit only files inside `packages/<id>`.
- Prefer an existing `@prism-system/ui-core` contract, primitive, `cn`, and `cva`
  before writing a new primitive.
- Preserve compound static members such as `Card.Header`, `Tabs.List`,
  `Dialog.Content`, and `DropdownMenu.Item`.
- Keep selectors scoped under the package's CSS class prefix.
- If you add a component, add it as a separate package-local module under
  `src/components` and export it additively.

### Step 3 — Declare the public API

Update `packages/<id>/design-system.source.json` with the new component's variants,
sizes, and compound members, then regenerate and check the manifest:

```bash
pnpm ds:manifest <id> --write
pnpm ds:manifest <id>
```

Do not hand-edit the generated `design-system.json`.

### Step 4 — Show the change

Add or update the component's examples in Showcase so it is visible in isolation.
Showcase and Reference App integration is manifest-driven; `pnpm ds:register <id>`
projects the manifest automatically. Never edit the apps by hand to make a system look
right. If Reference App composition is relevant to the change, verify the same interface
there.

### Step 5 — Update documentation

Update `packages/<id>/README.md` and `packages/<id>/AGENTS.md` when the change affects
the public API, variants, usage, or restrictions. Keep the consumer contract accurate;
do not duplicate the root contract.

### Step 6 — Validate

```bash
pnpm ds:check <id>
pnpm ds:sync-versions <id> --check
```

`pnpm ds:check <id>` is the required full validation: package structure, naming, exports,
the required components, tokens/theme, boundaries, the design brief, documentation,
Showcase / Reference App integration, and the package/app scripts (`--no-commands` skips
the script runs). It never mutates the package. Then run the package build, lint, and
typecheck (they run as part of `ds:check` unless skipped), and verify usage/visuals where
relevant:

- if the change affects a consuming product, run
  `pnpm ds:check-usage --cwd <consumer-root>` against a configured consumer;
- review the change in Showcase and, where relevant, Reference App.

### Step 7 — Record a Changeset

```bash
pnpm changeset
```

Describe the change and the appropriate bump. Breaking API or visual-language changes
must be recorded honestly. Do not version or publish from here.

### Step 8 — Stop at the human-controlled steps

Versioning and publishing are explicit human decisions and are never implicit:

```bash
pnpm version-packages   # human
pnpm ds:sync-versions   # align runtime/manifest/registry to package.json.version
pnpm build              # human
pnpm release            # human; runs the sync check, then build and publish
```

`pnpm ds:release <id> --approved` prepares a release (validate, sync, build, pack,
Changeset) and never versions or publishes. Stop there and hand back to the human.

## Stop / finish checklist

- [ ] The design brief, tokens, styles, existing components, and declared API were read.
- [ ] The fourteen required components and their compound statics are unchanged.
- [ ] All visual work is inside `packages/<id>`; core and apps were not edited.
- [ ] No cross-system import was introduced.
- [ ] `design-system.source.json` was updated and `pnpm ds:manifest <id> --write` run.
- [ ] Showcase examples were added or updated; Reference App verified where relevant.
- [ ] `packages/<id>/README.md` and `AGENTS.md` reflect the change.
- [ ] `pnpm ds:check <id>` passed and was reported honestly.
- [ ] Usage/visual verification was run where relevant.
- [ ] A Changeset was added.
- [ ] Versioning and publishing were left to the human; nothing was published.

## Common failure modes

- **Reinventing the language.** New components must continue the existing tokens,
  spacing, radius, states, and motion.
- **Breaking the contract.** Never rename, remove, or alter a required component or its
  compound statics.
- **Styling outside the package.** Visual work in core, an app, or a consumer product is
  wrong; fix the package.
- **Hand-editing the generated manifest.** Update the source descriptor and regenerate.
- **Editing apps to compensate.** If Showcase or Reference App needs overrides, the
  system is incomplete.
- **Implicit release.** Never run versioning or publishing as part of a modification.
- **Over-claiming.** Do not report `ds:check`, usage checks, or release preparation as
  passing unless the commands actually ran.
