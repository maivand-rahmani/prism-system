/**
 * Descriptive metadata a design system can expose for tooling and agents.
 *
 * These types carry semantic descriptors only; they never contain concrete
 * token values. This mirrors the structured `design-system.json` manifest, but
 * no manifest tooling is implemented in core.
 */

/** Semantic density descriptor. */
export type DesignDensity = "compact" | "comfortable" | "spacious";

/** Theme strategy descriptor. */
export type DesignTheme = "light-first" | "dark-first" | "dual";

/** Semantic radius descriptor. */
export type DesignRadius = "none" | "small" | "medium" | "large" | "full";

export interface DesignLanguage {
  density?: DesignDensity;
  theme?: DesignTheme;
  radius?: DesignRadius;
  /** Free-form visual keywords such as "technical" or "restrained". */
  keywords?: readonly string[];
}

export interface ComponentManifestEntry {
  description?: string;
  variants?: readonly string[];
  sizes?: readonly string[];
  states?: readonly string[];
}

export interface DesignSystemRules {
  allowArbitraryColors?: boolean;
  allowArbitraryRadius?: boolean;
  allowArbitraryShadows?: boolean;
  allowPrimitiveDuplication?: boolean;
}

export interface DesignSystemManifest {
  name: string;
  package: string;
  version: string;
  components: Record<string, ComponentManifestEntry>;
  rules?: DesignSystemRules;
  design?: DesignLanguage;
}
