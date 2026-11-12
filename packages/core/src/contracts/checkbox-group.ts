import type { ChangeEventHandler, ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * One checkbox in a `CheckboxGroup`.
 *
 * `value` is both the form value and the option's identity in the group's
 * selection, so it must be unique within the group. `label` is the visible text
 * and the accessible name of the checkbox. `description` is optional supporting
 * text associated with the checkbox through `aria-describedby`; a caller's
 * `aria-describedby` is preserved and merged with it.
 *
 * Group-owned props are omitted: `type` is always `checkbox`, `name` comes from
 * the group, `value` is the field above, `checked`/`defaultChecked` follow the
 * group selection, and `required` is a group-level rule. All other native input
 * attributes and refs are forwarded. `onChange` runs after the browser updates
 * the checkbox; calling `event.preventDefault()` cancels that toggle for the
 * group state.
 *
 * A disabled checkbox stays visible but cannot be toggled by the user, is
 * skipped by native constraint validation and form submission, and never
 * satisfies the group's `required` rule even when the group selection contains
 * its `value`.
 */
export interface CheckboxGroupItemProps extends Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "value" | "name" | "checked" | "defaultChecked" | "onChange" | "required"
> {
  /** Form value and unique identity within the group. */
  value: string;
  /** Visible label; also the checkbox's accessible name. */
  label: ReactNode;
  /** Optional supporting text linked through `aria-describedby`. */
  description?: ReactNode;
  /** Called after the browser updates this checkbox's checked state. */
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

/**
 * A named group of related checkboxes, rendered as a native `fieldset` whose
 * visible `legend` names the group.
 *
 * Compound API: implementations attach the item as `CheckboxGroup.Item`, e.g.
 * `<CheckboxGroup.Item value="mon" label="Monday" />`. The root owns the group
 * semantics, the shared form name, the selection state, and the validation
 * relationships; each item renders one native checkbox with its visible label.
 *
 * Selection:
 * - The group is controlled when `value` is provided and uncontrolled
 *   otherwise, starting at `defaultValue` (none checked by default).
 * - Checking an enabled item adds its `value`; unchecking removes it. Reported
 *   values follow the order in which the user checked them.
 * - `value` may include the value of a disabled item so its checked state stays
 *   visible; users can never toggle it.
 *
 * Form and validation:
 * - Every checked enabled item submits its own `value` under the shared `name`.
 *   Without `name`, the group contributes no form value.
 * - `required` means at least one enabled checkbox must be checked. While it is
 *   unmet, implementations set a native custom-validity message
 *   (`requiredMessage`, with an implementation fallback when omitted) on the
 *   first enabled checkbox, so the browser blocks form submission. A checked
 *   disabled item does not satisfy `required`; the custom message is cleared
 *   once an enabled item is checked.
 * - `invalid` marks every checkbox invalid through `aria-invalid`. `error`
 *   implies invalid and is announced as an alert. `hint` and `error` are linked
 *   to the group through `aria-describedby`; a caller-supplied
 *   `aria-describedby` is preserved and merged.
 * - Native form reset restores the uncontrolled selection to `defaultValue`.
 *   Resetting is not an edit and does not call `onValueChange`. Controlled
 *   groups keep their caller-owned `value`, as with other controlled inputs,
 *   until the consumer resets it.
 *
 * Standard `fieldset` attributes and refs are forwarded, including a
 * fieldset-level `disabled`, which natively disables every checkbox in the
 * group. `children`, `defaultValue`, `name`, and `onChange` are omitted because
 * the group and item props above replace their native meanings. Appearance,
 * spacing, the check indicator, and motion belong to the design system.
 */
export type CheckboxGroupProps = Omit<
  ComponentPropsWithoutRef<"fieldset">,
  "children" | "defaultValue" | "name" | "onChange"
> & {
  /** Visible group caption; rendered as the native `<legend>`. */
  legend: ReactNode;
  /** Form name shared by every checkbox. Checked values submit under it. */
  name?: string;
  /** Controlled checked values. Providing it makes the group controlled. */
  value?: readonly string[];
  /** Initial checked values for uncontrolled usage. Defaults to none. */
  defaultValue?: readonly string[];
  /** Called with the complete next list of checked values, in check order. */
  onValueChange?: (value: string[]) => void;
  /**
   * Requires at least one enabled checkbox to be checked. Enforced with native
   * constraint validation so the browser blocks submission while unmet.
   */
  required?: boolean;
  /**
   * Localized message used for the native custom-validity error while
   * `required` is unmet. Implementations provide a fallback when omitted.
   */
  requiredMessage?: string;
  /** Marks every checkbox invalid. Pair with `error` for visible text. */
  invalid?: boolean;
  /** Help text linked to the group through `aria-describedby`. */
  hint?: ReactNode;
  /** Error text; implies `invalid` and is announced as an alert. */
  error?: ReactNode;
  /** The checkboxes, typically `CheckboxGroup.Item` elements. */
  children: ReactNode;
};
