"use client";

import * as React from "react";
import { OPTIONAL_COMPONENTS, REQUIRED_COMPONENTS } from "@prism-system/ui-core";
import { ExtensionCatalog } from "../extension-catalog";
import type { RegisteredSystem } from "../registry";
import { OptionalSpecimen, type OptionalName } from "./optional-specimens";
import { RequiredSpecimen } from "./required-specimens";
import { runtimeComponent, withParts } from "./system-theme";

type ComponentName = (typeof REQUIRED_COMPONENTS)[number] | (typeof OPTIONAL_COMPONENTS)[number];

type SpecimenFootprint = {
  width: "compact" | "standard" | "wide" | "feature";
  height: "compact" | "standard" | "roomy";
};

const specimenFootprints: Record<ComponentName, SpecimenFootprint> = {
  Button: { width: "compact", height: "compact" },
  Input: { width: "wide", height: "standard" },
  Textarea: { width: "wide", height: "standard" },
  Card: { width: "compact", height: "compact" },
  Badge: { width: "compact", height: "compact" },
  Checkbox: { width: "compact", height: "compact" },
  RadioGroup: { width: "wide", height: "standard" },
  Switch: { width: "compact", height: "compact" },
  Select: { width: "compact", height: "standard" },
  Tabs: { width: "wide", height: "standard" },
  Dialog: { width: "wide", height: "standard" },
  DropdownMenu: { width: "compact", height: "standard" },
  Tooltip: { width: "compact", height: "standard" },
  Separator: { width: "compact", height: "compact" },
  Heading: { width: "standard", height: "compact" },
  Text: { width: "standard", height: "compact" },
  Link: { width: "compact", height: "compact" },
  Container: { width: "compact", height: "compact" },
  Stack: { width: "standard", height: "compact" },
  FormField: { width: "wide", height: "standard" },
  Center: { width: "compact", height: "compact" },
  Cluster: { width: "standard", height: "compact" },
  Sidebar: { width: "wide", height: "standard" },
  AspectRatio: { width: "compact", height: "standard" },
  Combobox: { width: "wide", height: "standard" },
  DatePicker: { width: "compact", height: "standard" },
  NumberField: { width: "compact", height: "standard" },
  Slider: { width: "compact", height: "standard" },
  FileUpload: { width: "wide", height: "standard" },
  Grid: { width: "standard", height: "compact" },
  Section: { width: "standard", height: "roomy" },
  Fieldset: { width: "wide", height: "roomy" },
  Alert: { width: "wide", height: "roomy" },
  Progress: { width: "compact", height: "compact" },
  Skeleton: { width: "compact", height: "compact" },
  Toast: { width: "wide", height: "roomy" },
  Accordion: { width: "wide", height: "roomy" },
  Avatar: { width: "compact", height: "compact" },
  Breadcrumbs: { width: "wide", height: "compact" },
  Pagination: { width: "wide", height: "standard" },
  Table: { width: "feature", height: "roomy" },
  Metric: { width: "standard", height: "standard" },
  DescriptionList: { width: "standard", height: "roomy" },
  Timeline: { width: "feature", height: "roomy" },
  Meter: { width: "standard", height: "compact" },
  EmptyState: { width: "feature", height: "roomy" },
};

function SpecimenTile({
  system,
  name,
  onOpenVariants,
  children,
}: {
  system: RegisteredSystem;
  name: ComponentName;
  onOpenVariants: (name: ComponentName) => void;
  children: React.ReactNode;
}) {
  const Button = system.components.Button;
  const Card = system.components.Card;
  const available = runtimeComponent(system, name) !== null;
  const footprint = specimenFootprints[name];
  return (
    <article
      className={`specimen-tile specimen-tile--width-${footprint.width} specimen-tile--height-${footprint.height}${available ? "" : " is-unavailable"}`}
    >
      <Card variant={name === "Card" ? "muted" : "default"} padding="none">
        <div className="specimen-tile-layout">
          <header className="specimen-tile-heading">
            <h2>{name}</h2>
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={!available}
              aria-label={`Open all ${name} variants`}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onOpenVariants(name);
              }}
            >
              <span aria-hidden="true">↗</span>
            </Button>
          </header>
          <div className="specimen-preview">
            {available ? children : <span className="specimen-unavailable">Not declared by this package</span>}
          </div>
        </div>
      </Card>
    </article>
  );
}

export function RequiredComponents({
  system,
  onOpenVariants,
}: {
  system: RegisteredSystem;
  onOpenVariants: (name: ComponentName) => void;
}) {
  return (
    <section className="component-view" id="required" aria-labelledby="required-title">
      <div className="view-heading component-view-heading">
        <h1 id="required-title">Required components</h1>
        <p className="catalog-hint">
          <span aria-hidden="true">↗</span> Open a card’s full variant set
        </p>
      </div>
      <div className="specimen-grid">
        {REQUIRED_COMPONENTS.map((name) => (
          <SpecimenTile key={name} system={system} name={name} onOpenVariants={onOpenVariants}>
            <RequiredSpecimen system={system} name={name} />
          </SpecimenTile>
        ))}
      </div>
    </section>
  );
}

