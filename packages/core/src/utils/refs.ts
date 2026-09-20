import type { Ref, RefCallback } from "react";

/**
 * Merge multiple React refs into a single ref callback.
 *
 * Useful for `asChild`/slot implementations where both the component and the
 * consumer need access to the underlying DOM node.
 */
export function composeRefs<T>(...refs: Array<Ref<T> | undefined | null>): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        // Cast so the callback works with both React 18 (readonly current) and
        // React 19 (mutable current) type definitions.
        (ref as { current: T | null }).current = node;
      }
    }
  };
}
