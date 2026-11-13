import { Text } from "ink";
import { AppShell, MouseLayout, Tabs, ThemeProvider } from "runeframe";
import { projectBanner } from "../components/project-banner.mjs";
import { SYSTEM_TABS } from "../utils/constants.mjs";
import { fileReviewEffectsOf } from "../utils/format.mjs";
import { Heading, h, line, rule, statusBadge } from "../primitives.mjs";
import { renderScreen } from "./screen.mjs";
import { isInputView } from "./input-screens.mjs";
import { buildFooterActions, renderFooter } from "./footer.mjs";
import { InlineTaskActions } from "../components/InlineTaskActions.mjs";

export function renderShell(props) {
  const {
    columns,
    rows,
    compact,
    projectLoading,
    project,
    view,
    activeTab,
    selectTab,
    services,
    operation,
    notice,
    pendingConfirmation,
    footerLayoutRef,
    footerMetrics,
    geometryRefs,
    inlineActionGeometry,
    focusedFooterAction,
    footerActionsRef,
    componentSection,
    selectedComponentName,
    selectedExtensionName,
    tokenGroup,
    selectedIconName,
    checkKind,
    catalogLoaded,
    tokenQuery,
    iconQuery,
  } = props;

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
  const inlineOperation = operation?.status === "neutral" && view !== "confirm";
  const hideCompletedSwitchSearch = view === "switch-search" && operation?.status === "success";
  const confirmationHasManagedFiles =
    view === "confirm" && fileReviewEffectsOf(pendingConfirmation).length > 0;
  const showActivity = Boolean(
    notice || (operation && view !== "confirm" && !inlineOperation && !hideCompletedSwitchSearch),
  );
  const showNotice = notice && notice.message !== operation?.detail;
  const footerBusy = operation?.status === "loading";
  const footerActions = buildFooterActions({
    ...props,
    confirmationHasManagedFiles,
    isInputView: isInputView(view),
  });
  const contextualActions = footerActions.filter(
    (action) =>
      ![
        "open-manage",
        "manage-back",
        "back-from-details",
        "skills-back",
        "lifecycle-back",
        "switch-search-back",
        "update-back",
        "recovery-back",
      ].includes(action.key),
  );
  if (props.skillDialogOpen) {
    // The skill detail dialog owns its own actions; keep the page controls out of sight.
    contextualActions.length = 0;
  }
  const normalizedContextualActions = contextualActions.map((action) => ({
    ...action,
    disabled: action.disabled === true || footerBusy,
    critical: view === "confirm" && ["confirm", "cancel"].includes(action.key),
    destructive: action.key === "remove-system",
    compactLabel: action.label,
  }));
  const checksPage = view === "main" && activeTab === "checks" && project?.status === "connected";
  const shortTerminal = rows < 18;
  const checksActionLocation = checksActionPlacement(rows, checksPage);
  const checksActionsInTabs = checksActionLocation === "tabs";
  const checksActionsInMain = checksActionLocation === "main";
  const checkActionKeys = new Set(["run-check", "run-doctor", "run-usage", "check-css"]);
  inlineActionGeometry?.setChrome(geometryRefs);
  const content = renderScreen({
    ...props,
    screenActions: normalizedContextualActions,
    actionsInHeader: checksPage,
    focusedFooterAction,
    setFocusedFooterAction: props.setFocusedFooterAction,
  });
  if (footerActionsRef) footerActionsRef.current = normalizedContextualActions;
  const footer = renderFooter({
    footerActions,
    footerBusy,
    isInputView: isInputView(view),
    view,
    columns,
    rows,
    focusedFooterAction,
    footerActionsRef,
    projectLoading,
    project,
    openManage: props.openManage,
    setView: props.setView,
    detailReturnView: props.detailReturnView,
    skillDialogOpen: props.skillDialogOpen,
  });

  const masthead = h(
    MouseLayout,
    {
      key: "masthead",
      flexDirection: compact ? "column" : "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      width: "100%",
    },
    [
      h(Heading, { key: "brand" }, "PRISM DS  /  CONSUMER TERMINAL"),
      !compact &&
        h(Text, { key: "target-label", dimColor: true, wrap: "wrap" }, `TARGET  ${services.cwd}`),
    ],
  );
  const statusAndTabs = tabsVisible
    ? h(MouseLayout, { key: "tabs", flexDirection: "column", marginBottom: 1, width: "100%" }, [
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
                  label: `${index + 1} ${["Sys", "Comp", "Tok", "Check", "Icons"][index]}`,
                }))
              : SYSTEM_TABS.map((tab, index) => ({ ...tab, label: `${index + 1} ${tab.label}` })),
          activeTabId: activeTab,
          onChange: selectTab,
          scope: "list",
        }),
        checksActionsInTabs &&
          h(InlineTaskActions, {
            key: "checks-header-actions",
            clipRegion: "chrome",
            title: "Checks",
            actions: normalizedContextualActions,
            keys: [...checkActionKeys, "refresh-project"],
            focusedKey: focusedFooterAction,
            onFocusChange: props.setFocusedFooterAction,
            busy: footerBusy,
          }),
      ])
    : !tabsVisible && view !== "confirm"
      ? line([h(MouseLayout, { key: "status" }, currentStatus)], {
          key: "project-status",
          marginBottom: 1,
          flexWrap: "wrap",
        })
      : null;
  const topBar = h(
    MouseLayout,
    { ref: geometryRefs?.topBar, flexDirection: "column", width: "100%" },
    [
      masthead,
      compact &&
        !shortTerminal &&
        h(Text, { key: "target-compact", dimColor: true, wrap: "wrap" }, `TARGET  ${services.cwd}`),
      !shortTerminal && rule(undefined, "top-rule"),
      !shortTerminal && statusAndTabs,
    ],
  );
  const contentScrollKey = [
    "content-shell",
    view,
    activeTab,
    componentSection,
    selectedComponentName ?? "",
    selectedExtensionName ?? "",
    tokenGroup ?? "",
    selectedIconName ?? "",
    checkKind ?? "",
    catalogLoaded,
    tokenQuery,
    iconQuery,
    operation?.status ?? "",
    operation?.label ?? "",
  ].join("-");
  const mainContent = h(MouseLayout, { flexDirection: "column" }, [
    shortTerminal &&
      h(Text, { key: "target-short", dimColor: true, wrap: "wrap" }, `TARGET  ${services.cwd}`),
    shortTerminal && statusAndTabs,
    shortTerminal &&
      checksActionsInMain &&
      h(InlineTaskActions, {
        key: "checks-short-actions",
        title: "Checks",
        actions: normalizedContextualActions,
        keys: [...checkActionKeys, "refresh-project"],
        focusedKey: focusedFooterAction,
        onFocusChange: props.setFocusedFooterAction,
        busy: footerBusy,
      }),
    inlineOperation && operationText,
    view === "confirm" ? h(MouseLayout, { key: "confirm-title" }, rule("CHANGE PREVIEW")) : null,
    showActivity && rule("ACTIVITY", "activity-rule"),
    view !== "confirm" && !inlineOperation && !hideCompletedSwitchSearch && operationText,
    showNotice &&
      line(
        [
          statusBadge(notice.type, notice.type === "error" ? "Error" : notice.type, "status"),
          h(Text, { key: "notice", wrap: "wrap" }, notice.message),
        ],
        { key: "notice-row", flexWrap: "wrap" },
      ),
    h(MouseLayout, { key: "main-content", flexDirection: "column" }, content),
  ]);

  return h(
    ThemeProvider,
    {
      mode: "dark",
      theme: {
        colors: { focus: { ring: "cyan", active: "cyan" }, status: { info: "cyan" } },
        components: { appShell: { spacing: { topBarMarginBottom: 0, statusBarMarginTop: 0 } } },
      },
    },
    h(
      MouseLayout,
      {
        flexDirection: "column",
        width: "100%",
        height: rows,
        overflow: "hidden",
        paddingX: compact ? 0 : 1,
        ref: geometryRefs?.root,
      },
      [
        h(AppShell, {
          key: contentScrollKey,
          topBar,
          children: mainContent,
          statusBar: h(MouseLayout, {
            ref: geometryRefs?.statusBar,
            height: footerMetrics.hasMeasured ? Math.max(1, footerMetrics.height - 2) : 1,
            backgroundColor: "black",
          }),
          sidebarPosition: "fixed",
          scrollContent: true,
        }),
        h(
          MouseLayout,
          {
            key: "anchored-footer",
            ref: footerLayoutRef,
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            flexDirection: "column",
            paddingX: compact ? 1 : 0,
            borderStyle: "single",
            borderTop: true,
            borderBottom: false,
            borderLeft: false,
            borderRight: false,
            borderColor: "gray",
            backgroundColor: "black",
          },
          footer,
        ),
      ],
    ),
  );
}

export function checksActionPlacement(rows, checksPage) {
  if (!checksPage) return null;
  return rows < 18 ? "main" : "tabs";
}
