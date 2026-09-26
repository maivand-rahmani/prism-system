---
"@prism-system/ui-system-a": major
"@prism-system/ui-system-b": major
---

Shipped `design-system.json` manifests are now `schemaVersion: 4` with the numeric
`contractVersion: 4` and publish the full 29-required-component catalog. The
package-owned `design-system.source.json` stays a repository-only `schemaVersion: 3`
input and is never shipped or read from consumers.

Readers built for schema 3 cannot consume schema-4 manifests, so this upgrade needs
explicit lockstep coordination: publish `@prism-system/ui-core`, both systems, and
`@prism-system/tools` in the same release, and upgrade `prism-ds` together with the
installed system. An older `prism-ds` cannot read a schema-4 manifest, and the current
tooling rejects schema 3.
