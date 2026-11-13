import { MANAGED_FILE_KINDS } from "./constants.mjs";

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

export function failuresOf(result) {
  if (Array.isArray(result?.failures)) return result.failures.map(String);
  if (typeof result?.reason === "string" && result.reason !== "") return [result.reason];
  return [];
}

export function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function switchAutoSelectedEntryLine(entry) {
  if (!isRecord(entry)) return null;
  const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : null;
  const entrypoint =
    typeof entry.entrypoint === "string" && entry.entrypoint.trim() ? entry.entrypoint : null;
  const file = typeof entry.file === "string" && entry.file.trim() ? entry.file : null;
  const label = name && entrypoint ? `${name} (${entrypoint})` : (name ?? entrypoint);
  if (!label && !file) return null;
  return `• ${label ?? file}${label && file ? ` · ${file}` : ""}`;
}

export function switchPeerActionLine(peer) {
  if (!isRecord(peer) || typeof peer.name !== "string" || !peer.name.trim()) return null;
  const details = [];
  if (typeof peer.range === "string" && peer.range.trim()) details.push(peer.range);
  if (typeof peer.optional === "boolean") details.push(peer.optional ? "optional" : "required");
  if (peer.action === "install") {
    details.push(
      typeof peer.version === "string" && peer.version.trim()
        ? `install ${peer.version}`
        : "install",
    );
  } else if (peer.action === "retain") {
    details.push(
      typeof peer.installed === "string" && peer.installed.trim()
        ? `retain installed ${peer.installed}`
        : "retain",
    );
  } else if (typeof peer.action === "string" && peer.action.trim()) {
    details.push(peer.action);
  }
  const kind = typeof peer.kind === "string" && peer.kind.trim() ? ` [${peer.kind}]` : "";
  return `• ${peer.name}${kind}${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

export function effectMetadataText(effects) {
  if (!isRecord(effects)) return "Not declared";
  const features = Array.isArray(effects.features) ? effects.features.join(", ") : "not declared";
  const parts = [
    `features: ${features}`,
    `rendering: ${displayValue(effects.rendering)}`,
    `reduced motion: ${effects.reducedMotion === true ? "yes" : "no"}`,
  ];
  if (typeof effects.fallback === "string") parts.push(`fallback: ${effects.fallback}`);
  return parts.join(" · ");
}

export function componentMetadata(component) {
  const details = [];
  if (Array.isArray(component.variants) && component.variants.length) {
    details.push(`variants: ${component.variants.join(", ")}`);
  }
  if (Array.isArray(component.sizes) && component.sizes.length) {
    details.push(`sizes: ${component.sizes.join(", ")}`);
  }
  if (Array.isArray(component.members) && component.members.length) {
    details.push(`members: ${component.members.join(", ")}`);
  }
  if (typeof component.description === "string" && component.description !== "") {
    details.push(component.description);
  }
  details.push(
    component.effects === null || component.effects === undefined
      ? "effects not declared"
      : `effects: ${effectMetadataText(component.effects)}`,
  );
  if (typeof component.importPath === "string") details.push(`import: ${component.importPath}`);
  if (typeof component.apiVersion === "number") details.push(`API v${component.apiVersion}`);
  if (typeof component.docs === "string" && component.docs !== "")
    details.push(`docs: ${component.docs}`);
  if (typeof component.example === "string" && component.example !== "") {
    details.push(`example: ${component.example}`);
  }
  return details.join(" · ");
}

export function extensionRequirementsText(extension) {
  if (!Array.isArray(extension?.requirements))
    return "Requirements are not included in this catalog response.";
  if (extension.requirements.length === 0)
    return "No additional requirements declared for this entrypoint.";
  return extension.requirements
    .map((requirement) => {
      if (!isRecord(requirement)) return String(requirement);
      const qualifier = [requirement.kind, requirement.optional === true ? "optional" : null]
        .filter(Boolean)
        .join(" · ");
      return `${displayValue(requirement.name)}@${displayValue(requirement.range)}${qualifier ? ` (${qualifier})` : ""}`;
    })
    .join(", ");
}

export function getUpgradeDiffLines(diff) {
  if (!isRecord(diff)) return ["No manifest diff was returned."];
  const output = [];
  const components = isRecord(diff.components) ? diff.components : {};
  for (const name of Array.isArray(components.added) ? components.added : []) {
    output.push(`Component added: ${name}`);
  }
  for (const name of Array.isArray(components.removed) ? components.removed : []) {
    output.push(`Component removed: ${name}`);
  }
  for (const change of Array.isArray(components.changed) ? components.changed : []) {
    for (const [field, values] of Object.entries(isRecord(change?.fields) ? change.fields : {})) {
      for (const name of Array.isArray(values?.added) ? values.added : []) {
        output.push(`${change.name} ${field} added: ${name}`);
      }
      for (const name of Array.isArray(values?.removed) ? values.removed : []) {
        output.push(`${change.name} ${field} removed: ${name}`);
      }
    }
  }
  const tokens = isRecord(diff.tokens) ? diff.tokens : {};
  for (const [group, names] of Object.entries(isRecord(tokens.added) ? tokens.added : {})) {
    for (const name of Array.isArray(names) ? names : [])
      output.push(`Token added (${group}): ${name}`);
  }
  for (const [group, names] of Object.entries(isRecord(tokens.removed) ? tokens.removed : {})) {
    for (const name of Array.isArray(names) ? names : []) {
      output.push(`Token removed (${group}): ${name}`);
    }
  }
  for (const [field, values] of Object.entries(isRecord(diff.metadata) ? diff.metadata : {})) {
    output.push(`Manifest ${field}: ${displayValue(values?.from)} → ${displayValue(values?.to)}`);
  }
  const exports = isRecord(diff.exports) ? diff.exports : {};
  for (const entry of Array.isArray(exports.added) ? exports.added : []) {
    output.push(`Public export added (${entry.target}): ${entry.value}`);
  }
  for (const entry of Array.isArray(exports.removed) ? exports.removed : []) {
    output.push(`Public export removed (${entry.target}): ${entry.value}`);
  }
  for (const entry of Array.isArray(exports.changed) ? exports.changed : []) {
    output.push(`Public export changed (${entry.target}): ${entry.from} → ${entry.to}`);
  }
  return output.length ? output : ["No component, token, or public export changes."];
}

export function commandText(command) {
  if (!isRecord(command)) return null;
  const parts = [command.manager, ...(Array.isArray(command.args) ? command.args : [])].filter(
    (part) => typeof part === "string" && part !== "",
  );
  return parts.join(" ") || null;
}

export function skillCommandText(command) {
  if (!isRecord(command)) return null;
  return [command.executable, command.package, ...(Array.isArray(command.args) ? command.args : [])]
    .filter((part) => typeof part === "string" && part !== "")
    .join(" ");
}

export const MANAGED_FILE_LABELS = new Map([
  ["package-json", "package.json (designSystem)"],
  ["root-agents", "AGENTS.md (managed section)"],
  ["design-system-config", ".design-system/config.json"],
  ["legacy-agents", "legacy AGENTS.md"],
]);

export function managedFileEffectText(kind, changed, path, retired = kind === "legacy-agents") {
  const label = MANAGED_FILE_LABELS.get(kind) ?? "Managed file";
  const action = retired ? " removed" : changed ? " update" : " check";
  return `${label}${action} · ${displayValue(path)}`;
}

export function plannedEffectText(effect) {
  if (!isRecord(effect)) return String(effect);
  if (effect.kind === "dependency") {
    return `Dependency change · ${commandText(effect.command) ?? effect.manager ?? "package manager"}`;
  }
  if (effect.kind === "css") {
    return `CSS ${effect.changed ? "update" : "check"} · ${displayValue(effect.path)}`;
  }
  if (effect.kind === "connect") {
    const fileKind = typeof effect.fileKind === "string" ? effect.fileKind : null;
    if (fileKind !== null && MANAGED_FILE_LABELS.has(fileKind)) {
      return managedFileEffectText(
        fileKind,
        effect.changed === true,
        effect.path,
        effect.after === null,
      );
    }
    return `Configuration file · ${displayValue(effect.path)}`;
  }
  if (MANAGED_FILE_KINDS.has(effect.kind)) {
    return managedFileEffectText(
      effect.kind,
      effect.changed === true,
      effect.path,
      effect.after === null,
    );
  }
  return `${displayValue(effect.kind)} · ${displayValue(effect.path)}`;
}

export function fileReviewEffectsOf(pending) {
  const preview = pending?.preview;
  const candidates = (Array.isArray(preview?.plannedChanges) ? preview.plannedChanges : []).filter(
    (effect) =>
      isRecord(effect) &&
      typeof effect.path === "string" &&
      (typeof effect.before === "string" || effect.before === null) &&
      (typeof effect.after === "string" || effect.after === null),
  );
  if (pending?.type === "recovery" && isRecord(preview?.plan)) {
    const plan = preview.plan;
    if (Array.isArray(plan.files)) candidates.push(...plan.files);
    else if (
      typeof plan.cssPath === "string" &&
      (typeof plan.before === "string" || plan.before === null)
    ) {
      candidates.push({
        kind: "css",
        path: plan.cssPath,
        changed: plan.changed === true,
        before: plan.before,
        after: plan.after,
      });
    }
  }
  const unique = new Map();
  for (const effect of candidates) {
    if (!isRecord(effect) || typeof effect.path !== "string") continue;
    const kind = typeof effect.fileKind === "string" ? effect.fileKind : effect.kind;
    if (!unique.has(effect.path)) {
      unique.set(effect.path, {
        ...effect,
        kind,
        changed:
          typeof effect.changed === "boolean" ? effect.changed : effect.before !== effect.after,
      });
    }
  }
  return [...unique.values()];
}

export function managedFileKindLabel(kind) {
  if (kind === "package-json") return "PACKAGE.JSON";
  if (kind === "root-agents") return "ROOT AGENTS (MANAGED)";
  if (kind === "design-system-config") return "DESIGN-SYSTEM CONFIG";
  if (kind === "legacy-agents") return "LEGACY AGENTS (REMOVED)";
  if (kind === "css") return "CSS FILE";
  return "SOURCE FILE";
}

export function managedFileStateLabel(content) {
  if (content === null) return "MISSING";
  if (typeof content === "string") return "PRESENT";
  return "NOT RETURNED";
}

export function fileContentRows(effect, maxWidth) {
  const rows = [];
  const appendState = (label, content) => {
    const state = managedFileStateLabel(content);
    rows.push({ kind: "section", text: `${label} · ${state}` });
    if (content === null) {
      rows.push({ kind: "note", text: "(file did not exist)" });
      return;
    }
    if (typeof content !== "string") {
      rows.push({ kind: "note", text: "(content was not returned)" });
      return;
    }
    if (content === "") {
      rows.push({ kind: "note", text: "(empty file)" });
      return;
    }

    for (const sourceLine of content.split("\n")) {
      const wrapped = wrapFileLine(sourceLine, maxWidth);
      for (const text of wrapped) rows.push({ kind: "content", text });
    }
  };
  appendState("BEFORE", effect.before);
  appendState("AFTER", effect.after);
  return rows;
}

export function wrapFileLine(value, maxWidth) {
  if (value === "") return [""];
  const rows = [];
  let current = "";
  let width = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const characterWidth =
      /\p{Mark}/u.test(character) || codePoint === 0x200d
        ? 0
        : codePoint >= 0x1100 &&
            (codePoint <= 0x115f ||
              codePoint === 0x2329 ||
              codePoint === 0x232a ||
              (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
              (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
              (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
              (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
              (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
              (codePoint >= 0xff00 && codePoint <= 0xff60) ||
              (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
              codePoint > 0xffff)
          ? 2
          : 1;
    if (current !== "" && width + characterWidth > maxWidth) {
      rows.push(current);
      current = "";
      width = 0;
    }
    current += character;
    width += characterWidth;
  }
  rows.push(current);
  return rows;
}

export function previewViewportRows(rows) {
  return Math.max(1, Math.min(18, rows - 12));
}

export function resultRows(result, kind) {
  if (!isRecord(result)) return [];
  if (kind === "check" || kind === "doctor") {
    return (Array.isArray(result.checks) ? result.checks : []).map((item, index) => ({
      id: `${kind}-${item.id ?? item.label ?? index}`,
      label: `${item.status ?? (item.ok === false ? "FAILED" : "PASSED")}  ${item.label ?? item.id ?? "Check"}`,
      description: item.detail ?? "",
    }));
  }
  if (kind === "usage") {
    return (Array.isArray(result.findings) ? result.findings : []).map((finding, index) => ({
      id: `usage-${index}`,
      label: `${finding.severity ?? "finding"}  ${finding.file ?? ""}:${finding.line ?? ""}`,
      description: finding.message ?? finding.ruleId ?? "",
    }));
  }
  if (kind === "tailwind") {
    const changes = Array.isArray(result.changes) ? result.changes : [];
    return changes.map((effect, index) => ({
      id: `tailwind-${index}`,
      label: plannedEffectText(effect),
      description: "This is a read-only plan; no CSS was changed.",
    }));
  }
  return [];
}

export function detailSummary(result, kind) {
  if (!isRecord(result)) return [];
  if (kind === "check" || kind === "doctor") {
    return [result.summary, ...(failuresOf(result).length ? failuresOf(result) : [])].filter(
      Boolean,
    );
  }
  if (kind === "usage") {
    return [
      result.summary,
      `Strict AST validation scanned ${displayValue(result.scanned)} TS/TSX file(s); this is not an app test run.`,
      ...(failuresOf(result).length ? failuresOf(result) : []),
    ].filter(Boolean);
  }
  if (kind === "tailwind") {
    const plan = isRecord(result.plan) ? result.plan : null;
    if (!result.ok) return failuresOf(result);
    if (!plan) return ["No explicit CSS bridge plan was returned."];
    return [
      plan.changed
        ? "WARNING · CSS bridge changes are pending."
        : "SUCCESS · CSS bridge is already current.",
      `Explicit CSS target: ${displayValue(plan.cssPath)}`,
      `Target system: ${displayValue(plan.packageName)}@${displayValue(plan.version)}`,
      "Read-only preview. Nothing was written.",
    ];
  }
  return failuresOf(result);
}

export function systemInfoRows(manifest) {
  if (!isRecord(manifest)) return ["Registry details did not include a manifest."];
  const design = isRecord(manifest.design) ? manifest.design : {};
  const componentNames = isRecord(manifest.components) ? Object.keys(manifest.components) : [];
  const tokenGroups = isRecord(manifest.tokens?.groups) ? Object.keys(manifest.tokens.groups) : [];
  return [
    `Name: ${displayValue(manifest.name)}`,
    `Package: ${displayValue(manifest.package)}`,
    `Exact version: ${displayValue(manifest.version)}`,
    `Contract version: ${displayValue(manifest.contractVersion)}`,
    `Design: ${[design.density, design.theme, design.radius].filter(Boolean).join(" · ") || "not declared"}`,
    `Manifest components (${componentNames.length}): ${componentNames.join(", ") || "none listed"}`,
    `Manifest token groups: ${tokenGroups.join(", ") || "none listed"}`,
  ];
}
