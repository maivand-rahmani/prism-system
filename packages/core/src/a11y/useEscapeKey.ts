"use client";

import { useEffect, useRef } from "react";

export interface UseEscapeKeyOptions {
  enabled?: boolean;
  /** Listen on the document (default) or a specific target. */
  target?: Document | HTMLElement | null;
}

/**
 * Call `handler` when Escape is pressed. Shared by Dialog and Select.
 */
export function useEscapeKey(
  handler: (event: KeyboardEvent) => void,
  options: UseEscapeKeyOptions = {},
): void {
  const { enabled = true, target } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const element = target ?? document;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handlerRef.current(event);
    };

    element.addEventListener("keydown", handleKeyDown as EventListener);
    return () => element.removeEventListener("keydown", handleKeyDown as EventListener);
  }, [enabled, target]);
}
