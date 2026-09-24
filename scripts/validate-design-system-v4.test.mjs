#!/usr/bin/env node
/**
 * V4 package validation tests (Node built-in test runner, no dependency).
 *
 * Run directly:
 *   node --test scripts/validate-design-system-v4.test.mjs
 *
 * These tests exercise the contract-aware `validateDesignSystem` entry point
 * through the real V4 branch. Fixtures are generated into an isolated temporary
 * repository root so the tests never read or mutate the real packages; the
 * valid fixture is built from the same `buildManifest` helper the validator
 * uses, so a passing case proves the generated manifest is fresh.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  V4_OPTIONAL_COMPONENTS,
  V4_REQUIRED_COMPONENTS,
  buildManifest,
  renderV4TokenArtifactFiles,
  serializeManifest,
} from "./design-system-manifest.mjs";
import { validateDesignSystem } from "./validate-design-system.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS_FIXTURE = join(repoRoot, "schemas", "fixtures", "v4-valid", "tokens.source.json");

const ID = "v4-alpha";
const NAME = "V4 Alpha";
const VERSION = "2.0.0";
const PACKAGE_NAME = "@prism-system/ui-v4-alpha";
const UI_CLASS = "maivand-v4-alpha-ui";
const TOKENS_EXPORT = "v4AlphaTokens";

/** Declared compound members per component; unlisted components have none. */
const MEMBERS = Object.freeze({
  Card: ["Header", "Title", "Description", "Content", "Footer"],
  RadioGroup: ["Item", "Indicator"],
  Switch: ["Thumb"],
  Select: ["Trigger", "Value", "Content", "Group", "Label", "Item", "Separator"],
  Tabs: ["List", "Trigger", "Content"],
  Dialog: [
    "Trigger",
    "Close",
    "Portal",
    "Overlay",
    "Content",
    "Header",
    "Footer",
    "Title",
    "Description",
  ],
  DropdownMenu: [
    "Trigger",
    "Portal",
    "Content",
    "Group",
    "Label",
    "Item",
    "CheckboxItem",
    "RadioGroup",
    "RadioItem",
    "ItemIndicator",
    "Separator",
    "Arrow",
    "Sub",
    "SubTrigger",
    "SubContent",
  ],
  Tooltip: ["Provider", "Trigger", "Portal", "Content", "Arrow"],
  FormField: ["Label", "Control", "Description", "Error"],
  Alert: ["Title", "Description"],
});

