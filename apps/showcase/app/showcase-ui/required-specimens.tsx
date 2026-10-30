"use client";

import * as React from "react";
import { runtimeComponent, withParts } from "./system-theme";
import type { RegisteredSystem } from "../registry";

export function RequiredSpecimen({ system, name }: { system: RegisteredSystem; name: string }) {
  const [activated, setActivated] = React.useState(false);
  const [threshold, setThreshold] = React.useState(65);
  const [density, setDensity] = React.useState("balanced");
  const [studio, setStudio] = React.useState("Design");
  const [studioValue, setStudioValue] = React.useState("design");
  const Component = runtimeComponent(system, name);
  if (!Component) {
    return <span className="specimen-unavailable">Not in this package</span>;
  }

  switch (name) {
    case "Button":
      return (
        <div className="specimen-inline-pair">
          <Component
            size="md"
            variant="primary"
            type="button"
            onClick={() => setActivated((value) => !value)}
          >
            {activated ? "Saved" : "Save"}
          </Component>
          <Component size="sm" variant="outline" type="button" onClick={() => setActivated(false)}>
            Cancel
          </Component>
        </div>
      );
    case "Input":
      return (
        <Component aria-label="Project name" placeholder="Project name" defaultValue="Northstar" />
      );
    case "Textarea":
      return <Component aria-label="Project note" placeholder="Add a note…" rows={1} size="sm" />;
    case "Card":
      return (
        <span>
          <strong>Northstar</strong> · 3 open tasks
        </span>
      );
    case "Badge":
      return (
        <div className="specimen-inline-pair">
          <Component variant="success" size="sm">
            Ready
          </Component>
          <Component variant="warning" size="sm">
            Review
          </Component>
        </div>
      );
    case "Checkbox":
      return (
        <div className="specimen-inline-pair">
          <span className="specimen-labeled-control">
            <Component aria-label="Weekly digest" defaultChecked />
            <span>Weekly</span>
          </span>
          <span className="specimen-labeled-control">
            <Component aria-label="Product news" />
            <span>News</span>
          </span>
        </div>
      );
    case "RadioGroup": {
      const Radio = withParts(Component, "Item");
      const labelsOutsideItems = system.id === "liquid-glass";
      return (
        <Radio aria-label="Density" defaultValue="balanced" orientation="horizontal">
          <div className="specimen-radio-options">
            <span className="specimen-radio-option">
              <Radio.Item aria-label="Compact" value="compact">
                {labelsOutsideItems ? null : "Compact"}
              </Radio.Item>
              {labelsOutsideItems && <span aria-hidden="true">Compact</span>}
            </span>
            <span className="specimen-radio-option">
              <Radio.Item aria-label="Balanced" value="balanced">
                {labelsOutsideItems ? null : "Balanced"}
              </Radio.Item>
              {labelsOutsideItems && <span aria-hidden="true">Balanced</span>}
            </span>
          </div>
        </Radio>
      );
    }
    case "Switch":
      return (
        <span className="specimen-labeled-control">
          <Component aria-label="Email updates" defaultChecked />
          <span>Updates</span>
        </span>
      );
    case "Select": {
      const Select = withParts(Component, "Trigger", "Value", "Content", "Item");
      return (
        <Select value={density} onValueChange={setDensity}>
          <Select.Trigger aria-label="Density">
            <Select.Value>{density[0]!.toUpperCase() + density.slice(1)}</Select.Value>
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="balanced">Balanced</Select.Item>
            <Select.Item value="compact">Compact</Select.Item>
            <Select.Item value="relaxed">Relaxed</Select.Item>
          </Select.Content>
        </Select>
      );
    }
    case "Tabs": {
      const Tabs = withParts(Component, "List", "Trigger", "Content");
      return (
        <Tabs defaultValue="overview">
          <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="overview">
            <span>5 active</span>
          </Tabs.Content>
          <Tabs.Content value="activity">
            <span>Updated today</span>
          </Tabs.Content>
        </Tabs>
      );
    }
    case "Dialog": {
      const Dialog = withParts(
        Component,
        "Trigger",
        "Content",
        "Header",
        "Title",
        "Description",
        "Footer",
        "Close",
      );
      return (
        <Dialog>
          <Dialog.Trigger type="button">Open</Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Quick preview</Dialog.Title>
              <Dialog.Description>This is the package dialog.</Dialog.Description>
            </Dialog.Header>
            <Dialog.Footer>
              <Dialog.Close>Close</Dialog.Close>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog>
      );
    }
    case "DropdownMenu": {
      const Menu = withParts(Component, "Trigger", "Content", "Item");
      return (
        <Menu>
          <Menu.Trigger type="button">Actions</Menu.Trigger>
          <Menu.Content>
            <Menu.Item>Rename</Menu.Item>
            <Menu.Item>Duplicate</Menu.Item>
          </Menu.Content>
        </Menu>
      );
    }
    case "Tooltip": {
      const Tooltip = withParts(Component, "Provider", "Trigger", "Content");
      return (
        <Tooltip.Provider>
          <Tooltip>
            <Tooltip.Trigger type="button">Point or focus</Tooltip.Trigger>
            <Tooltip.Content>Helpful context</Tooltip.Content>
          </Tooltip>
        </Tooltip.Provider>
      );
    }
    case "Separator":
      return <Component aria-label="Section boundary" />;
    case "Heading":
      return <Component level={4}>Section title</Component>;
    case "Text":
      return <Component as="p">A clear, readable line of copy.</Component>;
    case "Link":
      return (
        <Component href="#showcase-tabs">
          Back to sections <span aria-hidden="true">↗</span>
        </Component>
      );
    case "Container":
      return (
        <Component>
          <span>Responsive content width</span>
        </Component>
      );
    case "Stack":
      return (
        <Component direction="horizontal">
          <span>Draft</span>
          <span>·</span>
          <span>Review</span>
        </Component>
      );
    case "FormField": {
      const Field = withParts(Component, "Label", "Control");
      const Input = runtimeComponent(system, "Input");
      if (!Input) return null;
      return (
        <Field id="showcase-required-email" required>
          <Field.Label>Email</Field.Label>
          <Field.Control asChild>
            <Input type="email" size="sm" placeholder="name@team.com" />
          </Field.Control>
        </Field>
      );
    }
    case "Center":
      return (
        <Component>
          <span>Centered content</span>
        </Component>
      );
    case "Cluster": {
      const Badge = runtimeComponent(system, "Badge");
      return Badge ? (
        <Component role="group" aria-label="Project labels">
          <Badge variant="outline">Research</Badge>
          <Badge variant="outline">In progress</Badge>
        </Component>
      ) : null;
    }
    case "Sidebar": {
      const Link = runtimeComponent(system, "Link");
      if (!Link) return null;
      return (
        <Component>
          <nav className="specimen-sidebar-nav" aria-label="Project pages">
            <Link href="#showcase-tabs">Overview</Link>
            <Link href="#showcase-tabs">Files</Link>
          </nav>
          <section className="specimen-sidebar-workspace">
            <strong>Northstar</strong>
            <span>Workspace</span>
          </section>
        </Component>
      );
    }
    case "AspectRatio":
      return (
        <div className="specimen-aspect-wrap">
          <Component ratio={16 / 9} role="img" aria-label="16 by 9 preview">
            <span>16:9</span>
          </Component>
        </div>
      );
    case "Combobox": {
      const Combobox = withParts(Component, "Input", "Content", "Item");
      return (
        <Combobox
          name="team"
          value={studioValue}
          onValueChange={setStudioValue}
          inputValue={studio}
          onInputValueChange={setStudio}
        >
          <Combobox.Input aria-label="Team" placeholder="Choose a team" />
          <Combobox.Content aria-label="Team options">
            <Combobox.Item value="design" textValue="Design">
              Design
            </Combobox.Item>
            <Combobox.Item value="research" textValue="Research">
              Research
            </Combobox.Item>
          </Combobox.Content>
        </Combobox>
      );
    }
    case "DatePicker":
      return <Component aria-label="Review date" defaultValue="2026-10-14" />;
    case "NumberField":
      return <Component aria-label="Number of seats" min={1} max={12} defaultValue={4} />;
    case "Slider":
      return (
        <div className="specimen-range">
          <Component
            aria-label="Alert threshold"
            min={0}
            max={100}
            step={5}
            value={threshold}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setThreshold(event.currentTarget.valueAsNumber)
            }
          />
          <output>{threshold}%</output>
        </div>
      );
    case "FileUpload":
      return <Component aria-label="Attach a document" accept=".pdf,.md" />;
    default:
      return null;
  }
}
