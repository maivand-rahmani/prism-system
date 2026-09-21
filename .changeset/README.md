# Changesets

This directory is managed by [Changesets](https://github.com/changesets/changesets).

Every published package in this monorepo (`@prism-system/ui-core`, `@prism-system/ui-system-*`,
and the consumer tooling `@prism-system/tools`) uses Changesets for versioning and release
notes.

## Workflow

```bash
pnpm changeset          # describe a change and pick the affected packages
pnpm version-packages   # apply pending changesets to package versions
pnpm release            # build everything and publish
```

- `config.json` holds the shared release configuration.
- Do not edit version fields by hand; use `pnpm version-packages`.