function toKebabCase(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeFile(root, relativePath, content) {
  const target = join(root, relativePath);
  ensureDir(dirname(target));
  writeFileSync(target, content, "utf8");
}

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** The descriptor `components` map in canonical V4 order. */
function buildComponents(optional) {
  const names = [...V4_REQUIRED_COMPONENTS, ...optional];
  const components = {};
  for (const name of names) {
    components[name] = { variants: [], sizes: [], members: [...(MEMBERS[name] ?? [])] };
  }
  return components;
}

/**
 * Build a valid V4 package fixture under a fresh temporary root. `mutate`
 * receives `{ root, pkgDir, components }` and may change files before the
 * caller runs validation.
 */
function makeRepo({ optional = ["Grid", "Alert"], mutate } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prism-v4-validate-"));
  const pkgDir = join(root, "packages", ID);
  const components = buildComponents(optional);
  const declared = Object.keys(components);

  writeJson(root, join("config", "design-systems.json"), {
    version: 2,
    designSystems: [
      {
        id: ID,
        name: NAME,
        packageName: PACKAGE_NAME,
        packagePath: `packages/${ID}`,
        version: VERSION,
        uiClass: UI_CLASS,
        tokensExport: TOKENS_EXPORT,
        contract: "v4",
      },
    ],
  });

  writeJson(root, join("packages", ID, "package.json"), {
    name: PACKAGE_NAME,
    version: VERSION,
    private: true,
    prismSystem: { name: NAME, contract: "v4", uiClass: UI_CLASS, tokensExport: TOKENS_EXPORT },
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.mjs" },
      "./styles.css": "./dist/index.css",
      "./tokens": {
        types: "./dist/tokens/index.d.ts",
        import: "./dist/tokens/index.mjs",
        require: "./dist/tokens/index.js",
      },
      "./tailwind.css": "./dist/tailwind.css",
      "./manifest": "./design-system.json",
    },
    files: ["dist", "README.md", "AGENTS.md", "design-system.json", "design-brief.json", "LICENSE"],
  });

  writeJson(root, join("packages", ID, "design-system.source.json"), {
    $schema:
      "https://github.com/maivand-rahmani/prism-system/schemas/design-system-source-v4.schema.json",
    schemaVersion: 2,
    contract: "v4",
    name: NAME,
    components,
    design: { density: "comfortable", theme: "dual", radius: "medium", keywords: ["calm"] },
    rules: {
      allowArbitraryColors: false,
      allowArbitraryRadius: false,
      allowArbitraryShadows: false,
      allowPrimitiveDuplication: false,
    },
    docs: { readme: "./README.md", agents: "./AGENTS.md" },
  });

  writeFile(pkgDir, "tokens.source.json", readFileSync(TOKENS_FIXTURE, "utf8"));
  writeJson(pkgDir, "design-brief.json", { project: NAME, summary: "V4 fixture." });
  writeFile(pkgDir, "README.md", `# ${NAME}\n\nInstall with \`pnpm add ${PACKAGE_NAME}\`.\n`);
  writeFile(pkgDir, "AGENTS.md", `# ${NAME}\n\n${PACKAGE_NAME} uses the V4 contract.\n`);
  writeFile(pkgDir, "LICENSE", "UNLICENSED\n");
  writeJson(pkgDir, "tsconfig.json", { compilerOptions: { strict: true } });

  // Generated manifest, built with the same helper the validator calls.
  const manifest = buildManifest({ id: ID, packageDir: pkgDir });
  writeFile(pkgDir, "design-system.json", serializeManifest(manifest));

  writeFile(
    pkgDir,
    "src/index.ts",
    [
      'import "./styles/index.css";',
      "",
      'export * from "./components/index.js";',
      'export * from "./tokens/index.js";',
      'export * from "./design-system.js";',
      "",
    ].join("\n"),
  );

  const runtimeImports = declared.join(",\n  ");
  writeFile(
    pkgDir,
    "src/design-system.ts",
    [
      'import { defineDesignSystemV4 } from "@prism-system/ui-core";',
      "import {",
      `  ${runtimeImports},`,
      '} from "./components/index.js";',
      "",
      "export const DesignSystem = defineDesignSystemV4({",
      `  id: ${JSON.stringify(ID)},`,
      `  name: ${JSON.stringify(NAME)},`,
      `  packageName: ${JSON.stringify(PACKAGE_NAME)},`,
      `  version: ${JSON.stringify(VERSION)},`,
      '  componentContract: "v4",',
      "  components: {",
      ...declared.map((name) => `    ${name},`),
      "  },",
      "});",
      "",
    ].join("\n"),
  );

  writeFile(
    pkgDir,
    "src/components/index.ts",
    `${declared.map((name) => `export { ${name} } from "./${toKebabCase(name)}/index.js";`).join("\n")}\n`,
  );

  for (const name of declared) {
    const kebab = toKebabCase(name);
    const members = MEMBERS[name] ?? [];
    const tsx =
      members.length === 0
        ? [
            `const ui = ${JSON.stringify(UI_CLASS)};`,
            `export const ${name} = () => null;`,
            "",
          ].join("\n")
        : [
            `const ui = ${JSON.stringify(UI_CLASS)};`,
            `const ${name}Root = () => null;`,
            ...members.map((member) => `const ${member} = () => null;`),
            `export const ${name} = Object.assign(${name}Root, {`,
            ...members.map((member) => `  ${member}: ${member},`),
            "});",
            "",
          ].join("\n");
    writeFile(pkgDir, `src/components/${kebab}/${name}.tsx`, tsx);
    writeFile(
      pkgDir,
      `src/components/${kebab}/${kebab}.css`,
      `.${UI_CLASS} .maivand-v4-alpha-${kebab} { color: inherit; }\n`,
    );
    writeFile(
      pkgDir,
      `src/components/${kebab}/index.ts`,
      `export { ${name} } from "./${name}.js";\n`,
    );
  }

  writeFile(
    pkgDir,
    "src/styles/index.css",
    [
      '@import "./tokens.css";',
      ...declared.map(
        (name) => `@import "../components/${toKebabCase(name)}/${toKebabCase(name)}.css";`,
      ),
      "",
    ].join("\n"),
  );
  // Generate the three token artifacts with the same renderer the manifest
  // tooling uses, so the drift check is exercised against real output.
  for (const artifact of renderV4TokenArtifactFiles(pkgDir)) {
    writeFile(pkgDir, artifact.relativePath, artifact.content);
  }

  if (mutate) mutate({ root, pkgDir, components, declared });

  return root;
}

