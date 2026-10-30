"use client";

import * as React from "react";
import { REQUIRED_COMPONENTS } from "@prism-system/ui-core";
import { getRegisteredSystem, registeredSystems } from "../registry";
import { AdditionalComponents, RequiredComponents, VariantDialog, type ComponentName } from "./catalog";
import { Foundations } from "./foundations";
import { hasDarkTheme, shellThemeStyle, type ThemeMode, withParts } from "./system-theme";

type ShowcaseTab = "required" | "additional" | "foundations";

const tabs: Array<{ id: ShowcaseTab; label: string }> = [
  { id: "required", label: "Required" },
  { id: "additional", label: "Additional" },
  { id: "foundations", label: "Foundations" },
];

export function Showcase({ initialSystemId }: { initialSystemId?: string } = {}) {
  const [systemId, setSystemId] = React.useState(initialSystemId ?? registeredSystems[0]!.id);
  const [activeTab, setActiveTab] = React.useState<ShowcaseTab>("required");
  const [mode, setMode] = React.useState<ThemeMode>("light");
  const [variantName, setVariantName] = React.useState<ComponentName | null>(null);
  const system = getRegisteredSystem(systemId);
  const { Badge, Button, Select } = system.components;
  const Tabs = withParts(system.components.Tabs, "List", "Trigger", "Content");
  const darkAvailable = hasDarkTheme(system);

  React.useEffect(() => {
    if (initialSystemId) setSystemId(initialSystemId);
  }, [initialSystemId]);

  React.useEffect(() => {
    setMode(document.documentElement.dataset.prismTheme === "dark" ? "dark" : "light");
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.prismTheme = mode;
  }, [mode]);

  React.useEffect(() => {
    if (!darkAvailable && mode === "dark") setMode("light");
  }, [darkAvailable, mode]);

  return (
    <main className={`showcase-shell ${system.uiClass}`} data-system={system.id} style={shellThemeStyle(system, mode)}>
      <header className="showcase-header">
        <div className="showcase-brand">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span className="brand-name">Maivand <i>/</i> Showcase</span>
        </div>
        <div className="showcase-actions">
          <div className="system-picker-label">
            <span id="active-system-label">Active system</span>
            <Select value={system.id} onValueChange={setSystemId}>
              <Select.Trigger aria-labelledby="active-system-label"><Select.Value>{system.name}</Select.Value></Select.Trigger>
              <Select.Content>
                {registeredSystems.map((item) => <Select.Item key={item.id} value={item.id}>{item.name}</Select.Item>)}
              </Select.Content>
            </Select>
          </div>
          {darkAvailable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={mode === "dark"}
              onClick={() => setMode((current) => current === "dark" ? "light" : "dark")}
            >
              <span aria-hidden="true">{mode === "dark" ? "☼" : "◐"}</span>
            </Button>
          )}
        </div>
      </header>

      <div className="showcase-tabs">
        <Tabs
          value={activeTab}
          onValueChange={(value: string) => setActiveTab(value as ShowcaseTab)}
        >
          <Tabs.List id="showcase-tabs" aria-label="Showcase sections">
            {tabs.map((tab) => (
              <Tabs.Trigger key={tab.id} value={tab.id} type="button">
                {tab.label}
                {tab.id === "required" && (
                  <Badge variant="outline" size="sm">
                    {REQUIRED_COMPONENTS.length}
                  </Badge>
                )}
              </Tabs.Trigger>
            ))}
            <span className="showcase-tab-spacer" role="presentation" />
            <span className="system-version" role="presentation">v{system.version}</span>
          </Tabs.List>

          <Tabs.Content value="required">
            <div className="showcase-panel">
              {activeTab === "required" && (
                <RequiredComponents system={system} onOpenVariants={setVariantName} />
              )}
            </div>
          </Tabs.Content>
          <Tabs.Content value="additional">
            <div className="showcase-panel">
              {activeTab === "additional" && (
                <AdditionalComponents system={system} onOpenVariants={setVariantName} />
              )}
            </div>
          </Tabs.Content>
          <Tabs.Content value="foundations">
            <div className="showcase-panel">
              {activeTab === "foundations" && <Foundations system={system} mode={mode} />}
            </div>
          </Tabs.Content>
        </Tabs>
      </div>

      <VariantDialog system={system} name={variantName} onClose={() => setVariantName(null)} />
    </main>
  );
}
