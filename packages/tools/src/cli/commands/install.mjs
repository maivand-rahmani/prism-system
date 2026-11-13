/**
 * `install`, `use`, and `upgrade`: dependency-mutating lifecycle commands.
 *
 * The catalog and skills backends stay dynamically imported so the eager CLI
 * graph never pulls in the registry, package-manager, or skill machinery.
 */

import { parseOptions } from "../args.mjs";
import { helpTextForUse, installHelpText, upgradeHelpText } from "../help.mjs";
import { writePeerPlan } from "../output.mjs";

function reportInstallFailure(result) {
  process.stdout.write(`Install failed (boundary: ${result.boundary ?? "unknown"})\n\n`);
  for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  process.stdout.write("\nNo consumer dependencies were changed if the registry step failed.\n");
  process.exitCode = 1;
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
  const { installDesignSystem } = await import("../../catalog.mjs");
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
    const { runUseDesignSystem } = await import("../../catalog.mjs");
    result = await runUseDesignSystem(useOptions);
  } else {
    // The shared wrapper previews the exact design-system target/connect plan
    // and the frozen skill plan before any mutation, then reuses them on the
    // confirmed run. The explicit `use` invocation is the confirmation.
    const { runUseWithSkills } = await import("../../use-skills.mjs");
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
  const { upgradeDesignSystem } = await import("../../catalog.mjs");
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
