"use client";

import { useEffect, useLayoutEffect } from "react";

import { canUseDOM } from "../utils/dom.js";

/**
 * `useLayoutEffect` in the browser and `useEffect` on the server, avoiding the
 * React SSR "useLayoutEffect does nothing on the server" warning.
 */
export const useIsomorphicLayoutEffect = canUseDOM ? useLayoutEffect : useEffect;
