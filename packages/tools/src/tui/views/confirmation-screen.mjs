import { Text } from "ink";
import { Fragment } from "react";
import { MouseLayout } from "runeframe";
import {
  commandText,
  displayValue,
  fileReviewEffectsOf,
  getUpgradeDiffLines,
  isRecord,
  plannedEffectText,
  skillCommandText,
  switchAutoSelectedEntryLine,
  switchPeerActionLine,
} from "../utils/format.mjs";
import { Heading, catalogDetail, h, keyValue, paragraph, rule } from "../primitives.mjs";
import { InlineTaskActions } from "../components/InlineTaskActions.mjs";

export function renderConfirmation(props) {
  return h(MouseLayout, { flexDirection: "column" }, [
    h(InlineTaskActions, {
      key: "confirmation-actions",
      title: "Review controls",
      actions: props.screenActions,
      keys: ["inspect-files", "manifest-diff", "confirm", "cancel"],
      focusedKey: props.focusedFooterAction,
      onFocusChange: props.setFocusedFooterAction,
      busy: props.operation?.status === "loading",
    }),
    h(Fragment, { key: "confirmation-content" }, renderConfirmationContent(props)),
  ]);
}

function renderConfirmationContent(props) {
  const { pendingConfirmation, project, services, compact, rows } = props;
  const pending = pendingConfirmation;
  if (!pending) return h(Text, { dimColor: true }, "No change is waiting for confirmation.");
  const { action, preview } = pending;
  const type = pending.type ?? "mutation";
  if (type === "skill") {
    const plan = isRecord(preview.result) ? preview.result : preview;
    const expected = isRecord(plan.expectedPlan) ? plan.expectedPlan : {};
    const targetRows =
      Array.isArray(expected.targets) && expected.targets.length > 0
        ? expected.targets
        : Array.isArray(plan.targets)
          ? plan.targets
          : [];
    const command = skillCommandText(plan.command ?? preview.command);
    const warnings = Array.isArray(plan.warnings) ? plan.warnings : [];
    return paragraph([
      h(Heading, { key: "title" }, `Confirm skill ${action.action}`),
      h(
        Text,
        { key: "warning", wrap: "wrap" },
        "This installs or removes instruction files only. It never runs a skill or installs product dependencies.",
      ),
      rule("SELECTED SKILL", "skill-target-rule"),
      keyValue("ACTION", action.action, { key: "action" }),
      keyValue("SKILL", action.skillId, { key: "skill" }),
      keyValue("SCOPE", action.scope, { key: "scope" }),
      keyValue("AGENTS", action.agents.join(", "), { key: "agents" }),
      keyValue("SOURCE REVISION", expected.revision ?? "not reported", { key: "revision" }),
      keyValue("COMMAND", command ?? "not returned", { key: "command" }),
      targetRows.length > 0 &&
        paragraph(
          [
            h(
              Text,
              { key: "targets-title", color: "cyan", bold: true },
              "Planned skill placements",
            ),
            ...targetRows.map((target, index) =>
              h(
                Text,
                { key: `target-${index}`, wrap: "wrap" },
                `• ${target.path ?? target.relativePath ?? "path not returned"} · ${target.selected ? "selected" : "observed"} · ${target.exists ? "present" : "missing"}`,
              ),
            ),
          ],
          { key: "skill-targets" },
        ),
      warnings.length > 0 &&
        paragraph(
          [
            h(Text, { key: "warnings-title", color: "yellow", bold: true }, "Review notes"),
            ...warnings.map((warning, index) =>
              h(
                Text,
                { key: `warning-${index}`, wrap: "wrap" },
                `• ${typeof warning === "string" ? warning : (warning.message ?? JSON.stringify(warning))}`,
              ),
            ),
          ],
          { key: "skill-warnings" },
        ),
      h(
        Text,
        { key: "shared", dimColor: true, wrap: "wrap" },
        "Universal agents may share the canonical placement. Modified or unverifiable existing skills are never silently replaced.",
      ),
    ]);
  }
  if (type === "self-update") {
    const plan = isRecord(preview.plan) ? preview.plan : {};
    const command = commandText(plan.command);
    return paragraph([
      h(Heading, { key: "title" }, "Confirm prism-ds CLI update"),
      h(
        Text,
        { key: "warning", wrap: "wrap" },
        "This changes @prism-system/tools only. The update is not part of a design-system upgrade, and no rollback is promised if the package manager partially changes the installation.",
      ),
      rule("EXACT TARGET", "cli-target-rule"),
      keyValue("PACKAGE", plan.packageName ?? "@prism-system/tools", { key: "package" }),
      keyValue(
        "INSTALLATION",
        `${plan.scope ?? "unknown"} · ${plan.installation?.kind ?? "unknown context"}`,
        { key: "scope" },
      ),
      keyValue("CURRENT VERSION", plan.currentVersion, { key: "current" }),
      keyValue("TARGET VERSION", plan.targetVersion, { key: "target" }),
      keyValue("MANAGER", plan.command?.manager ?? "not reported", { key: "manager" }),
      keyValue("COMMAND", command ?? "not available", { key: "command" }),
      keyValue("POST-CHECK", plan.postVerifySupported ? "supported" : "may be unverifiable", {
        key: "verify",
      }),
      h(
        Text,
        { key: "advice", dimColor: true, wrap: "wrap" },
        plan.advice ?? "Review the exact package manager command before applying.",
      ),
    ]);
  }
  if (type === "recovery") {
    const suggestion = isRecord(preview.suggestion) ? preview.suggestion : {};
    const plan = isRecord(preview.plan) ? preview.plan : {};
    const command = isRecord(suggestion.command)
      ? [
          suggestion.command.bin,
          ...(Array.isArray(suggestion.command.args) ? suggestion.command.args : []),
        ]
          .filter((part) => typeof part === "string" && part !== "")
          .join(" ")
      : null;
    const planFiles = Array.isArray(plan.files) ? plan.files : [];
    return paragraph([
      h(Heading, { key: "title" }, "Confirm targeted recovery action"),
      h(
        Text,
        { key: "warning", wrap: "wrap" },
        "Only this selected repair will run. The project is diagnosed again afterward; action completion and overall project health are reported separately.",
      ),
      rule("TARGETED ISSUE", "recovery-target-rule"),
      keyValue("ACTION", suggestion.label ?? preview.actionId, { key: "action" }),
      keyValue("REASON", suggestion.reason ?? "not returned", { key: "reason" }),
      keyValue("REPAIR TYPE", preview.kind ?? suggestion.kind ?? "not returned", { key: "kind" }),
      keyValue("COMMAND", command ?? "not returned", { key: "command" }),
      plan.cssPath && keyValue("EXPLICIT CSS", plan.cssPath, { key: "css" }),
      plan.packageName &&
        keyValue("SYSTEM", `${plan.packageName}@${displayValue(plan.version)}`, {
          key: "system",
        }),
      planFiles.length > 0 &&
        paragraph(
          [
            h(Text, { key: "files-title", color: "cyan", bold: true }, "Planned file effects"),
            ...planFiles.map((file, index) =>
              h(
                Text,
                { key: `file-${index}`, wrap: "wrap" },
                `• ${file.path ?? "path not returned"} · ${file.before === file.after ? "unchanged" : "update"}`,
              ),
            ),
          ],
          { key: "recovery-files" },
        ),
      h(
        Text,
        { key: "note", dimColor: true, wrap: "wrap" },
        "If the state changes after review, the backend refuses stale writes and reports remaining issues.",
      ),
    ]);
  }
  const targetVersion = preview.version ?? action.version ?? project?.version;
  const effectRows = Array.isArray(preview.plannedChanges) ? preview.plannedChanges : [];
  const managedFiles = fileReviewEffectsOf(pending);
  const upgradeLines = action.kind === "upgrade" ? getUpgradeDiffLines(preview.diff) : [];
  const command = commandText(preview.command);
  const compatibility = isRecord(preview.compatibility) ? preview.compatibility : {};
  const compatibilityWarnings = Array.isArray(compatibility.warnings)
    ? compatibility.warnings
    : Array.isArray(preview.warnings)
      ? preview.warnings
      : [];
  const coverage = isRecord(compatibility.coverage) ? compatibility.coverage : null;
  const preserved = Array.isArray(preview.preserved) ? preview.preserved : [];
  const previewResult = isRecord(preview.result) ? preview.result : {};
  const previewMaterial = isRecord(preview.material) ? preview.material : {};
  const autoSelectedEntryLines = Array.isArray(previewResult.autoSelectedEntries)
    ? previewResult.autoSelectedEntries.map(switchAutoSelectedEntryLine).filter(Boolean)
    : [];
  const selectedPeerActionLines = Array.isArray(previewMaterial.peers)
    ? previewMaterial.peers.map(switchPeerActionLine).filter(Boolean)
    : [];
  const switchReviewLimit = compact ? 1 : Math.max(2, Math.min(5, Math.floor((rows - 12) / 4)));
  const isDependencyChange = ["install", "use", "upgrade", "switch", "remove"].includes(
    action.kind,
  );

  return paragraph([
    h(Heading, { key: "title" }, "Confirm planned change"),
    h(
      Text,
      { key: "warning", wrap: "wrap" },
      "Review the exact target and planned file effects before approval. Canceling leaves the project unchanged.",
    ),
    rule("TARGET", "target-rule"),
    catalogDetail(
      "ACTION",
      action.kind === "use" ? "Use · installs and connects" : action.kind,
      "action",
    ),
    catalogDetail(
      "PACKAGE",
      preview.packageName ?? action.packageName ?? project?.packageName,
      "package",
    ),
    catalogDetail("EXACT VERSION", targetVersion ?? "Not reported by the preview", "version"),
    catalogDetail("PROJECT", services.cwd, "project"),
    isDependencyChange &&
      paragraph(
        [
          catalogDetail(
            "PACKAGE MANAGER",
            preview.manager ?? preview.command?.manager ?? "not reported",
            "manager",
          ),
          catalogDetail("COMMAND", command ?? "not reported", "command"),
        ],
        { key: "dependency" },
      ),
    action.kind === "use" &&
      h(
        Text,
        { key: "use-scope", wrap: "wrap" },
        `Use installs and connects. Strict usage check: ${action.checkUsage ? "included" : "not included"}. CSS changes: ${action.tailwind ? `included for ${action.cssPath}` : "not included"}.`,
      ),
    action.kind === "use" &&
      action.skills === true &&
      h(
        Text,
        { key: "use-skill-scope", wrap: "wrap" },
        `Consumer skill setup: ${preview.skillSetup?.status ?? "pending agent selection"}. Agents: ${Array.isArray(preview.skillSetup?.agents) && preview.skillSetup.agents.length > 0 ? preview.skillSetup.agents.join(", ") : "not selected"}. ${preview.skillSetup?.guidance ?? "A reliably detected agent may be used; unresolved selection remains pending and does not block system setup."}`,
      ),
    effectRows.length > 0 &&
      paragraph(
        [
          h(Text, { key: "effects-title", color: "cyan", bold: true }, "Planned file effects"),
          h(
            MouseLayout,
            { key: "effect-lines", flexDirection: "column" },
            effectRows.map((effect, index) =>
              h(Text, { key: `effect-${index}`, wrap: "wrap" }, `• ${plannedEffectText(effect)}`),
            ),
          ),
        ],
        { key: "planned-effects" },
      ),
    managedFiles.length > 0 &&
      paragraph(
        [
          h(
            Text,
            { key: "managed-title", color: "cyan", bold: true },
            `Exact managed file content · ${managedFiles.length} file${managedFiles.length === 1 ? "" : "s"}`,
          ),
          h(
            Text,
            { key: "managed-copy", wrap: "wrap" },
            "Open the managed-file diff to review exact before/after content. Missing files are labeled explicitly.",
          ),
        ],
        { key: "managed-file-entry" },
      ),
    action.kind === "upgrade" &&
      paragraph(
        [
          h(
            Text,
            { key: "diff-title", color: "cyan", bold: true },
            `Existing manifest diff · ${upgradeLines.length} change line${upgradeLines.length === 1 ? "" : "s"}`,
          ),
          h(
            Text,
            { key: "diff-copy", dimColor: true, wrap: "wrap" },
            "Open the manifest diff for the complete change list.",
          ),
        ],
        { key: "manifest-diff" },
      ),
    action.kind === "switch" &&
      paragraph(
        [
          h(Text, { key: "review-title", color: "cyan", bold: true }, "Compatibility review"),
          h(
            Text,
            { key: "from-to", wrap: "wrap" },
            `From ${displayValue(preview.from?.package)}@${displayValue(preview.from?.version)} → ${displayValue(preview.to?.package)}@${displayValue(preview.to?.version)}`,
          ),
          h(
            Text,
            { key: "blockers", wrap: "wrap" },
            `Blockers: ${Array.isArray(compatibility.blockers) && compatibility.blockers.length > 0 ? compatibility.blockers.map((item) => item.message ?? item).join(" · ") : "none reported; an incompatible plan is refused before confirmation."}`,
          ),
          action.kind === "switch" &&
            autoSelectedEntryLines.length > 0 &&
            paragraph(
              [
                h(
                  Text,
                  { key: "auto-entries-title", color: "cyan", bold: true },
                  "Automatically selected from usage",
                ),
                ...autoSelectedEntryLines
                  .slice(0, switchReviewLimit)
                  .map((entry, index) =>
                    h(Text, { key: `auto-entry-${index}`, wrap: "wrap" }, entry),
                  ),
                autoSelectedEntryLines.length > switchReviewLimit &&
                  h(
                    Text,
                    { key: "auto-entries-more", dimColor: true, wrap: "wrap" },
                    `• +${autoSelectedEntryLines.length - switchReviewLimit} more auto-selected entries not shown`,
                  ),
              ],
              { key: "switch-auto-selected-entries" },
            ),
          action.kind === "switch" &&
            selectedPeerActionLines.length > 0 &&
            paragraph(
              [
                h(
                  Text,
                  { key: "peer-actions-title", color: "cyan", bold: true },
                  "Selected peer actions",
                ),
                ...selectedPeerActionLines
                  .slice(0, switchReviewLimit)
                  .map((peer, index) =>
                    h(Text, { key: `peer-action-${index}`, wrap: "wrap" }, peer),
                  ),
                selectedPeerActionLines.length > switchReviewLimit &&
                  h(
                    Text,
                    { key: "peer-actions-more", dimColor: true, wrap: "wrap" },
                    `• +${selectedPeerActionLines.length - switchReviewLimit} more peer actions not shown`,
                  ),
              ],
              { key: "switch-peer-actions" },
            ),
          coverage &&
            h(
              Text,
              { key: "coverage", wrap: "wrap" },
              `Coverage: ${displayValue(coverage.filesScanned)} files · ${displayValue(coverage.components)} components · ${displayValue(coverage.extensions)} extensions · ${displayValue(coverage.tokenReferences)} token references · ${displayValue(coverage.unverified)} unverified · ${displayValue(coverage.skippedFiles)} skipped.`,
            ),
          ...compatibilityWarnings.map((warning, index) =>
            h(
              Text,
              { key: `compat-warning-${index}`, wrap: "wrap" },
              `Warning: ${typeof warning === "string" ? warning : (warning.message ?? JSON.stringify(warning))}`,
            ),
          ),
          coverage &&
            Array.isArray(coverage.limitations) &&
            coverage.limitations.length > 0 &&
            h(
              Text,
              { key: "coverage-limitations", dimColor: true, wrap: "wrap" },
              `Coverage limits: ${coverage.limitations.join(" · ")}`,
            ),
        ],
        { key: "switch-compatibility" },
      ),
    action.kind === "remove" &&
      paragraph(
        [
          h(Text, { key: "remove-review-title", color: "cyan", bold: true }, "Removal review"),
          h(
            Text,
            { key: "remove-coverage", wrap: "wrap" },
            coverage
              ? `Usage scan: ${displayValue(coverage.filesScanned)} files · ${displayValue(coverage.components)} components · ${displayValue(coverage.extensions)} extensions · ${displayValue(coverage.tokenReferences)} token references · ${displayValue(coverage.unverified)} unverified · ${displayValue(coverage.skippedFiles)} skipped.`
              : "Removal proceeds only after the active-usage scan reports no blocking references.",
          ),
          ...compatibilityWarnings.map((warning, index) =>
            h(
              Text,
              { key: `remove-warning-${index}`, wrap: "wrap" },
              `Preservation note: ${typeof warning === "string" ? warning : (warning.message ?? JSON.stringify(warning))}`,
            ),
          ),
          ...preserved.map((item, index) =>
            h(
              Text,
              { key: `preserved-${index}`, wrap: "wrap" },
              `Preserved: ${item.path ?? "path not returned"} · ${item.reason ?? "manual cleanup may be needed"}`,
            ),
          ),
        ],
        { key: "remove-review" },
      ),
  ]);
}
