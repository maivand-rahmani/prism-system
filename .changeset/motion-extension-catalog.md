---
"@prism-system/tools": major
"@prism-system/ui-system-a": major
"@prism-system/ui-system-b": major
---

Shipped `design-system.json` manifests are now `schemaVersion: 5` with the same numeric
`contractVersion: 4`. Every manifest carries a required `entrypoints` map whose
requirements are resolved from `package.json` dependency/peer metadata, optional
per-component `effects` (features, rendering, reduced-motion, graphics fallback), and an
optional nonempty `extensions` map for verified custom PascalCase exports with an
`apiVersion`, entrypoint, description, docs/example references, and effects. The
package-owned `design-system.source.json` descriptor moves to `schemaVersion: 4` and
gains the same optional `entrypoints`/`extensions`/`effects` declarations; it stays
repository-only and is never shipped. `@prism-system/ui-core` and the shared component
contract are unchanged.

Readers built for schema 4 (or schema 3) cannot consume schema-5 manifests, so this
upgrade needs explicit lockstep coordination: publish `@prism-system/tools` together
with both systems, and upgrade `prism-ds` together with the installed system.
`prism-ds` now requires `schemaVersion: 5`, rejects older manifests, and reads the
entrypoint requirements and custom extension catalog only from the installed public
manifest without executing package code. An older `prism-ds` cannot read a schema-5
manifest.
