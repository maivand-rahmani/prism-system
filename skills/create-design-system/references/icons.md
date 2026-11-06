<!-- Generated standalone copy for the `create-design-system` skill. Canonical source:
     `skills/references/icons.md` in the design-systems author
     workspace; edit that file and run
     `node scripts/sync-skill-references.mjs --write`.
     Do not edit this copy. Workspace paths such as `docs/...`, `packages/...`,
     and `schemas/...` are author-workspace files, not installed with this skill. -->

# Icons lifecycle

Icons are the shared **optional** Prism catalog of fifty semantic names. They are not
components: never add an icon name to `REQUIRED_COMPONENTS`, `OPTIONAL_COMPONENTS`,
`DesignSystemComponents`, or `capabilities.categories`, and never create a second runtime
registry for them. Core owns the neutral vocabulary, `IconProps`/`IconComponent`, and the
stable `${Name}Icon` export convention; it owns no SVG path data, Lucide dependency,
colors, stroke width, default visual size, or motion.

The canonical names are:

```text
Navigation: ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
ChevronUp, ChevronDown, Menu, Home
Actions: Plus, Minus, Close, Check, Search, Filter, Settings, Edit, Trash, Copy
Files: Download, Upload, Share, Link, ExternalLink, File, Folder, Image, Calendar, Clock
Feedback: Info, Help, Warning, Error, Success, Loading, Eye, EyeOff, Lock, Unlock
Interface: User, Users, Mail, Bell, Heart, Star, MoreHorizontal, MoreVertical,
Refresh, LogOut
```

The exact Lucide mapping, accessibility examples, and visual rules live in the workspace
file `docs/v4/icons.md`; read it before designing or reviewing a set.

## When creating a design system

- `pnpm ds:create <id>` already generates the complete fifty-icon catalog from
  `templates/design-system`: `src/icons/`, the reserved `./icons` entrypoint, the
  `lucide-react` dependency, `ICONS.md`, and the descriptor `icons` declaration. Keep all
  fifty unless the product explicitly needs a different set.
- Review the generated set against the system's own visual language: stroke weight,
  optical alignment, light/dark theme, text and control contexts. The template defaults
  (`1em`, `1.75` stroke, `currentColor`) are starting points, not a mandate to copy PLR.
- Keep the theme and palette in `tokens.source.json` and `src/styles`; never hardcode an
  icon color or move a palette into core.
- Keep the Lucide license and provenance accurate. If you copy SVG path data instead of
  depending on `lucide-react`, preserve the ISC notice and document the origin.
- Declare only real icons in `design-system.source.json` (`icons.names`, canonical order)
  and publish real `${Name}Icon` exports from `./icons`; regenerate the manifest with
  `pnpm ds:manifest <id> --write`. Empty stubs, guessed names, and undeclared exports are
  validation failures.

## When modifying an existing design system

- Add or replace one icon in its own `src/icons/<Name>.tsx`. Keep the public export name,
  `IconProps`, and the `${Name}Icon` convention unchanged, so consumer imports survive.
- A custom drawing replaces the Lucide import in that one module; it must accept standard
  SVG props, inherit `currentColor`, forward the SVG ref, and preserve the built-in
  accessibility behavior of `icon-base.tsx`.
- To remove an icon, remove the name from `icons.names`, remove the real export, and
  regenerate the manifest. Check consumer imports and run `prism-ds check-usage` or a
  `switch --dry-run`; do not leave an undeclared export behind.
- Keep visual changes systemic: color inheritance, stroke width, optical size, and motion
  belong to the design system, not to product call sites. Do not restyle icons through
  product class overrides.
- Never edit the generated `design-system.json` by hand. Availability is the generated
  `publicApi["./icons"]` list of canonical exports, not a separate manifest field.

## When using an installed design system

- Discover first: `prism-ds icons --cwd <root>`, `prism-ds icons Search --cwd <root>`,
  the live `/showcase/<id>/icons` route, or the manifest's `publicApi["./icons"]`. Do not
  assume all fifty exist; the shared vocabulary is not availability.
- Import only from the package's declared icon entrypoint, normally
  `@prism-system/ui-system-<id>/icons`; never import an icon from package internals or a
  root path that does not publish it.
- Use `aria-hidden="true"` (or rely on the safe default) for decorative icons. Give a
  meaningful standalone icon `label` (or `aria-label`/`aria-labelledby`). An icon-only
  button owns its accessible name itself and keeps the icon decorative.
- Never use color as the only state signal. Do not add a manual color when
  `currentColor` already inherits the correct system ink; use `size` only when the
  surrounding type does not establish the scale.
- Do not animate by default. `LoadingIcon` is static; opt into the documented spin class
  only when motion is appropriate, and verify `prefers-reduced-motion` removes it.
- Treat the icon catalog as optional at the contract level: a product that works with a
  system without icons must fail closed or provide a product-owned fallback, not invent a
  Prism icon.

## When switching systems

- Read the target manifest's `publicApi["./icons"]`; an icon absent there is unavailable,
  even if the shared vocabulary contains the name.
- Find active icon imports before switching. `prism-ds switch ... --dry-run` reports used
  icons, auto-selects the target `./icons` entrypoint when needed, and blocks missing
  icons. Dynamic, computed, or namespace-ambiguous usage is reported as unverified, never
  as fully checked.
- Do not rewrite product UI or copy icon source during the switch. Apply only reviewed
  literal module substitutions; an unavailable icon requires a product decision or a
  different target release.
- An entrypoint change is a compatibility change: verify the new `./icons` import path and
  its declared requirements before applying the switch.
