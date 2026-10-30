import type * as React from "react";
import { useState } from "react";
import type { InteractiveWorkflowMapProps } from "@prism-system/ui-system-b/custom/interactive-workflow-map";
import type { KeyboardSceneProps } from "@prism-system/ui-system-b/custom/keyboard-scene";
import type { ExtensionModule } from "./extension-loaders";
import { getRegisteredSystem } from "./registry";

export type ExtensionScenarioContext = {
  systemId: string;
  extensionName: string;
};

/** A small, app-owned renderer for one real package extension API. */
export type ExtensionScenarioAdapter = (
  module: ExtensionModule,
  context: ExtensionScenarioContext,
) => React.ReactNode;

/**
 * Build a typed scenario adapter without guessing the extension's props.
 * A future pilot supplies its real props type and a small, explicit composition.
 */
export function createExtensionScenarioAdapter<Props>(
  exportName: string,
  render: (
    Extension: React.ComponentType<Props>,
    context: ExtensionScenarioContext,
  ) => React.ReactNode,
): ExtensionScenarioAdapter {
  return (module, context) => {
    const candidate = module[exportName];
    if (typeof candidate !== "function" && (typeof candidate !== "object" || candidate === null)) {
      throw new Error(`The selected module does not expose a renderable ${exportName} component.`);
    }
    return render(candidate as React.ComponentType<Props>, context);
  };
}

/** Stable key for a system-specific, app-owned scenario. */
export function extensionScenarioKey(systemId: string, extensionName: string): string {
  return `${systemId}/${extensionName}`;
}

const workflowStages = [
  { id: "outline", title: "Outline", description: "Set the direction for the first pass." },
  { id: "review", title: "Review", description: "Collect notes before the next revision." },
  { id: "release", title: "Release", description: "Choose when the work is ready to share." },
] as const;

function KeyboardSceneShowcase({
  Extension,
  systemId,
}: {
  Extension: React.ComponentType<KeyboardSceneProps>;
  systemId: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>("letter-g");
  const [narrow, setNarrow] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const { Button, Switch } = getRegisteredSystem(systemId).components;

  return (
    <div className="extension-scenario extension-keyboard-scenario">
      <div
        className="extension-scenario-controls"
        role="group"
        aria-label="Keyboard scene preview options"
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={narrow}
          onClick={() => setNarrow((value) => !value)}
        >
          {narrow ? "Use full width" : "Preview at 375 px"}
        </Button>
        <span className="extension-scenario-toggle">
          <Switch
            size="sm"
            checked={reducedMotion}
            onCheckedChange={setReducedMotion}
            aria-label="Preview reduced motion"
          />
          <span>Preview reduced motion</span>
        </span>
      </div>
      <div className={`extension-scenario-viewport${narrow ? " is-narrow" : ""}`}>
        <Extension
          selectedKey={selectedKey}
          onSelectedKeyChange={setSelectedKey}
          reducedMotion={reducedMotion ? true : undefined}
        />
      </div>
    </div>
  );
}

function WorkflowMapShowcase({
  Extension,
}: {
  Extension: React.ComponentType<InteractiveWorkflowMapProps>;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("review");

  return (
    <div className="extension-scenario">
      <Extension
        label="Showcase sample workflow"
        nodes={workflowStages}
        selectedNodeId={selectedNodeId}
        onSelectedNodeChange={setSelectedNodeId}
      />
    </div>
  );
}

const keyboardSceneAdapter = createExtensionScenarioAdapter<KeyboardSceneProps>(
  "KeyboardScene",
  (Extension, context) => <KeyboardSceneShowcase Extension={Extension} systemId={context.systemId} />,
);

const workflowMapAdapter = createExtensionScenarioAdapter<InteractiveWorkflowMapProps>(
  "InteractiveWorkflowMap",
  (Extension) => <WorkflowMapShowcase Extension={Extension} />,
);

/** Explicit, app-owned scenarios use each extension's real public props. */
export const extensionScenarioAdapters: Readonly<Record<string, ExtensionScenarioAdapter>> =
  Object.freeze({
    "system-b/KeyboardScene": keyboardSceneAdapter,
    "system-b/InteractiveWorkflowMap": workflowMapAdapter,
  });