/** Run validation, assert `ok`, and clean up the temporary root. */
function run(root, id = ID) {
  try {
    return validateDesignSystem({ id, root, runCommands: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function failureText(result) {
  return result.failures.join("\n");
}

test("a valid V4 package passes all V4 checks", () => {
  const result = run(makeRepo());
  assert.equal(result.ok, true, failureText(result));
  const names = result.checks.map((check) => check.name);
  for (const expected of [
    "manifest entry",
    "package metadata",
    "required package files",
    "package naming and exports",
    "package files field",
    "contract and V4 metadata",
    "generated manifest",
    "version consistency",
    "component folders",
    "component barrel exports",
    "compound members",
    "stylesheet entry",
    "runtime design system",
    "package boundaries",
    "documentation",
  ]) {
    assert.ok(names.includes(expected), `expected check "${expected}"`);
  }
});

test("a V4 package with no optional components is valid", () => {
  const result = run(makeRepo({ optional: [] }));
  assert.equal(result.ok, true, failureText(result));
});

test("a static const components map is accepted", () => {
  const declared = [...V4_REQUIRED_COMPONENTS, "Grid", "Alert"];
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        writeFile(
          pkgDir,
          "src/design-system.ts",
          [
            'import { defineDesignSystemV4 } from "@prism-system/ui-core";',
            "const COMPONENTS = {",
            ...declared.map((name) => `  ${name},`),
            "};",
            "",
            "export const DesignSystem = defineDesignSystemV4({",
            `  id: ${JSON.stringify(ID)},`,
            `  name: ${JSON.stringify(NAME)},`,
            `  packageName: ${JSON.stringify(PACKAGE_NAME)},`,
            `  version: ${JSON.stringify(VERSION)},`,
            '  componentContract: "v4",',
            "  components: COMPONENTS,",
            "});",
            "",
          ].join("\n"),
        );
      },
    }),
  );
  assert.equal(result.ok, true, failureText(result));
});

test("a shorthand static components map is accepted", () => {
  const declared = [...V4_REQUIRED_COMPONENTS, "Grid", "Alert"];
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        writeFile(
          pkgDir,
          "src/design-system.ts",
          [
            'import { defineDesignSystemV4 } from "@prism-system/ui-core";',
            "const components = {",
            ...declared.map((name) => `  ${name},`),
            "};",
            "",
            "export const DesignSystem = defineDesignSystemV4({",
            `  id: ${JSON.stringify(ID)},`,
            `  name: ${JSON.stringify(NAME)},`,
            `  packageName: ${JSON.stringify(PACKAGE_NAME)},`,
            `  version: ${JSON.stringify(VERSION)},`,
            '  componentContract: "v4",',
            "  components,",
            "});",
            "",
          ].join("\n"),
        );
      },
    }),
  );
  assert.equal(result.ok, true, failureText(result));
});

test("omitting a declared optional component from the runtime map fails", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "design-system.ts");
        writeFileSync(path, readFileSync(path, "utf8").replace(/^ {4}Grid,\n/m, ""), "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /component map does not match .*Missing: Grid\./s);
});

test("declaring an undeclared optional component in the runtime map fails", () => {
  const result = run(
    makeRepo({
      optional: ["Alert"],
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "design-system.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace("  components: {", "  components: {\n    Grid,"),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /component map does not match .*Undeclared: Grid\./s);
});

test("an unknown component in the runtime map fails", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "design-system.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace("  components: {", "  components: {\n    Widget,"),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Undeclared: Widget\./);
});

test("the runtime map missing a required component fails", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "design-system.ts");
        writeFileSync(path, readFileSync(path, "utf8").replace(/^ {4}Heading,\n/m, ""), "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Missing: Heading\./);
});

test("a dynamic runtime version is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "design-system.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(
            `version: ${JSON.stringify(VERSION)},`,
            'version: "2.0.0" + "",',
          ),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /property "version" must be exactly one static string literal/);
});

test("a mismatched runtime version is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "design-system.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(
            `version: ${JSON.stringify(VERSION)},`,
            'version: "9.9.9",',
          ),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Runtime DesignSystem\.version "9\.9\.9" does not match/);
});

test("a mismatched runtime id is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "design-system.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(`id: ${JSON.stringify(ID)},`, 'id: "other",'),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /src\/design-system\.ts id "other" does not match/);
});

