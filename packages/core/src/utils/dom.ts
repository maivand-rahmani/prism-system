/** True when a DOM is available (i.e. code is running in the browser). */
export const canUseDOM = typeof window !== "undefined" && typeof window.document !== "undefined";

/** Returns the document that owns `node`, falling back to the global document. */
export function getOwnerDocument(node?: Node | null): Document | null {
  if (node?.ownerDocument) return node.ownerDocument;
  return canUseDOM ? document : null;
}
