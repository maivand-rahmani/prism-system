<!-- Generated standalone copy for the `modify-design-system` skill. Canonical source:
     `skills/references/visual-effects-and-custom-components.md` in the design-systems author
     workspace; edit that file and run
     `node scripts/sync-skill-references.mjs --write`.
     Do not edit this copy. Workspace paths such as `docs/...`, `packages/...`,
     and `schemas/...` are author-workspace files, not installed with this skill. -->

# Visual effects and custom components

Read this reference when creating, modifying, or consuming a system with dimensional
styling, animation, 3D scenes, or a requested component outside the shared contract.
The current specification (`docs/v4/README.md`), core types, and checked schemas
remain authoritative. The shipped manifest (`schemaVersion: 5`) carries the
`entrypoints`, `extensions`, and `effects` metadata this reference uses; the
architecture plan (`docs/plans/motion-3d-and-project-components.md`) records the
implemented stages and the remaining runtime QA.

## Existing component treatment

A dimensional or animated `Button` remains `Button` when its semantics and public
contract remain the same. Implement its appearance and effects in its existing
`src/components/button/` files, expose it through the existing public entry, and use
the system's existing token source. Apply the same rule to every existing contract.
Do not introduce `Button3D`, move ordinary components to a spatial/custom module, or
create a second token source solely because their appearance has depth or motion.

Use the contract's actual variants and props. An effect is not permission to invent
`variant="3d"`, engine-specific props, or incompatible events. If the user wants a
per-instance choice that the current API cannot express, identify that API decision
before implementation; do not silently extend the canonical contract.

Dimensional appearance can use ordinary CSS. Distinguish that from an actual 3D
renderer with geometry, lights, and a camera. Choose a renderer or animation library
only when the intended behavior needs it. Preserve native control semantics, keyboard
and focus behavior, disabled/loading states, and reduced-motion behavior regardless
of the implementation.

Package-local `src/motion/` may hold shared helpers or orchestration once components
actually need them. It is optional internal organization, not another component
catalog, token source, or required public `/motion` import. Public motion primitives
are a separate export decision; internal helpers do not imply they are available.

## Interview and recording

Resolve the user's intended treatment of existing controls separately from genuinely
new component requests. When the session leaves this open, explicitly ask whether
buttons and other relevant controls should feel flat, have tactile depth, or use
pronounced interactive effects. Ground the choices in the product direction; skip
questions already answered or delegated. Ask about an independent 3D scene only when
the product scenario suggests one. Do not turn this into a mandatory technical survey.

Record requested treatment in `componentTreatments`, broader animation scenarios in
`motionScenarios`, and independent API requests in `requestedCustomComponents`.
`foundations.motionIntensity` remains the system-wide intent. These optional brief
fields express requests only. Significant library choices and their authorization
belong in `decisionNotes`; versions and peer ranges belong in `package.json`.

Propose a technical bundle only after understanding the effect. Explain which package
needs it and whether it is intrinsic to the system or optional for an extension.
Respect existing authorization or delegation without asking again. A brief does not
prove a library has been installed or a requested feature has been implemented.

## Independent components and declared support

A component with its own API, such as an interactive keyboard scene, is different
from the visual treatment of an existing contract. Such a component may be DOM-only,
animated, or genuinely 3D; those properties do not determine its ownership or make
it a new shared contract. Keep business data, routes, and workflows in the product.

The runtime registry and descriptor/manifest `components` maps accept only
the canonical shared names. A custom component is declared separately through the source
descriptor `entrypoints`/`extensions` and published in `manifest.extensions`; do not add
arbitrary names to `components`, add a second core registry, or use
`capabilities.categories` as a custom-component availability list. `prism-ds components`
resolves declared extension names in addition to canonical components.

A custom extension is declared only with a real contained source module, a PascalCase
runtime export, docs, example, `apiVersion`, and optional `effects`, and its entry
requirements are resolved from `package.json`. Availability is only the presence of the
name in the installed `manifest.extensions`. For source work, implement and validate the
declaration against real exports; the architecture plan is not itself evidence of a
shipped API. For consumer work, use a custom export only when the installed release's
actual public exports, declarations, and shipped documentation agree, and import it from
its declared entrypoint. Never invent a `/custom`, `/spatial`, or
`/motion` import because an architecture document proposed it.

## Discovery and dependency boundaries

Standard component availability remains the presence of its key in the installed
`manifest.components`; custom extension availability is only its record in
`manifest.extensions`. Read the installed metadata — variants, descriptions, examples,
component `effects`, and entrypoint `requirements` — to learn how that system behaves.
Do not infer rendering engines, peer requirements, or effects from a name, folder, or
demo screenshot.

`prism-ds` builds the same catalog for its CLI and TUI from the manifest, and Showcase
shows declared extensions in a separate catalog group with the same requirements. Treat
declared metadata as the shipped claim: it does not by itself prove the visual result or
runtime compatibility of an effect. Verify the selected entry's loading, fallback,
reduced-motion, and client boundary in the installed release.

A library required by a standard component is a declared dependency of that system.
Optional peers are suitable only when the base API imports and works without them.
Separate imports do not by themselves make installation optional. In a consumer,
install only what the selected release and entry actually require, using existing
task authorization; no import, catalog read, `connect`, or `doctor` installs packages.

Keep effects in package implementations. Consumer screens compose documented APIs;
they do not drive GSAP against a control's private DOM or override system motion with
arbitrary styles. The current usage checker does not establish the correctness of
arbitrary animation calls or shaders. Review cleanup, browser/client boundaries,
fallbacks, and the affected interaction in addition to applicable automated checks.
