"use client";

import * as React from "react";
import { OPTIONAL_COMPONENTS_V4 } from "@prism-system/ui-core";
import type { REQUIRED_COMPONENTS, REQUIRED_COMPONENTS_V4 } from "@prism-system/ui-core";
import { getRegisteredSystem, registeredSystems, type RegisteredSystem } from "./registry";

type OptionalName = (typeof OPTIONAL_COMPONENTS_V4)[number];
type RequiredV4Name = Exclude<
  (typeof REQUIRED_COMPONENTS_V4)[number],
  (typeof REQUIRED_COMPONENTS)[number]
>;

function hasOwn(value: object, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, name);
}

function tokenRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tokenAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => tokenRecord(current)[key], value);
}

function hasDarkTheme(system: RegisteredSystem): boolean {
  return Object.keys(tokenRecord(tokenAt(system.tokens, "themes.dark.color"))).length > 0;
}

function optionalComponent(system: RegisteredSystem, name: OptionalName): React.ElementType | null {
  if (system.componentContract !== "v4") return null;
  const component = system.components[name];
  if (!hasOwn(system.components, name) || component == null) return null;
  if (!hasOwn(system.manifest.components, name)) return null;
  return component;
}

type PartComponent = React.ComponentType<Record<string, unknown>>;
type CompoundParts = {
  FormField: { Label: PartComponent; Control: PartComponent; Description: PartComponent };
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
};

function compound<Name extends keyof CompoundParts>(
  component: React.ElementType,
  _name: Name,
): PartComponent & CompoundParts[Name] {
  return component as PartComponent & CompoundParts[Name];
}

const metrics = [
  { label: "Active members", value: "2,842", change: "+12.4%", detail: "vs. previous month" },
  { label: "Projects shipped", value: "184", change: "+8.7%", detail: "across all teams" },
  { label: "Avg. cycle time", value: "4.6d", change: "−1.2d", detail: "faster than target" },
  { label: "Open requests", value: "28", change: "6 urgent", detail: "needs a response" },
];

const activity = [
  {
    initials: "AL",
    name: "Ari Lane",
    action: "published a new report",
    time: "8 min ago",
    status: "Published",
  },
  {
    initials: "JM",
    name: "Jules Moss",
    action: "requested access to Atlas",
    time: "42 min ago",
    status: "Review",
  },
  {
    initials: "SK",
    name: "Sana Kim",
    action: "closed an onboarding task",
    time: "2 hr ago",
    status: "Complete",
  },
  {
    initials: "RB",
    name: "Rowan Bell",
    action: "added a comment to Brief 04",
    time: "Yesterday",
    status: "Comment",
  },
];

