/**
 * Backward-compatible synchronous facade for the interactive TUI.
 *
 * The implementation lives under `./tui/`: the root component, controller,
 * navigation keys, shared primitives, the change-preview modal, and the
 * screen/shell renderers. `src/tui.mjs` keeps lazy-loading this module, so
 * argument commands never import the framework.
 */
export { default } from "./tui/TuiApp.mjs";
export { ChangePreviewModal } from "./tui/components/change-preview-modal.mjs";
