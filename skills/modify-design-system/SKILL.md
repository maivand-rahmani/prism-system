---
name: modify-design-system
description: Evolve a Prism design-system package while preserving its published contract and visual language.
---

# Modify a Design System

Use this skill to change an existing Prism design system in its source repository.
Product UI work belongs to the consuming product and follows
[`use-design-system`](../use-design-system/SKILL.md). For contract and V2/V4 rules, see
[V4 lifecycle guidance](../references/v4-lifecycle.md); rely on core types and schemas
for component catalogs rather than maintaining a duplicate list here.

## Inspect and classify

Identify the system's exact contract from `package.json` and its descriptor/generated
manifest. Read its brief, package instructions, `tokens.source.json` for V4 (or the
existing token source for V2), styles, implementations, public exports, and shipped
documentation. V2 packages do not need V4 token-source files or a Tailwind bridge.

Classify the requested change before editing:

- token or appearance change;
- variant, state, or compound-member change;
- optional capability addition/removal for V4;
- public API or required-contract change;
- product-owned page/workflow composition.

Check whether the request is a reusable visual pattern or a product-specific feature.
Keep domain data, routing, business behavior, and one-off page composition in the
product. An optional contract is available only if the system actually implements and
exports it and declares it in its descriptor/manifest. Do not infer a capability from
the 32-name core catalog, a brief request, or a local example.

## Preserve compatibility

- V2 remains the exact fourteen-component contract and uses manifest pair
  `(schemaVersion: 1, contract: "v2")`.
- V4 uses `(schemaVersion: 2, contract: "v4")`, the canonical twenty required names,
  and only the optional capabilities actually implemented by that system.
- Keep the V2 prop contracts frozen, including when a V4 system implements those same
  names. Do not change canonical required names or contracts to satisfy a local request.
  A major version does not authorize breaking the canonical contract.
- Treat required-name removal/renaming or incompatible props as disallowed contract
  changes; propose an additive compatible design. Preserve public exports and compound
  members unless an explicitly supported deprecation path exists.
- Keep `@prism-system/ui-core` unstyled and avoid cross-system imports.

## Implement and regenerate

Make changes in the target package and only the related app composition/documentation
needed to demonstrate them. Keep product layouts in apps and visual decisions in the
system. For V4, edit `tokens.source.json` as the one token source and edit the source
descriptor for actual variants, examples, compound members, and documentation paths.
Public artifact and CSS paths belong to `package.json` exports and entrypoints.
Regenerate TypeScript/CSS/Tailwind bridge/manifest through the repository's
`pnpm ds:manifest <id> --write` command. Never hand-edit generated token artifacts or
`design-system.json`. V2 does not acquire V4 `tokens.source.json`, bridge, or capability
requirements merely because this workflow now supports V4.

Use package-local patterns already established by the target system. If a user requests
a reusable new pattern, first look for an existing core contract; when none fits, do
not invent a new core capability route as part of ordinary package work. Keep a
product-specific scenario in the app or document the contract gap for a separate
explicit core design decision.

## Validate and hand back

Run `pnpm ds:check <id>` once after the final package edits. This is the required full
check and includes package build, typecheck, and lint unless invoked with
`--no-commands`; do not rerun those checks redundantly. Run `pnpm ds:sync-versions <id>
--check` only when version alignment/release metadata is affected. Run consumer usage or
visual checks when the change affects a consumer or rendered behavior. Report what ran
and what remains unverified.

Add a user-visible Changeset for every package change by running `pnpm changeset` and
recording the package and appropriate bump/reason. A Changeset records release intent;
it does not version or publish. Versioning, release preparation, and publishing remain
separate explicit actions; never infer approval for them from a request to modify a
package.
