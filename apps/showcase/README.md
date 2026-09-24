# Showcase

The Showcase is the component laboratory for the registered Maivand design systems. It
renders one active system at a time and switches between registered systems while the
interface composition stays fixed, so visual differences are attributable to the design
system.

- **Routes:** `/` opens the first registered system; `/showcase/<id>` opens a specific
  one (for example `/showcase/system-a`) and is the live catalog route referenced by the
  shared consumer documentation.
- **Foundations:** rendered from the active package's exported tokens
  (`<package>/tokens`), not from app-hardcoded values.
- **Components:** every specimen is resolved from the active package's public API. The
  app owns only layout, placement, and reference scenarios; it never restyles, copies, or
  reimplements package components.
- **Generated wiring:** `app/registry.ts`, the stylesheet import block in
  `app/layout.tsx`, `package.json` dependencies, and the `transpilePackages` block in
  `next.config.mjs` are tool-owned. `pnpm ds:register <id>` regenerates them from
  `config/design-systems.json`; do not edit those parts by hand. `app/showcase.tsx`,
  `app/showcase.css`, and the page routes are app-owned.

The Showcase is not a product: it has no business logic, data, or routing beyond the
system catalog.

Run it from the workspace with `pnpm --filter @prism-system/showcase dev`.
