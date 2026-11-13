import { createContext } from "react";
import { measureElement } from "ink";

export const InlineActionGeometryContext = createContext(null);

export function createInlineActionGeometryRegistry() {
  const actions = new Map();
  const chrome = { root: null, topBar: null, statusBar: null, footer: null };

  return {
    setChrome(refs) {
      Object.assign(chrome, refs);
    },
    register(key, ref, clipRegion = "scroll") {
      const entry = { ref, clipRegion };
      const entries = actions.get(key) ?? new Set();
      entries.add(entry);
      actions.set(key, entries);
      return () => {
        entries.delete(entry);
        if (entries.size === 0) actions.delete(key);
      };
    },
    isVisible(key) {
      return [...(actions.get(key) ?? [])].some((entry) => {
        const rect = safeMeasure(entry.ref?.current);
        const clip = getClip(entry.clipRegion, chrome);
        return rect && clip ? intersects(rect, clip) : false;
      });
    },
  };
}

export function intersectVerticalClip(root, topBar, statusBar, footer, region) {
  if (![root, footer].every(isRect)) return null;
  const left = root.x;
  const right = root.x + root.width;
  const bottom = Math.min(root.y + root.height, footer.y);
  const top = region === "chrome" ? root.y : isRect(topBar) ? topBar.y + topBar.height : NaN;
  const clipBottom =
    region === "chrome" ? bottom : Math.min(bottom, isRect(statusBar) ? statusBar.y : bottom);
  if (![top, clipBottom].every(Number.isFinite) || clipBottom <= top || right <= left) return null;
  return { x: left, y: top, width: right - left, height: clipBottom - top };
}

function getClip(region, refs) {
  const root = safeMeasure(refs.root?.current);
  const topBar = safeMeasure(refs.topBar?.current);
  const statusBar = safeMeasure(refs.statusBar?.current);
  const footer = safeMeasure(refs.footer?.current);
  return intersectVerticalClip(root, topBar, statusBar, footer, region);
}

function safeMeasure(node) {
  if (!node) return null;
  try {
    const rect = measureElement(node);
    return isRect(rect) && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}

function isRect(rect) {
  return Boolean(
    rect &&
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width >= 0 &&
    rect.height >= 0,
  );
}

function intersects(rect, clip) {
  return (
    rect.x < clip.x + clip.width &&
    rect.x + rect.width > clip.x &&
    rect.y < clip.y + clip.height &&
    rect.y + rect.height > clip.y
  );
}
