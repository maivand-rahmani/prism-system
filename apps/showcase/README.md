# Showcase

The Showcase is the component laboratory for the registered Maivand design systems. It
renders one active system at a time and switches between registered systems while the
interface composition stays fixed, so visual differences are attributable to the design
system.

- **Routes:** `/` opens the first registered system; `/showcase/<id>` opens a specific
  one (for example `/showcase/system-a`) and is the live catalog route referenced by the
  shared consumer documentation. `/showcase/<id>/icons` opens the same system with the
  Icons tab active.
- **Foundations:** rendered from the active package's exported tokens
  (`<package>/tokens`), not from app-hardcoded values.
- **Components:** every specimen is resolved from the active package's public API. The
  app owns only layout, placement, and reference scenarios; it never restyles, copies, or
  reimplements package components.
- **Icons:** the Icons tab reads real availability from the active manifest's
  `publicApi["./icons"]` and loads the declared `./icons` entrypoint lazily through the
  generated `app/icon-loaders.ts`. A system without an icon entrypoint shows a neutral
  empty state. Icon drawing, color, stroke, and motion remain package-owned.
- **Generated wiring:** `app/registry.ts`, the stylesheet import block in
  `app/layout.tsx`, `package.json` dependencies, the `transpilePackages` block in
  `next.config.mjs`, and `app/extension-loaders.ts`/`app/icon-loaders.ts` are tool-owned.
  `pnpm ds:register <id>` regenerates them from `config/design-systems.json`; do not edit
  those parts by hand. `app/showcase.tsx`, `app/showcase.css`, `app/showcase-ui/`, and the
  page routes are app-owned.

The Showcase is not a product: it has no business logic, data, or routing beyond the
system catalog.

Run it from the workspace with `pnpm --filter @prism-system/showcase dev`.
