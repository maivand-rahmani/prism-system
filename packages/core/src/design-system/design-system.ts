import type { DesignSystemComponents, DesignSystemComponentsV2 } from "./components.js";
import type { DesignLanguage, DesignSystemRules } from "./manifest.js";

export interface DesignSystemMeta {
  description?: string;
  design?: DesignLanguage;
  rules?: DesignSystemRules;
  docsUrl?: string;
  repositoryUrl?: string;
}

/**
 * A design system as consumable by Showcase and Reference App.
 *
 * The data-driven contract is the `components` map: both applications render the
 * same JSX tree and only swap which registered system object is provided, so the
 * interface structure never changes when the system changes.
 *
 * `TComponents` defaults to the V1 {@link DesignSystemComponents} map, so
 * existing V1 systems and consumers keep working unchanged. V2 systems
 * instantiate it with {@link DesignSystemComponentsV2} via `defineDesignSystemV2`.
 */
export interface DesignSystem<TComponents extends DesignSystemComponents = DesignSystemComponents> {
  /** Stable machine identifier, e.g. `"system-a"`. */
  id: string;
  /** Human readable name, e.g. `"System A"`. */
  name: string;
  /** npm package name, e.g. `"@prism-system/ui-system-a"`. */
  packageName: string;
  /** Package version. */
  version: string;
  /** The required components for the declared contract. */
  components: TComponents;
  /** Identifies which component contract the map satisfies. Defaults to V1. */
  componentContract?: "v1" | "v2";
  meta?: DesignSystemMeta;
}

/** Identity helper that preserves the literal type of the definition. */
export function defineDesignSystem<const T extends DesignSystem>(system: T): T {
  return system;
}

/**
 * A V2 design system: the fourteen-component contract plus an explicit marker.
 *
 * The marker lets tooling distinguish a V2 system from a V1 one without
 * inspecting the component map at runtime.
 */
export type DesignSystemV2 = DesignSystem<DesignSystemComponentsV2> & {
  componentContract: "v2";
};

/**
 * Identity helper for V2 design systems.
 *
 * The constraint enforces the full {@link DesignSystemComponentsV2} shape and the
 * `"v2"` marker while `const T` preserves the literal definition (like
 * {@link defineDesignSystem}).
 *
 * An `isDesignSystemV2` runtime guard is intentionally deferred: `DesignSystem`
 * always types `components` as the V1 map, so a marker check alone could not
 * soundly narrow `components` to the V2 map.
 */
export function defineDesignSystemV2<const T extends DesignSystemV2>(system: T): T {
  return system;
}

/**
 * Minimal registry used to register systems once and resolve them by id.
 *
 * It is intentionally framework-agnostic: the same registry can back a React
 * context provider, a static list, or a lookup in a test.
 */
export interface DesignSystemRegistry {
  register(system: DesignSystem): void;
  unregister(id: string): void;
  has(id: string): boolean;
  get(id: string): DesignSystem | undefined;
  /** Like `get`, but throws when the id is unknown. */
  require(id: string): DesignSystem;
  list(): readonly DesignSystem[];
  clear(): void;
}

export function createDesignSystemRegistry(
  initial: readonly DesignSystem[] = [],
): DesignSystemRegistry {
  const systems = new Map<string, DesignSystem>();

  const registry: DesignSystemRegistry = {
    register(system) {
      systems.set(system.id, system);
    },
    unregister(id) {
      systems.delete(id);
    },
    has(id) {
      return systems.has(id);
    },
    get(id) {
      return systems.get(id);
    },
    require(id) {
      const system = systems.get(id);
      if (!system) {
        throw new Error(
          `Design system "${id}" is not registered. Known systems: ${
            [...systems.keys()].join(", ") || "(none)"
          }.`,
        );
      }
      return system;
    },
    list() {
      return Array.from(systems.values());
    },
    clear() {
      systems.clear();
    },
  };

  for (const system of initial) registry.register(system);

  return registry;
}
