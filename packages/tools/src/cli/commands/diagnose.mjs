/**
 * `check-usage` and `doctor`: offline diagnostics.
 *
 * `check-usage` lazy-loads the TypeScript-backed usage checker; `doctor`
 * reuses the read-only doctor module already loaded by the eager CLI graph.
 */

import { collectDoctorReport, doctorHelpText } from "../../doctor.mjs";
import { parseOptions } from "../args.mjs";
import { CLI_NAME } from "../help.mjs";

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
    const { helpText: usageHelp } = await import("../../usage.mjs");
    process.stdout.write(usageHelp());
    return;
  }
  const { checkUsage } = await import("../../usage.mjs");
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
