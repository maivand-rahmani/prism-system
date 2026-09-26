# Consumer product fixture

This directory is a stand-in for a real product repository that consumes a
published `@prism-system` design system as its visual source of truth. It is not
part of the pnpm workspace and is never built or published.

It exists to document and exercise the consumer contract against packed
`@prism-system/ui-system-a` and `@prism-system/ui-system-b` artifacts. Product
code imports only public package names and public subpaths (`./styles.css`,
`./tailwind.css`, `./manifest`, `./tokens`) — never package internals and never
workspace source paths.

## What is here

- `src/dashboard.tsx` — the same product composition rendered with each system,
  composed only through public props.
- `package.json` — declares both supported systems, so dependency discovery
  deliberately fails closed with "multiple candidates" unless a package is passed
  explicitly or `.design-system/config.json` exists.
- `AGENTS.md` — the product-side rules an external agent should follow.

## Trying the consumer lifecycle

The repository's packed consumer check (`pnpm ds:check-tools`) hydrates its own
scratch copies under a fresh `TEMP/lifecycle/tools-packed-<run-id>/` directory and runs
`prism-ds connect`, `components`, `tokens`, `check`, `setup-tailwind`,
`check-usage`, `doctor`, and the dependency-mutating commands against packed
artifacts, without mutating this repository.

To exercise the maintainer wrapper manually, pack the artifacts and extract them
into a scratch copy under `TEMP/lifecycle/`:

```bash
pnpm --filter @prism-system/ui-system-a pack --pack-destination TEMP/lifecycle/pack
pnpm --filter @prism-system/ui-system-b pack --pack-destination TEMP/lifecycle/pack

# then extract the tarball you want to consume into
# TEMP/lifecycle/<scratch>/node_modules/@prism-system/ui-system-a and run:
pnpm ds:connect @prism-system/ui-system-a --cwd TEMP/lifecycle/<scratch>
```

`ds:connect` writes `.design-system/config.json` and `.design-system/AGENTS.md`
and appends a managed block to `AGENTS.md`. It never installs packages, edits
`package.json`, copies component source, or mutates the design-system repository.

A real external product does not need this repository at all: it installs the
published `@prism-system/tools` package and runs `npx prism-ds use
@prism-system/ui-system-a --cwd .` (see `packages/tools/README.md`). This fixture
uses the repository wrapper only to exercise packed artifacts during maintainer
validation.
