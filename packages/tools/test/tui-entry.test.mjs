/**
 * Entry-point tests for the inline interactive `prism-ds` TUI.
 *
 * No real terminal window, Windows helper, registry, or consumer mutation is
 * touched: every dependency of `runTui` is injected, and a fake renderer stands
 * in for Ink/React/Runeframe/`tui-app.mjs` so the tests also prove that the
 * framework is reached only after the entry point's gates pass. The only real
 * subprocesses launched are the published `bin/prism-ds.mjs` with piped stdio.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

import { helpText, runCli } from "../src/cli.mjs";
import { renderInkTui, runTui, TUI_CLEAR_HOME } from "../src/tui.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TOOLS_ROOT = resolve(TEST_DIR, "..");
const BIN_PATH = join(TOOLS_ROOT, "bin", "prism-ds.mjs");

const SERVICES = Object.freeze({ cwd: "virtual-consumer", kind: "injected-services" });
const NORMAL_ENV = Object.freeze({ TERM: "xterm-256color" });

/* -------------------------------------------------------------------------- */
/* Fakes                                                                      */
/* -------------------------------------------------------------------------- */

function createStream({ isTTY = true } = {}) {
  const writes = [];
  return {
    isTTY,
    writes,
    write(chunk) {
      writes.push(String(chunk));
      return true;
    },
    output() {
      return writes.join("");
    },
  };
}

function createRenderer({ beforeReturn = null, waitError = null, events = [] } = {}) {
  const calls = [];
  const instance = {
    unmounts: 0,
    exits: 0,
    unmount() {
      this.unmounts += 1;
      events.push("unmount");
    },
    async waitUntilExit() {
      this.exits += 1;
      events.push("exit");
      if (waitError !== null) throw waitError;
    },
  };
  const renderer = async (spec) => {
    calls.push({ spec, stdoutAtRender: spec.stdout.output() });
    events.push("render");
    if (beforeReturn !== null) beforeReturn(spec);
    return instance;
  };
  renderer.calls = calls;
  renderer.instance = instance;
  return renderer;
}

function createTransport({ events = [] } = {}) {
  return {
    stdin: createStream(),
    mouseEvents: { subscribe: () => () => {} },
    closes: 0,
    async close() {
      this.closes += 1;
      events.push("close");
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Subprocess helpers                                                         */
/* -------------------------------------------------------------------------- */

function runNode(args, { cwd = TOOLS_ROOT } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolvePromise({ stdout, stderr, exitCode }));
  });
}

