# Consumer product fixture

This directory is a stand-in for a real product repository that consumes a
published `@prism-system` design system as its visual source of truth. It is not
part of the pnpm workspace and is never built or published.

It exists to exercise `pnpm ds:connect` and the generated consumer contract
against packed `@prism-system/ui-system-a` and `@prism-system/ui-system-b`
artifacts. Product code imports only public package names — never
`@prism-system/ui-core` internals and never workspace source paths.

## Hydrating packed artifacts

This fixture does not bundle or vendor a design system. To try it, hydrate a
scratch copy under `TEMP/v3/` and install packed artifacts there, for example:

```bash
pnpm --filter @prism-system/ui-system-a pack --pack-destination TEMP/v3/pack
pnpm --filter @prism-system/ui-system-b pack --pack-destination TEMP/v3/pack
```

Then extract the tarball you want to consume into
`TEMP/v3/<scratch>/node_modules/@prism-system/ui-system-a` and run:

```bash
pnpm ds:connect @prism-system/ui-system-a --cwd TEMP/v3/<scratch>
```

`ds:connect` writes `.design-system/config.json` and `.design-system/AGENTS.md`
and appends a managed block to `AGENTS.md`. It never installs packages, edits
`package.json`, copies component source, or mutates the design-system repository.

Because this fixture declares both supported systems in `dependencies`,
dependency discovery deliberately fails closed with "multiple candidates" unless
you pass a package explicitly or add `.design-system/config.json`.
