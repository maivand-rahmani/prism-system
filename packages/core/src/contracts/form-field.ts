import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { AsChildProp } from "../types/common.js";

export interface FormFieldOwnProps {
  /**
   * Consumer-owned base id for the field. Required: implementations derive the
   * label `htmlFor`, the control `id`, and the described-by ids from it.
   */
  id: string;
  /** Marks the field required and sets `aria-required` on the control. */
  required?: boolean;
  /** Disables the control. */
  disabled?: boolean;
  /** Marks the field invalid and sets `aria-invalid` on the control. */
  invalid?: boolean;
}

/**
 * FormField is a compound component whose parts are attached as static members:
 * `FormField.Label`, `FormField.Control`, `FormField.Description`,
 * `FormField.Error`.
 *
 * Accessibility contract (implementation-owned):
 * - The root puts its required `id` into a shared context.
 * - `FormField.Label` renders a native `<label>` whose `htmlFor` is the control
 *   id derived from the root id; consumers cannot override it.
 * - `FormField.Control` is a styled wrapper by default and does not claim to be
 *   the native control. Use `asChild` with an input/select/textarea component to
 *   receive the root `id`, invalid/required/disabled state, and references to
 *   rendered help/error parts. Existing child/control ARIA descriptions and
 *   refs are preserved and merged.
 * - `FormField.Description` and an invalid `FormField.Error` get ids derived
 *   from the root id. Implementations associate only parts that are mounted;
 *   client registration may update `aria-describedby` after hydration.
 *   `Error` additionally announces the message (`role="alert"` / a live region).
 * - Root-owned attributes are omitted from the parts so consumers cannot break
 *   the label/control/help/error associations.
 */
export type FormFieldProps = FormFieldOwnProps & ComponentPropsWithoutRef<"div">;

/** Native label props. `htmlFor` is owned by the root context and omitted. */
export type FormFieldLabelProps = Omit<ComponentPropsWithoutRef<"label">, "htmlFor">;

/**
 * The control wrapper.
 *
 * Supports `asChild` so a system can wire an existing input/select/textarea
 * component; the implementation merges the root-owned ARIA and state attributes
 * onto the child. Native props use the `div` baseline because the wrapper may
 * render around, or as, the control.
 */
export type FormFieldControlProps = AsChildProp & {
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "id" | "aria-invalid" | "aria-required">;

/** Help text. `id` is owned by the root context and omitted. */
export type FormFieldDescriptionProps = Omit<ComponentPropsWithoutRef<"p">, "id">;

/** Validation message. `id` is owned by the root context and omitted. */
export type FormFieldErrorProps = Omit<ComponentPropsWithoutRef<"p">, "id">;
