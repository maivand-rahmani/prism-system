"use client";

import * as React from "react";
import { useReducedMotion } from "@prism-system/ui-core";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { systemBTokens } from "../../tokens/index.js";

export type KeyboardSceneProps = {
  /** The selected key's stable ID, or `null` when nothing is selected. */
  selectedKey: string | null;
  /** Called by either the canvas keys or the equivalent accessible DOM controls. */
  onSelectedKeyChange: (key: string | null) => void;
  /** Force the still scene for a preview; omit it to follow the user's system preference. */
  reducedMotion?: boolean;
};

type KeySpec = {
  id: string;
  label: string;
  width?: number;
};

const keyRows: readonly (readonly KeySpec[])[] = [
  [
    { id: "escape", label: "Esc", width: 1.15 },
    ..."1234567890".split("").map((label) => ({ id: `digit-${label}`, label })),
    { id: "backspace", label: "Backspace", width: 1.75 },
  ],
  [
    { id: "tab", label: "Tab", width: 1.5 },
    ..."qwertyuiop"
      .split("")
      .map((label) => ({ id: `letter-${label}`, label: label.toUpperCase() })),
  ],
  [
    { id: "caps-lock", label: "Caps", width: 1.8 },
    ..."asdfghjkl"
      .split("")
      .map((label) => ({ id: `letter-${label}`, label: label.toUpperCase() })),
    { id: "enter", label: "Enter", width: 1.55 },
  ],
  [
    { id: "shift-left", label: "Shift", width: 2.1 },
    ..."zxcvbnm".split("").map((label) => ({ id: `letter-${label}`, label: label.toUpperCase() })),
    { id: "arrow-left", label: "←" },
    { id: "arrow-down", label: "↓" },
    { id: "arrow-right", label: "→" },
  ],
  [
    { id: "control-left", label: "Ctrl", width: 1.3 },
    { id: "function", label: "Fn" },
    { id: "alt-left", label: "Alt", width: 1.25 },
    { id: "space", label: "Space", width: 5.5 },
    { id: "alt-right", label: "Alt", width: 1.25 },
    { id: "menu", label: "Menu" },
    { id: "control-right", label: "Ctrl", width: 1.3 },
  ],
];

const palette = systemBTokens.themes.dark.color;
const gap = 0.11;
const unit = 0.53;
const rowDepth = 0.82;

function keyLayout() {
  return keyRows.flatMap((row, rowIndex) => {
    const rowWidth = row.reduce((total, key) => total + (key.width ?? 1) * unit + gap, -gap);
    let left = -rowWidth / 2;
    const z = (rowIndex - (keyRows.length - 1) / 2) * rowDepth;

    return row.map((key) => {
      const width = (key.width ?? 1) * unit;
      const position: [number, number, number] = [left + width / 2, -0.05, z];
      left += width + gap;
      return { ...key, width, position };
    });
  });
}

const keys = keyLayout();
const boardWidth =
  Math.max(
    ...keyRows.map((row) =>
      row.reduce((total, key) => total + (key.width ?? 1) * unit + gap, -gap),
    ),
  ) + 0.34;

function Keycap({
  id,
  width,
  position,
  selectedKey,
  onSelectedKeyChange,
  reducedMotion,
}: {
  id: string;
  width: number;
  position: [number, number, number];
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
  reducedMotion: boolean;
}) {
  const mesh = React.useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const active = selectedKey === id;

  useFrame((_, delta) => {
    const object = mesh.current;
    if (!object) return;

    const target = position[1] + (active ? 0.12 : 0);
    if (reducedMotion) {
      object.position.y = target;
      return;
    }

    const difference = target - object.position.y;
    if (Math.abs(difference) < 0.002) {
      object.position.y = target;
      return;
    }

    object.position.y += difference * Math.min(1, delta * 12);
    invalidate();
  });

  return (
    <group
      ref={mesh}
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelectedKeyChange(active ? null : id);
      }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, 0.24, 0.66]} />
        <meshStandardMaterial
          color={active ? palette.status.info : palette.surface.raised}
          metalness={0.12}
          roughness={0.48}
        />
      </mesh>
      <mesh position={[0, 0.132, 0]}>
        <boxGeometry args={[Math.max(0.28, width - 0.07), 0.025, 0.58]} />
        <meshStandardMaterial
          color={active ? palette.status.info : palette.text.secondary}
          metalness={active ? 0.32 : 0.06}
          roughness={0.58}
        />
      </mesh>
    </group>
  );
}

