#!/usr/bin/env node
/**
 * Offline token catalog for installed design systems (`prism-ds tokens`).
 *
 * This is the read-only, offline counterpart of the registry `info` path for
 * the V4 semantic token catalog. It resolves the design system already installed
 * in a consumer and reports the token names declared by its public `./manifest`
 * export, mapped to the CSS custom properties and Tailwind theme names the
 * system's generated bridge actually emits. It never:
 *
 *   - installs, mutates, or writes anything;
 *   - executes installed package code, imports package internals, or reads the
 *     generated CSS/TypeScript token artifacts;
 *   - accesses the network;
 *   - reads the design-systems source repository;
 *   - reads `package.json` metadata to invent a token prefix (the prefixes come
 *     only from the validated `manifest.tokens.names`).
 *
 * Contract handling is dual-contract and fail-closed:
 *
 *   - V2 manifests declare no token schema; they produce a clear
 *     `supported: false` / no-token-catalog result and never throw, so V2
 *     connect/info/doctor remain unaffected;
 *   - V4 manifests must declare `tokens.names.cssVariablePrefix` and
 *     `tokens.names.tailwindUtilityPrefix`; a missing or invalid prefix fails
 *     closed with an actionable error.
 *
 * Name derivation mirrors `scripts/design-system-tokens.mjs` exactly:
 *
 *   CSS   `--<cssVariablePrefix>-<kebab semantic path>`; for theme colors the
 *         `light`/`dark` segment is omitted, so both themes share one variable.
 *   TW    the generated `@theme` bridge namespace: `--color-*`, `--font-*`,
 *         `--text-*`, `--font-weight-*`, `--leading-*`, `--tracking-*`,
 *         `--spacing-*` (scale/semantic subgroup dropped), `--container-*`,
 *         `--radius-*`, `--shadow-*`, `--ease-*`, and static `--breakpoint-*`.
 *
 * Theme colors are the one namespace where the bridge variable alone does not
 * name the class: `--color-*` generates the whole Tailwind color family, so
 * every role has many valid classes. Each theme color therefore reports one
 * deterministic, semantically representative class selected from its role:
 *
 *   text    -> `text-<prefix>-<path>`
 *   surface -> `bg-<prefix>-<path>`
 *   border  -> `border-<prefix>-<path>`
 *   action  -> `bg-<prefix>-<path>`
 *   status  -> `text-<prefix>-<path>`
 *
 * An unrecognized role falls back to the universal `bg-<prefix>-<path>`. Light
 * and dark share both the `--color-*` variable and its class. These are real
 * generated classes, never fabricated: a path with no `--color-*` variable (a
 * non-`color` theme subtree) still reports `tailwind: null`.
 *
 * Namespaces with no named bridge mapping (`layers`, motion `duration`) report
 * `tailwind: null`; they are never turned into fabricated utility classes.
 * Breakpoints are reported as variants, not utility classes.
 */

import { CONTRACT_V4, TOKEN_NAMESPACE_PATTERN, V4_TOKEN_GROUP_KEYS } from "./constants.mjs";
import {
  discoverConsumerPackage,
  resolveConsumerRoot,
  resolveInstalledDesignSystem,
  verifyConsumerDesignSystem,
} from "./consumer.mjs";
import { detectManifestContract, isUniqueStringArray } from "./manifest.mjs";

