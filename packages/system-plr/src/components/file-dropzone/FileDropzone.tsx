"use client";

import * as React from "react";
import { cn, useComposedRefs } from "@prism-system/ui-core";
import "./file-dropzone.css";

export type FileDropzoneRejectionReason = "accept" | "multiple" | "native-file-list-unavailable";

export interface RejectedFile {
  file: File;
  reason: FileDropzoneRejectionReason;
}

export interface FileDropzoneProps extends Omit<
  React.ComponentPropsWithoutRef<"input">,
  | "type"
  | "accept"
  | "multiple"
  | "required"
  | "onChange"
  | "value"
  | "defaultValue"
  | "aria-describedby"
  | "aria-invalid"
> {
  /** Visible, programmatically associated label; also names the native file input. */
  label: React.ReactNode;
  /** Helper text beneath the drop target. */
  hint?: React.ReactNode;
  /** A visible validation message; rejected-file messages are announced here too. */
  error?: React.ReactNode;
  /** Native file-type hint, also checked for picker and dropped files. */
  accept?: string;
  /** Allow more than one accepted file. Defaults to false. */
  multiple?: boolean;
  /** Keep native required-form validation on the underlying file input. */
  required?: boolean;
  /** Additional description IDs, merged with visible component help and errors. */
  "aria-describedby"?: string;
  /** Consumer validation state; a component error or rejection takes precedence. */
  "aria-invalid"?: React.ComponentPropsWithoutRef<"input">["aria-invalid"];
  /** Called with the files still present in the native input. */
  onFilesChange?: (files: File[]) => void;
  /** Called with rejected files and a reason; rejected files are announced in the error message. */
  onFilesRejected?: (rejections: RejectedFile[]) => void;
  /** Localize the announced rejection message; a readable English message is used by default. */
  formatRejectionMessage?: (rejections: RejectedFile[]) => string;
  /** Native input change event. */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** Prompt shown next to the ordinary native picker control. */
  children?: React.ReactNode;
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept?.trim()) return true;
  return accept.split(",").some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
    if (rule.endsWith("/*")) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
    return file.type.toLowerCase() === rule;
  });
}

function sameFileSelection(previous: File[], current: File[]): boolean {
  return (
    previous.length === current.length && previous.every((file, index) => file === current[index])
  );
}