function KeyboardModel({
  selectedKey,
  onSelectedKeyChange,
  reducedMotion,
}: KeyboardSceneProps & { reducedMotion: boolean }) {
  return (
    <>
      <color attach="background" args={[new THREE.Color(palette.surface.canvas)]} />
      <ambientLight intensity={1.65} />
      <directionalLight position={[-4, 8, 6]} intensity={2.1} />
      <directionalLight position={[6, 5, -5]} intensity={0.8} color={palette.action.primary} />
      <group rotation={[-0.04, 0, 0]}>
        <mesh position={[0, -0.28, 0]} receiveShadow>
          <boxGeometry args={[boardWidth, 0.34, 4.65]} />
          <meshStandardMaterial color={palette.surface.sunken} metalness={0.24} roughness={0.52} />
        </mesh>
        <mesh position={[0, -0.095, 2.25]}>
          <boxGeometry args={[boardWidth - 0.14, 0.035, 0.055]} />
          <meshStandardMaterial color={palette.action.primary} metalness={0.2} roughness={0.5} />
        </mesh>
        {keys.map((key) => (
          <Keycap
            key={key.id}
            id={key.id}
            width={key.width}
            position={key.position}
            selectedKey={selectedKey}
            onSelectedKeyChange={onSelectedKeyChange}
            reducedMotion={reducedMotion}
          />
        ))}
      </group>
    </>
  );
}

class SceneErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function StaticSceneFallback({ message }: { message: string }) {
  return (
    <div className="maivand-b-keyboard-fallback" role="status">
      <span className="maivand-b-keyboard-fallback-mark" aria-hidden="true">
        3D
      </span>
      <p>{message}</p>
      <p>Every key remains available in the controls below.</p>
    </div>
  );
}

export function KeyboardScene({
  selectedKey,
  onSelectedKeyChange,
  reducedMotion: reducedMotionOverride,
}: KeyboardSceneProps) {
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = reducedMotionOverride ?? systemReducedMotion;
  const [pageVisible, setPageVisible] = React.useState(true);
  const [contextLost, setContextLost] = React.useState(false);
  const sceneHost = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const helpId = React.useId();
  const statusId = React.useId();
  const selectedLabel = keys.find((key) => key.id === selectedKey)?.label;

  React.useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  React.useEffect(() => {
    if (!pageVisible || contextLost) return;
    const canvas = sceneHost.current?.querySelector("canvas");
    if (!canvas) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [contextLost, pageVisible]);

  const fallback = (
    <StaticSceneFallback
      message={
        !pageVisible
          ? "The 3D view is paused while this page is hidden."
          : contextLost
            ? "The 3D view stopped after a graphics context error."
            : "A 3D view is not available in this browser."
      }
    />
  );

  return (
    <section className="maivand-b-ui maivand-b-keyboard-scene" aria-labelledby={titleId}>
      <div className="maivand-b-keyboard-heading">
        <div>
          <p className="maivand-b-keyboard-kicker">SYSTEM B / INPUT STUDY</p>
          <h3 id={titleId}>Select a key</h3>
        </div>
        <p id={helpId}>Choose in the scene or use the matching keyboard buttons.</p>
      </div>

      <div className="maivand-b-keyboard-stage" ref={sceneHost} aria-describedby={helpId}>
        {!pageVisible || contextLost ? (
          fallback
        ) : (
          <SceneErrorBoundary fallback={fallback}>
            <Canvas
              aria-label="Interactive procedural keyboard. Equivalent key buttons follow the scene."
              camera={{ position: [0, 5.7, 8.5], fov: 36, near: 0.1, far: 80 }}
              dpr={[1, 1.5]}
              fallback={fallback}
              frameloop="demand"
              gl={{ antialias: true, powerPreference: "low-power" }}
            >
              <KeyboardModel
                selectedKey={selectedKey}
                onSelectedKeyChange={onSelectedKeyChange}
                reducedMotion={reducedMotion}
              />
            </Canvas>
          </SceneErrorBoundary>
        )}
      </div>

      <div className="maivand-b-keyboard-control-header">
        <p id={statusId} className="maivand-b-keyboard-selection" role="status" aria-live="polite">
          {selectedLabel ? `Selected: ${selectedLabel}` : "No key selected"}
        </p>
        <button
          className="maivand-b-keyboard-clear"
          type="button"
          disabled={selectedKey === null}
          onClick={() => onSelectedKeyChange(null)}
        >
          Clear selection
        </button>
      </div>

      <div className="maivand-b-keyboard-controls" role="group" aria-label="Keyboard key controls">
        {keys.map((key) => (
          <button
            key={key.id}
            type="button"
            className="maivand-b-keyboard-key"
            aria-pressed={selectedKey === key.id}
            aria-describedby={statusId}
            onClick={() => onSelectedKeyChange(selectedKey === key.id ? null : key.id)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </section>
  );
}
