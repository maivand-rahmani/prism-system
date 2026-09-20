"use client";

import { useCallback } from "react";
import type { Ref, RefCallback } from "react";

import { composeRefs } from "../utils/refs.js";

/**
 * Stable ref callback that merges several refs. Useful for slot/`asChild`
 * implementations where both the component and the consumer receive the node.
 */
export function useComposedRefs<T>(...refs: Array<Ref<T> | undefined | null>): RefCallback<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(composeRefs(...refs), refs);
}
