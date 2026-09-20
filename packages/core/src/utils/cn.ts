import { clsx, type ClassValue } from "clsx";

export type { ClassValue };

/**
 * Conditionally join class names.
 *
 * `cn` intentionally performs a plain merge. Systems remain responsible for
 * their own class-conflict strategy (for example tailwind-merge) so that core
 * stays free of styling tooling.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Alias kept for parity with common `cx` naming. */
export const cx = cn;
