import { Text } from "ink";
import { MouseLayout } from "runeframe";
import { ContextActions } from "../components/ContextActions.mjs";
import { EXACT_VERSION } from "../utils/constants.mjs";
import { isRecord } from "../utils/format.mjs";
import { h } from "../primitives.mjs";

const SELF_UPDATE_LOADING_NOTICE = "Wait for the current CLI update operation to finish.";

function localPreviewUnavailableReason({ kind, updateAvailable, localInstallAvailable }) {
  if (!updateAvailable) return "No CLI update is available to preview.";
  if (kind === "global") {
    return "This prism-ds installation is global. Use Preview global update with an explicit npm or pnpm manager.";
  }
  if (kind === "local" && localInstallAvailable) {
    return "Choose npm or pnpm first; no package manager was detected for this local install.";
  }
  if (kind === "local") {
    return "This local prism-ds installation is not verified, so it cannot be updated in place.";
  }
  return "This prism-ds copy cannot be updated in place from this context. Use an explicit global target instead.";
}

/**
 * One canonical self-update action policy for mouse controls and keyboard
 * shortcuts. Availability is derived only from the read-only update check and
 * the explicitly selected manager; nothing here executes without the normal
 * preview and confirmation flow.
 */
export function buildSelfUpdateActions({
  startupUpdate,
  updateManager,
  operation,
  setUpdateManager,
  checkCliUpdateNow,
  beginCliUpdate,
} = {}) {
  const result = startupUpdate?.result;
  const installation = isRecord(result?.installation) ? result.installation : {};
  const kind = typeof installation.kind === "string" ? installation.kind : "unknown";
  const loading = operation?.status === "loading";
  const updateAvailable = result?.available === true;
  const managerDetected =
    typeof installation.manager === "string" && installation.manager.trim() !== "";
  const localInstallAvailable =
    kind === "local" && installation.verified === true && updateAvailable;
  const localAllowed =
    !loading && localInstallAvailable && (managerDetected || Boolean(updateManager));
  // A detected local manager always wins. The explicit selector is only an
  // override when the local installation has no detected manager.
  const localOptions = managerDetected ? {} : updateManager ? { manager: updateManager } : null;
  const globalAllowed = !loading && updateAvailable && Boolean(updateManager);
  const localDisabledReason = loading
    ? SELF_UPDATE_LOADING_NOTICE
    : localPreviewUnavailableReason({ kind, updateAvailable, localInstallAvailable });
  const globalDisabledReason = loading
    ? SELF_UPDATE_LOADING_NOTICE
    : !updateAvailable
      ? "No CLI update is available to preview."
      : "Choose npm or pnpm first; global update context is never guessed.";

  return [
    {
      key: "check-cli-update",
      shortcut: "c",
      label: "Check now",
      variant: "primary",
      disabled: loading,
      disabledReason: loading ? SELF_UPDATE_LOADING_NOTICE : null,
      onActivate: () => void checkCliUpdateNow?.(),
    },
    {
      key: "select-npm-manager",
      shortcut: "n",
      label: "Use npm",
      active: updateManager === "npm",
      disabled: loading,
      disabledReason: loading ? SELF_UPDATE_LOADING_NOTICE : null,
      onActivate: () => setUpdateManager?.("npm"),
    },
    {
      key: "select-pnpm-manager",
      shortcut: "p",
      label: "Use pnpm",
      active: updateManager === "pnpm",
      disabled: loading,
      disabledReason: loading ? SELF_UPDATE_LOADING_NOTICE : null,
      onActivate: () => setUpdateManager?.("pnpm"),
    },
    {
      key: "update-local-cli",
      shortcut: "l",
      label: "Preview local update",
      disabled: !localAllowed,
      disabledReason: localAllowed ? null : localDisabledReason,
      onActivate: localAllowed ? () => void beginCliUpdate?.(localOptions) : undefined,
    },
    {
      key: "update-global-cli",
      shortcut: "g",
      label: "Preview global update",
      disabled: !globalAllowed,
      disabledReason: globalAllowed ? null : globalDisabledReason,
      onActivate: globalAllowed
        ? () => void beginCliUpdate?.({ global: true, manager: updateManager })
        : undefined,
    },
  ];
}

