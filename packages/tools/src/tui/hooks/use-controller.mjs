import { useCallback, useEffect, useRef, useState } from "react";
import { useModal } from "runeframe";
import { EXACT_VERSION } from "../utils/constants.mjs";
import {
  clearRememberedConfirmation,
  readRememberedConfirmation,
  rememberConfirmationForPreview,
} from "../utils/confirmation-resume.mjs";
import {
  displayValue,
  failuresOf,
  fileReviewEffectsOf,
  getUpgradeDiffLines,
  isRecord,
  messageOf,
} from "../utils/format.mjs";

/**
 * Normalize the backend self-update outcome into the fields the TUI can trust.
 * The live facade nests the real result under `result.result`; injected or
 * facade-shaped results may be flat. Verification is claimed only when the
 * backend actually reports a verified, changed installation.
 */
function describeSelfUpdate(result) {
  const outcome = isRecord(result?.result) ? result.result : isRecord(result) ? result : {};
  const state =
    typeof outcome.state === "string"
      ? outcome.state
      : typeof result?.state === "string"
        ? result.state
        : null;
  const changed = result?.changed === true || outcome.changed === true;
  const partial =
    result?.partial === true ||
    outcome.partial === true ||
    state === "unverified" ||
    state === "verify-mismatch" ||
    state === "manager-failed";
  const verified =
    changed &&
    !partial &&
    (state === "verified" ||
      outcome.postVerify?.verified === true ||
      outcome.verified === true ||
      result?.verified === true);
  const installedVersion = verified
    ? typeof outcome.installedVersion === "string"
      ? outcome.installedVersion
      : typeof outcome.postVerify?.installedVersion === "string"
        ? outcome.postVerify.installedVersion
        : typeof result?.installedVersion === "string"
          ? result.installedVersion
          : null
    : null;
  return {
    outcome,
    state,
    changed,
    partial,
    verified,
    installedVersion,
    noChange:
      result?.ok === true && !changed && !partial && (state === null || state === "up-to-date"),
    targetVersion:
      typeof outcome.targetVersion === "string"
        ? outcome.targetVersion
        : typeof result?.targetVersion === "string"
          ? result.targetVersion
          : typeof outcome.plan?.targetVersion === "string"
            ? outcome.plan.targetVersion
            : null,
    currentVersion:
      typeof outcome.currentVersion === "string"
        ? outcome.currentVersion
        : typeof result?.currentVersion === "string"
          ? result.currentVersion
          : typeof outcome.plan?.currentVersion === "string"
            ? outcome.plan.currentVersion
            : null,
    advice:
      typeof outcome.advice === "string"
        ? outcome.advice
        : typeof result?.advice === "string"
          ? result.advice
          : typeof outcome.plan?.advice === "string"
            ? outcome.plan.advice
            : null,
  };
}

