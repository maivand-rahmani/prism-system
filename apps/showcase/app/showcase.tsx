"use client";

import * as React from "react";
import { OPTIONAL_COMPONENTS, REQUIRED_COMPONENTS } from "@prism-system/ui-core";
import { registeredSystems, getRegisteredSystem, type RegisteredSystem } from "./registry";

type ComponentName = (typeof REQUIRED_COMPONENTS)[number] | (typeof OPTIONAL_COMPONENTS)[number];
type TokenRecord = Record<string, unknown>;
type ComponentAvailability = { available: true } | { available: false; reason: string };

function hasOwn(value: object, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, name);
}

function asRecord(value: unknown): TokenRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as TokenRecord) : {};
}

function tokenAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => asRecord(current)[key], value);
}

function tokenEntries(value: unknown, prefix = ""): Array<[string, string]> {
  return Object.entries(asRecord(value)).flatMap(([key, item]): Array<[string, string]> => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "string" || typeof item === "number") return [[path, String(item)]];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    return tokenEntries(item, path);
  });
}

function componentAvailability(
  system: RegisteredSystem,
  name: ComponentName,
): ComponentAvailability {
  if (!hasOwn(system.components, name) || system.components[name] == null) {
    return { available: false, reason: "The active runtime does not export this component." };
  }
  if (!hasOwn(system.manifest.components, name)) {
    return {
      available: false,
      reason: "The active package manifest does not publish this capability.",
    };
  }
  return { available: true };
}

function runtimeComponent(system: RegisteredSystem, name: ComponentName): React.ElementType | null {
  if (!componentAvailability(system, name).available) return null;
  return system.components[name] ?? null;
}

type PartComponent = React.ComponentType<Record<string, unknown>>;
type CompoundParts = {
  FormField: {
    Label: PartComponent;
    Control: PartComponent;
    Description: PartComponent;
    Error: PartComponent;
  };
  Combobox: { Input: PartComponent; Content: PartComponent; Item: PartComponent };
  Section: {
    Header: PartComponent;
    Title: PartComponent;
    Description: PartComponent;
    Content: PartComponent;
  };
  Fieldset: { Legend: PartComponent };
  Alert: { Title: PartComponent; Description: PartComponent };
  Toast: {
    Provider: PartComponent;
    Viewport: PartComponent;
    Root: PartComponent;
    Title: PartComponent;
    Description: PartComponent;
    Close: PartComponent;
  };
  Accordion: {
    Item: PartComponent;
    Header: PartComponent;
    Trigger: PartComponent;
    Content: PartComponent;
  };
  Avatar: { Fallback: PartComponent };
  Breadcrumbs: {
    List: PartComponent;
    Item: PartComponent;
    Link: PartComponent;
    Current: PartComponent;
  };
  Pagination: {
    List: PartComponent;
    Item: PartComponent;
    Previous: PartComponent;
    Current: PartComponent;
    Link: PartComponent;
    Ellipsis: PartComponent;
    Next: PartComponent;
  };
  Table: {
    Caption: PartComponent;
    Header: PartComponent;
    Row: PartComponent;
    Head: PartComponent;
    Body: PartComponent;
    Cell: PartComponent;
  };
  Metric: { Label: PartComponent; Value: PartComponent; Description: PartComponent };
  DescriptionList: { Item: PartComponent; Term: PartComponent; Description: PartComponent };
  Timeline: {
    Item: PartComponent;
    Title: PartComponent;
    Time: PartComponent;
    Description: PartComponent;
  };
  EmptyState: { Title: PartComponent; Description: PartComponent; Action: PartComponent };
};

function withParts<Name extends keyof CompoundParts>(
  component: React.ElementType,
  _name: Name,
): PartComponent & CompoundParts[Name] {
  return component as PartComponent & CompoundParts[Name];
}

function supportsDarkTheme(system: RegisteredSystem): boolean {
  return Object.keys(asRecord(tokenAt(system.tokens, "themes.dark.color"))).length > 0;
}

