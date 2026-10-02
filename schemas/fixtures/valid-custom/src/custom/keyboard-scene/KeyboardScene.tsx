export interface KeyboardSceneProps {
  selectedKey?: string;
}

export function KeyboardScene({ selectedKey }: KeyboardSceneProps) {
  return <canvas data-selected-key={selectedKey} />;
}