/** The reason a V2 manifest yields an empty token catalog. */
export const V2_NO_TOKEN_CATALOG_REASON =
  "V2 design systems declare no token catalog; the tokens catalog is a V4 " +
  "contract (manifest.tokens.groups plus manifest.tokens.names).";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected a non-empty string for "${label}".`);
  }
  return value.trim();
}

/** `primaryHover` -> `primary-hover`, `2xl` -> `2xl`, `lineHeight` -> `line-height`. */
function toKebab(segment) {
  return segment.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function kebabPath(path) {
  return path.map(toKebab).join("-");
}

/** Validate and normalize one required token prefix. Fails closed with a label. */
function normalizePrefix(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`V4 manifest ${label} must be a non-empty string.`);
  }
  const prefix = value.trim();
  if (!TOKEN_NAMESPACE_PATTERN.test(prefix)) {
    throw new Error(
      `V4 manifest ${label} ${JSON.stringify(prefix)} is not a safe lower-kebab namespace.`,
    );
  }
  return prefix;
}

/** Read the required `tokens.names` prefixes, or throw a clear failure. */
function readTokenPrefixes(manifest) {
  const tokens = isPlainObject(manifest.tokens) ? manifest.tokens : {};
  const names = tokens.names;
  if (!isPlainObject(names)) {
    throw new Error(
      'V4 manifest is missing "tokens.names"; a V4 token catalog requires ' +
        "tokens.names.cssVariablePrefix and tokens.names.tailwindUtilityPrefix.",
    );
  }
  return {
    css: normalizePrefix(names.cssVariablePrefix, "tokens.names.cssVariablePrefix"),
    tailwind: normalizePrefix(names.tailwindUtilityPrefix, "tokens.names.tailwindUtilityPrefix"),
  };
}

/**
 * Pick one representative Tailwind color class for a theme color path. The
 * generated `--color-*` bridge variable lives in the Tailwind color theme
 * namespace, so the entire color utility family (`text-*`, `bg-*`, `border-*`,
 * `ring-*`, …) is generated and any member is valid. The color role selects the
 * family a consumer reaches for first; an unrecognized role falls back to the
 * universal `bg-*` family. This never invents a class for a path that has no
 * color variable — the caller only reaches here for `color` subtrees.
 */
function colorUtility({ twPrefix, colorPath }) {
  const key = kebabPath(colorPath);
  switch (colorPath[0]) {
    case "text":
      return `text-${twPrefix}-${key}`;
    case "surface":
    case "action":
      return `bg-${twPrefix}-${key}`;
    case "border":
      return `border-${twPrefix}-${key}`;
    case "status":
      return `text-${twPrefix}-${key}`;
    default:
      return `bg-${twPrefix}-${key}`;
  }
}

/**
 * Map one token path to its generated Tailwind bridge entry, mirroring
 * `scripts/design-system-tokens.mjs`. Returns `null` when the group/subgroup has
 * no named bridge mapping (layers, motion duration, unknown subsets). Never
 * fabricates a class.
 */
function computeTailwind({ group, segments, twPrefix }) {
  switch (group) {
    case "themes": {
      // `light.color.text.primary` -> `--color-prism-text-primary`. The bridge
      // only aliases the shared `color` subtree; any other theme subtree has no
      // named mapping.
      if (segments[1] !== "color" || segments.length < 3) return null;
      const colorPath = segments.slice(2);
      return {
        namespace: "color",
        variable: `--color-${twPrefix}-${kebabPath(colorPath)}`,
        utility: colorUtility({ twPrefix, colorPath }),
        variant: null,
      };
    }
    case "typography": {
      const [kind, ...rest] = segments;
      if (rest.length === 0) return null;
      const key = kebabPath(rest);
      switch (kind) {
        case "family":
          return {
            namespace: "font",
            variable: `--font-${twPrefix}-${key}`,
            utility: `font-${twPrefix}-${key}`,
            variant: null,
          };
        case "size":
          return {
            namespace: "text",
            variable: `--text-${twPrefix}-${key}`,
            utility: `text-${twPrefix}-${key}`,
            variant: null,
          };
        case "weight":
          return {
            namespace: "font-weight",
            variable: `--font-weight-${twPrefix}-${key}`,
            utility: `font-${twPrefix}-${key}`,
            variant: null,
          };
        case "lineHeight":
          return {
            namespace: "leading",
            variable: `--leading-${twPrefix}-${key}`,
            utility: `leading-${twPrefix}-${key}`,
            variant: null,
          };
        case "letterSpacing":
          return {
            namespace: "tracking",
            variable: `--tracking-${twPrefix}-${key}`,
            utility: `tracking-${twPrefix}-${key}`,
            variant: null,
          };
        default:
          return null;
      }
    }
    case "spacing": {
      // The bridge drops the `scale`/`semantic` subgroup: `--spacing-prism-4`.
      if (segments.length < 2) return null;
      const key = toKebab(segments[1]);
      return {
        namespace: "spacing",
        variable: `--spacing-${twPrefix}-${key}`,
        utility: `p-${twPrefix}-${key}`,
        variant: null,
      };
    }
    case "containers": {
      const key = kebabPath(segments);
      return {
        namespace: "container",
        variable: `--container-${twPrefix}-${key}`,
        utility: `max-w-${twPrefix}-${key}`,
        variant: null,
      };
    }
    case "radius": {
      const key = kebabPath(segments);
      return {
        namespace: "radius",
        variable: `--radius-${twPrefix}-${key}`,
        utility: `rounded-${twPrefix}-${key}`,
        variant: null,
      };
    }
    case "shadow": {
      const key = kebabPath(segments);
      return {
        namespace: "shadow",
        variable: `--shadow-${twPrefix}-${key}`,
        utility: `shadow-${twPrefix}-${key}`,
        variant: null,
      };
    }
    case "motion": {
      // Only `easing` has a named bridge mapping; `duration` intentionally not.
      const [kind, ...rest] = segments;
      if (kind === "easing" && rest.length > 0) {
        const key = kebabPath(rest);
        return {
          namespace: "ease",
          variable: `--ease-${twPrefix}-${key}`,
          utility: `ease-${twPrefix}-${key}`,
          variant: null,
        };
      }
      return null;
    }
    case "breakpoints": {
      // Static build-time breakpoints: variants, not fabricated utility classes.
      const key = kebabPath(segments);
      return {
        namespace: "breakpoint",
        variable: `--breakpoint-${twPrefix}-${key}`,
        utility: null,
        variant: `${twPrefix}-${key}`,
      };
    }
    case "layers":
    default:
      return null;
  }
}

/**
 * Build one token entry: the semantic name, its CSS custom property, and its
 * generated Tailwind mapping (or `null` when there is no named mapping).
 */
function buildTokenEntry({ group, path, cssPrefix, twPrefix }) {
  const raw = requireNonEmptyString(path, `tokens.groups.${group} entry`);
  const segments = raw.split(".");
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Token path ${JSON.stringify(raw)} contains an empty segment.`);
  }

  let theme = null;
  let cssSegments;
  if (group === "themes") {
    // Manifest paths are group-relative: `light.color.text.primary`. The
    // generated CSS omits both the `themes` group and the theme segment, so
    // light and dark share one `--<prefix>-color-…` variable.
    if (segments.length < 2 || (segments[0] !== "light" && segments[0] !== "dark")) {
      throw new Error(
        `Unsupported theme token path ${JSON.stringify(raw)}; expected ` + '"<light|dark>.<...>".',
      );
    }
    theme = segments[0];
    cssSegments = segments.slice(1);
  } else {
    cssSegments = [group, ...segments];
  }

  return {
    name: cssSegments.join("."),
    path: raw,
    group,
    theme,
    cssVariable: `--${cssPrefix}-${kebabPath(cssSegments)}`,
    tailwind: computeTailwind({ group, segments, twPrefix }),
  };
}

