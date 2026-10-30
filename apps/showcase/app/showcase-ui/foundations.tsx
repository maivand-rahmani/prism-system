"use client";

import * as React from "react";
import type { RegisteredSystem } from "../registry";
import { tokenAt, tokenEntries, type ThemeMode, withParts } from "./system-theme";

function FoundationPanel({
  system,
  title,
  children,
  className = "",
}: {
  system: RegisteredSystem;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Card = withParts(system.components.Card, "Title");
  const titleId = `foundation-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={`foundation-panel ${className}`} aria-labelledby={titleId}>
      <Card padding="sm">
        <Card.Title id={titleId}>{title}</Card.Title>
        <div className="foundation-panel-content">{children}</div>
      </Card>
    </section>
  );
}

function shortValue(value: string): string {
  return value.length > 35 ? `${value.slice(0, 32)}…` : value;
}

export function Foundations({ system, mode }: { system: RegisteredSystem; mode: ThemeMode }) {
  const [added, setAdded] = React.useState(false);
  const tokens = system.tokens as unknown as Record<string, unknown>;
  const colorEntries = tokenEntries(tokenAt(tokens, `themes.${mode}.color`));
  const pickedColors = [
    "surface.canvas",
    "surface.raised",
    "text.primary",
    "text.muted",
    "border.default",
    "border.focus",
    "action.primary",
    "action.secondary",
    "status.success",
    "status.warning",
    "status.danger",
  ];
  const colors = pickedColors.flatMap((name) => {
    const match = colorEntries.find(([path]) => path === name);
    return match ? [match] : [];
  });
  const sans = tokenAt(tokens, "typography.family.sans");
  const mono = tokenAt(tokens, "typography.family.mono");
  const spacing = tokenEntries(tokenAt(tokens, "spacing.scale")).filter(([name]) =>
    ["1", "2", "3", "4", "6", "8"].includes(name),
  );
  const containers = tokenEntries(tokens.containers);
  const radii = tokenEntries(tokens.radius).filter(([name]) => ["sm", "md", "lg"].includes(name));
  const shadows = tokenEntries(tokens.shadow).filter(([name]) => ["sm", "md", "lg"].includes(name));
  const motion = tokenEntries(tokens.motion).filter(([name]) =>
    ["duration.fast", "duration.normal", "duration.slow", "easing.standard"].includes(name),
  );
  const slowMotion = tokenAt(tokens, "motion.duration.slow");
  const standardEasing = tokenAt(tokens, "motion.easing.standard");
  const motionStyle: React.CSSProperties & Record<`--${string}`, string> = {
    ...(typeof slowMotion === "string" ? { "--foundation-motion-duration": slowMotion } : {}),
    ...(typeof standardEasing === "string" ? { "--foundation-motion-easing": standardEasing } : {}),
  };
  const Button = system.components.Button;

  return (
    <section className="foundations-view" id="foundations" aria-labelledby="foundations-title">
      <div className="view-heading">
        <div>
          <h1 id="foundations-title">Design tokens</h1>
        </div>
        <span className="foundation-system-label">
          {system.name} · {mode}
        </span>
      </div>

      <div className="foundation-grid">
        <FoundationPanel system={system} title="Color">
          <div className="foundation-swatches">
            {colors.map(([name, value]) => (
              <div className="foundation-swatch" key={name}>
                <span aria-hidden="true" style={{ backgroundColor: value }} />
                <div>
                  <strong>{name.replaceAll(".", " / ")}</strong>
                  <small>{value}</small>
                </div>
              </div>
            ))}
            {colors.length === 0 && <p className="foundation-empty">No color values published.</p>}
          </div>
        </FoundationPanel>

        <FoundationPanel system={system} title="Typography" className="foundation-type">
          <p
            className="type-specimen"
            style={{ fontFamily: typeof sans === "string" ? sans : undefined }}
          >
            Ag
          </p>
          <p
            className="type-sentence"
            style={{ fontFamily: typeof sans === "string" ? sans : undefined }}
          >
            A clear heading with room to breathe.
          </p>
          <p
            className="type-family"
            style={{ fontFamily: typeof sans === "string" ? sans : undefined }}
          >
            sans · {typeof sans === "string" ? shortValue(sans) : "system sans-serif"}
          </p>
          <p
            className="type-mono"
            style={{ fontFamily: typeof mono === "string" ? mono : undefined }}
          >
            mono · {typeof mono === "string" ? shortValue(mono) : "system monospace"}
          </p>
        </FoundationPanel>

        <FoundationPanel system={system} title="Spacing">
          <div className="foundation-measures">
            {spacing.map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <i style={{ width: value, maxWidth: "100%" }} />
                <small>{value}</small>
              </div>
            ))}
          </div>
        </FoundationPanel>

        <FoundationPanel system={system} title="Shape & depth">
          <div className="foundation-shapes">
            {radii.map(([name, value]) => (
              <div key={name}>
                <i style={{ borderRadius: value }} />
                <small>
                  {name} · {value}
                </small>
              </div>
            ))}
          </div>
          <div className="foundation-shadows">
            {shadows.map(([name, value]) => (
              <div key={name}>
                <i title={`${name}: ${value}`} style={{ boxShadow: value }} />
                <small>{name}</small>
              </div>
            ))}
          </div>
        </FoundationPanel>

        <FoundationPanel system={system} title="Motion">
          <div className="foundation-motion-values">
            {motion.map(([name, value]) => (
              <div key={name}>
                <span>{name.replaceAll(".", " / ")}</span>
                <code>{shortValue(value)}</code>
              </div>
            ))}
          </div>
          {typeof slowMotion === "string" && typeof standardEasing === "string" && (
            <span className="motion-orbit" style={motionStyle} aria-label="Motion token preview" />
          )}
        </FoundationPanel>

        <FoundationPanel system={system} title="Containers & icons">
          <div className="foundation-containers">
            {containers.map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <code>{value}</code>
              </div>
            ))}
          </div>
          <div className="foundation-icon-sample">
            <Button
              variant="outline"
              size="icon"
              type="button"
              aria-label={added ? "Workspace added" : "Add a workspace"}
              onClick={() => setAdded((current) => !current)}
            >
              {added ? "✓" : "+"}
            </Button>
            <span>{added ? "Workspace added" : "Icon action"}</span>
          </div>
        </FoundationPanel>
      </div>
    </section>
  );
}
