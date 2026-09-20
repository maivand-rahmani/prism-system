"use client";

import * as React from "react";

import { cn } from "../utils/cn.js";

/**
 * Structural base props for the shadcn-style Textarea.
 *
 * The native `<textarea>` element has no conflicting `size` attribute, so the
 * contract's control `size` is layered directly on top of the element props.
 */
export interface TextareaBaseProps extends React.ComponentPropsWithoutRef<"textarea"> {
  size?: "sm" | "md" | "lg";
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  /** Requests automatic height growth; carried as a `data-*` hint only. */
  autoResize?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaBaseProps>(function Textarea(
  { className, size = "md", invalid = false, autoResize = false, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      data-size={size}
      data-invalid={invalid || undefined}
      data-auto-resize={autoResize || undefined}
      aria-invalid={invalid || undefined}
      className={cn(className)}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