/** Select a requested group, or throw a clear unknown-group error. */
function selectRequestedGroup({ requested, groups }) {
  const group = requireNonEmptyString(requested, "token group");
  if (!V4_TOKEN_GROUP_KEYS.includes(group)) {
    throw new Error(
      `Unknown token group ${JSON.stringify(group)}; known groups are: ` +
        `${V4_TOKEN_GROUP_KEYS.join(", ")}.`,
    );
  }
  const found = groups.find((entry) => entry.group === group);
  return found ?? { group, tokens: [] };
}

/**
 * Build the deterministic token catalog for an already-resolved manifest.
 *
 * Pure and offline: it reads only the manifest object it is given. Kept separate
 * from {@link listDesignSystemTokens} so the mapping rules can be exercised
 * against manifest data without any consumer or filesystem access.
 *
 * V2 returns a non-throwing `supported: false` result. V4 requires
 * `tokens.names.cssVariablePrefix` and `tokens.names.tailwindUtilityPrefix` and
 * fails closed when either is missing or invalid.
 *
 * @param {{ manifest: object, group?: string }} [options]
 * @returns {{
 *   contract: "v2" | "v4",
 *   supported: boolean,
 *   reason: string | null,
 *   id: string,
 *   name: string,
 *   prefixes: { css: string, tailwind: string } | null,
 *   groupNames: string[],
 *   groups: object[],
 *   counts: { groups: number, tokens: number },
 *   requested: object | null,
 * }}
 */
