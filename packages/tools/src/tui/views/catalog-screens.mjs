import { Text } from "ink";
import { Button, List, MouseLayout } from "runeframe";
import { CATEGORY_NAMES } from "../utils/constants.mjs";
import { InlineTaskActions } from "../components/InlineTaskActions.mjs";
import {
  componentMetadata,
  detailSummary,
  displayValue,
  effectMetadataText,
  extensionRequirementsText,
  isRecord,
  resultRows,
} from "../utils/format.mjs";
import { Heading, catalogDetail, h, line, paragraph, rule, statusBadge } from "../primitives.mjs";

export function renderComponents(props) {
  const {
    componentError,
    componentCatalog,
    componentSection,
    selectedExtensionName,
    selectedComponentName,
    rows,
    setSelectedExtensionName,
    setSelectedComponentName,
    screenActions,
    focusedFooterAction,
    setFocusedFooterAction,
    operation,
  } = props;
  const actions = (keys, key) =>
    h(InlineTaskActions, {
      key,
      actions: screenActions,
      keys,
      focusedKey: focusedFooterAction,
      onFocusChange: setFocusedFooterAction,
      busy: operation?.status === "loading",
    });
  if (componentError) {
    return paragraph([
      line(
        [
          statusBadge("error", "Component catalog unavailable", "status"),
          h(Text, { key: "error", wrap: "wrap" }, componentError),
        ],
        { key: "component-error" },
      ),
      actions(["reload-components", "refresh-project"], "component-error-actions"),
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
  const categoryEntries = Object.entries(categories).filter(([name]) => CATEGORY_NAMES.has(name));
  const extensions = Array.isArray(componentCatalog.extensions) ? componentCatalog.extensions : [];
  const optionalOnly = componentSection === "optional";
  const entries = allComponents.filter((component) =>
    optionalOnly ? component.optional === true : component.required === true,
  );
  const sectionAvailableCount = entries.filter(
    (component) => availableNames.has(component.name) && !unavailableNames.has(component.name),
  ).length;
  const sectionUnavailableCount = entries.length - sectionAvailableCount;
  const selectedExtension =
    extensions.find((extension) => extension.name === selectedExtensionName) ??
    extensions[0] ??
    null;
  const visibleEntries = componentSection === "extensions" ? extensions : entries;
  const selectedComponent =
    componentSection === "extensions" || componentSection === "categories"
      ? null
      : (visibleEntries.find((component) => component.name === selectedComponentName) ??
        visibleEntries[0] ??
        null);
  const selectedComponentIndex = selectedComponent
    ? visibleEntries.findIndex((component) => component.name === selectedComponent.name)
    : -1;
  const componentItems = visibleEntries.map((component, index) => {
    const available = availableNames.has(component.name) && !unavailableNames.has(component.name);
    return {
      id: `component-${component.name}-${index}`,
      label:
        componentSection === "extensions"
          ? `EXTENSION  ${component.name}`
          : `${available ? "AVAILABLE" : "UNAVAILABLE"}  ${component.name}`,
      description: "",
      component,
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
    actions(
      ["required", "optional", "categories", "extensions", "reload-components", "refresh-project"],
      "component-actions",
    ),
    h(
      Text,
      { key: "counts", dimColor: true },
      componentSection === "extensions"
        ? `${extensions.length} declared extension${extensions.length === 1 ? "" : "s"}`
        : componentSection === "categories"
          ? `${categoryEntries.length} capability categories`
          : `${sectionAvailableCount} available · ${sectionUnavailableCount} unavailable · ${entries.length} ${optionalOnly ? "optional" : "required"} components`,
    ),
    componentSection !== "extensions" &&
      componentSection !== "categories" &&
      h(Text, { key: "component-navigation-hint", dimColor: true }, "j/k select · ↑/↓ scroll"),
    componentSection !== "extensions" &&
      componentSection !== "categories" &&
      entries.length > 12 &&
      selectedComponent &&
      paragraph(
        [
          line(
            [
              statusBadge(
                availableNames.has(selectedComponent.name) ? "success" : "muted",
                availableNames.has(selectedComponent.name) ? "Available" : "Unavailable",
                "component-status",
              ),
              h(Heading, { key: "component-name", compact: true }, selectedComponent.name),
            ],
            { key: "component-heading", flexWrap: "wrap" },
          ),
          h(
            Text,
            { key: "component-details", dimColor: true, wrap: "wrap" },
            componentMetadata(selectedComponent) ||
              (selectedComponent.required ? "Required contract component." : "Optional component."),
          ),
        ],
        { key: "component-details", marginTop: 1 },
      ),
    componentSection === "categories"
      ? categoryEntries.length === 0
        ? h(
            Text,
            { key: "no-categories", dimColor: true },
            "No capability categories are declared in the returned manifest catalog.",
          )
        : h(
            MouseLayout,
            { key: "category-list", flexDirection: "column", marginTop: 1 },
            categoryEntries.map(([name, category]) => {
              const available = Array.isArray(category?.available) ? category.available : [];
              const unavailable = Array.isArray(category?.unavailable) ? category.unavailable : [];
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
              componentSection === "extensions"
                ? selectedExtension
                  ? `component-${selectedExtension.name}-${extensions.indexOf(selectedExtension)}`
                  : undefined
                : selectedComponent
                  ? `component-${selectedComponent.name}-${selectedComponentIndex}`
                  : undefined,
            onSelect: (id) => {
              const index = componentItems.findIndex((item) => item.id === id);
              if (componentSection === "extensions") {
                setSelectedExtensionName(extensions[index]?.name ?? null);
              } else {
                setSelectedComponentName(visibleEntries[index]?.name ?? null);
              }
            },
            renderItem: (item, { focused, selected }) =>
              h(
                Text,
                {
                  bold: focused || selected,
                  color: focused ? "cyan" : undefined,
                  wrap: "truncate-end",
                },
                `${selected ? "› " : "  "}${item.label}`,
              ),
            // A single line per item keeps large catalogs compact. Let the
            // AppShell viewport scroll the complete catalog instead of
            // hiding later entries inside a nested list window.
            maxVisible:
              componentItems.length > 12
                ? componentItems.length
                : Math.max(2, Math.min(12, componentItems.length, rows - 11)),
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
        : componentSection === "categories"
          ? "Category membership and availability reflect the installed manifest; categories are not exhaustive."
          : `${componentItems.length} ${optionalOnly ? "optional" : "required"} entries · j/k select · ↑/↓ scroll · availability reflects this installed public manifest.`,
    ),
  ]);
}

export function renderTokens(props) {
  const {
    tokenError,
    tokenCatalog,
    tokenGroup,
    tokenQuery,
    compact,
    rows,
    setTokenGroup,
    screenActions,
    focusedFooterAction,
    setFocusedFooterAction,
    operation,
  } = props;
  const actions = (keys, key) =>
    h(InlineTaskActions, {
      key,
      actions: screenActions,
      keys,
      focusedKey: focusedFooterAction,
      onFocusChange: setFocusedFooterAction,
      busy: operation?.status === "loading",
    });
  if (tokenError) {
    return paragraph([
      line(
        [
          statusBadge("error", "Token catalog unavailable", "status"),
          h(Text, { key: "error", wrap: "wrap" }, tokenError),
        ],
        { key: "token-error" },
      ),
      actions(["reload-tokens", "refresh-project"], "token-error-actions"),
    ]);
  }
  if (!tokenCatalog)
    return h(Text, { dimColor: true }, "Reading the installed public manifest token catalog…");

  const groups = Array.isArray(tokenCatalog.groups) ? tokenCatalog.groups : [];
  const groupNames = Array.isArray(tokenCatalog.groupNames) ? tokenCatalog.groupNames : [];
  const selected = groups.find((group) => group.group === tokenGroup) ?? groups[0];
  const selectedGroupName = selected?.group ?? groupNames[0] ?? null;
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
    actions(
      ["previous-group", "next-group", "search-tokens", "reload-tokens", "refresh-project"],
      "token-actions",
    ),
    h(
      Text,
      { key: "caveat", wrap: "wrap" },
      "The public manifest exposes semantic names and mappings only. Literal CSS values are not published in the manifest.",
    ),
    groupNames.length > 0 &&
      h(
        MouseLayout,
        { key: "groups", flexDirection: "row", flexWrap: "wrap" },
        groupNames.map((name) =>
          h(
            MouseLayout,
            { key: `group-${name}`, marginRight: 1 },
            h(
              Button,
              {
                variant: name === selectedGroupName ? "primary" : "ghost",
                onActivate: () => setTokenGroup(name),
              },
              h(
                Text,
                { bold: name === selectedGroupName },
                `${name === selectedGroupName ? "› " : ""}${name}`,
              ),
            ),
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
}

export function renderIcons(props) {
  const {
    iconError,
    iconCatalog,
    iconQuery,
    selectedIconName,
    compact,
    rows,
    setSelectedIconName,
    screenActions,
    focusedFooterAction,
    setFocusedFooterAction,
    operation,
  } = props;
  const actions = (keys, key) =>
    h(InlineTaskActions, {
      key,
      actions: screenActions,
      keys,
      focusedKey: focusedFooterAction,
      onFocusChange: setFocusedFooterAction,
      busy: operation?.status === "loading",
    });
  if (iconError) {
    return paragraph([
      line(
        [
          statusBadge("error", "Icon catalog unavailable", "status"),
          h(Text, { key: "error", wrap: "wrap" }, iconError),
        ],
        { key: "icon-error" },
      ),
      actions(["reload-icons", "refresh-project"], "icon-error-actions"),
    ]);
  }
  if (!iconCatalog)
    return h(Text, { dimColor: true }, "Reading the installed public manifest icon catalog…");

  const icons = Array.isArray(iconCatalog.icons) ? iconCatalog.icons : [];
  const availableIcons = icons.filter((icon) => icon?.available === true);
  const unavailableCount = icons.length - availableIcons.length;
  const query = iconQuery.trim().toLowerCase();
  const visibleIcons = query
    ? availableIcons.filter((icon) => {
        const haystack = [icon.name, icon.exportName, icon.category, icon.importPath]
          .filter((value) => typeof value === "string")
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : availableIcons;
  const selectedIcon =
    visibleIcons.find((icon) => icon.name === selectedIconName) ?? visibleIcons[0] ?? null;
  const iconItems = visibleIcons.map((icon) => ({
    id: `icon-${icon.name}`,
    label: `${icon.name}  ${icon.exportName}`,
    description: `Category: ${displayValue(icon.category)} · ${displayValue(icon.importPath)}`,
  }));

  return paragraph([
    h(Heading, { key: "title" }, "Icon catalog"),
    actions(["search-icons", "reload-icons", "refresh-project"], "icon-actions"),
    h(
      Text,
      { key: "counts", dimColor: true },
      `${availableIcons.length} available · ${unavailableCount} unavailable`,
    ),
    !iconCatalog.supported &&
      line(
        [
          statusBadge("info", "No icon catalog", "status"),
          h(
            Text,
            { key: "unsupported", wrap: "wrap" },
            "No icon catalog is declared by this design system.",
          ),
        ],
        { key: "icon-unsupported" },
      ),
    iconCatalog.supported &&
      h(
        Text,
        { key: "caveat", wrap: "wrap" },
        "Only icons published by the installed public ./icons entrypoint are listed and importable.",
      ),
    iconCatalog.supported &&
      h(
        Text,
        { key: "count", dimColor: true },
        `${visibleIcons.length}/${availableIcons.length} icon names${query ? ` · filter: ${query}` : ""}`,
      ),
    iconCatalog.supported &&
      (iconItems.length > 0
        ? h(List, {
            key: "icon-list",
            items: iconItems,
            selectedId: selectedIcon ? `icon-${selectedIcon.name}` : undefined,
            onSelect: (id) => {
              const icon = iconItems.find((item) => item.id === id);
              if (!icon) return;
              setSelectedIconName(icon.id.slice("icon-".length));
            },
            maxVisible: Math.max(2, Math.min(10, rows - (compact ? 12 : 14))),
          })
        : h(
            Text,
            { key: "empty", dimColor: true },
            query
              ? "No icon names match this filter."
              : "This system publishes no available icon names.",
          )),
    iconCatalog.supported &&
      selectedIcon &&
      paragraph(
        [
          rule("SELECTED ICON", "icon-detail-rule"),
          h(Heading, { key: "icon-name", compact: true }, selectedIcon.exportName),
          catalogDetail(
            "IMPORT",
            selectedIcon.importStatement ?? "Not importable; this icon is not published.",
            "icon-import",
          ),
          catalogDetail(
            "ENTRYPOINT",
            `${displayValue(selectedIcon.entrypoint)} · ${displayValue(selectedIcon.importPath)}`,
            "icon-entrypoint",
          ),
          catalogDetail("CATEGORY", selectedIcon.category, "icon-category"),
          catalogDetail(
            "REQUIREMENTS",
            extensionRequirementsText(selectedIcon),
            "icon-requirements",
          ),
        ],
        { key: "icon-details", marginTop: 1 },
      ),
    h(
      Text,
      { key: "manifest-note", dimColor: true },
      iconCatalog.supported
        ? "Availability reflects this installed public manifest; unavailable canonical names are not importable."
        : "The shared icon vocabulary is not a catalog; this system does not publish icon exports.",
    ),
  ]);
}

export function renderChecks(props) {
  const {
    checkKind,
    checkResult,
    checkError,
    compact,
    rows,
    screenActions,
    focusedFooterAction,
    setFocusedFooterAction,
    operation,
    actionsInHeader,
  } = props;
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
    !actionsInHeader &&
      h(InlineTaskActions, {
        key: "check-actions",
        actions: screenActions,
        keys: ["run-check", "run-doctor", "run-usage", "check-css", "refresh-project"],
        focusedKey: focusedFooterAction,
        onFocusChange: setFocusedFooterAction,
        busy: operation?.status === "loading",
      }),
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
}
