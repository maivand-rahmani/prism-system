// Cross-platform build step: publish the standalone Tailwind v4 bridge.
//
// `tsup` bundles `src/styles/index.css` (which `@import`s the generated
// `tokens.css` and every component stylesheet) into `dist/index.css`. The
// Tailwind bridge is intentionally standalone and imports nothing, so it is
// copied verbatim to `dist/tailwind.css` rather than processed by a bundler.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(packageDir, "src", "styles", "tailwind.css");
const target = join(packageDir, "dist", "tailwind.css");

if (!existsSync(source)) {
  throw new Error(`Missing ${source}. Regenerate it with "pnpm ds:manifest system-b --write".`);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