test("a missing component folder module is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        rmSync(join(pkgDir, "src", "components", "button", "Button.tsx"));
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result),
    /Missing component module: src\/components\/button\/Button\.tsx\./,
  );
});

test("the legacy monolithic components module is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        writeFile(pkgDir, "src/components/index.tsx", "export const Button = () => null;\n");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /src\/components\/index\.tsx .*not allowed/);
});

test("a component stylesheet not scoped under the UI class is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        writeFile(pkgDir, "src/components/button/button.css", ".button { color: red; }\n");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /is not scoped under "\.maivand-v4-alpha-ui"/);
});

test("a component module not referencing the system class is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        writeFile(
          pkgDir,
          "src/components/button/Button.tsx",
          "export const Button = () => null;\n",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result),
    /Button\.tsx does not reference the system class "maivand-v4-alpha"/,
  );
});

test("the component barrel missing a declared export is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "components", "index.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(/^export \{ Heading \}.*\n/m, ""),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /missing declared component exports: Heading\./);
});

test("the component barrel exporting an undeclared optional component is rejected", () => {
  const result = run(
    makeRepo({
      optional: ["Alert"],
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "components", "index.ts");
        writeFileSync(
          path,
          `${readFileSync(path, "utf8")}export { Grid } from "./grid/index.js";\n`,
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /exports undeclared V4 component\(s\): Grid\./);
});

test("a compound member mismatch is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "components", "card", "Card.tsx");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(/^ {2}Description: Description,\n/m, ""),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Compound members for "Card".*Missing: Description\./s);
});

test("a component attaching undeclared members is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "components", "button", "Button.tsx");
        writeFileSync(
          path,
          [
            `const ui = ${JSON.stringify(UI_CLASS)};`,
            "const ButtonRoot = () => null;",
            "const Icon = () => null;",
            "export const Button = Object.assign(ButtonRoot, { Icon });",
            "",
          ].join("\n"),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Component "Button" declares no members.*attaches: Icon/s);
});

test("the stylesheet missing the generated tokens import is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "styles", "index.css");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace('@import "./tokens.css";\n', ""),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /must import the generated "\.\/tokens\.css"/);
});

test("the stylesheet missing a component import is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "styles", "index.css");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(/^@import "\.\.\/components\/button.*\n/m, ""),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result),
    /component stylesheets in canonical order.*Missing: \.\.\/components\/button/s,
  );
});

test("the stylesheet with component imports out of canonical order is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "styles", "index.css");
        const lines = readFileSync(path, "utf8").split("\n");
        const [tokens, first, second, ...rest] = lines;
        writeFileSync(path, [tokens, second, first, ...rest].join("\n"), "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /component stylesheets in canonical order/);
});

test("a missing generated token artifact is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        rmSync(join(pkgDir, "src", "styles", "tokens.css"));
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Missing required file: src\/styles\/tokens\.css/);
});

test("a missing tailwind bridge artifact is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        rmSync(join(pkgDir, "src", "styles", "tailwind.css"));
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Missing required file: src\/styles\/tailwind\.css/);
});

test("a missing required export subpath is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "package.json");
        const pkg = JSON.parse(readFileSync(path, "utf8"));
        delete pkg.exports["./tailwind.css"];
        writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /exports is missing "\.\/tailwind\.css"/);
});

test("an incorrect ./styles.css export target is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "package.json");
        const pkg = JSON.parse(readFileSync(path, "utf8"));
        pkg.exports["./styles.css"] = "./dist/styles.css";
        writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result),
    /exports\["\.\/styles\.css"\] must be exactly "\.\/dist\/index\.css"/,
  );
});

test("an incorrect ./tailwind.css export target is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "package.json");
        const pkg = JSON.parse(readFileSync(path, "utf8"));
        pkg.exports["./tailwind.css"] = "./dist/styles/tailwind.css";
        writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result),
    /exports\["\.\/tailwind\.css"\] must be exactly "\.\/dist\/tailwind\.css"/,
  );
});

test("an incorrect ./tokens export target is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "package.json");
        const pkg = JSON.parse(readFileSync(path, "utf8"));
        pkg.exports["./tokens"] = { types: "./dist/tokens.d.ts", import: "./dist/tokens.mjs" };
        writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /exports\["\.\/tokens"\] must be exactly/);
});

