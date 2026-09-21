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
 * This type is V2-only. `TComponents` defaults to and is constrained by the
 * canonical fourteen-component {@link DesignSystemComponents} map, and
 * `componentContract` is required and must be `"v2"`. The historical
 * eight-component V1 contract is no longer representable here; see
 * `packages/core/src/design-system/components.ts` for migration history.
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
  /** The fourteen required components for the V2 contract. */
  components: TComponents;
  /**
   * Identifies which component contract the map satisfies.
   *
   * Required and always `"v2"`. The eight-component V1 contract is historical
   * and unsupported.
   */
  componentContract: "v2";
  meta?: DesignSystemMeta;
}

/**
 * Identity helper that preserves the literal type of the definition.
 *
 * The constraint enforces the full fourteen-component V2 shape and the
 * `"v2"` marker; an eight-component V1 object is rejected.
 */
export function defineDesignSystem<const T extends DesignSystem>(system: T): T {
  return system;
}

/**
 * A V2 design system: the canonical fourteen-component contract plus the
 * explicit `"v2"` marker.
 *
 * `DesignSystem` is already V2-only, so this is a compatible alias/marker type
 * kept for source compatibility with existing V2 consumers.
 */
export type DesignSystemV2 = DesignSystem<DesignSystemComponentsV2>;

/**
 * Identity helper for V2 design systems.
 *
 * The constraint enforces the full {@link DesignSystemComponentsV2} shape and the
 * `"v2"` marker while `const T` preserves the literal definition (like
 * {@link defineDesignSystem}).
 */
export function defineDesignSystemV2<const T extends DesignSystemV2>(system: T): T {
  return system;
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Runtime guard for the V2 marker.
 *
 * TypeScript already requires `componentContract: "v2"`, but the registry is
 * framework-agnostic and may receive plain JavaScript objects or values that
 * bypass the type system. The marker is therefore verified at runtime so an
 * unmarked object or any other contract is rejected instead of silently
 * accepted.
 */
function assertV2DesignSystem(system: DesignSystem): void {
  if (system == null || system.componentContract !== "v2") {
    const id =
      system != null && typeof system.id === "string" && system.id.length > 0
        ? system.id
        : "(unknown)";
    throw new Error(
      `Cannot register design system "${id}": componentContract must be "v2". ` +
        `The eight-component V1 contract is historical and unsupported. ` +
        `Declare componentContract: "v2" with the canonical fourteen components, ` +
        `or define the system with defineDesignSystemV2.`,
    );
  }
}

/**
 * Minimal registry used to register systems once and resolve them by id.
 *
 * It is intentionally framework-agnostic: the same registry can back a React
 * context provider, a static list, or a lookup in a test. It is V2-typed:
 * registration accepts {@link DesignSystem} and rejects anything without the
 * `"v2"` marker at runtime.
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
      assertV2DesignSystem(system);
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
