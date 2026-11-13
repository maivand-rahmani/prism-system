import { Text } from "ink";
import { useContext, useEffect, useRef } from "react";
import { Button, MouseLayout } from "runeframe";
import { h } from "../primitives.mjs";
import { InlineActionGeometryContext } from "./inline-action-geometry.mjs";

/** A small, non-paginated action group owned by one screen section. */
export function InlineTaskActions({
  actions = [],
  keys,
  focusedKey,
  onFocusChange,
  busy = false,
  title,
  clipRegion = "scroll",
}) {
  const geometry = useContext(InlineActionGeometryContext);
  const selectedKeys = keys ? new Set(keys) : null;
  const visibleActions = selectedKeys
    ? actions.filter((action) => selectedKeys.has(action.key))
    : actions;
  if (visibleActions.length === 0) return null;
  return h(MouseLayout, { flexDirection: "column", marginTop: 1 }, [
    title && h(Text, { key: "title", bold: true }, title),
    h(
      MouseLayout,
      { key: "buttons", flexDirection: "row", flexWrap: "wrap" },
      visibleActions.map((action) =>
        h(InlineTaskActionButton, {
          key: action.key,
          action,
          focusedKey,
          onFocusChange,
          busy,
          geometry,
          clipRegion,
        }),
      ),
    ),
  ]);
}

function InlineTaskActionButton({ action, focusedKey, onFocusChange, busy, geometry, clipRegion }) {
  const ref = useRef(null);
  const focused = action.key === focusedKey;
  const disabled = busy || action.disabled === true;
  useEffect(
    () => geometry?.register(action.key, ref, clipRegion),
    [action.key, clipRegion, geometry],
  );
  return h(
    MouseLayout,
    { ref, marginRight: 1, flexShrink: 0 },
    h(
      Button,
      {
        variant: action.variant === "primary" ? "primary" : "default",
        disabled,
        focused,
        onActivate: () => {
          if (disabled || (geometry && !geometry.isVisible(action.key))) return;
          onFocusChange?.(action.key);
          action.onActivate?.();
        },
      },
      h(
        Text,
        { bold: focused || action.variant === "primary", wrap: "truncate-end" },
        `${focused ? "> " : "  "}${action.label} (${action.shortcut})`,
      ),
    ),
  );
}
