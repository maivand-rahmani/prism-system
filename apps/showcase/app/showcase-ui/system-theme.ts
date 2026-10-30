import type * as React from "react";
import type { RegisteredSystem } from "../registry";

export type ThemeMode = "light" | "dark";
export type TokenRecord = Record<string, unknown>;

export function asRecord(value: unknown): TokenRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TokenRecord)
    : {};
}

export function tokenAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => asRecord(current)[key], value);
}

export function tokenEntries(value: unknown, prefix = ""): Array<[string, string]> {
  return Object.entries(asRecord(value)).flatMap(([key, item]): Array<[string, string]> => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "string" || typeof item === "number") return [[path, String(item)]];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    return tokenEntries(item, path);
  });
}

export function hasDarkTheme(system: RegisteredSystem): boolean {
  return Object.keys(asRecord(tokenAt(system.tokens, "themes.dark.color"))).length > 0;
}

type ShowcaseStyle = React.CSSProperties & Record<`--showcase-${string}`, string>;

/** Bridge package tokens to semantic roles used only by Showcase-owned chrome. */
export function shellThemeStyle(system: RegisteredSystem, mode: ThemeMode): ShowcaseStyle {
  const colors = asRecord(tokenAt(system.tokens, `themes.${mode}.color`));
  const read = (path: string, fallback: string) => {
    const value = tokenAt(colors, path);
    return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
  };
  const sans = tokenAt(system.tokens, "typography.family.sans");
  const mono = tokenAt(system.tokens, "typography.family.mono");
  const radius = (name: string, fallback: string) => {
    const value = tokenAt(system.tokens, `radius.${name}`);
    return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
  };
  return {
    "--showcase-canvas": read("surface.canvas", "#f6f5f1"),
    "--showcase-surface": read("surface.raised", "#ffffff"),
    "--showcase-surface-soft": read("surface.sunken", "#eeeee8"),
    "--showcase-ink": read("text.primary", "#252923"),
    "--showcase-ink-muted": read("text.muted", "#6d7169"),
    "--showcase-line": read("border.default", "#d9ddd5"),
    "--showcase-line-strong": read("border.strong", "#b9c1b7"),
    "--showcase-accent": read("action.primary", "#496b5c"),
    "--showcase-accent-soft": read("action.secondary", "#e4ebe5"),
    "--showcase-focus": read("border.focus", "#4d7866"),
    "--showcase-font": typeof sans === "string" ? sans : "system-ui, sans-serif",
    "--showcase-mono": typeof mono === "string" ? mono : "ui-monospace, monospace",
    "--showcase-radius": radius("md", "10px"),
    "--showcase-radius-small": radius("sm", "6px"),
  };
}

export function isDeclared(system: RegisteredSystem, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(system.manifest.components, name);
}

export function runtimeComponent(system: RegisteredSystem, name: string): React.ElementType | null {
  const component = system.components[name as keyof typeof system.components];
  return isDeclared(system, name) && component != null ? (component as React.ElementType) : null;
}

/**
 * A compound component whose attached parts are named where they are used.
 *
 * Listing the parts keeps every one a declared, callable component instead of
 * an unchecked index lookup; a part the call site does not name is unavailable.
 */
export type CompoundComponent<Parts extends string = never> = React.ComponentType<
  Record<string, unknown>
> &
  Record<Parts, React.ElementType>;

export function withParts<const Parts extends string>(
  component: React.ElementType,
  ..._parts: [Parts, ...Parts[]]
): CompoundComponent<Parts> {
  return component as CompoundComponent<Parts>;
}
