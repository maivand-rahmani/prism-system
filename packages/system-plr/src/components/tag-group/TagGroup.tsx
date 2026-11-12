"use client";

import * as React from "react";
import { cn, useComposedRefs } from "@prism-system/ui-core";

/** One tag. `value` identifies it to `onRemove`; `label` is the visible text. */
export interface TagGroupItem {
  /** Unique within `items`. Used as the React key and reported by `onRemove`. */
  value: string;
  /** Visible text. It also names the removal control, so keep it short and distinct. */
  label: string;
  /** A disabled tag keeps its text but offers no removal control. */
  disabled?: boolean;
}

export interface TagGroupProps extends Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children" | "role" | "aria-labelledby"
> {
  /** Visible caption that also names the group for assistive technology. */
  label: React.ReactNode;
  /** Tags to show, in order. Display-only unless `onRemove` is provided. */
  items: readonly TagGroupItem[];
  /**
   * Called with the removed tag's `value`. Providing it adds a removal control to every
   * enabled tag. The consumer owns `items` and should drop the tag in response.
   */
  onRemove?: (value: string) => void;
  /** Builds the accessible name of each removal control from the tag label. */
  removeLabel?: (label: string) => string;
  /** Shown in place of the tags when `items` is empty. */
  emptyLabel?: React.ReactNode;
}

const defaultRemoveLabel = (label: string) => `Remove ${label}`;

/** Nearest enabled tag at or after `start`, else before it. */
function findRemovableItem(items: readonly TagGroupItem[], start: number) {
  for (let index = start; index < items.length; index += 1) {
    const item = items[index];
    if (item && !item.disabled) return item;
  }
  for (let index = Math.min(start, items.length) - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && !item.disabled) return item;
  }
  return undefined;
}

const TagGroupRoot = React.forwardRef<HTMLDivElement, TagGroupProps>(function TagGroupRoot(
  { className, label, items, onRemove, removeLabel = defaultRemoveLabel, emptyLabel, ...props },
  ref,
) {
  const generatedId = React.useId();
  const labelId = `maivand-plr-tag-group-${generatedId.replace(/:/g, "")}-label`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs<HTMLDivElement>(ref, rootRef);
  const removeButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingRemoval = React.useRef<{ index: number; count: number } | null>(null);

  // Removing a tag unmounts the control that held focus. Move focus to the nearest
  // remaining removable tag, or to the group itself when none is left.
  React.useEffect(() => {
    const pending = pendingRemoval.current;
    if (!pending) return;
    pendingRemoval.current = null;
    if (items.length >= pending.count) return;
    const next = findRemovableItem(items, pending.index);
    const target = next ? removeButtons.current.get(next.value) : undefined;
    (target ?? rootRef.current)?.focus();
  }, [items]);

  const handleRemove = (index: number, item: TagGroupItem) => {
    pendingRemoval.current = { index, count: items.length };
    onRemove?.(item.value);
  };

  return (
    <div
      {...props}
      ref={composedRef}
      role="group"
      aria-labelledby={labelId}
      tabIndex={-1}
      className={cn("maivand-plr-ui", "maivand-plr-tag-group", className)}
    >
      <span id={labelId} className="maivand-plr-tag-group-label">
        {label}
      </span>
      {items.length > 0 ? (
        <ul role="list" className="maivand-plr-tag-group-list">
          {items.map((item, index) => (
            <li
              key={item.value}
              className="maivand-plr-tag"
              data-disabled={item.disabled ? "" : undefined}
            >
              <span className="maivand-plr-tag-text">{item.label}</span>
              {onRemove ? (
                <button
                  ref={(node) => {
                    if (node) removeButtons.current.set(item.value, node);
                    else removeButtons.current.delete(item.value);
                  }}
                  type="button"
                  className="maivand-plr-tag-remove"
                  aria-label={removeLabel(item.label)}
                  disabled={item.disabled}
                  onClick={() => handleRemove(index, item)}
                  onKeyDown={(event) => {
                    if (event.key === "Backspace" || event.key === "Delete") {
                      event.preventDefault();
                      handleRemove(index, item);
                    }
                  }}
                >
                  <svg
                    className="maivand-plr-tag-remove-mark"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M3 3l6 6M9 3 3 9" />
                  </svg>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : emptyLabel ? (
        <p className="maivand-plr-tag-group-empty">{emptyLabel}</p>
      ) : null}
    </div>
  );
});
TagGroupRoot.displayName = "TagGroup";

export const TagGroup = TagGroupRoot;
