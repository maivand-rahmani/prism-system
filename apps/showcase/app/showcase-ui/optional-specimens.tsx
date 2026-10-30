"use client";

import type { OPTIONAL_COMPONENTS } from "@prism-system/ui-core";
import { runtimeComponent, withParts } from "./system-theme";
import type { RegisteredSystem } from "../registry";

export type OptionalName = (typeof OPTIONAL_COMPONENTS)[number];

export function OptionalSpecimen({
  system,
  name,
}: {
  system: RegisteredSystem;
  name: OptionalName;
}) {
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
      const Section = withParts(Component, "Header", "Title", "Content");
      return (
        <Section>
          <Section.Header>
            <Section.Title>Project notes</Section.Title>
          </Section.Header>
          <Section.Content>Three updates are ready.</Section.Content>
        </Section>
      );
    }
    case "Fieldset": {
      const Fieldset = withParts(Component, "Legend");
      const Checkbox = runtimeComponent(system, "Checkbox");
      if (!Checkbox) return null;
      return (
        <Fieldset>
          <Fieldset.Legend>Notifications</Fieldset.Legend>
          <Checkbox label="Product notes" defaultChecked />
          <Checkbox label="Release updates" />
        </Fieldset>
      );
    }
    case "Alert": {
      const Alert = withParts(Component, "Title", "Description");
      return (
        <Alert variant="info">
          <Alert.Title>All set</Alert.Title>
          <Alert.Description>Changes saved.</Alert.Description>
        </Alert>
      );
    }
    case "Progress":
      return <Component aria-label="Import progress" value={64} max={100} />;
    case "Skeleton":
      return <Component aria-label="Loading project" />;
    case "Toast": {
      const Toast = withParts(
        Component,
        "Provider",
        "Viewport",
        "Root",
        "Title",
        "Description",
        "Close",
      );
      return (
        <Toast.Provider duration={null}>
          <Toast.Viewport aria-label="Notifications">
            <Toast.Root defaultOpen duration={null}>
              <Toast.Title>Draft saved</Toast.Title>
              <Toast.Description>Your report is ready.</Toast.Description>
              <Toast.Close aria-label="Dismiss notification">×</Toast.Close>
            </Toast.Root>
          </Toast.Viewport>
        </Toast.Provider>
      );
    }
    case "Accordion": {
      const Accordion = withParts(Component, "Item", "Header", "Trigger", "Content");
      return (
        <Accordion type="single" defaultValue="details" collapsible>
          <Accordion.Item value="details">
            <Accordion.Header>
              <Accordion.Trigger>Project details</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>Details stay close to the section.</Accordion.Content>
          </Accordion.Item>
        </Accordion>
      );
    }
    case "Avatar": {
      const Avatar = withParts(Component, "Fallback");
      return (
        <Avatar aria-label="Maya Chen">
          <Avatar.Fallback>MC</Avatar.Fallback>
        </Avatar>
      );
    }
    case "Breadcrumbs": {
      const Breadcrumbs = withParts(Component, "List", "Item", "Link", "Current");
      return (
        <Breadcrumbs aria-label="Breadcrumb">
          <Breadcrumbs.List>
            <Breadcrumbs.Item>
              <Breadcrumbs.Link href="#showcase-tabs">Workspace</Breadcrumbs.Link>
            </Breadcrumbs.Item>
            <Breadcrumbs.Item>
              <Breadcrumbs.Current>Projects</Breadcrumbs.Current>
            </Breadcrumbs.Item>
          </Breadcrumbs.List>
        </Breadcrumbs>
      );
    }
    case "Pagination": {
      const Pagination = withParts(
        Component,
        "List",
        "Item",
        "Previous",
        "Current",
        "Link",
        "Next",
      );
      return (
        <Pagination aria-label="Project pages">
          <Pagination.List>
            <Pagination.Item>
              <Pagination.Previous href="#additional">Previous</Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Current aria-current="page">1</Pagination.Current>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Link href="#additional">2</Pagination.Link>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next href="#additional">Next</Pagination.Next>
            </Pagination.Item>
          </Pagination.List>
        </Pagination>
      );
    }
    case "Table": {
      const Table = withParts(Component, "Caption", "Header", "Row", "Head", "Body", "Cell");
      return (
        <Table aria-label="Project status">
          <Table.Caption>Current projects</Table.Caption>
          <Table.Header>
            <Table.Row>
              <Table.Head scope="col">Project</Table.Head>
              <Table.Head scope="col">Status</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Atlas</Table.Cell>
              <Table.Cell>On track</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );
    }
    case "Metric": {
      const Metric = withParts(Component, "Label", "Value", "Description");
      return (
        <Metric>
          <Metric.Label>Active projects</Metric.Label>
          <Metric.Value>18</Metric.Value>
          <Metric.Description>Across three workspaces</Metric.Description>
        </Metric>
      );
    }
    case "DescriptionList": {
      const List = withParts(Component, "Item", "Term", "Description");
      return (
        <List>
          <List.Item>
            <List.Term>Owner</List.Term>
            <List.Description>Maya Chen</List.Description>
          </List.Item>
          <List.Item>
            <List.Term>Updated</List.Term>
            <List.Description>Today</List.Description>
          </List.Item>
        </List>
      );
    }
    case "Timeline": {
      const Timeline = withParts(Component, "Item", "Time", "Title", "Description");
      return (
        <Timeline aria-label="Project activity">
          <Timeline.Item>
            <Timeline.Time dateTime="2026-09-24">24 Sep</Timeline.Time>
            <Timeline.Title>Work started</Timeline.Title>
            <Timeline.Description>First draft opened.</Timeline.Description>
          </Timeline.Item>
          <Timeline.Item>
            <Timeline.Time dateTime="2026-09-25">25 Sep</Timeline.Time>
            <Timeline.Title>Review complete</Timeline.Title>
            <Timeline.Description>Notes resolved.</Timeline.Description>
          </Timeline.Item>
        </Timeline>
      );
    }
    case "Meter":
      return (
        <div className="specimen-meter">
          <Component aria-label="Storage used" min={0} max={100} low={60} high={85} value={72} />
          <span>72 of 100 GB</span>
        </div>
      );
    case "EmptyState": {
      const EmptyState = withParts(Component, "Title", "Description", "Action");
      const Link = runtimeComponent(system, "Link");
      return (
        <EmptyState>
          <EmptyState.Title>No saved views</EmptyState.Title>
          <EmptyState.Description>Saved views will appear here.</EmptyState.Description>
          {Link && (
            <EmptyState.Action>
              <Link href="#showcase-tabs">Explore components</Link>
            </EmptyState.Action>
          )}
        </EmptyState>
      );
    }
  }
}
