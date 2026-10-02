export interface RevealProps {
  children?: unknown;
  delay?: number;
}

export function Reveal({ delay = 0 }: RevealProps) {
  return <div data-delay={delay} />;
}
