import { useKeyHandler } from "runeframe";
import { SYSTEM_TABS } from "../utils/constants.mjs";
import { fileReviewEffectsOf } from "../utils/format.mjs";
import { isInputView } from "../views/input-screens.mjs";

const SELF_UPDATE_ACTION_KEYS = new Set([
  "check-cli-update",
  "select-npm-manager",
  "select-pnpm-manager",
  "update-local-cli",
  "update-global-cli",
]);

export function dispatchFocusedAction({
  focusedKey,
  actions,
  event,
  inputView,
  confirmationView,
  isVisible = () => true,
}) {
  if (!focusedKey || inputView) return false;
  const activation = Boolean(
    event.enter || event.key === " " || (confirmationView && event.key === "y"),
  );
  if (!activation) return false;
  const action = (actions ?? []).find((item) => item.key === focusedKey);
  if (
    action &&
    !action.disabled &&
    isVisible(focusedKey) &&
    (event.enter || event.key === " " || action.key === "confirm")
  ) {
    action.onActivate?.();
  }
  // A stale/disabled focus still owns activation keys. Never fall through to a
  // screen-wide confirmation shortcut from a different focused control.
  return true;
}

function matchesActionShortcut(action, event) {
  if (!action?.shortcut) return false;
  const key = event.enter ? "enter" : String(event.key ?? "").toLowerCase();
  return String(action.shortcut)
    .split("/")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === key || (key === "escape" && part === "esc"));
}

