import { Text } from "ink";
import { MouseLayout } from "runeframe";
import { displayValue } from "../utils/format.mjs";
import { h, line, statusBadge } from "../primitives.mjs";

export function projectBanner(state, cwd, compact) {
  if (state?.status === "connected") {
    return line(
      [
        statusBadge("success", "Connected", "status"),
        h(MouseLayout, { key: "gap", width: 1 }),
        h(
          Text,
          { key: "package", bold: true, wrap: "wrap" },
          `${displayValue(state.packageName)}@${displayValue(state.version)}`,
        ),
        !compact &&
          h(
            Text,
            { key: "contract", dimColor: true },
            `  ·  contract ${displayValue(state.contractVersion)}`,
          ),
      ],
      { flexWrap: "wrap" },
    );
  }
  if (state?.status === "installed") {
    return line(
      [
        statusBadge("warning", "Installed · not connected", "status"),
        h(MouseLayout, { key: "gap", width: 1 }),
        h(
          Text,
          { key: "package", bold: true, wrap: "wrap" },
          `${displayValue(state.packageName)}@${displayValue(state.version)}`,
        ),
      ],
      { flexWrap: "wrap" },
    );
  }
  if (state?.status === "error") return statusBadge("error", "Project state error");
  if (state?.status === "empty") return statusBadge("neutral", "No system connected");
  return statusBadge("info", "Reading project state");
}
