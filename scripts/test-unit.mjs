#!/usr/bin/env node
// Discover only maintained test directories, never generated TEMP consumers.
// Runtime and SSR tests require `pnpm build` first.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directories = [
  "scripts",
  "packages/core/src/design-system",
  "packages/system-a",
  "packages/system-b",
  "packages/tools/test",
];
const files = directories.flatMap((directory) =>
  readdirSync(join(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => join(directory, entry.name))
    .sort(),
);
const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