test("a src/index.ts that only side-effect imports the runtime is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "index.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(
            'export * from "./design-system.js";',
            'import "./design-system.js";',
          ),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result),
    /src\/index\.ts must re-export the runtime "DesignSystem" symbol from "\.\/design-system\.js"\./,
  );
});

test("a src/index.ts re-exporting the wrong design-system symbol is rejected", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir }) => {
        const path = join(pkgDir, "src", "index.ts");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(
            'export * from "./design-system.js";',
            'export { designSystem } from "./design-system.js";',
          ),
          "utf8",
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /must re-export the runtime "DesignSystem" symbol/);
});

test("a descriptor missing a required component fails the manifest check", () => {
  const result = run(
    makeRepo({
      mutate: ({ pkgDir, components }) => {
        delete components.Heading;
        writeJson(pkgDir, "design-system.source.json", {
          $schema:
            "https://github.com/maivand-rahmani/prism-system/schemas/design-system-source-v4.schema.json",
          schemaVersion: 2,
          contract: "v4",
          name: NAME,
          components,
          design: { density: "comfortable", theme: "dual", radius: "medium", keywords: ["calm"] },
          rules: {
            allowArbitraryColors: false,
            allowArbitraryRadius: false,
            allowArbitraryShadows: false,
            allowPrimitiveDuplication: false,
          },
        });
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result),
    /must declare all twenty V4 required components.*Missing: Heading\./s,
  );
});

test("the registry entry must be canonical for the id", () => {
  const result = run(
    makeRepo({
      mutate: ({ root }) => {
        const path = join(root, "config", "design-systems.json");
        const manifest = JSON.parse(readFileSync(path, "utf8"));
        manifest.designSystems[0].uiClass = "maivand-wrong-ui";
        writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result), /Manifest uiClass "maivand-wrong-ui" is not canonical/);
});

test("an unsupported contract entry still reports the V1 message", () => {
  const root = mkdtempSync(join(tmpdir(), "prism-v4-validate-"));
  try {
    writeJson(root, join("config", "design-systems.json"), {
      version: 2,
      designSystems: [
        {
          id: "legacy",
          name: "Legacy",
          packageName: "@prism-system/ui-legacy",
          packagePath: "packages/legacy",
          version: "0.0.0",
          uiClass: "maivand-legacy-ui",
          tokensExport: "legacyTokens",
          contract: "v1",
        },
      ],
    });
    const result = validateDesignSystem({ id: "legacy", root, runCommands: false });
    assert.equal(result.ok, false);
    assert.match(failureText(result), /has contract "v1"; V2 tooling requires contract "v2"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed V2 systems keep the V2 branch when still registered as v2", () => {
  const config = JSON.parse(readFileSync(join(repoRoot, "config", "design-systems.json"), "utf8"));
  const entry = config.designSystems.find((system) => system.id === "system-a");
  if (!entry || entry.contract !== "v2") {
    // system-a has migrated to V4 in this checkout; the V2 branch regression is
    // covered by the unsupported-contract test above.
    return;
  }
  const result = validateDesignSystem({ id: "system-a", root: repoRoot, runCommands: false });
  assert.equal(result.ok, true, failureText(result));
  assert.deepEqual(
    result.checks.map((check) => check.name),
    [
      "manifest entry",
      "package metadata",
      "required package files",
      "package naming and exports",
      "package files field",
      "contract and V2 metadata",
      "generated manifest",
      "version consistency",
      "required component exports",
      "tokens and theme",
      "package boundaries",
      "design brief",
      "documentation",
      "app registration",
    ],
  );
});

test("optional components are never required when the descriptor omits them", () => {
  // Sanity: a package with no optional capability must not mention any optional
  // component and must still pass, proving absence means "unavailable".
  const result = run(makeRepo({ optional: [] }));
  assert.equal(result.ok, true, failureText(result));
  const manifest = JSON.parse(
    readFileSync(
      join(repoRoot, "schemas", "fixtures", "v4-valid", "design-system.source.json"),
      "utf8",
    ),
  );
  // Guard the fixture contract: the optional list is a real V4 subset.
  assert.deepEqual(
    V4_OPTIONAL_COMPONENTS.filter((name) => name in manifest.components),
    ["Grid", "Alert"],
  );
  assert.equal(existsSync(TOKENS_FIXTURE), true);
});
