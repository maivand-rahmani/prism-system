/**
 * Shared headless `prism-ds use` orchestrator: design-system setup plus the
 * default consumer skill.
 *
 * This is the single place where the CLI and the TUI combine the existing
 * lifecycle with the skills engine, so neither front end duplicates logic:
 *
 *   - the design-system side is exactly `runUseDesignSystem` (its programmatic
 *     behavior is unchanged: preview, install, verify, connect, optional usage
 *     check and Tailwind setup);
 *   - the skills side is `planSkillOperation` + `executeSkillOperation` for the
 *     single consumer-facing catalog skill (`use-design-system`), project scope
 *     only, through the pinned upstream CLI.
 *
 * Safety rules:
 *
 *   - A real run with skills enabled requires `confirmed: true`; without it
 *     nothing is installed, written, or spawned. `skills: false` is a pure
 *     passthrough to `runUseDesignSystem` and keeps the original behavior.
 *   - A preview (`dryRun: true`) never writes or spawns: the exact resolved
 *     design-system target and connect plan plus the frozen skill plan are
 *     returned for review.
 *   - The previewed design-system version and connect plan and the frozen skill
 *     plan (including the resolved 40-hex source revision) are reused on the
 *     confirmed run, so consent applies to exactly the reviewed bytes.
 *   - Agent selection is explicit or exactly one reliably detected agent. Zero
 *     or multiple detections produce a `pending` state with guidance; nothing is
 *     guessed and nothing is installed for every provider.
 *   - A skill failure never rolls back a completed design-system setup. The
 *     result reports `systemReady`, `partial` and `skillSetup` separately, with
 *     an actionable next command.
 *   - Exit semantics (`ok`): the design-system result governs unless the caller
 *     explicitly requested a skill setup (`skillAgents` given) and that setup
 *     did not settle (`installed`/`noop`); then `ok` is false. An unresolved
 *     agent selection never blocks the design-system setup.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";

import { runUseDesignSystem } from "./catalog.mjs";
import {
  MIN_SKILLS_NODE_VERSION,
  SKILL_AGENT_IDS,
  executeSkillOperation,
  planSkillOperation,
} from "./skills.mjs";
import { detectInstalledSkillAgents } from "./skill-inventory.mjs";

/** The one consumer-facing catalog skill installed by the `use` hook. */
export const USE_SKILL_ID = "use-design-system";
/** The `use` hook always installs at project scope. */
export const USE_SKILL_SCOPE = "project";

