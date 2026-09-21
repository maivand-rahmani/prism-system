# @prism-system/tools

Published, consumer-side tooling for `@prism-system` design systems. It configures a
product repository to use an already-installed design system, validates strict usage,
and diagnoses the setup.

- **Executable:** `prism-ds` (`connect`, `check-usage`, `doctor`, `--help`).
- **Not a UI package:** it depends on no design system and on no `@prism-system/ui-*`
  package. TypeScript is its only runtime dependency.
- **Configure-only and offline:** no postinstall, no network calls, no package
  installation, no dependency/`package.json` mutation, no source copying, and no access
  to the design-systems source repository. It never versions or publishes.

## Install

Install it from npm alongside the design system your product consumes, exactly like any
other dependency:

```bash
npm install --save-dev @prism-system/tools
npm install @prism-system/ui-system-a
```

Then run it with `npx` (or from `node_modules/.bin`):

```bash
npx prism-ds connect @prism-system/ui-system-a --cwd .
npx prism-ds check-usage --cwd .
npx prism-ds doctor --cwd .
```

The tool never installs the design system for you. Install the design system first; if it
is missing, every command fails closed with an actionable message.

## Commands

### `prism-ds connect [package] --cwd <consumer-root>`

Writes the consumer contract and nothing else:

- `<consumer-root>/.design-system/config.json` — selected package, exact version, the
  `./manifest` subpath, strict mode, and optional root-relative `ignore` globs;
- `<consumer-root>/.design-system/AGENTS.md` — agent instructions;
- an idempotent managed block in `<consumer-root>/AGENTS.md` (your own content is
  preserved; re-running is byte-stable).

Options: `--strict` / `--no-strict`, `--check` (report drift, write nothing),
`--dry-run` (show planned writes). Discovery precedence is the existing
`.design-system/config.json`, then the consumer `package.json` `"designSystem"`
metadata, then a single `@prism-system/ui-*` dependency.

### `prism-ds check-usage --cwd <consumer-root>`

Deterministic, AST-based validation of strict usage, using the strict rules from the
installed package's shipped `./manifest`. It flags arbitrary colors/radius/shadows in
class tokens, visual inline-style overrides and unverifiable styles, and obvious local
primitive replacements. Strict findings exit non-zero; non-strict findings are warnings.
`--ignore <glob>` adds a root-relative ignore (repeatable).

### `prism-ds doctor [package] --cwd <consumer-root>`

Read-only diagnostics: realpath containment, package discovery, the installed version
resolved through Node package resolution, the public `./manifest` and its version, exact
identity/version invariants, and the consumer config state. It writes nothing and exits
non-zero when any check fails.

## Consumer contract

For a product repository, the public contract is:

1. `.design-system/config.json` (written by `connect`);
2. the installed package's manifest at `<package>/manifest`;
3. the installed package's `AGENTS.md`;
4. the installed package's `README.md`;
5. the public TypeScript API of the package.

The exact installed version, the manifest version, and any configured version must match.
Unknown manifest or config schema versions fail closed.

## Requirements

- Node.js `>= 20.19.0`.

## Maintainer tooling is separate

`pnpm ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`,
`ds:release`, and `ds:check-v3` are maintainer commands that operate on the design-systems
source repository. They are not part of this package and are not needed to consume a
published design system.

## License

MIT.
