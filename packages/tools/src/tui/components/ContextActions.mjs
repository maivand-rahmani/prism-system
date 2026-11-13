import React from "react";
import { Text } from "ink";
import { Button, MouseLayout } from "runeframe";

const h = React.createElement;

function actionWidth(action, compact) {
  const label = compact && action.compactLabel ? action.compactLabel : action.label;
  const shortcut = normalizeShortcut(action.shortcut);
  return label.length + (shortcut ? shortcut.length + 3 : 0) + 4;
}

export function actionPageModel(actions, width, { compact = width < 58, focusedKey } = {}) {
  const safe = actions.filter((action) => action && typeof action.key === "string");
  const focused = safe.find((action) => action.key === focusedKey);
  const pinned = safe.filter(
    (action) => action.critical || action.variant === "primary" || action.keepVisible,
  );
  if (focused && !pinned.some((action) => action.key === focused.key)) pinned.push(focused);
  const pinnedKeys = new Set(pinned.map((action) => action.key));
  const browseable = safe.filter((action) => !pinnedKeys.has(action.key));
  const available = Math.max(
    1,
    width - 8 - pinned.reduce((sum, item) => sum + actionWidth(item, compact), 0),
  );
  const pages = [[]];
  let used = 0;
  for (const action of browseable) {
    const itemWidth = actionWidth(action, compact);
    if (used > 0 && used + itemWidth > available) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1).push(action);
    used += itemWidth;
  }
  return {
    pinned,
    browseable,
    pages: browseable.length ? pages : [],
    pageCount: Math.max(1, pages.length),
  };
}

export function actionListPageModel(actions, width, height, { maxActionRows } = {}) {
  const safe = actions.filter((action) => action && typeof action.key === "string");
  const pinned = safe.filter(
    (action) => action.critical || action.variant === "primary" || action.keepVisible,
  );
  const browseable = safe.filter((action) => !pinned.includes(action));
  const rows = Math.max(
    1,
    Math.min(
      width < 58 ? 2 : 4,
      Number.isFinite(maxActionRows) ? Math.floor(maxActionRows) : Math.max(1, height - 8),
    ),
  );
  return {
    pageCount: Math.max(1, Math.ceil(browseable.length / Math.max(1, rows - pinned.length))),
  };
}

function normalizeShortcut(shortcut) {
  if (typeof shortcut !== "string" || shortcut.trim() === "") return null;
  if (shortcut.trim() === "/") return "/";
  return shortcut
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
}

function actionText(action, { focused, compact }) {
  const prefix = focused ? "> " : "  ";
  const kind = action.variant === "danger" || action.destructive ? "! " : "";
  const primary = action.variant === "primary" ? "* " : "";
  const selected = action.active ? "✓ " : "";
  const shortcut = normalizeShortcut(action.shortcut);
  const keycap = shortcut ? ` (${shortcut})` : "";
  const disabled = action.disabled ? " (disabled)" : "";
  const label = compact && action.compactLabel ? action.compactLabel : action.label;
  return `${prefix}${kind}${primary}${selected}${label}${keycap}${disabled}`;
}

/**
 * Contextual, mouse-clickable action list for an Ink screen.
 *
 * The host owns navigation and paging: pass `focusedKey`, `page`, and
 * `onPageChange`; bind `,`/`.` in the host only while this action area is active.
 * Runeframe Button handles Enter for the focused action, so hosts must not also
 * activate that action on Enter. Clear focusedKey while a text input owns Enter.
 * This component never handles arrow keys or performs work beyond callbacks.
 * `critical` actions (typically confirm/cancel) and the primary action remain
 * visible while other actions can be browsed with the visible paging controls.
 */
