/**
 * Architecture guards for the split `prism-ds` CLI.
 *
 * The executable, the maintainer wrappers, and the focused CLI tests import
 * `src/cli.mjs`. These checks keep that facade stable and keep the command
 * families behind it small, acyclic, and free of eager backend imports.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TOOLS_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_ROOT = join(TOOLS_ROOT, "src");
const CLI_ROOT = join(SRC_ROOT, "cli");

/** Every module under `src/cli/`, as `src`-relative POSIX paths. */
const cliModules = () => {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".mjs"))
        found.push(relative(SRC_ROOT, full).split("\\").join("/"));
    }
  };
  walk(CLI_ROOT);
  return found.sort();
};

/** Static `import ... from "specifier"` specifiers in a source string. */
const staticImports = (source) =>
  [...source.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["']/gmu)].map((match) => match[1]);

const EXPECTED_FACADE_EXPORTS = [
  "CLI_NAME",
  "checkHelpText",
  "componentsHelpText",
  "configHelpText",
  "connectHelpText",
  "helpText",
  "helpTextForUse",
  "iconsHelpText",
  "infoHelpText",
  "installHelpText",
  "recoverHelpText",
  "removeHelpText",
  "runCheckCommand",
  "runCheckUsageCommand",
  "runCli",
  "runComponentsCommand",
  "runConfigCommand",
  "runConnectCommand",
  "runDoctorCommand",
  "runIconsCommand",
  "runInfoCommand",
  "runInstallCommand",
  "runRecoverCommand",
  "runRemoveCommand",
  "runSearchCommand",
  "runSelfUpdateCommand",
  "runSetupTailwindCommand",
  "runSkillsCommand",
  "runSwitchCommand",
  "runTokensCommand",
  "runUpgradeCommand",
  "runUseCommand",
  "searchHelpText",
  "selfUpdateHelpText",
  "setupTailwindHelpText",
  "skillsHelpText",
  "switchHelpText",
  "tokensHelpText",
  "upgradeHelpText",
].sort();

test("the CLI facade keeps the exact documented export surface", async () => {
  const cli = await import("../src/cli.mjs");
  assert.deepEqual(Object.keys(cli).sort(), EXPECTED_FACADE_EXPORTS);
});

test("the facade composes command families without eager backend imports", () => {
  const cli = readFileSync(join(SRC_ROOT, "cli.mjs"), "utf8");
  const imports = staticImports(cli);
  assert.ok(imports.length > 0, "the facade imports its command families");
  for (const specifier of imports) {
    assert.match(
      specifier,
      /^\.\/cli\/(?:args|help|output)\.mjs$|^\.\/cli\/commands\/[a-z-]+\.mjs$/u,
      `facade static import must stay inside ./cli/: ${specifier}`,
    );
  }
  assert.match(cli, /await import\("\.\/tui\.mjs"\)/u, "the TUI stays dynamically imported");
});

test("command families stay acyclic and keep backends dynamically imported", () => {
  const modules = cliModules();
  assert.ok(modules.length >= 10, "the command families are split into cohesive modules");

  const allowedEagerBackends = new Set(["../../consumer.mjs", "../../doctor.mjs"]);
  for (const module of modules) {
    const modulePath = join(SRC_ROOT, module);
    const source = readFileSync(modulePath, "utf8");
    for (const specifier of staticImports(source)) {
      if (specifier.startsWith("node:")) continue;
      if (allowedEagerBackends.has(specifier)) continue;
      if (specifier.startsWith(".")) {
        const insideCli = relative(CLI_ROOT, resolve(dirname(modulePath), specifier));
        assert.ok(
          insideCli !== "" && !insideCli.startsWith("..") && !isAbsolute(insideCli),
          `${module} must not statically import ${specifier}`,
        );
        continue;
      }
      assert.fail(`${module} must not statically import ${specifier}`);
    }
    assert.doesNotMatch(
      source,
      /^import\s[^;]*from\s+["'][^"']*cli\.mjs["']/mu,
      `${module} must not import the facade (cycle)`,
    );
  }
});

test("the eager CLI graph never imports a TUI framework", () => {
  for (const module of ["cli.mjs", ...cliModules()]) {
    const source = readFileSync(join(SRC_ROOT, module), "utf8");
    assert.doesNotMatch(
      source,
      /from\s+["'](?:ink|react|runeframe)(?:\/[^"']*)?["']/u,
      `${module} must not statically import a TUI framework`,
    );
  }
});
