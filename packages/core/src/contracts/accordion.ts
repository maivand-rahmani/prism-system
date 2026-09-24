import type { ComponentPropsWithoutRef } from "react";

export interface AccordionSingleProps {
  type: "single";
  /** Controlled open item value. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Allows collapsing the open item. Single type only. */
  collapsible?: boolean;
}

export interface AccordionMultipleProps {
  type: "multiple";
  /** Controlled open item values. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Not applicable to the multiple type; rejected by the contract. */
  collapsible?: never;
}

/**
 * Accordion is a compound component: `Accordion.Item`, `Accordion.Header`,
 * `Accordion.Trigger`, `Accordion.Content`.
 *
 * The root is discriminated on `type`: `"single"` carries a string value and
 * `"multiple"` carries a string array. Both support controlled/uncontrolled
 * usage; `collapsible` exists only for the single type.
 *
 * Accessibility contract (implementation-owned): `Accordion.Trigger` is a
 * native button with `aria-expanded` and `aria-controls` pointing at its panel;
 * `Accordion.Content` has `role="region"` and `aria-labelledby` pointing back at
 * the trigger. Enter and Space toggle the item through native button behavior.
 */
export type AccordionProps = (AccordionSingleProps | AccordionMultipleProps) &
  ComponentPropsWithoutRef<"div">;

export type AccordionItemProps = ComponentPropsWithoutRef<"div"> & {
  /** Unique value identifying the item within its root. Required. */
  value: string;
  disabled?: boolean;
};

export type AccordionHeaderProps = ComponentPropsWithoutRef<"h3">;
export type AccordionTriggerProps = ComponentPropsWithoutRef<"button">;
export type AccordionContentProps = ComponentPropsWithoutRef<"div"> & {
  forceMount?: boolean;
};
