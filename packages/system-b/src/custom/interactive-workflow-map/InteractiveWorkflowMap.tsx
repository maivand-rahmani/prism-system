"use client";

import * as React from "react";

/** A display-only stage supplied by the consuming product. */
export type InteractiveWorkflowNode = {
  id: string;
  title: string;
  description: string;
};

export type InteractiveWorkflowMapProps = {
  /** The ordered, product-owned stages to display. */
  nodes: readonly InteractiveWorkflowNode[];
  /** The selected stage ID, or `null` when no stage is selected. */
  selectedNodeId: string | null;
  /** Called when a stage is selected or the current selection is cleared. */
  onSelectedNodeChange: (nodeId: string | null) => void;
  /** Accessible name for this workflow path. */
  label: string;
};

export function InteractiveWorkflowMap({
  nodes,
  selectedNodeId,
  onSelectedNodeChange,
  label,
}: InteractiveWorkflowMapProps) {
  return (
    <section className="maivand-b-ui maivand-b-workflow-map" aria-label={label}>
      <ol className="maivand-b-workflow-list">
        {nodes.map((node, index) => {
          const selected = node.id === selectedNodeId;
          return (
            <li key={node.id} className="maivand-b-workflow-item">
              <button
                type="button"
                className="maivand-b-workflow-node"
                aria-pressed={selected}
                onClick={() => onSelectedNodeChange(selected ? null : node.id)}
              >
                <span className="maivand-b-workflow-index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="maivand-b-workflow-copy">
                  <span className="maivand-b-workflow-title">{node.title}</span>
                  <span className="maivand-b-workflow-description">{node.description}</span>
                </span>
                <span className="maivand-b-workflow-state" aria-hidden="true">
                  {selected ? "SELECTED" : "OPEN"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="maivand-b-workflow-status" role="status" aria-live="polite">
        {selectedNodeId === null
          ? "Select a stage to inspect it."
          : nodes.some((node) => node.id === selectedNodeId)
            ? `${nodes.find((node) => node.id === selectedNodeId)?.title} selected.`
            : "The selected stage is not in this workflow."}
      </p>
    </section>
  );
}
