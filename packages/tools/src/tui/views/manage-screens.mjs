import { Text, useWindowSize } from "ink";
import { useState } from "react";
import { Button, List, ModalDialog, MouseLayout, useKeyHandler } from "runeframe";
import { skillAgentIdsFor } from "../utils/constants.mjs";
import { InlineTaskActions } from "../components/InlineTaskActions.mjs";
import { displayValue, failuresOf, isRecord } from "../utils/format.mjs";
import { Heading, h, keyValue, line, paragraph, statusBadge } from "../primitives.mjs";

function inlineActions(props, keys) {
  return h(InlineTaskActions, {
    key: keys.join("-"),
    actions: props.screenActions,
    keys,
    focusedKey: props.focusedFooterAction,
    onFocusChange: props.setFocusedFooterAction,
    busy: props.operation?.status === "loading",
  });
}

function SkillDetailsDialog({
  skill,
  installed,
  agents,
  inventoryWarnings,
  inventoryComplete,
  selectedAgent,
  setSelectedAgent,
  scope,
  setScope,
  onMutation,
  onRefresh,
  onClose,
}) {
  const { columns = 80, rows = 24 } = useWindowSize();
  const compact = columns < 54 || rows < 19;
  const [focusedControl, setFocusedControl] = useState(() =>
    agents.length > 0 ? "agent" : "scope",
  );
  const chooseAgent = () => {
    if (agents.length === 0) return;
    const index = agents.indexOf(selectedAgent);
    setSelectedAgent(agents[(index + 1) % agents.length]);
  };
  const toggleScope = () => setScope((value) => (value === "project" ? "global" : "project"));
  const action = installed ? "update" : "add";
  const externallyManaged = Boolean(installed && installed.managed !== true);
  const sourceConflict = Boolean(
    installed?.sourceConflict ||
    installed?.conflict ||
    (installed?.source && skill.source && installed.source !== skill.source),
  );
  const updateBlocked = Boolean(
    installed?.modified ||
    installed?.drift ||
    sourceConflict ||
    installed?.sourceConflict ||
    installed?.conflict,
  );
  const mutationAllowed = Boolean(selectedAgent) && inventoryComplete && !externallyManaged;
  const mutationMayBeOffered = inventoryComplete && !externallyManaged;
  const mutationLabel = installed ? "Update" : "Install";
  const controlSpecs = [
    mutationMayBeOffered && {
      key: "agent",
      label: compact ? (selectedAgent ?? "choose") : `Agent: ${selectedAgent ?? "Choose"}`,
      onActivate: chooseAgent,
      variant: selectedAgent ? "default" : "primary",
    },
    {
      key: "scope",
      label: compact ? scope : `Scope: ${scope}`,
      onActivate: toggleScope,
    },
    mutationMayBeOffered &&
      !updateBlocked && {
        key: "mutate",
        shortcut: "i",
        label: compact ? mutationLabel : `${mutationLabel} (preview)`,
        onActivate: () => mutationAllowed && onMutation(action),
        disabled: !mutationAllowed,
        variant: "primary",
      },
    mutationMayBeOffered &&
      !sourceConflict &&
      installed?.managed === true && {
        key: "remove",
        shortcut: "x",
        label: "Remove",
        onActivate: () => mutationAllowed && onMutation("remove"),
        disabled: !mutationAllowed,
        variant: "danger",
      },
    !compact && { key: "close", label: "Close", onActivate: onClose },
    !compact && { key: "refresh", label: "Refresh inventory", onActivate: onRefresh },
  ].filter(Boolean);
  const controlKeys = controlSpecs.map((control) => control.key);
  useKeyHandler(
    (event) => {
      if (event.key === "Tab" || event.key === "tab" || event.key === "\t") {
        const index = controlKeys.indexOf(focusedControl);
        const delta = event.shift ? -1 : 1;
        const next = (index + delta + controlKeys.length) % controlKeys.length;
        setFocusedControl(controlKeys[next]);
        return true;
      }
      if (event.enter || event.key === " ") {
        const focused = controlSpecs.find((control) => control.key === focusedControl);
        if (focused && !focused.disabled) {
          focused.onActivate();
          return true;
        }
      }
      if (event.key === "a") {
        chooseAgent();
        return true;
      }
      if (event.key === "g") {
        toggleScope();
        return true;
      }
      if (event.key === "r") {
        onRefresh();
        return true;
      }
      if (event.key === "i" && focusedControl === "mutate" && mutationAllowed && !updateBlocked) {
        onMutation(action);
        return true;
      }
      // Enter belongs to the focused Button. A global Enter handler here could
      // turn focus on Scope, Agent, or Close into an install/update request.
      if (mutationAllowed && !updateBlocked && installed && event.key === "u") {
        onMutation(action);
        return true;
      }
      if (mutationAllowed && installed && !sourceConflict && event.key === "x") {
        onMutation("remove");
        return true;
      }
      return false;
    },
    "modal",
    {
      priority: 150,
      deps: [
        mutationAllowed,
        installed,
        action,
        updateBlocked,
        sourceConflict,
        focusedControl,
        controlKeys.join("/"),
      ],
    },
  );
  const controls = controlSpecs.map((control) => {
    const focused = control.key === focusedControl;
    return h(
      Button,
      {
        key: control.key,
        focused,
        disabled: control.disabled,
        variant: control.variant,
        onActivate: () => {
          setFocusedControl(control.key);
          control.onActivate();
        },
      },
      `${focused ? "> " : "  "}[${control.shortcut ?? { agent: "a", scope: "g", close: "Esc", refresh: "r" }[control.key] ?? ""}] ${control.label}`,
    );
  });
  return h(ModalDialog, {
    title: skill.skill,
    width: Math.max(28, Math.min(64, columns - 2)),
    onClose,
    footer: [],
    children: paragraph([
      (!inventoryComplete || externallyManaged || updateBlocked || inventoryWarnings?.length > 0) &&
        h(
          Text,
          { key: "warnings", color: "yellow", wrap: "wrap" },
          compact
            ? [
                externallyManaged && "Unmanaged; overwrite/remove unavailable",
                !inventoryComplete && "Inventory incomplete; changes unavailable",
                installed?.modified && "Modified; removal may discard edits",
                installed?.drift && "Drifted; removal may discard extra files",
                sourceConflict && "Source changed; update/remove unavailable",
                (installed?.sourceConflict || installed?.conflict) &&
                  "Reported source conflict; changes unavailable",
                inventoryWarnings?.length > 0 && inventoryWarnings.join(" "),
              ]
                .filter(Boolean)
                .join(" · ")
            : [
                externallyManaged && "Unmanaged: overwrite/remove unavailable",
                !inventoryComplete && "Incomplete inventory: all mutations unavailable",
                installed?.modified && "Modified: removal preview may discard local edits",
                installed?.drift && "Drifted: removal preview may discard untracked placements",
                sourceConflict && "Source changed: update/remove unavailable",
                (installed?.sourceConflict || installed?.conflict) &&
                  "Reported source conflict: changes unavailable",
                inventoryWarnings?.length > 0 && `Inventory: ${inventoryWarnings.join(" ")}`,
              ]
                .filter(Boolean)
                .join(" · "),
        ),
      !compact &&
        h(Text, { key: "identity", wrap: "wrap" }, `${skill.id} · ${skill.role} · ${skill.type}`),
      !compact &&
        h(
          Text,
          { key: "selection", wrap: "wrap" },
          compact
            ? `Agent ${selectedAgent ?? "choose"} · ${scope}`
            : `Agent: ${selectedAgent ?? "not selected"}  ·  Scope: ${scope}`,
        ),
      !compact &&
        h(
          Text,
          { key: "installed", wrap: "wrap" },
          installed
            ? `${installed.managed ? "Managed" : "External/unmanaged"}${installed.modified ? " · modified" : ""}${installed.drift ? " · drifted" : ""}`
            : inventoryComplete
              ? "Not installed"
              : "Install state unknown (incomplete inventory)",
        ),
      h(
        Text,
        { key: "safety", dimColor: true, wrap: "wrap" },
        compact
          ? "Review preview; confirm before writes."
          : "Preview first; confirmation is required.",
      ),
      h(MouseLayout, { key: "controls", flexDirection: "row", flexWrap: "wrap" }, controls),
      !compact &&
        h(
          Text,
          { key: "description", wrap: "wrap" },
          installed?.description ||
            skill.description ||
            "No description is published for this skill.",
        ),
      !compact &&
        h(
          Text,
          { key: "source", wrap: "wrap" },
          `Source: ${skill.source ?? "not reported"} · Publisher: ${skill.publisher ?? "not reported"} · Trust: ${skill.reviewStatus ?? "not reported"}`,
        ),
      installed?.placements?.length > 0 &&
        h(
          Text,
          { key: "paths", wrap: "wrap" },
          `Paths: ${installed.placements.map((placement) => placement.relativePath).join(", ")}`,
        ),
      !installed &&
        h(
          Text,
          { key: "paths", dimColor: true, wrap: "wrap" },
          inventoryComplete
            ? "No paths observed in this scope."
            : "Installation status is unknown; inventory is incomplete.",
        ),
    ]),
  });
}

