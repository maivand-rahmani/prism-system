---
"@prism-system/ui-system-plr": minor
---

Add self-hosted handwritten typography for diary entries.

- Bundle Caveat variable WOFF2 subsets (Latin, Latin Extended, Cyrillic,
  Cyrillic Extended) so handwriting works offline with `styles.css` and covers
  Russian, English, and digits.
- Publish `typography.family.handwriting` as a token: available in the
  `@prism-system/ui-system-plr/tokens` export,
  `--maivand-plr-typography-family-handwriting` in CSS, and
  `--font-prism-handwriting` in the Tailwind bridge.
- Add `Text variant="handwriting"` alongside the default `body` treatment for
  short reflective copy.
