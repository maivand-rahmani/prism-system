import { Text } from "ink";
import { List, MouseLayout } from "runeframe";
import { projectBanner } from "../components/project-banner.mjs";
import { InlineTaskActions } from "../components/InlineTaskActions.mjs";
import { systemInfoRows } from "../utils/format.mjs";
import { Heading, h, keyValue, line, paragraph, statusBadge } from "../primitives.mjs";

function taskActions(props, title, keys) {
  const actions = (props.screenActions ?? []).filter((action) => keys.includes(action.key));
  if (!actions.length) return null;
  return h(InlineTaskActions, {
    key: `actions-${title}`,
    actions,
    keys,
    focusedKey: props.focusedFooterAction,
    onFocusChange: props.setFocusedFooterAction,
    busy: props.operation?.status === "loading",
  });
}

export function renderEmptyHome(props) {
  const {
    projectLoading,
    project,
    projectError,
    catalogLoaded,
    searchQuery,
    catalogError,
    catalogResults,
    selectedSystemId,
    setSelectedResult,
    compact,
    rows,
    ...actionProps
  } = props;
  if (projectLoading) {
    return paragraph([
      statusBadge("info", "Reading local project state", "status"),
      h(Text, { key: "copy", dimColor: true }, "No registry or catalog request is made on launch."),
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
      taskActions(props, "project", ["retry-project"]),
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
      taskActions(actionProps, "catalog", ["browse-catalog", "browse-again", "search-catalog"]),
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
    taskActions(props, "catalog", [
      "inspect-selection",
      "search-catalog",
      "refresh-catalog",
      "browse-again",
    ]),
  ]);
}

export function renderSwitchSearch(props) {
  const {
    catalogLoaded,
    catalogError,
    searchQuery,
    compact,
    catalogResults,
    selectedSystemId,
    setSelectedResult,
    rows,
    ...actionProps
  } = props;
  if (!catalogLoaded && !catalogError) {
    return paragraph([
      statusBadge("info", "Searching the registry", "status"),
      h(
        Text,
        { key: "copy", dimColor: true, wrap: "wrap" },
        "The current system remains installed. Choose and inspect one exact published release before reviewing a switch plan.",
      ),
      taskActions(props, "target", ["search-switch-target", "refresh-switch-targets"]),
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
      compact
        ? "Read-only search · previous dependency retained on confirm."
        : "This search is read-only. The previous design-system dependency is retained if a switch is later confirmed.",
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
    taskActions(actionProps, "target", [
      "inspect-switch-target",
      "search-switch-target",
      "refresh-switch-targets",
    ]),
  ]);
}

export function renderInstalledHome(props) {
  const { project, compact } = props;
  return paragraph([
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
    taskActions(props, "connect", ["connect", "refresh-project"]),
  ]);
}

export function renderSystemDetails(props) {
  const { catalogResults, selectedSystemId, inspection, inspectionError, project, searchContext } =
    props;
  const selected = catalogResults.find(
    (item) => `${item.name}@${item.version}` === selectedSystemId,
  );
  const manifest = inspection?.manifest;
  const infoRows = systemInfoRows(manifest);
  const isSwitchTarget = searchContext === "switch";
  return paragraph([
    h(Heading, { key: "title" }, "Published manifest details"),
    selected &&
      h(
        Text,
        { key: "selected", dimColor: true },
        `Selected registry result: ${selected.name}@${selected.version}`,
      ),
    isSwitchTarget && taskActions(props, "switch-target", ["preview-switch"]),
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
    taskActions(
      props,
      "manifest",
      project?.status === "empty" && !isSwitchTarget
        ? ["install", "use", "use-no-skills", "use-agent"]
        : [],
    ),
  ]);
}

export function renderConnectedSystem(props) {
  const { project, services, compact } = props;
  return paragraph([
    h(Heading, { key: "title" }, "Connected design system"),
    h(MouseLayout, { key: "project-banner" }, projectBanner(project, services.cwd, compact)),
    h(MouseLayout, { key: "facts", marginTop: 1, flexDirection: "column" }, [
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
    taskActions(props, "system", ["inspect-system", "reconnect", "upgrade", "refresh-project"]),
  ]);
}
