/**
 * `search` and `info`: explicit network, read-only registry access.
 *
 * The registry, catalog, and tarball backends are loaded lazily so help and
 * argument validation never touch the network.
 */

import { parseOptions } from "../args.mjs";
import { infoHelpText, searchHelpText } from "../help.mjs";
import { reportCommandFailure } from "../output.mjs";

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
  const { searchDesignSystems } = await import("../../catalog.mjs");
  const { buildSearchResult } = await import("../../registry.mjs");
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
    const scopeLabel =
      result.query === ""
        ? "all published packages in the supported scope"
        : `query: ${JSON.stringify(result.query)}`;
    process.stdout.write(
      `Supported design systems (registry: ${result.registry}, ${scopeLabel}):\n\n`,
    );
    if (result.query === "" && result.source === "search") {
      process.stdout.write(
        "  Note: the complete scope index was unavailable, so ranked search was used.\n" +
          "  The ranked index may omit newly published packages.\n\n",
      );
    }
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
    for (const warning of result.warnings ?? []) {
      process.stderr.write(`Warning: ${warning}\n`);
    }
  } catch (error) {
    reportCommandFailure("Search failed", error);
  }
}

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
  const { inspectDesignSystem } = await import("../../catalog.mjs");
  const { buildInfoResult } = await import("../../registry.mjs");
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
