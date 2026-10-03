#!/usr/bin/env node
/**
 * `prism-ds` — the published tooling for `@prism-system` design systems.
 *
 * Commands:
 *
 *   prism-ds search [query...] [--registry <url>] [--size <1..250>] [--json]
 *   prism-ds info <package-or-id> [version] [--registry <url>] [--json]
 *   prism-ds install <package-or-id> [version] --cwd <root> [--save-dev|--save-prod]
 *     [--exact] [--registry <url>] [--dry-run] [--json]
 *   prism-ds use <package-or-id> [version] --cwd <root> [install options]
 *     [--strict|--no-strict] [--ignore <glob>...] [--check-usage]
 *     [--tailwind --css <file>] [--dry-run] [--json]
 *   prism-ds connect [package] --cwd <root> [--strict|--no-strict] [--check] [--dry-run]
 *   prism-ds check-usage --cwd <root> [--ignore <glob>] [--strict|--no-strict]
 *   prism-ds doctor [package] --cwd <root>
 *   prism-ds components [name] --cwd <root> [--json]
 *   prism-ds tokens [group] --cwd <root> [--json]
 *   prism-ds check --cwd <root> [--css <file>] [--json]
 *   prism-ds setup-tailwind --cwd <root> --css <file> [--dry-run] [--check] [--json]
 *   prism-ds upgrade <package-or-id> <exact-version> --cwd <root>
 *     [--dry-run] [--json] [--registry <url>] [--strict|--no-strict]
 *   prism-ds switch <target> [version] --cwd <root> [--registry <url>] [--css <file>]
 *     [--with-entry <value>] [--peer <name@version>] [--dry-run] [--yes] [--json]
 *   prism-ds remove [package] --cwd <root> [--css <file>] [--dry-run] [--yes] [--json]
 *   prism-ds skills list --cwd <root> [--global] [--json]
 *   prism-ds skills add|update|remove <catalog-id> --cwd <root> --agent <id>
 *     [--global] [--dry-run] [--yes] [--json]
 *   prism-ds self-update [--check] [--cwd <root>] [--global]
 *     [--manager npm|pnpm] [--registry <url>] [--dry-run] [--yes] [--json]
 *   prism-ds recover [package] --cwd <root> [--css <file>] [--entry <entry>]
 *     [--action <id>] [--dry-run] [--yes] [--json]
 *
 * Bare `prism-ds` (no arguments) dynamically starts the inline interactive TUI
 * (`./tui.mjs`) in the current process; every argument invocation, including
 * `--help`, follows the argument path below unchanged.
 *
 * Boundaries: `search`/`info` are explicit network, read-only. `install`/`use`/
 * `upgrade` are the only commands that mutate consumer dependencies (via a fixed
 * npm/pnpm command), and `upgrade` only when explicitly invoked.
 * `connect`/`check-usage`/`doctor`/`components`/`tokens`/`check`/`setup-tailwind`
 * are offline; `setup-tailwind` edits only its explicit `--css` file (never on
 * `--dry-run`/`--check`). No postinstall, no source copying, no publishing, and
 * no hidden package selection. TypeScript is lazy-loaded only for `check-usage`
 * and `check` (which invokes the usage checker).
 *
 * `self-update` updates only the prism-ds tooling package itself
 * (`@prism-system/tools`), never a design system: `--check` is read-only, and a
 * real update requires `--yes` and runs only the fixed npm/pnpm command for an
 * identified or explicitly selected installation (never an assumed global or
 * source/workspace update). `recover` is read-only by default and executes only
 * a reviewed, suggested connect/setup-tailwind repair with `--action <id>
 * --yes`; `--dry-run` never writes.
 *
 * `switch`/`remove` preview the exact plan without `--yes` and apply it only
 * with `--yes`, reusing the previewed plan material as the execution
 * precondition and freezing the exact target version. `skills list` is offline;
 * `skills add/update/remove` preview the frozen catalog plan and run only the
 * pinned upstream CLI with `--yes`. The default `use` skill setup installs only
 * the consumer `use-design-system` skill at project scope when an agent is
 * explicitly selected or exactly one is detected; `--no-skills` restores the
 * previous `use` behavior.
 */

import { readFileSync } from "node:fs";

import { connectDesignSystem } from "./consumer.mjs";
import { collectDoctorReport, doctorHelpText } from "./doctor.mjs";

/** Published executable name. */
export const CLI_NAME = "prism-ds";

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function helpText() {
  return [
    `${CLI_NAME} ${readPackageVersion()} — @prism-system design-system tools`,
    "",
    "Find, inspect, install, configure, and validate @prism-system design systems.",
    "",
    "Usage:",
    `  ${CLI_NAME} search [query...] [--registry <url>] [--size <1..250>] [--json]`,
    `  ${CLI_NAME} info <package-or-id> [version] [--registry <url>] [--json]`,
    `  ${CLI_NAME} install <package-or-id> [version] --cwd <root> [options]`,
    `  ${CLI_NAME} use <package-or-id> [version] --cwd <root> [options]`,
    `  ${CLI_NAME} connect [package] --cwd <root> [options]`,
    `  ${CLI_NAME} check-usage --cwd <root> [options]`,
    `  ${CLI_NAME} doctor [package] --cwd <root>`,
    `  ${CLI_NAME} components [name] --cwd <root> [--json]`,
    `  ${CLI_NAME} tokens [group] --cwd <root> [--json]`,
    `  ${CLI_NAME} check --cwd <root> [--css <file>] [--json]`,
    `  ${CLI_NAME} setup-tailwind --cwd <root> --css <file> [--dry-run] [--check] [--json]`,
    `  ${CLI_NAME} upgrade <package-or-id> <exact-version> --cwd <root> [options]`,
    `  ${CLI_NAME} switch <target> [version] --cwd <root> [options]`,
    `  ${CLI_NAME} remove [package] --cwd <root> [--css <file>] [--dry-run] [--yes] [--json]`,
    `  ${CLI_NAME} skills list --cwd <root> [--global] [--json]`,
    `  ${CLI_NAME} skills add|update|remove <catalog-id> --cwd <root> --agent <id> [options]`,
    `  ${CLI_NAME} self-update [--check] [--cwd <root>] [--global] [--manager npm|pnpm]`,
    `                       [--registry <url>] [--dry-run] [--yes] [--json]`,
    `  ${CLI_NAME} recover [package] --cwd <root> [--css <file>] [--entry <entry>]`,
    `                    [--action <id>] [--dry-run] [--yes] [--json]`,
    `  ${CLI_NAME} --help`,
    "",
    "Commands:",
    "  search          Search the npm registry for supported @prism-system/ui-* styles.",
    "  info            Inspect a published style's manifest from the registry.",
    "  install         Explicitly install a style into a consumer (npm or pnpm).",
    "  use             Install, verify, connect a style; optional strict usage check.",
    "  connect         Configure an already-installed style in a consumer.",
    "  check-usage     Deterministically validate strict usage with the TypeScript AST.",
    "  doctor          Read-only diagnostics: containment, discovery, manifest, config.",
    "  components      Offline component catalog of the installed style.",
    "  tokens          Offline token catalog of the installed style.",
    "  check           One offline read-only health report for a connected consumer.",
    "  setup-tailwind  Write the Tailwind v4 bridge imports into one explicit CSS file.",
    "  upgrade         Explicitly upgrade an installed style to an exact version.",
    "  switch          Preview/apply an exact, usage-checked design-system switch.",
    "  remove          Explicitly remove one selected design system and its unchanged",
    "                  generated integration.",
    "  skills          Offline catalog/inventory plus consent-gated instruction installs.",
    "  self-update     Check for and explicitly update the prism-ds tooling itself",
    "                  (@prism-system/tools), never a design system.",
    "  recover         Diagnose project state read-only; run one explicit, suggested",
    "                  connect/setup-tailwind repair only with --action <id> --yes.",
    "",
    "Boundaries:",
    "  search/info                      explicit network, read-only.",
    "  install/use/upgrade              mutate consumer dependencies via a fixed npm/pnpm",
    "                                   command with --ignore-scripts; upgrade does so only",
    "                                   when explicitly invoked.",
    "  switch/remove                    also mutate consumer dependencies via a fixed",
    "                                   npm/pnpm command; switch retains the previous",
    "                                   dependency, remove is a separate explicit operation,",
    "                                   and both print an exact preview without --yes.",
    "  use (skill setup)                may install the consumer use-design-system skill",
    "                                   (project scope) through the pinned npx skills@1.7.0",
    "                                   when exactly one agent is resolved; --no-skills opts",
    "                                   out and zero/multiple detections stay pending.",
    "  skills list                      offline read-only catalog plus actual inventory.",
    "  skills add/update/remove         explicit network through the pinned npx skills@1.7.0",
    "                                   (Node >= 22.20), preview + --yes only; installs",
    "                                   instructions only, never dependencies.",
    "  connect/check-usage/doctor/      offline and never edit dependencies (connect writes",
    "  components/tokens/check/         only its consumer config/AGENTS files; the others",
    "                                   are read-only).",
    "  setup-tailwind                   offline; the only command that edits its explicitly",
    "                                   named --css file, and it writes nothing in --dry-run",
    "                                   or --check.",
    "  self-update                      explicit network; read-only with --check. A real",
    "                                   update mutates only the prism-ds tooling via a fixed",
    "                                   npm/pnpm command with --ignore-scripts, requires",
    "                                   --yes, and never updates a design system.",
    "  recover                          offline read-only by default; --action with --yes",
    "                                   writes only through the reviewed connect or",
    "                                   setup-tailwind repair; --dry-run never writes.",
    "  No postinstall, no source copying, no publishing, no hidden package selection.",
    "",
    "Run a command with --help for its options.",
    "",
  ].join("\n");
}

export function connectHelpText() {
  return [
    `Usage: ${CLI_NAME} connect [package] --cwd <consumer-root> [options]`,
    "",
    "Configure an already-installed @prism-system design system in a consumer",
    "repository. Writes .design-system/config.json, .design-system/AGENTS.md, and an",
    "idempotent managed block in the consumer root AGENTS.md. Offline and",
    "configure-only: never installs packages, edits dependencies, copies source, or",
    "mutates the design-system repo.",
    "",
    "Arguments:",
    "  [package]             Optional package name or system id. When omitted, discovery",
    "                        uses .design-system/config.json, then package.json",
    '                        "designSystem" metadata, then a single dependency.',
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --strict              Enable strict mode (default true).",
    "  --no-strict           Disable strict mode.",
    "  --check               Report whether the consumer contract is up to date; write nothing.",
    "  --dry-run             Show planned writes without writing.",
    "  -h, --help            Show this help.",
    "",
    "Exit code is non-zero for every failed discovery, verification, or write.",
    "",
  ].join("\n");
}

