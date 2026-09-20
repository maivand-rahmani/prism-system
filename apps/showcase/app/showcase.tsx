"use client";

import * as React from "react";
import { registeredSystems, getRegisteredSystem, type RegisteredSystem } from "./registry";

function SystemPicker({
  system,
  onChange,
}: {
  system: RegisteredSystem;
  onChange: (id: string) => void;
}) {
  const { Select } = system.components;
  return (
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
  );
}

function FoundationSection({ system }: { system: RegisteredSystem }) {
  const { tokens } = system;
  const colors = Object.entries(tokens.color) as Array<[string, string]>;
  const radii = Object.entries(tokens.radius) as Array<[string, string]>;
  const shadows = Object.entries(tokens.shadow) as Array<[string, string]>;
  const motion = Object.entries(tokens.motion) as Array<[string, string]>;
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
            {colors.map(([name, value]) => (
              <div className="swatch" key={name}>
                <span className="color-swatch" style={{ backgroundColor: value }} />
                <span>
                  <strong>{name}</strong>
                  <small>{value}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="foundation-panel">
          <h3>Typography</h3>
          <div className="type-samples">
            <p className="type-display">Aa</p>
            <p className="type-heading">Display / editorial</p>
            <p className="type-body">
              Body copy keeps the interface clear, measured, and easy to scan.
            </p>
            <code>font family · package-owned</code>
          </div>
        </div>
        <div className="foundation-panel">
          <h3>Spacing</h3>
          <div className="spacing-samples">
            {["xs", "sm", "md", "lg", "xl"].map((name, index) => (
              <div className="spacing-row" key={name}>
                <span>{name}</span>
                <i style={{ width: `${(index + 1) * 16}px` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="foundation-panel">
          <h3>Radius</h3>
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
        </div>
        <div className="foundation-panel">
          <h3>Borders</h3>
          <div className="border-samples">
            <span className="border-line" />
            <span className="border-line border-line-strong" />
            <small>quiet → expressive</small>
          </div>
        </div>
        <div className="foundation-panel">
          <h3>Shadows</h3>
          <div className="shadow-samples">
            {shadows.map(([name, value]) => (
              <div key={name} className="shadow-chip" style={{ boxShadow: value }}>
                <small>{name}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="foundation-panel foundation-motion">
          <h3>Motion</h3>
          <div className="motion-samples">
            {motion.map(([name, value]) => (
              <div key={name}>
                <strong>{name}</strong>
                <code>{value}</code>
              </div>
            ))}
            <span className="motion-orbit" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ComponentsSection({ system }: { system: RegisteredSystem }) {
  const { Button, Input, Card, Badge, Checkbox, Tabs, Dialog, Select } = system.components;
  return (
    <section className="laboratory-section" aria-labelledby="components-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">02 / components</p>
          <h2 id="components-title">Eight pieces, one contract</h2>
        </div>
        <p className="section-intro">
          Every specimen below comes from the registered package. The composition stays fixed while
          the visual language changes.
        </p>
      </div>
      <div className="component-stack">
        <Card variant="elevated" padding="lg">
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
                States <span className="hint-label">hover each control · focus is pinned</span>
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
                  <Button variant="outline" autoFocus>
                    Focus
                  </Button>
                  <small>keyboard ring</small>
                </div>
                <div>
                  <Button disabled>Disabled</Button>
                  <small>unavailable</small>
                </div>
                <div>
                  <Button loading loadingText="Saving">
                    Loading
                  </Button>
                  <small>busy</small>
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
        <div className="component-grid">
          <Card>
            <Card.Header>
              <Card.Title>Input</Card.Title>
              <Card.Description>Labels, hints, and validation.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Input
                label="Workspace name"
                placeholder="e.g. Northstar"
                hint="Shown to your team"
              />
              <Input
                label="Invalid field"
                defaultValue="Needs attention"
                error="Please choose another name."
              />
            </Card.Content>
          </Card>
          <Card>
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
          <Card>
            <Card.Header>
              <Card.Title>Checkbox</Card.Title>
              <Card.Description>Selection with supporting copy.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="checkbox-stack">
                <Checkbox
                  defaultChecked
                  label="Weekly digest"
                  description="A short summary every Monday."
                />
                <Checkbox label="Product updates" description="Occasional notes from the team." />
                <Checkbox disabled label="Locked preference" />
              </div>
            </Card.Content>
          </Card>
          <Card>
            <Card.Header>
              <Card.Title>Select</Card.Title>
              <Card.Description>A package-owned accessible choice field.</Card.Description>
            </Card.Header>
            <Card.Content>
              <Select
                label="Theme preference"
                defaultValue="balanced"
                hint="This specimen uses the package select."
              >
                <Select.Trigger aria-label="Theme preference">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="balanced">Balanced</Select.Item>
                  <Select.Item value="quiet">Quiet</Select.Item>
                  <Select.Item value="expressive">Expressive</Select.Item>
                </Select.Content>
              </Select>
            </Card.Content>
          </Card>
          <Card>
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
          <Card>
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
                  <Input label="Email address" type="email" placeholder="name@example.com" />
                  <Dialog.Footer>
                    <Dialog.Close>Cancel</Dialog.Close>
                    <Button>Send invite</Button>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog>
            </Card.Content>
          </Card>
        </div>
        <div className="contract-note">
          <span>✓</span>
          <p>
            <strong>Registered surface</strong> Button, Input, Card, Badge, Checkbox, Tabs, Dialog,
            and Select are all resolved from <code>{system.packageName}</code>.
          </p>
        </div>
      </div>
    </section>
  );
}

export function Showcase() {
  const [systemId, setSystemId] = React.useState(registeredSystems[0]!.id);
  const system = getRegisteredSystem(systemId);
  return (
    <main className={`showcase-shell ${system.uiClass}`} data-system={system.id}>
      <header className="showcase-header">
        <div className="brand-lockup">
          <span className="brand-mark">M</span>
          <div>
            <p className="kicker">Maivand / V1</p>
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
        </p>
        <div className="intro-stamp" aria-hidden="true">
          {system.id === "system-a" ? "A / calm" : "B / electric"}
        </div>
      </div>
      <FoundationSection system={system} />
      <ComponentsSection system={system} />
      <footer className="showcase-footer">
        <span>Maivand design systems</span>
        <span>
          V1 · {system.name} · {system.version}
        </span>
      </footer>
    </main>
  );
}
