---
name: modify-design-system
description: >-
  Modify an existing Prism design-system package in its source repository: tokens,
  variants, states, optional capabilities, public API, styles, or package docs,
  preserving contract version 4 and the system's visual language.
---

# Modify a Design System

Use this skill when the task is to change an existing Prism design-system package in its
source repository: tokens or appearance, variants and states, component styles or
behavior, optional capability additions/removals, the public API, or the package's
shipped documentation and examples. This is package-source work, not product UI work.
Product UI belongs to the consuming product and follows
[`use-design-system`](../use-design-system/SKILL.md). For contract rules, read
[lifecycle guidance](../references/lifecycle.md); rely on core types and schemas for
component catalogs rather than maintaining a duplicate catalog here.

## Orient before editing

Read the actual system and the user's intent before deciding anything: `package.json` for
the exact contract version, the design brief, package instructions, `tokens.source.json`,
component styles and implementations, public exports and entrypoints, the source
descriptor, the generated manifest, tests, and shipped documentation. Learn the system's
established token semantics, variant conventions, and visual language, and restate the
request in your own words. The shipped package is the current truth; when the brief,
docs, or examples disagree with the implementation, report the mismatch and confirm
scope before widening the change.

## Classify the request

Classify what is actually being asked before touching files:

- token or appearance change;
- variant, state, or compound-member change;
- optional capability addition/removal;
- public API or required-contract change;
- product-owned page/workflow composition.

Depth, 3D-like styling, and animation on an existing contract are component treatment
changes. Keep the component's existing folder, public name, props, and token source.
An independent component with its own API is a custom-component request, whether its
rendering is ordinary DOM or 3D. For either case, read
[visual effects and custom components](../references/visual-effects-and-custom-components.md)
and use the descriptor `entrypoints`/`extensions` records plus their validation rather than
inventing catalog support. Optional internal
`src/motion/` helpers do not move ordinary components to an extension module.

Check whether the request is a reusable visual pattern or a product-specific feature.
Keep domain data, routing, business behavior, and one-off page composition in the
product. An optional contract is available only if the system actually implements and
exports it and declares it in its descriptor/manifest. Do not infer a capability from the
core catalog, a brief request, or a local example.

## Clarify proportionally

A clear, small, low-risk fix (an obvious focus, state, or contrast bug; a direct token
adjustment) should be implemented without an interview. Ask a short question only when a
genuine choice changes the outcome:

- which package or screen is in scope;
- whether a requested pattern is reusable system language or one product's composition;
- whether a visual change is a system-wide redesign or a targeted component fix;
- whether an optional capability belongs in the package or should be composed by the app.

For an ambiguous request such as "make buttons 3D", clarify the desired visual and
interactive treatment, including the difference between tactile CSS depth and an actual
3D scene when it changes the result. Preserve already approved/delegated choices.
Do not turn a clear effects change into a full interview or presume new library approval.

Examples: "make the primary button darker on hover" is routine — implement it through the
established variant/state pattern. "Add alerts and make the system denser" is ambiguous
and needs one or two targeted questions about whether density changes system-wide or one
screen, and whether `Alert` becomes an optional capability or the product composes a
feedback region. Do not guess on cross-cutting scope, and do not interrogate on routine
fixes.

Communicate in the user's language. When the environment exposes a structured question
tool, use it for genuine blocking choices; otherwise present concise options and allow the
user's own answer. Recommend a default only when a defensible technical choice exists. For subjective visual or product
preferences, lay out the options and let the user decide. Never ask for information
already visible in the repository or in the user's message.

## Impact assessment before cross-cutting changes

Before changing shared tokens, component styling, variants, or public exports, write a
short assessment:

- what stays invariant: the canonical core contract (version 4), required component APIs,
  this system's established visual language, and unaffected consumer call sites;
- what is affected: tokens, public exports, descriptor/manifest entries, component styles,
  docs and examples, rendered screens (Showcase, Reference App, and consumer surfaces),
  and any config or custom manifest readers;
- whether the change is additive or breaking for this system's own shipped API, including
  consumer and migration implications. A package major version may change this system's
  API, but it never authorizes breaking the canonical required contract;
- the evidence: files and generated artifacts read, and checks run or still needed.

