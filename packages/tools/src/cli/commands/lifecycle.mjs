/**
 * `switch` and `remove`: previewed, consent-gated lifecycle operations.
 *
 * Both print an exact plan without `--yes`; `switch` freezes and reuses the
 * previewed plan, and only reviewed literal substitutions or attributable
 * integration changes are applied.
 */

import { parseOptions } from "../args.mjs";
import { removeHelpText, switchHelpText } from "../help.mjs";
import { writePeerPlan } from "../output.mjs";

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
  const { switchDesignSystem } = await import("../../lifecycle.mjs");
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
  const { removeDesignSystem } = await import("../../lifecycle.mjs");
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
