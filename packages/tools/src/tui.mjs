/**
 * Inline interactive `prism-ds` TUI entry point.
 *
 * Bare `prism-ds` (no arguments) routes here from `cli.mjs`. Ink, React,
 * Runeframe, and the UI component module are all loaded dynamically and only
 * after the interactive preconditions pass, so ordinary argument commands never
 * pay for the framework. This module owns the only terminal-visible write made
 * before Ink's first frame: on a normal TTY it clears the visible display and
 * homes the cursor, so the root `MouseLayout` origin `{ x: 0, y: 0 }` is a
 * truthful absolute origin for the first render. The alternate screen buffer is
 * never used. `TERM=dumb` is refused before services, transport, clear, or
 * renderer work: Runeframe's provider always mounts its mouse reporting on a
 * TTY, so the inline TUI cannot be made escape-free there.
 *
 * Windows uses the Runeframe native transport exactly as documented: it is
 * created before Ink's `render`, `input.stdin` becomes Ink's stdin, and
 * `input.mouseEvents` becomes the Runeframe `mouseEventSource`. That module is
 * imported only when `platform === "win32"`, and no JavaScript mouse parser or
 * `setRawMode` fallback exists here. The transport is always created before the
 * renderer runs and always closed after Ink unmounts in a `finally` block,
 * including when `render` throws or the helper fails after startup. A helper
 * failure reported before the first render closes the transport and fails
 * closed without clearing the display or mounting Ink.
 *
 * `runTui` is injectable end to end for tests: streams, TTY flags, environment,
 * platform, Node version, the operation facade (or its operation overrides),
 * the renderer, and the Windows loader/factory can all be replaced. None of
 * those seams perform work in production.
 */

const CLI_NAME = "prism-ds";

/**
 * Clear-visible-display + cursor-home, written to a normal TTY before Ink's
 * first frame so cell (0, 0) is the truthful top-left origin of the root
 * `MouseLayout`. The terminal's own scrollback remains in use; custom scroll
 * regions and origins remain a terminal caveat.
 */
export const TUI_CLEAR_HOME = "\x1b[2J\x1b[H";

/** Runeframe 0.5 requires Node >= 22; interactive mode refuses older runtimes. */
export const TUI_MINIMUM_NODE_MAJOR = 22;

const ARGUMENT_EXAMPLES = Object.freeze([
  `  ${CLI_NAME} --help`,
  `  ${CLI_NAME} components --cwd <consumer-root>`,
  `  ${CLI_NAME} check --cwd <consumer-root> --css <file>`,
]);

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function failure(reason, error = null) {
  return { ok: false, status: 1, reason, error };
}

/** Report a Windows console input helper failure and return the failure result. */
function reportWindowsInputFailure(stderr, error) {
  writeLines(stderr, [
    `${CLI_NAME}: cannot start the Windows console input helper: ${errorMessage(error)}`,
    "The interactive TUI fails closed without it; JavaScript never reads the console instead.",
    "Run an argument command instead, for example:",
    ...ARGUMENT_EXAMPLES,
  ]);
  return failure("windows-input", error);
}

function isTty(stream) {
  return Boolean(stream && stream.isTTY === true);
}

function isDumbTerminal(env) {
  return typeof env?.TERM === "string" && env.TERM.trim().toLowerCase() === "dumb";
}

function parseNodeMajor(version) {
  const match = /^v?(\d+)(?:\.|$)/.exec(String(version ?? "").trim());
  return match === null ? null : Number.parseInt(match[1], 10);
}

function describeNode(version) {
  return `v${String(version ?? "")
    .trim()
    .replace(/^v/, "")}`;
}

