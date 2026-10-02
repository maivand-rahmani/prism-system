# InteractiveWorkflowMap — API v1

`InteractiveWorkflowMap` is an optional, controlled DOM pattern for presenting
an ordered path. The product supplies all stage content; the component does not
own a workflow, business process, or completion state.

```ts
type InteractiveWorkflowNode = {
  id: string;
  title: string;
  description: string;
};

type InteractiveWorkflowMapProps = {
  nodes: readonly InteractiveWorkflowNode[];
  selectedNodeId: string | null;
  onSelectedNodeChange: (nodeId: string | null) => void;
  label: string;
};
```

Each stage is a native button with a pressed state. Activating the selected stage
clears it; activating another reports that stage's ID through the callback. A
polite status message communicates the current selection. The ordered path wraps
to a narrow layout and honors `prefers-reduced-motion` by removing transitions.

## Import

```tsx
import { InteractiveWorkflowMap } from "@prism-system/ui-system-b/custom/interactive-workflow-map";
import "@prism-system/ui-system-b/styles.css";
```

This entry has no additional runtime requirements. The normal package root does
not load the extension.

## Runnable composition

See [the runnable example](../../examples/interactive-workflow-map.md) for a
controlled composition with app-owned stage data.
