import type { ComponentPropsWithoutRef } from "react";
import type { AsChildProp, Direction, Orientation } from "../types/common.js";

export type TabsActivationMode = "automatic" | "manual";

export interface TabsOwnProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: Orientation;
  activationMode?: TabsActivationMode;
  dir?: Direction;
}

/**
 * Tabs is a compound component. Implementations must attach `List`, `Trigger`,
 * and `Content` as static members of the root component, e.g. `Tabs.Trigger`.
 *
 * `Tabs` must expose `role="tablist"`/`role="tab"`/`role="tabpanel"` relations
 * and arrow-key navigation.
 */
export type TabsProps = TabsOwnProps & ComponentPropsWithoutRef<"div">;
export type TabsListProps = ComponentPropsWithoutRef<"div">;
export type TabsTriggerProps = ComponentPropsWithoutRef<"button"> &
  AsChildProp & {
    value: string;
  };
export type TabsContentProps = ComponentPropsWithoutRef<"div"> & {
  value: string;
  forceMount?: boolean;
};
