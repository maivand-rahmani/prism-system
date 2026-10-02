import type {
  RegisteredManifestEffectRendering,
  RegisteredManifestEffects,
  RegisteredSystem,
} from "./registry";

export type CatalogEffectFilters = {
  motion: boolean;
  depth: boolean;
  rendering: RegisteredManifestEffectRendering | "all";
};

export const DEFAULT_CATALOG_EFFECT_FILTERS: CatalogEffectFilters = {
  motion: false,
  depth: false,
  rendering: "all",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDeclaredEffects(value: unknown): RegisteredManifestEffects | null {
  if (!isRecord(value) || !isRecord(value.effects)) return null;
  const effects = value.effects;
  if (
    !Array.isArray(effects.features) ||
    typeof effects.rendering !== "string" ||
    typeof effects.reducedMotion !== "boolean"
  ) {
    return null;
  }
  return effects as unknown as RegisteredManifestEffects;
}

/** Read only effects explicitly published on a canonical or extension entry. */
export function catalogEffectsFor(
  system: RegisteredSystem,
  name: string,
): RegisteredManifestEffects | null {
  const canonical = system.manifest.components[name];
  if (canonical !== undefined) return readDeclaredEffects(canonical);
  return readDeclaredEffects(system.manifest.extensions?.[name]);
}

export function hasDeclaredCatalogEffects(system: RegisteredSystem): boolean {
  return (
    Object.values(system.manifest.components).some(
      (entry) => readDeclaredEffects(entry) !== null,
    ) ||
    Object.values(system.manifest.extensions ?? {}).some(
      (entry) => readDeclaredEffects(entry) !== null,
    )
  );
}

export function matchesCatalogEffectFilters(
  effects: RegisteredManifestEffects | null,
  filters: CatalogEffectFilters,
): boolean {
  const active = filters.motion || filters.depth || filters.rendering !== "all";
  if (!active) return true;
  if (!effects) return false;
  if (filters.motion && !effects.features.includes("motion")) return false;
  if (filters.depth && !effects.features.includes("depth")) return false;
  if (filters.rendering !== "all" && effects.rendering !== filters.rendering) return false;
  return true;
}

export function effectLabels(effects: RegisteredManifestEffects | null): string[] {
  if (!effects) return [];
  const featureLabels = effects.features.map((feature) =>
    feature === "3d" ? "3D" : feature === "depth" ? "Depth" : "Motion",
  );
  return [
    ...featureLabels,
    effects.rendering.toUpperCase(),
    `Reduced motion ${effects.reducedMotion ? "supported" : "not supported"}`,
    ...(effects.fallback ? [`${effects.fallback} fallback`] : []),
  ];
}

export function effectsSummary(effects: RegisteredManifestEffects | null): string {
  return effects ? effectLabels(effects).join(" · ") : "Effects not declared";
}
