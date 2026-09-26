import {
  OPTIONAL_COMPONENTS,
  REQUIRED_COMPONENTS,
  type DesignSystemComponentName,
  type DesignSystemComponents,
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
 * `TComponents` defaults to and is constrained by the shared
 * {@link DesignSystemComponents} map: twenty-nine required components plus any
 * optional components the system declares. Optional names are omitted entirely
 * rather than declared as empty stubs.
 *
 * `contractVersion` identifies the current component contract generation the map
 * satisfies and is always the numeric `4`.
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
  /** The twenty-nine required components plus any declared optional components. */
  components: TComponents;
  /**
   * Identifies the current component contract generation the map satisfies.
   *
   * Required and always the numeric `4`; no other shape or marker is accepted.
   */
  contractVersion: 4;
  meta?: DesignSystemMeta;
}

/**
 * Identity helper that preserves the literal type of the definition.
 *
 * The constraint enforces the full twenty-nine-component required shape (plus
 * any optional capabilities) and the numeric `contractVersion: 4` marker; any
 * other shape or marker is rejected.
 */
export function defineDesignSystem<const T extends DesignSystem>(system: T): T {
  return system;
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every name the shared component contract may declare: the twenty-nine
 * required names plus the seventeen optional names. Any other key is rejected
 * at runtime.
 */
const ALLOWED_COMPONENTS: ReadonlySet<string> = new Set<string>([
  ...REQUIRED_COMPONENTS,
  ...OPTIONAL_COMPONENTS,
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
 * Runtime guard for the `contractVersion` marker, component keys, and component
 * values.
 *
 * TypeScript already requires `contractVersion: 4`, the twenty-nine required
 * components, and component values, but the registry is framework-agnostic and
 * may receive plain JavaScript objects. The guard therefore verifies at runtime
 * that `contractVersion` is exactly the numeric `4`, that every declared key is
 * a known required or optional component name, that no required component is
 * omitted, and that every declared component value is a React component value (a
 * function/class component or an exotic `forwardRef`/`memo`/`lazy` object). A
 * key that is present but holds `null`/`undefined` is rejected: omission of an
 * optional component is allowed, but an explicitly declared non-component value
 * is not.
 */
function assertDesignSystem(system: DesignSystem): void {
  if (system == null || system.contractVersion !== 4) {
    const id =
      system != null && typeof system.id === "string" && system.id.length > 0
        ? system.id
        : "(unknown)";
    throw new Error(
      `Cannot register design system "${id}": contractVersion must be 4. ` +
        `Declare contractVersion: 4 with the twenty-nine required components, ` +
        `or define the system with defineDesignSystem.`,
    );
  }

  const components: Partial<Record<DesignSystemComponentName, unknown>> | undefined =
    system.components != null && typeof system.components === "object"
      ? (system.components as Partial<Record<DesignSystemComponentName, unknown>>)
      : undefined;

  if (components) {
    const unknown = Object.keys(components).filter((name) => !ALLOWED_COMPONENTS.has(name));
    if (unknown.length > 0) {
      const label = unknown.length === 1 ? "component" : "components";
      throw new Error(
        `Cannot register design system "${system.id}": unknown ${label} ` +
          `${unknown.join(", ")}. Allowed names are the twenty-nine required and seventeen ` +
          `optional components.`,
      );
    }
  }

  const missing = components
    ? REQUIRED_COMPONENTS.filter((name) => !hasOwnKey(components, name))
    : [...REQUIRED_COMPONENTS];

  if (missing.length > 0) {
    const label = missing.length === 1 ? "component" : "components";
    throw new Error(
      `Cannot register design system "${system.id}": the contract is missing required ` +
        `${label} ${missing.join(", ")}.`,
    );
  }

  const invalid = components
    ? [...REQUIRED_COMPONENTS, ...OPTIONAL_COMPONENTS].filter(
        (name) => hasOwnKey(components, name) && !isReactComponentValue(components[name]),
      )
    : [];

  if (invalid.length > 0) {
    const details = invalid
      .map((name) => `${name} (${describeValueType(components?.[name])})`)
      .join(", ");
    const label = invalid.length === 1 ? "component" : "components";
    throw new Error(
      `Cannot register design system "${system.id}": ${label} ${details} ` +
        `must be a React component.`,
    );
  }
}

/**
 * Minimal registry used to register systems once and resolve them by id.
 *
 * It is intentionally framework-agnostic: the same registry can back a React
 * context provider, a static list, or a lookup in a test. Registration accepts
 * {@link DesignSystem} and rejects anything without the numeric
 * `contractVersion: 4` marker, missing a required component, carrying an unknown
 * name, or declaring a non-component value at runtime.
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
      assertDesignSystem(system);
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