export function renderManageHome(props) {
  const { startupUpdate, project, compact } = props;
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
        inlineActions(props, ["manage-lifecycle"]),
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
        inlineActions(props, ["manage-skills"]),
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
        inlineActions(props, ["manage-update"]),
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
        inlineActions(props, ["manage-recovery"]),
      ],
      { key: "recovery", marginTop: 1 },
    ),
  ]);
}

export function renderLifecycleHome(props) {
  const { project, lifecycleCssPath, compact } = props;
  return paragraph([
    h(Heading, { key: "title" }, "System lifecycle"),
    h(
      Text,
      { key: "copy", wrap: "wrap" },
      "Switch scans actual consumer usage and blocks unsupported literal references. It does not rewrite component structure or props. Remove is separate and refuses while active references remain.",
    ),
    inlineActions(props, ["switch-system"]),
    project?.packageName &&
      keyValue("CURRENT", `${project.packageName}@${project.version}`, {
        compact,
        key: "current",
      }),
    paragraph(
      [
        h(
          Text,
          { key: "remove-copy", wrap: "wrap" },
          "Removal is separate and checks active references before planning.",
        ),
        inlineActions(props, ["remove-system"]),
      ],
      { key: "remove-control", marginTop: 1 },
    ),
    !project?.packageName &&
      !compact &&
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
    paragraph(
      [
        lifecycleCssPath && keyValue("EXPLICIT CSS", lifecycleCssPath, { compact, key: "css" }),
        h(
          Text,
          { key: "css-copy", dimColor: true, wrap: "wrap" },
          "Name a CSS file only when you want to include it in the plan.",
        ),
        inlineActions(props, ["lifecycle-css"]),
      ],
      { key: "css-control", marginTop: 1 },
    ),
  ]);
}