export function AdditionalComponents({
  system,
  onOpenVariants,
}: {
  system: RegisteredSystem;
  onOpenVariants: (name: ComponentName) => void;
}) {
  const declaredOptionalNames = OPTIONAL_COMPONENTS.filter((name) =>
    Object.prototype.hasOwnProperty.call(system.manifest.components, name),
  );
  const availableOptionalNames = declaredOptionalNames.filter(
    (name) => runtimeComponent(system, name) !== null,
  );

  return (
    <section
      className="component-view additional-view"
      id="additional"
      aria-labelledby="additional-title"
    >
      <div className="view-heading component-view-heading">
        <h1 id="additional-title">Additional capabilities</h1>
        {availableOptionalNames.length > 0 && (
          <p className="catalog-hint">
            <span aria-hidden="true">↗</span> Open a card’s full variant set
          </p>
        )}
      </div>

      <section className="capability-section" aria-labelledby="optional-title">
        <div className="capability-heading">
          <h2 id="optional-title">Optional components</h2>
          {declaredOptionalNames.length > 0 && (
            <span>
              {declaredOptionalNames.length} of {OPTIONAL_COMPONENTS.length} declared
            </span>
          )}
        </div>
        {declaredOptionalNames.length === 0 ? (
          <p className="empty-capability-note" role="status">
            No optional components are declared.
          </p>
        ) : availableOptionalNames.length === 0 ? (
          <p className="empty-capability-note" role="status">
            Declared optional components are unavailable in this runtime.
          </p>
        ) : (
          <>
            {availableOptionalNames.length < declaredOptionalNames.length && (
              <p className="empty-capability-note" role="status">
                Some declared components are unavailable in this runtime.
              </p>
            )}
            <div className="specimen-grid optional-grid">
              {availableOptionalNames.map((name) => (
                <SpecimenTile key={name} system={system} name={name} onOpenVariants={onOpenVariants}>
                  <OptionalSpecimen system={system} name={name as OptionalName} />
                </SpecimenTile>
              ))}
            </div>
          </>
        )}
      </section>

      {Object.keys(system.manifest.extensions ?? {}).length > 0 ? (
        <ExtensionCatalog system={system} />
      ) : null}
    </section>
  );
}

function VariantExample({
  system,
  name,
  variant,
  size,
}: {
  system: RegisteredSystem;
  name: ComponentName;
  variant: string | null;
  size: string | null;
}) {
  const Component = runtimeComponent(system, name);
  if (!Component) return <span className="specimen-unavailable">Not available</span>;
  const label = [variant, size].filter(Boolean).join(" · ") || "Default";

  if (name === "Button") {
    return <Component type="button" variant={variant ?? undefined} size={size ?? undefined}>{label}</Component>;
  }
  if (name === "Badge") {
    return <Component variant={variant ?? undefined} size={size ?? undefined}>{variant ?? "Badge"}</Component>;
  }
  if (name === "Card") {
    return (
      <Component
        variant={variant ?? undefined}
        padding="sm"
      >
        <span>{variant ?? "Default"} surface</span>
      </Component>
    );
  }
  if (name === "Alert") {
    const Alert = withParts(Component, "Title", "Description");
    return <Alert variant={variant ?? "info"}><Alert.Title>{variant ?? "Info"}</Alert.Title><Alert.Description>Package alert treatment.</Alert.Description></Alert>;
  }
  if (["Input", "Textarea", "Checkbox", "Switch"].includes(name) && size) {
    return <Component size={size} aria-label={`${name} ${size}`} placeholder={name === "Input" ? `${size} input` : undefined} />;
  }
  if (name === "Select" && size) {
    const Select = withParts(Component, "Trigger", "Value", "Content", "Item");
    return <Select defaultValue="one"><Select.Trigger size={size} aria-label={`Select ${size}`}><Select.Value>One</Select.Value></Select.Trigger><Select.Content><Select.Item value="one">One</Select.Item></Select.Content></Select>;
  }
  return <Component variant={variant ?? undefined} size={size ?? undefined}>{label}</Component>;
}

export function VariantDialog({
  system,
  name,
  onClose,
}: {
  system: RegisteredSystem;
  name: ComponentName | null;
  onClose: () => void;
}) {
  const Dialog = withParts(
    system.components.Dialog,
    "Content",
    "Header",
    "Title",
    "Description",
    "Footer",
    "Close",
  );
  const Button = system.components.Button;
  const metadata = name ? system.manifest.components[name] : undefined;
  const variants = metadata?.variants ?? [];
  const sizes = metadata?.sizes ?? [];
  const variantOptions = variants.length ? variants : [null];
  const sizeOptions = sizes.length ? sizes : [null];
  const examples = variantOptions.flatMap((variant) =>
    sizeOptions.map((size) => ({ variant, size, key: `${variant ?? "default"}-${size ?? "default"}` })),
  );

  return (
    <Dialog open={name !== null} onOpenChange={(open: boolean) => !open && onClose()}>
      {name && (
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>{name} variants</Dialog.Title>
            <Dialog.Description>Every variant and size published by {system.name}.</Dialog.Description>
          </Dialog.Header>
          {variants.length || sizes.length ? (
            <div className="variant-gallery">
              {examples.map(({ variant, size, key }) => (
                <div className="variant-gallery-item" key={key}>
                  <span>{[variant, size].filter(Boolean).join(" · ")}</span>
                  <VariantExample system={system} name={name} variant={variant} size={size} />
                </div>
              ))}
            </div>
          ) : (
            <div className="variant-default-example">
              <p>No appearance variants or sizes are published for this component.</p>
            </div>
          )}
          <Dialog.Footer>
            <Dialog.Close asChild><Button variant="outline" size="sm">Done</Button></Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      )}
    </Dialog>
  );
}

export type { ComponentName };