export function useNavigationKeys(props) {
  const {
    exit,
    isModalOpen,
    footerActionsRef,
    focusedFooterAction,
    setFocusedFooterAction,
    skillDialogOpen,
    view,
    pendingConfirmation,
    rows,
    columns,
    project,
    activeTab,
    componentCatalog,
    componentSection,
    selectedComponentName,
    searchQuery,
    searchContext,
    selectedSystemId,
    catalogLoaded,
    catalogResults,
    notice,
    skillsResult,
    selectedSkillId,
    skillSection,
    recoveryResult,
    recoveryActionId,
    lifecycleCssPath,
    tokenQuery,
    tokenCatalog,
    tokenGroup,
    iconQuery,
    iconCatalog,
    cycleTokenGroup,
    openManagedFilePreview,
    openManifestDiffPreview,
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
    beginRecoveryAction,
    loadSkills,
    loadRecovery,
    openUseAgentInput,
    openSkillAgentInput,
    selectTab,
    loadComponentCatalog,
    loadIconCatalog,
    loadTokenCatalog,
    runCheckAction,
    detailReturnView,
    recoveryCssPath,
    recoveryEntry,
    setView,
    setNotice,
    setCatalogLoaded,
    setCatalogResults,
    setCatalogError,
    setCssDraft,
    setSearchDraft,
    setTokenDraft,
    setIconDraft,
    setSkillSection,
    setSelectedSkillId,
    setSkillDialogOpen,
    setSelectedComponentName,
    setComponentSection,
    setSelectedExtensionName,
    setComponentCatalog,
    setComponentError,
    setTokenCatalog,
    setTokenError,
    setIconCatalog,
    setIconError,
    setSkillScope,
    setRecoveryActionId,
    operation,
    inlineActionGeometry,
  } = props;

  useKeyHandler(
    (event) => {
      const escapeKey =
        event.escape ||
        event.key === "Escape" ||
        event.key === "escape" ||
        event.rawInput === "\u001b";
      if (event.ctrl && event.key === "c") {
        exit();
        return true;
      }
      if (!isInputView(view) && view !== "confirm" && focusedFooterAction && escapeKey) {
        setFocusedFooterAction(null);
        return true;
      }
      if (skillDialogOpen) return false;
      if (isModalOpen) return false;
      if (!isInputView(view) && event.key === "q") {
        exit();
        return true;
      }
      if (operation?.status === "loading") {
        const disabledShortcut = (footerActionsRef.current ?? []).find(
          (action) => action.disabled && matchesActionShortcut(action, event),
        );
        if (disabledShortcut) return true;
      }
      const tabKey = event.key === "Tab" || event.key === "tab" || event.key === "\t";
      if (!isInputView(view) && tabKey) {
        const eligible = (footerActionsRef.current ?? []).filter(
          (action) => !action.disabled && inlineActionGeometry?.isVisible(action.key),
        );
        if (eligible.length === 0) return true;
        const current = eligible.findIndex((action) => action.key === focusedFooterAction);
        const delta = event.shift ? -1 : 1;
        if (delta < 0 && current === 0) {
          setFocusedFooterAction(null);
          return true;
        }
        const next =
          current < 0
            ? delta < 0
              ? eligible.length - 1
              : 0
            : (current + delta + eligible.length) % eligible.length;
        setFocusedFooterAction(eligible[next].key);
        return true;
      }
      // Explicitly focused controls take precedence over screen-wide Enter
      // shortcuts. In particular, Enter on Cancel must never confirm a plan.
      if (
        dispatchFocusedAction({
          focusedKey: focusedFooterAction,
          actions: footerActionsRef.current,
          event,
          inputView: isInputView(view),
          confirmationView: view === "confirm",
          isVisible: (key) => inlineActionGeometry?.isVisible(key) ?? false,
        })
      )
        return true;
      if (view === "confirm") {
        if (escapeKey || event.key === "n") {
          cancelConfirmation();
          return true;
        }
        if (event.enter || event.key === "y") {
          if (operation?.status === "loading") return true;
          void confirmMutation();
          return true;
        }
        const managedFiles = fileReviewEffectsOf(pendingConfirmation);
        if (event.key === "v" && managedFiles.length > 0) {
          openManagedFilePreview();
          return true;
        }
        if (event.key === "m" && pendingConfirmation?.action.kind === "upgrade") {
          openManifestDiffPreview();
          return true;
        }
        return false;
      }
      if (isInputView(view)) return false;
      if (escapeKey) {
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
        if (event.key === "g") {
          setSkillScope((scope) => (scope === "project" ? "global" : "project"));
          return true;
        }
        if (event.key === "l") {
          void loadSkills("all");
          return true;
        }
        if (event.enter) {
          const selected =
            skillsResult?.catalog?.find(
              (entry) => entry.id === selectedSkillId && entry.type === skillSection,
            ) ?? skillsResult?.catalog?.find((entry) => entry.type === skillSection);
          if (selected) {
            setSelectedSkillId(selected.id);
            setSkillDialogOpen(true);
          }
          return true;
        }
      }
      if (view === "self-update-home") {
        const action = (footerActionsRef.current ?? []).find(
          (item) => SELF_UPDATE_ACTION_KEYS.has(item.key) && matchesActionShortcut(item, event),
        );
        if (action) {
          if (action.disabled) {
            if (action.disabledReason) {
              setNotice({ type: "warning", message: action.disabledReason });
            }
          } else {
            action.onActivate?.();
          }
          return true;
        }
      }
      if (view === "recovery-home") {
        if (event.key >= "1" && event.key <= "9") {
          const suggestion = recoveryResult?.suggestions?.[Number(event.key) - 1];
          if (suggestion) {
            setRecoveryActionId(suggestion.id);
            return true;
          }
        }
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
        if (event.key >= "1" && event.key <= "5") {
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
          if (componentSection === "required" || componentSection === "optional") {
            const componentEntries = (
              Array.isArray(componentCatalog?.components) ? componentCatalog.components : []
            ).filter((component) =>
              componentSection === "optional"
                ? component.optional === true
                : component.required === true,
            );
            if ((event.key === "j" || event.key === "k") && componentEntries.length > 0) {
              const currentIndex = componentEntries.findIndex(
                (component) => component.name === selectedComponentName,
              );
              const startIndex = currentIndex < 0 ? 0 : currentIndex;
              const direction = event.key === "j" ? 1 : -1;
              const nextIndex =
                (startIndex + direction + componentEntries.length) % componentEntries.length;
              setSelectedComponentName(componentEntries[nextIndex].name);
              return true;
            }
          }
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
        } else if (activeTab === "icons") {
          if (event.key === "/") {
            setIconDraft(iconQuery);
            setView("icon-search");
            return true;
          }
          if (event.key === "l") {
            setIconCatalog(null);
            setIconError(null);
            loadIconCatalog(true);
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
        isModalOpen,
        pendingConfirmation,
        rows,
        columns,
        project,
        activeTab,
        componentCatalog,
        componentSection,
        selectedComponentName,
        searchQuery,
        searchContext,
        selectedSystemId,
        catalogLoaded,
        catalogResults,
        notice,
        operation,
        inlineActionGeometry,
        skillsResult,
        recoveryResult,
        recoveryActionId,
        lifecycleCssPath,
        tokenQuery,
        tokenCatalog,
        tokenGroup,
        iconQuery,
        iconCatalog,
        cycleTokenGroup,
        openManagedFilePreview,
        openManifestDiffPreview,
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
        beginRecoveryAction,
        loadSkills,
        loadRecovery,
        openUseAgentInput,
        openSkillAgentInput,
        selectTab,
        loadComponentCatalog,
        loadIconCatalog,
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
      if (isModalOpen) return false;
      if (!isInputView(view) && event.key === "q") {
        exit();
        return true;
      }
      if (view === "confirm") {
        if (event.escape || event.key === "n") {
          cancelConfirmation();
          return true;
        }
        if (!focusedFooterAction && (event.enter || event.key === "y")) {
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
      deps: [
        view,
        project,
        catalogLoaded,
        cancelConfirmation,
        confirmMutation,
        isModalOpen,
        focusedFooterAction,
      ],
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
}
