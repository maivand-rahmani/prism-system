import { createDesignSystemRegistry, type DesignSystem } from "@prism-system/ui-core";
import { DesignSystem as SystemA, systemATokens } from "@prism-system/ui-system-a";
import { DesignSystem as SystemB, systemBTokens } from "@prism-system/ui-system-b";

type TokenSet = {
  color: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  motion: Record<string, string>;
};

type RegisteredComponents = typeof SystemA.components;
export type RegisteredSystem = Omit<DesignSystem, "components"> & {
  components: RegisteredComponents;
  uiClass: "maivand-a-ui" | "maivand-b-ui";
  tokens: TokenSet;
};

export const registeredSystems: readonly RegisteredSystem[] = [
  { ...SystemA, uiClass: "maivand-a-ui", tokens: systemATokens } as RegisteredSystem,
  { ...SystemB, uiClass: "maivand-b-ui", tokens: systemBTokens } as RegisteredSystem,
];

export const systemRegistry = createDesignSystemRegistry(
  registeredSystems as readonly DesignSystem[],
);

export function getRegisteredSystem(id: string): RegisteredSystem {
  return (systemRegistry.get(id) as RegisteredSystem | undefined) ?? registeredSystems[0]!;
}
