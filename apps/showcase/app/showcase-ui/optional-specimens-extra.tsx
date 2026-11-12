"use client";

import * as React from "react";
import { runtimeComponent, withParts } from "./system-theme";
import type { RegisteredSystem } from "../registry";

/** Controlled scenarios for the newer optional catalog entries. */
export function OptionalSpecimenExtra({
  system,
  name,
}: {
  system: RegisteredSystem;
  name: string;
}) {
  const Component = runtimeComponent(system, name);
  if (!Component) return null;
  switch (name) {
    case "Popover": {
      const P = withParts(Component, "Trigger", "Content", "Close");
      return (
        <P>
          <P.Trigger>Open note</P.Trigger>
          <P.Content aria-label="Planning note">
            <p>
              <strong>Planning note</strong>
            </p>
            <p>A quiet place for a thought.</p>
            <P.Close>Done</P.Close>
          </P.Content>
        </P>
      );
    }
    case "AlertDialog": {
      return <AlertDialogScenario Component={Component} />;
    }
    case "ToggleGroup": {
      const G = withParts(Component, "Item");
      return (
        <G type="single" defaultValue="day" aria-label="Planning view">
          <G.Item value="day">Day</G.Item>
          <G.Item value="week">Week</G.Item>
          <G.Item value="month">Month</G.Item>
        </G>
      );
    }
    case "Toolbar": {
      return <ToolbarScenario Component={Component} />;
    }
    case "TagGroup": {
      return <TagScenario Component={Component} />;
    }
    case "ListBox": {
      const L = withParts(Component, "Option", "Group");
      return (
        <L label="Choose a focus" defaultValue="write" size={3}>
          <L.Option value="write">Writing</L.Option>
          <L.Option value="walk">A walk</L.Option>
          <L.Option value="read" disabled>
            Reading (unavailable)
          </L.Option>
        </L>
      );
    }
    case "TreeView":
      return (
        <Component
          label="Weekly plan"
          defaultExpandedValues={["week"]}
          nodes={[
            {
              value: "week",
              label: "This week",
              children: [
                { value: "mon", label: "Monday" },
                { value: "tue", label: "Tuesday" },
              ],
            },
            { value: "later", label: "Later" },
          ]}
        />
      );
    case "TimeField":
      return <Component label="Start time" defaultValue="09:30" hint="Choose when to begin." />;
    case "SearchField":
      return (
        <Component
          label="Find a note"
          defaultValue="morning pages"
          hint="Search your planning notes."
        />
      );
    case "CheckboxGroup": {
      const G = withParts(Component, "Item");
      return (
        <G legend="Weekly intentions" defaultValue={["read"]} hint="Choose what matters this week.">
          <G.Item value="read" label="Read daily" />
          <G.Item value="walk" label="Take a walk" />
          <G.Item value="rest" label="Rest more" disabled />
        </G>
      );
    }
    case "RangeSlider":
      return (
        <Component
          label="Daily focus window"
          defaultValue={[2, 5]}
          min={0}
          max={8}
          startLabel="Start hour"
          endLabel="End hour"
          hint="Adjust the beginning and end."
        />
      );
    case "DateRangePicker":
      return (
        <Component
          label="Planning dates"
          startLabel="From"
          endLabel="Through"
          defaultValue={["2026-11-12", "2026-11-16"]}
          hint="Choose a date range."
        />
      );
    case "Spinner":
      return <SpinnerScenario Component={Component} />;
    case "FileDropzone":
      return <FileScenario Component={Component} />;
    default:
      return null;
  }
}

function TagScenario({ Component }: { Component: React.ElementType }) {
  const [items, setItems] = React.useState([
    { value: "focus", label: "Deep focus" },
    { value: "outside", label: "Time outdoors" },
    { value: "protected", label: "Protected", disabled: true },
  ]);
  return (
    <>
      <Component
        label="Current intentions"
        items={items}
        onRemove={(value: string) =>
          setItems((current) => current.filter((item) => item.value !== value))
        }
        emptyLabel="All intentions removed."
      />
      <span role="status">{items.length} intentions remaining</span>
    </>
  );
}

function AlertDialogScenario({ Component }: { Component: React.ElementType }) {
  const [confirmed, setConfirmed] = React.useState(false);
  const D = withParts(
    Component,
    "Trigger",
    "Content",
    "Header",
    "Title",
    "Description",
    "Footer",
    "Cancel",
    "Action",
  );
  return (
    <>
      <D>
        <D.Trigger>{confirmed ? "Example confirmed" : "Review example"}</D.Trigger>
        <D.Content>
          <D.Header>
            <D.Title>Confirm the example action?</D.Title>
            <D.Description>
              This is an educational scenario only. Confirming does not delete or change any data.
            </D.Description>
          </D.Header>
          <D.Footer>
            <D.Cancel>Cancel</D.Cancel>
            <D.Action onClick={() => setConfirmed(true)}>Confirm example</D.Action>
          </D.Footer>
        </D.Content>
      </D>
      {confirmed && <span role="status">Example action confirmed; no data was changed.</span>}
    </>
  );
}

function ToolbarScenario({ Component }: { Component: React.ElementType }) {
  const [bold, setBold] = React.useState(false);
  const T = withParts(Component, "Button", "Separator", "ToggleGroup", "ToggleItem");
  return (
    <div>
      <T aria-label="Note formatting">
        <T.Button aria-pressed={bold} onClick={() => setBold((current) => !current)}>
          Bold
        </T.Button>
        <T.Separator />
        <T.ToggleGroup type="single" defaultValue="left" aria-label="Text alignment">
          <T.ToggleItem value="left">Left</T.ToggleItem>
          <T.ToggleItem value="center">Center</T.ToggleItem>
        </T.ToggleGroup>
      </T>
      <span role="status">Bold formatting {bold ? "on" : "off"}</span>
    </div>
  );
}

function SpinnerScenario({ Component }: { Component: React.ElementType }) {
  return (
    <div>
      <Component label="Example background task in progress" />
      <span>Example task in progress</span>
    </div>
  );
}

function FileScenario({ Component }: { Component: React.ElementType }) {
  const [files, setFiles] = React.useState<File[]>([]);
  return (
    <div>
      <Component
        label="Attach a planning note"
        accept=".txt,text/plain"
        multiple
        onFilesChange={setFiles}
        hint="Text files only. Files stay in this browser; nothing is uploaded."
      />
      {files.length > 0 && (
        <p role="status">Selected: {files.map((file) => file.name).join(", ")}</p>
      )}
    </div>
  );
}
