"use client";

import { useEffect, useState } from "react";

import { canUseDOM } from "../utils/dom.js";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Track the user's `prefers-reduced-motion` setting. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    canUseDOM ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    if (!canUseDOM) return;
    const mediaQuery = window.matchMedia(QUERY);
    const handleChange = () => setReduced(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}
