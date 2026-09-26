# Prism design-system lifecycle reference

Use this page for cross-lifecycle invariants. The active V4 specification is
[`docs/v4/README.md`](../../docs/v4/README.md), its consumer migration guide is
[`docs/v4/migration-v2-to-v4.md`](../../docs/v4/migration-v2-to-v4.md), and the core
contracts/schemas remain authoritative for exact names and shapes. This reference is
intentionally not a second component catalog.

## Contract and capability authority

`@prism-system/ui-core` and the checked schemas define the canonical V2 and V4 contracts.
The exact V2 fourteen-name API remains frozen. V4 adds a separate twenty-required plus
twelve-optional contract layer while preserving V2 prop contracts for shared names.
Systems implement all required contracts and only real optional implementations. Exact names and types are in [`contracts`](../../packages/core/src/contracts),
[`components.ts`](../../packages/core/src/design-system/components.ts),
[`design-system.ts`](../../packages/core/src/design-system/design-system.ts), and the
[`schemas`](../../schemas) directory (`design-system-source-v4.schema.json`,
`design-system-v4.schema.json`, `design-system.source.schema.json`,
`design-system.schema.json`, and `tokens.source.schema.json`). Read core's
`REQUIRED_COMPONENTS_V4` and `OPTIONAL_COMPONENTS_V4`; do not copy those arrays into
skills or briefs. A consumer needs only the installed public manifest, declarations,
and shipped docs. If the installed runtime component map, manifest, and public exports
disagree, report the package inconsistency and stop assuming any conflicting capability
is usable; do not repair it by consulting a source checkout.

For maintainers, the only accepted manifest/contract pairs are `(schemaVersion: 1,
contract: "v2")` and `(schemaVersion: 2, contract: "v4")`; validate them against the
schemas linked above. Consumers follow the installed public manifest and shipped docs,
without needing this source checkout. Never guess from package name or version number. A
component map in a V4 descriptor/runtime/manifest is the capability source: all required
names plus keys for actual optional implementations. A brief's requested capabilities
are requests only. Actual implementation, runtime map, public export, CSS component
entry, descriptor, and generated manifest must agree; absent optional entries mean
unavailable.

## Package sources and generated artifacts

For V4, edit `tokens.source.json` as the sole token source. Generated TypeScript token
exports, token CSS variables, Tailwind bridge, and `design-system.json` are outputs;
regenerate through `pnpm ds:manifest <id> --write` and never hand-edit them. Component
CSS is editable package styling. The source descriptor declares actual capabilities,
variants, examples, compound members, and documentation paths. Public module/CSS export
paths belong to package exports in `package.json` and public entrypoints, not descriptor
fields. A neutral scaffold is a starting point, not the approved visual design:
reconcile its `source.design` values with the confirmed brief.

V2 keeps its existing token, descriptor, manifest, and CSS requirements. Do not impose
V4's `tokens.source.json`, token bridge, twenty-name contract, or V4 artifact paths on a
V2 package. In a consumer, installed public exports, package declarations, manifest,
README, and shipped `AGENTS.md` are sufficient; a monorepo checkout and source token
file are never required.

## Product composition and validation

The package owns reusable visual language; the product owns data, routes, feature
behavior, and page/form composition. A requested page scenario does not imply a new
component contract. When an optional component is unavailable, retain HTML semantics
and accessibility while composing from installed primitives and product layout.

## Brief example

New briefs can keep the legacy required shape and add these optional, explicitly
classified notes. `requestedCapabilities` is not the actual package catalog; actual
capabilities are later read from runtime/descriptor/manifest agreement.

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
  "avoid": ["heavy shadows", "decorative gradients"]
}
```

`pnpm ds:check <id>` is the package's full check and already runs package build,
typecheck, and lint unless called with `--no-commands`. Run it once after the final
relevant edits; repeat only if later edits invalidate the result. Release, versioning,
and publishing are separate explicit actions. A package modification does require a
user-visible Changeset; that records release intent but is not authorization to version
or publish.
