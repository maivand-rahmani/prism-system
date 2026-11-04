---
"@prism-system/tools": major
---

Make the consumer `package.json` the primary source of design-system configuration.

`prism-ds connect` now writes a `"designSystem"` field in the root `package.json` and one
managed section in the root `AGENTS.md`. It no longer creates `.design-system/config.json`
or `.design-system/AGENTS.md`, and it no longer creates the `.design-system/` directory at
all. The directory stays optional and is reserved for tool-managed state that does not
belong in `package.json` (currently `skills.json`) and for future configuration that
genuinely outgrows the field.

The field is:

```json
"designSystem": {
  "schemaVersion": 1,
  "package": "@prism-system/ui-system-a",
  "version": "1.2.3",
  "strict": true
}
```

`version` is optional when hand-written (`connect` always records the exact verified
version) and `ignore` remains an optional root-relative glob list. `$schema` and `manifest`
are gone from the written configuration: the manifest subpath is a fixed public contract,
not consumer configuration.

The root `AGENTS.md` managed section now carries the full instruction set that used to be
split across `.design-system/AGENTS.md`, so no separate generated instructions file is
needed. It is still delimited by `<!-- BEGIN @prism-system design system contract (managed) -->`
and `<!-- END ... -->`, still replaces itself in place instead of appending duplicates, and
still never modifies content outside the markers.

Existing installations migrate on the next `prism-ds connect` (directly, or through `use`,
`upgrade`, `switch`, or `recover --action`): the legacy `.design-system/config.json` is moved
into `package.json`, the generated `.design-system/AGENTS.md` is retired, and the directory
is removed only once it is empty. A legacy configuration keeps working read-only until then,
and a legacy config that names a different package than the `package.json` field fails
closed instead of silently picking one.

`remove` now strips the `designSystem` field only when it is unchanged from the generated
configuration, and still deletes legacy files only when they are byte-identical to what an
older `connect` wrote.

## New `prism-ds config` command

`prism-ds config [package-json|design-system] --cwd <root> [--check] [--dry-run] [--json]`
shows or moves where a consumer stores its configuration:

- `config` with no argument reports the active location (read-only).
- `config package-json` moves the configuration into `package.json#designSystem`.
- `config design-system` moves it into `.design-system/config.json` in an extended layout
  that wraps the _identical_ subtree:

  ```json
  { "designSystem": { "schemaVersion": 1, "package": "…", "version": "…", "strict": true } }
  ```

  The `package.json` field is removed, so there is exactly one configuration.

Both locations are equally supported; only the location changes. The extended file
describes itself, so a consumer can never hold two competing configurations, and the
pre-package.json root-level layout stays unambiguous and auto-migratable. Moving never
installs packages, never edits dependencies, and never changes the selected package or
version; moving back restores the exact prior `package.json` bytes and retires the emptied
directory.

`connect` now keeps whichever location is already active, so it never migrates a deliberate
`.design-system/config.json` back into `package.json`, while still auto-migrating a legacy
root-level file. `config --check` reports whether the target location is active (exit 1 when
a move is pending); `--dry-run` writes nothing.
