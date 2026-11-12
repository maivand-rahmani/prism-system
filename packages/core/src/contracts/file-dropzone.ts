import type { ChangeEventHandler, ComponentPropsWithoutRef, ReactNode } from "react";

/** Why a supplied file was not added to the native file input. */
export type FileDropzoneRejectionReason = "accept" | "multiple" | "native-file-list-unavailable";

/** A file the user supplied that the control could not add to the native input. */
export interface RejectedFile {
  /** The original file object, unchanged. */
  file: File;
  /** Why the file was rejected. */
  reason: FileDropzoneRejectionReason;
}

export interface FileDropzoneOwnProps {
  /** Visible, programmatically associated label; also names the native file input. */
  label: ReactNode;
  /** Helper text beneath the drop target; replaced by `error` when one is present. */
  hint?: ReactNode;
  /** Visible validation message; rejected-file messages are announced here too. */
  error?: ReactNode;
  /**
   * Native file-type hint, also checked for picker and dropped files.
   * Comma-separated extensions and MIME types use the native `accept` syntax.
   */
  accept?: string;
  /** Allows more than one accepted file. Defaults to `false`. */
  multiple?: boolean;
  /** Keeps native required-form validation on the underlying file input. */
  required?: boolean;
  /** Called with the files still present in the native input, including `[]`. */
  onFilesChange?: (files: File[]) => void;
  /**
   * Called with files that were not added to the native input and why. Rejected
   * files are also announced through the visible error message.
   */
  onFilesRejected?: (rejections: RejectedFile[]) => void;
  /** Native input change event, after the selection callbacks above are handled. */
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Visible prompt shown with the ordinary native picker control; presentation only. */
  children?: ReactNode;
}

/**
 * FileDropzone is a native, keyboard-operable file picker that also accepts
 * actual file drops.
 *
 * Native input and form behavior (implementation-owned):
 * - The control renders one native `<input type="file">` and keeps its `files`
 *   `FileList` as the source of truth. Selected files submit through normal
 *   `FormData`/form semantics under the native `name`; without `name` they are
 *   not submitted. Native input attributes and refs are forwarded.
 * - `value` and `defaultValue` are intentionally unavailable: browsers do not
 *   allow scripts to set a meaningful controlled file selection, so the
 *   selection is always user-owned. Observe it through `onFilesChange`.
 * - `accept`, `multiple`, and `required` apply to the native input as well as
 *   to drop validation. `required` keeps native constraint validation, so form
 *   submission is blocked until an accepted file is present.
 * - The native input remains keyboard reachable and operable; the browser's
 *   normal keyboard activation opens the picker. Dropping is supplementary and
 *   must never be the only way to choose a file.
 * - `disabled` disables the input and ignores drops; disabled controls are
 *   skipped by native constraint validation and form submission.
 * - Selecting files through the input reports the accepted selection through
 *   `onFilesChange` and forwards the native change event to `onChange`.
 *   Accepted dropped files are mirrored into the native `files` list and a
 *   native `change` event is dispatched, so both callbacks observe the same
 *   selection. If the browser cannot attach dropped files to the native list,
 *   the files are not added and are reported with
 *   `native-file-list-unavailable`.
 * - When the owning form resets and the reset is not cancelled, the browser
 *   clears the file selection; implementations must notify that changed
 *   selection through `onFilesChange` (with `[]`) after the reset applies.
 *
 * Rejections:
 * - A file that does not satisfy `accept` is rejected with `"accept"`. When
 *   `multiple` is false, a file beyond the first accepted one is rejected with
 *   `"multiple"`. Rejected files never enter the native input and are never
 *   submitted; they are reported through `onFilesRejected` with the original
 *   `File`.
 *
 * Accessibility:
 * - `label` is required and must render as a visible native `<label>` whose
 *   `htmlFor` points at the input. Caller `aria-label`/`aria-labelledby` may
 *   override the accessible name; the prompt is presentation only.
 * - `hint` and `error` receive stable ids and are appended to any caller
 *   `aria-describedby` on the input. An active rejection or `error` replaces
 *   the hint, is announced (`role="alert"`), and sets `aria-invalid="true"`;
 *   otherwise a caller-provided `aria-invalid` is preserved.
 *
 * Appearance, drop-target styling, and motion belong to the design system.
 */
export type FileDropzoneProps = FileDropzoneOwnProps &
  Omit<
    ComponentPropsWithoutRef<"input">,
    "type" | "value" | "defaultValue" | "accept" | "multiple" | "required" | "onChange"
  >;