function assertOptionalFunction(value, label) {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${label} must be a function when provided.`);
  }
}

function writeLines(stream, lines) {
  stream.write(`${lines.join("\n")}\n`);
}

/**
 * Default renderer: load the stable Runeframe root exports (and Ink/React/the
 * UI module) lazily, register the default screen exactly as the Runeframe
 * documentation shows, and render it under the documented providers.
 *
 * The root layout is a `MouseLayout`. It receives the asserted origin only when
 * mouse input is enabled; otherwise it stays a nested adapter with no measured
 * parent, so automatic mouse targets remain inactive. `mouseEventSource` is
 * forwarded only when a native source exists (Windows), which keeps the
 * post-Ink SGR interceptor active on other platforms.
 *
 * @param {{
 *   services: object,
 *   stdin: NodeJS.ReadStream,
 *   stdout: NodeJS.WriteStream,
 *   stderr: NodeJS.WriteStream,
 *   mouseEnabled: boolean,
 *   mouseEventSource?: object,
 * }} spec
 * @returns {Promise<object>} The Ink instance.
 */
export async function renderInkTui({
  services,
  stdin,
  stdout,
  stderr,
  mouseEnabled,
  mouseEventSource,
}) {
  const [{ default: React }, { render }, runeframe, { default: TuiApp }] = await Promise.all([
    import("react"),
    import("ink"),
    import("runeframe"),
    import("./tui-app.mjs"),
  ]);
  const { FrameworkProvider, MouseLayout, ScreenOutlet, ScreenRegistry } = runeframe;

  const registry = new ScreenRegistry();
  registry.register({
    id: "app",
    title: CLI_NAME,
    component: () => React.createElement(TuiApp, { services }),
  });

  const layoutProps = { flexDirection: "column" };
  if (mouseEnabled) {
    layoutProps.origin = { x: 0, y: 0 };
  }
  const providerProps = { registry, defaultScreen: "app" };
  if (mouseEventSource !== undefined) {
    providerProps.mouseEventSource = mouseEventSource;
  }

  const element = React.createElement(
    FrameworkProvider,
    providerProps,
    React.createElement(MouseLayout, layoutProps, React.createElement(ScreenOutlet)),
  );
  return render(element, { stdin, stdout, stderr });
}

/**
 * Run the inline interactive TUI in the current process.
 *
 * Production defaults are `process.stdin`/`process.stdout`/`process.stderr`,
 * `process.cwd()`, `process.env`, `process.platform`, and `process.versions.node`.
 * Every one of them, the renderer, and the Windows transport loader/factory are
 * injectable for tests.
 *
 * Refusals (no TTY on both streams, Node < 22, `TERM=dumb`, an
 * unavailable/failed Windows transport, or a helper failure reported before the
 * first render) print a concise reason and example argument commands and return
 * `{ ok: false, status: 1, reason, error }` before any framework import, clear
 * sequence, or render. A successful interactive exit returns
 * `{ ok: true, status: 0, reason: null, error: null }`.
 *
 * @param {{
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 *   stderr?: NodeJS.WriteStream,
 *   env?: Record<string, string | undefined>,
 *   platform?: string,
 *   nodeVersion?: string,
 *   cwd?: string,
 *   services?: object,
 *   operations?: Record<string, Function>,
 *   fetchImpl?: Function,
 *   spawnImpl?: Function,
 *   renderer?: Function,
 *   loadWindowsInput?: Function,
 *   createWindowsInputTransport?: Function,
 * }} [options]
 * @returns {Promise<{ ok: boolean, status: number, reason: string | null, error: Error | null }>}
 */
export async function runTui(options = {}) {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const cwd = options.cwd ?? process.cwd();

  const renderer = options.renderer;
  assertOptionalFunction(renderer, "renderer");
  assertOptionalFunction(options.loadWindowsInput, "loadWindowsInput");
  assertOptionalFunction(options.createWindowsInputTransport, "createWindowsInputTransport");
  if (
    options.services !== undefined &&
    (options.services === null || typeof options.services !== "object")
  ) {
    throw new TypeError('"services" must be the TUI operations facade when provided.');
  }

  // The interactive TUI is only truthful on a real terminal: both the input and
  // the output stream must be TTYs. Refuse before any framework, clear, or
  // Windows-adapter work.
  if (!isTty(stdin) || !isTty(stdout)) {
    writeLines(stderr, [
      `${CLI_NAME}: the interactive TUI needs a terminal on both stdin and stdout.`,
      "Run an argument command instead, for example:",
      ...ARGUMENT_EXAMPLES,
    ]);
    return failure("no-tty");
  }

  // Runeframe 0.5 requires Node >= 22. Refuse without importing the framework.
  const nodeMajor = parseNodeMajor(nodeVersion);
  if (nodeMajor === null || nodeMajor < TUI_MINIMUM_NODE_MAJOR) {
    writeLines(stderr, [
      `${CLI_NAME}: the interactive TUI requires Node.js >= ${TUI_MINIMUM_NODE_MAJOR}; ` +
        `Runeframe 0.5 requires Node >= ${TUI_MINIMUM_NODE_MAJOR} ` +
        `(current Node is ${describeNode(nodeVersion)}).`,
      "Run an argument command instead, for example:",
      ...ARGUMENT_EXAMPLES,
    ]);
    return failure("node-version");
  }

  // Runeframe's provider mounts its mouse reporting on every real TTY and emits
  // terminal sequences even without a `mouseEventSource`. A dumb terminal is not
  // cursor-addressable, so refuse before services, Windows transport, clear/home,
  // or framework work rather than rendering with hidden escape output.
  if (isDumbTerminal(env)) {
    writeLines(stderr, [
      `${CLI_NAME}: the interactive TUI needs a cursor-addressable terminal, ` +
        `but TERM is "${String(env.TERM).trim()}".`,
      "Run an argument command instead, for example:",
      ...ARGUMENT_EXAMPLES,
    ]);
    return failure("dumb-terminal");
  }

  let services = options.services;
  if (services === undefined) {
    try {
      const { createTuiOperations } = await import("./tui-operations.mjs");
      services = createTuiOperations({
        cwd,
        operations: options.operations,
        fetchImpl: options.fetchImpl,
        spawnImpl: options.spawnImpl,
      });
    } catch (error) {
      writeLines(stderr, [
        `${CLI_NAME}: cannot initialize the interactive TUI: ${errorMessage(error)}`,
      ]);
      return failure("services", error);
    }
  }

  let windowsInput = null;
  let pendingInputFailure = null;
  let instance = null;
  const handleInputFailure = (error) => {
    pendingInputFailure = error instanceof Error ? error : new Error(String(error));
    if (instance !== null && typeof instance.unmount === "function") instance.unmount();
  };

  if (platform === "win32") {
    try {
      const loadWindowsInput =
        options.loadWindowsInput ?? (() => import("runeframe/windows-input"));
      const moduleNamespace = await loadWindowsInput();
      const createWindowsInputTransport =
        options.createWindowsInputTransport ?? moduleNamespace?.createWindowsInputTransport;
      if (typeof createWindowsInputTransport !== "function") {
        throw new Error('"runeframe/windows-input" does not export createWindowsInputTransport.');
      }
      windowsInput = await createWindowsInputTransport({
        stderr,
        onInputFailure: handleInputFailure,
      });
    } catch (error) {
      return reportWindowsInputFailure(stderr, error);
    }
  }

  // A helper failure can be reported while the transport is still being created
  // or in a microtask right after it resolves, before `render` begins. No Ink
  // instance exists yet, so close the transport and fail closed without the
  // clear/home write or any framework import.
  if (pendingInputFailure !== null) {
    if (windowsInput !== null) {
      try {
        await windowsInput.close();
      } catch {
        // `close()` is idempotent and bounded; never mask the helper failure.
      }
    }
    return reportWindowsInputFailure(stderr, pendingInputFailure);
  }

  // Clear the visible display and home the cursor before Ink's first render so
  // the asserted (0, 0) root origin is truthful.
  stdout.write(TUI_CLEAR_HOME);

  let renderFailure = null;
  try {
    const render = renderer ?? renderInkTui;
    instance = await render({
      services,
      stdin: windowsInput === null ? stdin : windowsInput.stdin,
      stdout,
      stderr,
      mouseEnabled: true,
      mouseEventSource: windowsInput === null ? undefined : windowsInput.mouseEvents,
    });
    // A helper failure may land before `render` returns; honor the latch.
    if (pendingInputFailure !== null && typeof instance?.unmount === "function") {
      instance.unmount();
    }
    if (typeof instance?.waitUntilExit === "function") {
      await instance.waitUntilExit();
    }
  } catch (error) {
    renderFailure = error;
  } finally {
    // Ink must be unmounted before the native transport releases the console.
    try {
      if (instance !== null && typeof instance.unmount === "function") instance.unmount();
    } catch {
      // Teardown must not mask the original failure.
    }
    if (windowsInput !== null) {
      try {
        await windowsInput.close();
      } catch {
        // `close()` is idempotent and bounded; never mask the render outcome.
      }
    }
  }

  if (renderFailure !== null) {
    writeLines(stderr, [`${CLI_NAME}: the interactive TUI failed: ${errorMessage(renderFailure)}`]);
    return failure("render", renderFailure);
  }
  if (pendingInputFailure !== null) {
    writeLines(stderr, [
      `${CLI_NAME}: the Windows console input helper stopped: ` +
        `${errorMessage(pendingInputFailure)}`,
    ]);
    return failure("windows-input-runtime", pendingInputFailure);
  }
  return { ok: true, status: 0, reason: null, error: null };
}