export function buildFooterActions(props) {
  const {
    view,
    confirmationHasManagedFiles,
    openManagedFilePreview,
    pendingConfirmation,
    openManifestDiffPreview,
    confirmMutation,
    cancelConfirmation,
    isInputView,
    submitSearch,
    submitUpgrade,
    upgradeVersion,
    submitCssCheck,
    cssDraft,
    submitUseAgent,
    skillAgentDraft,
    submitSkillAgent,
    submitLifecycleCss,
    setNotice,
    setCssDraft,
    setView,
    setRecoveryCssPath,
    loadRecovery,
    setRecoveryEntry,
    searchContext,
    projectLoading,
    project,
    detailReturnView,
    beginMutation,
    openUseAgentInput,
    inspection,
    readProjectState,
    activeTab,
    componentError,
    setComponentError,
    setComponentCatalog,
    loadComponentCatalog,
    setComponentSection,
    componentSection,
    componentCatalog,
    setSelectedExtensionName,
    tokenError,
    setTokenError,
    setTokenCatalog,
    loadTokenCatalog,
    tokenCatalog,
    cycleTokenGroup,
    tokenQuery,
    setTokenDraft,
    iconError,
    setIconError,
    setIconCatalog,
    loadIconCatalog,
    iconQuery,
    setIconDraft,
    runCheckAction,
    catalogLoaded,
    catalogResults,
    selectedSystemId,
    openSelectedResult,
    searchCatalog,
    searchQuery,
    setSearchDraft,
    openSkills,
    openRecovery,
    openManage,
    beginSwitchSearch,
    startupUpdate,
    updateManager,
    setUpdateManager,
    checkCliUpdateNow,
    beginCliUpdate,
    beginRecoveryAction,
    recoveryResult,
    recoveryActionId,
    operationLock,
    operation,
    applyTokenFilter,
    applyIconFilter,
    openInspection,
    openUpgradeInput,
    lifecycleCssPath,
    recoveryCssPath,
    recoveryEntry,
  } = props;

  const isDetailView = view === "details" || view === "detail-loading";

  const footerActions = [];
  const addFooterAction = (key, shortcut, label, onActivate, options = {}) => {
    footerActions.push({ key, shortcut, label, onActivate, ...options });
  };

  if (view === "confirm") {
    if (confirmationHasManagedFiles) {
      addFooterAction("inspect-files", "v", "View file diffs", openManagedFilePreview);
    }
    if (pendingConfirmation?.action.kind === "upgrade") {
      addFooterAction("manifest-diff", "m", "View manifest diff", openManifestDiffPreview);
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
    } else if (view === "icon-search") {
      addFooterAction("apply-icon-filter", "Enter", "Apply filter", () => applyIconFilter(), {
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
      } else if (activeTab === "checks") {
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
      } else if (activeTab === "icons") {
        if (iconError) {
          addFooterAction(
            "reload-icons",
            "l",
            "Reload catalog",
            () => {
              setIconError(null);
              setIconCatalog(null);
              loadIconCatalog(true);
            },
            { variant: "primary" },
          );
          addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
        } else {
          addFooterAction(
            "search-icons",
            "/",
            "Filter names",
            () => {
              setIconDraft(iconQuery);
              setView("icon-search");
            },
            { variant: "primary" },
          );
          addFooterAction("reload-icons", "l", "Reload", () => {
            setIconError(null);
            setIconCatalog(null);
            loadIconCatalog(true);
          });
          addFooterAction("refresh-project", "p", "Refresh state", readProjectState);
        }
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
    addFooterAction("skills-back", "Esc", "Back to Manage", () => setView("manage-home"));
  } else if (view === "self-update-home") {
    footerActions.push(
      ...buildSelfUpdateActions({
        startupUpdate,
        updateManager,
        operation,
        setUpdateManager,
        checkCliUpdateNow,
        beginCliUpdate,
      }),
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
      "1-9 / Enter",
      "Preview selected repair",
      () => selected && void beginRecoveryAction(selected),
      { disabled: !selected },
    );
    addFooterAction("recovery-back", "Esc", "Back to Manage", () => setView("manage-home"));
  }

  if (!projectLoading && view === "main") {
    addFooterAction("open-manage", "m", "Manage", openManage);
  }

  return footerActions;
}

export function renderFooter(props) {
  const {
    isInputView,
    view,
    projectLoading,
    openManage,
    setView,
    detailReturnView,
    skillDialogOpen,
  } = props;
  const navActions = [];
  if (!skillDialogOpen && !projectLoading && view === "main")
    navActions.push({ key: "open-manage", label: "Manage", onActivate: openManage });
  if (!skillDialogOpen && ["details", "detail-loading"].includes(view))
    navActions.push({ key: "back", label: "Back", onActivate: () => setView(detailReturnView) });
  if (
    !skillDialogOpen &&
    [
      "manage-home",
      "lifecycle-home",
      "skills-home",
      "self-update-home",
      "recovery-home",
      "switch-search",
    ].includes(view)
  ) {
    navActions.push({
      key: "back",
      label: "Back",
      onActivate: () =>
        setView(
          view === "manage-home"
            ? "main"
            : view === "switch-search"
              ? "lifecycle-home"
              : "manage-home",
        ),
    });
  }
  const footer = h(
    MouseLayout,
    { key: "footer", flexDirection: "row", flexWrap: "wrap", width: "100%" },
    [
      ...navActions.map((action) =>
        h(ContextActions, { key: action.key, actions: [action], layout: "bar", title: "Navigate" }),
      ),
      h(
        Text,
        { key: "exit-hint", dimColor: true, wrap: "wrap" },
        `${isInputView ? "Ctrl+C" : "↑/↓ scroll · q or Ctrl+C exit"} · navigation only`,
      ),
    ],
  );
  return footer;
}