export function useTuiController(services) {
  const { openModal, isOpen: isModalOpen } = useModal();
  const [restoredConfirmation] = useState(() => readRememberedConfirmation(services));

  const [project, setProject] = useState(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState(null);
  const [view, setView] = useState(() => restoredConfirmation?.view ?? "main");
  const [activeTab, setActiveTab] = useState("systems");
  const [searchContext, setSearchContext] = useState("catalog");
  const [detailReturnView, setDetailReturnView] = useState("main");
  const [componentSection, setComponentSection] = useState("required");
  const [selectedComponentName, setSelectedComponentName] = useState(null);
  const [componentCatalog, setComponentCatalog] = useState(null);
  const [componentError, setComponentError] = useState(null);
  const [selectedExtensionName, setSelectedExtensionName] = useState(null);
  const [tokenCatalog, setTokenCatalog] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [tokenGroup, setTokenGroup] = useState(null);
  const [tokenQuery, setTokenQuery] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [iconCatalog, setIconCatalog] = useState(null);
  const [iconError, setIconError] = useState(null);
  const [iconQuery, setIconQuery] = useState("");
  const [iconDraft, setIconDraft] = useState("");
  const [selectedIconName, setSelectedIconName] = useState(null);
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
  const [pendingConfirmation, setPendingConfirmation] = useState(
    () => restoredConfirmation?.pendingConfirmation ?? null,
  );
  const [footerActionPage, setFooterActionPage] = useState(0);
  const [startupUpdate, setStartupUpdate] = useState(null);
  const [skillsResult, setSkillsResult] = useState(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillSection, setSkillSection] = useState("prism");
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
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
  const footerPageCountRef = useRef(1);

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
        // No query is a complete scope listing; a query is ranked search. Keep
        // the listing cap at the registry contract maximum so a newly published
        // system cannot be hidden by a small page.
        const result = await services.searchSystems({
          query: cleanQuery,
          size: cleanQuery ? 50 : 250,
        });
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
        const warnings = Array.isArray(result.warnings) ? result.warnings : [];
        setOperation({
          status: "success",
          label: `${results.length} catalog result${results.length === 1 ? "" : "s"}`,
          detail:
            warnings.length > 0
              ? warnings[0]
              : cleanQuery
                ? result.source === "exact"
                  ? "Exact package resolved from its published packument."
                  : `Query: ${cleanQuery}`
                : result.source === "search"
                  ? "Ranked search index used; some published packages may be missing."
                  : "Supported systems loaded from the registry scope index.",
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

  const loadIconCatalog = useCallback(
    (force = false) => {
      if (!force && (iconCatalog || iconError)) return;
      try {
        const result = services.listIcons({});
        if (!result?.ok) {
          setIconError(failuresOf(result).join(" ") || "Icon catalog could not be read.");
          return;
        }
        setIconCatalog(result);
        const firstAvailable = Array.isArray(result.icons)
          ? result.icons.find((icon) => icon?.available === true)
          : null;
        setSelectedIconName(firstAvailable?.name ?? null);
      } catch (error) {
        setIconError(messageOf(error));
      }
    },
    [iconCatalog, iconError, services],
  );

  const selectTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      setNotice(null);
      if (tab === "components") loadComponentCatalog();
      if (tab === "tokens") loadTokenCatalog();
      if (tab === "icons") loadIconCatalog();
    },
    [loadComponentCatalog, loadIconCatalog, loadTokenCatalog],
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

  const openManagedFilePreview = useCallback(() => {
    if (!pendingConfirmation) return;
    const files = fileReviewEffectsOf(pendingConfirmation);
    if (files.length === 0) return;
    rememberConfirmationForPreview(services, pendingConfirmation);
    openModal("change-preview", {
      kind: "managed-files",
      files,
    });
  }, [openModal, pendingConfirmation, services]);

  const openManifestDiffPreview = useCallback(() => {
    if (!pendingConfirmation || pendingConfirmation.action.kind !== "upgrade") return;
    const { action, preview } = pendingConfirmation;
    rememberConfirmationForPreview(services, pendingConfirmation);
    openModal("change-preview", {
      kind: "manifest-diff",
      lines: getUpgradeDiffLines(preview.diff),
      packageName: preview.packageName ?? action.packageName ?? project?.packageName,
      fromVersion: project?.version,
      toVersion: preview.version ?? action.version ?? project?.version,
    });
  }, [openModal, pendingConfirmation, project, services]);

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
    clearRememberedConfirmation(services);
    if (pendingConfirmation.type === "skill") setSkillDialogOpen(false);
    setView(pendingConfirmation.returnView);
    setPendingConfirmation(null);
    setOperation({ status: "neutral", label: "Cancelled · nothing was changed" });
  }, [pendingConfirmation, services]);

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
      setOperation({ status: "loading", label: "Checking CLI update" });
      try {
        const preview = await services.previewCliUpdate(options);
        if (!preview?.ok) {
          const details = [
            ...failuresOf(preview),
            ...failuresOf(preview?.plan),
            ...failuresOf(preview?.result),
            preview?.advice,
            preview?.plan?.advice,
            preview?.result?.advice,
          ].filter(Boolean);
          const detail =
            [...new Set(details)].join(" ") ||
            "This prism-ds installation cannot be safely updated from the current context.";
          setOperation({ status: "warning", label: "CLI update is not available here", detail });
          setNotice({ type: "warning", message: detail });
          return;
        }
        // The live preview reports availability inside its plan; older facade
        // shapes may carry it at the top level. Explicit true is required.
        const updateAvailable = preview.updateAvailable ?? preview.plan?.updateAvailable;
        if (updateAvailable !== true || preview.state === "up-to-date") {
          const detail =
            preview?.advice ??
            preview?.plan?.advice ??
            `prism-ds ${displayValue(preview?.currentVersion ?? preview?.plan?.currentVersion)} is up to date.`;
          setOperation({ status: "success", label: "No CLI update needed", detail });
          return;
        }
        const action = { options };
        // Keep the whole accepted preview: execute revalidates it and must
        // receive exactly what was reviewed, not a reconstructed subset.
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
          message: suggestion
            ? `Guidance only. ${suggestion.reason ?? "Review its command; the TUI will not run it."}`
            : "This suggestion is guidance only. Review its command; the TUI will not run it.",
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
    clearRememberedConfirmation(services);
    setView(type === "mutation" ? "main" : returnView);
    setPendingConfirmation(null);
    setOperation({
      status: "loading",
      label:
        type === "mutation"
          ? `Applying ${action.kind}`
          : type === "self-update"
            ? "Installing CLI update"
            : `Applying ${type}`,
    });
    try {
      let result;
      if (type === "skill") result = await services.executeSkillMutation(action, preview);
      else if (type === "self-update") {
        result = await services.executeCliUpdate(action.options, preview);
      } else if (type === "recovery") {
        result = await services.executeRecoveryAction(action, preview);
      } else result = await services.executeMutation(action, preview);

      const selfUpdate = type === "self-update" ? describeSelfUpdate(result) : null;
      const applied =
        result?.applied === true ||
        result?.actionCompleted === true ||
        result?.changed === true ||
        result?.result?.executed === true;
      const recoveryIncomplete =
        type === "recovery" &&
        result?.actionCompleted === true &&
        (result.repaired !== true || result.healthy !== true);
      const skillNoChange =
        type === "skill" &&
        result?.ok === true &&
        !applied &&
        (result.changed === false ||
          result.result?.reason === "noop" ||
          result.result?.noop === true);
      const partial =
        result?.partial === true ||
        result?.result?.partial === true ||
        result?.state === "unverified" ||
        selfUpdate?.partial === true ||
        recoveryIncomplete;
      const failureNotes = failuresOf(result);
      const nestedFailureNotes =
        type === "self-update"
          ? failuresOf(result?.result).filter((message) => !failureNotes.includes(message))
          : [];
      const notes = [
        ...failureNotes,
        ...nestedFailureNotes,
        typeof result?.result?.note === "string" ? result.result.note : null,
        typeof result?.note === "string" ? result.note : null,
      ].filter(Boolean);
      if (selfUpdate?.changed) {
        notes.push("Restart prism-ds to use the updated CLI.");
      }

      if (type === "mutation") {
        const refreshed = readProjectState();
        setActiveTab("systems");
        setComponentCatalog(null);
        setComponentError(null);
        setTokenCatalog(null);
        setTokenError(null);
        setIconCatalog(null);
        setIconError(null);
        setSearchContext("catalog");
        if (applied || result?.ok === true) setView("main");
        else setView(returnView);
        if (refreshed?.status === "connected") setView("main");
      } else if (type === "skill") {
        void loadSkills("all");
      } else if (type === "recovery") {
        void loadRecovery();
      } else if (type === "self-update" && selfUpdate?.verified) {
        const version = selfUpdate.installedVersion ?? selfUpdate.targetVersion ?? null;
        setStartupUpdate((current) => {
          const prior = isRecord(current?.result) ? current.result : {};
          const installation = isRecord(selfUpdate.outcome.plan?.installation)
            ? selfUpdate.outcome.plan.installation
            : prior.installation;
          return {
            loading: false,
            result: {
              ...prior,
              ok: true,
              available: false,
              skipped: false,
              current: version,
              latest: version,
              ...(installation ? { installation } : {}),
              advice: "Restart prism-ds to use the updated CLI.",
            },
          };
        });
      } else if (type === "self-update" && selfUpdate?.noChange) {
        setStartupUpdate((current) => {
          const prior = isRecord(current?.result) ? current.result : {};
          const version = selfUpdate.currentVersion ?? prior.current ?? null;
          return {
            loading: false,
            result: {
              ...prior,
              ok: true,
              available: false,
              skipped: false,
              current: version,
              latest: version,
              advice: selfUpdate.advice ?? "prism-ds is already up to date; no change was made.",
            },
          };
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
        if (selfUpdate?.verified) {
          label = "CLI update verified";
        } else if (selfUpdate?.noChange) {
          label = "CLI is already up to date · no change";
        } else if (result?.ok) {
          label = partial
            ? "CLI update completed · verification incomplete"
            : "CLI update complete";
        } else if (selfUpdate?.state === "manager-failed") {
          label = "CLI update failed · installation state unknown";
        } else {
          label = applied ? "CLI update partially applied" : "CLI update not completed";
        }
      } else {
        label = result?.ok
          ? partial
            ? "Skill action completed · verification incomplete"
            : skillNoChange
              ? "Skill action made no changes"
              : "Skill action complete"
          : applied
            ? "Skill action partially applied"
            : "Skill action not completed";
      }
      setOperation({
        status:
          skillNoChange || selfUpdate?.noChange
            ? "neutral"
            : result?.ok
              ? partial
                ? "warning"
                : "success"
              : applied
                ? "warning"
                : "error",
        label,
        detail:
          notes.join(" ") ||
          (skillNoChange
            ? "The inventory was refreshed; no instruction files changed."
            : selfUpdate?.noChange
              ? (selfUpdate.advice ?? "prism-ds is already up to date; no change was made.")
              : applied
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
      const skipped = result?.ok === true && result?.skipped === true;
      setOperation({
        status: skipped
          ? "neutral"
          : result?.available
            ? "warning"
            : result?.ok
              ? "success"
              : "warning",
        label: skipped
          ? "CLI update check skipped"
          : result?.available
            ? `CLI update available · ${displayValue(result.latest)}`
            : result?.ok
              ? "CLI is up to date"
              : "CLI update check did not complete",
        detail: skipped
          ? (result?.advice ?? "Check skipped; no registry request was made.")
          : (result?.advice ?? result?.error ?? "Read-only check only; nothing was installed."),
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

  const submitSearch = (value = searchDraft) => void searchCatalog(value);
  const applyTokenFilter = (value = tokenDraft) => {
    setTokenQuery(value);
    setView("main");
  };
  const applyIconFilter = (value = iconDraft) => {
    setIconQuery(value);
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

  return {
    services,
    project,
    projectLoading,
    projectError,
    view,
    activeTab,
    searchContext,
    detailReturnView,
    componentSection,
    selectedComponentName,
    componentCatalog,
    componentError,
    selectedExtensionName,
    tokenCatalog,
    tokenError,
    tokenGroup,
    tokenQuery,
    tokenDraft,
    iconCatalog,
    iconError,
    iconQuery,
    iconDraft,
    selectedIconName,
    searchQuery,
    searchDraft,
    catalogLoaded,
    catalogResults,
    catalogError,
    selectedSystemId,
    inspection,
    inspectionError,
    upgradeVersion,
    checkResult,
    checkError,
    checkKind,
    cssDraft,
    operation,
    notice,
    pendingConfirmation,
    footerActionPage,
    startupUpdate,
    skillsResult,
    skillsLoading,
    skillSection,
    selectedSkillId,
    skillDialogOpen,
    setSkillDialogOpen,
    skillScope,
    selectedSkillAgent,
    recoveryResult,
    recoveryLoading,
    recoveryCssPath,
    recoveryEntry,
    recoveryActionId,
    lifecycleCssPath,
    updateManager,
    skillAgentDraft,
    footerPageCountRef,
    operationLock,
    isModalOpen,
    setProject,
    setProjectLoading,
    setProjectError,
    setView,
    setActiveTab,
    setSearchContext,
    setDetailReturnView,
    setComponentSection,
    setSelectedComponentName,
    setComponentCatalog,
    setComponentError,
    setSelectedExtensionName,
    setTokenCatalog,
    setTokenError,
    setTokenGroup,
    setTokenQuery,
    setTokenDraft,
    setIconCatalog,
    setIconError,
    setIconQuery,
    setIconDraft,
    setSelectedIconName,
    setSearchQuery,
    setSearchDraft,
    setCatalogLoaded,
    setCatalogResults,
    setCatalogError,
    setSelectedSystemId,
    setInspection,
    setInspectionError,
    setUpgradeVersion,
    setCheckResult,
    setCheckError,
    setCheckKind,
    setCssDraft,
    setOperation,
    setNotice,
    setPendingConfirmation,
    setFooterActionPage,
    setStartupUpdate,
    setSkillsResult,
    setSkillsLoading,
    setSkillSection,
    setSelectedSkillId,
    setSkillScope,
    setSelectedSkillAgent,
    setRecoveryResult,
    setRecoveryLoading,
    setRecoveryCssPath,
    setRecoveryEntry,
    setRecoveryActionId,
    setLifecycleCssPath,
    setUpdateManager,
    setSkillAgentDraft,
    readProjectState,
    openManage,
    loadSkills,
    openSkills,
    loadRecovery,
    openRecovery,
    searchCatalog,
    loadComponentCatalog,
    loadTokenCatalog,
    loadIconCatalog,
    selectTab,
    cycleTokenGroup,
    openManagedFilePreview,
    openManifestDiffPreview,
    openInspection,
    beginMutation,
    cancelConfirmation,
    beginSkillMutation,
    beginCliUpdate,
    beginRecoveryAction,
    beginSwitchSearch,
    openUseAgentInput,
    openSkillAgentInput,
    confirmMutation,
    runCheckAction,
    openUpgradeInput,
    submitUseAgent,
    submitSkillAgent,
    checkCliUpdateNow,
    submitSearch,
    applyTokenFilter,
    applyIconFilter,
    submitUpgrade,
    submitCssCheck,
    submitLifecycleCss,
    setSelectedResult,
    openSelectedResult,
  };
}
