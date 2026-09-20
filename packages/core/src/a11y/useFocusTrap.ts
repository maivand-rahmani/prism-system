"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { getFocusableElements } from "./focus.js";

export interface UseFocusTrapOptions {
  /** Trap focus only while enabled. Defaults to `true`. */
  enabled?: boolean;
  /** Element to focus on activation. Defaults to the first focusable child. */
  initialFocus?: RefObject<HTMLElement | null> | null;
  /** Restore focus to the previously focused element on deactivation. */
  restoreFocus?: boolean;
}

/**
 * Trap keyboard focus inside `ref` while enabled. Shared by Dialog and Select.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions = {},
): void {
  const { enabled = true, initialFocus = null, restoreFocus = true } = options;
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? getFocusableElements(node)[0] ?? node;
      target.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(node);
      if (focusable.length === 0) {
        event.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !node.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    node.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("keydown", handleKeyDown);
      if (restoreFocus) {
        previouslyFocused.current?.focus({ preventScroll: true });
      }
    };
  }, [enabled, initialFocus, restoreFocus, ref]);
}
