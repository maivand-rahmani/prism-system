# Consumer product fixture

This is a stand-in for a real product repository that consumes a published
`@prism-system` design system as its visual source of truth.

Product rules:

- Product code composes design-system components through their public API and
  public subpaths (`./styles.css`, `./tailwind.css`, `./manifest`, `./tokens`).
- Business logic, routing, data, and page composition live in this repository.
- The visual language lives in the design system package, never here.
- Switching systems or removing the previous system is an explicit `prism-ds switch` or
  `prism-ds remove` operation; the previous dependency is retained until a separate
  confirmed removal, and product UI is never rewritten automatically.
- Installed skills are agent instructions only: they are never executed here and never
  install Three.js, GSAP, or any product dependency.
- Never import `@prism-system/ui-core` internals or workspace source paths; the
  fixture is validated against packed artifacts, not the monorepo.

`pnpm ds:connect` appends a managed design-system contract block to this file.
Keep your own content outside that block.
