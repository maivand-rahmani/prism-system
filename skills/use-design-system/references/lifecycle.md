<!-- Generated standalone copy for the `use-design-system` skill. Canonical source:
     `skills/references/lifecycle.md` in the design-systems author
     workspace; edit that file and run
     `node scripts/sync-skill-references.mjs --write`.
     Do not edit this copy. Workspace paths such as `docs/...`, `packages/...`,
     and `schemas/...` are author-workspace files, not installed with this skill. -->

# Prism design-system lifecycle reference

Use this page for cross-lifecycle invariants. The current specification is
`docs/v4/README.md`; the core contracts and schemas are
authoritative for exact names and shapes. This reference is intentionally not a second
component catalog. Development-stage history is archived under
`docs/archive/`.

## Contract and capability authority

`@prism-system/ui-core` and the checked schemas define **one current contract**,
identified by the numeric `contractVersion: 4`. Exactly twenty-nine components are
required; seventeen more are optional capabilities. Systems implement all required
contracts and only real optional implementations. Exact names and types are in
`packages/core/src/contracts`,
`packages/core/src/design-system/components.ts`,
`packages/core/src/design-system/design-system.ts`, and the
`schemas` directory (`design-system.schema.json`,
`design-system.source.schema.json`, and `tokens.source.schema.json`). Read core's
`REQUIRED_COMPONENTS` and `OPTIONAL_COMPONENTS`; do not copy those arrays into skills or
briefs. A consumer needs only the installed public manifest, declarations, and shipped
docs. If the installed runtime component map, manifest, and public exports disagree,
report the package inconsistency and stop assuming any conflicting capability is usable;
do not repair it by consulting a source checkout.

The generated public manifest declares `schemaVersion: 5` and the numeric
`contractVersion: 4`; the package-owned source descriptor is `schemaVersion: 4` and is
never shipped. There is only one current shipped shape: readers built for schema 4 must
be upgraded in lockstep, an older `prism-ds` cannot read a schema-5 manifest, and current
tools reject schema-4 and older manifests. Other shapes fail closed. Consumers follow the installed
public manifest and shipped docs, without needing this source checkout. Never guess from
package name or version number. Availability is only the presence of a key in the
manifest `components` map: all required names plus keys for actual optional
implementations; custom extensions are available only as declared in
`manifest.extensions`, and the manifest `entrypoints` requirements are the only source
for selected-entry dependency/peer checks. The generated `capabilities.categories` block is a canonical
composition/forms/data-display membership inventory shared by every system, not a second
availability list; derive availability inside a category by intersecting its names with
`components`, and note that categories are scoped rather than exhaustive. Never add,
edit, or repeat `capabilities` in `design-system.source.json`. A brief's requested
capabilities are requests only. Actual implementation, runtime map, public export, CSS
component entry, descriptor, and generated manifest must agree; absent optional entries
mean unavailable.

## Package sources and generated artifacts

Edit `tokens.source.json` as the sole token source. Generated TypeScript token exports,
token CSS variables, Tailwind bridge, and `design-system.json` are outputs; regenerate
through `pnpm ds:manifest <id> --write` and never hand-edit them. Component CSS is
editable package styling. The source descriptor (`design-system.source.json`,
`schemaVersion: 4`) declares the implemented component set, variants, examples, compound
members, documentation paths, additional public code entrypoints (`entrypoints`), and
custom exports (`extensions`); it never carries a `capabilities` block, and entry
requirements are resolved from `package.json`, never duplicated in the descriptor. Public
module/CSS export paths belong to package exports in `package.json` and public
entrypoints, not descriptor fields. A neutral scaffold is a starting point, not the
approved visual design: reconcile its `source.design` values with the confirmed brief.

In a consumer, installed public exports, package declarations, manifest, README, and
shipped `AGENTS.md` are sufficient; a monorepo checkout and source token file are never
required.

## Effects and independent custom components

Depth, dimensional styling, and animation can be implemented inside any existing
contract without creating a different component name, folder, or token source.
Independent custom components have their own API, are declared by the package descriptor
`entrypoints`/`extensions`, and are never canonical capabilities.
For creation, modification, and consumption of either, read
[visual effects and custom components](visual-effects-and-custom-components.md).
That reference distinguishes declared custom entries from undeclared ones; custom
entries never enter the shared component contract, the runtime registry, or
`capabilities.categories`.

