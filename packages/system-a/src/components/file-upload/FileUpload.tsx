"use client";

import * as React from "react";
import type { FileUploadProps as CoreFileUploadProps } from "@prism-system/ui-core";
import {
  NativeInputField,
  type NativeInputFieldProps,
} from "../native-input-field/NativeInputField";

export type FileUploadProps = CoreFileUploadProps &
  Pick<NativeInputFieldProps, "label" | "hint" | "error">;

export const FileUpload = React.forwardRef<HTMLInputElement, FileUploadProps>(function FileUpload(
  { type: _type, ...props },
  ref,
) {
  return (
    <NativeInputField
      ref={ref}
      inputType="file"
      inputClassName="maivand-a-file-upload"
      {...props}
    />
  );
});
FileUpload.displayName = "FileUpload";
