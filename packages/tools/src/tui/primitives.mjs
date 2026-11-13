import React from "react";
import { Text } from "ink";
import { Badge, Button, MouseLayout, TextInput as RuneframeTextInput } from "runeframe";
import { displayValue } from "./utils/format.mjs";

export const h = React.createElement;

export function statusBadge(kind, label, key) {
  const variant =
    kind === "success"
      ? "success"
      : kind === "warning"
        ? "warning"
        : kind === "error"
          ? "error"
          : kind === "info"
            ? "info"
            : "neutral";
  return h(Badge, { key, variant, compact: true }, label.toUpperCase());
}

export function line(children, props = {}) {
  return h(MouseLayout, { ...props, flexDirection: "row" }, children);
}

export function paragraph(children, props = {}) {
  return h(MouseLayout, { ...props, flexDirection: "column" }, children);
}

export function rule(label, key) {
  return h(
    MouseLayout,
    { key, marginY: 1 },
    label
      ? h(Text, { dimColor: true }, `── ${label} ──`)
      : h(Text, { dimColor: true }, "────────────────────────"),
  );
}

export function Heading({ children, compact = false }) {
  return h(Text, { bold: true, color: "cyan" }, compact ? children.toUpperCase() : children);
}

export function KeyButton({
  shortcut,
  label,
  onActivate,
  variant = "default",
  outlined = false,
  compact = false,
  active = false,
  disabled = false,
}) {
  const buttonVariant = active ? "primary" : variant;
  return h(
    MouseLayout,
    {
      marginRight: 1,
      marginBottom: outlined && !compact ? 1 : 0,
      flexShrink: 0,
      ...(outlined
        ? {
            borderStyle: "round",
            borderTop: !compact,
            borderBottom: !compact,
            borderColor: disabled ? "gray" : buttonVariant === "primary" ? "cyan" : "gray",
            backgroundColor: buttonVariant === "primary" && !disabled ? "blue" : "black",
            paddingX: compact ? 0 : 1,
          }
        : {}),
    },
    h(Button, { variant: buttonVariant, disabled, onActivate }, [
      h(Text, { key: "label", bold: true }, label),
      h(Text, { key: "shortcut", dimColor: true }, `  (${shortcut})`),
    ]),
  );
}

export function keyValue(label, value, { compact = false, key } = {}) {
  return paragraph(
    compact
      ? [
          h(Text, { key: "label", color: "cyan", bold: true }, `${label}  `),
          h(Text, { key: "value", wrap: "wrap" }, displayValue(value)),
        ]
      : [
          h(Text, { key: "label", color: "cyan", bold: true }, `${label}  `),
          h(Text, { key: "value", wrap: "wrap" }, displayValue(value)),
        ],
    { key },
  );
}

export function catalogDetail(label, value, key) {
  return line(
    [
      h(Text, { key: "label", color: "cyan", bold: true }, `${label}  `),
      h(Text, { key: "value", wrap: "wrap" }, displayValue(value)),
    ],
    { key, flexWrap: "wrap" },
  );
}

export function TextInputCompat(props) {
  return h(RuneframeTextInput, props);
}