export function ContextActions({
  actions = [],
  focusedKey,
  onFocusChange,
  width = 80,
  height = 24,
  maxActionRows,
  page: controlledPage,
  onPageChange,
  busy = false,
  title = "Actions",
  compact = width < 58,
  keyboardActivate = true,
  layout = "list",
}) {
  const [localPage, setLocalPage] = React.useState(0);
  const rowBudget = Math.max(
    1,
    Math.min(
      width < 58 ? 2 : 4,
      Number.isFinite(maxActionRows) ? Math.floor(maxActionRows) : Math.max(1, height - 8),
    ),
  );
  const page = Number.isInteger(controlledPage) ? controlledPage : localPage;
  const setPage = (next) => {
    if (typeof onPageChange === "function") onPageChange(next);
    else setLocalPage(next);
  };
  const safeActions = actions.filter(
    (action) => action && typeof action.key === "string" && typeof action.label === "string",
  );
  const model = actionPageModel(safeActions, width, { compact, focusedKey });
  const { pinned, pages } = model;
  const listPinned = safeActions.filter(
    (action) => action.critical || action.variant === "primary" || action.keepVisible,
  );
  const listPinnedKeys = new Set(listPinned.map((action) => action.key));
  const listBrowseable = safeActions.filter((action) => !listPinnedKeys.has(action.key));
  const listSlots = Math.max(1, rowBudget - listPinned.length);
  const listPageCount = actionListPageModel(safeActions, width, height, {
    maxActionRows,
  }).pageCount;
  const pageCount = layout === "bar" ? model.pageCount : listPageCount;
  const focusedIndex = listBrowseable.findIndex((action) => action.key === focusedKey);
  const focusPage = focusedIndex < 0 ? page : Math.floor(focusedIndex / listSlots);
  const currentPage = Math.min(Math.max(0, focusPage), pageCount - 1);
  const visible =
    layout === "bar"
      ? [...pinned, ...(pages[currentPage] ?? [])]
      : [
          ...listPinned,
          ...listBrowseable.slice(currentPage * listSlots, (currentPage + 1) * listSlots),
        ];

  const renderAction = (action) => {
    const isFocused = action.key === focusedKey;
    const disabled = busy || action.disabled === true;
    const variant = action.variant === "primary" ? "primary" : "default";
    const activate = () => {
      if (disabled) return;
      if (typeof onFocusChange === "function") onFocusChange(action.key);
      action.onActivate?.();
    };
    return h(
      MouseLayout,
      {
        key: action.key,
        flexDirection: "row",
        ...(layout === "bar" ? { marginRight: 1, flexShrink: 0 } : { width: "100%" }),
      },
      h(
        Button,
        { variant, disabled, focused: keyboardActivate && isFocused, onActivate: activate },
        h(
          Text,
          {
            bold: isFocused || action.variant === "primary",
            color: disabled
              ? "gray"
              : action.destructive || action.variant === "danger"
                ? "red"
                : undefined,
            wrap: "truncate-end",
          },
          actionText(action, { focused: isFocused, compact }),
        ),
      ),
    );
  };

  const paging =
    pageCount > 1
      ? h(MouseLayout, { key: "paging", flexDirection: "row", flexWrap: "wrap" }, [
          h(
            Button,
            {
              key: "previous",
              disabled: busy || currentPage === 0,
              onActivate: () => setPage(Math.max(0, currentPage - 1)),
            },
            h(Text, null, "  ‹ Previous actions  [,]"),
          ),
          h(Text, { key: "count", dimColor: true }, `  ${currentPage + 1}/${pageCount}  `),
          h(
            Button,
            {
              key: "next",
              disabled: busy || currentPage >= pageCount - 1,
              onActivate: () => setPage(Math.min(pageCount - 1, currentPage + 1)),
            },
            h(Text, null, "More actions  [.] ›"),
          ),
        ])
      : null;

  const actionItems = [...visible.map(renderAction)];
  if (paging) actionItems.push(paging);
  if (layout === "bar") {
    return h(MouseLayout, { flexDirection: "row", flexWrap: "wrap", width: "100%" }, [
      h(Text, { key: "heading", bold: true }, `${title}:`),
      ...actionItems,
    ]);
  }
  return h(MouseLayout, { flexDirection: "column", width }, [
    h(
      Text,
      { key: "heading", bold: true },
      busy ? `${title} · Working · actions unavailable` : title,
    ),
    ...actionItems,
  ]);
}

export default ContextActions;
