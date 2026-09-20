"use client";

import { useCallback, useRef } from "react";

import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect.js";

/**
 * Return a callback with a stable identity that always invokes the latest
 * `fn`. Safe to use inside effects and event handlers without re-subscribing.
 */
export function useEventCallback<Args extends unknown[], R>(
  fn: ((...args: Args) => R) | undefined,
): (...args: Args) => R | undefined {
  const ref = useRef(fn);

  useIsomorphicLayoutEffect(() => {
    ref.current = fn;
  });

  return useCallback((...args: Args) => ref.current?.(...args), []);
}
