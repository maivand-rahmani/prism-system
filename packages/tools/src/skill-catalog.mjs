/**
 * Static, offline allowlist catalog for the `prism-ds skills` workflow.
 *
 * This module is pure data: it never reads the filesystem, never performs
 * network calls, and never invokes a subprocess. The catalog is the *only*
 * source of skill names, remote sources, and publishers that
 * {@link ./skills.mjs planSkillOperation} accepts, so a caller can never pass
 * an arbitrary repository or skill name through to a shell command.
 *
 * Review status is a declaration about how the entry was reviewed, not a live
 * popularity metric. The catalog deliberately contains no download counts,
 * star counts, or other fetched statistics: offline listings must not invent
 * numbers.
 *
 * The first-party entries point at the remote `maivand-rahmani/prism-system`
 * repository's SKILL.md instructions. This tooling never reads the local
 * design-systems source repository at runtime.
 */

/** Allowed catalog entry types. `prism` entries are first-party; `design` entries are reviewed third-party candidates. */
export const SKILL_CATALOG_TYPES = Object.freeze(["prism", "design"]);

/**
 * Review status values:
 * - `firstparty`: authored and maintained in the first-party repository.
 * - `reviewed`: an explicitly reviewed third-party skill from a named publisher.
 * - `experimental`: a narrow, low-adoption candidate that stays opt-in.
 */
export const SKILL_REVIEW_STATUSES = Object.freeze(["firstparty", "reviewed", "experimental"]);

/** Closed category vocabulary for catalog entries. */
export const SKILL_CATALOG_CATEGORIES = Object.freeze([
  "lifecycle",
  "authoring",
  "consumption",
  "frontend",
  "design-quality",
  "composition",
  "review",
  "motion",
  "interaction",
  "webgl",
]);

/** Closed role vocabulary for catalog entries. */
export const SKILL_ROLES = Object.freeze([
  "consumer",
  "authoring",
  "design-craft",
  "design-review",
  "composition",
  "interaction-craft",
  "experimental-rendering",
]);

/** The only first-party source allowed to publish `type: "prism"` entries. */
export const FIRSTPARTY_SKILL_SOURCE = "maivand-rahmani/prism-system";

/**
 * The closed source allowlist. Every catalog entry must reference one of these
 * sources by id; nothing else is installable through this tooling.
 */
export const SKILL_CATALOG_SOURCES = Object.freeze({
  [FIRSTPARTY_SKILL_SOURCE]: Object.freeze({
    id: FIRSTPARTY_SKILL_SOURCE,
    owner: "maivand-rahmani",
    repo: "prism-system",
    url: "https://github.com/maivand-rahmani/prism-system",
    publisher: "maivand-rahmani",
    trust: "firstparty",
  }),
  "anthropics/skills": Object.freeze({
    id: "anthropics/skills",
    owner: "anthropics",
    repo: "skills",
    url: "https://github.com/anthropics/skills",
    publisher: "anthropics",
    trust: "reviewed",
  }),
  "vercel-labs/agent-skills": Object.freeze({
    id: "vercel-labs/agent-skills",
    owner: "vercel-labs",
    repo: "agent-skills",
    url: "https://github.com/vercel-labs/agent-skills",
    publisher: "vercel-labs",
    trust: "reviewed",
  }),
  "pbakaus/impeccable": Object.freeze({
    id: "pbakaus/impeccable",
    owner: "pbakaus",
    repo: "impeccable",
    url: "https://github.com/pbakaus/impeccable",
    publisher: "pbakaus",
    trust: "reviewed",
  }),
  "emilkowalski/skills": Object.freeze({
    id: "emilkowalski/skills",
    owner: "emilkowalski",
    repo: "skills",
    url: "https://github.com/emilkowalski/skills",
    publisher: "emilkowalski",
    trust: "reviewed",
  }),
  "JetBrains/skills": Object.freeze({
    id: "JetBrains/skills",
    owner: "JetBrains",
    repo: "skills",
    url: "https://github.com/JetBrains/skills",
    publisher: "JetBrains",
    trust: "experimental",
  }),
});

/** Fields every catalog entry must declare. */
const ENTRY_FIELDS = Object.freeze([
  "id",
  "skill",
  "source",
  "publisher",
  "type",
  "categories",
  "tags",
  "role",
  "reviewStatus",
]);

/** Fields that would imply fabricated or fetched statistics; they are forbidden. */
const FORBIDDEN_STAT_FIELDS = Object.freeze([
  "downloads",
  "installs",
  "stars",
  "popularity",
  "stats",
  "trending",
]);

