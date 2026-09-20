"use client";

import { useCallback, useMemo } from "react";

import { useControllableState } from "./useControllableState.js";

export interface UseDisclosureParams {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface UseDisclosureReturn {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Controlled/uncontrolled open state for Dialog and similar surfaces.
 */
export function useDisclosure(params: UseDisclosureParams = {}): UseDisclosureReturn {
  const { open, defaultOpen = false, onOpenChange } = params;

  const [isOpen = false, setIsOpen] = useControllableState<boolean>({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });

  const setOpen = useCallback(
    (next: boolean) => {
      setIsOpen(next);
    },
    [setIsOpen],
  );

  const openAction = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, [setIsOpen]);

  return useMemo(
    () => ({ isOpen, setOpen, open: openAction, close, toggle }),
    [isOpen, setOpen, openAction, close, toggle],
  );
}
