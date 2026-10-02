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

function managedFileEffectsOf(preview) {
  return (Array.isArray(preview?.plannedChanges) ? preview.plannedChanges : []).filter(
    (effect) => isRecord(effect) && MANAGED_FILE_KINDS.has(effect.kind),
  );
}

function managedFileKindLabel(kind) {
  if (kind === "root-agents") return "ROOT AGENTS";
  if (kind === "agents") return "AGENTS";
  return "CONFIG";
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

  const searchCatalog = useCallback(
    async (query, { refresh = false } = {}) => {
      if (operationLock.current) return;
      operationLock.current = true;
      const cleanQuery = typeof query === "string" ? query.trim() : "";
      setSearchQuery(cleanQuery);
      setCatalogError(null);
      setOperation({
        status: "loading",
        label: refresh ? "Refreshing catalog" : "Searching catalog",
      });
      setView("main");
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
    [services],
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
      const managedFiles = managedFileEffectsOf(pendingConfirmation?.preview);
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
      const managedFiles = managedFileEffectsOf(pendingConfirmation?.preview);
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
      const managedFiles = managedFileEffectsOf(pendingConfirmation?.preview);
      const currentFile = managedFiles[managedFileIndex] ?? managedFiles[0];
      if (!currentFile) return;
      const pageSize = managedFileViewportRows(rows);
      const lineCount = fileContentRows(currentFile, Math.max(8, columns - 8)).length;
      setManagedFileOffset(edge === "top" ? 0 : Math.max(0, lineCount - pageSize));
    },
    [columns, managedFileIndex, pendingConfirmation, rows],
  );

  const openInspection = useCallback(
    async (packageName, version) => {
      if (operationLock.current) return;
      operationLock.current = true;
      setInspection(null);
      setInspectionError(null);
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
    (kind, explicitVersion) => {
      if (kind === "connect") {
        if (!project?.packageName) return null;
        return { kind, packageName: project.packageName, strict: undefined };
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
      };
    },
    [inspection, project, upgradeVersion],
  );

  const beginMutation = useCallback(
    async (kind, explicitVersion) => {
      const action = actionForCurrentContext(kind, explicitVersion);
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
        setPendingConfirmation({ action, preview, returnView: view });
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

  const confirmMutation = useCallback(async () => {
    if (!pendingConfirmation || executeLock.current || operationLock.current) return;
    executeLock.current = true;
    operationLock.current = true;
    const { action, preview } = pendingConfirmation;
    setView("main");
    setPendingConfirmation(null);
    setShowManagedFileDetail(false);
    setOperation({ status: "loading", label: `Applying ${action.kind}` });
    try {
      const result = await services.executeMutation(action, preview);
      const refreshed = readProjectState();
      if (result?.ok) {
        setOperation({
          status: "success",
          label: `${action.kind[0].toUpperCase()}${action.kind.slice(1)} complete`,
          detail: "Local project state refreshed.",
        });
        setActiveTab("systems");
        setComponentCatalog(null);
        setComponentError(null);
        setTokenCatalog(null);
        setTokenError(null);
        if (refreshed?.status === "connected") setView("main");
      } else {
        const detail = failuresOf(result).join(" ") || "The change did not complete.";
        setOperation({
          status: "error",
          label: `${action.kind[0].toUpperCase()}${action.kind.slice(1)} failed`,
          detail,
        });
      }
    } catch (error) {
      const detail = messageOf(error);
      readProjectState();
      setOperation({ status: "error", label: `${action.kind} failed`, detail });
    } finally {
      operationLock.current = false;
      executeLock.current = false;
    }
  }, [pendingConfirmation, readProjectState, services]);

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

  useKeyHandler(
    (event) => {
      if (event.ctrl && event.key === "c") {
        exit();
        return true;
      }
      if (
        !["search-input", "token-search", "upgrade-input", "css-input"].includes(view) &&
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
        const managedFiles = managedFileEffectsOf(pendingConfirmation?.preview);
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
        view === "css-input"
      ) {
        return false;
      }
      if (event.escape) {
        if (view === "details" || view === "detail-loading") {
          setView(project?.status === "empty" ? "main" : "main");
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

      if (project?.status === "empty" && view === "main") {
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
          if (selected) void openInspection(selected.name, selected.version);
          return true;
        }
      } else if (project?.status === "empty" && view === "details") {
        if (event.key === "i") {
          void beginMutation("install");
          return true;
        }
        if (event.key === "u") {
          void beginMutation("use");
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
        selectedSystemId,
        catalogLoaded,
        catalogResults,
        notice,
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
      if (selected) void openInspection(selected.name, selected.version);
    },
    [catalogResults, openInspection],
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
        project?.status === "connected"
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
    const targetVersion = preview.version ?? action.version ?? project?.version;
    const effectRows = Array.isArray(preview.plannedChanges) ? preview.plannedChanges : [];
    const managedFiles = managedFileEffectsOf(preview);
    const upgradeLines = action.kind === "upgrade" ? getUpgradeDiffLines(preview.diff) : [];
    const command = commandText(preview.command);
    const isDependencyChange =
      action.kind === "install" || action.kind === "use" || action.kind === "upgrade";

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
          `${action.kind.toUpperCase()} · ${preview.packageName ?? action.packageName ?? project?.packageName}@${targetVersion ?? "unknown version"}`,
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
          onCancel: () => setView("main"),
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
    return null;
  };

  const isInputView = ["search-input", "token-search", "upgrade-input", "css-input"].includes(view);
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
    view === "confirm" && managedFileEffectsOf(pendingConfirmation?.preview).length > 0;
  const showActivity = Boolean(notice || (operation && view !== "confirm"));
  const footerBusy = operation?.status === "loading";
  const footerCompact = compact || rows < 30;
  const footerActions = [];
  const addFooterAction = (key, shortcut, label, onActivate, options = {}) => {
    footerActions.push({ key, shortcut, label, onActivate, ...options });
  };

  if (view === "confirm") {
    const managedFiles = managedFileEffectsOf(pendingConfirmation?.preview);
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
    } else {
      addFooterAction("check-css", "Enter", "Check this path", () => submitCssCheck(), {
        variant: "primary",
        disabled: !cssDraft.trim(),
      });
    }
    addFooterAction("cancel-input", "Esc", "Cancel", () => {
      if (view === "upgrade-input") setNotice(null);
      if (view === "css-input") setCssDraft("");
      setView("main");
    });
  } else if (isDetailView) {
    if (view === "details" && project?.status === "empty") {
      addFooterAction("install", "i", "Install only", () => void beginMutation("install"), {
        variant: "primary",
      });
      addFooterAction("use", "u", "Use & connect", () => void beginMutation("use"));
    }
    addFooterAction("back-from-details", "Esc", "Back", () => setView("main"));
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