/** A native, keyboard-operable file picker that also accepts actual file drops. */
export const FileDropzone = React.forwardRef<HTMLInputElement, FileDropzoneProps>(
  function FileDropzone(
    {
      accept,
      multiple = false,
      required = false,
      disabled = false,
      label,
      hint,
      error,
      children = "Choose a file or drop it here",
      className,
      id: providedId,
      "aria-describedby": externalDescribedBy,
      "aria-invalid": ariaInvalid,
      onChange,
      onFilesChange,
      onFilesRejected,
      formatRejectionMessage,
      ...inputProps
    },
    forwardedRef,
  ) {
    const generatedId = React.useId();
    const id = providedId || `maivand-plr-dropzone-${generatedId.replace(/:/g, "")}`;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const inputRef = React.useRef<HTMLInputElement>(null);
    // The reset listener is bound once per form association, so it must read the current
    // callback instead of capturing the one from the render that attached it.
    const latestOnFilesChange = React.useRef(onFilesChange);
    latestOnFilesChange.current = onFilesChange;
    const {
      value: _value,
      defaultValue: _defaultValue,
      ...safeInputProps
    } = inputProps as React.ComponentPropsWithoutRef<"input">;
    const ref = useComposedRefs(inputRef, forwardedRef);
    const [dragging, setDragging] = React.useState(false);
    const [rejectionMessage, setRejectionMessage] = React.useState("");
    const dragDepth = React.useRef(0);
    const currentError = rejectionMessage || error;
    const hasError = Boolean(currentError);
    const hasVisibleHint = Boolean(hint && !currentError);
    const describedBy =
      Array.from(
        new Set(
          [hasVisibleHint ? hintId : null, hasError ? errorId : null, externalDescribedBy].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ).join(" ") || undefined;

    // A stable listener survives callback prop identity changes: rebinding on every
    // consumer render can drop the subscription before a native reset is handled. Only a
    // changed explicit form association (the native input's `form` prop) needs a rebind.
    React.useEffect(() => {
      const input = inputRef.current;
      const form = input?.form;
      if (!input || !form) return;

      const handleFormReset = (event: Event) => {
        const previousFiles = Array.from(input.files ?? []);
        if (!previousFiles.length) return;

        window.setTimeout(() => {
          if (event.defaultPrevented || !input.isConnected || input.files?.length) return;
          latestOnFilesChange.current?.([]);
        }, 0);
      };

      form.addEventListener("reset", handleFormReset);
      return () => form.removeEventListener("reset", handleFormReset);
    }, [safeInputProps.form]);

    const reportRejections = React.useCallback(
      (rejections: RejectedFile[]) => {
        const acceptedRejected = rejections.filter(({ reason }) => reason === "accept").length;
        const extraRejected = rejections.filter(({ reason }) => reason === "multiple").length;
        const unavailable = rejections.some(
          ({ reason }) => reason === "native-file-list-unavailable",
        );
        const defaultMessage = unavailable
          ? "Your browser cannot attach dropped files to the file input. Choose the files with the file picker instead."
          : [
              acceptedRejected
                ? `${acceptedRejected} file${acceptedRejected === 1 ? "" : "s"} did not match the accepted file types.`
                : "",
              extraRejected
                ? `${extraRejected} extra file${extraRejected === 1 ? " was" : "s were"} not added; choose one file at a time.`
                : "",
            ]
              .filter(Boolean)
              .join(" ");
        const message = formatRejectionMessage?.(rejections) || defaultMessage;
        setRejectionMessage(message);
        onFilesRejected?.(rejections);
      },
      [formatRejectionMessage, onFilesRejected],
    );

    const handleInputChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
      (event) => {
        const chosen = Array.from(event.currentTarget.files ?? []);
        setRejectionMessage("");
        if (!chosen.length) {
          onFilesChange?.([]);
          onChange?.(event);
          return;
        }

        const rejections: RejectedFile[] = chosen
          .filter((file) => !matchesAccept(file, accept))
          .map((file) => ({ file, reason: "accept" }));
        if (rejections.length) {
          event.currentTarget.value = "";
          reportRejections(rejections);
          onFilesChange?.([]);
        } else {
          onFilesChange?.(chosen);
        }
        onChange?.(event);
      },
      [accept, onChange, onFilesChange, reportRejections],
    );

    const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled || !event.dataTransfer.types.includes("Files")) return;
      dragDepth.current += 1;
      setDragging(true);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!disabled && event.dataTransfer.types.includes("Files")) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (disabled) return;

      const dropped = Array.from(event.dataTransfer.files);
      if (!dropped.length) return;

      const accepted: File[] = [];
      const rejected: RejectedFile[] = [];
      for (const file of dropped) {
        if (!matchesAccept(file, accept)) {
          rejected.push({ file, reason: "accept" });
        } else if (!multiple && accepted.length > 0) {
          rejected.push({ file, reason: "multiple" });
        } else {
          accepted.push(file);
        }
      }

      const input = inputRef.current;
      const previousFiles = Array.from(input?.files ?? []);
      if (accepted.length) {
        try {
          if (!input) throw new Error("File input is unavailable");
          const transfer = new DataTransfer();
          for (const file of accepted) transfer.items.add(file);
          input.files = transfer.files;
          if (input.files.length !== accepted.length) throw new Error("Files were not assigned");
          setRejectionMessage("");
        } catch {
          const currentFiles = Array.from(input?.files ?? []);
          if (input && !sameFileSelection(previousFiles, currentFiles)) {
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
          rejected.push(
            ...accepted.map((file) => ({ file, reason: "native-file-list-unavailable" as const })),
          );
        }
      }

      if (
        accepted.length &&
        !rejected.some(({ reason }) => reason === "native-file-list-unavailable")
      ) {
        input?.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (rejected.length) reportRejections(rejected);
    };

    return (
      <div
        className={cn(
          "maivand-plr-ui",
          "maivand-plr-field",
          "maivand-plr-file-dropzone",
          dragging && "maivand-plr-file-dropzone-dragging",
          disabled && "maivand-plr-file-dropzone-disabled",
          hasError && "maivand-plr-file-dropzone-error",
          className,
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-dragging={dragging ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        data-invalid={hasError ? "true" : undefined}
      >
        <label className="maivand-plr-label maivand-plr-file-dropzone-label" htmlFor={id}>
          {label}
        </label>
        <div className="maivand-plr-file-dropzone-target">
          <span className="maivand-plr-file-dropzone-prompt" aria-hidden="true">
            {children}
          </span>
          <input
            {...safeInputProps}
            ref={ref}
            id={id}
            type="file"
            className="maivand-plr-file-dropzone-input"
            accept={accept}
            multiple={multiple}
            required={required}
            disabled={disabled}
            aria-describedby={describedBy}
            aria-invalid={hasError ? true : ariaInvalid}
            onChange={handleInputChange}
          />
        </div>
        {hasVisibleHint ? (
          <span className="maivand-plr-hint" id={hintId}>
            {hint}
          </span>
        ) : null}
        {hasError ? (
          <span className="maivand-plr-error" id={errorId} role="alert">
            {currentError}
          </span>
        ) : null}
      </div>
    );
  },
);
FileDropzone.displayName = "FileDropzone";