const SKILL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function defineSkill(entry) {
  const source = SKILL_CATALOG_SOURCES[entry.source];
  return Object.freeze({
    id: entry.id,
    skill: entry.skill,
    source: entry.source,
    publisher: source.publisher,
    type: entry.type,
    categories: Object.freeze([...entry.categories]),
    tags: Object.freeze([...entry.tags]),
    role: entry.role,
    reviewStatus: entry.reviewStatus,
  });
}

/**
 * The canonical allowlist, in display order: first-party lifecycle skills
 * first, then reviewed design candidates, then the experimental candidate.
 *
 * `use-design-system` and `switch-design-system` are consumer-facing roles;
 * `create-design-system` and `modify-design-system` are authoring roles.
 */
export const SKILL_CATALOG = Object.freeze([
  defineSkill({
    id: "use-design-system",
    skill: "use-design-system",
    source: FIRSTPARTY_SKILL_SOURCE,
    type: "prism",
    categories: ["lifecycle", "consumption"],
    tags: ["design-system", "consumer", "setup", "connect"],
    role: "consumer",
    reviewStatus: "firstparty",
  }),
  defineSkill({
    id: "create-design-system",
    skill: "create-design-system",
    source: FIRSTPARTY_SKILL_SOURCE,
    type: "prism",
    categories: ["lifecycle", "authoring"],
    tags: ["design-system", "scaffold", "factory"],
    role: "authoring",
    reviewStatus: "firstparty",
  }),
  defineSkill({
    id: "modify-design-system",
    skill: "modify-design-system",
    source: FIRSTPARTY_SKILL_SOURCE,
    type: "prism",
    categories: ["lifecycle", "authoring"],
    tags: ["design-system", "components", "tokens"],
    role: "authoring",
    reviewStatus: "firstparty",
  }),
  defineSkill({
    id: "switch-design-system",
    skill: "switch-design-system",
    source: FIRSTPARTY_SKILL_SOURCE,
    type: "prism",
    categories: ["lifecycle", "authoring"],
    tags: ["design-system", "registry", "switch"],
    role: "consumer",
    reviewStatus: "firstparty",
  }),
  defineSkill({
    id: "frontend-design",
    skill: "frontend-design",
    source: "anthropics/skills",
    type: "design",
    categories: ["frontend", "design-quality"],
    tags: ["ui", "visual-design"],
    role: "design-craft",
    reviewStatus: "reviewed",
  }),
  defineSkill({
    id: "web-design-guidelines",
    skill: "web-design-guidelines",
    source: "vercel-labs/agent-skills",
    type: "design",
    categories: ["frontend", "design-quality", "review"],
    tags: ["web", "guidelines", "accessibility"],
    role: "design-review",
    reviewStatus: "reviewed",
  }),
  defineSkill({
    id: "vercel-composition-patterns",
    skill: "vercel-composition-patterns",
    source: "vercel-labs/agent-skills",
    type: "design",
    categories: ["frontend", "composition"],
    tags: ["react", "patterns"],
    role: "composition",
    reviewStatus: "reviewed",
  }),
  defineSkill({
    id: "critique",
    skill: "critique",
    source: "pbakaus/impeccable",
    type: "design",
    categories: ["review"],
    tags: ["critique", "feedback"],
    role: "design-review",
    reviewStatus: "reviewed",
  }),
  defineSkill({
    id: "delight",
    skill: "delight",
    source: "pbakaus/impeccable",
    type: "design",
    categories: ["design-quality", "motion"],
    tags: ["polish", "microinteractions"],
    role: "design-craft",
    reviewStatus: "reviewed",
  }),
  defineSkill({
    id: "emil-design-eng",
    skill: "emil-design-eng",
    source: "emilkowalski/skills",
    type: "design",
    categories: ["frontend", "interaction", "motion"],
    tags: ["interaction", "animation"],
    role: "interaction-craft",
    reviewStatus: "reviewed",
  }),
  defineSkill({
    id: "webgpu-threejs-tsl",
    skill: "webgpu-threejs-tsl",
    source: "JetBrains/skills",
    type: "design",
    categories: ["webgl"],
    tags: ["webgpu", "threejs", "experimental", "low-adoption"],
    role: "experimental-rendering",
    reviewStatus: "experimental",
  }),
]);

/** The frozen catalog array. Offline: no stats, no fetches, no counts. */
export function listSkillCatalog() {
  return SKILL_CATALOG;
}

/** The frozen source allowlist as an array, in declaration order. */
export function listSkillCatalogSources() {
  return Object.freeze(Object.values(SKILL_CATALOG_SOURCES));
}

