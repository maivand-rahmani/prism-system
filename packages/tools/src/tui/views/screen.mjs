import { Text } from "ink";
import { h, paragraph, statusBadge } from "../primitives.mjs";
import { renderChecks, renderComponents, renderIcons, renderTokens } from "./catalog-screens.mjs";
import { renderConfirmation } from "./confirmation-screen.mjs";
import {
  renderConnectedSystem,
  renderEmptyHome,
  renderInstalledHome,
  renderSwitchSearch,
  renderSystemDetails,
} from "./home-screens.mjs";
import { isInputView, renderInput } from "./input-screens.mjs";
import {
  renderLifecycleHome,
  renderManageHome,
  renderRecoveryHome,
  renderSelfUpdateHome,
  renderSkillsHome,
} from "./manage-screens.mjs";

export function renderHomeBody(props) {
  const { projectLoading, project, activeTab } = props;
  if (projectLoading || !project) return renderEmptyHome(props);
  if (project.status === "error" || project.status === "empty") return renderEmptyHome(props);
  if (project.status === "installed") return renderInstalledHome(props);
  if (project.status !== "connected") return renderEmptyHome(props);
  if (activeTab === "systems") return renderConnectedSystem(props);
  if (activeTab === "components") return renderComponents(props);
  if (activeTab === "tokens") return renderTokens(props);
  if (activeTab === "icons") return renderIcons(props);
  return renderChecks(props);
}

export function renderScreen(props) {
  const { view } = props;
  if (view === "confirm") return renderConfirmation(props);
  if (isInputView(view)) return renderInput(props);
  if (view === "details" || view === "detail-loading") {
    if (view === "detail-loading") {
      return paragraph([
        statusBadge("info", "Inspecting published manifest", "status"),
        h(Text, { key: "detail", dimColor: true }, "Read-only registry request…"),
      ]);
    }
    return renderSystemDetails(props);
  }
  if (view === "manage-home") return renderManageHome(props);
  if (view === "lifecycle-home") return renderLifecycleHome(props);
  if (view === "switch-search") return renderSwitchSearch(props);
  if (view === "skills-home") return renderSkillsHome(props);
  if (view === "self-update-home") return renderSelfUpdateHome(props);
  if (view === "recovery-home") return renderRecoveryHome(props);
  return renderHomeBody(props);
}