export function buildTokenCatalog({ manifest, group } = {}) {
  if (!isPlainObject(manifest)) {
    throw new Error("A design-system manifest object is required.");
  }
  const contract = detectManifestContract(manifest);
  if (contract === null) {
    throw new Error(
      'Unsupported design-system manifest; expected the (1, "v2") or (2, "v4") ' +
        "schema/contract pair.",
    );
  }

  if (contract !== CONTRACT_V4) {
    return {
      contract,
      supported: false,
      reason: V2_NO_TOKEN_CATALOG_REASON,
      id: manifest.id,
      name: manifest.name,
      prefixes: null,
      groupNames: [],
      groups: [],
      counts: { groups: 0, tokens: 0 },
      requested: null,
    };
  }

  const prefixes = readTokenPrefixes(manifest);
  const tokenGroups = isPlainObject(manifest.tokens.groups) ? manifest.tokens.groups : null;
  if (tokenGroups === null) {
    throw new Error('V4 manifest is missing "tokens.groups".');
  }
  for (const key of Object.keys(tokenGroups)) {
    if (!V4_TOKEN_GROUP_KEYS.includes(key)) {
      throw new Error(
        `Unsupported token group ${JSON.stringify(key)}; known groups are: ` +
          `${V4_TOKEN_GROUP_KEYS.join(", ")}.`,
      );
    }
  }

  const groups = V4_TOKEN_GROUP_KEYS.filter((key) => hasOwn(tokenGroups, key)).map((key) => {
    const paths = tokenGroups[key];
    if (!Array.isArray(paths) || !isUniqueStringArray(paths)) {
      throw new Error(`tokens.groups.${key} must be an array of unique non-empty strings.`);
    }
    return {
      group: key,
      tokens: paths.map((path) =>
        buildTokenEntry({ group: key, path, cssPrefix: prefixes.css, twPrefix: prefixes.tailwind }),
      ),
    };
  });

  const requested =
    group === undefined || group === null
      ? null
      : selectRequestedGroup({ requested: group, groups });

  return {
    contract,
    supported: true,
    reason: null,
    id: manifest.id,
    name: manifest.name,
    prefixes,
    groupNames: groups.map((entry) => entry.group),
    groups,
    counts: {
      groups: groups.length,
      tokens: groups.reduce((total, entry) => total + entry.tokens.length, 0),
    },
    requested,
  };
}

/**
 * Offline token catalog for the design system installed in a consumer.
 *
 * Resolves the consumer root, discovers the design system, resolves the
 * installed package through Node package resolution, and verifies it through the
 * public `./manifest` export with exact version/identity invariants. The token
 * prefixes are read only from `manifest.tokens.names`; no package.json metadata,
 * CSS artifact, code execution, write, or network access is used.
 *
 * @param {{ cwd?: string, group?: string }} [options] `cwd` is the required
 *   consumer root (it never falls back to a repository root); `group` optionally
 *   selects one of the nine V4 token groups.
 * @returns {{
 *   ok: true,
 *   supported: boolean,
 *   contract: "v2" | "v4",
 *   package: string,
 *   version: string,
 *   id: string,
 *   name: string,
 *   reason: string | null,
 *   prefixes: object | null,
 *   groupNames: string[],
 *   groups: object[],
 *   counts: object,
 *   requested: object | null,
 * }}
 */
export function listDesignSystemTokens({ cwd, group } = {}) {
  const consumerRoot = resolveConsumerRoot({ cwd });
  const discovered = discoverConsumerPackage({ consumerRoot });
  const installed = resolveInstalledDesignSystem({
    consumerRoot,
    packageName: discovered.packageName,
  });
  const { version } = verifyConsumerDesignSystem({
    packageName: discovered.packageName,
    expectedVersion: discovered.expectedVersion,
    installed,
  });
  const catalog = buildTokenCatalog({ manifest: installed.manifest, group });
  return {
    ok: true,
    supported: catalog.supported,
    contract: catalog.contract,
    package: discovered.packageName,
    version,
    id: catalog.id,
    name: catalog.name,
    reason: catalog.reason,
    prefixes: catalog.prefixes,
    groupNames: catalog.groupNames,
    groups: catalog.groups,
    counts: catalog.counts,
    requested: catalog.requested,
  };
}