Keep it short and proportional. A local fix needs no impact essay.

## Preserve compatibility

- There is one current contract, version 4: the canonical twenty-nine required names plus
  only the optional capabilities actually implemented by that system.
- Do not change canonical required names or contracts to satisfy a local request.
  A major version does not authorize breaking the canonical contract.
- Treat required-name removal/renaming or incompatible props as disallowed contract
  changes; propose an additive compatible design. Preserve public exports and compound
  members unless an explicitly supported deprecation path exists.
- Keep `@prism-system/ui-core` unstyled and avoid cross-system imports.
- Reuse the system's established visual language for ordinary change; only an explicitly
  requested redesign justifies new foundations. Do not perform universal cosmetic
  cleanup, restyle unrelated components, or reformat existing code as a side effect.
- Respect the user's existing work: preserve uncommitted diffs in the files you touch,
  never revert unrelated changes, and edit the files as they actually are rather than
  from a remembered baseline.

## Implement and regenerate

Make changes in the target package, plus only the app composition or documentation needed
to demonstrate them. Keep product layouts in apps and visual decisions in the system.
Edit `tokens.source.json` as the one token source and the source descriptor for real
variants, examples, compound members, and documentation paths. Public artifact and CSS
paths belong to `package.json` exports and entrypoints.

For an optional capability addition or removal, make the whole chain agree:
implementation, runtime component map, public export, styles import/CSS entry, source
descriptor, and generated manifest. Concretely, every declared component has a folder
trio under `src/components/<kebab>/` (`<Name>.tsx` referencing the system's class prefix,
`<kebab>.css` scoped under the system root class, and `index.ts`); the public barrel
(`src/components/index.ts`) exports exactly the declared set; the runtime map in
`src/design-system.ts` matches the descriptor; and `src/styles/index.css` imports the
generated `tokens.css` plus exactly the declared component stylesheets in canonical
descriptor order. Removing a capability removes all of those entries. Never add empty
stubs; an omitted optional entry means unavailable from that system.

Regenerate the TypeScript/CSS/Tailwind bridge/manifest through the repository's
`pnpm ds:manifest <id> --write` command. Never hand-edit generated token artifacts or
`design-system.json`, and never add a `capabilities` block to the source descriptor
(it is `schemaVersion: 4`). Regenerated manifests are `schemaVersion: 5`; any custom
manifest reader built for schema 4 or older must be updated in lockstep, because current
tooling rejects schema 4 and older readers cannot parse schema 5.

Use package-local patterns already established by the target system. If a user requests a
reusable new pattern, first look for an existing core contract; when none fits, do not
invent a new core capability as part of ordinary package work. Keep a product-specific
scenario in the app or document the contract gap for a separate explicit core design
decision.

A system-specific custom export does not become a canonical capability. Declare it in the
source descriptor `entrypoints`/`extensions` with a real contained source module, a
PascalCase runtime export, docs, example, `apiVersion`, and optional effects; never put
its name in `DesignSystem.components` or `capabilities.categories`, and do not invent a
second runtime registry. Entrypoint requirements are resolved from `package.json`:
publish an engine as an optional peer only when the standard root and `./tokens` do not
import it. Updating visual-effect metadata must use the supported descriptor
and generated manifest format; changes to the format require coordinated readers.

## Validate and hand back

Run `pnpm ds:check <id>` once after the final package edits. Unless invoked with
`--no-commands`, it runs the package's own typecheck/lint/build scripts, the Showcase and
Reference App integration scripts, and the structural contract checks (component folders,
barrel, runtime map, stylesheet order, manifest, version consistency). Do not rerun those
package or app commands redundantly. Extend or adjust tests to match
the change's effects when relevant, covering keyboard and focus behavior, reduced-motion
and responsive behavior, component states, and old or locked consumer versions; report
what could not be exercised. Run `pnpm ds:sync-versions <id> --check` only when version
alignment or release metadata is affected. Run consumer usage or visual checks when the
change affects a consumer or rendered behavior.

Add a user-visible Changeset for every package change by running `pnpm changeset` and
recording the package and appropriate bump/reason. A Changeset records release intent; it
does not version or publish. Versioning, release preparation, and publishing remain
separate explicit actions; never infer approval for them from a request to modify a
package.
