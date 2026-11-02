---
"@prism-system/tools": patch
---

List every published `@prism-system/ui-*` package when `prism-ds search` is run without a
query. The new scope-index path enumerates npm's replication `_all_docs` key range and
reads each package's latest packument, so a newly published design system appears
immediately instead of waiting for the ranked search index. A one-token package name or
system id also resolves directly, so an exact query finds a newly published package even
when ranked search does not. When the scope index is unavailable, the command falls back
to ranked search and reports the incomplete source.
