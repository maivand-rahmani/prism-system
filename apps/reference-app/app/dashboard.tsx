"use client";

import * as React from "react";
import { getRegisteredSystem, registeredSystems, type RegisteredSystem } from "./registry";

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
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="system-a">System A · calm</Select.Item>
        <Select.Item value="system-b">System B · electric</Select.Item>
      </Select.Content>
    </Select>
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
              <Select.Value />
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
        <div className="system-select">
          <span className="nav-label">Design system</span>
          <SystemSelector system={system} onChange={onChange} />
        </div>
      </div>
    </aside>
  );
}

export function Dashboard() {
  const [systemId, setSystemId] = React.useState(registeredSystems[0]!.id);
  const system = getRegisteredSystem(systemId);
  const { Button, Input, Card, Badge, Checkbox, Tabs, Dialog, Select } = system.components;
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
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All activity</Select.Item>
                <Select.Item value="published">Published</Select.Item>
                <Select.Item value="review">Needs review</Select.Item>
              </Select.Content>
            </Select>
            <Button variant="outline">Filter</Button>
            <Dialog>
              <Dialog.Trigger>New report</Dialog.Trigger>
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
                <div className="activity-table" role="table" aria-label="Recent activity">
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
        </div>
      </div>
    </main>
  );
}
