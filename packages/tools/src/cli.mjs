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

import { CLI_NAME, helpText, readPackageVersion } from "./cli/help.mjs";
import { runConfigCommand, runConnectCommand } from "./cli/commands/configure.mjs";
import { runCheckUsageCommand, runDoctorCommand } from "./cli/commands/diagnose.mjs";
import { runInfoCommand, runSearchCommand } from "./cli/commands/registry.mjs";
import { runInstallCommand, runUpgradeCommand, runUseCommand } from "./cli/commands/install.mjs";
import {
  runCheckCommand,
  runComponentsCommand,
  runIconsCommand,
  runSetupTailwindCommand,
  runTokensCommand,
} from "./cli/commands/inspect.mjs";
import { runRemoveCommand, runSwitchCommand } from "./cli/commands/lifecycle.mjs";
import { runSkillsCommand } from "./cli/commands/skills.mjs";
import { runRecoverCommand, runSelfUpdateCommand } from "./cli/commands/maintenance.mjs";

/*
 * Stable facade: the executable, the maintainer wrappers, and the focused CLI
 * tests keep importing this module. Command families live under `./cli/` and
 * never import this facade; every backend they use stays dynamically imported
 * so the eager argument/TUI graph remains framework- and registry-free.
 */

export { CLI_NAME, helpText } from "./cli/help.mjs";
export {
  checkHelpText,
  componentsHelpText,
  configHelpText,
  connectHelpText,
  helpTextForUse,
  iconsHelpText,
  infoHelpText,
  installHelpText,
  recoverHelpText,
  removeHelpText,
  searchHelpText,
  selfUpdateHelpText,
  setupTailwindHelpText,
  skillsHelpText,
  switchHelpText,
  tokensHelpText,
  upgradeHelpText,
} from "./cli/help.mjs";

export {
  runCheckCommand,
  runCheckUsageCommand,
  runComponentsCommand,
  runConfigCommand,
  runConnectCommand,
  runDoctorCommand,
  runIconsCommand,
  runInfoCommand,
  runInstallCommand,
  runRecoverCommand,
  runRemoveCommand,
  runSearchCommand,
  runSelfUpdateCommand,
  runSetupTailwindCommand,
  runSkillsCommand,
  runSwitchCommand,
  runTokensCommand,
  runUpgradeCommand,
  runUseCommand,
};

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
  if (command === "config") {
    runConfigCommand(rest);
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
  if (command === "icons") {
    await runIconsCommand(rest);
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
