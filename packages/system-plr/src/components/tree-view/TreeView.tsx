"use client";

import * as React from "react";
import { Keys, cn, useControllableState } from "@prism-system/ui-core";

/** One node of a `TreeView`. Values must be unique across the whole tree. */
export interface TreeViewNode {
  /** Identity used for selection, expansion, and `data-value`. Unique across the tree. */
  value: string;
  /** Plain text. A tree item cannot hold interactive content, so this is text only. */
  label: string;
  /**
   * Cannot be selected. It can still be focused and expanded, so its children stay reachable.
   */
  disabled?: boolean;
  /** Child nodes. A node with children is a parent that can expand and collapse. */
  children?: readonly TreeViewNode[];
}

export interface TreeViewProps extends Omit<
  React.ComponentPropsWithoutRef<"ul">,
  "children" | "role" | "aria-labelledby" | "defaultValue" | "onChange"
> {
  /** Visible caption. It is also the tree's accessible name. */
  label: React.ReactNode;
  /** Root nodes. The tree is data-driven: nothing renders from JSX children. */
  nodes: readonly TreeViewNode[];
  /** Selected node value, or `null` for none. Providing it makes selection controlled. */
  value?: string | null;
  /** Initially selected node value. Default `null`. */
  defaultValue?: string | null;
  /** Called with the value of a node the user selects. Disabled nodes never fire it. */
  onValueChange?: (value: string) => void;
  /** Expanded parent values. Providing it makes expansion controlled. */
  expandedValues?: readonly string[];
  /** Initially expanded parent values. Default none. */
  defaultExpandedValues?: readonly string[];
  /** Called with the complete next list of expanded values. */
  onExpandedValuesChange?: (values: string[]) => void;
}

type FlatEntry = {
  value: string;
  parentValue: string | null;
  hasChildren: boolean;
  expanded: boolean;
  disabled: boolean;
};

type TreeViewContextValue = {
  treeId: string;
  activeValue: string | null;
  selectedValue: string | null;
  expandedValues: ReadonlySet<string>;
  itemRefs: Map<string, HTMLLIElement>;
  setFocused: (value: string) => void;
  select: (value: string) => void;
  setExpanded: (value: string, open: boolean) => void;
};

const TreeViewContext = React.createContext<TreeViewContextValue | null>(null);

function useTreeViewContext(): TreeViewContextValue {
  const context = React.useContext(TreeViewContext);
  if (!context) {
    throw new Error("TreeView items must be rendered inside a TreeView.");
  }
  return context;
}

/** Visible nodes in document order: children appear only under expanded parents. */
function flattenVisible(
  nodes: readonly TreeViewNode[],
  expanded: ReadonlySet<string>,
  parentValue: string | null = null,
  out: FlatEntry[] = [],
): FlatEntry[] {
  for (const node of nodes) {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = hasChildren && expanded.has(node.value);
    out.push({
      value: node.value,
      parentValue,
      hasChildren,
      expanded: isExpanded,
      disabled: Boolean(node.disabled),
    });
    if (isExpanded && node.children) {
      flattenVisible(node.children, expanded, node.value, out);
    }
  }
  return out;
}

/** Value of the nearest treeitem that contains `target`, if any. */
function treeItemValue(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest('[role="treeitem"]')?.getAttribute("data-value") ?? null;
}

