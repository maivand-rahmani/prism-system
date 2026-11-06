---
"@prism-system/tools": patch
"@prism-system/ui-core": patch
"@prism-system/ui-system-plr": patch
---

Support dependency updates and local CLI self-updates at pnpm workspace roots, and
verify the current installed package after pnpm replaces its link. Align Radix overlay
dependencies so nested dialogs and selects share the same dismissal layer in supported
installations. Give PLR icon buttons a 3rem minimum target in both dimensions and prevent
them from shrinking in flex layouts.