function SkillCatalogList({ items, selectedId, onSelect, onActivate }) {
  const { columns = 80, rows = 24 } = useWindowSize();
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const visibleCount = Math.max(1, Math.min(items.length, rows - (columns < 58 ? 11 : 14)));
  const firstVisible = Math.max(
    0,
    Math.min(selectedIndex - visibleCount + 1, items.length - visibleCount),
  );
  const visibleItems = items.slice(firstVisible, firstVisible + visibleCount);
  useKeyHandler(
    (event) => {
      if (items.length === 0) return false;
      const currentIndex = Math.max(
        0,
        items.findIndex((item) => item.id === selectedId),
      );
      if (["ArrowDown", "down", "j"].includes(event.key)) {
        onSelect(items[(currentIndex + 1) % items.length].id);
        return false;
      }
      if (["ArrowUp", "up", "k"].includes(event.key)) {
        onSelect(items[(currentIndex - 1 + items.length) % items.length].id);
        return false;
      }
      if (event.enter) {
        onActivate(selectedId ?? items[currentIndex].id);
        return true;
      }
      return false;
    },
    "list",
    { priority: 120, deps: [items, selectedId, onSelect, onActivate] },
  );
  return h(
    MouseLayout,
    { flexDirection: "column", width: "100%" },
    visibleItems.map((item) =>
      h(
        MouseLayout,
        { key: item.id, width: "100%" },
        h(
          Button,
          {
            onActivate: () => {
              onSelect(item.id);
              onActivate(item.id);
            },
            variant: item.id === selectedId ? "primary" : "ghost",
          },
          h(
            Text,
            { bold: item.id === selectedId, wrap: "truncate-end" },
            `${item.id === selectedId ? "› " : "  "}${item.label}`,
          ),
        ),
      ),
    ),
  );
}

