"use client";

import * as React from "react";
import { cn, type FileUploadProps as CoreFileUploadProps } from "@prism-system/ui-core";

export type FileUploadProps = CoreFileUploadProps;

/** Native file chooser with a clear local action, never a simulated dropzone. */
export const FileUpload = React.forwardRef<HTMLInputElement, FileUploadProps>(function FileUpload(
  { className, invalid = false, type: _type, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="file"
      className={cn("maivand-b-ui", "maivand-b-file-upload", className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      {...props}
    />
  );
});
FileUpload.displayName = "FileUpload";
