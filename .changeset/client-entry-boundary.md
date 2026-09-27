---
"@prism-system/ui-system-a": minor
"@prism-system/ui-system-b": minor
---

Publish the package root as a client entry: both the ESM and CJS bundles now open with a top-level `"use client"` directive, so a Next.js App Router Server Component can import and render the components as client references. The `./tokens` subpath stays server-safe in both formats.
