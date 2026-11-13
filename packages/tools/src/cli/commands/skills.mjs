/**
 * `skills`: offline catalog/inventory plus consent-gated instruction installs.
 *
 * `skills list` is offline and read-only; `skills add/update/remove` load the
 * pinned Skills CLI planner/executor lazily and run only with `--yes`.
 */

import { parseOptions } from "../args.mjs";
import { CLI_NAME, skillsHelpText } from "../help.mjs";

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
  const { collectSkillCatalogFailures, listSkillCatalog } = await import("../../skill-catalog.mjs");
  const { listInstalledSkills } = await import("../../skill-inventory.mjs");
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
    await import("../../skills.mjs");
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