## Product composition and validation

The package owns reusable visual language; the product owns data, routes, feature
behavior, and page/form composition. A requested page scenario does not imply a new
component contract. When an optional component is unavailable, retain HTML semantics
and accessibility while composing from installed primitives and product layout.

## Brief example

New briefs keep the existing required shape and add optional, explicitly classified notes.
The schema is the authoring contract: `pnpm ds:create --brief` normalizes only the fields it
uses, preserves unknown extra fields, and performs no full schema validation. The written
`design-brief.json` ships in the package tarball, so it must contain only sanitized product
and visual intent — no secrets, customer-sensitive data, private reference URLs, personal
details, or interview transcripts. `requestedCapabilities` is not the actual package
catalog; actual capabilities are later read from runtime/descriptor/manifest agreement.

`decisionNotes` records significant choices only: `confirmed` (the user provided or approved
the decision), `delegated` (the user explicitly let the agent decide), `proposed` (awaiting
the user). A generator-ready brief has no material `proposed` decision. `referenceNotes`
captures which traits to take from a named reference and which to avoid; `openQuestions`
holds remaining questions — only nonblocking follow-ups once the brief is generator-ready.
The example below is an approved, generator-ready brief with aligned decision notes.

```json
{
  "project": "Northstar",
  "product": "A project analytics console for engineering teams",
  "audience": "Engineers reviewing delivery health on desktop and mobile",
  "platform": "responsive web",
  "interfaceType": "analytics console",
  "dataDensity": "high",
  "direction": ["calm", "precise", "compact"],
  "references": ["Linear"],
  "foundations": {
    "accentDirection": "cool blue used for primary actions",
    "colorTemperature": "cool neutral",
    "contrast": "clear text contrast with restrained surface contrast",
    "typographyCharacter": "compact sans with a clear heading and metric hierarchy",
    "dominantRadius": "small",
    "surfaceModel": "flat surfaces with clear borders",
    "borders": "subtle except on interactive focus",
    "elevation": "minimal",
    "motionIntensity": "subtle and reduced-motion aware"
  },
  "components": ["project overview page", "invite form"],
  "requestedCapabilities": ["Table", "Alert"],
  "productCompositions": [
    "Project overview with filters, activity rows, and responsive summary metrics",
    "Invite form with validation and success feedback"
  ],
  "responsiveRequirements": [
    "Stack filters above results on narrow screens",
    "Keep primary actions visible without horizontal scrolling"
  ],
  "typographyRequirements": [
    "Use a meaningful page and section heading hierarchy",
    "Align metric numerals"
  ],
  "stateScenarios": [
    "Loading project activity",
    "No activity yet",
    "Activity request failed with retry",
    "Invalid invite email"
  ],
  "referenceNotes": [
    "Linear - take: compact density and restrained accent; avoid: copying its exact palette"
  ],
  "decisionNotes": [
    {
      "topic": "visual direction",
      "status": "confirmed",
      "note": "The user chose calm, precise, and compact over a more expressive direction."
    },
    {
      "topic": "foundation bundle",
      "status": "delegated",
      "note": "The user delegated the foundations; the agent chose a cool blue accent, restrained surface contrast, minimal elevation, and reduced-motion-aware motion to fit the confirmed direction."
    }
  ],
  "openQuestions": [
    "Illustration style for a future marketing surface; nonblocking and does not change the approved console direction."
  ],
  "avoid": ["heavy shadows", "decorative gradients"]
}
```

`pnpm ds:check <id>` is the package's full check and already runs package build,
typecheck, and lint plus the app integration commands unless called with `--no-commands`.
Run it once after the final relevant edits; repeat only if later edits invalidate the
result. A passing check is not evidence that the visual result suits the product; that
judgment stays with the reviewed screens. Release, versioning, and publishing are separate
explicit actions. A package modification does require a user-visible Changeset; that records
release intent but is not authorization to version or publish.
