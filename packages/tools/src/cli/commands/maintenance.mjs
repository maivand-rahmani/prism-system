/**
 * `self-update` and `recover`: explicit CLI updates and project recovery.
 *
 * Both backends are loaded lazily so help and flag validation never pull in
 * the registry, package-manager, diagnosis, or repair machinery.
 */

import { parseOptions } from "../args.mjs";
import { CLI_NAME, recoverHelpText, selfUpdateHelpText } from "../help.mjs";

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
  const { CLI_PACKAGE_NAME, checkCliUpdate, selfUpdate } = await import("../../self-update.mjs");
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
    const plannedFiles = Array.isArray(preview.plan?.files) ? preview.plan.files : [];
    for (const change of preview.changes) {
      // A migration effect that removes a legacy file is a deletion, not a write.
      const effect = plannedFiles.find((file) => file.path === change.path);
      const verb = effect !== undefined && effect.after === null ? "would remove" : "would write";
      process.stdout.write(`  ${verb} ${change.kind}: ${change.path}\n`);
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
  } = await import("../../recovery.mjs");
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
