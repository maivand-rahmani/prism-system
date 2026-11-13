import { Text } from "ink";
import { Fragment } from "react";
import { EXACT_VERSION, skillAgentIdsFor } from "../utils/constants.mjs";
import { Heading, TextInputCompat, h, paragraph } from "../primitives.mjs";
import { InlineTaskActions } from "../components/InlineTaskActions.mjs";
import { MouseLayout } from "runeframe";

export const INPUT_VIEWS = Object.freeze([
  "search-input",
  "token-search",
  "icon-search",
  "upgrade-input",
  "css-input",
  "use-agent-input",
  "skill-agent-input",
  "recovery-css-input",
  "recovery-entry-input",
  "lifecycle-css-input",
]);

export function isInputView(view) {
  return INPUT_VIEWS.includes(view);
}

export function renderInput(props) {
  const content = renderInputContent(props);
  return h(MouseLayout, { flexDirection: "column" }, [
    h(Fragment, { key: "input-content" }, content),
    h(InlineTaskActions, {
      key: "input-actions",
      title: "Input actions",
      actions: props.screenActions,
      keys: [
        "submit-search",
        "apply-filter",
        "apply-icon-filter",
        "preview-upgrade",
        "check-css",
        "choose-use-agent",
        "choose-skill-agent",
        "save-lifecycle-css",
        "save-recovery-css",
        "save-recovery-entry",
        "cancel-input",
      ],
      focusedKey: props.focusedFooterAction,
      onFocusChange: props.setFocusedFooterAction,
      busy: props.operation?.status === "loading",
    }),
  ]);
}

function renderInputContent(props) {
  const {
    view,
    searchDraft,
    setSearchDraft,
    submitSearch,
    searchContext,
    tokenDraft,
    setTokenDraft,
    applyTokenFilter,
    iconDraft,
    setIconDraft,
    applyIconFilter,
    project,
    upgradeVersion,
    setUpgradeVersion,
    submitUpgrade,
    cssDraft,
    setCssDraft,
    submitCssCheck,
    services,
    skillAgentDraft,
    setSkillAgentDraft,
    submitUseAgent,
    submitSkillAgent,
    setRecoveryCssPath,
    setRecoveryEntry,
    setView,
    loadRecovery,
    submitLifecycleCss,
    setNotice,
  } = props;
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
  if (view === "icon-search") {
    return paragraph([
      h(Heading, { key: "title" }, "Filter icon names"),
      h(
        Text,
        { key: "copy", dimColor: true },
        "Search the loaded public manifest icon names and exports; nothing is fetched.",
      ),
      h(TextInputCompat, {
        key: "input",
        value: iconDraft,
        placeholder: "Canonical name, export name, or category",
        onChange: setIconDraft,
        onSubmit: applyIconFilter,
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
    const allowed = skillAgentIdsFor(services);
    return paragraph([
      h(Heading, { key: "title" }, "Choose an agent for the use skill"),
      h(
        Text,
        { key: "copy", wrap: "wrap" },
        "Choose one supported agent explicitly. The skill is project-scoped and contains instructions only; no provider is guessed and no instructions are executed.",
      ),
      h(Text, { key: "agents", dimColor: true, wrap: "wrap" }, `Supported: ${allowed.join(", ")}`),
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
    const allowed = skillAgentIdsFor(services);
    return paragraph([
      h(Heading, { key: "title" }, "Choose a skill agent"),
      h(
        Text,
        { key: "copy", wrap: "wrap" },
        "This only selects the destination for a later, separately reviewed skill action. No agent is inferred and no files are changed here.",
      ),
      h(Text, { key: "agents", dimColor: true, wrap: "wrap" }, `Supported: ${allowed.join(", ")}`),
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
}
