import {
  OPTIONAL_COMPONENTS_V4,
  REQUIRED_COMPONENTS_V4,
  type DesignSystemComponentNameV4,
  type DesignSystemComponents,
  type DesignSystemComponentsV2,
  type DesignSystemComponentsV4,
} from "./components.js";
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

/* -------------------------------------------------------------------------- */
/* V4 (additive)                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A V4 design system as consumable by Showcase and Reference App.
 *
 * `TComponents` defaults to and is constrained by the additive
 * {@link DesignSystemComponentsV4} map: twenty required components plus any
 * optional components the system declares. `componentContract` is required and
 * must be `"v4"`. V4 never widens the V2 `DesignSystem` or its registry.
 */
export interface DesignSystemV4<
  TComponents extends DesignSystemComponentsV4 = DesignSystemComponentsV4,
> {
  /** Stable machine identifier, e.g. `"system-a"`. */
  id: string;
  /** Human readable name, e.g. `"System A"`. */
  name: string;
  /** npm package name, e.g. `"@prism-system/ui-system-a"`. */
  packageName: string;
  /** Package version. */
  version: string;
  /** The twenty required V4 components plus any declared optional components. */
  components: TComponents;
  /** Identifies which component contract the map satisfies. Required, `"v4"`. */
  componentContract: "v4";
  meta?: DesignSystemMeta;
}

/**
 * Identity helper for V4 design systems.
 *
 * The constraint enforces the twenty required V4 components and the `"v4"`
 * marker while `const T` preserves the literal definition (like
 * {@link defineDesignSystem}). A V2-shaped object is rejected.
 */
export function defineDesignSystemV4<const T extends DesignSystemV4>(system: T): T {
  return system;
}

/**
 * Every name a V4 component map may declare: the twenty required names plus the
 * twelve optional names. Any other key is rejected by the runtime guard.
 */
const ALLOWED_COMPONENTS_V4: ReadonlySet<string> = new Set<string>([
  ...REQUIRED_COMPONENTS_V4,
  ...OPTIONAL_COMPONENTS_V4,
]);

/**
 * The React "exotic" component type symbols this guard recognizes.
 *
 * React marks `forwardRef`, `memo`, and `lazy` values with a `$$typeof` symbol
 * from the global `Symbol.for` registry. Only these exact known symbols are
 * accepted; an arbitrary or unrelated symbol is not a component.
 */
const REACT_EXOTIC_COMPONENT_TYPES: ReadonlySet<symbol> = new Set<symbol>([
  Symbol.for("react.forward_ref"),
  Symbol.for("react.memo"),
  Symbol.for("react.lazy"),
]);

/**
 * Whether a value is usable as a React component value.
 *
 * Accepts function and class components (`typeof value === "function"`) and the
 * React "exotic" components — `forwardRef`, `memo`, and `lazy` — which are
 * objects carrying one of the known {@link REACT_EXOTIC_COMPONENT_TYPES}
 * `$$typeof` symbols. Booleans, strings, numbers, `null`, arrays, plain objects,
 * and objects carrying an unrelated symbol are not components.
 */
function isReactComponentValue(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (value !== null && typeof value === "object") {
    const type = (value as { $$typeof?: unknown }).$$typeof;
    return typeof type === "symbol" && REACT_EXOTIC_COMPONENT_TYPES.has(type);
  }
  return false;
}

/** Whether `key` is an own (non-inherited) property of `object`. */
function hasOwnKey(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** A short, stable label for a rejected component value. */
function describeValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Runtime guard for the V4 marker, component keys, and component values.
 *
 * TypeScript already requires `componentContract: "v4"`, the twenty required
 * components, and component values, but the registry is framework-agnostic and
 * may receive plain JavaScript objects. The guard therefore verifies at runtime
 * that the marker is `"v4"`, that every declared key is a known required or
 * optional V4 component name, that no required component is omitted, and that
 * every declared component value is a React component value (a function/class
 * component or an exotic `forwardRef`/`memo`/`lazy` object). A key that is
 * present but holds `null`/`undefined` is rejected: omission of an optional
 * component is allowed, but an explicitly declared non-component value is not.
 * This guard is separate from {@link assertV2DesignSystem} and never runs for
 * the V2 registry.
 */
function assertV4DesignSystem(system: DesignSystemV4): void {
  if (system == null || system.componentContract !== "v4") {
    const id =
      system != null && typeof system.id === "string" && system.id.length > 0
        ? system.id
        : "(unknown)";
    throw new Error(
      `Cannot register design system "${id}": componentContract must be "v4". ` +
        `Declare componentContract: "v4" with the twenty required V4 components, ` +
        `or define the system with defineDesignSystemV4.`,
    );
  }

  const components: Partial<Record<DesignSystemComponentNameV4, unknown>> | undefined =
    system.components != null && typeof system.components === "object"
      ? (system.components as Partial<Record<DesignSystemComponentNameV4, unknown>>)
      : undefined;

  if (components) {
    const unknown = Object.keys(components).filter((name) => !ALLOWED_COMPONENTS_V4.has(name));
    if (unknown.length > 0) {
      const label = unknown.length === 1 ? "component" : "components";
      throw new Error(
        `Cannot register design system "${system.id}": unknown V4 ${label} ` +
          `${unknown.join(", ")}. Allowed names are the twenty required and twelve ` +
          `optional V4 components.`,
      );
    }
  }

  const missing = components
    ? REQUIRED_COMPONENTS_V4.filter((name) => !hasOwnKey(components, name))
    : [...REQUIRED_COMPONENTS_V4];

  if (missing.length > 0) {
    const label = missing.length === 1 ? "component" : "components";
    throw new Error(
      `Cannot register design system "${system.id}": the V4 contract is missing required ` +
        `${label} ${missing.join(", ")}.`,
    );
  }

  const invalid = components
    ? [...REQUIRED_COMPONENTS_V4, ...OPTIONAL_COMPONENTS_V4].filter(
        (name) => hasOwnKey(components, name) && !isReactComponentValue(components[name]),
      )
    : [];

  if (invalid.length > 0) {
    const details = invalid
      .map((name) => `${name} (${describeValueType(components?.[name])})`)
      .join(", ");
    const label = invalid.length === 1 ? "component" : "components";
    throw new Error(
      `Cannot register design system "${system.id}": V4 ${label} ${details} ` +
        `must be a React component.`,
    );
  }
}

/**
 * Minimal registry for V4 systems, kept separate from the V2
 * {@link DesignSystemRegistry} so neither contract widens the other.
 *
 * Registration accepts {@link DesignSystemV4} and rejects anything without the
 * `"v4"` marker or missing a required component at runtime.
 */
export interface DesignSystemRegistryV4 {
  register(system: DesignSystemV4): void;
  unregister(id: string): void;
  has(id: string): boolean;
  get(id: string): DesignSystemV4 | undefined;
  /** Like `get`, but throws when the id is unknown. */
  require(id: string): DesignSystemV4;
  list(): readonly DesignSystemV4[];
  clear(): void;
}

export function createDesignSystemRegistryV4(
  initial: readonly DesignSystemV4[] = [],
): DesignSystemRegistryV4 {
  const systems = new Map<string, DesignSystemV4>();

  const registry: DesignSystemRegistryV4 = {
    register(system) {
      assertV4DesignSystem(system);
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
