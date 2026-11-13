/**
 * `components`, `tokens`, `icons`, `check`, and `setup-tailwind`:
 * offline catalog reads plus the single offline health report and the one
 * explicit CSS writer.
 *
 * Every backend stays dynamically imported; only the explicitly named CSS file
 * is ever written, and only by `setup-tailwind` in write mode.
 */

import { parseOptions } from "../args.mjs";
import {
  CLI_NAME,
  checkHelpText,
  componentsHelpText,
  iconsHelpText,
  setupTailwindHelpText,
  tokensHelpText,
} from "../help.mjs";
import { reportCommandFailure } from "../output.mjs";

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
    const { listDesignSystemComponents } = await import("../../components.mjs");
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
    const { listDesignSystemTokens } = await import("../../tokens.mjs");
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

function reportIconCatalog(result) {
  const lines = [
    `${result.package}@${result.version} — icon catalog (contract version ${result.contractVersion})`,
  ];
  if (!result.supported) {
    lines.push(
      "  no icon catalog declared; absence means unavailable " +
        `(0 available, ${result.counts.unavailable} canonical names undefined by this system)`,
    );
  } else {
    lines.push(`  entrypoint: ${result.entrypoint} → ${result.importPath}`);
    lines.push(
      `  ${result.counts.available} available, ${result.counts.unavailable} unavailable ` +
        `of ${result.counts.total} canonical icons`,
    );
    lines.push("");
    for (const [category, entry] of Object.entries(result.categories)) {
      if (entry.names.length === 0) continue;
      lines.push(`  ${category} (${entry.available.length}/${entry.names.length})`);
      for (const icon of result.icons) {
        if (icon.category !== category || !icon.available) continue;
        lines.push(`    ${icon.name}  ${icon.exportName}`);
      }
    }
    if (result.unavailable.length > 0) {
      lines.push("");
      lines.push(`  unavailable: ${result.unavailable.join(", ")}`);
    }
    const requirements = result.icons.find((icon) => icon.available)?.requirements ?? [];
    if (requirements.length > 0) {
      lines.push("");
      lines.push("  entrypoint requirements:");
      for (const requirement of requirements) {
        lines.push(
          `    ${requirement.name}  [${requirement.kind}] ${requirement.range}` +
            `${requirement.optional ? " optional" : ""}`,
        );
      }
    }
  }
  if (result.requested) {
    const requested = result.requested;
    lines.push("");
    lines.push(
      `Requested ${requested.name}: ${requested.available ? "available" : "unavailable"}` +
        (requested.reason === "no-icon-catalog"
          ? " (this system declares no icon catalog)"
          : requested.reason === "not-declared"
            ? " (known canonical name, but this system does not publish it)"
            : ""),
    );
    if (requested.available) {
      lines.push(`  export: ${requested.exportName}`);
      lines.push(`  import: ${requested.importStatement}`);
      for (const requirement of requested.requirements) {
        lines.push(
          `  ${requirement.name}  [${requirement.kind}] ${requirement.range}` +
            `${requirement.optional ? " optional" : ""}`,
        );
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function runIconsCommand(argv) {
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
    process.stdout.write(iconsHelpText());
    return;
  }
  let result;
  try {
    const { listDesignSystemIcons } = await import("../../icons.mjs");
    result = listDesignSystemIcons({
      cwd: parsed.options.cwd,
      name: parsed.positionals[0],
    });
  } catch (error) {
    reportCommandFailure("Icon catalog failed", error);
    return;
  }
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${reportIconCatalog(result)}\n`);
}

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
    const { checkDesignSystem } = await import("../../check.mjs");
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
  const { setupTailwind } = await import("../../tailwind-setup.mjs");
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
