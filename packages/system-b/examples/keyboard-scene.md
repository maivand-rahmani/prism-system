# KeyboardScene runnable example

Requires the package stylesheet plus the optional Three.js and Fiber peers. Use
the Fiber major matching the consumer's React major as shown in the
[API guide](../docs/extensions/keyboard-scene.md).

```tsx
import * as React from "react";
import { KeyboardScene } from "@prism-system/ui-system-b/custom/keyboard-scene";
import "@prism-system/ui-system-b/styles.css";

export function KeyboardSceneExample() {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  return <KeyboardScene selectedKey={selectedKey} onSelectedKeyChange={setSelectedKey} />;
}
```

The visible native buttons mirror every selectable key, so selection still works
when the WebGL view falls back. Leave `reducedMotion` unset to follow the user's
operating-system preference.
