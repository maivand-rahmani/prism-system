# Skill: Use a Design System

Agent-neutral instructions for consuming an installed `@prism-system` design system
inside a real product repository. Any compatible external coding agent can follow this
document. It uses only Markdown, repository files, and repository scripts — no model
APIs, SDKs, MCP servers, hosted agents, or agent-specific tool syntax.

This skill is the consumer side of the lifecycle. To create a new system use
[`../create-design-system/SKILL.md`](../create-design-system/SKILL.md); to change an
existing system use [`../modify-design-system/SKILL.md`](../modify-design-system/SKILL.md).
Do not duplicate their content here.

## When to use this skill

Use this skill whenever you write product UI that should use an already-installed design
system, for example:

> Add a settings page to this product using our design system.

The product consumes the visual language. The design system owns it. Your job is to
build the product inside that contract, not to invent styling.

**This repository contains no AI runtime.** The user runs their own coding agent; this
skill is the process that agent follows.

## 1. Discover the design system (config first)

Determine the installed design system and its exact version before writing any UI.
Follow this order; do not guess.

1. `.design-system/config.json` — the consumer contract written by `pnpm ds:connect`.
   It records the selected `package`, the exact `version`, the `manifest` subpath
   (`./manifest`), and `strict` mode.
2. The shipped manifest, resolved through the public export
   (`<package>/manifest`, for example `@prism-system/ui-system-a/manifest`). It lists
   the component catalog, variants, sizes, compound members, and usage rules.
3. `<package>/AGENTS.md` (in `node_modules`) — the package consumer contract and
   restrictions.
4. `<package>/README.md` — installation, setup, and usage.
5. The public TypeScript API exported by `<package>`.

If `.design-system/config.json` is missing, configure the consumer with the published
consumer tool, then validate:

```bash
npx prism-ds connect --cwd <consumer-root>
npx prism-ds check-usage --cwd <consumer-root>
```

Install it from npm like any other dependency (`npm install --save-dev @prism-system/tools`)
next to the design system (`npm install @prism-system/ui-system-a`). The published tool
never installs packages and needs no access to the design-systems repository. Inside the
design-systems repository the same implementation is available as `pnpm ds:connect` and
`pnpm ds:check-usage`; those are maintainer wrappers. `connect` is configure-only: it
never installs packages, edits `package.json`, copies component source, or mutates the
design-system repository.

## 2. Be exact about the version

`package.json.version` is authoritative. The installed package version, the shipped
manifest version, and the consumer config version must match exactly. Never assume a
component, prop, variant, or compound member exists because it is present in a newer
release — read the installed manifest and the installed package's public API.

When the product updates the package, re-run discovery and validation:

```bash
npx prism-ds connect --cwd <consumer-root>
npx prism-ds check-usage --cwd <consumer-root>
```

## 3. Use existing primitives through the public API

- Import components from the package root, tokens from `<package>/tokens`, the
  stylesheet from `<package>/styles.css`, and the manifest from `<package>/manifest`.
- Never import package internals, source files, or paths that are not in the package's
  public `exports`.
- Never copy package source, CSS, or tokens into the product. The installed package is
  the single source of truth.
- Compose with props. Do not restyle components with class overrides, inline visual
  styles, or duplicated CSS.

```tsx
// Correct: compose the design system.
import { Button, Card, Input } from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";

export function SaveCard() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Save changes</Card.Title>
      </Card.Header>
      <Card.Content>
        <Input label="Name" />
        <Button variant="primary">Save</Button>
      </Card.Content>
    </Card>
  );
}
```

```tsx
// Wrong: override the visual language.
<Button className="rounded-full bg-[#356AFF] shadow-[0_8px_30px_rgba(0,0,0,0.2)]">Save</Button>
```

## 4. Respect product vs design-system ownership

The product owns:

```text
business logic, data, routing, feature state, page composition,
product-specific behavior, application layout
```

The design system owns:

```text
colors, typography, spacing, radius, borders, surfaces, shadows,
component states, variants, motion, reusable visual patterns
```

Layout is allowed in the product: `grid`, `flex`, `gap`, spacing, sizing, positioning,
responsive rules, alignment, and page composition. Visual language changes are not.

## 5. Run strict usage checks

`npx prism-ds check-usage --cwd <consumer-root>` validates the product against the design
system deterministically, using the TypeScript AST and the manifest rules:

- arbitrary colors, radii, and shadows in class tokens (including variant prefixes);
- static and unverifiable inline visual style overrides;
- obvious local primitive replacements;
- files under `node_modules`, generated output, declarations, and configured ignores
  are skipped.

In strict mode, findings are errors and the command exits non-zero. In non-strict mode
they are warnings and it exits zero. A clean run exits zero. Fix findings by using the
design system's API; do not silence them by editing package source.

## 6. Decide: local component or design-system change?

When the existing UI is not enough, work through this order:

```text
Need new UI
   ↓
Does the design system already provide it (check the manifest and public API)?
   ↓ yes → use it
   ↓ no
Is it business- or feature-specific?
   ↓ yes → keep it in the product, composed from design-system primitives
   ↓ no
Is it a reusable visual pattern shared across the product?
   ↓ yes → propose a design-system change (skills/modify-design-system)
```

Do not create a local alternative to a primitive that already exists. Do not send every
new React component back to the design system; keep the design system clean.

## 7. Update and feedback loop

```text
installed design system
   ↓
product development
   ↓
new reusable UI requirement
   ↓
design-system change (skills/modify-design-system)
   ↓
new package version (human-controlled release)
   ↓
product updates the package and re-validates
```

Never version or publish a package from the product. Never assume a breaking change is
safe: after an update, run `ds:connect` and `ds:check-usage`, then typecheck and build
the product, and verify visually where it matters.

## Stop / finish checklist

- [ ] The installed package and exact version were read from `.design-system/config.json`
      and the shipped manifest.
- [ ] Components were imported only through the public API.
- [ ] No package source, CSS, or tokens were copied into the product.
- [ ] No component was restyled with visual overrides.
- [ ] Product layout and business logic stayed in the product.
- [ ] `npx prism-ds check-usage --cwd <consumer-root>` was run and reported honestly.
- [ ] If a new reusable pattern was needed, it was proposed as a design-system change.
- [ ] Nothing was versioned or published.

## Common failure modes

- **Guessing the API.** Read the installed manifest and public API instead of assuming a
  prop, variant, or compound member exists.
- **Styling over the system.** Class or inline-style visual overrides belong in the
  design system, not the product.
- **Copying source.** Vendoring package code or CSS creates a second, drifting design
  system.
- **Importing internals.** Only documented `exports` are supported.
- **Silencing checks.** Fix usage findings by using the design system; do not weaken the
  checker or move code to dodge it.
- **Over-claiming.** Do not report a passing usage check unless the command actually ran.
