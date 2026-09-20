import type { ComponentPropsWithoutRef } from "react";
import type { Size } from "../types/common.js";

export type TextareaSize = Size;

export interface TextareaOwnProps {
  /** Control size. Does not map to the native textarea `size` attribute. */
  size?: TextareaSize;
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  /**
   * Requests automatic height growth with content. Implementations may ignore
   * this when they cannot resize without measuring; the prop is behavioral only.
   */
  autoResize?: boolean;
}

/**
 * Textarea is a single, multiline text control.
 *
 * Accessibility expectations: implementations must preserve the native
 * `<textarea>` semantics (labelling, `aria-invalid`, `disabled`, and form
 * participation) and must not replace the element with a non-editable node.
 */
export type TextareaProps = TextareaOwnProps & ComponentPropsWithoutRef<"textarea">;
