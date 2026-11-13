export const SYSTEM_TABS = [
  {
    id: "systems",
    label: "Systems",
  },
  {
    id: "components",
    label: "Components",
  },
  {
    id: "tokens",
    label: "Tokens",
  },
  {
    id: "checks",
    label: "Checks",
  },
  {
    id: "icons",
    label: "Icons",
  },
];

export const CATEGORY_NAMES = new Set(["composition", "forms", "data-display"]);

export const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const MANAGED_FILE_KINDS = new Set([
  "package-json",
  "root-agents",
  "design-system-config",
  "legacy-agents",
]);

export const SKILL_AGENT_IDS = Object.freeze(["claude-code", "codex", "cursor", "opencode"]);

/** Preserve the allowlist's canonical order even if a service exposes a subset. */
export function skillAgentIdsFor(services) {
  const configured = Array.isArray(services?.skillAgentIds)
    ? new Set(services.skillAgentIds)
    : new Set(SKILL_AGENT_IDS);
  return SKILL_AGENT_IDS.filter((agent) => configured.has(agent));
}
