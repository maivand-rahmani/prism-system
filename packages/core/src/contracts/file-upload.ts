import type { ComponentPropsWithoutRef } from "react";

export interface FileUploadOwnProps {
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
}

/**
 * FileUpload is the native file control: `<input type="file">`.
 *
 * The native `type` is fixed and removed from the prop base; only the matching
 * literal may be supplied. Native `accept`/`multiple`/`capture`/change/ref/form
 * semantics are kept, and `invalid` maps to `aria-invalid`. Drop zones and
 * visible file lists are product or design-system compositions built around
 * this control, not part of the contract.
 */
export type FileUploadProps = FileUploadOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, "type"> & {
    /** Fixed to `"file"`; accepted only for explicitness. */
    type?: "file";
  };