const SETTLED_STATUSES = Object.freeze(["installed", "noop"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function skillCommandPreview(plan) {
  if (!isPlainObject(plan?.command)) return null;
  return {
    executable: plan.command.executable,
    package: plan.command.package,
    args: [...plan.command.args],
    cwd: plan.command.cwd,
    scope: plan.command.scope,
  };
}

function skillNextCommand({ action, cwd, agents }) {
  const agentFlags = agents.map((agent) => ` --agent ${agent}`).join("");
  return `prism-ds skills ${action} ${USE_SKILL_ID} --cwd ${cwd}${agentFlags} --yes`;
}

function skillRemedy({ plan, cwd, agents }) {
  const failures = plan?.failures ?? [];
  if (failures.some((failure) => failure.includes(`Node >= ${MIN_SKILLS_NODE_VERSION}`))) {
    return (
      `Upgrade Node to >= ${MIN_SKILLS_NODE_VERSION} to run the pinned skills CLI, ` +
      "or re-run with --no-skills to skip instruction setup."
    );
  }
  if (failures.some((failure) => /use the update action/.test(failure))) {
    return `Run "${skillNextCommand({ action: "update", cwd, agents })}" to move the managed skill to the previewed revision.`;
  }
  if (failures.some((failure) => /refusing to replace it|unmanaged/i.test(failure))) {
    return (
      "Resolve the existing unmanaged placement first (or remove it with the upstream " +
      "skills CLI), then re-run; prism-ds never overwrites an unmanaged skill."
    );
  }
  if (failures.some((failure) => /fetch|network|registry|GitHub/i.test(failure))) {
    return "Re-run when the bounded source read can succeed; nothing was installed.";
  }
  return `Review the failures and re-run "${skillNextCommand({ action: "add", cwd, agents })}" when resolved.`;
}

function agentGuidance({ reason, detected }) {
  const allowed = SKILL_AGENT_IDS.join(", ");
  if (reason === "multiple-agents-detected") {
    return (
      `Multiple supported agent configurations were detected (${detected.join(", ")}); ` +
      `pass --skill-agent <id> to choose exactly one (${allowed}), or --no-skills to skip ` +
      "instruction setup. Nothing was installed for any provider."
    );
  }
  return (
    `No supported agent configuration was detected; pass --skill-agent <id> to choose one ` +
    `explicitly (${allowed}), or --no-skills to skip instruction setup.`
  );
}

/**
 * Resolve the agents for the use hook: explicit allowlisted selection, or
 * exactly one reliably detected agent configuration. Never guesses.
 *
 * @returns {{
 *   ok: boolean,
 *   requested: boolean,
 *   agents: string[],
 *   detected: string[],
 *   reason: string | null,
 *   failures: string[],
 * }}
 */
export function resolveUseSkillAgents({ skillAgents, homeDir, env, pathExists } = {}) {
  const explicit = Array.isArray(skillAgents)
    ? skillAgents.filter((agent) => typeof agent === "string" && agent.trim() !== "")
    : [];
  if (explicit.length > 0) {
    const invalid = [...new Set(explicit.filter((agent) => !SKILL_AGENT_IDS.includes(agent)))];
    if (invalid.length > 0) {
      return {
        ok: false,
        requested: true,
        agents: [],
        detected: [],
        reason: "invalid-agent-selection",
        failures: [
          `Unsupported skill agent(s): ${invalid.join(", ")}. Allowed agents: ` +
            `${SKILL_AGENT_IDS.join(", ")}.`,
        ],
      };
    }
    const agents = SKILL_AGENT_IDS.filter((agent) => explicit.includes(agent));
    return { ok: true, requested: true, agents, detected: agents, reason: null, failures: [] };
  }
  const detected = detectInstalledSkillAgents({ homeDir, env, pathExists });
  if (detected.length === 1) {
    return { ok: true, requested: false, agents: detected, detected, reason: null, failures: [] };
  }
  return {
    ok: false,
    requested: false,
    agents: [],
    detected,
    reason: detected.length === 0 ? "no-agent-detected" : "multiple-agents-detected",
    failures: [],
  };
}

function buildSkillSetup({
  resolution,
  status,
  reason,
  failures,
  warnings,
  guidance,
  nextCommand,
  plan,
  result,
}) {
  return {
    enabled: true,
    status,
    skillId: USE_SKILL_ID,
    scope: USE_SKILL_SCOPE,
    agents: resolution.agents,
    requested: resolution.requested,
    detected: resolution.detected,
    reason,
    failures,
    warnings,
    guidance,
    nextCommand,
    plan: plan ?? null,
    result: result ?? null,
    revision: plan?.expectedPlan?.revision ?? null,
    storePath: plan?.storePath ?? null,
    command: skillCommandPreview(plan),
  };
}

function confirmationRequired() {
  return {
    ok: false,
    boundary: "confirmation-required",
    failures: [
      "use requires confirmed:true after an explicit preview; nothing was installed, " +
        "written, or spawned.",
    ],
    dryRun: false,
    systemReady: false,
    partial: false,
    skillRequested: false,
    skillSetup: {
      enabled: true,
      status: "pending-confirmation",
      skillId: USE_SKILL_ID,
      scope: USE_SKILL_SCOPE,
      agents: [],
      requested: false,
      detected: [],
      reason: "confirmation-required",
      failures: [],
      warnings: [],
      guidance: "Preview with dryRun:true, review the plan, then confirm with confirmed:true.",
      nextCommand: null,
      plan: null,
      result: null,
      revision: null,
      storePath: null,
      command: null,
    },
    use: null,
  };
}

/**
 * Run `use` with the default skill setup.
 *
 * Accepts every `runUseDesignSystem` option plus:
 *
 * @param {object} [options]
 * @param {boolean} [options.skills=true] Set false for a pure passthrough to
 *   `runUseDesignSystem` (exactly the previous behavior).
 * @param {string[]} [options.skillAgents] Explicit allowlisted agents.
 * @param {boolean} [options.dryRun] Preview only; never writes or spawns.
 * @param {boolean} [options.confirmed] Required for a real run with skills
 *   enabled.
 * @param {{use?: object, skillPlan?: object}} [options.preview] A previously
 *   returned preview; its frozen version/connect plan/skill plan are reused.
 * @param {string} [options.homeDir] Home used for agent detection and stores.
 * @param {object} [options.env]
 * @param {string} [options.nodeVersion] Injected runtime version (tests/TUI).
 * @param {Function} [options.skillFetchImpl] Bounded source-read injection.
 * @param {Function} [options.skillSpawnImpl] Pinned-CLI runner injection.
 * @param {Function} [options.now]
 */
export async function runUseWithSkills(options = {}) {
  const {
    skills = true,
    skillAgents = [],
    preview = null,
    confirmed = false,
    dryRun = false,
    homeDir = homedir(),
    env = process.env,
    nodeVersion,
    skillFetchImpl,
    skillSpawnImpl,
    skillPlatform,
    now,
    ...useOptions
  } = options;

  if (skills === false) {
    const use = await runUseDesignSystem({ ...useOptions, dryRun });
    return {
      ...use,
      ok: use.ok === true,
      systemReady: use.ok === true,
      partial: false,
      skillRequested: false,
      skillSetup: {
        enabled: false,
        status: "disabled",
        skillId: USE_SKILL_ID,
        scope: USE_SKILL_SCOPE,
        agents: [],
        requested: false,
        detected: [],
        reason: "disabled",
        failures: [],
        warnings: [],
        guidance: null,
        nextCommand: null,
        plan: null,
        result: null,
        revision: null,
        storePath: null,
        command: null,
      },
      use,
    };
  }

  if (dryRun !== true && confirmed !== true) {
    return confirmationRequired();
  }

  const resolvedHome = resolve(homeDir);
  const resolution = resolveUseSkillAgents({ skillAgents, homeDir: resolvedHome, env });

  // Invalid explicit selection is an argument-level failure: fail closed before
  // any registry read or mutation.
  if (!resolution.ok && resolution.requested) {
    return {
      ok: false,
      boundary: "skills",
      failures: resolution.failures,
      dryRun,
      systemReady: false,
      partial: false,
      skillRequested: true,
      skillSetup: buildSkillSetup({
        resolution,
        status: "blocked",
        reason: "invalid-agent-selection",
        failures: resolution.failures,
        warnings: [],
        guidance: `Allowed agents: ${SKILL_AGENT_IDS.join(", ")}.`,
        nextCommand: null,
      }),
      use: null,
    };
  }

  // 1. Design-system preview first: the exact target version and connect plan
  //    are frozen before any skill source read or mutation.
  const providedUse = isPlainObject(preview) ? preview.use : null;
  const usePreview =
    isPlainObject(providedUse) && providedUse.ok === true
      ? providedUse
      : await runUseDesignSystem({ ...useOptions, dryRun: true });
  if (usePreview.ok !== true) {
    return {
      ...usePreview,
      systemReady: false,
      partial: false,
      skillRequested: resolution.requested,
      skillSetup: buildSkillSetup({
        resolution,
        status: "skipped",
        reason: "system-preview-failed",
        failures: usePreview.failures ?? [],
        warnings: [],
        guidance: "Resolve the design-system plan failures first; skill setup was not attempted.",
        nextCommand: null,
      }),
      use: usePreview,
    };
  }
  const consumerRoot = usePreview.install.consumerRoot;

  // 2. Skill plan (or the caller's frozen plan).
  let skillPlan = null;
  const providedPlan = isPlainObject(preview) ? preview.skillPlan : null;
  if (providedPlan !== null && providedPlan !== undefined) {
    if (providedPlan.ok !== true || providedPlan.action !== "add") {
      return {
        ...usePreview,
        ok: false,
        boundary: "skills",
        systemReady: true,
        partial: true,
        skillRequested: resolution.requested,
        skillSetup: buildSkillSetup({
          resolution,
          status: "blocked",
          reason: "invalid-skill-plan",
          failures: ["The supplied preview.skillPlan is not a successful add plan."],
          warnings: [],
          guidance: "Re-run the preview to obtain a valid frozen skill plan.",
          nextCommand: null,
        }),
        use: usePreview,
      };
    }
    skillPlan = providedPlan;
  } else if (resolution.ok) {
    skillPlan = await planSkillOperation({
      action: "add",
      skillId: USE_SKILL_ID,
      cwd: consumerRoot,
      scope: USE_SKILL_SCOPE,
      agents: resolution.agents,
      homeDir: resolvedHome,
      env,
      nodeVersion,
      fetchImpl: skillFetchImpl,
      now,
    });
  }

  // 3. A pending default selection never blocks the design-system setup; it is
  //    reported and the skill step is skipped.
  const pendingSelection = !resolution.ok;
  const planBlocked = !pendingSelection && (skillPlan === null || skillPlan.ok !== true);
  const blockedFailures = planBlocked
    ? (skillPlan?.failures ?? ["The skill plan could not be produced."])
    : [];

  // 4. Dry run: both plans are returned; nothing was written or spawned.
  if (dryRun === true) {
    const status = pendingSelection
      ? "pending"
      : planBlocked
        ? "blocked"
        : skillPlan.expectedPlan?.noop === true
          ? "noop"
          : "planned";
    const requestedBlocked = resolution.requested && planBlocked;
    return {
      ...usePreview,
      ok: usePreview.ok && !requestedBlocked,
      dryRun: true,
      systemReady: true,
      partial: false,
      skillRequested: resolution.requested,
      skillSetup: buildSkillSetup({
        resolution,
        status,
        reason: pendingSelection
          ? resolution.reason
          : planBlocked
            ? "skill-plan-failed"
            : skillPlan.expectedPlan?.noop === true
              ? "noop"
              : null,
        failures: pendingSelection ? resolution.failures : blockedFailures,
        warnings: skillPlan?.warnings ?? [],
        guidance: pendingSelection
          ? agentGuidance(resolution)
          : planBlocked
            ? skillRemedy({ plan: skillPlan, cwd: consumerRoot, agents: resolution.agents })
            : null,
        nextCommand:
          planBlocked && !pendingSelection
            ? skillNextCommand({ action: "add", cwd: consumerRoot, agents: resolution.agents })
            : null,
        plan: skillPlan,
      }),
      skillPlan,
      use: usePreview,
    };
  }

  // 5. Confirmed real run: install/verify/connect the design system first,
  //    reusing the frozen exact version and the previewed connect plan.
  const use = await runUseDesignSystem({
    ...useOptions,
    version: usePreview.install.version,
    dryRun: false,
    expectedConnectPlan: usePreview.connectPlan,
  });
  if (use.ok !== true) {
    return {
      ...use,
      systemReady: false,
      partial: false,
      skillRequested: resolution.requested,
      skillSetup: buildSkillSetup({
        resolution,
        status: "skipped",
        reason: "system-setup-failed",
        failures: use.failures ?? [],
        warnings: [],
        guidance: "The design-system setup did not complete; skill setup was not attempted.",
        nextCommand: null,
        plan: skillPlan,
      }),
      skillPlan,
      use,
    };
  }

  // 6. Design system is ready. A pending selection or a blocked/failed skill
  //    step never rolls back the completed design-system setup.
  let skillResult = null;
  let status;
  let reason = null;
  let failures = [];
  let warnings = skillPlan?.warnings ?? [];
  if (pendingSelection) {
    status = "pending";
    reason = resolution.reason;
    failures = resolution.failures;
  } else if (planBlocked) {
    status = "blocked";
    reason = "skill-plan-failed";
    failures = blockedFailures;
  } else if (skillPlan.expectedPlan?.noop === true) {
    status = "noop";
    reason = "noop";
  } else {
    skillResult = await executeSkillOperation({
      action: "add",
      skillId: USE_SKILL_ID,
      cwd: consumerRoot,
      scope: USE_SKILL_SCOPE,
      agents: resolution.agents,
      plan: skillPlan,
      confirmed: true,
      homeDir: resolvedHome,
      env,
      nodeVersion,
      fetchImpl: skillFetchImpl,
      spawnImpl: skillSpawnImpl,
      platform: skillPlatform,
      now,
    });
    if (skillResult.ok === true) {
      status = skillResult.executed === true ? "installed" : "noop";
      reason = skillResult.executed === true ? null : (skillResult.reason ?? "noop");
      warnings = skillResult.warnings ?? warnings;
    } else {
      status = "failed";
      reason = "skill-execute-failed";
      failures = skillResult.failures ?? [];
    }
  }

  const settled = SETTLED_STATUSES.includes(status);
  const skillRequestedFailure = resolution.requested && !settled;
  const guidance = pendingSelection
    ? agentGuidance(resolution)
    : settled
      ? null
      : skillRemedy({ plan: { failures }, cwd: consumerRoot, agents: resolution.agents });
  return {
    ...use,
    ok: use.ok === true && !skillRequestedFailure,
    boundary: skillRequestedFailure ? "skills" : use.boundary,
    failures: skillRequestedFailure ? failures : use.failures,
    systemReady: true,
    partial: !settled,
    skillRequested: resolution.requested,
    skillSetup: buildSkillSetup({
      resolution,
      status,
      reason,
      failures,
      warnings,
      guidance,
      nextCommand: settled
        ? null
        : skillNextCommand({ action: "add", cwd: consumerRoot, agents: resolution.agents }),
      plan: skillPlan,
      result: skillResult,
    }),
    skillPlan,
    skillResult,
    use,
  };
}
