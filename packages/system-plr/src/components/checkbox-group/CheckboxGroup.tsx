"use client";

import * as React from "react";
import { cn, useComposedRefs, useControllableState } from "@prism-system/ui-core";
import { Fieldset, FieldsetLegend } from "../fieldset/Fieldset";

const DEFAULT_REQUIRED_MESSAGE = "Select at least one option.";
const NO_VALUES: readonly string[] = [];

/** One checkbox in the group. Its `value` is the form value and the entry in `value`. */
export interface CheckboxGroupItemProps extends Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "value" | "name" | "checked" | "defaultChecked" | "onChange" | "required"
> {
  /** Form value of this checkbox. Unique within the group. */
  value: string;
  /** Visible label. Also the accessible name of the checkbox. */
  label: React.ReactNode;
  /** Optional supporting text, linked to the checkbox through `aria-describedby`. */
  description?: React.ReactNode;
  /** Called after the browser updates this checkbox's checked state. */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

export interface CheckboxGroupProps extends Omit<
  React.ComponentPropsWithoutRef<"fieldset">,
  "children" | "defaultValue" | "name" | "onChange"
> {
  /** Visible caption. Native `<legend>`, so it names the whole group. */
  legend: React.ReactNode;
  /** Form name shared by every checkbox. Checked values submit under it. */
  name?: string;
  /** Checked values. Providing it makes the group controlled. */
  value?: readonly string[];
  /** Initial checked values when the group owns its state. Default none checked. */
  defaultValue?: readonly string[];
  /** Called with the complete next list of checked values, in the order they were checked. */
  onValueChange?: (value: string[]) => void;
  /**
   * At least one checkbox must be checked. Enforced through native constraint validation on
   * the first enabled checkbox, so the browser blocks submission with `requiredMessage`.
   */
  required?: boolean;
  /** Message shown by the browser when `required` is unmet. */
  requiredMessage?: string;
  /** Marks every checkbox invalid. Pair it with `error` for visible text. */
  invalid?: boolean;
  /** Help text linked to the group through `aria-describedby`. */
  hint?: React.ReactNode;
  /** Error text. Also marks the group invalid and is announced as an alert. */
  error?: React.ReactNode;
  children: React.ReactNode;
}

type CheckboxGroupContextValue = {
  name?: string;
  selected: readonly string[];
  invalid: boolean;
  /** Bumped after a native reset of a controlled group so items re-assert `selected`. */
  resetVersion: number;
  toggle: (value: string, checked: boolean) => void;
};

const CheckboxGroupContext = React.createContext<CheckboxGroupContextValue | null>(null);

const CheckboxGroupRoot = React.forwardRef<HTMLFieldSetElement, CheckboxGroupProps>(
  function CheckboxGroup(
    {
      className,
      legend,
      name,
      value,
      defaultValue,
      onValueChange,
      required = false,
      requiredMessage = DEFAULT_REQUIRED_MESSAGE,
      invalid = false,
      hint,
      error,
      children,
      id: providedId,
      form: formAssociation,
      "aria-describedby": externalDescribedBy,
      ...props
    },
    ref,
  ) {
    const generatedId = React.useId();
    const id = providedId || `maivand-plr-checkbox-group-${generatedId.replace(/:/g, "")}`;
    const messageId = `${id}-message`;
    const hasError = Boolean(error || invalid);
    const describedBy =
      [error || hint ? messageId : null, externalDescribedBy].filter(Boolean).join(" ") ||
      undefined;

    const rootRef = React.useRef<HTMLFieldSetElement | null>(null);
    const composedRef = useComposedRefs<HTMLFieldSetElement>(ref, rootRef);
    const ownedValidity = React.useRef(new WeakMap<HTMLInputElement, { message: string }>());

    const [selected, setSelected] = useControllableState<string[]>({
      prop: value as string[] | undefined,
      defaultProp: [...(defaultValue ?? [])],
    });
    const checkedValues: readonly string[] = selected ?? NO_VALUES;
    const [resetVersion, setResetVersion] = React.useState(0);

    // Latest reset inputs for the deferred listener. The listener follows the owning
    // form, including changes to an explicit `form` association, so it must read the
    // current prop values instead of its initial closure.
    const latestResetState = React.useRef({ controlled: value !== undefined, defaultValue });
    latestResetState.current = { controlled: value !== undefined, defaultValue };

    // A reset is applied in a later task, not a microtask. A user-clicked reset runs the
    // native reset algorithm synchronously, while a delegated React `onReset` may reach its
    // `preventDefault()` after the microtask checkpoint; only a later task observes that
    // cancellation. Each event gets its own task so a later cancelled reset cannot discard
    // an earlier accepted one. All pending tasks are cleared on unmount.
    const pendingResetTasks = React.useRef(new Set<ReturnType<typeof setTimeout>>());
    const resetTaskMounted = React.useRef(true);
    React.useEffect(() => {
      const pendingTasks = pendingResetTasks.current;
      resetTaskMounted.current = true;
      return () => {
        resetTaskMounted.current = false;
        for (const task of pendingTasks) clearTimeout(task);
        pendingTasks.clear();
      };
    }, []);

    React.useEffect(() => {
      const form = rootRef.current?.form;
      if (!form) return;
      const handleReset = (event: Event) => {
        const task = setTimeout(() => {
          pendingResetTasks.current.delete(task);
          if (!resetTaskMounted.current || event.defaultPrevented) return;
          const { controlled, defaultValue: resetDefault } = latestResetState.current;
          if (controlled) {
            setResetVersion((version) => version + 1);
            return;
          }
          setSelected([...(resetDefault ?? [])]);
        }, 0);
        pendingResetTasks.current.add(task);
      };
      form.addEventListener("reset", handleReset);
      return () => form.removeEventListener("reset", handleReset);
    }, [formAssociation, setSelected]);

    // Only inspect direct items in this fieldset's own list; nested CheckboxGroups own their
    // inputs and validity. Restore only a custom message that this group previously applied.
    // The effect runs after every commit so item-level checked/disabled changes are reflected.
    React.useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const list = Array.from(root.children).find((child) =>
        child.classList.contains("maivand-plr-checkbox-group-list"),
      );
      const boxes = list
        ? Array.from(list.children)
            .filter((item) => item.classList.contains("maivand-plr-checkbox-group-item"))
            .map((item) => item.querySelector<HTMLInputElement>(':scope input[type="checkbox"]'))
            .filter((box): box is HTMLInputElement => box !== null)
        : [];

      for (const box of boxes) {
        const owned = ownedValidity.current.get(box);
        // Browsers temporarily report no custom error for disabled controls. Keep ownership
        // until re-enabled so the next pass can clear our message before checking eligibility.
        if (owned && box.matches(":disabled")) continue;
        if (owned && box.validity.customError && box.validationMessage === owned.message) {
          box.setCustomValidity("");
        }
        ownedValidity.current.delete(box);
      }

      const enabledChecked = boxes.some((box) => !box.matches(":disabled") && box.checked);
      if (!required || enabledChecked) return;

      const target = boxes.find((box) => !box.matches(":disabled") && !box.validity.customError);
      if (target) {
        target.setCustomValidity(requiredMessage);
        ownedValidity.current.set(target, { message: requiredMessage });
      }
    });

    const context = React.useMemo<CheckboxGroupContextValue>(
      () => ({
        name,
        selected: checkedValues,
        invalid: hasError,
        resetVersion,
        toggle: (itemValue, checked) => {
          const others = checkedValues.filter((current) => current !== itemValue);
          const next = checked ? [...others, itemValue] : others;
          setSelected(next);
          onValueChange?.(next);
        },
      }),
      [checkedValues, hasError, name, onValueChange, resetVersion, setSelected],
    );

    return (
      <Fieldset
        {...props}
        ref={composedRef}
        id={id}
        form={formAssociation}
        className={cn("maivand-plr-checkbox-group", className)}
        aria-describedby={describedBy}
      >
        <FieldsetLegend>{legend}</FieldsetLegend>
        <CheckboxGroupContext.Provider value={context}>
          <div className="maivand-plr-checkbox-group-list">{children}</div>
        </CheckboxGroupContext.Provider>
        {(error || hint) && (
          <span
            id={messageId}
            className={error ? "maivand-plr-error" : "maivand-plr-hint"}
            role={error ? "alert" : undefined}
          >
            {error || hint}
          </span>
        )}
      </Fieldset>
    );
  },
);
CheckboxGroupRoot.displayName = "CheckboxGroup";