function SystemPicker({
  system,
  onChange,
}: {
  system: RegisteredSystem;
  onChange: (id: string) => void;
}) {
  const [darkTheme, setDarkTheme] = React.useState(false);
  React.useEffect(() => {
    setDarkTheme(document.documentElement.dataset.prismTheme === "dark");
  }, []);
  const { Select, Button } = system.components;
  return (
    <div className="showcase-controls">
      <div className="system-picker">
        <span>Active system</span>
        <Select value={system.id} onValueChange={onChange}>
          <Select.Trigger aria-label="Active design system">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {registeredSystems.map((item) => (
              <Select.Item key={item.id} value={item.id}>
                {item.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      <div className="theme-toggle">
        <Button
          variant="ghost"
          disabled={!supportsDarkTheme(system)}
          aria-label={darkTheme ? "Switch to light theme" : "Switch to dark theme"}
          aria-pressed={darkTheme}
          onClick={() => {
            setDarkTheme((current) => {
              const next = !current;
              document.documentElement.dataset.prismTheme = next ? "dark" : "light";
              return next;
            });
          }}
        >
          {darkTheme ? "Dark theme" : "Light theme"}
        </Button>
      </div>
    </div>
  );
}

function FoundationSection({ system }: { system: RegisteredSystem }) {
  const tokens = system.tokens as unknown as TokenRecord;
  const themes = asRecord(tokens.themes);
  const colors = Object.entries(themes).flatMap(
    ([theme, value]): Array<[string, Array<[string, string]>]> => {
      const items = tokenEntries(asRecord(value).color);
      return items.length > 0 ? [[theme, items]] : [];
    },
  );
  const typography = tokenEntries(tokens.typography);
  const spacing = tokenEntries(tokens.spacing);
  const containers = tokenEntries(tokens.containers);
  const radii = tokenEntries(tokens.radius);
  const shadows = tokenEntries(tokens.shadow);
  const motion = tokenEntries(tokens.motion);
  const defaultTheme = Object.values(themes)[0];
  const borderColors = tokenEntries(tokenAt(defaultTheme, "color.border"));
  const sans = tokenAt(tokens, "typography.family.sans");
  const mono = tokenAt(tokens, "typography.family.mono");
  const displaySize = tokenAt(tokens, "typography.size.4xl");
  const headingSize = tokenAt(tokens, "typography.size.xl");
  const bodySize = tokenAt(tokens, "typography.size.md");
  const lineHeight = tokenAt(tokens, "typography.lineHeight.normal");
  const tracking = tokenAt(tokens, "typography.letterSpacing.tight");
  const slowMotion = tokenAt(tokens, "motion.duration.slow");
  const standardEasing = tokenAt(tokens, "motion.easing.standard");
  const motionStyle: React.CSSProperties & Record<`--${string}`, string> = {
    ...(typeof slowMotion === "string" ? { "--foundation-motion-duration": slowMotion } : {}),
    ...(typeof standardEasing === "string" ? { "--foundation-motion-easing": standardEasing } : {}),
  };
  return (
    <section className="laboratory-section" aria-labelledby="foundations-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">01 / foundations</p>
          <h2 id="foundations-title">The language underneath</h2>
        </div>
        <p className="section-intro">
          Tokens are exposed by the active package, not recreated by the app. Switch systems to
          compare the same primitives in a different voice.
        </p>
      </div>
      <div className="foundation-grid">
        <div className="foundation-panel foundation-colors">
          <h3>Colors</h3>
          <div className="swatch-grid">
            {colors.flatMap(([theme, items]) =>
              items.map(([name, value]) => (
                <div className="swatch" key={`${theme}-${name}`}>
                  <span className="color-swatch" style={{ backgroundColor: value }} />
                  <span>
                    <strong>
                      {theme
                        ? `${theme} · ${name.replaceAll(".", " / ")}`
                        : name.replaceAll(".", " / ")}
                    </strong>
                    <small>{value}</small>
                  </span>
                </div>
              )),
            )}
          </div>
          {colors.every(([, items]) => items.length === 0) && (
            <p className="foundation-unavailable">This package does not publish color tokens.</p>
          )}
        </div>
        <div className="foundation-panel">
          <h3>Typography</h3>
          {typography.length > 0 ? (
            <div className="type-samples">
              <p
                className="type-display"
                style={{
                  fontFamily: typeof sans === "string" ? sans : undefined,
                  fontSize: typeof displaySize === "string" ? displaySize : undefined,
                  letterSpacing: typeof tracking === "string" ? tracking : undefined,
                }}
              >
                Aa
              </p>
              <p
                className="type-heading"
                style={{
                  fontFamily: typeof sans === "string" ? sans : undefined,
                  fontSize: typeof headingSize === "string" ? headingSize : undefined,
                }}
              >
                A clear heading
              </p>
              <p
                className="type-body"
                style={{
                  fontFamily: typeof sans === "string" ? sans : undefined,
                  fontSize: typeof bodySize === "string" ? bodySize : undefined,
                  lineHeight:
                    typeof lineHeight === "number" || typeof lineHeight === "string"
                      ? lineHeight
                      : undefined,
                }}
              >
                Body copy keeps the interface clear, measured, and easy to scan.
              </p>
              {typeof sans === "string" && <code style={{ fontFamily: sans }}>sans · {sans}</code>}
              {typeof mono === "string" && <code style={{ fontFamily: mono }}>mono · {mono}</code>}
              <div className="foundation-token-list">
                {typography.map(([name, value]) => (
                  <div key={name}>
                    <span>{name.replaceAll(".", " / ")}</span>
                    <code>{value}</code>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="foundation-unavailable">
              Typography tokens are not published by this package.
            </p>
          )}
        </div>
        <div className="foundation-panel">
          <h3>Spacing</h3>
          {spacing.length > 0 ? (
            <div className="spacing-samples">
              {spacing.map(([name, value]) => (
                <div className="spacing-row" key={name}>
                  <span>{name.replaceAll(".", " / ")}</span>
                  <i style={{ width: value, maxWidth: "100%" }} />
                  <small>{value}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="foundation-unavailable">
              Spacing tokens are not published by this package.
            </p>
          )}
        </div>
        <div className="foundation-panel">
          <h3>Containers</h3>
          {containers.length > 0 ? (
            <div className="container-samples">
              {containers.map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <i style={{ width: value, maxWidth: "100%" }} />
                  <small>{value}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="foundation-unavailable">
              Container tokens are not published by this package.
            </p>
          )}
        </div>
        <div className="foundation-panel">
          <h3>Radius</h3>
          {radii.length > 0 ? (
            <div className="radius-samples">
              {radii.map(([name, value]) => (
                <div key={name}>
                  <span className="radius-chip" style={{ borderRadius: value }} />
                  <small>
                    {name} · {value}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="foundation-unavailable">
              Radius tokens are not published by this package.
            </p>
          )}
        </div>
        <div className="foundation-panel">
          <h3>Borders</h3>
          {borderColors.length > 0 ? (
            <div className="border-samples">
              {borderColors.map(([name, value]) => (
                <div className="border-token" key={name}>
                  <i style={{ borderColor: value }} />
                  <small>
                    {name} · {value}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="foundation-unavailable">
              Border color tokens are not published by this package.
            </p>
          )}
        </div>
        <div className="foundation-panel">
          <h3>Shadows</h3>
          {shadows.length > 0 ? (
            <div className="shadow-samples">
              {shadows.map(([name, value]) => (
                <div key={name} className="shadow-chip" style={{ boxShadow: value }}>
                  <small>
                    {name} · {value}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="foundation-unavailable">
              Shadow tokens are not published by this package.
            </p>
          )}
        </div>
        <div className="foundation-panel foundation-motion">
          <h3>Motion</h3>
          {motion.length > 0 ? (
            <div className="motion-samples">
              {motion.map(([name, value]) => (
                <div key={name}>
                  <strong>{name}</strong>
                  <code>{value}</code>
                </div>
              ))}
              {typeof slowMotion === "string" && typeof standardEasing === "string" && (
                <span
                  className="motion-orbit motion-orbit-active"
                  style={motionStyle}
                  aria-hidden="true"
                />
              )}
            </div>
          ) : (
            <p className="foundation-unavailable">
              Motion tokens are not published by this package.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** The labelled specimen is rendered from the package FormField contract. */
function SpecimenField({
  system,
  id,
  label,
  description,
  error,
  disabled,
  required,
  children,
}: {
  system: RegisteredSystem;
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  children: React.ReactElement;
}) {
  const { FormField } = system.components;
  return (
    <FormField id={id} invalid={Boolean(error)} disabled={disabled} required={required}>
      <FormField.Label>{label}</FormField.Label>
      <FormField.Control asChild>{children}</FormField.Control>
      {description && <FormField.Description>{description}</FormField.Description>}
      {error && <FormField.Error>{error}</FormField.Error>}
    </FormField>
  );
}

function ComponentsSection({ system }: { system: RegisteredSystem }) {
  const {
    Button,
    Input,
    Textarea,
    Card,
    Badge,
    Checkbox,
    RadioGroup,
    Switch,
    Select,
    Tabs,
    Dialog,
    DropdownMenu,
    Tooltip,
    Separator,
  } = system.components;
  return (
    <section className="laboratory-section" id="components" aria-labelledby="components-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">02 / components</p>
          <h2 id="components-title">The component surface</h2>
        </div>
        <p className="section-intro">
          The complete component surface comes from the registered package. The composition stays
          fixed while the visual language changes.
        </p>
      </div>
      <nav className="catalog-shortcuts" aria-label="Jump to a component specimen">
        {[...REQUIRED_COMPONENTS, ...OPTIONAL_COMPONENTS].map((name) => (
          <a key={name} href={`#component-${name.toLowerCase()}`}>
            {name}
          </a>
        ))}
        <a className="dedicated-showcase-link" href={`/showcase/${system.id}#components`}>
          Open {system.name}&apos;s dedicated showcase <span aria-hidden="true">↗</span>
        </a>
      </nav>
      <div className="component-stack">
        <Card id="component-button" variant="elevated" padding="lg">
          <Card.Header>
            <Card.Title>Button / interaction atlas</Card.Title>
            <Card.Description>
              Variants, sizes, and the states that make an action legible.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="specimen-block">
              <h3>Variants</h3>
              <div className="control-row">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Inline link</Button>
              </div>
            </div>
            <div className="specimen-block">
              <h3>Sizes</h3>
              <div className="control-row">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="icon" aria-label="Add">
                  +
                </Button>
              </div>
            </div>
            <div className="specimen-block">
              <h3>
                States{" "}
                <span className="hint-label">hover each control · Tab to the focus specimen</span>
              </h3>
              <div className="state-grid">
                <div>
                  <Button>Default</Button>
                  <small>ready</small>
                </div>
                <div>
                  <Button variant="secondary">Hover me</Button>
                  <small>interactive</small>
                </div>
                <div>
                  <Button variant="outline">Focus</Button>
                  <small>Tab here for keyboard ring</small>
                </div>
                <div>
                  <Button disabled>Disabled</Button>
                  <small>unavailable</small>
                </div>
                <div>
                  <Button loading>Saving</Button>
                  <small>busy</small>
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
        <div className="component-grid">
          <Card id="component-input">
            <Card.Header>
              <Card.Title>Input</Card.Title>
              <Card.Description>Labels, hints, and validation.</Card.Description>
            </Card.Header>
            <Card.Content>
              <SpecimenField
                system={system}
                id="specimen-workspace"
                label="Workspace name"
                description="Shown to your team"
              >
                <Input placeholder="e.g. Northstar" />
              </SpecimenField>
              <SpecimenField
                system={system}
                id="specimen-invalid"
                label="Invalid field"
                error="Please choose another name."
              >
                <Input defaultValue="Needs attention" />
              </SpecimenField>
            </Card.Content>
          </Card>
          <Card id="component-badge">
            <Card.Header>
              <Card.Title>Badge</Card.Title>
              <Card.Description>Small signals with a clear hierarchy.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="badge-row">
                <Badge dot variant="success">
                  Operational
                </Badge>
                <Badge variant="warning">Review</Badge>
                <Badge variant="danger">Blocked</Badge>
                <Badge variant="outline">Draft</Badge>
              </div>
            </Card.Content>
          </Card>
          <Card id="component-checkbox">
            <Card.Header>
              <Card.Title>Checkbox</Card.Title>
              <Card.Description>Selection with supporting copy.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="checkbox-stack">
                <SpecimenField
                  system={system}
                  id="specimen-digest"
                  label="Weekly digest"
                  description="A short summary every Monday."
                >
                  <Checkbox defaultChecked />
                </SpecimenField>
                <SpecimenField
                  system={system}
                  id="specimen-updates"
                  label="Product updates"
                  description="Occasional notes from the team."
                >
                  <Checkbox />
                </SpecimenField>
                <SpecimenField
                  system={system}
                  id="specimen-locked"
                  label="Locked preference"
                  disabled
                >
                  <Checkbox />
                </SpecimenField>
              </div>
            </Card.Content>
          </Card>
          <Card id="component-select">
            <Card.Header>
              <Card.Title>Select</Card.Title>
              <Card.Description>A package-owned accessible choice field.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Select defaultValue="balanced">
                <SpecimenField
                  system={system}
                  id="specimen-theme"
                  label="Theme preference"
                  description="This specimen uses the package select."
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                </SpecimenField>
                <Select.Content>
                  <Select.Item value="balanced">Balanced</Select.Item>
                  <Select.Item value="quiet">Quiet</Select.Item>
                  <Select.Item value="expressive">Expressive</Select.Item>
                </Select.Content>
              </Select>
            </Card.Content>
          </Card>
          <Card id="component-tabs">
            <Card.Header>
              <Card.Title>Tabs</Card.Title>
              <Card.Description>Surface-level navigation with arrow keys.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Tabs defaultValue="overview">
                <Tabs.List>
                  <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
                  <Tabs.Trigger value="details">Details</Tabs.Trigger>
                  <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="overview">
                  <p>Overview keeps the first read compact.</p>
                </Tabs.Content>
                <Tabs.Content value="details">
                  <p>Details become available without leaving the surface.</p>
                </Tabs.Content>
                <Tabs.Content value="activity">
                  <p>Activity gives the component a quiet timeline.</p>
                </Tabs.Content>
              </Tabs>
            </Card.Content>
          </Card>
          <Card id="component-dialog">
            <Card.Header>
              <Card.Title>Dialog</Card.Title>
              <Card.Description>Modal composition with focus management.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Dialog>
                <Dialog.Trigger>Open dialog</Dialog.Trigger>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>Invite a collaborator</Dialog.Title>
                    <Dialog.Description>
                      Share a workspace invitation without losing your place.
                    </Dialog.Description>
                  </Dialog.Header>
                  <SpecimenField system={system} id="specimen-invite" label="Email address">
                    <Input id="specimen-invite" type="email" placeholder="name@example.com" />
                  </SpecimenField>
                  <Dialog.Footer>
                    <Dialog.Close>Cancel</Dialog.Close>
                    <Button>Send invite</Button>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog>
            </Card.Content>
          </Card>
          <Card id="component-textarea">
            <Card.Header>
              <Card.Title>Textarea</Card.Title>
              <Card.Description>Long-form notes with a clear input boundary.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Textarea aria-label="Project notes" placeholder="Add a short note..." rows={3} />
            </Card.Content>
          </Card>
          <Card id="component-radiogroup">
            <Card.Header>
              <Card.Title>RadioGroup</Card.Title>
              <Card.Description>Related choices with one active direction.</Card.Description>
            </Card.Header>
            <Card.Content>
              <RadioGroup aria-label="Density" defaultValue="balanced" orientation="vertical">
                <RadioGroup.Item value="quiet">
                  <span>Quiet</span>
                </RadioGroup.Item>
                <RadioGroup.Item value="balanced">
                  <span>Balanced</span>
                </RadioGroup.Item>
                <RadioGroup.Item value="expressive" disabled>
                  <span>Expressive (unavailable)</span>
                </RadioGroup.Item>
              </RadioGroup>
            </Card.Content>
          </Card>
          <Card id="component-switch">
            <Card.Header>
              <Card.Title>Switch</Card.Title>
              <Card.Description>A compact control for an immediate preference.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="checkbox-stack">
                <div className="control-row">
                  <Switch aria-label="Email updates" defaultChecked />
                  <span>Weekly updates</span>
                </div>
                <div className="control-row">
                  <Switch aria-label="SMS updates" disabled />
                  <span>SMS updates (unavailable)</span>
                </div>
              </div>
            </Card.Content>
          </Card>
          <Card id="component-dropdownmenu">
            <Card.Header>
              <Card.Title>DropdownMenu</Card.Title>
              <Card.Description>Contextual actions gathered behind one trigger.</Card.Description>
            </Card.Header>
            <Card.Content>
              <DropdownMenu>
                <DropdownMenu.Trigger type="button">Open actions</DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item>Rename</DropdownMenu.Item>
                  <DropdownMenu.Item>Duplicate</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item disabled>Archive</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            </Card.Content>
          </Card>
          <Card id="component-tooltip">
            <Card.Header>
              <Card.Title>Tooltip</Card.Title>
              <Card.Description>Helpful context, close at hand.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Tooltip.Provider>
                <Tooltip>
                  <Tooltip.Trigger type="button">Focus or hover</Tooltip.Trigger>
                  <Tooltip.Content>Helpful context, close at hand.</Tooltip.Content>
                </Tooltip>
              </Tooltip.Provider>
            </Card.Content>
          </Card>
          <Card id="component-separator">
            <Card.Header>
              <Card.Title>Separator</Card.Title>
              <Card.Description>A quiet boundary between related content.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="control-row">
                <span>Before</span>
                <Separator aria-label="Content boundary" />
                <span>After</span>
              </div>
            </Card.Content>
          </Card>
        </div>
        <div className="contract-note">
          <span>✓</span>
          <p>
            <strong>Contract-driven catalog</strong> Required examples come from the active package;
            optional examples appear only when its runtime and manifest publish them.
            <code>{system.packageName}</code>
          </p>
        </div>
        <RequiredAdditionSpecimens system={system} />
        <OptionalSpecimens system={system} />
      </div>
    </section>
  );
}

type AdditionalRequiredName =
  | "Heading"
  | "Text"
  | "Link"
  | "Container"
  | "Stack"
  | "FormField"
  | "Center"
  | "Cluster"
  | "Sidebar"
  | "AspectRatio"
  | "Combobox"
  | "DatePicker"
  | "NumberField"
  | "Slider"
  | "FileUpload";
type OptionalName = (typeof OPTIONAL_COMPONENTS)[number];

function CapabilityCard({
  system,
  name,
  description,
  children,
}: {
  system: RegisteredSystem;
  name: ComponentName;
  description: string;
  children: React.ReactNode;
}) {
  const { Card } = system.components;
  const availability = componentAvailability(system, name);
  return (
    <article className="component-extension" id={`component-${name.toLowerCase()}`}>
      <Card>
        <Card.Header>
          <Card.Title>{name}</Card.Title>
          <Card.Description>{description}</Card.Description>
        </Card.Header>
        <Card.Content>
          {availability.available ? (
            children
          ) : (
            <div className="unavailable-state" role="status">
              <strong>Unavailable in {system.name}</strong>
              <p>{availability.reason}</p>
            </div>
          )}
        </Card.Content>
      </Card>
    </article>
  );
}

function RequiredAdditionSpecimen({
  system,
  name,
}: {
  system: RegisteredSystem;
  name: AdditionalRequiredName;
}) {
  const controlRef = React.useRef<HTMLInputElement>(null);
  const [studioQuery, setStudioQuery] = React.useState("Orchard");
  const [selectedStudio, setSelectedStudio] = React.useState("orchard");
  const [threshold, setThreshold] = React.useState(64);
  const Component = runtimeComponent(system, name);
  if (!Component) return null;

  switch (name) {
    case "Heading":
      return <Component level={3}>A heading with a clear outline</Component>;
    case "Text":
      return (
        <div>
          <Component as="p">Body text stays readable across the system.</Component>
          <Component as="span">Inline text keeps the same package voice.</Component>
        </div>
      );
    case "Link":
      return <Component href="#component-input">Jump to the input specimen</Component>;
    case "Container":
      return (
        <Component>
          <p>Content width and its responsive padding come from this package.</p>
        </Component>
      );
    case "Stack": {
      const Text = runtimeComponent(system, "Text");
      if (!Text) return null;
      return (
        <Component direction="vertical">
          <Text>One item in the flow</Text>
          <Text>Another item, without an app-owned gap value</Text>
        </Component>
      );
    }
    case "FormField": {
      const FormField = withParts(Component, "FormField");
      const Input = system.components.Input as React.ElementType;
      const Button = system.components.Button;
      return (
        <div className="form-field-specimen">
          <FormField id="showcase-contact" required invalid>
            <FormField.Label>Email address</FormField.Label>
            <FormField.Control asChild>
              <Input ref={controlRef} type="email" defaultValue="updates@" />
            </FormField.Control>
            <FormField.Description>Used for workspace updates.</FormField.Description>
            <FormField.Error>Enter a complete email address.</FormField.Error>
          </FormField>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => controlRef.current?.focus()}
          >
            Focus the email field
          </Button>
        </div>
      );
    }
    case "Center":
      return (
        <Component>
          <div className="center-specimen-copy">
            <h4>A clear point of focus</h4>
            <p>Center keeps this reading sample aligned without app-owned width values.</p>
          </div>
        </Component>
      );
    case "Cluster": {
      const Badge = runtimeComponent(system, "Badge");
      if (!Badge) return null;
      return (
        <Component role="group" aria-label="Active project filters">
          <Badge variant="outline">Research</Badge>
          <Badge variant="outline">In progress</Badge>
          <Badge variant="outline">This quarter</Badge>
        </Component>
      );
    }
    case "Sidebar": {
      const Link = system.components.Link;
      return (
        <Component>
          <nav className="sidebar-specimen-nav" aria-label="Project sections">
            <ul>
              <li>
                <Link href="#component-input">Project details</Link>
              </li>
              <li>
                <Link href="#component-tabs">Activity</Link>
              </li>
              <li>
                <Link href="#component-badge">Labels</Link>
              </li>
            </ul>
          </nav>
          <section aria-labelledby="sidebar-specimen-title">
            <h4 id="sidebar-specimen-title">Northstar refresh</h4>
            <p>Three sections stay in reading order as the layout narrows.</p>
          </section>
        </Component>
      );
    }
    case "AspectRatio":
      return (
        <div className="aspect-ratio-specimen">
          <Component ratio={16 / 9} role="img" aria-label="Sixteen by nine media preview">
            <span>16:9 preview area</span>
          </Component>
        </div>
      );
    case "Combobox": {
      const Combobox = withParts(Component, "Combobox");
      const ComboboxInput = Combobox.Input as React.ElementType;
      const FormField = system.components.FormField;
      const studios = [
        { value: "northstar", label: "Northstar" },
        { value: "orchard", label: "Orchard" },
        { value: "paper-street", label: "Paper Street" },
        { value: "river-and-pine", label: "River & Pine" },
      ];
      const matchingStudios = studios.filter((studio) =>
        studio.label.toLocaleLowerCase().includes(studioQuery.trim().toLocaleLowerCase()),
      );
      return (
        <FormField id="showcase-studio" required>
          <FormField.Label>Studio</FormField.Label>
          <Combobox
            name="studio"
            value={selectedStudio}
            onValueChange={setSelectedStudio}
            inputValue={studioQuery}
            onInputValueChange={setStudioQuery}
            required
            requiredMessage="Choose a studio from the list."
          >
            <FormField.Control asChild>
              <ComboboxInput ref={controlRef} placeholder="Type to filter studios" />
            </FormField.Control>
            <Combobox.Content aria-label="Studio options">
              {matchingStudios.length === 0 ? (
                <Combobox.Item value="no-matches" disabled>
                  No matching studios
                </Combobox.Item>
              ) : (
                matchingStudios.map((studio) => (
                  <Combobox.Item key={studio.value} value={studio.value} textValue={studio.label}>
                    {studio.label}
                  </Combobox.Item>
                ))
              )}
            </Combobox.Content>
          </Combobox>
          <FormField.Description>
            Type to narrow the list, then choose a studio.
          </FormField.Description>
        </FormField>
      );
    }
    case "DatePicker": {
      const DatePicker = system.components.DatePicker as React.ElementType;
      return (
        <SpecimenField
          system={system}
          id="showcase-review-date"
          label="Review date"
          description="A native date field; this sample does not book or submit anything."
        >
          <DatePicker ref={controlRef} defaultValue="2026-10-14" />
        </SpecimenField>
      );
    }
    case "NumberField": {
      const NumberField = system.components.NumberField as React.ElementType;
      return (
        <SpecimenField
          system={system}
          id="showcase-seat-count"
          label="Seats"
          description="Choose a whole number from 1 to 12."
        >
          <NumberField ref={controlRef} min={1} max={12} step={1} defaultValue={4} />
        </SpecimenField>
      );
    }
    case "Slider": {
      const Slider = system.components.Slider as React.ElementType;
      return (
        <div className="slider-specimen">
          <SpecimenField
            system={system}
            id="showcase-alert-threshold"
            label="Alert threshold"
            description="Set when a usage alert should appear."
          >
            <Slider
              ref={controlRef}
              min={0}
              max={100}
              step={5}
              value={threshold}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setThreshold(event.currentTarget.valueAsNumber)
              }
            />
          </SpecimenField>
          <output htmlFor="showcase-alert-threshold">Current threshold: {threshold}%</output>
        </div>
      );
    }
    case "FileUpload": {
      const FileUpload = system.components.FileUpload as React.ElementType;
      return (
        <SpecimenField
          system={system}
          id="showcase-attachment"
          label="Attach a document"
          description="PDF or Markdown only. The showcase does not upload or submit selected files."
        >
          <FileUpload ref={controlRef} accept=".pdf,.md" />
        </SpecimenField>
      );
    }
  }
  return null;
}

function RequiredAdditionSpecimens({ system }: { system: RegisteredSystem }) {
  return (
    <div className="component-extension-group" aria-label="Additional required components">
      <div className="component-extension-heading">
        <p className="eyebrow">Required additions</p>
        <p>Layout, input, and media primitives are part of every system.</p>
      </div>
      <div className="component-grid">
        <CapabilityCard
          system={system}
          name="Heading"
          description="Semantic heading levels from the package."
        >
          <RequiredAdditionSpecimen system={system} name="Heading" />
        </CapabilityCard>
        <CapabilityCard system={system} name="Text" description="Body and inline text primitives.">
          <RequiredAdditionSpecimen system={system} name="Text" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Link"
          description="Native navigation with the package visual language."
        >
          <RequiredAdditionSpecimen system={system} name="Link" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Container"
          description="Token-owned content width and padding."
        >
          <RequiredAdditionSpecimen system={system} name="Container" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Stack"
          description="One-dimensional flow without an app-set gap."
        >
          <RequiredAdditionSpecimen system={system} name="Stack" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="FormField"
          description="Labels, refs, help, and validation stay connected."
        >
          <RequiredAdditionSpecimen system={system} name="FormField" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Center"
          description="A centered content region with package-owned width."
        >
          <RequiredAdditionSpecimen system={system} name="Center" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Cluster"
          description="Related labels gathered into a wrapping group."
        >
          <RequiredAdditionSpecimen system={system} name="Cluster" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Sidebar"
          description="A side region and main content that can reflow."
        >
          <RequiredAdditionSpecimen system={system} name="Sidebar" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="AspectRatio"
          description="A responsive frame that keeps its width-to-height ratio."
        >
          <RequiredAdditionSpecimen system={system} name="AspectRatio" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Combobox"
          description="Editable filtering with keyboard-selectable options."
        >
          <RequiredAdditionSpecimen system={system} name="Combobox" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="DatePicker"
          description="A labeled native date control with a useful starting value."
        >
          <RequiredAdditionSpecimen system={system} name="DatePicker" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="NumberField"
          description="A numeric control with an explicit range and step."
        >
          <RequiredAdditionSpecimen system={system} name="NumberField" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="Slider"
          description="An adjustable range with its current value shown."
        >
          <RequiredAdditionSpecimen system={system} name="Slider" />
        </CapabilityCard>
        <CapabilityCard
          system={system}
          name="FileUpload"
          description="A native file picker with no upload or submission flow."
        >
          <RequiredAdditionSpecimen system={system} name="FileUpload" />
        </CapabilityCard>
      </div>
    </div>
  );
}

function OptionalSpecimen({ system, name }: { system: RegisteredSystem; name: OptionalName }) {
  const Component = runtimeComponent(system, name);
  if (!Component) return null;

  switch (name) {
    case "Grid":
      return (
        <Component>
          <span>Plan</span>
          <span>Build</span>
          <span>Review</span>
        </Component>
      );
    case "Section": {
      const Section = withParts(Component, "Section");
      return (
        <Section>
          <Section.Header>
            <Section.Title>Project notes</Section.Title>
            <Section.Description>A labeled region composed from package parts.</Section.Description>
          </Section.Header>
          <Section.Content>Three updates are ready to review.</Section.Content>
        </Section>
      );
    }
    case "Fieldset": {
      const Fieldset = withParts(Component, "Fieldset");
      const Checkbox = system.components.Checkbox;
      return (
        <Fieldset>
          <Fieldset.Legend>Notification preferences</Fieldset.Legend>
          <SpecimenField system={system} id="specimen-product-notes" label="Product notes">
            <Checkbox id="specimen-product-notes" />
          </SpecimenField>
          <SpecimenField system={system} id="specimen-release-updates" label="Release updates">
            <Checkbox id="specimen-release-updates" />
          </SpecimenField>
        </Fieldset>
      );
    }
    case "Alert": {
      const Alert = withParts(Component, "Alert");
      return (
        <Alert variant="info">
          <Alert.Title>All set</Alert.Title>
          <Alert.Description>Your changes are saved in this workspace.</Alert.Description>
        </Alert>
      );
    }
    case "Progress":
      return <Component aria-label="Import progress" value={64} max={100} />;
    case "Skeleton":
      return <Component />;
    case "Toast": {
      const Toast = withParts(Component, "Toast");
      return (
        <Toast.Provider duration={null}>
          <Toast.Viewport aria-label="Notifications">
            <Toast.Root defaultOpen duration={null}>
              <Toast.Title>Draft saved</Toast.Title>
              <Toast.Description>Your report is ready to continue.</Toast.Description>
              <Toast.Close aria-label="Dismiss notification">×</Toast.Close>
            </Toast.Root>
          </Toast.Viewport>
        </Toast.Provider>
      );
    }
    case "Accordion": {
      const Accordion = withParts(Component, "Accordion");
      return (
        <Accordion type="single" defaultValue="details" collapsible>
          <Accordion.Item value="details">
            <Accordion.Header>
              <Accordion.Trigger>View project details</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>Details are available without leaving the page.</Accordion.Content>
          </Accordion.Item>
        </Accordion>
      );
    }
    case "Avatar": {
      const Avatar = withParts(Component, "Avatar");
      return (
        <Avatar aria-label="Maya Chen">
          <Avatar.Fallback>MC</Avatar.Fallback>
        </Avatar>
      );
    }
    case "Breadcrumbs": {
      const Breadcrumbs = withParts(Component, "Breadcrumbs");
      return (
        <Breadcrumbs aria-label="Breadcrumb">
          <Breadcrumbs.List>
            <Breadcrumbs.Item>
              <Breadcrumbs.Link href="#components">Workspace</Breadcrumbs.Link>
            </Breadcrumbs.Item>
            <Breadcrumbs.Item>
              <Breadcrumbs.Link href="#component-input">Projects</Breadcrumbs.Link>
            </Breadcrumbs.Item>
            <Breadcrumbs.Item>
              <Breadcrumbs.Current>Atlas</Breadcrumbs.Current>
            </Breadcrumbs.Item>
          </Breadcrumbs.List>
        </Breadcrumbs>
      );
    }
    case "Pagination": {
      const Pagination = withParts(Component, "Pagination");
      return (
        <Pagination aria-label="Project pages">
          <Pagination.List>
            <Pagination.Item>
              <Pagination.Previous href="#component-pagination">Previous</Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Current aria-current="page">1</Pagination.Current>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Link href="#component-pagination">2</Pagination.Link>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Ellipsis>More pages</Pagination.Ellipsis>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next href="#component-pagination">Next</Pagination.Next>
            </Pagination.Item>
          </Pagination.List>
        </Pagination>
      );
    }
    case "Table": {
      const Table = withParts(Component, "Table");
      return (
        <Table aria-label="Project status">
          <Table.Caption>Project status</Table.Caption>
          <Table.Header>
            <Table.Row>
              <Table.Head scope="col">Project</Table.Head>
              <Table.Head scope="col">Status</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Atlas launch</Table.Cell>
              <Table.Cell>On track</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );
    }
    case "Metric": {
      const Metric = withParts(Component, "Metric");
      return (
        <Metric>
          <Metric.Label>Active projects</Metric.Label>
          <Metric.Value>18</Metric.Value>
          <Metric.Description>Across three workspaces</Metric.Description>
        </Metric>
      );
    }
    case "DescriptionList": {
      const DescriptionList = withParts(Component, "DescriptionList");
      return (
        <DescriptionList>
          <DescriptionList.Item>
            <DescriptionList.Term>Owner</DescriptionList.Term>
            <DescriptionList.Description>Maya Chen</DescriptionList.Description>
          </DescriptionList.Item>
          <DescriptionList.Item>
            <DescriptionList.Term>Updated</DescriptionList.Term>
            <DescriptionList.Description>26 September 2026</DescriptionList.Description>
          </DescriptionList.Item>
        </DescriptionList>
      );
    }
    case "Timeline": {
      const Timeline = withParts(Component, "Timeline");
      return (
        <Timeline aria-label="Project activity">
          <Timeline.Item>
            <Timeline.Time dateTime="2026-09-24">24 September</Timeline.Time>
            <Timeline.Title>Work started</Timeline.Title>
            <Timeline.Description>Implementation began on the first draft.</Timeline.Description>
          </Timeline.Item>
          <Timeline.Item>
            <Timeline.Time dateTime="2026-09-25">25 September</Timeline.Time>
            <Timeline.Title>Review completed</Timeline.Title>
            <Timeline.Description>The team approved the first draft.</Timeline.Description>
          </Timeline.Item>
        </Timeline>
      );
    }
    case "Meter":
      return (
        <div className="meter-specimen">
          <Component aria-label="Storage used" min={0} max={100} low={60} high={85} value={72} />
          <p>72 of 100 GB used</p>
        </div>
      );
    case "EmptyState": {
      const EmptyState = withParts(Component, "EmptyState");
      const Link = system.components.Link;
      return (
        <EmptyState>
          <EmptyState.Title>No saved views yet</EmptyState.Title>
          <EmptyState.Description>
            Saved views will appear here when they are created.
          </EmptyState.Description>
          <EmptyState.Action>
            <Link href="#components">Explore the component catalog</Link>
          </EmptyState.Action>
        </EmptyState>
      );
    }
  }
  return null;
}

const OPTIONAL_DESCRIPTIONS: Record<OptionalName, string> = {
  Grid: "A package-owned two-dimensional layout primitive.",
  Section: "A meaningful page region with named content parts.",
  Fieldset: "A labeled group of related form controls.",
  Alert: "A status message with clear semantic intent.",
  Progress: "Progress information with an accessible value.",
  Skeleton: "A loading placeholder from the active package.",
  Toast: "A politely announced notification with package-owned timing.",
  Accordion: "Expandable content with keyboard-operable triggers.",
  Avatar: "A compact identity marker with a fallback.",
  Breadcrumbs: "A navigation trail with an announced current page.",
  Pagination: "URL-first page links without data logic.",
  Table: "A semantic data table with native header relationships.",
  Metric: "A compact statistic with its label, value, and context.",
  DescriptionList: "Related terms and descriptions in a semantic group.",
  Timeline: "An ordered sequence of dated events.",
  Meter: "A named measurement within a known range.",
  EmptyState: "A normal-content placeholder for a surface with no items.",
};

function OptionalSpecimens({ system }: { system: RegisteredSystem }) {
  return (
    <div className="component-extension-group" aria-label="Optional capabilities">
      <div className="component-extension-heading">
        <p className="eyebrow">Optional capabilities</p>
        <p>Unavailable items stay visible as unavailable; no missing component is rendered.</p>
      </div>
      <div className="component-grid">
        {OPTIONAL_COMPONENTS.map((name) => (
          <CapabilityCard
            key={name}
            system={system}
            name={name}
            description={OPTIONAL_DESCRIPTIONS[name]}
          >
            <OptionalSpecimen system={system} name={name} />
          </CapabilityCard>
        ))}
      </div>
    </div>
  );
}

export function Showcase({ initialSystemId }: { initialSystemId?: string } = {}) {
  const [systemId, setSystemId] = React.useState(initialSystemId ?? registeredSystems[0]!.id);
  const system = getRegisteredSystem(systemId);
  return (
    <main className={`showcase-shell ${system.uiClass}`} data-system={system.id}>
      <header className="showcase-header">
        <div className="brand-lockup">
          <span className="brand-mark">M</span>
          <div>
            <p className="kicker">Maivand / laboratory</p>
            <h1>
              Design systems
              <br />
              <em>in the open.</em>
            </h1>
          </div>
        </div>
        <div className="header-meta">
          <p>
            Portable visual languages
            <br />
            validated in isolation.
          </p>
          <SystemPicker system={system} onChange={setSystemId} />
        </div>
      </header>
      <div className="showcase-rule" />
      <div className="showcase-intro">
        <p className="eyebrow">Component laboratory</p>
        <p className="intro-copy">
          A shared interface can carry a completely different point of view. Explore the tokens,
          states, and primitives that make each registered system unmistakably its own.
          <br />
          <a className="intro-catalog-link" href={`/showcase/${system.id}#components`}>
            Open {system.name}&apos;s component catalog <span aria-hidden="true">↗</span>
          </a>
        </p>
        <div className="intro-stamp" aria-hidden="true">
          {system.name} / active
        </div>
      </div>
      <FoundationSection system={system} />
      <ComponentsSection system={system} />
      <footer className="showcase-footer">
        <span>Maivand design systems</span>
        <span>
          {system.name} · {system.version}
        </span>
      </footer>
    </main>
  );
}
