/**
 * `connect` and `config`: consumer configuration and contract wiring.
 *
 * Offline and configure-only: these commands write only the consumer
 * configuration field/file and the root `AGENTS.md` managed section.
 */

import {
  CONSUMER_CONFIG_LABEL,
  CONSUMER_DIRECTORY,
  LEGACY_CONSUMER_CONFIG_FILENAME,
  connectDesignSystem,
  normalizeConsumerLocation,
  readConsumerConfig,
  resolveConsumerRoot,
} from "../../consumer.mjs";
import { parseOptions } from "../args.mjs";
import { CLI_NAME, configHelpText, connectHelpText } from "../help.mjs";

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

function reportMigrations(migrations, prefix) {
  if (!Array.isArray(migrations)) return;
  for (const migration of migrations) process.stdout.write(`${prefix}${migration}\n`);
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
    reportMigrations(result.migrations, "  pending migration: ");
    if (result.changed) process.exitCode = 1;
    return;
  }
  if (result.dryRun) {
    process.stdout.write(`Connect dry run for ${label} in ${plan.consumerRoot}\n\n`);
    if (result.changes.length === 0) {
      process.stdout.write("  no changes (already connected)\n");
    } else {
      for (const change of result.changes) {
        // A migration effect that removes a legacy file is a deletion, not a write.
        const effect = plan.files.find((file) => file.path === change.path);
        const verb = effect !== undefined && effect.after === null ? "would remove" : "would write";
        process.stdout.write(`  ${verb} ${change.kind}: ${change.path}\n`);
      }
    }
    reportMigrations(result.migrations, "  would migrate: ");
    process.stdout.write("\nDry run: nothing was written.\n");
    return;
  }
  process.stdout.write(
    result.changed
      ? `Connected ${label} in ${plan.consumerRoot}.\n`
      : `Already connected ${label} in ${plan.consumerRoot} (no changes).\n`,
  );
  reportMigrations(result.migrations, "  migration: ");
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

/** Human-readable label for one configuration location. */
function locationLabel(location) {
  return location === "design-system"
    ? `${CONSUMER_DIRECTORY}/${LEGACY_CONSUMER_CONFIG_FILENAME}`
    : CONSUMER_CONFIG_LABEL;
}

/**
 * Report which location currently holds the configuration. Read-only; used when
 * `config` is invoked with no target.
 */
function reportConfigLocation(result) {
  const { config } = result;
  if (config === null) {
    process.stdout.write(
      "No design system configuration found. " +
        `Run "${CLI_NAME} config package-json --cwd <root>" or connect the consumer first.\n`,
    );
    return false;
  }
  const location = config.source === "extended-config" ? "design-system" : "package-json";
  process.stdout.write(
    `Configuration location: ${locationLabel(location)} ` +
      `(${config.package}@${config.version ?? "version not recorded"}).\n`,
  );
  if (config.source === "legacy-config") {
    process.stdout.write(
      `  legacy layout detected; run "${CLI_NAME} config package-json" to move it into ` +
        `${CONSUMER_CONFIG_LABEL}.\n`,
    );
  }
  return true;
}

/**
 * The location that currently holds the configuration, derived from the
 * discovery source of a connect plan. A legacy file is still reported as
 * `package-json` because that is where `connect` will move it.
 */
function currentConfigLocation(plan) {
  return plan.source === "extended-config" ? "design-system" : "package-json";
}

function reportConfigSuccess(result) {
  const target = locationLabel(result.plan.location);
  const label = `${result.plan.packageName}@${result.plan.version}`;
  const atTarget = currentConfigLocation(result.plan) === result.plan.location;
  if (result.check) {
    // `config --check` answers one question: is the configuration stored where
    // the target says it should be? Unrelated contract drift is `connect --check`.
    if (atTarget) {
      process.stdout.write(`Configuration is stored in ${target} for ${label}.\n`);
    } else {
      process.stdout.write(
        `Configuration is not stored in ${target} for ${label} ` +
          `(run "${CLI_NAME} config ${result.plan.location}").\n`,
      );
      process.exitCode = 1;
    }
    reportMigrations(result.migrations, "  pending migration: ");
    return;
  }
  if (result.dryRun) {
    process.stdout.write(`Configuration move to ${target} for ${label}\n\n`);
    if (result.changes.length === 0) {
      process.stdout.write("  no changes (already stored there)\n");
    } else {
      for (const change of result.changes) {
        const effect = result.plan.files.find((file) => file.path === change.path);
        const verb = effect !== undefined && effect.after === null ? "would remove" : "would write";
        process.stdout.write(`  ${verb} ${change.kind}: ${change.path}\n`);
      }
    }
    reportMigrations(result.migrations, "  would migrate: ");
    process.stdout.write("\nDry run: nothing was written.\n");
    return;
  }
  process.stdout.write(
    result.changed
      ? `Moved the design system configuration to ${target} for ${label}.\n`
      : `Configuration is already stored in ${target} for ${label} (no changes).\n`,
  );
  reportMigrations(result.migrations, "  migration: ");
}

export function runConfigCommand(argv) {
  let parsed;
  try {
    parsed = parseOptions(argv, {
      maxPositionals: 1,
      booleans: ["check", "dry-run", "json"],
      values: ["cwd"],
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(configHelpText());
    return;
  }

  const requested = parsed.positionals[0];
  if (requested === undefined) {
    if (parsed.options.check || parsed.options.dryRun) {
      process.stderr.write(
        `\`${CLI_NAME} config\` needs a target location for --check or --dry-run: ` +
          `"package-json" or "design-system".\n`,
      );
      process.exitCode = 1;
      return;
    }
    // Read-only report of the active location.
    let config;
    try {
      config = readConsumerConfig(resolveConsumerRoot({ cwd: parsed.options.cwd }));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    const configLocation =
      config === null || config.source !== "extended-config" ? "package-json" : "design-system";
    if (parsed.options.json) {
      // `--json` emits only machine-readable output.
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: config !== null,
            mode: "report",
            location: config === null ? null : configLocation,
            source: config?.source ?? null,
            package: config?.package ?? null,
            version: config?.version ?? null,
            strict: config?.strict ?? null,
            path: config?.path ?? null,
          },
          null,
          2,
        )}\n`,
      );
      if (config === null) process.exitCode = 1;
      return;
    }
    const ok = reportConfigLocation({ config });
    if (!ok) process.exitCode = 1;
    return;
  }

  let location;
  try {
    location = normalizeConsumerLocation(requested);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const result = connectDesignSystem({
    cwd: parsed.options.cwd,
    location,
    check: parsed.options.check,
    dryRun: parsed.options.dryRun,
  });
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify({ mode: "move", ...result }, null, 2)}\n`);
    const ok =
      result.ok && (!result.check || currentConfigLocation(result.plan) === result.plan.location);
    if (!ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    reportConnectFailure(result);
    return;
  }
  reportConfigSuccess(result);
}
