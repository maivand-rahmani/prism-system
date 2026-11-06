---
"@prism-system/ui-core": minor
"@prism-system/ui-system-plr": minor
"@prism-system/tools": minor
---

Add the shared fifty-icon Prism catalog. Core now exports the canonical
`ICON_NAMES`, `ICON_CATEGORIES`, `IconName`, `IconProps`, and `IconComponent`
contract without any SVG, colors, or Lucide dependency. `@prism-system/ui-system-plr`
ships all fifty icons from its `./icons` entrypoint, inherits the system's ink and
themes, and validates its declaration against the real source and build exports.
The template now generates the same fifty-icon entrypoint, and `prism-ds` gains an
offline `icons [name] --cwd <root> [--json]` catalog plus icon-aware check-usage,
switch, check, and doctor behavior. The shipped manifest stays schema 5: icon
availability is the real `publicApi["./icons"]` list, so released readers continue
to accept the manifest and simply do not expose the new catalog command.
