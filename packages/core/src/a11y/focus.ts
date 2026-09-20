const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Return the focusable descendants of `container`, in DOM order, skipping
 * elements that are hidden.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (element.hasAttribute("disabled")) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      if (element.hidden) return false;
      return element.offsetParent !== null || element.getClientRects().length > 0;
    },
  );
}

/** Focus the first focusable descendant. Returns `true` when focus moved. */
export function focusFirst(container: HTMLElement): boolean {
  const first = getFocusableElements(container)[0];
  if (!first) return false;
  first.focus({ preventScroll: true });
  return true;
}
