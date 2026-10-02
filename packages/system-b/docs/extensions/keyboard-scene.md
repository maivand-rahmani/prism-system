# KeyboardScene — API v1

`KeyboardScene` is an optional, procedurally drawn 3D keyboard explorer. It is not a
shared contract component. Its props stay independent of Three.js and React Three
Fiber:

```ts
type KeyboardSceneProps = {
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
  reducedMotion?: boolean;
};
```

The selection is controlled by the consumer. Stable IDs include `escape`,
`digit-1`, `letter-a`, `space`, and `arrow-left`. Clicking the same selected key
clears the selection. The static DOM key controls and the clear button stay
available when WebGL is missing, initialization fails, the graphics context is
lost, or the page is hidden.

By default, `prefers-reduced-motion` selects an immediate static pose. Set
`reducedMotion` to `true` to demonstrate that pose in a preview; leave it unset in
product code to follow the user's preference. The renderer uses demand frames,
caps device pixel ratio at 1.5, and unmounts while the document is hidden. The
scene contains only package-generated geometry and materials: it downloads no
model or texture assets.

## Import and optional peers

```tsx
import { KeyboardScene } from "@prism-system/ui-system-b/custom/keyboard-scene";
import "@prism-system/ui-system-b/styles.css";
```

Install the optional runtime peers only when using this entrypoint:

```bash
# React 18 consumer
npm install three@^0.186.1 @react-three/fiber@^8.18.0

# React 19 consumer
npm install three@^0.186.1 @react-three/fiber@^9.8.1
```

The compatible React/Fiber major pair matters: Fiber 8 is for React 18, and Fiber
9 is for React 19. The standard package root and `./tokens` do not import either
graphics peer.

## Runnable composition

See [the runnable example](../../examples/keyboard-scene.md) for the complete
controlled composition. Import CSS once at the application entry.