function TreeViewItems({
  nodes,
  parentPath,
  level,
}: {
  nodes: readonly TreeViewNode[];
  parentPath: string;
  level: number;
}) {
  const tree = useTreeViewContext();
  return (
    <>
      {nodes.map((node, index) => {
        const path = parentPath ? `${parentPath}-${index}` : String(index);
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const expanded = hasChildren && tree.expandedValues.has(node.value);
        const selected = tree.selectedValue === node.value;
        const labelId = `${tree.treeId}-item-${path}`;

        return (
          <li
            key={node.value}
            ref={(element) => {
              if (element) tree.itemRefs.set(node.value, element);
              else tree.itemRefs.delete(node.value);
            }}
            role="treeitem"
            data-value={node.value}
            aria-level={level}
            aria-posinset={index + 1}
            aria-setsize={nodes.length}
            aria-labelledby={labelId}
            aria-expanded={hasChildren ? expanded : undefined}
            aria-selected={selected}
            aria-disabled={node.disabled ? true : undefined}
            tabIndex={tree.activeValue === node.value ? 0 : -1}
            className="maivand-plr-tree-view-item"
          >
            <div
              className="maivand-plr-tree-view-row"
              onClick={() => {
                tree.setFocused(node.value);
                if (!node.disabled) tree.select(node.value);
              }}
            >
              <span
                className="maivand-plr-tree-view-twisty"
                aria-hidden="true"
                data-leaf={hasChildren ? undefined : ""}
                onClick={
                  hasChildren
                    ? (event) => {
                        event.stopPropagation();
                        tree.setFocused(node.value);
                        tree.setExpanded(node.value, !expanded);
                      }
                    : undefined
                }
              >
                {hasChildren ? (
                  <svg
                    className="maivand-plr-tree-view-chevron"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M4.5 2.5 8 6l-3.5 3.5" />
                  </svg>
                ) : null}
              </span>
              <span id={labelId} className="maivand-plr-tree-view-text">
                {node.label}
              </span>
              {selected ? (
                <svg
                  className="maivand-plr-tree-view-check"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M3.5 9.3 7.1 12.8 14.6 5.2" />
                </svg>
              ) : null}
            </div>
            {hasChildren && expanded && node.children ? (
              <ul role="group" className="maivand-plr-tree-view-group">
                <TreeViewItems nodes={node.children} parentPath={path} level={level + 1} />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

const TreeViewRoot = React.forwardRef<HTMLUListElement, TreeViewProps>(function TreeView(
  {
    className,
    label,
    nodes,
    value,
    defaultValue,
    onValueChange,
    expandedValues,
    defaultExpandedValues,
    onExpandedValuesChange,
    id: providedId,
    onKeyDown,
    onFocus,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const treeId = providedId || `maivand-plr-tree-view-${generatedId.replace(/:/g, "")}`;
  const labelId = `${treeId}-label`;
  const [itemRefs] = React.useState(() => new Map<string, HTMLLIElement>());

  const [selectedValue, setSelectedValue] = useControllableState<string | null>({
    prop: value,
    defaultProp: defaultValue ?? null,
    onChange: (next) => {
      if (next !== null) onValueChange?.(next);
    },
  });
  const selected = selectedValue ?? null;

  const [expandedList, setExpandedList] = useControllableState<string[]>({
    prop: expandedValues as string[] | undefined,
    defaultProp: [...(defaultExpandedValues ?? [])],
    onChange: onExpandedValuesChange,
  });
  const expandedSet = React.useMemo(() => new Set(expandedList ?? []), [expandedList]);

  const flat = React.useMemo(() => flattenVisible(nodes, expandedSet), [nodes, expandedSet]);
  const [focusedValue, setFocusedValue] = React.useState<string | null>(null);
  const isVisible = (candidate: string | null) =>
    candidate !== null && flat.some((entry) => entry.value === candidate);
  // The tab stop follows focus, then the selection, then the first visible item.
  const activeValue = isVisible(focusedValue)
    ? focusedValue
    : isVisible(selected)
      ? selected
      : (flat[0]?.value ?? null);

  const focusItem = (target: FlatEntry | undefined) => {
    if (!target) return;
    setFocusedValue(target.value);
    itemRefs.get(target.value)?.focus();
  };

  const focusValue = (target: string) => {
    setFocusedValue(target);
    itemRefs.get(target)?.focus();
  };

  const setExpandedValue = (target: string, open: boolean) => {
    const current = expandedList ?? [];
    const others = current.filter((item) => item !== target);
    setExpandedList(open ? [...others, target] : others);
  };

  const context: TreeViewContextValue = {
    treeId,
    activeValue,
    selectedValue: selected,
    expandedValues: expandedSet,
    itemRefs,
    setFocused: focusValue,
    select: (target) => setSelectedValue(target),
    setExpanded: setExpandedValue,
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = treeItemValue(event.target);
    if (current === null) return;
    const index = flat.findIndex((entry) => entry.value === current);
    const entry = flat[index];
    if (!entry) return;

    switch (event.key) {
      case Keys.ArrowDown:
        focusItem(flat[index + 1]);
        break;
      case Keys.ArrowUp:
        focusItem(flat[index - 1]);
        break;
      case Keys.Home:
        focusItem(flat[0]);
        break;
      case Keys.End:
        focusItem(flat[flat.length - 1]);
        break;
      case Keys.ArrowRight:
        if (entry.hasChildren && !entry.expanded) {
          setExpandedValue(entry.value, true);
        } else if (entry.expanded) {
          // An open parent's first child is the next visible entry.
          focusItem(flat[index + 1]);
        }
        break;
      case Keys.ArrowLeft:
        if (entry.expanded) {
          setExpandedValue(entry.value, false);
        } else if (entry.parentValue !== null) {
          focusItem(flat.find((candidate) => candidate.value === entry.parentValue));
        }
        break;
      case Keys.Enter:
      case Keys.Space:
        if (!entry.disabled) setSelectedValue(entry.value);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const handleFocus = (event: React.FocusEvent<HTMLUListElement>) => {
    onFocus?.(event);
    const focused = treeItemValue(event.target);
    if (focused !== null) setFocusedValue(focused);
  };

  return (
    <div className={cn("maivand-plr-ui", "maivand-plr-tree-view-field", className)}>
      <span id={labelId} className="maivand-plr-label">
        {label}
      </span>
      <ul
        {...props}
        ref={ref}
        id={treeId}
        role="tree"
        aria-labelledby={labelId}
        className="maivand-plr-tree-view"
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        <TreeViewContext.Provider value={context}>
          <TreeViewItems nodes={nodes} parentPath="" level={1} />
        </TreeViewContext.Provider>
      </ul>
    </div>
  );
});
TreeViewRoot.displayName = "TreeView";

export const TreeView = TreeViewRoot;
