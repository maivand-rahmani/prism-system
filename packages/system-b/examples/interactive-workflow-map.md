# InteractiveWorkflowMap runnable example

```tsx
import * as React from "react";
import {
  InteractiveWorkflowMap,
  type InteractiveWorkflowNode,
} from "@prism-system/ui-system-b/custom/interactive-workflow-map";
import "@prism-system/ui-system-b/styles.css";

const launchSteps: readonly InteractiveWorkflowNode[] = [
  { id: "draft", title: "Draft", description: "Shape the first outline." },
  { id: "review", title: "Review", description: "Collect the team's notes." },
  { id: "publish", title: "Publish", description: "Choose when it is ready." },
];

export function WorkflowMapExample() {
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>("review");

  return (
    <InteractiveWorkflowMap
      label="Launch planning"
      nodes={launchSteps}
      selectedNodeId={selectedNodeId}
      onSelectedNodeChange={setSelectedNodeId}
    />
  );
}
```

The stage data and selection state belong to the consuming application. Selecting
the current stage again clears the selection.
