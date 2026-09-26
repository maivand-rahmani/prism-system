---
"@prism-system/tools": major
---

`prism-ds` now supports only the current manifest shape (`schemaVersion: 4`, numeric
`contractVersion: 4`) and fails closed on everything else, including schema 3 and the
retired string `contract` markers. Because the tooling can no longer read schema-3
manifests, `@prism-system/tools` must be published in lockstep with
`@prism-system/ui-core` and the schema-4 systems; an older `prism-ds` cannot read a
schema-4 manifest.
