/**
 * Package-local JSX intrinsics for the Three.js elements rendered by
 * `KeyboardScene`. This is a declaration-only tsconfig input: `tsc` and tsup's
 * d.ts program pick up declarations under `src`, but the extension entry never
 * imports this file, so it adds no runtime module and no bundled declaration
 * for consumers. A consumer that does not install the optional
 * `@react-three/fiber` peer is unaffected.
 *
 * Only `react/jsx-runtime` is augmented because this package compiles with
 * `jsx: "react-jsx"`. This file deliberately does not add its own `react`
 * module augmentation: that would duplicate the Fiber widening of
 * `React.JSX.IntrinsicElements` (and therefore `React.ElementType`), which the
 * polymorphic DOM primitives already cast away from.
 *
 * `ThreeElements` remains the source of truth for each intrinsic's props; the
 * `Pick` limits this local surface to the elements this scene renders. Keep
 * the list in sync with the lowercase Three.js elements used in
 * `KeyboardScene.tsx`.
 */
import type { ThreeElements } from "@react-three/fiber";

type KeyboardSceneIntrinsicElements = Pick<
  ThreeElements,
  | "ambientLight"
  | "boxGeometry"
  | "color"
  | "directionalLight"
  | "group"
  | "mesh"
  | "meshStandardMaterial"
>;

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends KeyboardSceneIntrinsicElements {}
  }
}