/** Run `runCli` in-process while capturing `process.stdout`/`stderr`/exitCode. */
async function captureCli(argv) {
  const out = [];
  const err = [];
  const previousExit = process.exitCode;
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  process.stdout.write = (chunk) => {
    out.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    err.push(String(chunk));
    return true;
  };
  try {
    process.exitCode = undefined;
    const result = await runCli(argv);
    return { result, exitCode: process.exitCode, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
    process.exitCode = previousExit;
  }
}

/** Force a TTY property to `undefined`, returning a restore function. */
function forceUndefinedTty(stream) {
  const hadOwn = Object.prototype.hasOwnProperty.call(stream, "isTTY");
  const previous = stream.isTTY;
  let assigned = false;
  try {
    stream.isTTY = undefined;
    assigned = true;
  } catch {
    assigned = false;
  }
  return () => {
    if (!assigned) return;
    try {
      if (hadOwn) stream.isTTY = previous;
      else delete stream.isTTY;
    } catch {
      // Nothing further can be restored.
    }
  };
}

/**
 * Write a `--import` loader whose resolve hook rejects Ink, React, and
 * Runeframe, proving an invocation never eagerly loads the framework.
 */
function createFrameworkBlockingLoader(t) {
  const dir = mkdtempSync(join(tmpdir(), "prism-tui-loader-"));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const hooksPath = join(dir, "framework-block-hooks.mjs");
  const loaderPath = join(dir, "framework-block-loader.mjs");
  writeFileSync(
    hooksPath,
    [
      'const BLOCKED = new Set(["ink", "react", "runeframe"]);',
      "export async function resolve(specifier, context, nextResolve) {",
      '  const name = specifier.startsWith("runeframe/") ? "runeframe" : specifier;',
      "  if (BLOCKED.has(name)) {",
      "    throw new Error(`framework dependency eagerly loaded: ${specifier}`);",
      "  }",
      "  return nextResolve(specifier, context);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    loaderPath,
    [
      'import { register } from "node:module";',
      `register(${JSON.stringify(pathToFileURL(hooksPath).href)});`,
      "",
    ].join("\n"),
    "utf8",
  );
  return pathToFileURL(loaderPath).href;
}

/* -------------------------------------------------------------------------- */
/* Refusals before any framework or terminal work                             */
/* -------------------------------------------------------------------------- */

test("refuses without a TTY on both streams before render, clear, or Windows work", async () => {
  for (const missing of ["stdin", "stdout"]) {
    let windowsLoaderCalls = 0;
    const renderer = createRenderer();
    const stdin = createStream({ isTTY: missing !== "stdin" });
    const stdout = createStream({ isTTY: missing !== "stdout" });
    const stderr = createStream();

    const result = await runTui({
      stdin,
      stdout,
      stderr,
      env: NORMAL_ENV,
      platform: "win32",
      nodeVersion: "22.13.1",
      services: SERVICES,
      renderer,
      loadWindowsInput: async () => {
        windowsLoaderCalls += 1;
        throw new Error("the Windows module must not load without a TTY");
      },
    });

    assert.equal(result.ok, false, missing);
    assert.equal(result.status, 1, missing);
    assert.equal(result.reason, "no-tty", missing);
    assert.equal(renderer.calls.length, 0, missing);
    assert.equal(windowsLoaderCalls, 0, missing);
    assert.equal(stdin.writes.length, 0, missing);
    assert.equal(stdout.output(), "", `${missing}: no clear sequence or escape output`);
    const message = stderr.output();
    assert.match(message, /interactive TUI needs a terminal on both stdin and stdout/);
    assert.match(message, /prism-ds --help/);
    assert.match(message, /prism-ds components --cwd <consumer-root>/);
    assert.match(message, /prism-ds check --cwd <consumer-root> --css <file>/);
  }
});

test("refuses interactive Node < 22 with the Runeframe requirement before framework work", async () => {
  for (const nodeVersion of ["20.19.0", "18.20.4", "not-a-version"]) {
    let windowsLoaderCalls = 0;
    const renderer = createRenderer();
    const stdout = createStream();
    const stderr = createStream();

    const result = await runTui({
      stdin: createStream(),
      stdout,
      stderr,
      env: NORMAL_ENV,
      platform: "win32",
      nodeVersion,
      services: SERVICES,
      renderer,
      loadWindowsInput: async () => {
        windowsLoaderCalls += 1;
        throw new Error("the Windows module must not load");
      },
    });

    assert.equal(result.status, 1, nodeVersion);
    assert.equal(result.reason, "node-version", nodeVersion);
    assert.equal(renderer.calls.length, 0, nodeVersion);
    assert.equal(windowsLoaderCalls, 0, nodeVersion);
    assert.equal(stdout.output(), "", nodeVersion);
    const message = stderr.output();
    assert.match(message, /requires Node\.js >= 22/);
    assert.match(message, /Runeframe 0\.5 requires Node >= 22/);
  }
});

test("TERM=dumb refuses on POSIX and Windows before services, clear, Windows module, or render", async () => {
  for (const platform of ["linux", "win32"]) {
    for (const term of ["dumb", "DUMB", " dumb ", "\tDumb "]) {
      const label = `${platform} ${JSON.stringify(term)}`;
      let windowsLoaderCalls = 0;
      const renderer = createRenderer();
      const stdout = createStream();
      const stderr = createStream();

      const result = await runTui({
        stdin: createStream(),
        stdout,
        stderr,
        env: { TERM: term },
        platform,
        nodeVersion: "22.13.1",
        // `undefined` exercises the default-facade branch: any fallthrough past
        // the refusal would reach the injected renderer and fail the assertions.
        services: undefined,
        renderer,
        loadWindowsInput: async () => {
          windowsLoaderCalls += 1;
          throw new Error("the Windows module must not load for TERM=dumb");
        },
      });

      assert.equal(result.ok, false, label);
      assert.equal(result.status, 1, label);
      assert.equal(result.reason, "dumb-terminal", label);
      assert.equal(renderer.calls.length, 0, `${label}: no render`);
      assert.equal(windowsLoaderCalls, 0, `${label}: no Windows module load`);
      assert.equal(stdout.output(), "", `${label}: no clear sequence or escape output`);
      const message = stderr.output();
      assert.match(message, /needs a cursor-addressable terminal/, label);
      assert.match(message, /TERM is "dumb"/i, label);
      assert.match(message, /prism-ds --help/, label);
      assert.match(message, /prism-ds components --cwd <consumer-root>/, label);
      assert.match(message, /prism-ds check --cwd <consumer-root> --css <file>/, label);
    }
  }
});

test("injection arguments fail closed when they have the wrong shape", async () => {
  await assert.rejects(() => runTui({ renderer: "not-a-function" }), /renderer must be a function/);
  await assert.rejects(() => runTui({ services: null }), /"services" must be the TUI operations/);
  await assert.rejects(
    () => runTui({ loadWindowsInput: 5 }),
    /loadWindowsInput must be a function/,
  );
  await assert.rejects(
    () => runTui({ createWindowsInputTransport: "nope" }),
    /createWindowsInputTransport must be a function/,
  );
});

/* -------------------------------------------------------------------------- */
/* Normal TTY mode                                                            */
/* -------------------------------------------------------------------------- */

test("normal TTY mode clears and homes before render, keeps the origin truthful, and exits cleanly", async () => {
  const events = [];
  const renderer = createRenderer({ events });
  const stdin = createStream();
  const stdout = createStream();
  const stderr = createStream();

  const result = await runTui({
    stdin,
    stdout,
    stderr,
    env: NORMAL_ENV,
    platform: "linux",
    nodeVersion: "22.13.1",
    services: SERVICES,
    renderer,
  });

  assert.equal(TUI_CLEAR_HOME, "\x1b[2J\x1b[H");
  assert.equal(result.ok, true);
  assert.equal(result.status, 0);
  assert.equal(result.reason, null);
  assert.equal(result.error, null);

  assert.equal(renderer.calls.length, 1);
  const { spec, stdoutAtRender } = renderer.calls[0];
  assert.equal(spec.services, SERVICES);
  assert.equal(spec.stdin, stdin);
  assert.equal(spec.stdout, stdout);
  assert.equal(spec.stderr, stderr);
  assert.equal(spec.mouseEnabled, true);
  assert.equal(spec.mouseEventSource, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(spec, "alternateScreen"), false);

  // The clear/home write precedes the renderer; nothing else is written.
  assert.equal(stdoutAtRender, TUI_CLEAR_HOME);
  assert.equal(stdout.output(), TUI_CLEAR_HOME);

  // The renderer is exercised exactly once and its exit settles before teardown.
  assert.equal(renderer.instance.exits, 1);
  assert.equal(renderer.instance.unmounts, 1);
  assert.deepEqual(events, ["render", "exit", "unmount"]);
});

test("NO_COLOR=1 on a cursor-addressable TTY still clears, homes, and renders normally", async () => {
  const events = [];
  const renderer = createRenderer({ events });
  const stdout = createStream();
  const stderr = createStream();

  const result = await runTui({
    stdin: createStream(),
    stdout,
    stderr,
    env: { TERM: "xterm-256color", NO_COLOR: "1" },
    platform: "linux",
    nodeVersion: "22.13.1",
    services: SERVICES,
    renderer,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
  assert.equal(renderer.calls.length, 1);
  const { spec, stdoutAtRender } = renderer.calls[0];
  assert.equal(stdoutAtRender, TUI_CLEAR_HOME);
  assert.equal(stdout.output(), TUI_CLEAR_HOME);
  assert.equal(spec.mouseEnabled, true);
  assert.equal(spec.mouseEventSource, undefined);
  assert.deepEqual(events, ["render", "exit", "unmount"]);
});

test("the default operation facade targets the injected cwd and never switches it", async () => {
  const renderer = createRenderer();
  const cwd = join(TOOLS_ROOT, "test");
  const result = await runTui({
    stdin: createStream(),
    stdout: createStream(),
    stderr: createStream(),
    env: NORMAL_ENV,
    platform: "linux",
    nodeVersion: "22.13.1",
    cwd,
    services: undefined,
    renderer,
  });
  assert.equal(result.ok, true);
  const services = renderer.calls[0].spec.services;
  assert.equal(services.cwd, resolve(cwd));
  assert.equal(typeof services.getProjectState, "function");
  assert.equal(typeof services.previewMutation, "function");
  assert.equal(typeof services.executeMutation, "function");

  // With no explicit cwd the facade is built on the current process target.
  const defaultRenderer = createRenderer();
  const defaultResult = await runTui({
    stdin: createStream(),
    stdout: createStream(),
    stderr: createStream(),
    env: NORMAL_ENV,
    platform: "linux",
    nodeVersion: "22.13.1",
    services: undefined,
    renderer: defaultRenderer,
  });
  assert.equal(defaultResult.ok, true);
  assert.equal(defaultRenderer.calls[0].spec.services.cwd, resolve(process.cwd()));
});

/* -------------------------------------------------------------------------- */
/* Windows transport                                                          */
/* -------------------------------------------------------------------------- */

test("Windows creates the native transport before render and tears it down in finally", async () => {
  const events = [];
  const transport = createTransport({ events });
  const stderr = createStream();
  const stdout = createStream();
  let loaderCalls = 0;
  const factoryOptions = [];
  const factory = async (options) => {
    factoryOptions.push(options);
    events.push("create");
    return transport;
  };

  const renderer = createRenderer({ events });
  const result = await runTui({
    stdin: createStream(),
    stdout,
    stderr,
    env: NORMAL_ENV,
    platform: "win32",
    nodeVersion: "22.13.1",
    services: SERVICES,
    renderer,
    loadWindowsInput: async () => {
      loaderCalls += 1;
      events.push("load");
      return { createWindowsInputTransport: factory };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(loaderCalls, 1);
  assert.equal(factoryOptions.length, 1);
  assert.equal(factoryOptions[0].stderr, stderr);
  assert.equal(typeof factoryOptions[0].onInputFailure, "function");

  const { spec, stdoutAtRender } = renderer.calls[0];
  assert.equal(spec.stdin, transport.stdin, "Ink stdin is the transport's stdin");
  assert.equal(spec.mouseEventSource, transport.mouseEvents);
  assert.equal(spec.mouseEnabled, true);
  assert.equal(stdoutAtRender, TUI_CLEAR_HOME);

  assert.equal(transport.closes, 1);
  assert.equal(renderer.instance.unmounts, 1);
  // Load, create, render, exit, unmount, close: the transport releases the
  // console only after Ink is unmounted.
  assert.deepEqual(events, ["load", "create", "render", "exit", "unmount", "close"]);
});

test("a Windows helper failure before the first render closes the transport and never clears or mounts", async () => {
  for (const mode of ["sync", "microtask"]) {
    const events = [];
    const transport = createTransport({ events });
    const stdout = createStream();
    const stderr = createStream();
    const renderer = createRenderer({ events });
    const helperError = new Error(`helper exited before render (${mode})`);
    const factory = async (factoryOptions) => {
      events.push("create");
      if (mode === "sync") {
        // Reported while the transport is still being created.
        factoryOptions.onInputFailure(helperError);
      } else {
        // Reported in a microtask right after the transport resolves, still
        // strictly before `render` begins.
        queueMicrotask(() => factoryOptions.onInputFailure(helperError));
      }
      return transport;
    };

    const result = await runTui({
      stdin: createStream(),
      stdout,
      stderr,
      env: NORMAL_ENV,
      platform: "win32",
      nodeVersion: "22.13.1",
      services: SERVICES,
      renderer,
      loadWindowsInput: async () => ({ createWindowsInputTransport: factory }),
    });

    assert.equal(result.ok, false, mode);
    assert.equal(result.status, 1, mode);
    assert.equal(result.reason, "windows-input", mode);
    assert.equal(renderer.calls.length, 0, `${mode}: Ink is never mounted`);
    assert.equal(stdout.output(), "", `${mode}: no clear/home before the refusal`);
    assert.equal(transport.closes, 1, mode);
    const message = stderr.output();
    assert.match(message, /cannot start the Windows console input helper/, mode);
    assert.match(message, new RegExp(`helper exited before render \\(${mode}\\)`), mode);
    assert.match(message, /fails closed/, mode);
    assert.match(message, /prism-ds --help/, mode);
    assert.deepEqual(events, ["create", "close"], mode);
  }
});

test("Windows transport startup failures fail closed before render and never fall back", async () => {
  const cases = [
    {
      name: "loader throws",
      loadWindowsInput: async () => {
        throw new Error("native module failed to load");
      },
      createWindowsInputTransport: undefined,
      pattern: /cannot start the Windows console input helper: native module failed to load/,
    },
    {
      name: "factory throws",
      loadWindowsInput: async () => ({ createWindowsInputTransport: undefined }),
      createWindowsInputTransport: async () => {
        throw new Error("helper binary is missing");
      },
      pattern: /cannot start the Windows console input helper: helper binary is missing/,
    },
    {
      name: "module has no factory",
      loadWindowsInput: async () => ({}),
      createWindowsInputTransport: undefined,
      pattern: /does not export createWindowsInputTransport/,
    },
  ];

  for (const testCase of cases) {
    const renderer = createRenderer();
    const stdout = createStream();
    const stderr = createStream();
    const result = await runTui({
      stdin: createStream(),
      stdout,
      stderr,
      env: NORMAL_ENV,
      platform: "win32",
      nodeVersion: "22.13.1",
      services: SERVICES,
      renderer,
      loadWindowsInput: testCase.loadWindowsInput,
      createWindowsInputTransport: testCase.createWindowsInputTransport,
    });

    assert.equal(result.ok, false, testCase.name);
    assert.equal(result.status, 1, testCase.name);
    assert.equal(result.reason, "windows-input", testCase.name);
    assert.equal(renderer.calls.length, 0, testCase.name);
    assert.equal(stdout.output(), "", `${testCase.name}: no render means no clear`);
    assert.match(stderr.output(), testCase.pattern);
    assert.match(stderr.output(), /fails closed/);
  }
});

test("a Windows helper failure after startup unmounts Ink, closes the transport, and fails", async () => {
  const events = [];
  const transport = createTransport({ events });
  const stderr = createStream();
  let failureFired = false;
  const factory = async (factoryOptions) => {
    transport.factoryOptions = factoryOptions;
    return transport;
  };
  const renderer = createRenderer({
    events,
    beforeReturn: () => {
      failureFired = true;
      transport.factoryOptions.onInputFailure(new Error("console input helper exited (code 3)"));
    },
  });

  const result = await runTui({
    stdin: createStream(),
    stdout: createStream(),
    stderr,
    env: NORMAL_ENV,
    platform: "win32",
    nodeVersion: "22.13.1",
    services: SERVICES,
    renderer,
    loadWindowsInput: async () => ({ createWindowsInputTransport: factory }),
  });

  assert.equal(failureFired, true);
  assert.equal(result.ok, false);
  assert.equal(result.status, 1);
  assert.equal(result.reason, "windows-input-runtime");
  assert.match(
    stderr.output(),
    /Windows console input helper stopped: console input helper exited \(code 3\)/,
  );
  assert.ok(renderer.instance.unmounts >= 1, "the helper failure unmounts Ink");
  assert.equal(transport.closes, 1);
  assert.ok(events.indexOf("close") > events.indexOf("exit"), "close follows the exit");
});

test("non-Windows platforms never load the Windows-only module", async () => {
  for (const platform of ["linux", "darwin"]) {
    let loaderCalls = 0;
    const renderer = createRenderer();
    const result = await runTui({
      stdin: createStream(),
      stdout: createStream(),
      stderr: createStream(),
      env: NORMAL_ENV,
      platform,
      nodeVersion: "22.13.1",
      services: SERVICES,
      renderer,
      loadWindowsInput: async () => {
        loaderCalls += 1;
        throw new Error("runeframe/windows-input must not load off Windows");
      },
    });

    assert.equal(result.ok, true, platform);
    assert.equal(loaderCalls, 0, platform);
    assert.equal(renderer.calls.length, 1, platform);
    assert.equal(renderer.calls[0].spec.mouseEventSource, undefined, platform);
  }
});

/* -------------------------------------------------------------------------- */
/* Render and teardown failures                                               */
/* -------------------------------------------------------------------------- */

test("a throwing render still closes the Windows transport and reports the reason", async () => {
  const events = [];
  const transport = createTransport({ events });
  const stderr = createStream();
  const stdout = createStream();
  const renderer = async () => {
    events.push("render");
    throw new Error("render exploded");
  };

  const result = await runTui({
    stdin: createStream(),
    stdout,
    stderr,
    env: NORMAL_ENV,
    platform: "win32",
    nodeVersion: "22.13.1",
    services: SERVICES,
    renderer,
    loadWindowsInput: async () => ({
      createWindowsInputTransport: async () => transport,
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 1);
  assert.equal(result.reason, "render");
  assert.match(stderr.output(), /the interactive TUI failed: render exploded/);
  assert.equal(stdout.output(), TUI_CLEAR_HOME, "the normal-mode clear still precedes the attempt");
  assert.equal(transport.closes, 1);
  assert.equal(events.at(-1), "close");
});

test("a rejecting waitUntilExit unmounts, closes, and reports a render failure", async () => {
  const transport = createTransport();
  const stderr = createStream();
  const renderer = createRenderer({ waitError: new Error("exit failed") });

  const result = await runTui({
    stdin: createStream(),
    stdout: createStream(),
    stderr,
    env: NORMAL_ENV,
    platform: "win32",
    nodeVersion: "22.13.1",
    services: SERVICES,
    renderer,
    loadWindowsInput: async () => ({
      createWindowsInputTransport: async () => transport,
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "render");
  assert.match(stderr.output(), /the interactive TUI failed: exit failed/);
  assert.equal(renderer.instance.unmounts, 1);
  assert.equal(transport.closes, 1);
});

/* -------------------------------------------------------------------------- */
/* CLI dispatch                                                               */
/* -------------------------------------------------------------------------- */

test("bare runCli([]) dynamically starts the inline TUI in-process and maps its status", async (t) => {
  const restoreStdin = forceUndefinedTty(process.stdin);
  const restoreStdout = forceUndefinedTty(process.stdout);
  try {
    if (process.stdin.isTTY === true || process.stdout.isTTY === true) {
      t.skip("process streams are TTYs; the refusal path cannot run in this process");
      return;
    }

    const captured = await captureCli([]);
    assert.equal(captured.result.ok, false);
    assert.equal(captured.result.reason, "no-tty");
    assert.equal(captured.exitCode, 1);
    assert.equal(captured.stdout, "", "no escape output on the no-TTY refusal");
    assert.match(captured.stderr, /interactive TUI needs a terminal/);
    assert.match(captured.stderr, /prism-ds --help/);
  } finally {
    restoreStdin();
    restoreStdout();
  }
});

test("argument invocations keep the existing CLI path (--help and unknown commands)", async () => {
  const help = await captureCli(["--help"]);
  assert.equal(help.result, undefined);
  assert.equal(help.exitCode, undefined);
  assert.equal(help.stdout, helpText());
  assert.equal(help.stderr, "");

  const unknown = await captureCli(["frobnicate"]);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stderr, /Unknown command: frobnicate/);
});

test("bare bin is the current process: no TTY exits 1 with a message and no escapes", async () => {
  const result = await runNode([BIN_PATH]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /interactive TUI needs a terminal/);
  assert.match(result.stderr, /prism-ds --help/);
});

test("argument commands never eagerly import Ink, React, or Runeframe", async (t) => {
  const loader = createFrameworkBlockingLoader(t);

  const help = await runNode(["--import", loader, BIN_PATH, "--help"]);
  assert.equal(help.exitCode, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);
  assert.doesNotMatch(`${help.stdout}${help.stderr}`, /framework dependency eagerly loaded/);

  const bare = await runNode(["--import", loader, BIN_PATH]);
  assert.equal(bare.exitCode, 1);
  assert.match(bare.stderr, /interactive TUI needs a terminal/);
  assert.doesNotMatch(`${bare.stdout}${bare.stderr}`, /framework dependency eagerly loaded/);
});

/* -------------------------------------------------------------------------- */
/* Source guards                                                              */
/* -------------------------------------------------------------------------- */

test("the eager CLI surface stays framework-free and cannot spawn terminals", () => {
  const cli = readFileSync(join(TOOLS_ROOT, "src", "cli.mjs"), "utf8");
  const index = readFileSync(join(TOOLS_ROOT, "src", "index.mjs"), "utf8");
  const tui = readFileSync(join(TOOLS_ROOT, "src", "tui.mjs"), "utf8");
  const bin = readFileSync(BIN_PATH, "utf8");

  for (const [name, source] of [
    ["cli.mjs", cli],
    ["index.mjs", index],
  ]) {
    assert.doesNotMatch(
      source,
      /from\s+["'](?:ink|react|runeframe)(?:\/[^"']*)?["']/u,
      `${name} must not statically import the TUI framework`,
    );
    assert.doesNotMatch(
      source,
      /^\s*import\s[^\n]*from\s+["']\.\/tui-app\.mjs["']/mu,
      `${name} must not statically import the UI module`,
    );
  }
  assert.match(cli, /await import\("\.\/tui\.mjs"\)/u, "cli.mjs loads the TUI dynamically");
  assert.doesNotMatch(bin, /child_process|spawn\s*\(/u, "the bin stays in the current process");

  assert.ok(tui.includes("\\x1b[2J\\x1b[H"), "tui.mjs owns the documented clear/home sequence");
  assert.doesNotMatch(tui, /alternateScreen\s*:/u, "no alternate-screen render option");
  assert.doesNotMatch(
    tui,
    /\.setRawMode\s*\(|["']node:child_process["']/u,
    "no raw-mode call or child-process fallback",
  );
  assert.match(
    tui,
    /import\("runeframe\/windows-input"\)/u,
    "the Windows transport is a dynamic import",
  );
  assert.doesNotMatch(
    tui,
    /^\s*import\s[^\n]*from\s+["'](?:ink|react|runeframe)(?:\/[^"']*)?["']/mu,
    "tui.mjs framework imports stay dynamic",
  );
  assert.doesNotMatch(
    tui,
    /^\s*import\s[^\n]*from\s+["']\.\/tui-app\.mjs["']/mu,
    "the UI module import stays dynamic",
  );
  assert.equal(typeof renderInkTui, "function");
});
