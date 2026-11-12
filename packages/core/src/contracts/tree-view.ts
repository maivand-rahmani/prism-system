import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * One node in a `TreeView` hierarchy.
 *
 * `value` is the stable identity used for selection and expansion and must be
 * unique across the whole tree. `label` is plain text because a tree item does
 * not host interactive content. A node with a nonempty `children` array is a
 * parent that can expand and collapse. A disabled node cannot be selected, but
 * it remains focusable and expandable so its descendants stay reachable.
 */
export interface TreeViewNode {
  /** Unique across the whole tree; used for selection and expansion. */
  value: string;
  /** Visible plain text. */
  label: string;
  /** Prevents selection while keeping the node focusable and expandable. */
  disabled?: boolean;
  /** Child nodes. A node with children is an expandable parent. */
  children?: readonly TreeViewNode[];
}

/**
 * TreeView is a data-driven, single-selection hierarchical list.
 *
 * The root owns `role="tree"` and gets its accessible name from the visible
 * `label`. Implementations render `role="treeitem"` nodes with a roving
 * tabindex (exactly one tab stop), `aria-level`, `aria-posinset`,
 * `aria-setsize`, `aria-selected`, `aria-disabled` when disabled, and
 * `aria-expanded` on parent nodes. The tree is defined by `nodes`, never by JSX
 * children.
 *
 * Focus, selection, and state ownership:
 * - The implementation owns DOM focus, the single tab stop, and the distinction
 *   between the focused item and the selected item. `aria-selected` reflects
 *   `value`, not merely focus.
 * - Selection is controlled when `value` is provided and uncontrolled with
 *   `defaultValue` otherwise; `null` means no selection (the default).
 *   `onValueChange` fires only when the user selects an enabled node. Disabled
 *   nodes can be focused but never selected.
 * - Expansion is controlled when `expandedValues` is provided and uncontrolled
 *   with `defaultExpandedValues` otherwise. Only parent values are meaningful;
 *   `onExpandedValuesChange` receives the complete next list of expanded parent
 *   values. The consumer owns whatever state it passes back.
 * - TreeView is not a native form control: it has no `name`, `required`,
 *   submission, or reset semantics. The consumer reads the current selection
 *   from its own state.
 *
 * Keyboard contract (implementation-owned): `ArrowDown`/`ArrowUp` move to the
 * next/previous visible node without wrapping; `Home`/`End` move to the first/
 * last visible node; `ArrowRight` expands a collapsed parent and moves into its
 * first child when already expanded; `ArrowLeft` collapses an expanded parent
 * and otherwise moves to its parent; `Enter` and `Space` select the focused
 * enabled node. Disabled nodes participate in focus and expansion but are
 * skipped by selection. Pointer interaction must not break this model; a
 * separate pointer affordance may toggle expansion without selecting.
 *
 * Standard `ul` props are forwarded. `children`, `role`, `aria-labelledby`,
 * `defaultValue`, and `onChange` are omitted because the root owns the tree
 * semantics and the selection props above replace native ones. Indentation,
 * expand/collapse indicators, selected styling, and motion belong to the
 * design system.
 */
export type TreeViewProps = Omit<
  ComponentPropsWithoutRef<"ul">,
  "children" | "role" | "aria-labelledby" | "defaultValue" | "onChange"
> & {
  /** Visible caption that also names the tree for assistive technology. */
  label: ReactNode;
  /** Root nodes, in document order. */
  nodes: readonly TreeViewNode[];
  /** Controlled selected node value; `null` means no selection. */
  value?: string | null;
  /** Initially selected node value for uncontrolled usage. Default `null`. */
  defaultValue?: string | null;
  /** Called with the value of an enabled node the user selects. */
  onValueChange?: (value: string) => void;
  /** Controlled values of expanded parent nodes. */
  expandedValues?: readonly string[];
  /** Initially expanded parent values for uncontrolled usage. Default none. */
  defaultExpandedValues?: readonly string[];
  /** Called with the complete next list of expanded parent values. */
  onExpandedValuesChange?: (values: string[]) => void;
};