export function renderSkillsHome(props) {
  const {
    skillsResult,
    skillSection,
    selectedSkillId,
    skillScope,
    selectedSkillAgent,
    skillDialogOpen,
    skillsLoading,
    services,
    setSelectedSkillId,
    setSkillSection,
    setSkillScope,
    setSelectedSkillAgent,
    setSkillDialogOpen,
    beginSkillMutation,
    loadSkills,
  } = props;
  const catalog = Array.isArray(skillsResult?.catalog) ? skillsResult.catalog : [];
  const entries = catalog.filter((entry) => entry.type === skillSection);
  const selected = entries.find((entry) => entry.id === selectedSkillId) ?? entries[0] ?? null;
  const installed = selected
    ? ((Array.isArray(skillsResult?.installed) ? skillsResult.installed : []).find(
        (item) =>
          item.scope === skillScope &&
          (item.catalogId === selected.id || item.name === selected.skill),
      ) ?? null)
    : null;
  const agents = skillAgentIdsFor(services);
  const openSkill = (id) => {
    setSelectedSkillId(id);
    setSkillDialogOpen(true);
  };
  const startMutation = (action) => {
    setSkillDialogOpen(false);
    void beginSkillMutation(action);
  };
  const items = entries.map((entry) => {
    const present = (Array.isArray(skillsResult?.installed) ? skillsResult.installed : []).find(
      (item) =>
        item.scope === skillScope && (item.catalogId === entry.id || item.name === entry.skill),
    );
    const state = present
      ? present.modified
        ? "MODIFIED"
        : present.drift
          ? "DRIFTED"
          : present.managed
            ? "INSTALLED"
            : "EXTERNAL"
      : skillsResult?.ok === true
        ? "NOT INSTALLED"
        : "STATUS UNKNOWN";
    return {
      id: entry.id,
      label: `${state}  ${entry.skill}`,
      description: [entry.role, entry.reviewStatus, entry.description].filter(Boolean).join(" · "),
    };
  });
  const skillDialog =
    selected &&
    h(SkillDetailsDialog, {
      skill: selected,
      installed,
      agents,
      inventoryWarnings: Array.isArray(skillsResult?.failures) ? skillsResult.failures : [],
      inventoryComplete: skillsResult?.ok === true,
      selectedAgent: selectedSkillAgent,
      setSelectedAgent: setSelectedSkillAgent,
      scope: skillScope,
      setScope: setSkillScope,
      onMutation: startMutation,
      onRefresh: () => void loadSkills("all"),
      onClose: () => setSkillDialogOpen(false),
    });
  if (skillDialogOpen && skillDialog) return skillDialog;
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
    h(MouseLayout, { key: "skill-controls", flexDirection: "row", flexWrap: "wrap" }, [
      h(
        Button,
        {
          key: "prism",
          onActivate: () => setSkillSection("prism"),
          variant: skillSection === "prism" ? "primary" : "default",
        },
        "[p] Prism skills",
      ),
      h(
        Button,
        {
          key: "design",
          onActivate: () => setSkillSection("design"),
          variant: skillSection === "design" ? "primary" : "default",
        },
        "[d] Design skills",
      ),
      h(
        Button,
        {
          key: "scope",
          onActivate: () => setSkillScope((scope) => (scope === "project" ? "global" : "project")),
        },
        `[g] Scope: ${skillScope}`,
      ),
      h(
        Button,
        { key: "reload", onActivate: () => void loadSkills("all") },
        "[l] Refresh inventory",
      ),
    ]),
    h(
      Text,
      { key: "count", dimColor: true },
      `${entries.length} catalog skills · ${Array.isArray(skillsResult?.installed) ? skillsResult.installed.filter((item) => item.scope === skillScope).length : 0} observed in this scope`,
    ),
    entries.length > 0 &&
      h(SkillCatalogList, {
        key: `skill-list-${skillSection}`,
        items,
        selectedId: selectedSkillId ?? undefined,
        onSelect: setSelectedSkillId,
        onActivate: openSkill,
      }),
    entries.length === 0 &&
      h(
        Text,
        { key: "none", dimColor: true },
        skillsLoading ? "Loading catalog…" : "No skills are listed in this section.",
      ),
    selected &&
      h(
        Text,
        { key: "open-hint", dimColor: true },
        "Enter or click a skill to view details and install options.",
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
}

export function renderSelfUpdateHome(props) {
  const { startupUpdate, updateManager, compact } = props;
  const result = startupUpdate?.result;
  const installation = isRecord(result?.installation) ? result.installation : {};
  const kind = installation.kind ?? "unknown";
  const hasAvailableUpdate = result?.available === true && result?.skipped !== true;
  const localInstallAvailable =
    kind === "local" && installation.verified === true && hasAvailableUpdate;
  const canUpdateLocally = localInstallAvailable && Boolean(installation.manager || updateManager);
  const needsLocalManager = localInstallAvailable && !installation.manager && !updateManager;
  const canUpdateGlobally =
    kind === "global" && installation.verified === true && hasAvailableUpdate;
  const canOfferExplicitGlobal =
    hasAvailableUpdate && (kind !== "global" || installation.verified !== true);
  const needsGlobalManager = (canUpdateGlobally || canOfferExplicitGlobal) && !updateManager;
  const globalManagerIsSeparate =
    canOfferExplicitGlobal && localInstallAvailable && Boolean(installation.manager);
  const showGlobalManagerChoice =
    (canUpdateGlobally || canOfferExplicitGlobal) &&
    (!localInstallAvailable || globalManagerIsSeparate);
  const unsupportedContext = ["unknown", "source", "ephemeral", "workspace"].includes(kind);
  const updateStatus = startupUpdate?.loading
    ? statusBadge("info", "Checking in background", "check")
    : result?.skipped
      ? statusBadge("neutral", "Check skipped", "check")
      : result?.available
        ? statusBadge("warning", "Update available", "check")
        : result?.ok
          ? statusBadge("success", "Up to date", "check")
          : statusBadge("neutral", "Not checked", "check");
  return paragraph([
    h(Heading, { key: "title" }, "Update prism-ds"),
    !compact &&
      h(
        Text,
        { key: "scope", wrap: "truncate-end" },
        "Update the prism-ds CLI only. This does not upgrade your design system.",
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
    localInstallAvailable &&
      paragraph(
        [
          h(Text, { key: "local-copy", bold: true }, "UPDATE THIS LOCAL INSTALL"),
          needsLocalManager &&
            h(
              Text,
              { key: "local-manager-required", wrap: "wrap" },
              "No package manager was detected. Choose one explicitly to continue.",
            ),
          localInstallAvailable &&
            !installation.manager &&
            inlineActions(props, ["select-npm-manager", "select-pnpm-manager"]),
          localInstallAvailable &&
            !installation.manager &&
            h(
              Text,
              { key: "local-manager-state", dimColor: true },
              `Selected manager: ${updateManager ?? "none"}.`,
            ),
          canUpdateLocally && inlineActions(props, ["update-local-cli"]),
          h(
            Text,
            { key: "local-help", dimColor: true, wrap: "wrap" },
            updateManager && !installation.manager
              ? `Selected ${updateManager}. Choose npm or pnpm here at any time; preview before confirming.`
              : "Preview the exact command; nothing changes until you confirm.",
          ),
        ],
        { key: "local-update", marginTop: 1 },
      ),
    canUpdateGlobally &&
      paragraph(
        [
          h(Text, { key: "global-copy", bold: true }, "UPDATE THIS GLOBAL INSTALL"),
          showGlobalManagerChoice &&
            inlineActions(props, ["select-npm-manager", "select-pnpm-manager"]),
          showGlobalManagerChoice &&
            h(
              Text,
              { key: "global-manager-state", dimColor: true, wrap: "wrap" },
              `Global target manager: ${updateManager ?? "choose"}${installation.manager ? ` · detected local manager ${installation.manager} stays local` : ""}.`,
            ),
          inlineActions(props, ["update-global-cli"]),
          h(
            Text,
            { key: "global-help", dimColor: true, wrap: "wrap" },
            needsGlobalManager
              ? "Choose npm or pnpm explicitly before previewing."
              : `Using ${updateManager}; confirm the exact command before applying.`,
          ),
        ],
        { key: "global-update", marginTop: 1 },
      ),
    canOfferExplicitGlobal &&
      paragraph(
        [
          h(
            Text,
            { key: "global-copy", bold: true },
            compact
              ? kind === "global"
                ? "OPTIONAL GLOBAL PLAN · MAY INSTALL · VERIFY"
                : "GLOBAL ≠ THIS COPY · MAY INSTALL · VERIFY"
              : "OPTIONAL: TARGET A GLOBAL INSTALL",
          ),
          showGlobalManagerChoice &&
            inlineActions(props, ["select-npm-manager", "select-pnpm-manager"]),
          showGlobalManagerChoice &&
            h(
              Text,
              { key: "optional-global-manager-state", dimColor: true, wrap: "wrap" },
              `Global target manager: ${updateManager ?? "choose"}${installation.manager && localInstallAvailable ? ` · local install remains on ${installation.manager}` : ""}.`,
            ),
          globalManagerIsSeparate &&
            h(
              Text,
              { key: "global-manager-separate", dimColor: true, wrap: "wrap" },
              `Detected ${installation.manager} is for the local install only; choose npm or pnpm here for the global target.`,
            ),
          localInstallAvailable &&
            !installation.manager &&
            h(
              Text,
              { key: "global-manager-shared", dimColor: true, wrap: "wrap" },
              "Choose a manager above; that explicit choice can also be used for the global target.",
            ),
          updateManager && inlineActions(props, ["update-global-cli"]),
          !compact &&
            h(
              Text,
              { key: "global-warning", wrap: "wrap" },
              "Explicit global scope; may target another install, install prism-ds if absent, or lack post-update verification.",
            ),
          needsGlobalManager &&
            h(
              Text,
              { key: "global-manager-required", dimColor: true },
              "Choose npm or pnpm before previewing.",
            ),
        ],
        { key: "global-update", marginTop: 1 },
      ),
    inlineActions(props, ["check-cli-update"]),
    unsupportedContext &&
      h(
        Text,
        { key: "advice", wrap: "wrap" },
        "Cannot safely update this copy here. Otherwise run `prism-ds self-update --check` from the intended install.",
      ),
    !unsupportedContext &&
      h(
        Text,
        { key: "advice", dimColor: true, wrap: "wrap" },
        (result?.skipped
          ? (result.advice ?? "The update check was skipped; no version comparison was made.")
          : result?.advice) ??
          "Run Check now to read the latest release. Nothing installs until you review and confirm.",
      ),
    paragraph(
      [
        h(Text, { key: "install-context", bold: true }, "INSTALL CONTEXT"),
        h(
          Text,
          { key: "install-kind", wrap: "wrap" },
          `${kind}${installation.verified === true ? " · verified" : " · not verified"}`,
        ),
        installation.manager &&
          h(
            Text,
            { key: "detected-manager", dimColor: true },
            `Detected manager: ${installation.manager}`,
          ),
      ],
      { key: "installation-context", marginTop: 1 },
    ),
    result?.available === false &&
      result?.ok &&
      !result?.skipped &&
      h(
        Text,
        { key: "no-update", dimColor: true, wrap: "wrap" },
        "No update is available. Check again later.",
      ),
  ]);
}

export function renderRecoveryHome(props) {
  const {
    recoveryResult,
    recoveryActionId,
    recoveryLoading,
    recoveryCssPath,
    recoveryEntry,
    compact,
    rows,
    setRecoveryActionId,
  } = props;
  const report = recoveryResult?.report;
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  const suggestions = Array.isArray(recoveryResult?.suggestions) ? recoveryResult.suggestions : [];
  const items = suggestions.map((suggestion, index) => ({
    id: suggestion.id,
    label: `${index + 1}  ${suggestion.executable === true ? "REPAIR" : "GUIDANCE"}  ${suggestion.label}`,
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
    inlineActions(props, ["refresh-recovery"]),
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
      h(Text, { key: "no-actions", dimColor: true }, "No repair actions are currently suggested."),
    suggestions.length > 0 &&
      h(
        Text,
        { key: "recovery-selection-hint", dimColor: true, wrap: "wrap" },
        "Press a number to select a suggestion. Enter previews only an applicable repair.",
      ),
    selected &&
      h(
        Text,
        { key: "selected-kind", dimColor: true, wrap: "wrap" },
        selected.executable === true
          ? "Enter to preview this repair. It will not run until you confirm its plan."
          : "Guidance only. No change will be run from this suggestion.",
      ),
    selected && inlineActions(props, ["preview-recovery"]),
    paragraph(
      [
        recoveryCssPath && keyValue("EXPLICIT CSS", recoveryCssPath, { compact, key: "css" }),
        h(
          Text,
          { key: "css-target-copy", dimColor: true, wrap: "wrap" },
          "Set a CSS target only when the diagnosis should inspect one.",
        ),
        inlineActions(props, ["recovery-css"]),
      ],
      { key: "recovery-css-controls", marginTop: 1 },
    ),
    paragraph(
      [
        recoveryEntry && keyValue("EXPLICIT ENTRY", recoveryEntry, { compact, key: "entry" }),
        h(
          Text,
          { key: "entry-target-copy", dimColor: true, wrap: "wrap" },
          "Set an entry target only when you want to check a specific export.",
        ),
        inlineActions(props, ["recovery-entry"]),
      ],
      { key: "recovery-entry-controls", marginTop: 1 },
    ),
  ]);
}
