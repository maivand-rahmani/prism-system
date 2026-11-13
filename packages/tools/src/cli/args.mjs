/**
 * Shared argument parsing for every `prism-ds` root command.
 *
 * Package-internal: `../cli.mjs` is the only public CLI surface. This module
 * has no imports, performs no I/O, and has no side effects.
 */

function toCamelFlag(key) {
  return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Parse shared CLI arguments with a per-command allowlist. Throws on unknown
 * options, missing values, boolean options given values, or extra positionals.
 */
function parseOptions(
  argv,
  { maxPositionals = 0, booleans = [], values = [], repeatable = [] } = {},
) {
  const options = {
    cwd: undefined,
    strict: undefined,
    check: false,
    dryRun: false,
    ignore: [],
    help: false,
    json: false,
    size: undefined,
    registry: undefined,
    saveDev: false,
    saveProd: false,
    exact: false,
    checkUsage: false,
    tailwind: false,
    css: undefined,
    entry: undefined,
    withEntry: [],
    peer: [],
    agent: [],
    skillAgent: [],
  };
  const booleanSet = new Set(booleans);
  const valueSet = new Set(values);
  const repeatableSet = new Set(repeatable);
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const inlineValue = equals === -1 ? undefined : arg.slice(equals + 1);

    if (key === "strict" && booleanSet.has("strict")) {
      if (inlineValue !== undefined) throw new Error("Option --strict does not take a value.");
      options.strict = true;
      continue;
    }
    if (key === "no-strict" && booleanSet.has("strict")) {
      if (inlineValue !== undefined) throw new Error("Option --no-strict does not take a value.");
      options.strict = false;
      continue;
    }
    if (booleanSet.has(key)) {
      if (inlineValue !== undefined) throw new Error(`Option --${key} does not take a value.`);
      options[toCamelFlag(key)] = true;
      continue;
    }
    if (valueSet.has(key) || repeatableSet.has(key)) {
      let value = inlineValue;
      if (value === undefined) {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Option --${key} requires a value.`);
        }
        index += 1;
      }
      if (repeatableSet.has(key)) options[toCamelFlag(key)].push(value);
      else options[toCamelFlag(key)] = value;
      continue;
    }
    throw new Error(`Unknown option: --${key}`);
  }

  if (positionals.length > maxPositionals) {
    throw new Error(
      `Expected at most ${maxPositionals} positional argument(s), received: ${positionals.join(", ")}.`,
    );
  }
  return { options, positionals };
}

export { parseOptions };
