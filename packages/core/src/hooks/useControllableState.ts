"use client";

import { useCallback, useRef, useState } from "react";

export interface UseControllableStateParams<T> {
  /** Controlled value. When defined, the hook becomes controlled. */
  prop?: T | undefined;
  /** Initial value when uncontrolled. */
  defaultProp?: T | undefined;
  onChange?: ((value: T) => void) | undefined;
}

export type SetControllableState<T> = (next: T | ((prev: T | undefined) => T)) => void;

/**
 * Manage state that can be either controlled or uncontrolled.
 *
 * This is the shared building block for every interactive contract
 * (Checkbox, Tabs, Dialog, Select).
 */
export function useControllableState<T>(
  params: UseControllableStateParams<T>,
): [T | undefined, SetControllableState<T>] {
  const { prop, defaultProp, onChange } = params;

  const [uncontrolledValue, setUncontrolledValue] = useState<T | undefined>(defaultProp);

  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledValue;

  const isControlledRef = useRef(isControlled);
  isControlledRef.current = isControlled;

  const valueRef = useRef(value);
  valueRef.current = value;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setValue = useCallback<SetControllableState<T>>((next) => {
    const nextValue =
      typeof next === "function" ? (next as (prev: T | undefined) => T)(valueRef.current) : next;

    if (!isControlledRef.current) {
      setUncontrolledValue(nextValue);
    }

    if (!Object.is(valueRef.current, nextValue)) {
      onChangeRef.current?.(nextValue);
    }
  }, []);

  return [value, setValue];
}