/** Resolve one allowlisted source record, or `null`. */
export function getSkillCatalogSource(sourceId) {
  if (typeof sourceId !== "string") return null;
  return SKILL_CATALOG_SOURCES[sourceId] ?? null;
}

/** Resolve one catalog entry by its stable id, or `null`. */
export function getSkillCatalogEntry(skillId) {
  if (typeof skillId !== "string") return null;
  return SKILL_CATALOG.find((entry) => entry.id === skillId) ?? null;
}

/** Resolve one catalog entry by the upstream skill name, or `null`. */
export function getSkillCatalogEntryBySkill(skillName) {
  if (typeof skillName !== "string") return null;
  return SKILL_CATALOG.find((entry) => entry.skill === skillName) ?? null;
}

/**
 * Validate the static catalog invariants. Exported so tests can assert the
 * catalog stays a closed, duplicate-free, statistics-free allowlist.
 *
 * @returns {string[]} failure messages (empty when the catalog is valid)
 */
export function collectSkillCatalogFailures() {
  const failures = [];
  const seenIds = new Set();
  const seenSkills = new Set();

  for (const entry of SKILL_CATALOG) {
    const label = `catalog entry ${JSON.stringify(entry.id ?? null)}`;
    for (const field of ENTRY_FIELDS) {
      if (entry[field] === undefined || entry[field] === null) {
        failures.push(`${label} is missing required field "${field}".`);
      }
    }
    for (const field of FORBIDDEN_STAT_FIELDS) {
      if (field in entry) {
        failures.push(`${label} must not carry fabricated statistic "${field}".`);
      }
    }
    if (typeof entry.id !== "string" || !SKILL_NAME_PATTERN.test(entry.id)) {
      failures.push(`${label} id must be lower-kebab-case.`);
    }
    if (typeof entry.skill !== "string" || !SKILL_NAME_PATTERN.test(entry.skill)) {
      failures.push(`${label} skill must be lower-kebab-case.`);
    }
    if (seenIds.has(entry.id)) failures.push(`${label} duplicates catalog id.`);
    if (seenSkills.has(entry.skill)) failures.push(`${label} duplicates skill name.`);
    seenIds.add(entry.id);
    seenSkills.add(entry.skill);

    const source = SKILL_CATALOG_SOURCES[entry.source];
    if (!source) {
      failures.push(`${label} references unknown source ${JSON.stringify(entry.source)}.`);
    } else if (entry.publisher !== source.publisher) {
      failures.push(`${label} publisher must match its source publisher.`);
    }
    if (!SKILL_CATALOG_TYPES.includes(entry.type)) {
      failures.push(`${label} type must be one of ${SKILL_CATALOG_TYPES.join(", ")}.`);
    }
    if (!SKILL_REVIEW_STATUSES.includes(entry.reviewStatus)) {
      failures.push(`${label} reviewStatus must be one of ${SKILL_REVIEW_STATUSES.join(", ")}.`);
    }
    if (!SKILL_ROLES.includes(entry.role)) {
      failures.push(`${label} role must be one of ${SKILL_ROLES.join(", ")}.`);
    }
    if (!Array.isArray(entry.categories) || entry.categories.length === 0) {
      failures.push(`${label} categories must be a non-empty array.`);
    } else {
      for (const category of entry.categories) {
        if (!SKILL_CATALOG_CATEGORIES.includes(category)) {
          failures.push(`${label} has unknown category ${JSON.stringify(category)}.`);
        }
      }
    }
    if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
      failures.push(`${label} tags must be a non-empty array.`);
    }

    if (entry.type === "prism" && entry.source !== FIRSTPARTY_SKILL_SOURCE) {
      failures.push(`${label} type "prism" must come from ${FIRSTPARTY_SKILL_SOURCE}.`);
    }
    if (entry.type === "design" && entry.source === FIRSTPARTY_SKILL_SOURCE) {
      failures.push(`${label} type "design" must not come from the first-party source.`);
    }
  }

  const consumerRoleIds = ["use-design-system", "switch-design-system"];
  const authoringRoleIds = ["create-design-system", "modify-design-system"];
  for (const id of consumerRoleIds) {
    const entry = getSkillCatalogEntry(id);
    if (entry && entry.role !== "consumer") {
      failures.push(`catalog entry ${JSON.stringify(id)} must keep the consumer role.`);
    }
  }
  for (const id of authoringRoleIds) {
    const entry = getSkillCatalogEntry(id);
    if (entry && entry.role !== "authoring") {
      failures.push(`catalog entry ${JSON.stringify(id)} must keep the authoring role.`);
    }
  }

  return failures;
}
