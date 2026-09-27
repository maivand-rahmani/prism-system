---
"@prism-system/ui-system-a": patch
"@prism-system/ui-system-b": patch
---

Clarify the React Server Components boundary for compound Card parts: in a Next.js App Router Server Component, render `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter` from the package root instead of `Card.Header`, which stays available inside client components. The shipped README, AGENTS.md, and USAGE.md docs document the flat exports and a small `"use client"` wrapper alternative.
