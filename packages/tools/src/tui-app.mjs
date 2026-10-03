import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, useApp, useWindowSize } from "ink";
import {
  Badge,
  Button,
  List,
  MouseLayout,
  Tabs,
  TextInput as RuneframeTextInput,
  ThemeProvider,
  useKeyHandler,
} from "runeframe";

const h = React.createElement;

const SYSTEM_TABS = [
  { id: "systems", label: "Systems" },
  { id: "components", label: "Components" },
  { id: "tokens", label: "Tokens" },
  { id: "checks", label: "Checks" },
];
const CATEGORY_NAMES = new Set(["composition", "forms", "data-display"]);

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MANAGED_FILE_KINDS = new Set(["config", "agents", "root-agents"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function failuresOf(result) {
  if (Array.isArray(result?.failures)) return result.failures.map(String);
  if (typeof result?.reason === "string" && result.reason !== "") return [result.reason];
  return [];
}

function statusBadge(kind, label, key) {
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

function line(children, props = {}) {
  return h(MouseLayout, { ...props, flexDirection: "row" }, children);
}

function paragraph(children, props = {}) {
  return h(MouseLayout, { ...props, flexDirection: "column" }, children);
}

function rule(label, key) {
  return h(
    MouseLayout,
    { key, marginY: 1 },
    label
      ? h(Text, { dimColor: true }, `── ${label} ──`)
      : h(Text, { dimColor: true }, "────────────────────────"),
  );
}

function Heading({ children, compact = false }) {
  return h(Text, { bold: true, color: "cyan" }, compact ? children.toUpperCase() : children);
}

function KeyButton({
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

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function switchAutoSelectedEntryLine(entry) {
  if (!isRecord(entry)) return null;
  const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : null;
  const entrypoint =
    typeof entry.entrypoint === "string" && entry.entrypoint.trim() ? entry.entrypoint : null;
  const file = typeof entry.file === "string" && entry.file.trim() ? entry.file : null;
  const label = name && entrypoint ? `${name} (${entrypoint})` : (name ?? entrypoint);
  if (!label && !file) return null;
  return `• ${label ?? file}${label && file ? ` · ${file}` : ""}`;
}

function switchPeerActionLine(peer) {
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

function effectMetadataText(effects) {
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

function keyValue(label, value, { compact = false, key } = {}) {
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

function catalogDetail(label, value, key) {
  return line(
    [
      h(Text, { key: "label", color: "cyan", bold: true }, `${label}  `),
      h(Text, { key: "value", wrap: "wrap" }, displayValue(value)),
    ],
    { key, flexWrap: "wrap" },
  );
}

function componentMetadata(component) {
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

function extensionRequirementsText(extension) {
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

function getUpgradeDiffLines(diff) {
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

function commandText(command) {
  if (!isRecord(command)) return null;
  const parts = [command.manager, ...(Array.isArray(command.args) ? command.args : [])].filter(
    (part) => typeof part === "string" && part !== "",
  );
  return parts.join(" ") || null;
}

function skillCommandText(command) {
  if (!isRecord(command)) return null;
  return [command.executable, command.package, ...(Array.isArray(command.args) ? command.args : [])]
    .filter((part) => typeof part === "string" && part !== "")
    .join(" ");
}

function plannedEffectText(effect) {
  if (!isRecord(effect)) return String(effect);
  if (effect.kind === "dependency") {
    return `Dependency change · ${commandText(effect.command) ?? effect.manager ?? "package manager"}`;
  }
  if (effect.kind === "css") {
    return `CSS ${effect.changed ? "update" : "check"} · ${displayValue(effect.path)}`;
  }
  if (effect.kind === "connect") {
    return `Configuration file · ${displayValue(effect.path)}`;
  }
  if (MANAGED_FILE_KINDS.has(effect.kind)) {
    const label =
      effect.kind === "root-agents"
        ? "Root AGENTS file"
        : effect.kind === "agents"
          ? "AGENTS file"
          : "Managed config";
    return `${label} ${effect.changed ? "update" : "check"} · ${displayValue(effect.path)}`;
  }
  return `${displayValue(effect.kind)} · ${displayValue(effect.path)}`;
}

function fileReviewEffectsOf(pending) {
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

function managedFileKindLabel(kind) {
  if (kind === "root-agents") return "ROOT AGENTS";
  if (kind === "agents") return "AGENTS";
  if (kind === "config") return "CONFIG";
  if (kind === "css") return "CSS FILE";
  return "SOURCE FILE";
}

function managedFileStateLabel(content) {
  if (content === null) return "MISSING";
  if (typeof content === "string") return "PRESENT";
  return "NOT RETURNED";
}

function fileContentRows(effect, maxWidth) {
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

function wrapFileLine(value, maxWidth) {
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

function managedFileViewportRows(rows) {
  return Math.max(2, Math.min(30, rows - 15));
}

function resultRows(result, kind) {
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

function detailSummary(result, kind) {
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

function projectBanner(state, cwd, compact) {
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

function systemInfoRows(manifest) {
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

function TuiApp({ services }) {
  const { columns = 80, rows = 24 } = useWindowSize();
  const { exit } = useApp();
  const compact = columns < 58 || rows < 18;

  const [project, setProject] = useState(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState(null);
  const [view, setView] = useState("main");
  const [activeTab, setActiveTab] = useState("systems");
  const [searchContext, setSearchContext] = useState("catalog");
  const [detailReturnView, setDetailReturnView] = useState("main");
  const [componentSection, setComponentSection] = useState("required");
  const [componentCatalog, setComponentCatalog] = useState(null);
  const [componentError, setComponentError] = useState(null);
  const [selectedExtensionName, setSelectedExtensionName] = useState(null);
  const [tokenCatalog, setTokenCatalog] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [tokenGroup, setTokenGroup] = useState(null);
  const [tokenQuery, setTokenQuery] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [selectedSystemId, setSelectedSystemId] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [inspectionError, setInspectionError] = useState(null);
  const [upgradeVersion, setUpgradeVersion] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const [checkKind, setCheckKind] = useState(null);
  const [cssDraft, setCssDraft] = useState("");
  const [operation, setOperation] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [showManagedFileDetail, setShowManagedFileDetail] = useState(false);
  const [managedFileIndex, setManagedFileIndex] = useState(0);
  const [managedFileOffset, setManagedFileOffset] = useState(0);
  const [startupUpdate, setStartupUpdate] = useState(null);
  const [skillsResult, setSkillsResult] = useState(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillSection, setSkillSection] = useState("prism");
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [skillScope, setSkillScope] = useState("project");
  const [selectedSkillAgent, setSelectedSkillAgent] = useState(null);
  const [recoveryResult, setRecoveryResult] = useState(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryCssPath, setRecoveryCssPath] = useState("");
  const [recoveryEntry, setRecoveryEntry] = useState("");
  const [recoveryActionId, setRecoveryActionId] = useState(null);
  const [lifecycleCssPath, setLifecycleCssPath] = useState("");
  const [updateManager, setUpdateManager] = useState(null);
  const [skillAgentDraft, setSkillAgentDraft] = useState("");
  const mountedRef = useRef(false);
  const executeLock = useRef(false);
  const operationLock = useRef(false);

  const readProjectState = useCallback(() => {
    setProjectLoading(true);
    setProjectError(null);
    try {
      const state = services.getProjectState();
      setProject(state);
      setProjectLoading(false);
      if (state?.status === "error") setProjectError(state.reason ?? failuresOf(state).join(" "));
      return state;
    } catch (error) {
      const detail = messageOf(error);
      setProject(null);
      setProjectError(detail);
      setProjectLoading(false);
      return null;
    }
  }, [services]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    readProjectState();
  }, [readProjectState]);

  useEffect(() => {
    if (typeof services.checkCliUpdate !== "function") return undefined;
    let active = true;
    setStartupUpdate({ loading: true, result: null });
    // The read-only request starts alongside the first local render. A slow or
    // unavailable registry never delays project state, keyboard input, or TUI startup.
    Promise.resolve()
      .then(() => services.checkCliUpdate({ timeoutMs: 2500 }))
      .then((result) => {
        if (active) setStartupUpdate({ loading: false, result });
      })
      .catch((error) => {
        if (active) {
          setStartupUpdate({
            loading: false,
            result: {
              ok: false,
              available: false,
              advice: messageOf(error),
              error: messageOf(error),
            },
          });
        }
      });
    return () => {
      active = false;
    };
  }, [services]);

  const openManage = useCallback(() => {
    setNotice(null);
    setView("manage-home");
  }, []);

  const loadSkills = useCallback(
    async (scope = "all") => {
      if (typeof services.listSkills !== "function") {
        setSkillsResult({
          ok: false,
          failures: ["Skill management is unavailable in this TUI build."],
          catalog: [],
          installed: [],
        });
        setSkillsLoading(false);
        return null;
      }
      setSkillsLoading(true);
      try {
        const result = await services.listSkills({ scope });
        setSkillsResult(result);
        const entries = Array.isArray(result?.catalog) ? result.catalog : [];
        const selected = entries.find((entry) => entry.type === skillSection) ?? entries[0];
        if (selected) setSelectedSkillId(selected.id);
        return result;
      } catch (error) {
        const result = { ok: false, failures: [messageOf(error)], catalog: [], installed: [] };
        setSkillsResult(result);
        return result;
      } finally {
        setSkillsLoading(false);
      }
    },
    [services, skillSection],
  );

  const openSkills = useCallback(() => {
    setView("skills-home");
    setSkillScope("project");
    setSelectedSkillAgent(null);
    void loadSkills("all");
  }, [loadSkills]);

  const loadRecovery = useCallback(
    async ({ cssPath = recoveryCssPath, entry = recoveryEntry } = {}) => {
      if (typeof services.runRecovery !== "function") {
        const result = {
          ok: false,
          failures: ["Project recovery is unavailable in this TUI build."],
          report: null,
          suggestions: [],
        };
        setRecoveryResult(result);
        return result;
      }
      setRecoveryLoading(true);
      try {
        await Promise.resolve();
        const result = services.runRecovery({
          ...(cssPath.trim() ? { cssPath: cssPath.trim() } : {}),
          ...(entry.trim() ? { entry: entry.trim() } : {}),
        });
        setRecoveryResult(result);
        const first = Array.isArray(result?.suggestions) ? result.suggestions[0] : null;
        setRecoveryActionId(first?.id ?? null);
        return result;
      } catch (error) {
        const result = { ok: false, failures: [messageOf(error)], report: null, suggestions: [] };
        setRecoveryResult(result);
        return result;
      } finally {
        setRecoveryLoading(false);
      }
    },
    [recoveryCssPath, recoveryEntry, services],
  );

  const openRecovery = useCallback(() => {
    setView("recovery-home");
    void loadRecovery();
  }, [loadRecovery]);

  const searchCatalog = useCallback(
    async (query, { refresh = false, context = searchContext } = {}) => {
      if (operationLock.current) return;
      operationLock.current = true;
      const cleanQuery = typeof query === "string" ? query.trim() : "";
      setSearchQuery(cleanQuery);
      setCatalogError(null);
      setSearchContext(context);
      setOperation({
        status: "loading",
        label: refresh ? "Refreshing catalog" : "Searching catalog",
      });
      setView(context === "switch" ? "switch-search" : "main");
      try {
        const result = await services.searchSystems({ query: cleanQuery, size: 50 });
        if (!result?.ok) {
          const detail = failuresOf(result).join(" ") || "The registry request did not succeed.";
          setCatalogError(detail);
          setCatalogResults([]);
          setCatalogLoaded(true);
          setOperation({ status: "error", label: "Registry search failed", detail });
          return;
        }
        const results = Array.isArray(result.results) ? result.results : [];
        setCatalogResults(results);
        setCatalogLoaded(true);
        setSelectedSystemId(results[0] ? `${results[0].name}@${results[0].version}` : null);
        setOperation({
          status: "success",
          label: `${results.length} catalog result${results.length === 1 ? "" : "s"}`,
          detail: cleanQuery ? `Query: ${cleanQuery}` : "Supported systems loaded.",
        });
      } catch (error) {
        const detail = messageOf(error);
        setCatalogError(detail);
        setCatalogResults([]);
        setCatalogLoaded(true);
        setOperation({ status: "error", label: "Registry search failed", detail });
      } finally {
        operationLock.current = false;
      }
    },
    [searchContext, services],
  );

  const loadComponentCatalog = useCallback(
    (force = false) => {
      if (!force && (componentCatalog || componentError)) return;
      try {
        const result = services.listComponents({});
        if (!result?.ok) {
          setComponentError(failuresOf(result).join(" ") || "Component catalog could not be read.");
        } else {
          setComponentCatalog(result);
        }
      } catch (error) {
        setComponentError(messageOf(error));
      }
    },
    [componentCatalog, componentError, services],
  );

  const loadTokenCatalog = useCallback(
    (force = false) => {
      if (!force && (tokenCatalog || tokenError)) return;
      try {
        const result = services.listTokens({});
        if (!result?.ok) {
          setTokenError(failuresOf(result).join(" ") || "Token catalog could not be read.");
          return;
        }
        setTokenCatalog(result);
        const initialGroup = Array.isArray(result.groupNames)
          ? (result.groupNames[0] ?? null)
          : null;
        setTokenGroup(initialGroup);
      } catch (error) {
        setTokenError(messageOf(error));
      }
    },
    [services, tokenCatalog, tokenError],
  );

  const selectTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      setNotice(null);
      if (tab === "components") loadComponentCatalog();
      if (tab === "tokens") loadTokenCatalog();
    },
    [loadComponentCatalog, loadTokenCatalog],
  );

  const cycleTokenGroup = useCallback(
    (direction) => {
      const groups = Array.isArray(tokenCatalog?.groupNames) ? tokenCatalog.groupNames : [];
      const current = groups.indexOf(tokenGroup);
      if (groups.length === 0) return;
      setTokenGroup(groups[(Math.max(0, current) + direction + groups.length) % groups.length]);
    },
    [tokenCatalog, tokenGroup],
  );

  const moveManagedFile = useCallback(
    (direction) => {
      const managedFiles = fileReviewEffectsOf(pendingConfirmation);
      if (managedFiles.length === 0) return;
      setManagedFileIndex(
        (index) => (index + direction + managedFiles.length) % managedFiles.length,
      );
      setManagedFileOffset(0);
    },
    [pendingConfirmation],
  );

  const scrollManagedFile = useCallback(
    (movement) => {
      const managedFiles = fileReviewEffectsOf(pendingConfirmation);
      const currentFile = managedFiles[managedFileIndex] ?? managedFiles[0];
      if (!currentFile) return;
      const pageSize = managedFileViewportRows(rows);
      const lineCount = fileContentRows(currentFile, Math.max(8, columns - 8)).length;
      const maximumOffset = Math.max(0, lineCount - pageSize);
      setManagedFileOffset((offset) => Math.max(0, Math.min(maximumOffset, offset + movement)));
    },
    [columns, managedFileIndex, pendingConfirmation, rows],
  );

  const scrollManagedFileTo = useCallback(
    (edge) => {
      const managedFiles = fileReviewEffectsOf(pendingConfirmation);
      const currentFile = managedFiles[managedFileIndex] ?? managedFiles[0];
      if (!currentFile) return;
      const pageSize = managedFileViewportRows(rows);
      const lineCount = fileContentRows(currentFile, Math.max(8, columns - 8)).length;
      setManagedFileOffset(edge === "top" ? 0 : Math.max(0, lineCount - pageSize));
    },
    [columns, managedFileIndex, pendingConfirmation, rows],
  );

  const openInspection = useCallback(
    async (packageName, version, returnView = "main") => {
      if (operationLock.current) return;
      operationLock.current = true;
      setInspection(null);
      setInspectionError(null);
      setDetailReturnView(returnView);
      setOperation({ status: "loading", label: "Inspecting published manifest" });
      setView("detail-loading");
      try {
        const result = await services.inspectSystem({ packageName, version });
        if (!result?.ok) {
          const detail = failuresOf(result).join(" ") || "Published details could not be loaded.";
          setInspectionError(detail);
          setOperation({ status: "error", label: "Manifest inspection failed", detail });
          setView("details");
          return;
        }
        setInspection(result);
        setOperation({ status: "success", label: "Manifest inspected" });
        setView("details");
      } catch (error) {
        const detail = messageOf(error);
        setInspectionError(detail);
        setOperation({ status: "error", label: "Manifest inspection failed", detail });
        setView("details");
      } finally {
        operationLock.current = false;
      }
    },
    [services],
  );

  const actionForCurrentContext = useCallback(
    (kind, explicitVersion, options = {}) => {
      if (kind === "connect") {
        if (!project?.packageName) return null;
        return { kind, packageName: project.packageName, strict: undefined };
      }
      if (kind === "remove") {
        if (!project?.packageName) return null;
        return {
          kind,
          packageName: project.packageName,
          ...(lifecycleCssPath.trim() ? { cssPath: lifecycleCssPath.trim() } : {}),
        };
      }
      if (kind === "upgrade") {
        if (!project?.packageName) return null;
        return {
          kind,
          packageName: project.packageName,
          version: (explicitVersion ?? upgradeVersion).trim(),
          strict: undefined,
        };
      }
      if (kind === "switch") {
        const manifest = inspection?.manifest;
        const packageName = inspection?.package ?? manifest?.package;
        const version = inspection?.version ?? manifest?.version;
        if (typeof packageName !== "string" || typeof version !== "string") return null;
        return {
          kind,
          packageName,
          version,
          strict: undefined,
          ignore: [],
          ...(lifecycleCssPath.trim() ? { cssPath: lifecycleCssPath.trim() } : {}),
        };
      }
      const manifest = inspection?.manifest;
      const packageName = inspection?.package ?? manifest?.package;
      const version = inspection?.version ?? manifest?.version;
      if (typeof packageName !== "string" || typeof version !== "string") return null;
      if (kind === "install") {
        return { kind, packageName, version, saveDev: false, exact: true };
      }
      return {
        kind: "use",
        packageName,
        version,
        saveDev: false,
        exact: true,
        strict: undefined,
        ignore: [],
        checkUsage: false,
        tailwind: false,
        cssPath: null,
        skills: options.skills === true,
        skillAgents: Array.isArray(options.skillAgents) ? options.skillAgents : [],
      };
    },
    [inspection, lifecycleCssPath, project, upgradeVersion],
  );

  const beginMutation = useCallback(
    async (kind, explicitVersion, options = {}) => {
      const action = actionForCurrentContext(kind, explicitVersion, options);
      if (!action) {
        setNotice({ type: "error", message: "A package and exact target version are required." });
        return;
      }
      if (kind === "upgrade" && !EXACT_VERSION.test(action.version)) {
        setNotice({
          type: "error",
          message: "Enter an exact version such as 2.4.1 before previewing an upgrade.",
        });
        return;
      }
      if (operationLock.current) return;
      operationLock.current = true;
      setNotice(null);
      setOperation({ status: "loading", label: "Building read-only change preview" });
      try {
        const preview = await services.previewMutation(action);
        if (!preview?.ok || !isRecord(preview.material)) {
          const detail = failuresOf(preview).join(" ") || "The change could not be previewed.";
          setOperation({ status: "error", label: "Preview failed", detail });
          setNotice({ type: "error", message: detail });
          return;
        }
        setShowManagedFileDetail(false);
        setManagedFileIndex(0);
        setManagedFileOffset(0);
        setPendingConfirmation({
          type: "mutation",
          action,
          preview,
          returnView: options.returnView ?? view,
        });
        setOperation({ status: "info", label: "Review the plan before applying it" });
        setView("confirm");
      } catch (error) {
        const detail = messageOf(error);
        setOperation({ status: "error", label: "Preview failed", detail });
        setNotice({ type: "error", message: detail });
      } finally {
        operationLock.current = false;
      }
    },
    [actionForCurrentContext, services, view],
  );

  const cancelConfirmation = useCallback(() => {
    if (!pendingConfirmation) return;
    setView(pendingConfirmation.returnView);
    setPendingConfirmation(null);
    setShowManagedFileDetail(false);
    setOperation({ status: "neutral", label: "Cancelled · nothing was changed" });
  }, [pendingConfirmation]);

  const beginSkillMutation = useCallback(
    async (actionName) => {
      if (!selectedSkillId || !selectedSkillAgent) {
        setNotice({
          type: "warning",
          message: "Choose a catalog skill and one supported agent before planning a skill change.",
        });
        return;
      }
      if (operationLock.current) return;
      operationLock.current = true;
      setNotice(null);
      setOperation({ status: "loading", label: `Planning skill ${actionName}` });
      const action = {
        action: actionName,
        skillId: selectedSkillId,
        scope: skillScope,
        agents: [selectedSkillAgent],
      };
      try {
        const preview = await services.previewSkillMutation(action);
        if (!preview?.ok || !isRecord(preview.material)) {
          const detail = failuresOf(preview).join(" ") || "The skill change could not be planned.";
          setOperation({ status: "error", label: "Skill preview blocked", detail });
          setNotice({ type: "error", message: detail });
          return;
        }
        setPendingConfirmation({ type: "skill", action, preview, returnView: view });
        setOperation({ status: "info", label: "Review the skill plan before continuing" });
        setView("confirm");
      } catch (error) {
        const detail = messageOf(error);
        setOperation({ status: "error", label: "Skill preview failed", detail });
        setNotice({ type: "error", message: detail });
      } finally {
        operationLock.current = false;
      }
    },
    [selectedSkillAgent, selectedSkillId, services, skillScope, view],
  );

  const beginCliUpdate = useCallback(
    async (options = {}) => {
      if (operationLock.current) return;
      operationLock.current = true;
      setNotice(null);
      setOperation({ status: "loading", label: "Building an explicit CLI update plan" });
      try {
        const preview = await services.previewCliUpdate(options);
        if (!preview?.ok) {
          const detail =
            [...failuresOf(preview), preview?.advice].filter(Boolean).join(" ") ||
            "This prism-ds installation cannot be safely updated from the current context.";
          setOperation({ status: "warning", label: "CLI update is not available here", detail });
          setNotice({ type: "warning", message: detail });
          return;
        }
        if (preview.updateAvailable !== true || preview.state === "up-to-date") {
          const detail =
            preview?.plan?.advice ??
            `prism-ds ${displayValue(preview?.currentVersion ?? preview?.plan?.currentVersion)} is up to date.`;
          setOperation({ status: "success", label: "No CLI update needed", detail });
          return;
        }
        const action = { options };
        setPendingConfirmation({ type: "self-update", action, preview, returnView: view });
        setOperation({ status: "info", label: "Review the CLI update before installing it" });
        setView("confirm");
      } catch (error) {
        const detail = messageOf(error);
        setOperation({ status: "error", label: "CLI update plan failed", detail });
        setNotice({ type: "error", message: detail });
      } finally {
        operationLock.current = false;
      }
    },
    [services, view],
  );

  const beginRecoveryAction = useCallback(
    async (suggestion) => {
      if (!suggestion || suggestion.executable !== true) {
        setNotice({
          type: "warning",
          message:
            suggestion?.reason ??
            "This suggestion is guidance only. Review its command; the TUI will not run it.",
        });
        return;
      }
      if (operationLock.current) return;
      operationLock.current = true;
      setNotice(null);
      setOperation({ status: "loading", label: "Checking recovery action" });
      const action = {
        actionId: suggestion.id,
        ...(project?.packageName ? { packageName: project.packageName } : {}),
        ...(recoveryCssPath.trim() ? { cssPath: recoveryCssPath.trim() } : {}),
        ...(recoveryEntry.trim() ? { entry: recoveryEntry.trim() } : {}),
      };
      try {
        const preview = await services.previewRecoveryAction(action);
        if (!preview?.ok || !isRecord(preview.material)) {
          const detail =
            failuresOf(preview).join(" ") || "The recovery action is no longer applicable.";
          setOperation({ status: "warning", label: "Recovery action blocked", detail });
          setNotice({ type: "warning", message: detail });
          return;
        }
        setPendingConfirmation({ type: "recovery", action, preview, returnView: view });
        setOperation({ status: "info", label: "Review the targeted recovery plan" });
        setView("confirm");
      } catch (error) {
        const detail = messageOf(error);
        setOperation({ status: "error", label: "Recovery preview failed", detail });
        setNotice({ type: "error", message: detail });
      } finally {
        operationLock.current = false;
      }
    },
    [project, recoveryCssPath, recoveryEntry, services, view],
  );

  const beginSwitchSearch = useCallback(() => {
    setSearchContext("switch");
    setCatalogLoaded(false);
    setCatalogResults([]);
    setCatalogError(null);
    void searchCatalog("", { context: "switch" });
  }, [searchCatalog]);

  const openUseAgentInput = useCallback(() => {
    setSkillAgentDraft("");
    setView("use-agent-input");
  }, []);

  const openSkillAgentInput = useCallback(() => {
    setSkillAgentDraft("");
    setView("skill-agent-input");
  }, []);

  const confirmMutation = useCallback(async () => {
    if (!pendingConfirmation || executeLock.current || operationLock.current) return;
    executeLock.current = true;
    operationLock.current = true;
    const { type = "mutation", action, preview, returnView = "main" } = pendingConfirmation;
    setView(type === "mutation" ? "main" : returnView);
    setPendingConfirmation(null);
    setShowManagedFileDetail(false);
    setOperation({
      status: "loading",
      label: type === "mutation" ? `Applying ${action.kind}` : `Applying ${type}`,
    });
    try {
      let result;
      if (type === "skill") result = await services.executeSkillMutation(action, preview);
      else if (type === "self-update") {
        result = await services.executeCliUpdate(action.options, preview);
      } else if (type === "recovery") {
        result = await services.executeRecoveryAction(action, preview);
      } else result = await services.executeMutation(action, preview);

      const applied =
        result?.applied === true ||
        result?.actionCompleted === true ||
        result?.changed === true ||
        result?.result?.executed === true;
      const recoveryIncomplete =
        type === "recovery" &&
        result?.actionCompleted === true &&
        (result.repaired !== true || result.healthy !== true);
      const partial =
        result?.partial === true ||
        result?.result?.partial === true ||
        result?.state === "unverified" ||
        recoveryIncomplete;
      const notes = [
        ...failuresOf(result),
        typeof result?.result?.note === "string" ? result.result.note : null,
        typeof result?.note === "string" ? result.note : null,
      ].filter(Boolean);

      if (type === "mutation") {
        const refreshed = readProjectState();
        setActiveTab("systems");
        setComponentCatalog(null);
        setComponentError(null);
        setTokenCatalog(null);
        setTokenError(null);
        setSearchContext("catalog");
        if (applied || result?.ok === true) setView("main");
        else setView(returnView);
        if (refreshed?.status === "connected") setView("main");
      } else if (type === "skill") {
        void loadSkills("all");
      } else if (type === "recovery") {
        void loadRecovery();
      } else if (type === "self-update" && result?.ok) {
        setStartupUpdate({
          loading: false,
          result: {
            ok: true,
            available: false,
            current: result.installedVersion ?? result.targetVersion ?? null,
            latest: result.targetVersion ?? null,
            advice: result.note ?? "The CLI update action completed.",
          },
        });
      }

      let label;
      if (type === "recovery") {
        label =
          result?.actionCompleted === true
            ? result.repaired === true
              ? "Recovery action completed · targeted issue resolved"
              : "Recovery action completed · issues remain"
            : "Recovery action did not complete";
        notes.unshift(
          `Target issue repaired: ${result?.repaired === true ? "yes" : "no"}.`,
          `Whole project healthy: ${result?.healthy === true ? "yes" : "no"}.`,
          `Remaining issues: ${Array.isArray(result?.stillRemaining) ? result.stillRemaining.join(", ") || "none reported" : "not reported"}.`,
        );
      } else if (type === "mutation") {
        label = result?.ok
          ? `${action.kind[0].toUpperCase()}${action.kind.slice(1)} complete`
          : applied
            ? `${action.kind[0].toUpperCase()}${action.kind.slice(1)} partially applied`
            : `${action.kind[0].toUpperCase()}${action.kind.slice(1)} not completed`;
      } else if (type === "self-update") {
        label = result?.ok
          ? partial
            ? "CLI update completed · verification incomplete"
            : "CLI update complete"
          : applied
            ? "CLI update partially applied"
            : "CLI update not completed";
      } else {
        label = result?.ok
          ? partial
            ? "Skill action completed · verification incomplete"
            : "Skill action complete"
          : applied
            ? "Skill action partially applied"
            : "Skill action not completed";
      }
      setOperation({
        status: result?.ok ? (partial ? "warning" : "success") : applied ? "warning" : "error",
        label,
        detail:
          notes.join(" ") ||
          (applied
            ? "The local state was refreshed."
            : "Review the reported state before trying again."),
      });
    } catch (error) {
      const detail = messageOf(error);
      if (type === "mutation") readProjectState();
      setOperation({ status: "error", label: `${type} failed`, detail });
    } finally {
      operationLock.current = false;
      executeLock.current = false;
    }
  }, [loadRecovery, loadSkills, pendingConfirmation, readProjectState, services]);

  const runCheckAction = useCallback(
    async (kind, cssPath) => {
      if (operationLock.current) return;
      operationLock.current = true;
      setCheckError(null);
      setCheckResult(null);
      setCheckKind(kind);
      setOperation({ status: "loading", label: `Running ${kind}` });
      try {
        await Promise.resolve();
        let result;
        if (kind === "check") result = services.runCheck({});
        else if (kind === "doctor") result = services.runDoctor();
        else if (kind === "usage") result = services.runUsageCheck();
        else result = services.runTailwindCheck({ cssPath });
        setCheckResult(result);
        const ok = result?.ok === true;
        const label = kind === "usage" ? "check-usage" : kind;
        setOperation({
          status: ok ? "success" : "error",
          label: `${label} ${ok ? "complete" : "reported failures"}`,
          detail: result?.summary ?? failuresOf(result).join(" ") ?? "",
        });
        if (!ok) setCheckError(failuresOf(result).join(" ") || "The report contains failures.");
        if (kind === "tailwind" && result?.ok && result?.plan?.changed) {
          setOperation({
            status: "warning",
            label: "Tailwind bridge plan is pending",
            detail: "Read-only check only; no CSS was written.",
          });
        }
      } catch (error) {
        const detail = messageOf(error);
        setCheckError(detail);
        setOperation({ status: "error", label: `${kind} failed`, detail });
      } finally {
        operationLock.current = false;
      }
    },
    [services],
  );

  const openUpgradeInput = useCallback(() => {
    setUpgradeVersion("");
    setView("upgrade-input");
  }, []);

  const submitUseAgent = useCallback(
    (value = skillAgentDraft) => {
      const agent = value.trim();
      const allowed = Array.isArray(services.skillAgentIds)
        ? services.skillAgentIds
        : ["claude-code", "codex", "cursor", "opencode"];
      if (!allowed.includes(agent)) {
        setNotice({
          type: "error",
          message: `Choose one supported agent: ${allowed.join(", ")}. No provider is guessed.`,
        });
        return;
      }
      setView("details");
      void beginMutation("use", undefined, {
        skills: true,
        skillAgents: [agent],
        returnView: "details",
      });
    },
    [beginMutation, services.skillAgentIds, skillAgentDraft],
  );

  const submitSkillAgent = useCallback(
    (value = skillAgentDraft) => {
      const agent = value.trim();
      const allowed = Array.isArray(services.skillAgentIds)
        ? services.skillAgentIds
        : ["claude-code", "codex", "cursor", "opencode"];
      if (!allowed.includes(agent)) {
        setNotice({
          type: "error",
          message: `Choose one supported agent: ${allowed.join(", ")}. No provider is guessed.`,
        });
        return;
      }
      setSelectedSkillAgent(agent);
      setNotice(null);
      setView("skills-home");
    },
    [services.skillAgentIds, skillAgentDraft],
  );

  const checkCliUpdateNow = useCallback(async () => {
    if (typeof services.checkCliUpdate !== "function") {
      setStartupUpdate({
        loading: false,
        result: { ok: false, available: false, advice: "The CLI update check is unavailable." },
      });
      return;
    }
    setStartupUpdate((current) => ({ loading: true, result: current?.result ?? null }));
    try {
      const result = await services.checkCliUpdate({ timeoutMs: 2500 });
      setStartupUpdate({ loading: false, result });
      setOperation({
        status: result?.available ? "warning" : result?.ok ? "success" : "warning",
        label: result?.available
          ? `CLI update available · ${displayValue(result.latest)}`
          : result?.ok
            ? "CLI is up to date"
            : "CLI update check did not complete",
        detail: result?.advice ?? result?.error ?? "Read-only check only; nothing was installed.",
      });
    } catch (error) {
      const result = {
        ok: false,
        available: false,
        error: messageOf(error),
        advice: messageOf(error),
      };
      setStartupUpdate({ loading: false, result });
      setOperation({
        status: "warning",
        label: "CLI update check did not complete",
        detail: result.advice,
      });
    }
  }, [services]);

  useKeyHandler(
    (event) => {
      if (event.ctrl && event.key === "c") {
        exit();
        return true;
      }
      if (
        ![
          "search-input",
          "token-search",
          "upgrade-input",
          "css-input",
          "use-agent-input",
          "skill-agent-input",
          "recovery-css-input",
          "recovery-entry-input",
          "lifecycle-css-input",
        ].includes(view) &&
        event.key === "q"
      ) {
        exit();
        return true;
      }
      if (view === "confirm") {
        if (event.escape || event.key === "n") {
          cancelConfirmation();
          return true;
        }
        if (event.enter || event.key === "y") {
          void confirmMutation();
          return true;
        }
        const managedFiles = fileReviewEffectsOf(pendingConfirmation);
        if (!showManagedFileDetail && event.key === "v" && managedFiles.length > 0) {
          setManagedFileIndex(0);
          setManagedFileOffset(0);
          setShowManagedFileDetail(true);
          return true;
        }
        if (showManagedFileDetail && managedFiles.length > 0) {
          if (event.key === "v") {
            setShowManagedFileDetail(false);
            return true;
          }
          if (event.left || event.key === "[") {
            moveManagedFile(-1);
            return true;
          }
          if (event.right || event.key === "]") {
            moveManagedFile(1);
            return true;
          }

          const pageSize = managedFileViewportRows(rows);
          const key = String(event.key ?? "").toLowerCase();
          const movement =
            event.up || key === "pageup" || key === "page-up"
              ? key === "pageup" || key === "page-up"
                ? -pageSize
                : -1
              : event.down || key === "pagedown" || key === "page-down"
                ? key === "pagedown" || key === "page-down"
                  ? pageSize
                  : 1
                : 0;
          if (movement !== 0) {
            scrollManagedFile(movement);
            return true;
          }
          if (key === "home" || key === "end") {
            scrollManagedFileTo(key === "home" ? "top" : "bottom");
            return true;
          }
        }
        return false;
      }
      if (
        view === "search-input" ||
        view === "token-search" ||
        view === "upgrade-input" ||
        view === "css-input" ||
        view === "use-agent-input" ||
        view === "skill-agent-input" ||
        view === "recovery-css-input" ||
        view === "recovery-entry-input" ||
        view === "lifecycle-css-input"
      ) {
        return false;
      }
      if (event.escape) {
        if (view === "details" || view === "detail-loading") {
          setView(detailReturnView);
          return true;
        }
        if (view === "manage-home") {
          setView("main");
          return true;
        }
        if (["lifecycle-home", "skills-home", "self-update-home", "recovery-home"].includes(view)) {
          setView("manage-home");
          return true;
        }
        if (view === "switch-search") {
          setView("lifecycle-home");
          return true;
        }
        if (view !== "main") {
          setView("main");
          return true;
        }
        if (project?.status === "empty" && catalogLoaded) {
          setCatalogLoaded(false);
          setCatalogResults([]);
          setCatalogError(null);
          return true;
        }
        if (notice) {
          setNotice(null);
          return true;
        }
        return false;
      }

      if (view === "manage-home") {
        if (event.key === "s") {
          setView("lifecycle-home");
          return true;
        }
        if (event.key === "k") {
          openSkills();
          return true;
        }
        if (event.key === "u") {
          setView("self-update-home");
          return true;
        }
        if (event.key === "r") {
          openRecovery();
          return true;
        }
      }
      if ((view === "details" || view === "detail-loading") && event.key === "b") {
        setView(detailReturnView);
        return true;
      }
      if (view === "lifecycle-home") {
        if (event.key === "w") {
          beginSwitchSearch();
          return true;
        }
        if (event.key === "x") {
          void beginMutation("remove");
          return true;
        }
        if (event.key === "c") {
          setCssDraft(lifecycleCssPath);
          setView("lifecycle-css-input");
          return true;
        }
      }
      if (view === "switch-search") {
        if (event.key === "/") {
          setSearchDraft(searchQuery);
          setView("search-input");
          return true;
        }
        if (event.key === "r") {
          void searchCatalog(searchQuery, { refresh: true, context: "switch" });
          return true;
        }
        if (event.enter && catalogLoaded && catalogResults.length > 0) {
          const selected =
            catalogResults.find((item) => `${item.name}@${item.version}` === selectedSystemId) ??
            catalogResults[0];
          if (selected) void openInspection(selected.name, selected.version, "lifecycle-home");
          return true;
        }
      }
      if (view === "skills-home") {
        if (event.key === "p" || event.key === "d") {
          const section = event.key === "p" ? "prism" : "design";
          setSkillSection(section);
          const first = skillsResult?.catalog?.find((entry) => entry.type === section);
          if (first) setSelectedSkillId(first.id);
          return true;
        }
        if (event.key >= "1" && event.key <= "4") {
          const agents = Array.isArray(services.skillAgentIds)
            ? services.skillAgentIds
            : ["claude-code", "codex", "cursor", "opencode"];
          setSelectedSkillAgent(agents[Number(event.key) - 1] ?? null);
          return true;
        }
        if (event.key === "a") {
          openSkillAgentInput();
          return true;
        }
        if (event.key === "g") {
          setSkillScope((scope) => (scope === "project" ? "global" : "project"));
          return true;
        }
        if (event.key === "l") {
          void loadSkills("all");
          return true;
        }
        if (event.enter) {
          void beginSkillMutation("add");
          return true;
        }
        if (event.key === "u") {
          void beginSkillMutation("update");
          return true;
        }
        if (event.key === "x") {
          void beginSkillMutation("remove");
          return true;
        }
      }
      if (view === "self-update-home") {
        if (event.key === "c") {
          void checkCliUpdateNow();
          return true;
        }
        if (event.key === "n" || event.key === "p") {
          setUpdateManager(event.key === "n" ? "npm" : "pnpm");
          return true;
        }
        if (event.key === "l") {
          void beginCliUpdate({ ...(updateManager ? { manager: updateManager } : {}) });
          return true;
        }
        if (event.key === "g") {
          if (!updateManager) {
            setNotice({
              type: "warning",
              message: "Choose npm or pnpm first; global update context is never guessed.",
            });
          } else {
            void beginCliUpdate({ global: true, manager: updateManager });
          }
          return true;
        }
      }
      if (view === "recovery-home") {
        if (event.key === "r") {
          void loadRecovery();
          return true;
        }
        if (event.key === "c") {
          setCssDraft(recoveryCssPath);
          setView("recovery-css-input");
          return true;
        }
        if (event.key === "e") {
          setCssDraft(recoveryEntry);
          setView("recovery-entry-input");
          return true;
        }
        if (event.enter) {
          const suggestion = recoveryResult?.suggestions?.find(
            (item) => item.id === recoveryActionId,
          );
          if (suggestion) void beginRecoveryAction(suggestion);
          return true;
        }
      }

      if (project?.status === "empty" && view === "main") {
        if (event.key === "m") {
          openManage();
          return true;
        }
        if (event.key === "b" && (!catalogLoaded || catalogResults.length === 0)) {
          void searchCatalog(searchQuery);
          return true;
        }
        if ((event.key === "s" && !catalogLoaded) || event.key === "/") {
          setSearchDraft(searchQuery);
          setView("search-input");
          return true;
        }
        if (event.key === "r" && catalogLoaded) {
          void searchCatalog(searchQuery, { refresh: true });
          return true;
        }
        if (event.enter && view === "main" && catalogLoaded && catalogResults.length > 0) {
          const selected =
            catalogResults.find((item) => `${item.name}@${item.version}` === selectedSystemId) ??
            catalogResults[0];
          if (selected) void openInspection(selected.name, selected.version, "main");
          return true;
        }
      } else if (project?.status === "empty" && view === "details") {
        if (event.key === "i") {
          void beginMutation("install");
          return true;
        }
        if (event.key === "u") {
          void beginMutation("use", undefined, { skills: true });
          return true;
        }
        if (event.key === "n") {
          void beginMutation("use", undefined, { skills: false });
          return true;
        }
        if (event.key === "a") {
          openUseAgentInput();
          return true;
        }
      } else if (
        (project?.status === "connected" || project?.status === "installed") &&
        view === "details" &&
        searchContext === "switch"
      ) {
        if (event.key === "w") {
          void beginMutation("switch", undefined, { returnView: "details" });
          return true;
        }
      } else if (project?.status === "installed" && view === "main") {
        if (event.key === "c") {
          void beginMutation("connect");
          return true;
        }
        if (event.key === "p") {
          readProjectState();
          return true;
        }
        if (event.key === "m") {
          openManage();
          return true;
        }
      } else if (project?.status === "connected" && view === "main") {
        if (event.key >= "1" && event.key <= "4") {
          selectTab(SYSTEM_TABS[Number(event.key) - 1].id);
          return true;
        }
        if (event.key === "p") {
          readProjectState();
          return true;
        }
        if (activeTab === "systems") {
          if (event.key === "m") {
            openManage();
            return true;
          }
          if (event.key === "c") {
            void beginMutation("connect");
            return true;
          }
          if (event.key === "g") {
            openUpgradeInput();
            return true;
          }
          if (event.key === "d") {
            void openInspection(project.packageName, project.version);
            return true;
          }
        }
        if (activeTab === "components") {
          if (event.key === "r") {
            setComponentSection("required");
            return true;
          }
          if (event.key === "o") {
            setComponentSection("optional");
            return true;
          }
          if (event.key === "g") {
            setComponentSection("categories");
            return true;
          }
          if (event.key === "x" && (componentCatalog?.extensions?.length ?? 0) > 0) {
            setComponentSection("extensions");
            setSelectedExtensionName(componentCatalog.extensions[0].name ?? null);
            return true;
          }
          if (event.key === "l") {
            setComponentCatalog(null);
            setComponentError(null);
            loadComponentCatalog(true);
            return true;
          }
        }
        if (activeTab === "tokens") {
          if (event.key === "/") {
            setTokenDraft(tokenQuery);
            setView("token-search");
            return true;
          }
          if (event.key === "[" || event.key === "]") {
            cycleTokenGroup(event.key === "]" ? 1 : -1);
            return true;
          }
          if (event.key === "l") {
            setTokenCatalog(null);
            setTokenError(null);
            loadTokenCatalog(true);
            return true;
          }
        }
        if (activeTab === "checks") {
          if (event.key === "c") {
            void runCheckAction("check");
            return true;
          }
          if (event.key === "d") {
            void runCheckAction("doctor");
            return true;
          }
          if (event.key === "u") {
            void runCheckAction("usage");
            return true;
          }
          if (event.key === "t") {
            setCssDraft("");
            setView("css-input");
            return true;
          }
        }
      } else if (project?.status === "error" && event.key === "p") {
        readProjectState();
        return true;
      } else if (project?.status === "error" && view === "main" && event.key === "m") {
        openManage();
        return true;
      }
      return false;
    },
    "navigation",
    {
      priority: 100,
      deps: [
        view,
        showManagedFileDetail,
        managedFileIndex,
        managedFileOffset,
        pendingConfirmation,
        rows,
        columns,
        project,
        activeTab,
        searchQuery,
        searchContext,
        selectedSystemId,
        catalogLoaded,
        catalogResults,
        notice,
        skillsResult,
        recoveryResult,
        recoveryActionId,
        lifecycleCssPath,
        updateManager,
        tokenQuery,
        tokenCatalog,
        tokenGroup,
        cycleTokenGroup,
        moveManagedFile,
        scrollManagedFile,
        scrollManagedFileTo,
        cancelConfirmation,
        confirmMutation,
        searchCatalog,
        readProjectState,
        beginMutation,
        openInspection,
        openUpgradeInput,
        openManage,
        openSkills,
        openRecovery,
        beginSwitchSearch,
        beginSkillMutation,
        beginCliUpdate,
        beginRecoveryAction,
        checkCliUpdateNow,
        loadSkills,
        loadRecovery,
        openUseAgentInput,
        openSkillAgentInput,
        selectTab,
        loadComponentCatalog,
        loadTokenCatalog,
        runCheckAction,
        exit,
      ],
    },
  );

  useKeyHandler(
    (event) => {
      if (event.ctrl && event.key === "c") {
        exit();
        return true;
      }
      if (
        view !== "search-input" &&
        view !== "token-search" &&
        view !== "upgrade-input" &&
        view !== "css-input" &&
        view !== "use-agent-input" &&
        view !== "skill-agent-input" &&
        view !== "recovery-css-input" &&
        view !== "recovery-entry-input" &&
        view !== "lifecycle-css-input" &&
        event.key === "q"
      ) {
        exit();
        return true;
      }
      if (view === "confirm") {
        if (event.escape || event.key === "n") {
          cancelConfirmation();
          return true;
        }
        if (event.enter || event.key === "y") {
          void confirmMutation();
          return true;
        }
      }
      if (event.escape && project?.status === "empty" && view === "main" && catalogLoaded) {
        setCatalogLoaded(false);
        setCatalogResults([]);
        setCatalogError(null);
        return true;
      }
      return false;
    },
    "list",
    {
      priority: 200,
      enabled:
        view === "confirm" || (project?.status === "empty" && view === "main" && catalogLoaded),
      deps: [view, project, catalogLoaded, cancelConfirmation, confirmMutation],
    },
  );

  useKeyHandler(
    (event) => {
      if (event.ctrl && event.key === "c") {
        exit();
        return true;
      }
      return false;
    },
    "textinput",
    { priority: 250 },
  );

  const setSelectedResult = useCallback((id) => setSelectedSystemId(id), []);
  const openSelectedResult = useCallback(
    (id) => {
      const selected = catalogResults.find((item) => `${item.name}@${item.version}` === id);
      if (selected) {
        void openInspection(
          selected.name,
          selected.version,
          searchContext === "switch" ? "lifecycle-home" : "main",
        );
      }
    },
    [catalogResults, openInspection, searchContext],
  );

  const renderEmptyHome = () => {
    if (projectLoading) {
      return paragraph([
        statusBadge("info", "Reading local project state", "status"),
        h(
          Text,
          { key: "copy", dimColor: true },
          "No registry or catalog request is made on launch.",
        ),
      ]);
    }
    if (project?.status === "error") {
      return paragraph([
        statusBadge("error", "Project state could not be read", "status"),
        h(
          Text,
          { key: "detail", wrap: "wrap" },
          projectError ?? "Inspect the consumer path and configuration.",
        ),
      ]);
    }
    if (!catalogLoaded) {
      return paragraph([
        h(Heading, { key: "title" }, "Choose a design system"),
        h(
          Text,
          { key: "copy", wrap: "wrap" },
          "The supported catalog loads only on request. Inspect each published manifest before an install or use preview.",
        ),
        project?.reason && h(Text, { key: "reason", dimColor: true, wrap: "wrap" }, project.reason),
      ]);
    }

    return paragraph([
      h(
        Heading,
        { key: "title" },
        searchQuery ? `Catalog results · ${searchQuery}` : "Supported systems",
      ),
      h(
        Text,
        { key: "desc", dimColor: true },
        "Select a result, then inspect its published manifest before choosing install or use.",
      ),
      catalogError &&
        paragraph(
          [
            line(
              [
                statusBadge("error", "Registry error", "status"),
                h(Text, { key: "detail", wrap: "wrap" }, catalogError),
              ],
              { key: "catalog-error" },
            ),
          ],
          { key: "catalog-error-panel" },
        ),
      !catalogError &&
        catalogResults.length === 0 &&
        h(Text, { key: "none", dimColor: true }, "No supported systems matched this query."),
      catalogResults.length > 0 &&
        h(List, {
          key: "catalog-list",
          items: catalogResults.map((item) => ({
            id: `${item.name}@${item.version}`,
            label: `${item.name}@${item.version}`,
            description: item.description || "No registry description published.",
          })),
          selectedId: selectedSystemId ?? undefined,
          onSelect: setSelectedResult,
          maxVisible: Math.max(2, Math.min(10, rows - (compact ? 13 : 15))),
        }),
      h(Text, { key: "hint", dimColor: true }, "↑/↓ select · Esc back"),
    ]);
  };

  const renderSwitchSearch = () => {
    if (!catalogLoaded && !catalogError) {
      return paragraph([
        statusBadge("info", "Searching the registry", "status"),
        h(
          Text,
          { key: "copy", dimColor: true, wrap: "wrap" },
          "The current system remains installed. Choose and inspect one exact published release before reviewing a switch plan.",
        ),
      ]);
    }
    return paragraph([
      h(
        Heading,
        { key: "title" },
        searchQuery ? `Switch target · ${searchQuery}` : "Choose a switch target",
      ),
      h(
        Text,
        { key: "copy", wrap: "wrap" },
        "This search is read-only. The previous design-system dependency is retained if a switch is later confirmed.",
      ),
      catalogError &&
        line(
          [
            statusBadge("error", "Registry error", "status"),
            h(Text, { key: "detail", wrap: "wrap" }, catalogError),
          ],
          { key: "registry-error", flexWrap: "wrap" },
        ),
      !catalogError &&
        catalogResults.length === 0 &&
        h(Text, { key: "none", dimColor: true }, "No supported releases matched this query."),
      catalogResults.length > 0 &&
        h(List, {
          key: "switch-targets",
          items: catalogResults.map((item) => ({
            id: `${item.name}@${item.version}`,
            label: `${item.name}@${item.version}`,
            description: item.description || "No registry description published.",
          })),
          selectedId: selectedSystemId ?? undefined,
          onSelect: setSelectedResult,
          maxVisible: Math.max(2, Math.min(10, rows - (compact ? 13 : 15))),
        }),
      h(Text, { key: "hint", dimColor: true }, "↑/↓ select · Enter inspect · / search · Esc back"),
    ]);
  };

  const renderInstalledHome = () =>
    paragraph([
      h(Heading, { key: "title" }, "Configure this system"),
      h(
        Text,
        { key: "copy", wrap: "wrap" },
        "The package is already installed, but this project is not connected. Configure / Connect writes the consumer configuration; it does not reinstall the package.",
      ),
      h(MouseLayout, { key: "facts", marginTop: 1 }, [
        keyValue("PACKAGE", project?.packageName, { compact, key: "package" }),
        keyValue("VERSION", project?.version, { compact, key: "version" }),
        keyValue("CONTRACT", project?.contractVersion, { compact, key: "contract" }),
      ]),
    ]);

  const renderSystemDetails = () => {
    const selected = catalogResults.find(
      (item) => `${item.name}@${item.version}` === selectedSystemId,
    );
    const manifest = inspection?.manifest;
    const infoRows = systemInfoRows(manifest);
    return paragraph([
      h(Heading, { key: "title" }, "Published manifest details"),
      inspectionError &&
        line(
          [
            statusBadge("error", "Inspection failed", "status"),
            h(Text, { key: "error", wrap: "wrap" }, inspectionError),
          ],
          { key: "inspection-error" },
        ),
      !inspectionError &&
        h(
          MouseLayout,
          { key: "rows", flexDirection: "column", marginTop: 1 },
          infoRows.map((row, index) => h(Text, { key: `row-${index}`, wrap: "wrap" }, row)),
        ),
      selected &&
        h(
          Text,
          { key: "selected", dimColor: true },
          `Selected registry result: ${selected.name}@${selected.version}`,
        ),
      h(
        Text,
        { key: "hint", dimColor: true, wrap: "wrap" },
        (project?.status === "connected" || project?.status === "installed") &&
          searchContext === "switch"
          ? "Review this exact release before a usage-aware switch. Missing target support blocks the change; token names do not promise visual equality. Use & connect can also offer the consumer skill when an agent is known, or you can choose one explicitly."
          : project?.status === "connected"
            ? "Published manifest for the connected exact version."
            : "Install and use changes are previewed before anything is applied.",
      ),
    ]);
  };

  const renderComponents = () => {
    if (componentError) {
      return paragraph([
        line(
          [
            statusBadge("error", "Component catalog unavailable", "status"),
            h(Text, { key: "error", wrap: "wrap" }, componentError),
          ],
          { key: "component-error" },
        ),
      ]);
    }
    if (!componentCatalog)
      return h(Text, { dimColor: true }, "Reading the installed public manifest catalog…");

    const allComponents = Array.isArray(componentCatalog.components)
      ? componentCatalog.components
      : [];
    const availableNames = new Set(
      Array.isArray(componentCatalog.available) ? componentCatalog.available : [],
    );
    const unavailableNames = new Set(
      Array.isArray(componentCatalog.unavailable) ? componentCatalog.unavailable : [],
    );
    const categories = isRecord(componentCatalog.capabilities?.categories)
      ? componentCatalog.capabilities.categories
      : {};
    const extensions = Array.isArray(componentCatalog.extensions)
      ? componentCatalog.extensions
      : [];
    const optionalOnly = componentSection === "optional";
    const entries = allComponents.filter((component) =>
      optionalOnly ? component.optional === true : component.required === true,
    );
    const selectedExtension =
      extensions.find((extension) => extension.name === selectedExtensionName) ??
      extensions[0] ??
      null;
    const visibleEntries = componentSection === "extensions" ? extensions : entries;
    const componentItems = visibleEntries.map((component, index) => {
      const available = availableNames.has(component.name) && !unavailableNames.has(component.name);
      const metadata = componentMetadata(component);
      return {
        id: `component-${component.name}-${index}`,
        label:
          componentSection === "extensions"
            ? `EXTENSION  ${component.name}`
            : `${available ? "AVAILABLE" : "UNAVAILABLE"}  ${component.name}`,
        description:
          metadata || (component.required ? "Required contract component." : "Optional component."),
      };
    });

    return paragraph([
      h(
        Heading,
        { key: "title" },
        componentSection === "extensions"
          ? "Declared system extensions"
          : "Manifest component catalog",
      ),
      h(
        Text,
        { key: "counts", dimColor: true },
        componentSection === "extensions"
          ? `${extensions.length} declared extension${extensions.length === 1 ? "" : "s"}`
          : `${availableNames.size} available · ${unavailableNames.size} unavailable`,
      ),
      componentSection === "categories"
        ? Object.keys(categories).filter((name) => CATEGORY_NAMES.has(name)).length === 0
          ? h(
              Text,
              { key: "no-categories", dimColor: true },
              "No capability categories are declared in the returned manifest catalog.",
            )
          : h(
              MouseLayout,
              { key: "category-list", flexDirection: "column", marginTop: 1 },
              Object.entries(categories)
                .filter(([name]) => CATEGORY_NAMES.has(name))
                .map(([name, category]) => {
                  const available = Array.isArray(category?.available) ? category.available : [];
                  const unavailable = Array.isArray(category?.unavailable)
                    ? category.unavailable
                    : [];
                  return paragraph(
                    [
                      h(Text, { key: "name", bold: true, color: "cyan" }, name),
                      h(
                        Text,
                        { key: "available", wrap: "wrap" },
                        `Available: ${available.join(", ") || "none"}`,
                      ),
                      h(
                        Text,
                        { key: "unavailable", dimColor: true, wrap: "wrap" },
                        `Unavailable: ${unavailable.join(", ") || "none"}`,
                      ),
                    ],
                    { key: `category-${name}`, marginBottom: 1 },
                  );
                }),
            )
        : componentItems.length > 0
          ? h(List, {
              key: `component-list-${componentSection}`,
              items: componentItems,
              selectedId:
                componentSection === "extensions" && selectedExtension
                  ? `component-${selectedExtension.name}-${extensions.indexOf(selectedExtension)}`
                  : undefined,
              onSelect:
                componentSection === "extensions"
                  ? (id) => {
                      const index = componentItems.findIndex((item) => item.id === id);
                      setSelectedExtensionName(extensions[index]?.name ?? null);
                    }
                  : undefined,
              maxVisible: Math.max(2, Math.min(12, componentItems.length, rows - 11)),
            })
          : h(
              Text,
              { key: "empty", dimColor: true },
              componentSection === "extensions"
                ? "This system does not publish any custom extensions."
                : `No ${optionalOnly ? "optional" : "required"} catalog entries were returned.`,
            ),
      componentSection === "extensions" &&
        selectedExtension &&
        paragraph(
          [
            rule("SELECTED EXTENSION", "extension-detail-rule"),
            h(Heading, { key: "extension-name", compact: true }, selectedExtension.name),
            catalogDetail("DESCRIPTION", selectedExtension.description, "description"),
            catalogDetail(
              "IMPORT",
              `import { ${selectedExtension.name} } from "${displayValue(selectedExtension.importPath)}"`,
              "import",
            ),
            catalogDetail(
              "API / ENTRYPOINT",
              `v${displayValue(selectedExtension.apiVersion)} · ${displayValue(selectedExtension.entrypoint)}`,
              "api-entrypoint",
            ),
            catalogDetail("EFFECTS", effectMetadataText(selectedExtension.effects), "effects"),
            catalogDetail(
              "REQUIREMENTS",
              extensionRequirementsText(selectedExtension),
              "requirements",
            ),
            catalogDetail(
              "DOCS / EXAMPLE",
              `${displayValue(selectedExtension.docs)} · ${displayValue(selectedExtension.example)}`,
              "docs-example",
            ),
          ],
          { key: "extension-details", marginTop: 1 },
        ),
      h(
        Text,
        { key: "manifest-note", dimColor: true },
        componentSection === "extensions"
          ? "Only declared extensions are shown. Details reflect this installed public manifest."
          : "Availability and capability details reflect the installed public manifest.",
      ),
    ]);
  };

  const renderTokens = () => {
    if (tokenError) {
      return paragraph([
        line(
          [
            statusBadge("error", "Token catalog unavailable", "status"),
            h(Text, { key: "error", wrap: "wrap" }, tokenError),
          ],
          { key: "token-error" },
        ),
      ]);
    }
    if (!tokenCatalog)
      return h(Text, { dimColor: true }, "Reading the installed public manifest token catalog…");

    const groups = Array.isArray(tokenCatalog.groups) ? tokenCatalog.groups : [];
    const groupNames = Array.isArray(tokenCatalog.groupNames) ? tokenCatalog.groupNames : [];
    const selected = groups.find((group) => group.group === tokenGroup) ?? groups[0];
    const allTokens = Array.isArray(selected?.tokens) ? selected.tokens : [];
    const query = tokenQuery.trim().toLowerCase();
    const visibleTokens = query
      ? allTokens.filter((token) => {
          const haystack = [
            token.name,
            token.path,
            token.cssVariable,
            token.tailwind?.variable,
            token.tailwind?.utility,
            token.tailwind?.variant,
          ]
            .filter((value) => typeof value === "string")
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : allTokens;
    const tokenItems = visibleTokens.map((token, index) => {
      const tailwind = isRecord(token.tailwind)
        ? [token.tailwind.variable, token.tailwind.utility, token.tailwind.variant]
            .filter((value) => typeof value === "string" && value !== "")
            .join(" · ") || "No named Tailwind mapping"
        : "No named Tailwind mapping";
      return {
        id: `token-${token.group}-${token.path}-${index}`,
        label: token.name ?? token.path,
        description: `Path: ${displayValue(token.path)} · CSS: ${displayValue(token.cssVariable)} · Tailwind: ${tailwind}`,
      };
    });

    return paragraph([
      h(Heading, { key: "title" }, "Semantic token names"),
      h(
        Text,
        { key: "caveat", wrap: "wrap" },
        "The public manifest exposes semantic names and mappings only. Literal CSS values are not published in the manifest.",
      ),
      groupNames.length > 0 &&
        h(
          MouseLayout,
          { key: "groups", flexDirection: "row", flexWrap: "wrap" },
          groupNames.map((name, index) =>
            h(
              Text,
              {
                key: `group-${name}`,
                bold: name === (tokenGroup ?? groupNames[0]),
                color: name === (tokenGroup ?? groupNames[0]) ? "cyan" : undefined,
              },
              `${index > 0 ? "  ·  " : ""}${name === (tokenGroup ?? groupNames[0]) ? "› " : ""}${name}`,
            ),
          ),
        ),
      h(
        Text,
        { key: "count", dimColor: true },
        `${selected?.group ?? "No group"} · ${visibleTokens.length}/${allTokens.length} token names${query ? ` · filter: ${query}` : ""}`,
      ),
      tokenItems.length > 0
        ? h(List, {
            key: `token-list-${selected?.group ?? "none"}`,
            items: tokenItems,
            maxVisible: Math.max(2, Math.min(10, rows - (compact ? 12 : 14))),
          })
        : h(
            Text,
            { key: "empty", dimColor: true },
            query
              ? "No token names match this filter."
              : "This returned group contains no token names.",
          ),
    ]);
  };

  const renderChecks = () => {
    const kind = checkKind;
    const summary = checkResult ? detailSummary(checkResult, kind) : [];
    const rowsForResult = checkResult ? resultRows(checkResult, kind) : [];
    return paragraph([
      h(Heading, { key: "title" }, "Read-only project checks"),
      h(
        Text,
        { key: "scope-check", wrap: "wrap" },
        "Offline health report for config, manifest, exports, usage, and components. CSS imports are checked only for an explicit path; this screen never searches for or guesses a CSS file.",
      ),
      h(
        Text,
        { key: "scope-doctor", wrap: "wrap" },
        "Read-only diagnostics for the target, discovery, installed package, public manifest, and configuration.",
      ),
      h(
        Text,
        { key: "scope-usage", wrap: "wrap" },
        "Strict AST validation of consumer TS/TSX usage, not application tests.",
      ),
      h(
        Text,
        { key: "scope-tailwind", wrap: "wrap" },
        "Read-only Tailwind bridge plan for one CSS path you enter; nothing is written.",
      ),
      checkError &&
        line(
          [
            statusBadge("error", "Report contains failures", "status"),
            h(Text, { key: "error", wrap: "wrap" }, checkError),
          ],
          { key: "check-error" },
        ),
      checkResult &&
        line(
          [
            statusBadge(
              checkResult.ok ? "success" : "error",
              checkResult.ok ? "Passed" : "Failed",
              "status",
            ),
            h(Text, { key: "summary", wrap: "wrap" }, checkResult.summary ?? `${kind} report`),
          ],
          { key: "check-summary" },
        ),
      summary.length > 0 &&
        h(
          MouseLayout,
          { key: "summary-lines", flexDirection: "column", marginTop: 1 },
          summary.map((text, index) => h(Text, { key: `summary-${index}`, wrap: "wrap" }, text)),
        ),
      rowsForResult.length > 0 &&
        h(List, {
          key: `check-results-${kind}`,
          items: rowsForResult,
          maxVisible: Math.max(2, Math.min(8, rows - (compact ? 15 : 17))),
        }),
      kind === "tailwind" &&
        checkResult?.ok &&
        h(
          Text,
          {
            key: "tailwind-status",
            bold: true,
            color: checkResult.plan?.changed ? "yellow" : "green",
          },
          checkResult.plan?.changed
            ? "WARNING · explicit CSS bridge setup is pending."
            : "SUCCESS · explicit CSS bridge is already current.",
        ),
      kind === "tailwind" &&
        checkResult?.ok &&
        h(
          Text,
          { key: "tailwind-path", wrap: "wrap" },
          `CSS target: ${displayValue(checkResult.plan?.cssPath)}`,
        ),
    ]);
  };

  const renderManageHome = () => {
    const update = startupUpdate?.result;
    return paragraph([
      h(Heading, { key: "title" }, "Manage project and tooling"),
      h(
        Text,
        { key: "intro", wrap: "wrap" },
        "Each workflow uses the same published CLI planner. Nothing changes until you review a specific plan and confirm it.",
      ),
      project?.packageName &&
        keyValue("CONNECTED SYSTEM", `${project.packageName}@${project.version}`, {
          compact,
          key: "managed-system",
        }),
      paragraph(
        [
          h(Text, { key: "title", color: "cyan", bold: true }, "SYSTEM LIFECYCLE"),
          h(
            Text,
            { key: "copy", wrap: "wrap" },
            "Switch to a reviewed release or remove an unused system. Switch keeps the previous dependency.",
          ),
        ],
        { key: "lifecycle", marginTop: 1 },
      ),
      paragraph(
        [
          h(Text, { key: "title", color: "cyan", bold: true }, "SKILLS"),
          h(
            Text,
            { key: "copy", wrap: "wrap" },
            "Browse Prism and curated design instructions. Project/global scope and a supported agent are selected separately.",
          ),
        ],
        { key: "skills", marginTop: 1 },
      ),
      paragraph(
        [
          h(Text, { key: "title", color: "cyan", bold: true }, "CLI UPDATE"),
          h(
            Text,
            { key: "copy", wrap: "wrap" },
            update?.available === true
              ? `A newer prism-ds release is available (${displayValue(update.latest)}). It will not install unless you preview and confirm.`
              : startupUpdate?.loading
                ? "A read-only version check is running in the background; it does not delay this screen."
                : "Check or explicitly update prism-ds itself; this is separate from a design-system upgrade.",
          ),
        ],
        { key: "updates", marginTop: 1 },
      ),
      paragraph(
        [
          h(Text, { key: "title", color: "cyan", bold: true }, "RECOVERY"),
          h(
            Text,
            { key: "copy", wrap: "wrap" },
            "Diagnose first. Only currently applicable connect or explicit CSS repairs can be previewed here.",
          ),
        ],
        { key: "recovery", marginTop: 1 },
      ),
    ]);
  };

  const renderLifecycleHome = () =>
    paragraph([
      h(Heading, { key: "title" }, "System lifecycle"),
      h(
        Text,
        { key: "copy", wrap: "wrap" },
        "Switch scans actual consumer usage and blocks unsupported literal references. It does not rewrite component structure or props. Remove is separate and refuses while active references remain.",
      ),
      project?.packageName &&
        keyValue("CURRENT", `${project.packageName}@${project.version}`, {
          compact,
          key: "current",
        }),
      !project?.packageName &&
        h(
          Text,
          { key: "empty", dimColor: true, wrap: "wrap" },
          "No single installed system is selected. Connect or resolve the project state first.",
        ),
      h(
        Text,
        { key: "retained", dimColor: true, wrap: "wrap" },
        "Switch retains the old dependency. Removal is never bundled into a switch. CSS cleanup is only considered when you explicitly name a CSS file.",
      ),
      lifecycleCssPath && keyValue("EXPLICIT CSS", lifecycleCssPath, { compact, key: "css" }),
    ]);

  const renderSkillsHome = () => {
    const catalog = Array.isArray(skillsResult?.catalog) ? skillsResult.catalog : [];
    const entries = catalog.filter((entry) => entry.type === skillSection);
    const selected = entries.find((entry) => entry.id === selectedSkillId) ?? entries[0] ?? null;
    const installed = selected
      ? ((Array.isArray(skillsResult?.installed) ? skillsResult.installed : []).find(
          (item) => item.catalogId === selected.id && item.scope === skillScope,
        ) ?? null)
      : null;
    const agents = Array.isArray(services.skillAgentIds)
      ? services.skillAgentIds
      : ["claude-code", "codex", "cursor", "opencode"];
    const items = entries.map((entry) => {
      const present = (Array.isArray(skillsResult?.installed) ? skillsResult.installed : []).find(
        (item) => item.catalogId === entry.id && item.scope === skillScope,
      );
      const state = present
        ? present.modified
          ? "MODIFIED"
          : present.drift
            ? "DRIFTED"
            : present.managed
              ? "INSTALLED"
              : "EXTERNAL"
        : "NOT INSTALLED";
      return {
        id: entry.id,
        label: `${state}  ${entry.skill}`,
        description: [entry.role, entry.reviewStatus, entry.description]
          .filter(Boolean)
          .join(" · "),
      };
    });
    return paragraph([
      h(Heading, { key: "title" }, `${skillSection === "prism" ? "Prism" : "Design"} skills`),
      h(
        Text,
        { key: "copy", wrap: "wrap" },
        "Instructions only. Skill installation does not execute prompts or install product dependencies. Select a scope and one supported agent explicitly.",
      ),
      skillsLoading && statusBadge("info", "Reading installed files offline", "loading"),
      skillsResult &&
        !skillsResult.ok &&
        line(
          [
            statusBadge("warning", "Inventory incomplete", "inventory-status"),
            h(Text, { key: "failure", wrap: "wrap" }, failuresOf(skillsResult).join(" ")),
          ],
          { key: "inventory-warning", flexWrap: "wrap" },
        ),
      h(
        Text,
        { key: "selection", color: "cyan", bold: true, wrap: "wrap" },
        `SCOPE  ${skillScope.toUpperCase()}   ·   AGENT  ${selectedSkillAgent ?? "not selected"}`,
      ),
      h(
        Text,
        { key: "count", dimColor: true },
        `${entries.length} catalog skills · ${Array.isArray(skillsResult?.installed) ? skillsResult.installed.filter((item) => item.scope === skillScope).length : 0} observed in this scope`,
      ),
      entries.length > 0 &&
        h(List, {
          key: `skill-list-${skillSection}`,
          items,
          selectedId: selectedSkillId ?? undefined,
          onSelect: setSelectedSkillId,
          maxVisible: Math.max(2, Math.min(9, rows - 17)),
        }),
      entries.length === 0 &&
        h(
          Text,
          { key: "none", dimColor: true },
          skillsLoading ? "Loading catalog…" : "No skills are listed in this section.",
        ),
      selected &&
        paragraph(
          [
            rule("SELECTED SKILL", "selected-skill-rule"),
            h(Heading, { key: "name", compact: true }, selected.skill),
            catalogDetail("ID / TYPE", `${selected.id} · ${selected.type}`, "id-type"),
            catalogDetail("ROLE", selected.role, "role"),
            catalogDetail("REVIEW", selected.reviewStatus, "review"),
            catalogDetail(
              "TAGS",
              Array.isArray(selected.tags) ? selected.tags.join(", ") : null,
              "tags",
            ),
            catalogDetail(
              "THIS SCOPE",
              installed
                ? `${installed.managed ? "managed" : "external"}${installed.modified ? " · modified" : ""}${installed.drift ? " · drift" : ""} · ${installed.relativePath}`
                : "not installed",
              "scope-state",
            ),
          ],
          { key: "selected-skill", marginTop: 1 },
        ),
      h(
        Text,
        { key: "sharing", dimColor: true, wrap: "wrap" },
        "Universal agents share the canonical .agents/skills placement; the inventory reports actual shared files rather than promising per-agent isolation.",
      ),
      h(
        Text,
        { key: "agent-options", dimColor: true, wrap: "wrap" },
        agents.map((agent, index) => `${index + 1} ${agent}`).join(" · "),
      ),
    ]);
  };

  const renderSelfUpdateHome = () => {
    const result = startupUpdate?.result;
    const installation = isRecord(result?.installation) ? result.installation : {};
    const updateStatus = startupUpdate?.loading
      ? statusBadge("info", "Checking in background", "check")
      : result?.available
        ? statusBadge("warning", "Update available", "check")
        : result?.ok
          ? statusBadge("success", "Up to date", "check")
          : statusBadge("neutral", result?.skipped ? "Check skipped" : "Not checked", "check");
    return paragraph([
      h(Heading, { key: "title" }, "Update prism-ds"),
      h(
        Text,
        { key: "scope", wrap: "wrap" },
        "This updates the CLI package only. It does not upgrade the connected design system. The startup check is read-only and can be disabled with PRISM_DS_UPDATE_CHECK=0.",
      ),
      line(
        [
          updateStatus,
          h(
            Text,
            { key: "versions", wrap: "wrap" },
            `  ${displayValue(result?.current)} → ${displayValue(result?.latest)}`,
          ),
        ],
        { key: "update-status", flexWrap: "wrap" },
      ),
      keyValue("INSTALLATION", installation.kind ?? "unknown", { compact, key: "installation" }),
      keyValue("DETECTED MANAGER", installation.manager ?? "not identified", {
        compact,
        key: "manager",
      }),
      keyValue("VERIFIED", installation.verified === true ? "yes" : "no", {
        compact,
        key: "verified",
      }),
      h(
        Text,
        { key: "advice", wrap: "wrap" },
        result?.advice ?? "Run a read-only check. No update is installed automatically.",
      ),
      h(
        Text,
        { key: "explicit", dimColor: true, wrap: "wrap" },
        `Global manager selection: ${updateManager ?? "none"}. Choose npm or pnpm before previewing an explicit global update.`,
      ),
    ]);
  };

  const renderRecoveryHome = () => {
    const report = recoveryResult?.report;
    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const suggestions = Array.isArray(recoveryResult?.suggestions)
      ? recoveryResult.suggestions
      : [];
    const items = suggestions.map((suggestion) => ({
      id: suggestion.id,
      label: `${suggestion.executable === true ? "REPAIR" : "GUIDANCE"}  ${suggestion.label}`,
      description: suggestion.reason ?? "No explanation was returned.",
    }));
    const selected = suggestions.find((item) => item.id === recoveryActionId) ?? null;
    return paragraph([
      h(Heading, { key: "title" }, "Project recovery"),
      h(
        Text,
        { key: "copy", wrap: "wrap" },
        "Diagnosis is offline and read-only. Only applicable, executable repairs can be previewed; guidance stays guidance. A completed repair does not mean the whole project is healthy.",
      ),
      recoveryLoading && statusBadge("info", "Diagnosing project state", "loading"),
      report &&
        line(
          [
            statusBadge(
              report.ok ? "success" : "warning",
              report.ok
                ? "Healthy report"
                : `${issues.length} issue${issues.length === 1 ? "" : "s"}`,
              "health",
            ),
            h(
              Text,
              { key: "summary", wrap: "wrap" },
              report.summary ?? "Recovery diagnosis completed.",
            ),
          ],
          { key: "recovery-summary", flexWrap: "wrap" },
        ),
      recoveryResult &&
        !recoveryResult.ok &&
        h(
          Text,
          { key: "report-failure", color: "yellow", wrap: "wrap" },
          failuresOf(recoveryResult).join(" "),
        ),
      issues.length > 0 &&
        paragraph(
          [
            h(Text, { key: "title", color: "cyan", bold: true }, "ISSUES FOUND"),
            ...issues
              .slice(0, compact ? 2 : 4)
              .map((issue, index) =>
                h(
                  Text,
                  { key: `issue-${index}`, wrap: "wrap" },
                  `• ${issue.label ?? issue.id ?? "Issue"}: ${issue.detail ?? "No detail returned."}`,
                ),
              ),
          ],
          { key: "issue-list", marginTop: 1 },
        ),
      recoveryCssPath && keyValue("EXPLICIT CSS", recoveryCssPath, { compact, key: "css" }),
      recoveryEntry && keyValue("EXPLICIT ENTRY", recoveryEntry, { compact, key: "entry" }),
      suggestions.length > 0 &&
        h(List, {
          key: "recovery-suggestions",
          items,
          selectedId: recoveryActionId ?? undefined,
          onSelect: setRecoveryActionId,
          maxVisible: Math.max(2, Math.min(7, rows - 16)),
        }),
      suggestions.length === 0 &&
        report &&
        h(
          Text,
          { key: "no-actions", dimColor: true },
          "No repair actions are currently suggested.",
        ),
      selected &&
        h(
          Text,
          { key: "selected-kind", dimColor: true, wrap: "wrap" },
          selected.executable === true
            ? "Enter to preview this repair. It will not run until you confirm its plan."
            : "Guidance only. No change will be run from this suggestion.",
        ),
    ]);
  };

  const submitSearch = (value = searchDraft) => void searchCatalog(value);
  const applyTokenFilter = (value = tokenDraft) => {
    setTokenQuery(value);
    setView("main");
  };
  const submitUpgrade = (value = upgradeVersion) => {
    const exactVersion = value.trim();
    if (!EXACT_VERSION.test(exactVersion)) {
      setNotice({ type: "error", message: "Enter an exact version such as 2.4.1." });
      return;
    }
    setUpgradeVersion(exactVersion);
    void beginMutation("upgrade", exactVersion);
  };
  const submitCssCheck = (value = cssDraft) => {
    const cssPath = value.trim();
    if (!cssPath) return;
    setView("main");
    void runCheckAction("tailwind", cssPath);
  };
  const submitLifecycleCss = (value = cssDraft) => {
    setLifecycleCssPath(value.trim());
    setView("lifecycle-home");
    setNotice(null);
  };

  const renderConnectedSystem = () =>
    paragraph([
      h(Heading, { key: "title" }, "Connected design system"),
      h(MouseLayout, { key: "project-banner" }, projectBanner(project, services.cwd, compact)),
      h(MouseLayout, { key: "facts", marginTop: 1 }, [
        keyValue("PACKAGE", project?.packageName, { compact, key: "package" }),
        keyValue("EXACT VERSION", project?.version, { compact, key: "version" }),
        keyValue("CONTRACT", project?.contractVersion, { compact, key: "contract" }),
        keyValue("TARGET", services.cwd, { compact, key: "target" }),
      ]),
      project?.config &&
        keyValue(
          "CONFIG",
          `${project.config.package ?? project.packageName} · strict ${project.config.strict}`,
          { compact, key: "config" },
        ),
    ]);

  const renderConfirmation = () => {
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

    if (showManagedFileDetail && managedFiles.length > 0) {
      const fileIndex = Math.max(0, Math.min(managedFileIndex, managedFiles.length - 1));
      const file = managedFiles[fileIndex];
      const pageSize = managedFileViewportRows(rows);
      const contentRows = fileContentRows(file, Math.max(8, columns - 8));
      const maximumOffset = Math.max(0, contentRows.length - pageSize);
      const firstRow = Math.min(managedFileOffset, maximumOffset);
      const visibleRows = contentRows.slice(firstRow, firstRow + pageSize);
      const lastRow = firstRow + visibleRows.length;
      const changeStatus =
        file.changed === true
          ? "CHANGED"
          : file.changed === false
            ? "UNCHANGED"
            : "CHANGE STATUS NOT RETURNED";
      return paragraph([
        h(Heading, { key: "title" }, "Confirm planned change · managed file"),
        h(
          Text,
          { key: "target", wrap: "wrap" },
          `${type === "mutation" ? action.kind.toUpperCase() : type.toUpperCase()} · ${preview.packageName ?? action.packageName ?? project?.packageName ?? "package not reported"}@${targetVersion ?? "unknown version"}`,
        ),
        h(
          Text,
          { key: "file-label", color: "cyan", bold: true, wrap: "wrap" },
          `FILE ${fileIndex + 1}/${managedFiles.length} · ${managedFileKindLabel(file.kind)} · ${changeStatus}`,
        ),
        h(Text, { key: "path", wrap: "wrap" }, `PATH  ${displayValue(file.path)}`),
        h(
          Text,
          { key: "states", wrap: "wrap" },
          `BEFORE  ${managedFileStateLabel(file.before)}  ·  AFTER  ${managedFileStateLabel(file.after)}`,
        ),
        h(
          Text,
          { key: "position", dimColor: true, wrap: "wrap" },
          `Content rows ${contentRows.length === 0 ? 0 : firstRow + 1}–${lastRow} of ${contentRows.length} · visual wraps do not change the file content.`,
        ),
        h(
          MouseLayout,
          { key: "file-content", flexDirection: "column" },
          visibleRows.map((row, index) =>
            row.kind === "section"
              ? h(
                  Text,
                  { key: `content-${firstRow + index}`, color: "cyan", bold: true },
                  `── ${row.text} ──`,
                )
              : row.kind === "note"
                ? h(
                    Text,
                    { key: `content-${firstRow + index}`, dimColor: true, wrap: "wrap" },
                    `  ${row.text}`,
                  )
                : h(Text, { key: `content-${firstRow + index}` }, `│ ${row.text}`),
          ),
        ),
      ]);
    }

    return paragraph([
      h(Heading, { key: "title" }, "Confirm planned change"),
      h(
        Text,
        { key: "warning", wrap: "wrap" },
        "Review the exact target and planned file effects before approval. Canceling leaves the project unchanged.",
      ),
      rule("TARGET", "target-rule"),
      keyValue("ACTION", action.kind === "use" ? "Use · installs and connects" : action.kind, {
        key: "action",
      }),
      keyValue("PACKAGE", preview.packageName ?? action.packageName ?? project?.packageName, {
        key: "package",
      }),
      keyValue("EXACT VERSION", targetVersion ?? "Not reported by the preview", { key: "version" }),
      keyValue("PROJECT", services.cwd, { key: "project" }),
      isDependencyChange &&
        paragraph(
          [
            keyValue(
              "PACKAGE MANAGER",
              preview.manager ?? preview.command?.manager ?? "not reported",
              { key: "manager" },
            ),
            keyValue("COMMAND", command ?? "not reported", { key: "command" }),
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
              "Each managed file's exact before/after content is available for review. Missing files are labeled explicitly.",
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
            h(List, {
              key: "diff",
              items: upgradeLines.map((label, index) => ({ id: `diff-${index}`, label })),
              maxVisible: Math.max(2, Math.min(8, rows - (compact ? 18 : 20))),
            }),
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
  };

  const renderBody = () => {
    if (projectLoading || !project) return renderEmptyHome();
    if (project.status === "error" || project.status === "empty") return renderEmptyHome();
    if (project.status === "installed") return renderInstalledHome();
    if (project.status !== "connected") return renderEmptyHome();
    if (activeTab === "systems") return renderConnectedSystem();
    if (activeTab === "components") return renderComponents();
    if (activeTab === "tokens") return renderTokens();
    return renderChecks();
  };

  const renderInput = () => {
    if (view === "search-input") {
      return paragraph([
        h(Heading, { key: "title" }, "Search the registry"),
        h(
          Text,
          { key: "copy", dimColor: true },
          "Network access starts only when you submit this query.",
        ),
        h(TextInputCompat, {
          key: "input",
          value: searchDraft,
          placeholder: "Search supported systems",
          onChange: setSearchDraft,
          onSubmit: submitSearch,
          onCancel: () => setView(searchContext === "switch" ? "switch-search" : "main"),
          maxLength: 120,
        }),
      ]);
    }
    if (view === "token-search") {
      return paragraph([
        h(Heading, { key: "title" }, "Filter token names"),
        h(
          Text,
          { key: "copy", dimColor: true },
          "Search the loaded public manifest names and mappings; no token values are fetched.",
        ),
        h(TextInputCompat, {
          key: "input",
          value: tokenDraft,
          placeholder: "Name, path, CSS variable, or Tailwind mapping",
          onChange: setTokenDraft,
          onSubmit: applyTokenFilter,
          onCancel: () => setView("main"),
          maxLength: 120,
        }),
      ]);
    }
    if (view === "upgrade-input") {
      return paragraph([
        h(Heading, { key: "title" }, "Choose an exact upgrade version"),
        h(
          Text,
          { key: "copy", wrap: "wrap" },
          `Current: ${project?.packageName}@${project?.version}. Enter a published exact version; the tool will not choose latest for you.`,
        ),
        h(TextInputCompat, {
          key: "input",
          value: upgradeVersion,
          placeholder: "2.4.1",
          onChange: setUpgradeVersion,
          onSubmit: submitUpgrade,
          onCancel: () => {
            setView("main");
            setNotice(null);
          },
          validate: (value) =>
            EXACT_VERSION.test(value.trim()) ? null : "Enter an exact version such as 2.4.1.",
          maxLength: 80,
        }),
      ]);
    }
    if (view === "css-input") {
      return paragraph([
        h(Heading, { key: "title" }, "Explicit CSS bridge check"),
        h(
          Text,
          { key: "copy", wrap: "wrap" },
          "Enter one existing CSS path inside the current project. The checker never searches for or guesses a file, and it will not write.",
        ),
        h(TextInputCompat, {
          key: "input",
          value: cssDraft,
          placeholder: "path/to/entry.css",
          onChange: setCssDraft,
          onSubmit: submitCssCheck,
          onCancel: () => {
            setView("main");
            setCssDraft("");
          },
          validate: (value) => (value.trim() ? null : "Enter one explicit CSS path."),
          maxLength: 240,
        }),
      ]);
    }
    if (view === "use-agent-input") {
      const allowed = Array.isArray(services.skillAgentIds)
        ? services.skillAgentIds
        : ["claude-code", "codex", "cursor", "opencode"];
      return paragraph([
        h(Heading, { key: "title" }, "Choose an agent for the use skill"),
        h(
          Text,
          { key: "copy", wrap: "wrap" },
          "Choose one supported agent explicitly. The skill is project-scoped and contains instructions only; no provider is guessed and no instructions are executed.",
        ),
        h(
          Text,
          { key: "agents", dimColor: true, wrap: "wrap" },
          `Supported: ${allowed.join(", ")}`,
        ),
        h(TextInputCompat, {
          key: "input",
          value: skillAgentDraft,
          placeholder: "codex",
          onChange: setSkillAgentDraft,
          onSubmit: submitUseAgent,
          onCancel: () => setView("details"),
          validate: (value) =>
            allowed.includes(value.trim()) ? null : `Choose one of: ${allowed.join(", ")}.`,
          maxLength: 40,
        }),
      ]);
    }
    if (view === "skill-agent-input") {
      const allowed = Array.isArray(services.skillAgentIds)
        ? services.skillAgentIds
        : ["claude-code", "codex", "cursor", "opencode"];
      return paragraph([
        h(Heading, { key: "title" }, "Choose a skill agent"),
        h(
          Text,
          { key: "copy", wrap: "wrap" },
          "This only selects the destination for a later, separately reviewed skill action. No agent is inferred and no files are changed here.",
        ),
        h(
          Text,
          { key: "agents", dimColor: true, wrap: "wrap" },
          `Supported: ${allowed.join(", ")}`,
        ),
        h(TextInputCompat, {
          key: "input",
          value: skillAgentDraft,
          placeholder: "codex",
          onChange: setSkillAgentDraft,
          onSubmit: submitSkillAgent,
          onCancel: () => setView("skills-home"),
          validate: (value) =>
            allowed.includes(value.trim()) ? null : `Choose one of: ${allowed.join(", ")}.`,
          maxLength: 40,
        }),
      ]);
    }
    if (view === "lifecycle-css-input") {
      return paragraph([
        h(Heading, { key: "title" }, "Choose an explicit CSS file"),
        h(
          Text,
          { key: "copy", wrap: "wrap" },
          "Switch or remove will inspect only this consumer-relative CSS path for attributable bridge imports. Leave it empty to clear the optional CSS target; no file is guessed.",
        ),
        h(TextInputCompat, {
          key: "input",
          value: cssDraft,
          placeholder: "src/app.css",
          onChange: setCssDraft,
          onSubmit: submitLifecycleCss,
          onCancel: () => setView("lifecycle-home"),
          maxLength: 240,
        }),
      ]);
    }
    if (view === "recovery-css-input" || view === "recovery-entry-input") {
      const cssMode = view === "recovery-css-input";
      return paragraph([
        h(
          Heading,
          { key: "title" },
          cssMode ? "Choose an explicit CSS file" : "Choose an explicit entry",
        ),
        h(
          Text,
          { key: "copy", wrap: "wrap" },
          cssMode
            ? "Recovery will inspect only this consumer-relative CSS path. Leave it empty to clear the optional CSS target; it never searches for a file."
            : "Recovery will scan only this named entry, extension, or file. Leave it empty to remove the optional entry target; it never guesses one.",
        ),
        h(TextInputCompat, {
          key: "input",
          value: cssDraft,
          placeholder: cssMode ? "src/app.css" : "KeyboardScene or src/app.tsx",
          onChange: setCssDraft,
          onSubmit: (value) => {
            const clean = value.trim();
            if (cssMode) {
              setRecoveryCssPath(clean);
              setView("recovery-home");
              void loadRecovery({ cssPath: clean });
            } else {
              setRecoveryEntry(clean);
              setView("recovery-home");
              void loadRecovery({ entry: clean });
            }
          },
          onCancel: () => setView("recovery-home"),
          maxLength: 240,
        }),
      ]);
    }
    return null;
  };

  const isInputView = [
    "search-input",
    "token-search",
    "upgrade-input",
    "css-input",
    "use-agent-input",
    "skill-agent-input",
    "recovery-css-input",
    "recovery-entry-input",
    "lifecycle-css-input",
  ].includes(view);
  const isDetailView = view === "details" || view === "detail-loading";
  const content =
    view === "confirm"
      ? renderConfirmation()
      : isInputView
        ? renderInput()
        : isDetailView
          ? view === "detail-loading"
            ? paragraph([
                statusBadge("info", "Inspecting published manifest", "status"),
                h(Text, { key: "detail", dimColor: true }, "Read-only registry request…"),
              ])
            : renderSystemDetails()
          : view === "manage-home"
            ? renderManageHome()
            : view === "lifecycle-home"
              ? renderLifecycleHome()
              : view === "switch-search"
                ? renderSwitchSearch()
                : view === "skills-home"
                  ? renderSkillsHome()
                  : view === "self-update-home"
                    ? renderSelfUpdateHome()
                    : view === "recovery-home"
                      ? renderRecoveryHome()
                      : renderBody();

  const tabsVisible = !projectLoading && project?.status === "connected" && view === "main";
  const operationTone = operation?.status === "loading" ? "info" : operation?.status;
  const operationText = operation
    ? line(
        [
          statusBadge(
            operationTone,
            operation.status === "neutral" ? "Neutral" : operation.status,
            "status",
          ),
          h(Text, { key: "gap" }, " "),
          h(Text, { key: "label", bold: true }, operation.label),
          operation.detail &&
            h(Text, { key: "detail", dimColor: true, wrap: "wrap" }, `  ${operation.detail}`),
        ],
        { key: "operation-row", flexWrap: "wrap" },
      )
    : null;
  const currentStatus = projectBanner(project, services.cwd, compact);
  const confirmationHasManagedFiles =
    view === "confirm" && fileReviewEffectsOf(pendingConfirmation).length > 0;
  const showActivity = Boolean(notice || (operation && view !== "confirm"));
  const footerBusy = operation?.status === "loading";
  const footerCompact = compact || rows < 30;
  const footerActions = [];
  const addFooterAction = (key, shortcut, label, onActivate, options = {}) => {
    footerActions.push({ key, shortcut, label, onActivate, ...options });
  };

  if (view === "confirm") {
    const managedFiles = fileReviewEffectsOf(pendingConfirmation);
    if (showManagedFileDetail) {
      addFooterAction("scroll-up", "↑", "Scroll up", () => scrollManagedFile(-1));
      addFooterAction("scroll-down", "↓", "Scroll down", () => scrollManagedFile(1));
      if (managedFiles.length > 1) {
        addFooterAction("previous-file", "←", "Previous file", () => moveManagedFile(-1));
        addFooterAction("next-file", "→", "Next file", () => moveManagedFile(1));
      }
      addFooterAction("close-file", "v", "Close preview", () => setShowManagedFileDetail(false));
    } else if (confirmationHasManagedFiles) {
      addFooterAction("inspect-files", "v", "Inspect files", () => {
        setManagedFileIndex(0);
        setManagedFileOffset(0);
        setShowManagedFileDetail(true);
      });
    }
    if (pendingConfirmation) {
      addFooterAction("confirm", "y / Enter", "Confirm & apply", () => void confirmMutation(), {
        variant: "primary",
      });
      addFooterAction("cancel", "Esc / n", "Cancel", cancelConfirmation);
    }
  } else if (isInputView) {
    if (view === "search-input") {
      addFooterAction("submit-search", "Enter", "Search catalog", () => submitSearch(), {
        variant: "primary",
      });
    } else if (view === "token-search") {
      addFooterAction("apply-filter", "Enter", "Apply filter", () => applyTokenFilter(), {
        variant: "primary",
      });
    } else if (view === "upgrade-input") {
      addFooterAction("preview-upgrade", "Enter", "Preview upgrade", () => submitUpgrade(), {
        variant: "primary",
        disabled: !EXACT_VERSION.test(upgradeVersion.trim()),
      });
    } else if (view === "css-input") {
      addFooterAction("check-css", "Enter", "Check this path", () => submitCssCheck(), {
        variant: "primary",
        disabled: !cssDraft.trim(),
      });
    } else if (view === "use-agent-input") {
      addFooterAction("choose-use-agent", "Enter", "Use with this agent", () => submitUseAgent(), {
        variant: "primary",
        disabled: !skillAgentDraft.trim(),
      });
    } else if (view === "skill-agent-input") {
      addFooterAction("choose-skill-agent", "Enter", "Select agent", () => submitSkillAgent(), {
        variant: "primary",
        disabled: !skillAgentDraft.trim(),
      });
    } else if (view === "lifecycle-css-input") {
      addFooterAction(
        "save-lifecycle-css",
        "Enter",
        "Use this CSS target",
        () => submitLifecycleCss(),
        {
          variant: "primary",
        },
      );
    } else if (view === "recovery-css-input") {
      addFooterAction(
        "save-recovery-css",
        "Enter",
        "Diagnose this CSS target",
        () => {
          const cssPath = cssDraft.trim();
          setRecoveryCssPath(cssPath);
          setView("recovery-home");
          void loadRecovery({ cssPath });
        },
        { variant: "primary" },
      );
    } else if (view === "recovery-entry-input") {
      addFooterAction(
        "save-recovery-entry",
        "Enter",
        "Diagnose this entry",
        () => {
          const entry = cssDraft.trim();
          setRecoveryEntry(entry);
          setView("recovery-home");
          void loadRecovery({ entry });
        },
        { variant: "primary" },
      );
    }
    addFooterAction("cancel-input", "Esc", "Cancel", () => {
      if (view === "upgrade-input" || view === "css-input") setNotice(null);
      if (view === "css-input" || view === "lifecycle-css-input") setCssDraft("");
      if (view === "use-agent-input") setView("details");
      else if (view === "skill-agent-input") setView("skills-home");
      else if (view === "lifecycle-css-input") setView("lifecycle-home");
      else if (view === "recovery-css-input" || view === "recovery-entry-input")
        setView("recovery-home");
      else if (view === "search-input")
        setView(searchContext === "switch" ? "switch-search" : "main");
      else setView("main");
    });
  } else if (isDetailView) {
    if (view === "details" && project?.status === "empty") {
      addFooterAction("install", "i", "Install only", () => void beginMutation("install"), {
        variant: "primary",
      });
      addFooterAction(
        "use",
        "u",
        "Use & connect",
        () => void beginMutation("use", undefined, { skills: true }),
      );
      addFooterAction(
        "use-no-skills",
        "n",
        "Use without skill setup",
        () => void beginMutation("use", undefined, { skills: false }),
      );
      addFooterAction("use-agent", "a", "Choose skill agent", openUseAgentInput);
    }
    if (
      view === "details" &&
      (project?.status === "connected" || project?.status === "installed") &&
      searchContext === "switch"
    ) {
      addFooterAction(
        "preview-switch",
        "w",
        "Preview switch",
        () => void beginMutation("switch", undefined, { returnView: "details" }),
        { variant: "primary", disabled: !inspection?.manifest },
      );
    }
    addFooterAction("back-from-details", "Esc / b", "Back", () => setView(detailReturnView));
  } else if (!projectLoading && view === "main") {
    if (project?.status === "error") {
      addFooterAction("retry-project", "p", "Retry project check", readProjectState, {
        variant: "primary",
      });
    } else if (project?.status === "installed") {
      addFooterAction("connect", "c", "Configure / connect", () => void beginMutation("connect"), {
        variant: "primary",
      });
      addFooterAction("refresh-project", "p", "Refresh local state", readProjectState);
    } else if (project?.status === "connected") {
      if (activeTab === "systems") {
        addFooterAction(
          "inspect-system",
          "d",
          "Inspect manifest",
          () => void openInspection(project.packageName, project.version),
        );
        addFooterAction("reconnect", "c", "Reconnect", () => void beginMutation("connect"), {
          variant: "primary",
        });
        addFooterAction("upgrade", "g", "Upgrade to exact version", openUpgradeInput);
        addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
      } else if (activeTab === "components") {
        if (componentError) {
          addFooterAction(
            "reload-components",
            "l",
            "Reload catalog",
            () => {
              setComponentError(null);
              setComponentCatalog(null);
              loadComponentCatalog(true);
            },
            { variant: "primary" },
          );
          addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
        } else {
          addFooterAction("required", "r", "Required", () => setComponentSection("required"), {
            active: componentSection === "required",
          });
          addFooterAction("optional", "o", "Optional", () => setComponentSection("optional"), {
            active: componentSection === "optional",
          });
          addFooterAction(
            "categories",
            "g",
            "Categories",
            () => setComponentSection("categories"),
            {
              active: componentSection === "categories",
            },
          );
          if ((componentCatalog?.extensions?.length ?? 0) > 0) {
            addFooterAction(
              "extensions",
              "x",
              "Extensions",
              () => {
                setComponentSection("extensions");
                setSelectedExtensionName(componentCatalog.extensions[0].name ?? null);
              },
              {
                active: componentSection === "extensions",
              },
            );
          }
          addFooterAction("reload-components", "l", "Reload", () => {
            setComponentError(null);
            setComponentCatalog(null);
            loadComponentCatalog(true);
          });
          addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
        }
      } else if (activeTab === "tokens") {
        if (tokenError) {
          addFooterAction(
            "reload-tokens",
            "l",
            "Reload catalog",
            () => {
              setTokenError(null);
              setTokenCatalog(null);
              loadTokenCatalog(true);
            },
            { variant: "primary" },
          );
          addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
        } else {
          const tokenGroups = Array.isArray(tokenCatalog?.groupNames)
            ? tokenCatalog.groupNames
            : [];
          addFooterAction("previous-group", "[", "Previous group", () => cycleTokenGroup(-1), {
            disabled: tokenGroups.length < 2,
          });
          addFooterAction("next-group", "]", "Next group", () => cycleTokenGroup(1), {
            disabled: tokenGroups.length < 2,
          });
          addFooterAction(
            "search-tokens",
            "/",
            "Filter names",
            () => {
              setTokenDraft(tokenQuery);
              setView("token-search");
            },
            { variant: "primary" },
          );
          addFooterAction("reload-tokens", "l", "Reload", () => {
            setTokenError(null);
            setTokenCatalog(null);
            loadTokenCatalog(true);
          });
          addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
        }
      } else {
        addFooterAction("run-check", "c", "Run check", () => void runCheckAction("check"), {
          variant: "primary",
        });
        addFooterAction("run-doctor", "d", "Run doctor", () => void runCheckAction("doctor"));
        addFooterAction("run-usage", "u", "Check usage", () => void runCheckAction("usage"));
        addFooterAction("check-css", "t", "Check CSS path", () => {
          setCssDraft("");
          setView("css-input");
        });
        addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
      }
    } else if (catalogLoaded) {
      const selected =
        catalogResults.find((item) => `${item.name}@${item.version}` === selectedSystemId) ??
        catalogResults[0];
      if (selected) {
        addFooterAction(
          "inspect-selection",
          "Enter",
          "Inspect selection",
          () => openSelectedResult(`${selected.name}@${selected.version}`),
          { variant: "primary" },
        );
      } else {
        addFooterAction(
          "browse-again",
          "b",
          "Browse catalog",
          () => void searchCatalog(searchQuery),
          {
            variant: "primary",
          },
        );
      }
      addFooterAction("search-catalog", "/", "Search catalog", () => {
        setSearchDraft(searchQuery);
        setView("search-input");
      });
      if (catalogLoaded) {
        addFooterAction(
          "refresh-catalog",
          "r",
          "Refresh",
          () => void searchCatalog(searchQuery, { refresh: true }),
        );
      }
    } else {
      addFooterAction(
        "browse-catalog",
        "b",
        "Browse catalog",
        () => void searchCatalog(searchQuery),
        {
          variant: "primary",
        },
      );
      addFooterAction("search-catalog", "s", "Search catalog", () => {
        setSearchDraft(searchQuery);
        setView("search-input");
      });
    }
  } else if (view === "manage-home") {
    addFooterAction("manage-lifecycle", "s", "System lifecycle", () => setView("lifecycle-home"), {
      variant: "primary",
    });
    addFooterAction("manage-skills", "k", "Skills", openSkills);
    addFooterAction("manage-update", "u", "Update prism-ds", () => setView("self-update-home"));
    addFooterAction("manage-recovery", "r", "Project recovery", openRecovery);
    addFooterAction("manage-back", "Esc", "Back", () => setView("main"));
  } else if (view === "lifecycle-home") {
    addFooterAction("switch-system", "w", "Switch system", beginSwitchSearch, {
      variant: "primary",
      disabled: !project?.packageName,
    });
    addFooterAction("remove-system", "x", "Remove system", () => void beginMutation("remove"), {
      disabled: !project?.packageName,
    });
    addFooterAction("lifecycle-css", "c", "Set CSS target", () => {
      setCssDraft(lifecycleCssPath);
      setView("lifecycle-css-input");
    });
    addFooterAction("lifecycle-back", "Esc", "Back to Manage", () => setView("manage-home"));
  } else if (view === "switch-search") {
    const selected =
      catalogResults.find((item) => `${item.name}@${item.version}` === selectedSystemId) ??
      catalogResults[0];
    addFooterAction(
      "inspect-switch-target",
      "Enter",
      "Inspect target",
      () => selected && openInspection(selected.name, selected.version, "lifecycle-home"),
      { variant: "primary", disabled: !selected || operationLock.current },
    );
    addFooterAction("search-switch-target", "/", "Search targets", () => {
      setSearchDraft(searchQuery);
      setView("search-input");
    });
    addFooterAction(
      "refresh-switch-targets",
      "r",
      "Refresh",
      () => void searchCatalog(searchQuery, { refresh: true, context: "switch" }),
    );
    addFooterAction("switch-search-back", "Esc", "Back", () => setView("lifecycle-home"));
  } else if (view === "skills-home") {
    addFooterAction(
      "skills-prism",
      "p",
      "Prism skills",
      () => {
        setSkillSection("prism");
        const first = skillsResult?.catalog?.find((entry) => entry.type === "prism");
        if (first) setSelectedSkillId(first.id);
      },
      { active: skillSection === "prism" },
    );
    addFooterAction(
      "skills-design",
      "d",
      "Design skills",
      () => {
        setSkillSection("design");
        const first = skillsResult?.catalog?.find((entry) => entry.type === "design");
        if (first) setSelectedSkillId(first.id);
      },
      { active: skillSection === "design" },
    );
    addFooterAction("skills-agent", "a", "Choose agent", openSkillAgentInput);
    addFooterAction(
      "skills-scope",
      "g",
      `${skillScope === "project" ? "Project" : "Global"} scope`,
      () => setSkillScope((scope) => (scope === "project" ? "global" : "project")),
    );
    addFooterAction("skills-reload", "l", "Reload inventory", () => void loadSkills("all"));
    addFooterAction("skills-add", "Enter", "Add skill", () => void beginSkillMutation("add"), {
      variant: "primary",
    });
    addFooterAction("skills-update", "u", "Update skill", () => void beginSkillMutation("update"));
    addFooterAction("skills-remove", "x", "Remove skill", () => void beginSkillMutation("remove"));
    addFooterAction("skills-back", "Esc", "Back to Manage", () => setView("manage-home"));
  } else if (view === "self-update-home") {
    addFooterAction("check-cli-update", "c", "Check now", () => void checkCliUpdateNow(), {
      variant: "primary",
    });
    addFooterAction("select-npm-manager", "n", "Use npm", () => setUpdateManager("npm"), {
      active: updateManager === "npm",
    });
    addFooterAction("select-pnpm-manager", "p", "Use pnpm", () => setUpdateManager("pnpm"), {
      active: updateManager === "pnpm",
    });
    addFooterAction(
      "update-local-cli",
      "l",
      "Preview local update",
      () => void beginCliUpdate({ ...(updateManager ? { manager: updateManager } : {}) }),
    );
    addFooterAction(
      "update-global-cli",
      "g",
      "Preview global update",
      () => {
        if (!updateManager) {
          setNotice({
            type: "warning",
            message: "Choose npm or pnpm first; global update context is never guessed.",
          });
          return;
        }
        void beginCliUpdate({ global: true, manager: updateManager });
      },
      { disabled: !updateManager },
    );
    addFooterAction("update-back", "Esc", "Back to Manage", () => setView("manage-home"));
  } else if (view === "recovery-home") {
    const selected = recoveryResult?.suggestions?.find((item) => item.id === recoveryActionId);
    addFooterAction("refresh-recovery", "r", "Refresh diagnosis", () => void loadRecovery(), {
      variant: "primary",
    });
    addFooterAction("recovery-css", "c", "Set CSS target", () => {
      setCssDraft(recoveryCssPath);
      setView("recovery-css-input");
    });
    addFooterAction("recovery-entry", "e", "Set entry target", () => {
      setCssDraft(recoveryEntry);
      setView("recovery-entry-input");
    });
    addFooterAction(
      "preview-recovery",
      "Enter",
      "Preview selected repair",
      () => selected && void beginRecoveryAction(selected),
      { disabled: !selected },
    );
    addFooterAction("recovery-back", "Esc", "Back to Manage", () => setView("manage-home"));
  }

  if (!projectLoading && view === "main") {
    addFooterAction("open-manage", "m", "Manage", openManage);
  }

  const footer = h(MouseLayout, { key: "footer", flexDirection: "column" }, [
    footerActions.length > 0 &&
      h(MouseLayout, { key: "action-buttons", flexDirection: "row", flexWrap: "wrap" }, [
        h(Heading, { key: "actions-heading", compact: true }, "Actions"),
        ...footerActions.map((action) =>
          h(KeyButton, {
            key: action.key,
            shortcut: action.shortcut,
            label: action.label,
            onActivate: action.onActivate,
            variant: action.variant,
            active: action.active,
            disabled: footerBusy || action.disabled,
            outlined: true,
            compact: footerCompact,
          }),
        ),
      ]),
    h(
      Text,
      { key: "exit-hint", dimColor: true, wrap: "wrap" },
      `${isInputView ? "Ctrl+C" : "q or Ctrl+C"} exit`,
    ),
  ]);

  return h(
    ThemeProvider,
    {
      mode: "dark",
      theme: { colors: { focus: { ring: "cyan", active: "cyan" }, status: { info: "cyan" } } },
    },
    h(MouseLayout, { flexDirection: "column", width: "100%", paddingX: compact ? 0 : 1 }, [
      h(
        MouseLayout,
        {
          key: "masthead",
          flexDirection: compact ? "column" : "row",
          justifyContent: "space-between",
          flexWrap: "wrap",
        },
        [
          h(Heading, { key: "brand" }, "PRISM DS  /  CONSUMER TERMINAL"),
          !compact &&
            h(
              Text,
              { key: "target-label", dimColor: true, wrap: "wrap" },
              `TARGET  ${services.cwd}`,
            ),
        ],
      ),
      compact &&
        h(Text, { key: "target-compact", dimColor: true, wrap: "wrap" }, `TARGET  ${services.cwd}`),
      rule(undefined, "top-rule"),
      !tabsVisible &&
        view !== "confirm" &&
        line([h(MouseLayout, { key: "status" }, currentStatus)], {
          key: "project-status",
          marginBottom: 1,
          flexWrap: "wrap",
        }),
      tabsVisible &&
        h(MouseLayout, { key: "tabs", flexDirection: "column", marginBottom: 1 }, [
          line([h(MouseLayout, { key: "status" }, currentStatus)], {
            key: "project-status",
            marginBottom: 1,
            flexWrap: "wrap",
          }),
          h(Tabs, {
            key: "tab-control",
            tabs:
              columns < 48
                ? SYSTEM_TABS.map((tab, index) => ({
                    ...tab,
                    label: `${index + 1} ${["Sys", "Comp", "Tok", "Check"][index]}`,
                  }))
                : SYSTEM_TABS.map((tab, index) => ({ ...tab, label: `${index + 1} ${tab.label}` })),
            activeTabId: activeTab,
            onChange: selectTab,
            scope: "list",
          }),
        ]),
      view === "confirm" ? h(MouseLayout, { key: "confirm-title" }, rule("CHANGE PREVIEW")) : null,
      h(MouseLayout, { key: "main-content", flexDirection: "column" }, content),
      showActivity && rule("ACTIVITY", "activity-rule"),
      notice &&
        line(
          [
            statusBadge(notice.type, notice.type === "error" ? "Error" : notice.type, "status"),
            h(Text, { key: "notice", wrap: "wrap" }, notice.message),
          ],
          { key: "notice-row", flexWrap: "wrap" },
        ),
      view !== "confirm" && operationText,
      rule(undefined, "bottom-rule"),
      footer,
    ]),
  );
}

function TextInputCompat(props) {
  return h(RuneframeTextInput, props);
}

export default TuiApp;
