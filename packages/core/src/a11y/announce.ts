import { canUseDOM } from "../utils/dom.js";

const REGION_IDS = {
  polite: "ui-core-live-region-polite",
  assertive: "ui-core-live-region-assertive",
} as const;

function getLiveRegion(assertive: boolean): HTMLElement | null {
  if (!canUseDOM) return null;

  const id = assertive ? REGION_IDS.assertive : REGION_IDS.polite;
  const existing = document.getElementById(id);
  if (existing) return existing;

  const region = document.createElement("div");
  region.id = id;
  region.setAttribute("aria-live", assertive ? "assertive" : "polite");
  region.setAttribute("aria-atomic", "true");
  region.setAttribute("role", "status");

  const style = region.style;
  style.position = "absolute";
  style.width = "1px";
  style.height = "1px";
  style.padding = "0";
  style.margin = "-1px";
  style.overflow = "hidden";
  style.clip = "rect(0, 0, 0, 0)";
  style.whiteSpace = "nowrap";
  style.border = "0";

  document.body.appendChild(region);
  return region;
}

export interface AnnounceOptions {
  /** Use an assertive live region for urgent messages. Defaults to `false`. */
  assertive?: boolean;
  /** Clear the message after this many milliseconds. `0` keeps it. */
  timeout?: number;
}

/**
 * Announce a message to assistive technology through a shared live region.
 * No-op on the server.
 */
export function announce(message: string, options: AnnounceOptions = {}): void {
  const { assertive = false, timeout = 7000 } = options;
  const region = getLiveRegion(assertive);
  if (!region) return;

  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = message;
  }, 100);

  if (timeout > 0) {
    window.setTimeout(() => {
      if (region.textContent === message) region.textContent = "";
    }, timeout);
  }
}