function SystemSelector({
  system,
  onChange,
}: {
  system: RegisteredSystem;
  onChange: (id: string) => void;
}) {
  const { Select } = system.components;
  return (
    <Select value={system.id} onValueChange={onChange}>
      <Select.Trigger aria-label="Design system selector">
        <Select.Value>{system.name}</Select.Value>
      </Select.Trigger>
      <Select.Content>
        {registeredSystems.map((item) => (
          <Select.Item key={item.id} value={item.id}>
            {item.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
}

function requiredV4Component(
  system: RegisteredSystem,
  name: RequiredV4Name,
): React.ElementType | null {
  if (system.componentContract !== "v4") return null;
  const component = system.components[name];
  if (!hasOwn(system.components, name) || component == null) return null;
  if (!hasOwn(system.manifest.components, name)) return null;
  return component;
}

function V4RequiredComposition({ system }: { system: RegisteredSystem }) {
  const Heading = requiredV4Component(system, "Heading");
  const Text = requiredV4Component(system, "Text");
  const Link = requiredV4Component(system, "Link");
  const Container = requiredV4Component(system, "Container");
  const Stack = requiredV4Component(system, "Stack");
  const FormFieldBase = requiredV4Component(system, "FormField");
  if (!Heading || !Text || !Link || !Container || !Stack || !FormFieldBase) return null;
  const FormField = compound(FormFieldBase, "FormField");
  const { Card, Input } = system.components;

  return (
    <section className="v4-primitives" aria-labelledby="v4-primitives-title">
      <div className="reference-section-heading">
        <div>
          <p className="eyebrow">Composition primitives</p>
          <h2 id="v4-primitives-title">The rest of the required contract</h2>
        </div>
        <p>Six V4 building blocks, composed from the active package with no visual overrides.</p>
      </div>
      <Card>
        <Card.Content>
          <div className="v4-primitives-grid">
            <div className="primitive-example">
              <Heading level={3}>Heading</Heading>
              <Text as="p">Semantic levels set the outline; the package sets the voice.</Text>
            </div>
            <div className="primitive-example">
              <Heading level={3}>Text</Heading>
              <Text as="p">Body and inline copy inherit the active system's type rules.</Text>
            </div>
            <div className="primitive-example">
              <Heading level={3}>Link</Heading>
              <Text as="p">
                <Link href={`/showcase/${system.id}#components`}>
                  Open this system's component catalog
                </Link>
              </Text>
            </div>
            <div className="primitive-example">
              <Heading level={3}>Container</Heading>
              <Container>
                <Text as="p">Content width and padding come from system tokens.</Text>
              </Container>
            </div>
            <div className="primitive-example">
              <Heading level={3}>Stack</Heading>
              <Stack direction="vertical">
                <Text>Keep related actions together.</Text>
                <Text>The system owns the rhythm.</Text>
              </Stack>
            </div>
            <div className="primitive-example">
              <Heading level={3}>FormField</Heading>
              <FormField id="reference-workspace-email" required>
                <FormField.Label>Email address</FormField.Label>
                <FormField.Control asChild>
                  <Input type="email" placeholder="name@company.com" />
                </FormField.Control>
                <FormField.Description>Used for workspace updates.</FormField.Description>
              </FormField>
            </div>
          </div>
        </Card.Content>
      </Card>
    </section>
  );
}

function OptionalReference({ system, name }: { system: RegisteredSystem; name: OptionalName }) {
  const Component = optionalComponent(system, name);
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
      const Section = compound(Component, "Section");
      return (
        <Section>
          <Section.Header>
            <Section.Title>Team update</Section.Title>
            <Section.Description>A labeled region built from this system.</Section.Description>
          </Section.Header>
          <Section.Content>Four people are ready to review.</Section.Content>
        </Section>
      );
    }
    case "Fieldset": {
      const Fieldset = compound(Component, "Fieldset");
      const { Checkbox } = system.components;
      return (
        <Fieldset>
          <Fieldset.Legend>Updates</Fieldset.Legend>
          <Checkbox label="Weekly digest" />
          <Checkbox label="Product news" />
        </Fieldset>
      );
    }
    case "Alert": {
      const Alert = compound(Component, "Alert");
      return (
        <Alert variant="success">
          <Alert.Title>Saved</Alert.Title>
          <Alert.Description>Your changes are up to date.</Alert.Description>
        </Alert>
      );
    }
    case "Progress":
      return <Component aria-label="Project completion" value={72} max={100} />;
    case "Skeleton":
      return <Component />;
    case "Toast": {
      const Toast = compound(Component, "Toast");
      return (
        <Toast.Provider duration={null}>
          <Toast.Viewport aria-label="Notifications">
            <Toast.Root defaultOpen duration={null}>
              <Toast.Title>Report saved</Toast.Title>
              <Toast.Description>The update is ready to share.</Toast.Description>
              <Toast.Close aria-label="Dismiss notification">×</Toast.Close>
            </Toast.Root>
          </Toast.Viewport>
        </Toast.Provider>
      );
    }
    case "Accordion": {
      const Accordion = compound(Component, "Accordion");
      return (
        <Accordion type="single" defaultValue="members" collapsible>
          <Accordion.Item value="members">
            <Accordion.Header>
              <Accordion.Trigger>Team members</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>Four people have access to this workspace.</Accordion.Content>
          </Accordion.Item>
        </Accordion>
      );
    }
    case "Avatar": {
      const Avatar = compound(Component, "Avatar");
      return (
        <Avatar aria-label="Maya Chen">
          <Avatar.Fallback>MC</Avatar.Fallback>
        </Avatar>
      );
    }
    case "Breadcrumbs": {
      const Breadcrumbs = compound(Component, "Breadcrumbs");
      return (
        <Breadcrumbs aria-label="Workspace breadcrumb">
          <Breadcrumbs.List>
            <Breadcrumbs.Item>
              <Breadcrumbs.Link href="#overview">Workspace</Breadcrumbs.Link>
            </Breadcrumbs.Item>
            <Breadcrumbs.Item>
              <Breadcrumbs.Link href="#projects">Projects</Breadcrumbs.Link>
            </Breadcrumbs.Item>
            <Breadcrumbs.Item>
              <Breadcrumbs.Current>Atlas</Breadcrumbs.Current>
            </Breadcrumbs.Item>
          </Breadcrumbs.List>
        </Breadcrumbs>
      );
    }
    case "Pagination": {
      const Pagination = compound(Component, "Pagination");
      return (
        <Pagination aria-label="Activity pages">
          <Pagination.List>
            <Pagination.Item>
              <Pagination.Previous href="#activity">Previous</Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Current aria-current="page">1</Pagination.Current>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Link href="#activity">2</Pagination.Link>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next href="#activity">Next</Pagination.Next>
            </Pagination.Item>
          </Pagination.List>
        </Pagination>
      );
    }
    case "Table": {
      const Table = compound(Component, "Table");
      return (
        <Table aria-label="Work status">
          <Table.Caption>Work status</Table.Caption>
          <Table.Header>
            <Table.Row>
              <Table.Head scope="col">Item</Table.Head>
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
  }
  return null;
}

function OptionalReferenceSection({ system }: { system: RegisteredSystem }) {
  const { Card } = system.components;
  const available = OPTIONAL_COMPONENTS_V4.filter(
    (name) => optionalComponent(system, name) !== null,
  );
  return (
    <section className="optional-reference" aria-labelledby="optional-reference-title">
      <div className="reference-section-heading">
        <div>
          <p className="eyebrow">Runtime capabilities</p>
          <h2 id="optional-reference-title">Optional components in this system</h2>
        </div>
        <p>
          Only optional components present in the active runtime and package manifest appear here.
        </p>
      </div>
      {available.length > 0 ? (
        <div className="optional-reference-grid">
          {available.map((name) => (
            <article className="optional-reference-item" key={name}>
              <Card>
                <Card.Header>
                  <Card.Title>{name}</Card.Title>
                  <Card.Description>Optional capability from {system.name}.</Card.Description>
                </Card.Header>
                <Card.Content>
                  <OptionalReference system={system} name={name} />
                </Card.Content>
              </Card>
            </article>
          ))}
        </div>
      ) : (
        <p className="optional-reference-empty">
          This design system does not publish optional V4 components.
        </p>
      )}
    </section>
  );
}

function Sidebar({
  system,
  onChange,
}: {
  system: RegisteredSystem;
  onChange: (id: string) => void;
}) {
  const { Button, Select } = system.components;
  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-mark">M</span>
        <span>
          Maivand <small>studio</small>
        </span>
      </div>
      <nav aria-label="Primary navigation">
        <p className="nav-label">Workspace</p>
        <a className="nav-link active" href="#overview">
          <span aria-hidden="true">◈</span>Overview
        </a>
        <a className="nav-link" href="#activity">
          <span aria-hidden="true">◌</span>Activity
        </a>
        <a className="nav-link" href="#projects">
          <span aria-hidden="true">□</span>Projects
        </a>
        <a className="nav-link" href="#people">
          <span aria-hidden="true">⊙</span>People
        </a>
        <p className="nav-label nav-label-spaced">Manage</p>
        <a className="nav-link" href="#settings">
          <span aria-hidden="true">⌘</span>Settings
        </a>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-select">
          <span>Workspace</span>
          <Select defaultValue="northstar">
            <Select.Trigger aria-label="Workspace">
              <Select.Value>Northstar studio</Select.Value>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="northstar">Northstar studio</Select.Item>
              <Select.Item value="field-notes">Field notes</Select.Item>
              <Select.Item value="archive">Archive</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="profile-row">
          <span className="avatar">MC</span>
          <span>
            <strong>Maya Chen</strong>
            <small>Admin</small>
          </span>
          <Button variant="ghost" size="icon" aria-label="Open profile menu">
            ···
          </Button>
        </div>
        <div className="system-select" id="settings">
          <span className="nav-label">Design system</span>
          <SystemSelector system={system} onChange={onChange} />
        </div>
      </div>
    </aside>
  );
}

export function Dashboard() {
  const [systemId, setSystemId] = React.useState(registeredSystems[0]!.id);
  const [darkTheme, setDarkTheme] = React.useState(false);
  const system = getRegisteredSystem(systemId);
  React.useEffect(() => {
    setDarkTheme(document.documentElement.dataset.prismTheme === "dark");
  }, []);
  const {
    Button,
    Input,
    Textarea,
    Card,
    Badge,
    Checkbox,
    RadioGroup,
    Switch,
    Tabs,
    Dialog,
    DropdownMenu,
    Tooltip,
    Separator,
    Select,
  } = system.components;
  return (
    <main className={`dashboard-shell ${system.uiClass}`} data-system={system.id}>
      <Sidebar system={system} onChange={setSystemId} />
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <p className="crumb">Workspace / Overview</p>
            <h1>
              Good morning, Maya <span aria-hidden="true">✦</span>
            </h1>
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" size="icon" aria-label="Search">
              ⌕
            </Button>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              ♢
            </Button>
            <Button
              variant="ghost"
              aria-label={darkTheme ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={darkTheme}
              disabled={!hasDarkTheme(system)}
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
            <Button variant="primary">Share update</Button>
          </div>
        </header>
        <div className="dashboard-content">
          <section id="overview" aria-labelledby="overview-title">
            <div className="section-top">
              <div>
                <p className="eyebrow">Monday, September 20, 2026</p>
                <h2 id="overview-title">Your studio at a glance</h2>
              </div>
              <Badge variant="success" dot>
                All systems normal
              </Badge>
            </div>
            <div className="metric-grid">
              {metrics.map((metric) => (
                <Card key={metric.label} variant="elevated">
                  <Card.Content>
                    <p className="metric-label">{metric.label}</p>
                    <strong className="metric-value">{metric.value}</strong>
                    <div className="metric-detail">
                      <Badge variant={metric.label === "Open requests" ? "warning" : "success"}>
                        {metric.change}
                      </Badge>
                      <span>{metric.detail}</span>
                    </div>
                  </Card.Content>
                </Card>
              ))}
            </div>
          </section>
          <section className="workspace-toolbar" aria-label="Activity filters">
            <Input
              aria-label="Search activity"
              placeholder="Search activity"
              startAdornment={<span aria-hidden="true">⌕</span>}
            />
            <Select defaultValue="all">
              <Select.Trigger aria-label="Filter activity">
                <Select.Value>All activity</Select.Value>
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All activity</Select.Item>
                <Select.Item value="published">Published</Select.Item>
                <Select.Item value="review">Needs review</Select.Item>
              </Select.Content>
            </Select>
            <Button variant="outline">Filter</Button>
            <Dialog>
              <Dialog.Trigger asChild>
                <Button variant="primary">New report</Button>
              </Dialog.Trigger>
              <Dialog.Content>
                <Dialog.Header>
                  <Dialog.Title>Create a report</Dialog.Title>
                  <Dialog.Description>
                    Start a focused update for the studio. This is a static reference form.
                  </Dialog.Description>
                </Dialog.Header>
                <Card variant="muted">
                  <Card.Content>
                    <div className="dialog-form">
                      <Input label="Report title" placeholder="September studio pulse" />
                      <Input label="Owner" defaultValue="Maya Chen" />
                      <Checkbox
                        defaultChecked
                        label="Notify the studio"
                        description="Send a note when the report is ready."
                      />
                    </div>
                  </Card.Content>
                </Card>
                <Dialog.Footer>
                  <Dialog.Close>Cancel</Dialog.Close>
                  <Button>Save draft</Button>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog>
          </section>
          <section className="required-control-reference" aria-labelledby="required-control-title">
            <div className="reference-section-heading">
              <div>
                <p className="eyebrow">Required interactions</p>
                <h2 id="required-control-title">Controls in context</h2>
              </div>
              <p>The fixed dashboard keeps the shared required controls in its composition.</p>
            </div>
            <div className="required-control-grid">
              <div className="required-control-example">
                <h3>Textarea</h3>
                <Textarea
                  id="dashboard-project-note"
                  aria-label="Project note"
                  placeholder="A short project note..."
                  rows={2}
                />
              </div>
              <div className="required-control-example">
                <h3>RadioGroup</h3>
                <RadioGroup
                  aria-label="Report cadence"
                  defaultValue="weekly"
                  orientation="horizontal"
                >
                  <RadioGroup.Item value="weekly">
                    <span>Weekly</span>
                  </RadioGroup.Item>
                  <RadioGroup.Item value="monthly">
                    <span>Monthly</span>
                  </RadioGroup.Item>
                </RadioGroup>
              </div>
              <div className="required-control-example">
                <h3>Switch</h3>
                <div className="required-switch-row">
                  <Switch aria-label="Include release notes" defaultChecked />
                  <span>Include release notes</span>
                </div>
              </div>
              <div className="required-control-example">
                <h3>DropdownMenu</h3>
                <DropdownMenu>
                  <DropdownMenu.Trigger type="button">Project actions</DropdownMenu.Trigger>
                  <DropdownMenu.Content>
                    <DropdownMenu.Item>Rename</DropdownMenu.Item>
                    <DropdownMenu.Item>Duplicate</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              </div>
              <div className="required-control-example">
                <h3>Tooltip</h3>
                <Tooltip.Provider>
                  <Tooltip>
                    <Tooltip.Trigger type="button">Focus for a hint</Tooltip.Trigger>
                    <Tooltip.Content>Short supporting context.</Tooltip.Content>
                  </Tooltip>
                </Tooltip.Provider>
              </div>
              <div className="required-control-example">
                <h3>Separator</h3>
                <div className="control-separator">
                  <span>Budget</span>
                  <Separator orientation="vertical" aria-label="Project detail boundary" />
                  <span>Timeline</span>
                </div>
              </div>
            </div>
          </section>
          <section className="dashboard-columns">
            <div className="primary-column">
              <Card padding="none">
                <div className="surface-heading">
                  <div>
                    <h2>Recent activity</h2>
                    <p>What changed across your workspace.</p>
                  </div>
                  <Button variant="link">View all</Button>
                </div>
                <div
                  className="activity-table"
                  id="activity"
                  role="table"
                  aria-label="Recent activity"
                >
                  <div className="activity-head" role="row">
                    <span role="columnheader">Member</span>
                    <span role="columnheader">Activity</span>
                    <span role="columnheader">Status</span>
                    <span role="columnheader">When</span>
                  </div>
                  {activity.map((item) => (
                    <div className="activity-row" role="row" key={item.name}>
                      <div className="member-cell" role="cell">
                        <span className="avatar avatar-small">{item.initials}</span>
                        <strong>{item.name}</strong>
                      </div>
                      <span role="cell">{item.action}</span>
                      <Badge
                        role="cell"
                        variant={
                          item.status === "Review"
                            ? "warning"
                            : item.status === "Published"
                              ? "info"
                              : "success"
                        }
                      >
                        {item.status}
                      </Badge>
                      <small role="cell">{item.time}</small>
                    </div>
                  ))}
                </div>
              </Card>
              <Card id="projects" variant="muted">
                <Card.Header>
                  <Card.Title>Project pulse</Card.Title>
                  <Card.Description>
                    A quiet surface for a second reference scenario.
                  </Card.Description>
                </Card.Header>
                <Card.Content>
                  <Tabs defaultValue="active">
                    <Tabs.List>
                      <Tabs.Trigger value="active">Active</Tabs.Trigger>
                      <Tabs.Trigger value="upcoming">Upcoming</Tabs.Trigger>
                      <Tabs.Trigger value="archive">Archive</Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content value="active">
                      <div className="pulse-list">
                        <div>
                          <span className="pulse-dot" />
                          <span>
                            <strong>Atlas launch</strong>
                            <small>Due in 4 days</small>
                          </span>
                          <Badge variant="success">On track</Badge>
                        </div>
                        <div>
                          <span className="pulse-dot" />
                          <span>
                            <strong>Brief 04</strong>
                            <small>Due in 9 days</small>
                          </span>
                          <Badge variant="warning">At risk</Badge>
                        </div>
                      </div>
                    </Tabs.Content>
                    <Tabs.Content value="upcoming">
                      <p className="tab-copy">Two projects are waiting for a start date.</p>
                    </Tabs.Content>
                    <Tabs.Content value="archive">
                      <p className="tab-copy">Archived work will appear here.</p>
                    </Tabs.Content>
                  </Tabs>
                </Card.Content>
              </Card>
            </div>
            <aside className="secondary-column">
              <Card>
                <Card.Header>
                  <Card.Title>Next up</Card.Title>
                  <Card.Description>Keep the small promises moving.</Card.Description>
                </Card.Header>
                <Card.Content>
                  <div className="todo-list">
                    <Checkbox defaultChecked label="Review launch notes" />
                    <Checkbox label="Send partner recap" />
                    <Checkbox label="Plan Friday retro" />
                  </div>
                </Card.Content>
                <Card.Footer>
                  <Button variant="ghost">Open tasks</Button>
                </Card.Footer>
              </Card>
              <Card variant="outline">
                <Card.Header>
                  <Card.Title>Nothing urgent</Card.Title>
                  <Card.Description>Your queue is clear for now. Enjoy the space.</Card.Description>
                </Card.Header>
                <Card.Content>
                  <div className="empty-state">
                    <span className="empty-icon" aria-hidden="true">
                      ✦
                    </span>
                    <p>All caught up</p>
                    <Button variant="secondary" size="sm">
                      Browse projects
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            </aside>
          </section>
          <section className="form-reference" id="people">
            <Card>
              <Card.Header>
                <Card.Title>Invite your next collaborator</Card.Title>
                <Card.Description>
                  One compact form section to validate labels, fields, and actions in context.
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <div className="invite-grid">
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="name@company.com"
                    hint="They will receive a workspace invite."
                  />
                  <Input label="Role" defaultValue="Contributor" />
                  <Button variant="primary">Send invitation</Button>
                </div>
              </Card.Content>
            </Card>
          </section>
          <V4RequiredComposition system={system} />
          <OptionalReferenceSection system={system} />
        </div>
      </div>
    </main>
  );
}