export function searchHelpText() {
  return [
    `Usage: ${CLI_NAME} search [query...] [options]`,
    "",
    "Search the npm registry for supported @prism-system/ui-* design systems.",
    "Explicit network, read-only: nothing is installed, written, or selected.",
    "",
    "Arguments:",
    "  [query...]            Optional words. When omitted, lists supported styles.",
    "",
    "Options:",
    "  --registry <url>      Registry base URL (default: public npm registry).",
    "  --size <1..250>       Maximum results to request (default 25).",
    "  --json                Emit stable JSON (name, version, description, keywords).",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function infoHelpText() {
  return [
    `Usage: ${CLI_NAME} info <package-or-id> [version] [options]`,
    "",
    "Fetch and validate a published design system's manifest from the registry.",
    "Explicit network, read-only: the tarball is read and parsed in memory only.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  [version]             Optional exact semver; defaults to dist-tags.latest.",
    "",
    "Options:",
    "  --registry <url>      Registry base URL (default: public npm registry).",
    "  --json                Emit stable JSON including the validated full manifest.",
    "  -h, --help            Show this help.",
    "",
    "Tags, ranges, aliases, and git/file/workspace specs are rejected.",
    "",
  ].join("\n");
}

export function installHelpText() {
  return [
    `Usage: ${CLI_NAME} install <package-or-id> [version] --cwd <consumer-root> [options]`,
    "",
    "Explicitly install a supported design system into a consumer using npm or pnpm.",
    "This is an explicit dependency-mutating command. The registry is",
    "resolved and validated first; if it fails the package manager is not invoked.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  [version]             Optional exact semver; defaults to dist-tags.latest.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --save-dev            Add as a devDependency (default: prod).",
    "  --save-prod           Add as a dependency (default).",
    "  --exact               Save the exact resolved version (--save-exact).",
    "  --registry <url>      Registry base URL used for resolution and install.",
    "  --with-entry <value>  Select a target extension name, declared entrypoint, or",
    "                        consumer-relative source file (repeatable). The selected",
    "                        entry's declared peer requirements are planned too.",
    "  --peer <name@version> Exact version for a missing selected peer (repeatable;",
    "                        must satisfy the declared requirement range).",
    "  --dry-run             Resolve the exact target/command without spawning or writing.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
    "The manager is detected from packageManager or exactly one supported lockfile;",
    "missing/ambiguous managers fail closed. Lifecycle scripts are always disabled.",
    "",
  ].join("\n");
}

export function helpTextForUse() {
  return [
    `Usage: ${CLI_NAME} use <package-or-id> [version] --cwd <consumer-root> [options]`,
    "",
    "Install, verify, and connect one explicit design system, then optionally run",
    "the strict usage check. The package is never discovered or selected for you.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  [version]             Optional exact semver; defaults to dist-tags.latest.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --save-dev            Add as a devDependency (default: prod).",
    "  --save-prod           Add as a dependency (default).",
    "  --exact               Save the exact resolved version (--save-exact).",
    "  --registry <url>      Registry base URL used for resolution and install.",
    "  --strict              Enable strict mode for connect/check-usage.",
    "  --no-strict           Disable strict mode.",
    "  --ignore <glob>       Extra root-relative ignore for --check-usage (repeatable;",
    "                        requires --check-usage).",
    "  --check-usage         Run the strict usage check after a successful connect.",
    "  --tailwind --css <file>  Require Tailwind v4 and preflight one contained CSS file",
    "                        before install; configure the bridge after connect.",
    "  --with-entry <value>  Select a target extension name, declared entrypoint, or",
    "                        consumer-relative source file (repeatable). The selected",
    "                        entry's declared peer requirements are planned too.",
    "  --peer <name@version> Exact version for a missing selected peer (repeatable;",
    "                        must satisfy the declared requirement range).",
    "  --skill-agent <id>    Install the consumer use-design-system skill for this agent",
    "                        (repeatable; claude-code, codex, cursor, opencode). When",
    "                        omitted, exactly one detected agent is used; zero/multiple",
    "                        detections leave the skill pending with guidance.",
    "  --no-skills           Skip the default consumer skill setup entirely (exactly the",
    "                        previous use behavior).",
    "  --dry-run             Resolve and plan without spawning or writing.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
    "A failed package-manager install or verification stops before connect; a",
    "completed package-manager mutation is never rolled back automatically. The",
    "design-system setup and the instruction setup are not atomic: a skill failure",
    "is reported as a partial result with a rerun command, never as full success.",
    "",
  ].join("\n");
}

export function componentsHelpText() {
  return [
    `Usage: ${CLI_NAME} components [name] --cwd <consumer-root> [--json]`,
    "",
    "Offline, read-only component catalog for the design system installed in a",
    "consumer. It reports the components declared by the installed package's public",
    "./manifest export and the capability categories with availability derived",
    "only from those declared components. It never installs, executes package",
    "code, or reaches the network.",
    "",
    "Arguments:",
    "  [name]                Optional single component name. A known-but-unavailable",
    "                        optional is reported unavailable; an unknown name fails.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --json                Emit stable JSON.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function tokensHelpText() {
  return [
    `Usage: ${CLI_NAME} tokens [group] --cwd <consumer-root> [--json]`,
    "",
    "Offline, read-only token catalog for the design system installed in a consumer.",
    "It reports the semantic token groups and the generated CSS/Tailwind names.",
    "",
    "Arguments:",
    "  [group]               Optional token group: themes, typography, spacing,",
    "                        containers, breakpoints, layers, radius, shadow, motion.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --json                Emit stable JSON.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function checkHelpText() {
  return [
    `Usage: ${CLI_NAME} check --cwd <consumer-root> [--css <file>] [--entry <path-or-extension>] [--json]`,
    "",
    "One offline, read-only health report for a connected consumer: config, doctor",
    "diagnostics, public stylesheet/bridge exports, strict usage, and component",
    "availability. The CSS import order is checked only when --css <file> is given;",
    "otherwise the report does not scan for or guess a CSS file. Nothing is written.",
    "",
    "With --css the file is checked read-only against the setup-tailwind planner: the",
    "report passes only when no import change would be written, and fails when imports",
    "need adding or reordering.",
    "",
    "With --entry the named installed extension, declared entrypoint, or contained",
    "consumer file is scanned for literal import/require specifiers and every declared",
    "requirement is validated against the installed version and its semver range.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --css <file>          Optional explicit CSS file to check import order on.",
    "  --entry <path-or-extension>  Optional extension name, declared entrypoint, or",
    "                        consumer-relative source file to scan for prerequisites.",
    "  --json                Emit stable JSON.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function setupTailwindHelpText() {
  return [
    `Usage: ${CLI_NAME} setup-tailwind --cwd <consumer-root> --css <file> [--dry-run] [--json]`,
    `       ${CLI_NAME} setup-tailwind --check --cwd <consumer-root> --css <file> [--json]`,
    "",
    "Offline Tailwind v4 setup for a connected consumer. It edits exactly the",
    'explicit --css file so it loads "tailwindcss", the design-system bridge, and the',
    "stylesheet in the required order. It never installs, runs scripts, edits",
    "dependencies, or touches any other file.",
    "",
    "Modes:",
    "  (default)             Write the managed imports into the --css file.",
    "  --dry-run             Preview: report the planned change without writing, and",
    "                        exit 0 whether or not changes are needed. A dry run is",
    "                        not a check and never fails on pending changes.",
    "  --check               Pass/fail gate: run the same planner read-only and succeed",
    "                        only when plan.changed === false; when import changes are",
    "                        needed, report them and exit non-zero. Unlike --dry-run,",
    "                        pending changes are a failure.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --css <file>          The one existing CSS file to update (required; must stay",
    "                        inside --cwd).",
    '  --json                Emit stable JSON with a "mode" of "write" | "dry-run" |',
    '                        "check"; --check still exits non-zero on pending changes.',
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function upgradeHelpText() {
  return [
    `Usage: ${CLI_NAME} upgrade <package-or-id> <exact-version> --cwd <consumer-root> [options]`,
    "",
    "Explicitly upgrade an installed design system to an exact registry version. This",
    "mutates consumer dependencies through a fixed npm/pnpm command with",
    "--ignore-scripts, only when invoked. The installed valid manifest is compared",
    "against the validated target. JSON keeps component/token added/removed fields",
    "and adds component assortment, manifest metadata, and public export changes.",
    "Token values are not present in the manifest and cannot be diffed.",
    "The diff is reported before any mutation.",
    "",
    "Arguments:",
    "  <package-or-id>       A supported @prism-system/ui-* name or lower-kebab id.",
    "  <exact-version>       Required exact semver of the target release.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --dry-run             Resolve and preview without spawning or writing.",
    "  --json                Emit stable JSON.",
    "  --registry <url>      Registry base URL used for resolution and install.",
    "  --strict              Enable strict mode for the reconnect.",
    "  --no-strict           Disable strict mode.",
    "  --with-entry <value>  Select a target extension name, declared entrypoint, or",
    "                        consumer-relative source file (repeatable). The selected",
    "                        entry's declared peer requirements are planned too.",
    "  --peer <name@version> Exact version for a missing selected peer (repeatable;",
    "                        must satisfy the declared requirement range).",
    "  -h, --help            Show this help.",
    "",
    "Both positionals are required; tags, ranges, aliases, and git/file/workspace",
    "specs are rejected.",
    "",
  ].join("\n");
}

export function switchHelpText() {
  return [
    `Usage: ${CLI_NAME} switch <target> [version] --cwd <consumer-root> [options]`,
    "",
    "Switch a consumer to an exact, registry-validated design system version. The",
    "current system is discovered from the consumer; the target is never guessed.",
    "Missing component/extension/variant/token support and unverifiable dynamic",
    "usage are reported as blockers. Only literal module/CSS import substitutions",
    "and the generated connect files are planned; product source is never rewritten.",
    "The previous dependency is retained (removal is a separate `remove`).",
    "",
    "Arguments:",
    "  <target>              A supported @prism-system/ui-* name or lower-kebab id.",
    "  [version]             Optional exact semver; defaults to dist-tags.latest and",
    "                        is frozen to the exact previewed release before apply.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --registry <url>      Registry base URL used for resolution and install.",
    "  --css <file>          Optional explicit CSS file whose literal imports are planned.",
    "  --with-entry <value>  Select a target extension, declared entrypoint, or",
    "                        consumer-relative source file (repeatable).",
    "  --peer <name@version> Exact version for a missing selected peer (repeatable;",
    "                        must satisfy the declared requirement range).",
    "  --dry-run             Resolve and print the exact plan; never spawns or writes.",
    "  --yes                 Explicit confirmation for the real switch.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
    "Without --yes the exact plan is printed and nothing is changed (exit 1). A",
    "confirmed switch reuses the previewed plan and freezes the exact target version.",
    "",
  ].join("\n");
}

export function removeHelpText() {
  return [
    `Usage: ${CLI_NAME} remove [package] --cwd <consumer-root> [--css <file>]`,
    `                      [--dry-run] [--yes] [--json]`,
    "",
    "Explicitly remove one selected design system from a consumer. Removal is",
    "refused while active source/CSS imports or token references remain. Only the",
    "selected dependency and unchanged generated integration (config, AGENTS block,",
    "managed CSS imports) are removed; user-edited files, malformed markers,",
    "unrelated dependencies/peers, and user CSS are preserved and reported.",
    "",
    "Arguments:",
    "  [package]             Optional explicit package or system id; otherwise the",
    "                        connected/discovered system is used.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --css <file>          Optional explicit CSS file to clean managed imports from.",
    "  --dry-run             Print the exact plan; never spawns or writes.",
    "  --yes                 Explicit confirmation for the real removal.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
    "Without --yes the exact plan is printed and nothing is changed (exit 1).",
    "",
  ].join("\n");
}

export function skillsHelpText() {
  return [
    `Usage: ${CLI_NAME} skills list --cwd <consumer-root> [--global] [--json]`,
    `       ${CLI_NAME} skills add|update|remove <catalog-id> --cwd <consumer-root>`,
    `                    --agent <id> [--global] [--dry-run] [--yes] [--json]`,
    "",
    "Manage official Prism skills and curated general-design skills. Catalog and",
    "inventory are offline and read-only; `list` shows the static catalog plus the",
    "actual installed inventory (both scopes by default) and reports external or",
    "unmanaged installs and shared canonical placements honestly.",
    "",
    "Mutations run only the pinned `npx --yes --ignore-scripts skills@1.7.0`",
    "(Node >= 22.20) after an explicit preview and --yes. They install instructions",
    "only: never product dependencies, never a guessed source/skill/agent, and",
    "never a destructive replace of an unmanaged or modified install.",
    "",
    "Arguments:",
    "  list                  Show the catalog and the actual installed inventory.",
    "  add|update|remove     Preview (and with --yes, execute) one catalog skill.",
    "  <catalog-id>          An allowlisted catalog id (for example use-design-system).",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --agent <id>          Agent selection (repeatable; claude-code, codex, cursor,",
    "                        opencode). Required for add/update/remove.",
    "  --global              List/install at global scope instead of project scope.",
    "  --dry-run             Preview the frozen plan; never spawns or writes.",
    "  --yes                 Explicit confirmation for the mutation.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
  ].join("\n");
}

export function selfUpdateHelpText() {
  return [
    `Usage: ${CLI_NAME} self-update [--check] [--cwd <consumer-root>] [--global]`,
    `                       [--manager npm|pnpm] [--registry <url>] [--dry-run]`,
    `                       [--yes] [--json]`,
    "",
    "Check for and explicitly update the prism-ds tooling package itself",
    "(@prism-system/tools). This is not `upgrade`, which updates a design-system",
    "package: self-update never touches a design system, and it never assumes a",
    "global or source/workspace installation.",
    "",
    "Modes:",
    "  (default)             Resolve the exact target and, only with --yes, run the",
    "                        fixed npm/pnpm command for the detected or explicitly",
    "                        selected installation.",
    "  --check               Read-only update check; never writes or spawns. Reports",
    "                        the running version, the latest version, the detected",
    "                        installation, and safe advice; it exits non-zero only",
    "                        when the check itself failed (for example offline).",
    "  --dry-run             Resolve and print the fixed command without spawning or",
    "                        writing; never spawns even when --yes is also given.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root for a local dependency update. When",
    "                        omitted, the running package root is used; a source or",
    "                        workspace checkout is never updated as a global install.",
    "  --global              Authorize a global update (requires --manager when the",
    "                        global root cannot be verified).",
    "  --manager <npm|pnpm>  Explicit package manager; never guessed.",
    "  --registry <url>      Registry base URL for the version read.",
    "  --yes                 Explicit confirmation for the real update.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
    "--check cannot be combined with --dry-run or --yes. A completed package-manager",
    "mutation is never rolled back automatically.",
    "",
  ].join("\n");
}

export function recoverHelpText() {
  return [
    `Usage: ${CLI_NAME} recover [package] --cwd <consumer-root> [--css <file>]`,
    `                    [--entry <entry>] [--action <id>] [--dry-run] [--yes]`,
    `                    [--json]`,
    "",
    "Read-only project-health recovery: collect a structured report and list only",
    "the suggestions that are valid for the observed state. Nothing is written by",
    "default.",
    "",
    "Arguments:",
    "  [package]             Optional explicit design-system package or system id.",
    "",
    "Options:",
    "  --cwd <path>          Consumer root (required; never defaults to a repo root).",
    "  --package <name>      Optional explicit design-system package or system id",
    "                        (same as the positional; do not pass both).",
    "  --css <file>          Optional explicit CSS file to inspect (never guessed).",
    "  --entry <path-or-extension>  Optional explicit entry to scan (never guessed).",
    "  --action <id>         Preview one exact suggested action; only executable",
    "                        suggestions can run. Without --yes nothing is written.",
    "  --dry-run             Preview the selected action and write nothing.",
    "  --yes                 Execute the previewed action through the reviewed",
    "                        connect or setup-tailwind repair. Requires --action.",
    "  --json                Emit the stable structured result.",
    "  -h, --help            Show this help.",
    "",
    "Only connect and setup-tailwind repairs are executable, and only for a known",
    "installed package or an explicit CSS file. Everything else is guidance with an",
    "exact safe command. A successful repair never implies the whole project is",
    "healthy; the targeted state is rechecked and remaining issues are reported.",
    "",
  ].join("\n");
}

function toCamelFlag(key) {
  return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Parse shared CLI arguments with a per-command allowlist. Throws on unknown
 * options, missing values, boolean options given values, or extra positionals.
 */
function parseOptions(
  argv,
  { maxPositionals = 0, booleans = [], values = [], repeatable = [] } = {},
) {
  const options = {
    cwd: undefined,
    strict: undefined,
    check: false,
    dryRun: false,
    ignore: [],
    help: false,
    json: false,
    size: undefined,
    registry: undefined,
    saveDev: false,
    saveProd: false,
    exact: false,
    checkUsage: false,
    tailwind: false,
    css: undefined,
    entry: undefined,
    withEntry: [],
    peer: [],
    agent: [],
    skillAgent: [],
  };
  const booleanSet = new Set(booleans);
  const valueSet = new Set(values);
  const repeatableSet = new Set(repeatable);
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const inlineValue = equals === -1 ? undefined : arg.slice(equals + 1);

    if (key === "strict" && booleanSet.has("strict")) {
      if (inlineValue !== undefined) throw new Error("Option --strict does not take a value.");
      options.strict = true;
      continue;
    }
    if (key === "no-strict" && booleanSet.has("strict")) {
      if (inlineValue !== undefined) throw new Error("Option --no-strict does not take a value.");
      options.strict = false;
      continue;
    }
    if (booleanSet.has(key)) {
      if (inlineValue !== undefined) throw new Error(`Option --${key} does not take a value.`);
      options[toCamelFlag(key)] = true;
      continue;
    }
    if (valueSet.has(key) || repeatableSet.has(key)) {
      let value = inlineValue;
      if (value === undefined) {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (repeatableSet.has(key)) options[toCamelFlag(key)].push(value);
      else options[toCamelFlag(key)] = value;
      continue;
    }
    throw new Error(`Unknown option: --${key}`);
  }

  if (positionals.length > maxPositionals) {
    throw new Error(
      `Expected at most ${maxPositionals} positional argument(s), received: ${positionals.join(", ")}.`,
    );
  }
  return { options, positionals };
}

/* -------------------------------------------------------------------------- */
/* connect                                                                    */
/* -------------------------------------------------------------------------- */

function reportConnectFailure(result) {
  const label = result.check
    ? "Consumer contract check failed"
    : result.dryRun
      ? "Consumer connect dry run failed"
      : "Consumer connect failed";
  process.stdout.write(`${label}\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write("\nNothing was installed or published.\n");
  process.exitCode = 1;
}

function reportConnectSuccess(result) {
  const plan = result.plan;
  const label = `${plan.packageName}@${plan.version}`;
  if (result.check) {
    process.stdout.write(
      result.changed
        ? `Consumer contract is out of date for ${label} (run connect to update).\n`
        : `Consumer contract is up to date for ${label}.\n`,
    );
    if (result.changed) process.exitCode = 1;
    return;
  }
  if (result.dryRun) {
    process.stdout.write(`Connect dry run for ${label} in ${plan.consumerRoot}\n\n`);
    if (result.changes.length === 0) {
      process.stdout.write("  no changes (already connected)\n");
    } else {
      for (const change of result.changes) {
        process.stdout.write(`  would write ${change.kind}: ${change.path}\n`);
      }
    }
    process.stdout.write("\nDry run: nothing was written.\n");
    return;
  }
  process.stdout.write(
    result.changed
      ? `Connected ${label} in ${plan.consumerRoot}.\n`
      : `Already connected ${label} in ${plan.consumerRoot} (no changes).\n`,
  );
}

export function runConnectCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["strict", "check", "dry-run"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(connectHelpText());
    return;
  }
  const result = connectDesignSystem({
    cwd: parsed.options.cwd,
    package: parsed.positionals[0],
    strict: parsed.options.strict,
    check: parsed.options.check,
    dryRun: parsed.options.dryRun,
  });
  if (!result.ok) {
    reportConnectFailure(result);
    return;
  }
  reportConnectSuccess(result);
}

/* -------------------------------------------------------------------------- */
/* check-usage                                                                */
/* -------------------------------------------------------------------------- */

function reportUsage(result) {
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      process.stdout.write(
        `${finding.file}:${finding.line}:${finding.column}  ${finding.severity}  ` +
          `${finding.ruleId}  ${finding.message}\n`,
      );
    }
    process.stdout.write("\n");
  }
  process.stdout.write(`${result.summary}\n`);
  if (result.ok) {
    process.stdout.write("Usage check passed.\n");
  } else {
    process.stdout.write("Usage check failed.\n");
    process.exitCode = 1;
  }
}

export async function runCheckUsageCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["strict"],
      values: ["cwd"],
      repeatable: ["ignore"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    const { helpText: usageHelp } = await import("./usage.mjs");
    process.stdout.write(usageHelp());
    return;
  }
  const { checkUsage } = await import("./usage.mjs");
  let result;
  try {
    result = checkUsage({
      cwd: parsed.options.cwd,
      ignore: parsed.options.ignore,
      strict: parsed.options.strict,
    });
  } catch (error) {
    process.stdout.write(`Usage check failed\n\n  ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  reportUsage(result);
}

/* -------------------------------------------------------------------------- */
/* doctor                                                                     */
/* -------------------------------------------------------------------------- */

export function runDoctorCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["check", "dry-run"],
      values: ["cwd", "entry"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(doctorHelpText());
    return;
  }
  if (parsed.options.check || parsed.options.dryRun) {
    process.stderr.write("doctor is read-only and accepts neither --check nor --dry-run.\n");
    process.exitCode = 1;
    return;
  }
  const report = collectDoctorReport({
    cwd: parsed.options.cwd,
    package: parsed.positionals[0],
    entry: parsed.options.entry,
  });
  process.stdout.write(`${CLI_NAME} doctor\n`);
  if (report.consumerRoot) process.stdout.write(`Consumer root: ${report.consumerRoot}\n`);
  process.stdout.write("\n");
  for (const check of report.checks) {
    process.stdout.write(`${check.ok ? "[ok]" : "[FAIL]"} ${check.label}: ${check.detail}\n`);
  }
  process.stdout.write("\n");
  if (report.ok) {
    process.stdout.write("Doctor passed.\n");
  } else {
    const count = report.checks.filter((check) => !check.ok).length;
    process.stdout.write(`Doctor found ${count} problem(s).\n`);
    const root = report.consumerRoot ?? parsed.options.cwd ?? "<consumer-root>";
    process.stdout.write(
      `\nRun "${CLI_NAME} recover --cwd ${root}" for applicable recovery suggestions.\n`,
    );
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------------------- */
/* search                                                                     */
/* -------------------------------------------------------------------------- */

function reportCommandFailure(label, error) {
  process.stdout.write(`${label}\n\n  ${error.message}\n`);
  process.exitCode = 1;
}

export async function runSearchCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: Number.MAX_SAFE_INTEGER,
      booleans: ["json"],
      values: ["registry", "size"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(searchHelpText());
    return;
  }
  const { searchDesignSystems } = await import("./catalog.mjs");
  const { buildSearchResult } = await import("./registry.mjs");
  try {
    const result = await searchDesignSystems({
      query: parsed.positionals,
      registry: parsed.options.registry,
      size: parsed.options.size,
    });
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify(buildSearchResult(result), null, 2)}\n`);
      return;
    }
    process.stdout.write(
      `Supported design systems (registry: ${result.registry}, query: ${JSON.stringify(result.query)}):\n\n`,
    );
    if (result.results.length === 0) {
      process.stdout.write("  (none found)\n");
    }
    for (const entry of result.results) {
      process.stdout.write(`  ${entry.name}@${entry.version}\n`);
      if (entry.description) process.stdout.write(`    ${entry.description}\n`);
      if (entry.keywords.length > 0) {
        process.stdout.write(`    keywords: ${entry.keywords.join(", ")}\n`);
      }
    }
    process.stdout.write(`\n${result.results.length} result(s).\n`);
  } catch (error) {
    reportCommandFailure("Search failed", error);
  }
}

/* -------------------------------------------------------------------------- */
/* info                                                                       */
/* -------------------------------------------------------------------------- */

export async function runInfoCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["json"],
      values: ["registry"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(infoHelpText());
    return;
  }
  const target = parsed.positionals[0];
  if (target === undefined) {
    process.stderr.write("info requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  const { inspectDesignSystem } = await import("./catalog.mjs");
  const { buildInfoResult } = await import("./registry.mjs");
  try {
    const info = await inspectDesignSystem({
      package: target,
      version: parsed.positionals[1],
      registry: parsed.options.registry,
    });
    const result = buildInfoResult(info);
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const componentNames = Object.keys(result.components);
    process.stdout.write(`${result.package}@${result.version}\n`);
    process.stdout.write(`  name:      ${result.name}\n`);
    process.stdout.write(`  density:   ${result.design.density ?? "(unset)"}\n`);
    process.stdout.write(`  theme:     ${result.design.theme ?? "(unset)"}\n`);
    process.stdout.write(`  radius:    ${result.design.radius ?? "(unset)"}\n`);
    if (result.design.keywords.length > 0) {
      process.stdout.write(`  keywords:  ${result.design.keywords.join(", ")}\n`);
    }
    process.stdout.write(`  components: ${componentNames.join(", ")}\n`);
    if (result.availableExtensions.length > 0) {
      process.stdout.write(`  extensions: ${result.availableExtensions.join(", ")}\n`);
      for (const extension of result.extensions) {
        process.stdout.write(
          `    ${extension.name} -> ${extension.importPath} (api v${extension.apiVersion})\n`,
        );
      }
    }
  } catch (error) {
    reportCommandFailure("Info failed", error);
  }
}

/* -------------------------------------------------------------------------- */
/* install / use                                                              */
/* -------------------------------------------------------------------------- */

function reportInstallFailure(result) {
  process.stdout.write(`Install failed (boundary: ${result.boundary ?? "unknown"})\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write("\nNo consumer dependencies were changed if the registry step failed.\n");
  process.exitCode = 1;
}

/** Write the selected entry's peer plan as human-readable lines. */
function writePeerPlan(peers, label = "peer plan") {
  if (!Array.isArray(peers) || peers.length === 0) return;
  process.stdout.write(`  ${label}:\n`);
  for (const peer of peers) {
    process.stdout.write(
      `    ${peer.name} [${peer.kind}] ${peer.range}${peer.optional ? " optional" : ""} -> ` +
        `${peer.action}${peer.version ? ` ${peer.version}` : ""}` +
        `${peer.installed ? ` (installed ${peer.installed})` : ""}\n`,
    );
  }
}

/**
 * Report the extensions the bounded active-usage scan auto-selected for
 * `switch` (and, on failure, why a peer is required). Uses the literal usage
 * entrypoint metadata when the scan attributed one, falling back to the name.
 */
function writeAutoSelectedEntries(autoSelectedEntries) {
  if (!Array.isArray(autoSelectedEntries) || autoSelectedEntries.length === 0) return;
  for (const entry of autoSelectedEntries) {
    if (entry === null || typeof entry !== "object") continue;
    const name = typeof entry.name === "string" && entry.name !== "" ? entry.name : "(unnamed)";
    const entrypoint =
      typeof entry.entrypoint === "string" && entry.entrypoint !== "" ? entry.entrypoint : name;
    process.stdout.write(`  automatically selected from usage: ${name} (${entrypoint})\n`);
  }
}

function reportInstallDryRun(result) {
  process.stdout.write(
    `Install dry run for ${result.package}@${result.version} (${result.manager}) in ` +
      `${result.consumerRoot}\n`,
  );
  if (result.command) {
    process.stdout.write(
      `  command: ${[result.command.manager, ...result.command.args].join(" ")}\n`,
    );
  }
  writePeerPlan(result.peers);
  process.stdout.write("\nDry run: nothing was installed.\n");
}

export async function runInstallCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["save-dev", "save-prod", "exact", "dry-run", "json"],
      values: ["cwd", "registry"],
      repeatable: ["with-entry", "peer"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(installHelpText());
    return;
  }
  const target = parsed.positionals[0];
  if (target === undefined) {
    process.stderr.write("install requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  if (parsed.options.saveDev && parsed.options.saveProd) {
    process.stderr.write("--save-dev and --save-prod are mutually exclusive.\n");
    process.exitCode = 1;
    return;
  }
  const { installDesignSystem } = await import("./catalog.mjs");
  const result = await installDesignSystem({
    cwd: parsed.options.cwd,
    package: target,
    version: parsed.positionals[1],
    saveDev: parsed.options.saveDev,
    exact: parsed.options.exact,
    registry: parsed.options.registry,
    dryRun: parsed.options.dryRun,
    withEntry: parsed.options.withEntry,
    peers: parsed.options.peer,
  });
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    reportInstallFailure(result);
    return;
  }
  if (result.dryRun) {
    reportInstallDryRun(result);
    return;
  }
  process.stdout.write(
    `Installed ${result.package}@${result.version} with ${result.manager} in ${result.consumerRoot}.\n`,
  );
  process.stdout.write(`  registry: ${result.registry}\n`);
  process.stdout.write(`  verified: ${result.installedDir}\n`);
}

function reportUseFailure(result) {
  process.stdout.write(`Use failed (boundary: ${result.boundary ?? "unknown"})\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  if (result.install?.ok) {
    process.stdout.write(
      "\nThe package was installed and verified, but connect/check-usage did not complete; " +
        "no rollback was attempted.\n",
    );
  } else {
    process.stdout.write(
      "\nThe package was not installed; no consumer dependencies were changed.\n",
    );
  }
  process.exitCode = 1;
}

function reportUseDryRun(result) {
  const install = result.install;
  process.stdout.write(
    `Use dry run for ${install.package}@${install.version} (${install.manager}) in ` +
      `${install.consumerRoot}\n\n`,
  );
  for (const change of result.plannedChanges) {
    if (change.kind === "dependency") {
      process.stdout.write(`  dependency: ${[change.manager, ...change.command.args].join(" ")}\n`);
    } else if (change.kind === "css") {
      process.stdout.write(
        `  css: ${change.path} (${change.changed ? "would update" : "unchanged"})\n`,
      );
    } else if (change.kind === "connect") {
      process.stdout.write(`  connect: ${change.path}\n`);
    }
  }
  writePeerPlan(install.peers);
  process.stdout.write("\nDry run: nothing was installed, connected, or written.\n");
}

function reportUseSkills(result) {
  const setup = result.skillSetup;
  if (setup === null || setup === undefined || setup.enabled !== true) return;
  process.stdout.write(`  skills: ${setup.status} (${setup.skillId}, ${setup.scope} scope)\n`);
  if (setup.agents.length > 0) process.stdout.write(`    agents: ${setup.agents.join(", ")}\n`);
  if (setup.revision) process.stdout.write(`    revision: ${setup.revision}\n`);
  if (setup.command) {
    process.stdout.write(
      `    command: ${setup.command.executable} ${setup.command.args.join(" ")}\n`,
    );
  }
  for (const warning of setup.warnings) process.stdout.write(`    warning: ${warning}\n`);
  for (const failure of setup.failures) process.stdout.write(`    failure: ${failure}\n`);
  if (setup.guidance) process.stdout.write(`    guidance: ${setup.guidance}\n`);
  if (setup.nextCommand) process.stdout.write(`    next: ${setup.nextCommand}\n`);
}

export async function runUseCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: [
        "strict",
        "save-dev",
        "save-prod",
        "exact",
        "check-usage",
        "tailwind",
        "dry-run",
        "json",
        "no-skills",
      ],
      values: ["cwd", "registry", "css"],
      repeatable: ["ignore", "with-entry", "peer", "skill-agent"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(helpTextForUse());
    return;
  }
  const target = parsed.positionals[0];
  if (target === undefined) {
    process.stderr.write("use requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  if (parsed.options.saveDev && parsed.options.saveProd) {
    process.stderr.write("--save-dev and --save-prod are mutually exclusive.\n");
    process.exitCode = 1;
    return;
  }
  if (parsed.options.noSkills && parsed.options.skillAgent.length > 0) {
    process.stderr.write("--no-skills cannot be combined with --skill-agent.\n");
    process.exitCode = 1;
    return;
  }
  const useOptions = {
    cwd: parsed.options.cwd,
    package: target,
    version: parsed.positionals[1],
    saveDev: parsed.options.saveDev,
    exact: parsed.options.exact,
    registry: parsed.options.registry,
    strict: parsed.options.strict,
    ignore: parsed.options.ignore,
    checkUsage: parsed.options.checkUsage,
    dryRun: parsed.options.dryRun,
    tailwind: parsed.options.tailwind,
    cssPath: parsed.options.css,
    withEntry: parsed.options.withEntry,
    peers: parsed.options.peer,
  };
  let result;
  if (parsed.options.noSkills) {
    // `--no-skills` is exactly the previous `use` behavior: the design-system
    // lifecycle only, with no skill resolver, read, or spawn.
    const { runUseDesignSystem } = await import("./catalog.mjs");
    result = await runUseDesignSystem(useOptions);
  } else {
    // The shared wrapper previews the exact design-system target/connect plan
    // and the frozen skill plan before any mutation, then reuses them on the
    // confirmed run. The explicit `use` invocation is the confirmation.
    const { runUseWithSkills } = await import("./use-skills.mjs");
    result = await runUseWithSkills({
      ...useOptions,
      skills: true,
      skillAgents: parsed.options.skillAgent,
      confirmed: parsed.options.dryRun !== true,
    });
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    reportUseFailure(result);
    reportUseSkills(result);
    return;
  }
  if (result.dryRun) {
    reportUseDryRun(result);
    reportUseSkills(result);
    return;
  }
  process.stdout.write(
    `Used ${result.install.package}@${result.install.version} with ${result.install.manager} in ${result.install.consumerRoot}.\n`,
  );
  process.stdout.write(`  registry: ${result.install.registry}\n`);
  process.stdout.write(
    result.connect.changed
      ? "  connected: consumer contract written\n"
      : "  connected: already up to date\n",
  );
  if (result.usage) {
    process.stdout.write(`  usage: ${result.usage.summary}\n`);
  }
  if (result.tailwindSetup) {
    process.stdout.write(
      result.tailwindSetup.changed
        ? "  tailwind: updated the Tailwind bridge imports\n"
        : "  tailwind: imports already up to date\n",
    );
  }
  reportUseSkills(result);
}

/* -------------------------------------------------------------------------- */
/* components                                                                 */
/* -------------------------------------------------------------------------- */

function reportComponentCatalog(result) {
  const lines = [
    `${result.package}@${result.version} — component catalog (contract version ${result.contractVersion})`,
    `  showcase: ${result.showcase.route}`,
    `  ${result.counts.required} required, ${result.counts.optional} optional; ` +
      `${result.counts.available} available, ${result.counts.unavailable} unavailable`,
    "  capability categories:",
  ];
  for (const [category, entry] of Object.entries(result.capabilities.categories)) {
    const total = entry.required.length + entry.optional.length;
    lines.push(
      `    ${category}: ${entry.available.length}/${total} available` +
        (entry.unavailable.length > 0 ? `; unavailable: ${entry.unavailable.join(", ")}` : ""),
    );
  }
  lines.push("");
  for (const component of result.components) {
    const kind = component.required ? "required" : "optional";
    const state = component.available ? "available" : "unavailable";
    lines.push(`  ${component.name}  [${kind}] ${state}`);
  }
  if (result.extensions.length > 0) {
    lines.push("");
    lines.push(`  custom extensions (${result.extensions.length}):`);
    for (const extension of result.extensions) {
      const effect = extension.effects
        ? ` effects: ${extension.effects.features.join("+")}/${extension.effects.rendering}`
        : " effects: undeclared";
      lines.push(`    ${extension.name}  api v${extension.apiVersion}  ${extension.importPath}`);
      lines.push(`      ${extension.requirements.length} requirement(s)${effect}`);
    }
  }
  if (result.requested) {
    const requested = result.requested;
    lines.push("");
    if (requested.kind === "extension") {
      lines.push(
        `Requested ${requested.name}: extension → ${requested.importPath} (api v${requested.apiVersion})`,
      );
      for (const requirement of requested.requirements) {
        lines.push(
          `  ${requirement.name}  [${requirement.kind}] ${requirement.range}` +
            `${requirement.optional ? " optional" : ""}`,
        );
      }
      lines.push("");
      return lines.join("\n");
    }
    lines.push(
      `Requested ${requested.name}: ${requested.required ? "required" : "optional"}, ` +
        `${requested.available ? "available" : "unavailable"}`,
    );
    if (requested.available) {
      lines.push(`  variants: ${requested.variants.join(", ") || "(none)"}`);
      lines.push(`  sizes:    ${requested.sizes.join(", ") || "(none)"}`);
      lines.push(`  members:  ${requested.members.join(", ") || "(none)"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function runComponentsCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["json"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(componentsHelpText());
    return;
  }
  let result;
  try {
    const { listDesignSystemComponents } = await import("./components.mjs");
    result = listDesignSystemComponents({
      cwd: parsed.options.cwd,
      name: parsed.positionals[0],
    });
  } catch (error) {
    reportCommandFailure("Component catalog failed", error);
    return;
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${reportComponentCatalog(result)}\n`);
}

/* -------------------------------------------------------------------------- */
/* tokens                                                                     */
/* -------------------------------------------------------------------------- */

function reportTokenCatalog(result) {
  const lines = [
    `${result.package}@${result.version} — token catalog (contract version ${result.contractVersion})`,
  ];
  lines.push(`  css prefix:      ${result.prefixes.css}`);
  lines.push(`  tailwind prefix: ${result.prefixes.tailwind}`);
  lines.push(`  ${result.counts.groups} group(s), ${result.counts.tokens} token(s)`);
  lines.push("");
  for (const group of result.groups) {
    lines.push(`  ${group.group} (${group.tokens.length})`);
    for (const token of group.tokens) {
      const mapped = token.tailwind
        ? (token.tailwind.utility ?? token.tailwind.variant ?? "(bridge variable)")
        : "(none)";
      lines.push(`    ${token.name}  css: ${token.cssVariable}  tailwind: ${mapped}`);
    }
  }
  if (result.requested) {
    lines.push("");
    lines.push(
      `Requested group ${result.requested.group}: ${result.requested.tokens.length} token(s)`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function runTokensCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["json"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(tokensHelpText());
    return;
  }
  let result;
  try {
    const { listDesignSystemTokens } = await import("./tokens.mjs");
    result = listDesignSystemTokens({
      cwd: parsed.options.cwd,
      group: parsed.positionals[0],
    });
  } catch (error) {
    reportCommandFailure("Token catalog failed", error);
    return;
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${reportTokenCatalog(result)}\n`);
}

/* -------------------------------------------------------------------------- */
/* check                                                                      */
/* -------------------------------------------------------------------------- */

function reportCheck(result) {
  const lines = [result.summary, ""];
  for (const check of result.checks) {
    lines.push(`  [${check.status}] ${check.label}: ${check.detail}`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function runCheckCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["json"],
      values: ["cwd", "css", "entry"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(checkHelpText());
    return;
  }
  let result;
  try {
    const { checkDesignSystem } = await import("./check.mjs");
    result = checkDesignSystem({
      cwd: parsed.options.cwd,
      cssPath: parsed.options.css,
      entry: parsed.options.entry,
    });
  } catch (error) {
    reportCommandFailure("Check failed", error);
    return;
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  process.stdout.write(`${reportCheck(result)}`);
  if (result.ok) {
    process.stdout.write("Check passed.\n");
  } else {
    process.stdout.write("Check failed.\n");
    const root = result.cwd ?? parsed.options.cwd ?? "<consumer-root>";
    process.stdout.write(
      `Run "${CLI_NAME} recover --cwd ${root}" for applicable recovery suggestions.\n`,
    );
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------------------- */
/* setup-tailwind                                                             */
/* -------------------------------------------------------------------------- */

export async function runSetupTailwindCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["dry-run", "check", "json"],
      values: ["cwd", "css"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(setupTailwindHelpText());
    return;
  }
  if (parsed.options.check && parsed.options.dryRun) {
    process.stderr.write("--check and --dry-run are mutually exclusive.\n");
    process.exitCode = 1;
    return;
  }
  const mode = parsed.options.check ? "check" : parsed.options.dryRun ? "dry-run" : "write";
  const { setupTailwind } = await import("./tailwind-setup.mjs");
  const result = setupTailwind({
    cwd: parsed.options.cwd,
    cssPath: parsed.options.css,
    dryRun: mode !== "write",
  });
  // `--check` passes iff the planner would change nothing; a plain `--dry-run`
  // is only a preview and never fails on pending changes; the dry run itself
  // never writes, so `result.changed` is always false.
  const pending = result.ok && (result.plan?.changed === true || result.changes.length > 0);
  const passed = result.ok && (mode !== "check" || !pending);
  if (parsed.options.json) {
    // `mode` makes the read-only gate (`--check`) distinguishable from the
    // preview (`--dry-run`) and the write mode, whose helper result is otherwise
    // identical. `--check` still exits non-zero when changes are pending.
    process.stdout.write(`${JSON.stringify({ mode, ...result }, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    process.stdout.write("Tailwind setup failed\n\n");
    for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
    process.exitCode = 1;
    return;
  }
  if (mode === "check") {
    if (pending) {
      process.stdout.write(
        `Tailwind setup check failed: CSS imports need adding or reordering in ` +
          `${result.plan.cssPath} (this check changed nothing).\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Tailwind setup check passed: ${result.plan.cssPath} already loads the required imports.\n`,
    );
    return;
  }
  if (mode === "dry-run") {
    process.stdout.write(
      pending
        ? `Tailwind setup dry run: CSS imports need adding or reordering in ` +
            `${result.plan.cssPath}; a --check would fail and exit non-zero.\n`
        : `Tailwind setup dry run: no changes needed; ${result.plan.cssPath} already ` +
            "loads the required imports.\n",
    );
    process.stdout.write("Dry run: nothing was written (preview only; exit 0).\n");
    return;
  }
  process.stdout.write(
    result.changed
      ? `Updated ${result.plan.cssPath} to load the required imports.\n`
      : `No changes needed; ${result.plan.cssPath} already loads the required imports.\n`,
  );
}

/* -------------------------------------------------------------------------- */
/* upgrade                                                                    */
/* -------------------------------------------------------------------------- */

function reportUpgradeFailure(result) {
  process.stdout.write(`Upgrade failed (boundary: ${result.boundary ?? "unknown"})\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  if (Array.isArray(result.preview) && result.preview.length > 0) {
    process.stdout.write("\n");
    for (const line of result.preview) process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write("\nA failed registry step changed no dependencies.\n");
  process.exitCode = 1;
}

function reportUpgradeDryRun(result) {
  process.stdout.write(
    `Upgrade dry run: ${result.package} ${result.fromVersion} -> ${result.toVersion}\n\n`,
  );
  for (const line of result.preview) process.stdout.write(`  ${line}\n`);
  process.stdout.write("\n  planned changes:\n");
  for (const change of result.plannedChanges) {
    if (change.kind === "dependency") {
      process.stdout.write(
        `    dependency: ${[change.command.manager, ...change.command.args].join(" ")}\n`,
      );
    } else {
      process.stdout.write(`    ${change.kind}: ${change.path}\n`);
    }
  }
  writePeerPlan(result.peers);
  process.stdout.write("\nDry run: nothing was installed or written.\n");
}

export async function runUpgradeCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["strict", "dry-run", "json"],
      values: ["cwd", "registry"],
      repeatable: ["with-entry", "peer"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(upgradeHelpText());
    return;
  }
  const target = parsed.positionals[0];
  const version = parsed.positionals[1];
  if (target === undefined || target.trim() === "") {
    process.stderr.write("upgrade requires a package or system id.\n");
    process.exitCode = 1;
    return;
  }
  if (version === undefined || version.trim() === "") {
    process.stderr.write("upgrade requires an explicit exact <version>.\n");
    process.exitCode = 1;
    return;
  }
  const { upgradeDesignSystem } = await import("./catalog.mjs");
  const result = await upgradeDesignSystem({
    cwd: parsed.options.cwd,
    package: target,
    version,
    strict: parsed.options.strict,
    registry: parsed.options.registry,
    dryRun: parsed.options.dryRun,
    withEntry: parsed.options.withEntry,
    peers: parsed.options.peer,
  });
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    reportUpgradeFailure(result);
    return;
  }
  if (result.dryRun) {
    reportUpgradeDryRun(result);
    return;
  }
  process.stdout.write(
    `Upgraded ${result.package} ${result.fromVersion} -> ${result.toVersion} with ` +
      `${result.manager} in ${result.consumerRoot}.\n`,
  );
  process.stdout.write(`  registry: ${result.registry}\n`);
  process.stdout.write(
    result.connect?.changed
      ? "  connected: consumer contract written\n"
      : "  connected: already up to date\n",
  );
}

/* -------------------------------------------------------------------------- */
/* switch / remove                                                            */
/* -------------------------------------------------------------------------- */

function writeLifecycleChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    process.stdout.write("  (no changes)\n");
    return;
  }
  for (const change of changes) {
    if (change.kind === "dependency") {
      process.stdout.write(`  dependency: ${[change.manager, ...change.command.args].join(" ")}\n`);
      continue;
    }
    const label =
      change.kind === "file" && change.fileKind ? `file (${change.fileKind})` : change.kind;
    const site = change.path ?? change.directory ?? "";
    process.stdout.write(`  ${label}: ${site}${change.changed === false ? " (unchanged)" : ""}\n`);
  }
}

function writeCompatibility(compatibility) {
  if (compatibility === null || compatibility === undefined) return;
  const coverage = compatibility.coverage ?? {};
  process.stdout.write(
    `  usage coverage: ${coverage.filesScanned ?? 0} file(s), ` +
      `${coverage.moduleReferences ?? 0} module reference(s), ` +
      `${coverage.components ?? 0} component(s), ${coverage.variants ?? 0} variant(s), ` +
      `${coverage.tokenReferences ?? 0} token reference(s), ` +
      `${coverage.unverified ?? 0} unverified case(s)\n`,
  );
  if (coverage.cssFile) process.stdout.write(`  css file: ${coverage.cssFile}\n`);
  for (const blocker of compatibility.blockers ?? []) {
    const site = blocker.file ? ` (${blocker.file}${blocker.line ? `:${blocker.line}` : ""})` : "";
    process.stdout.write(`  blocker [${blocker.code}]${site}: ${blocker.message}\n`);
  }
  for (const warning of compatibility.warnings ?? []) {
    process.stdout.write(`  warning [${warning.code}]: ${warning.message}\n`);
  }
}

function reportLifecycleFailure(verb, result) {
  process.stdout.write(
    `${verb} failed (boundary: ${result.boundary ?? "unknown"}` +
      `${result.reason ? `, reason: ${result.reason}` : ""})\n\n`,
  );
  for (const failure of result.failures ?? []) process.stdout.write(`  ${failure}\n`);
  writeAutoSelectedEntries(result.autoSelectedEntries);
  writeCompatibility(result.compatibility);
  if (result.note) process.stdout.write(`\n  ${result.note}\n`);
  process.stdout.write("\nNo rollback was attempted.\n");
  process.exitCode = 1;
}

function reportSwitchOutcome(result) {
  const from = result.from ?? null;
  const to = result.to ?? null;
  const consent = result.boundary === "confirmation-required";
  const label = result.dryRun
    ? "Switch dry run"
    : consent
      ? "Switch preview (confirmation required)"
      : "Switch";
  process.stdout.write(
    `${label}: ${from?.package ?? "?"}@${from?.version ?? "?"} -> ` +
      `${to?.package ?? "?"}@${to?.version ?? "?"}\n\n`,
  );
  if (result.manager) {
    process.stdout.write(
      `  manager: ${result.manager}${result.managerSource ? ` (${result.managerSource})` : ""}\n`,
    );
  }
  if (result.command) {
    process.stdout.write(
      `  command: ${[result.command.manager, ...result.command.args].join(" ")}\n`,
    );
  }
  process.stdout.write("  planned changes:\n");
  writeLifecycleChanges(result.plannedChanges ?? []);
  writeAutoSelectedEntries(result.autoSelectedEntries);
  writePeerPlan(result.peers, "peer actions");
  writeCompatibility(result.compatibility);
  if (result.dryRun) {
    process.stdout.write("\nDry run: nothing was installed, spawned, or written.\n");
  } else if (consent) {
    process.stdout.write(
      `\nSwitch requires --yes; nothing was changed. Re-run with --yes to apply this exact plan.\n`,
    );
  } else if (result.ok) {
    process.stdout.write(
      `\nSwitched to ${to?.package}@${to?.version}; the previous dependency was retained.\n`,
    );
  }
}

export async function runSwitchCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 2,
      booleans: ["dry-run", "yes", "json"],
      values: ["cwd", "registry", "css"],
      repeatable: ["with-entry", "peer"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(switchHelpText());
    return;
  }
  const target = parsed.positionals[0];
  if (target === undefined || target.trim() === "") {
    process.stderr.write("switch requires a target package or system id.\n");
    process.exitCode = 1;
    return;
  }
  if (parsed.options.cwd === undefined || String(parsed.options.cwd).trim() === "") {
    process.stderr.write("switch requires an explicit --cwd <consumer-root>.\n");
    process.exitCode = 1;
    return;
  }
  const { switchDesignSystem } = await import("./lifecycle.mjs");
  const base = {
    cwd: parsed.options.cwd,
    package: target,
    version: parsed.positionals[1],
    registry: parsed.options.registry,
    cssPath: parsed.options.css,
    withEntry: parsed.options.withEntry,
    peers: parsed.options.peer,
  };
  let result;
  if (parsed.options.dryRun) {
    result = await switchDesignSystem({ ...base, dryRun: true });
  } else if (!parsed.options.yes) {
    // No consent: the backend returns the full exact plan with
    // `boundary: "confirmation-required"`; nothing is spawned or written.
    result = await switchDesignSystem(base);
  } else {
    // Preview first so the exact target version and the plan material are
    // frozen, then apply that same plan as the execution precondition.
    const preview = await switchDesignSystem({ ...base, dryRun: true });
    if (!preview.ok) {
      if (parsed.options.json) {
        process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
        process.exitCode = 1;
        return;
      }
      reportLifecycleFailure("Switch", preview);
      return;
    }
    result = await switchDesignSystem({
      ...base,
      version: preview.to.version,
      confirmed: true,
      expectedPlan: preview,
    });
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok && result.boundary !== "confirmation-required") {
    reportLifecycleFailure("Switch", result);
    return;
  }
  reportSwitchOutcome(result);
  if (!result.ok) process.exitCode = 1;
}

function reportRemoveOutcome(result) {
  const consent = result.boundary === "confirmation-required";
  const label = result.dryRun
    ? "Remove dry run"
    : consent
      ? "Remove preview (confirmation required)"
      : "Remove";
  process.stdout.write(
    `${label}: ${result.package ?? "?"}@${result.version ?? "?"} from ${result.consumerRoot ?? "?"}\n\n`,
  );
  if (result.manager) {
    process.stdout.write(
      `  manager: ${result.manager}${result.managerSource ? ` (${result.managerSource})` : ""}\n`,
    );
  }
  if (result.command) {
    process.stdout.write(
      `  command: ${[result.command.manager, ...result.command.args].join(" ")}\n`,
    );
  }
  process.stdout.write("  planned changes:\n");
  writeLifecycleChanges(result.plannedChanges ?? []);
  writeCompatibility(result.compatibility);
  if (Array.isArray(result.preserved) && result.preserved.length > 0) {
    for (const preserved of result.preserved) {
      process.stdout.write(
        `  preserved: ${preserved.path ?? preserved}${preserved.reason ? ` (${preserved.reason})` : ""}\n`,
      );
    }
  }
  if (result.dryRun) {
    process.stdout.write("\nDry run: nothing was removed, spawned, or written.\n");
  } else if (consent) {
    process.stdout.write(
      "\nRemove requires --yes; nothing was changed. Re-run with --yes to apply this exact plan.\n",
    );
  } else if (result.ok) {
    process.stdout.write(`\nRemoved ${result.package}; unrelated content was preserved.\n`);
  }
}

export async function runRemoveCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["dry-run", "yes", "json"],
      values: ["cwd", "css"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(removeHelpText());
    return;
  }
  if (parsed.options.cwd === undefined || String(parsed.options.cwd).trim() === "") {
    process.stderr.write("remove requires an explicit --cwd <consumer-root>.\n");
    process.exitCode = 1;
    return;
  }
  const { removeDesignSystem } = await import("./lifecycle.mjs");
  const base = {
    cwd: parsed.options.cwd,
    package: parsed.positionals[0],
    cssPath: parsed.options.css,
  };
  let result;
  if (parsed.options.dryRun) {
    result = removeDesignSystem({ ...base, dryRun: true });
  } else if (!parsed.options.yes) {
    result = removeDesignSystem(base);
  } else {
    const preview = removeDesignSystem({ ...base, dryRun: true });
    if (!preview.ok) {
      if (parsed.options.json) {
        process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
        process.exitCode = 1;
        return;
      }
      reportLifecycleFailure("Remove", preview);
      return;
    }
    result = removeDesignSystem({ ...base, confirmed: true, expectedPlan: preview });
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok && result.boundary !== "confirmation-required") {
    reportLifecycleFailure("Remove", result);
    return;
  }
  reportRemoveOutcome(result);
  if (!result.ok) process.exitCode = 1;
}

/* -------------------------------------------------------------------------- */
/* skills                                                                     */
/* -------------------------------------------------------------------------- */

function summarizeInstalledSkill(skill) {
  return {
    name: skill.name,
    scope: skill.scope,
    catalogId: skill.catalogId ?? null,
    managed: skill.managed === true,
    external: skill.external === true,
    modified: skill.modified === true,
    drift: skill.drift === true,
    shared: skill.shared === true,
    sharedAgents: skill.sharedAgents ?? [],
    agents: skill.agents ?? [],
    revision: skill.revision ?? null,
    version: skill.version ?? null,
    relativePath: skill.relativePath,
    path: skill.path,
  };
}

function reportSkillsList(result) {
  process.stdout.write(`prism-ds skills — inventory scope: ${result.scope}\n\n`);
  process.stdout.write(`Catalog (${result.catalog.length}):\n`);
  for (const entry of result.catalog) {
    process.stdout.write(`  ${entry.id}  [${entry.type}; ${entry.reviewStatus}; ${entry.role}]\n`);
    if (entry.installed.length === 0) {
      process.stdout.write("    not installed\n");
      continue;
    }
    for (const placement of entry.installed) {
      const flags = [placement.scope, placement.managed ? "managed" : "external/unmanaged"];
      if (placement.modified) flags.push("modified");
      if (placement.drift) flags.push("unrecorded placements");
      if (placement.shared) flags.push("shared canonical placement");
      process.stdout.write(
        `    ${flags.join("; ")}` +
          `${placement.agents.length > 0 ? `; agents: ${placement.agents.join(", ")}` : ""}` +
          `${placement.revision ? `; revision: ${placement.revision}` : ""}\n`,
      );
    }
  }
  if (result.external.length > 0) {
    process.stdout.write(`\nInstalled skills outside the catalog (${result.external.length}):\n`);
    for (const skill of result.external) {
      const flags = [skill.scope, skill.managed ? "managed" : "external/unmanaged"];
      if (skill.shared) flags.push("shared canonical placement");
      process.stdout.write(
        `  ${skill.name}  [${flags.join("; ")}]` +
          `${skill.agents.length > 0 ? ` agents: ${skill.agents.join(", ")}` : ""}\n`,
      );
    }
  }
  if (result.failures.length > 0) {
    process.stdout.write("\nInventory failures:\n");
    for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  }
}

async function runSkillsListCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["global", "json"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(skillsHelpText());
    return;
  }
  if (parsed.options.cwd === undefined || String(parsed.options.cwd).trim() === "") {
    process.stderr.write("skills list requires an explicit --cwd <consumer-root>.\n");
    process.exitCode = 1;
    return;
  }
  const { collectSkillCatalogFailures, listSkillCatalog } = await import("./skill-catalog.mjs");
  const { listInstalledSkills } = await import("./skill-inventory.mjs");
  const scope = parsed.options.global ? "global" : "all";
  const inventory = await listInstalledSkills({ cwd: parsed.options.cwd, scope });
  const catalog = listSkillCatalog();
  const catalogFailures = collectSkillCatalogFailures();
  const installed = inventory.skills ?? [];
  const catalogView = catalog.map((entry) => ({
    ...entry,
    installed: installed
      .filter((skill) => skill.catalogId === entry.id)
      .map(summarizeInstalledSkill),
  }));
  const external = installed
    .filter((skill) => skill.catalogId === null)
    .map(summarizeInstalledSkill);
  const result = {
    ok: inventory.ok === true && catalogFailures.length === 0,
    scope,
    catalog: catalogView,
    installed: installed.map(summarizeInstalledSkill),
    external,
    failures: [...catalogFailures, ...(inventory.failures ?? [])],
  };
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  reportSkillsList(result);
  if (!result.ok) process.exitCode = 1;
}

function reportSkillsPlan(plan) {
  process.stdout.write(
    `Skills ${plan.action}: ${plan.skillId} (${plan.skill?.skill ?? "?"}) at ${plan.scope} scope\n`,
  );
  process.stdout.write(`  agents: ${plan.agents.join(", ")}\n`);
  process.stdout.write(`  revision: ${plan.expectedPlan?.revision ?? "(none)"}\n`);
  if (plan.command) {
    process.stdout.write(`  command: ${plan.command.executable} ${plan.command.args.join(" ")}\n`);
  }
  const selected = (plan.targets ?? []).filter((target) => target.selected);
  process.stdout.write(
    `  targets: ${selected.map((target) => target.relativePath).join(", ") || "(none)"}\n`,
  );
  for (const warning of plan.warnings ?? []) process.stdout.write(`  warning: ${warning}\n`);
}

function reportSkillsPlanFailure(action, plan, skillId, cwd, agents, minNodeVersion) {
  process.stdout.write(`Skills ${action} blocked for ${skillId}\n\n`);
  for (const failure of plan.failures ?? []) process.stdout.write(`  ${failure}\n`);
  const agentFlags = agents.map((agent) => ` --agent ${agent}`).join("");
  let remedy;
  if ((plan.failures ?? []).some((failure) => failure.includes(`Node >= ${minNodeVersion}`))) {
    remedy = `Upgrade Node to >= ${minNodeVersion} to run the pinned skills CLI.`;
  } else if ((plan.failures ?? []).some((failure) => /use the update action/.test(failure))) {
    remedy = `Run "prism-ds skills update ${skillId} --cwd ${cwd}${agentFlags} --yes".`;
  } else if (
    (plan.failures ?? []).some((failure) => /unmanaged|refusing to replace/i.test(failure))
  ) {
    remedy =
      "Resolve the existing unmanaged placement first; prism-ds never overwrites an " +
      "unmanaged skill.";
  } else {
    remedy = "Review the failures and re-run when resolved.";
  }
  process.stdout.write(`\nRemedy: ${remedy}\nNothing was spawned or written.\n`);
  process.exitCode = 1;
}

async function runSkillsMutationCommand(action, argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["global", "dry-run", "yes", "json"],
      values: ["cwd"],
      repeatable: ["agent"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(skillsHelpText());
    return;
  }
  const skillId = parsed.positionals[0];
  if (skillId === undefined || skillId.trim() === "") {
    process.stderr.write(`skills ${action} requires a <catalog-id>.\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.cwd === undefined || String(parsed.options.cwd).trim() === "") {
    process.stderr.write(`skills ${action} requires an explicit --cwd <consumer-root>.\n`);
    process.exitCode = 1;
    return;
  }
  const agents = parsed.options.agent;
  if (agents.length === 0) {
    process.stderr.write(`skills ${action} requires at least one --agent <id>.\n`);
    process.exitCode = 1;
    return;
  }
  const { MIN_SKILLS_NODE_VERSION, SKILL_AGENT_IDS, executeSkillOperation, planSkillOperation } =
    await import("./skills.mjs");
  const invalid = [...new Set(agents.filter((agent) => !SKILL_AGENT_IDS.includes(agent)))];
  if (invalid.length > 0) {
    process.stderr.write(
      `Unsupported skill agent(s): ${invalid.join(", ")}. Allowed agents: ` +
        `${SKILL_AGENT_IDS.join(", ")}.\n`,
    );
    process.exitCode = 1;
    return;
  }
  const scope = parsed.options.global ? "global" : "project";
  const plan = await planSkillOperation({
    action,
    skillId,
    cwd: parsed.options.cwd,
    scope,
    agents,
  });
  if (!plan.ok) {
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify({ mode: "preview", ...plan }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    reportSkillsPlanFailure(
      action,
      plan,
      skillId,
      parsed.options.cwd,
      agents,
      MIN_SKILLS_NODE_VERSION,
    );
    return;
  }
  if (parsed.options.dryRun) {
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", ...plan }, null, 2)}\n`);
      return;
    }
    reportSkillsPlan(plan);
    process.stdout.write("\nDry run: nothing was spawned or written.\n");
    return;
  }
  if (!parsed.options.yes) {
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify({ mode: "preview", ...plan }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    reportSkillsPlan(plan);
    process.stdout.write(
      `\nSkills ${action} requires --yes; nothing was spawned or written.\n` +
        `  next: prism-ds skills ${action} ${skillId} --cwd ${parsed.options.cwd}` +
        `${agents.map((agent) => ` --agent ${agent}`).join("")} --yes\n`,
    );
    process.exitCode = 1;
    return;
  }
  const result = await executeSkillOperation({
    action,
    skillId,
    cwd: parsed.options.cwd,
    scope,
    agents,
    plan,
    confirmed: true,
  });
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify({ mode: "execute", ...result }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    process.stdout.write(`Skills ${action} failed for ${skillId}\n\n`);
    for (const failure of result.failures ?? []) process.stdout.write(`  ${failure}\n`);
    process.stdout.write("\nThe upstream CLI may have run; no automatic rollback was attempted.\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    result.executed === true
      ? `Skills ${action} completed for ${skillId} (${scope} scope, ${result.revision ?? "unknown revision"}).\n`
      : `Skills ${action} verified no-op for ${skillId} (${scope} scope).\n`,
  );
  if (result.storePath) process.stdout.write(`  store: ${result.storePath}\n`);
}

export async function runSkillsCommand(argv) {
  const [subcommand, ...rest] = argv;
  if (
    subcommand === undefined ||
    subcommand === "--help" ||
    subcommand === "-h" ||
    subcommand === "help"
  ) {
    process.stdout.write(skillsHelpText());
    return;
  }
  if (subcommand === "list") {
    await runSkillsListCommand(rest);
    return;
  }
  if (subcommand === "add" || subcommand === "update" || subcommand === "remove") {
    await runSkillsMutationCommand(subcommand, rest);
    return;
  }
  process.stderr.write(
    `Unknown skills subcommand: ${subcommand}. Run "${CLI_NAME} skills --help".\n`,
  );
  process.exitCode = 1;
}

/* -------------------------------------------------------------------------- */
/* self-update                                                                */
/* -------------------------------------------------------------------------- */

function reportSelfUpdateCheck(result) {
  if (result.skipped) {
    process.stdout.write(`prism-ds update check skipped (${result.reason}).\n\n`);
    process.stdout.write(`${result.advice}\n`);
    return;
  }
  if (!result.ok) {
    process.stdout.write("prism-ds update check failed\n\n");
    process.stdout.write(`  ${result.error}\n`);
    process.stdout.write(`\n${result.advice}\n`);
    process.stdout.write("\nRead-only check: nothing was written or spawned.\n");
    process.exitCode = 1;
    return;
  }
  const installation = result.installation ?? {};
  process.stdout.write(
    `prism-ds ${result.current} (installation: ${installation.kind ?? "unknown"}` +
      `${installation.manager ? `, ${installation.manager}` : ""})\n`,
  );
  process.stdout.write(`  latest: ${result.latest}\n`);
  process.stdout.write(
    result.available
      ? `  update available: ${result.latest}\n`
      : "  up to date: no update is needed.\n",
  );
  process.stdout.write(`\n${result.advice}\n`);
  process.stdout.write("\nRead-only check: nothing was written or spawned.\n");
}

function reportSelfUpdateFailure(result) {
  const plan = result.plan ?? null;
  // `manager`/`verify` failures happen after the fixed command was started; the
  // others fail before any spawn.
  const started = result.boundary === "manager" || result.boundary === "verify";
  const label =
    result.boundary === "consent"
      ? "Self-update requires explicit confirmation"
      : started
        ? "Self-update did not complete"
        : "Self-update cannot proceed";
  process.stdout.write(`${label} (boundary: ${result.boundary ?? "plan"})\n\n`);
  const failures = result.failures.length > 0 ? result.failures : (plan?.failures ?? []);
  for (const failure of failures) process.stdout.write(`  ${failure}\n`);
  if (plan?.advice) process.stdout.write(`\n${plan.advice}\n`);
  if (plan?.command) {
    process.stdout.write(
      `\n  planned command: ${[plan.command.manager, ...plan.command.args].join(" ")}\n`,
    );
  }
  if (result.boundary === "consent") {
    process.stdout.write(
      "\nRe-run with --yes to execute it, or --dry-run to preview it without spawning.\n",
    );
  }
  process.stdout.write(
    started
      ? "\nThe package-manager command was started; no rollback was attempted.\n"
      : "\nNothing was spawned or written.\n",
  );
  process.exitCode = 1;
}

function reportSelfUpdateResult(result, packageName) {
  const plan = result.plan;
  if (result.state === "up-to-date") {
    process.stdout.write(
      `prism-ds ${result.currentVersion} is already the latest (${result.targetVersion}); ` +
        "nothing to do.\n",
    );
    return;
  }
  if (result.state === "dry-run") {
    process.stdout.write(
      `Self-update dry run: ${packageName} ${plan.currentVersion} -> ${plan.targetVersion} ` +
        `(${plan.scope})\n\n`,
    );
    process.stdout.write(`  command: ${[plan.command.manager, ...plan.command.args].join(" ")}\n`);
    process.stdout.write("\nDry run: nothing was spawned or written.\n");
    return;
  }
  if (result.state === "unverified") {
    process.stdout.write(
      `prism-ds ${result.currentVersion} -> ${result.targetVersion}: the ` +
        `${result.command.manager} command exited 0, but the installed version could not ` +
        "be verified from here.\n",
    );
    process.stdout.write(`  ${result.note}\n`);
    return;
  }
  process.stdout.write(
    `Updated ${packageName} ${result.currentVersion} -> ${result.installedVersion} ` +
      `(${plan.scope}, ${result.command.manager}).\n`,
  );
  if (result.postVerify?.root) process.stdout.write(`  verified: ${result.postVerify.root}\n`);
}

export async function runSelfUpdateCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 0,
      booleans: ["check", "global", "dry-run", "yes", "json"],
      values: ["cwd", "manager", "registry"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(selfUpdateHelpText());
    return;
  }
  // `--check` is read-only. Mutation consent flags are contradictory here, so
  // fail closed before any detection, registry read, or spawn.
  if (parsed.options.check && (parsed.options.dryRun || parsed.options.yes)) {
    process.stderr.write("--check is read-only and cannot be combined with --dry-run or --yes.\n");
    process.exitCode = 1;
    return;
  }
  // The backend is loaded lazily so help and flag validation never pull the
  // package-manager or registry machinery into the eager CLI graph.
  const { CLI_PACKAGE_NAME, checkCliUpdate, selfUpdate } = await import("./self-update.mjs");
  try {
    if (parsed.options.check) {
      const result = await checkCliUpdate({
        cwd: parsed.options.cwd,
        global: parsed.options.global,
        manager: parsed.options.manager,
        registryUrl: parsed.options.registry,
      });
      if (parsed.options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        if (!result.ok) process.exitCode = 1;
        return;
      }
      reportSelfUpdateCheck(result);
      return;
    }
    const result = await selfUpdate({
      cwd: parsed.options.cwd,
      global: parsed.options.global,
      manager: parsed.options.manager,
      registryUrl: parsed.options.registry,
      dryRun: parsed.options.dryRun,
      confirmed: parsed.options.yes,
    });
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    if (!result.ok) {
      reportSelfUpdateFailure(result);
      return;
    }
    reportSelfUpdateResult(result, CLI_PACKAGE_NAME);
  } catch (error) {
    // Both backends report expected failures structurally; this is a last-resort
    // guard so an unexpected error can never throw a stack trace or imply success.
    process.stdout.write(`Self-update failed\n\n  ${error.message}\n`);
    process.stdout.write("\nNo self-update was reported as completed.\n");
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------------------- */
/* recover                                                                    */
/* -------------------------------------------------------------------------- */

function writeRecoverySuggestions(suggestions) {
  for (const item of suggestions) {
    const flags = [item.executable ? "executable" : "guidance"];
    if (item.requiresConfirmation) flags.push("requires --yes");
    process.stdout.write(`  ${item.id}  [${flags.join("; ")}]\n`);
    process.stdout.write(`    ${item.label}\n`);
    process.stdout.write(`    reason: ${item.reason}\n`);
    process.stdout.write(`    command: ${item.command.bin} ${item.command.args.join(" ")}\n`);
  }
}

function reportRecoveryReport(report, suggestions) {
  process.stdout.write(`${report.summary}\n\n`);
  for (const state of report.states) {
    process.stdout.write(`  [${state.status}] ${state.id}: ${state.detail}\n`);
  }
  process.stdout.write("\n");
  if (suggestions.length === 0) {
    process.stdout.write("No issues found; no recovery actions are needed.\n");
  } else {
    process.stdout.write("Suggestions:\n");
    writeRecoverySuggestions(suggestions);
    if (suggestions.some((item) => item.executable)) {
      process.stdout.write(
        `\nRun "${CLI_NAME} recover --cwd <consumer-root> --action <id> --yes" to ` +
          "execute one suggested repair.\n",
      );
    }
  }
  if (!report.ok) process.exitCode = 1;
}

function reportRecoveryActionFailure(preview, suggestions) {
  process.stdout.write(
    `Recovery action ${JSON.stringify(preview.actionId ?? null)} cannot be executed ` +
      `(boundary: ${preview.boundary ?? "action"}).\n\n`,
  );
  for (const failure of preview.failures) process.stdout.write(`  ${failure}\n`);
  if (suggestions.length > 0) {
    process.stdout.write("\nApplicable suggestions for the current state:\n");
    writeRecoverySuggestions(suggestions);
  }
  process.stdout.write("\nNothing was written.\n");
  process.exitCode = 1;
}

function reportRecoveryPreview(preview, { consentRequired }) {
  process.stdout.write(`Recovery action "${preview.actionId}" (${preview.kind})\n`);
  process.stdout.write(`  risk: ${preview.risk}\n`);
  if (preview.changes.length === 0) {
    process.stdout.write("  changes: none (the targeted state is already satisfied)\n");
  } else {
    for (const change of preview.changes) {
      process.stdout.write(`  would write ${change.kind}: ${change.path}\n`);
    }
  }
  if (consentRequired) {
    process.stdout.write(
      `\nRecovery action "${preview.actionId}" requires --yes; nothing was written.\n`,
    );
    process.stdout.write(
      `  next: ${CLI_NAME} recover --cwd ${preview.plan?.consumerRoot ?? "<consumer-root>"} ` +
        `--action ${preview.actionId} --yes\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("\nDry run: nothing was written.\n");
}

function reportRecoveryExecution(result) {
  process.stdout.write(`Recovery action "${result.actionId}" (${result.kind})\n`);
  process.stdout.write(`  actionCompleted: ${result.actionCompleted}\n`);
  process.stdout.write(`  repaired: ${result.repaired}\n`);
  process.stdout.write(`  healthy: ${result.healthy}\n`);
  if (result.stillRemaining.length > 0) {
    process.stdout.write(`  remaining issues: ${result.stillRemaining.join(", ")}\n`);
  }
  for (const failure of result.failures) process.stdout.write(`  failure: ${failure}\n`);
  process.stdout.write("\n");
  if (!result.actionCompleted) {
    process.stdout.write(
      "The repair action did not complete; the targeted state was not repaired.\n",
    );
  } else if (!result.repaired) {
    process.stdout.write(
      "The action completed, but the targeted state is still failing after the recheck.\n",
    );
  } else {
    process.stdout.write("The targeted issue was repaired and the recheck passed for it.\n");
  }
  if (!result.healthy) {
    process.stdout.write(
      "The project is not fully healthy; the remaining issues are listed above.\n",
    );
  }
}

export async function runRecoverCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["dry-run", "yes", "json"],
      values: ["cwd", "css", "entry", "action", "package"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(recoverHelpText());
    return;
  }
  const cwd = parsed.options.cwd;
  if (cwd === undefined || String(cwd).trim() === "") {
    process.stderr.write("recover requires an explicit --cwd <consumer-root>.\n");
    process.exitCode = 1;
    return;
  }
  const positional = parsed.positionals[0];
  if (
    positional !== undefined &&
    parsed.options.package !== undefined &&
    positional !== parsed.options.package
  ) {
    process.stderr.write("Pass the package either positionally or with --package, not both.\n");
    process.exitCode = 1;
    return;
  }
  const packageName = parsed.options.package ?? positional;
  const actionId = parsed.options.action;
  const hasAction = actionId !== undefined && String(actionId).trim() !== "";
  if (actionId !== undefined && !hasAction) {
    process.stderr.write("recover --action requires a non-empty action id.\n");
    process.exitCode = 1;
    return;
  }
  if (!hasAction && (parsed.options.yes || parsed.options.dryRun)) {
    process.stderr.write("recover --yes and --dry-run require --action <id>.\n");
    process.exitCode = 1;
    return;
  }

  // Lazily loaded so the read-only help/flag paths never pull in the diagnosis
  // and repair backends.
  const {
    buildRecoverySuggestions,
    collectRecoveryReport,
    executeRecoveryAction,
    previewRecoveryAction,
  } = await import("./recovery.mjs");
  const context = { packageName, css: parsed.options.css, entry: parsed.options.entry };
  const json = parsed.options.json;

  if (!hasAction) {
    const report = collectRecoveryReport({ cwd, ...context });
    const suggestions = buildRecoverySuggestions(report, context);
    if (json) {
      process.stdout.write(`${JSON.stringify({ ...report, suggestions }, null, 2)}\n`);
      if (!report.ok) process.exitCode = 1;
      return;
    }
    reportRecoveryReport(report, suggestions);
    return;
  }

  if (parsed.options.dryRun) {
    const preview = previewRecoveryAction({ cwd, actionId, ...context });
    if (json) {
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", ...preview }, null, 2)}\n`);
      if (!preview.ok) process.exitCode = 1;
      return;
    }
    if (!preview.ok) {
      reportRecoveryActionFailure(preview, buildRecoverySuggestions(preview.report, context));
      return;
    }
    reportRecoveryPreview(preview, { consentRequired: false });
    return;
  }

  const preview = previewRecoveryAction({ cwd, actionId, ...context });
  if (!preview.ok) {
    const suggestions = buildRecoverySuggestions(preview.report, context);
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ mode: "preview", ...preview, suggestions }, null, 2)}\n`,
      );
      process.exitCode = 1;
      return;
    }
    reportRecoveryActionFailure(preview, suggestions);
    return;
  }

  if (!parsed.options.yes) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ mode: "preview", ...preview }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    reportRecoveryPreview(preview, { consentRequired: true });
    return;
  }

  // The previewed plan is enforced again by the backend before any write, so a
  // state change between preview and execution fails closed instead of applying
  // a stale plan.
  const result = executeRecoveryAction({
    cwd,
    actionId,
    ...context,
    confirmed: true,
    expectedPlan: preview.plan,
  });
  // Exit 0 only when the action completed and the targeted state actually
  // repaired; a completed command that leaves the targeted issue is a failure.
  const passed = result.actionCompleted === true && result.repaired === true;
  if (json) {
    process.stdout.write(`${JSON.stringify({ mode: "execute", ...result }, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
    return;
  }
  reportRecoveryExecution(result);
  if (!passed) process.exitCode = 1;
}

/* -------------------------------------------------------------------------- */
/* dispatch                                                                   */
/* -------------------------------------------------------------------------- */

export async function runCli(argv) {
  if (argv.length === 0) {
    // Bare `prism-ds`: start the inline interactive TUI in this process. The
    // module is loaded dynamically so every argument command keeps a
    // framework-free import graph.
    const { runTui } = await import("./tui.mjs");
    const result = await runTui();
    if (typeof result?.status === "number" && result.status !== 0) {
      process.exitCode = result.status;
    }
    return result;
  }
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(helpText());
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${readPackageVersion()}\n`);
    return;
  }
  if (command === "search") {
    await runSearchCommand(rest);
    return;
  }
  if (command === "info") {
    await runInfoCommand(rest);
    return;
  }
  if (command === "install") {
    await runInstallCommand(rest);
    return;
  }
  if (command === "use") {
    await runUseCommand(rest);
    return;
  }
  if (command === "connect") {
    runConnectCommand(rest);
    return;
  }
  if (command === "check-usage") {
    await runCheckUsageCommand(rest);
    return;
  }
  if (command === "doctor") {
    runDoctorCommand(rest);
    return;
  }
  if (command === "components") {
    await runComponentsCommand(rest);
    return;
  }
  if (command === "tokens") {
    await runTokensCommand(rest);
    return;
  }
  if (command === "check") {
    await runCheckCommand(rest);
    return;
  }
  if (command === "setup-tailwind") {
    await runSetupTailwindCommand(rest);
    return;
  }
  if (command === "upgrade") {
    await runUpgradeCommand(rest);
    return;
  }
  if (command === "switch") {
    await runSwitchCommand(rest);
    return;
  }
  if (command === "remove") {
    await runRemoveCommand(rest);
    return;
  }
  if (command === "skills") {
    await runSkillsCommand(rest);
    return;
  }
  if (command === "self-update") {
    await runSelfUpdateCommand(rest);
    return;
  }
  if (command === "recover") {
    await runRecoverCommand(rest);
    return;
  }
  process.stderr.write(`Unknown command: ${command}. Run "${CLI_NAME} --help".\n`);
  process.exitCode = 1;
}
