type UnknownRecord = Record<string, unknown>;
type AnyFunction = (...args: unknown[]) => unknown;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge prop objects the way slot/`asChild` implementations need:
 *
 * - event handlers with the same name are chained,
 * - `className` values are concatenated,
 * - `style` objects are shallow-merged,
 * - every other prop is overridden by the later object.
 *
 * Later arguments win. The return type is the union of the argument types.
 */
export function mergeProps<T extends readonly UnknownRecord[]>(
  ...args: { [K in keyof T]: T[K] | undefined }
): T[number] {
  const merged: UnknownRecord = {};

  for (const props of args) {
    if (!props) continue;

    for (const [key, incoming] of Object.entries(props)) {
      if (incoming === undefined) continue;

      const current = merged[key];

      if (typeof current === "function" && typeof incoming === "function") {
        merged[key] = (...callArgs: unknown[]) => {
          (current as AnyFunction)(...callArgs);
          (incoming as AnyFunction)(...callArgs);
        };
      } else if (key === "style" && isRecord(current) && isRecord(incoming)) {
        merged[key] = { ...current, ...incoming };
      } else if (key === "className") {
        merged[key] = [current, incoming].filter(Boolean).join(" ");
      } else {
        merged[key] = incoming;
      }
    }
  }

  return merged as unknown as T[number];
}
