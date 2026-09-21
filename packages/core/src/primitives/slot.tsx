"use client";

import * as SlotPrimitiveNamespace from "@radix-ui/react-slot";

/**
 * Slot composition foundation.
 *
 * Re-exports the Radix `Slot`/`Slottable` primitives so design systems can
 * implement the contract's `asChild` behavior without depending on Radix
 * directly. Slot merges its own props with the single child element it clones;
 * core adds no classes or styles here.
 */
export { Slot, Slottable, type SlotProps } from "@radix-ui/react-slot";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export const SlotPrimitive = SlotPrimitiveNamespace;