const CheckboxGroupItem = React.forwardRef<HTMLInputElement, CheckboxGroupItemProps>(
  function CheckboxGroupItem(
    {
      className,
      value: itemValue,
      label,
      description,
      id: providedId,
      disabled,
      onChange,
      "aria-describedby": externalDescribedBy,
      "aria-invalid": externalInvalid,
      ...props
    },
    ref,
  ) {
    const generatedId = React.useId();
    const group = React.useContext(CheckboxGroupContext);
    if (!group) {
      throw new Error("CheckboxGroup.Item must be rendered inside a CheckboxGroup.");
    }
    const id = providedId || `maivand-plr-checkbox-group-item-${generatedId.replace(/:/g, "")}`;
    const descriptionId = `${id}-description`;
    const checked = group.selected.includes(itemValue);
    const describedBy =
      [description ? descriptionId : null, externalDescribedBy].filter(Boolean).join(" ") ||
      undefined;
    const ariaInvalid = group.invalid ? true : externalInvalid;

    return (
      <label
        className={cn("maivand-plr-checkbox-group-item", className)}
        data-disabled={disabled ? "" : undefined}
      >
        <span className="maivand-plr-checkbox-group-control">
          <input
            {...props}
            ref={ref}
            id={id}
            type="checkbox"
            className="maivand-plr-checkbox-group-input"
            name={group.name}
            value={itemValue}
            checked={checked}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            aria-describedby={describedBy}
            onChange={(event) => {
              onChange?.(event);
              if (!event.defaultPrevented) group.toggle(itemValue, event.currentTarget.checked);
            }}
          />
          <span className="maivand-plr-checkbox-group-box" aria-hidden="true">
            <svg className="maivand-plr-checkbox-group-mark" viewBox="0 0 18 18" focusable="false">
              <path d="M3.5 9.3 7.1 12.8 14.6 5.2" pathLength={1} />
            </svg>
          </span>
        </span>
        <span className="maivand-plr-checkbox-group-copy">
          <span className="maivand-plr-checkbox-group-label">{label}</span>
          {description ? (
            <span id={descriptionId} className="maivand-plr-checkbox-group-description">
              {description}
            </span>
          ) : null}
        </span>
      </label>
    );
  },
);
CheckboxGroupItem.displayName = "CheckboxGroup.Item";

export const CheckboxGroup = Object.assign(CheckboxGroupRoot, {
  Item: CheckboxGroupItem,
});
export { CheckboxGroupItem };
