import { useApp, useBoxMetrics, useWindowSize } from "ink";
import { createElement as h, createRef, useEffect, useMemo, useRef, useState } from "react";
import { renderShell } from "./views/shell.mjs";
import { useTuiController } from "./hooks/use-controller.mjs";
import { useNavigationKeys } from "./hooks/use-navigation-keys.mjs";
import {
  createInlineActionGeometryRegistry,
  InlineActionGeometryContext,
} from "./components/inline-action-geometry.mjs";

/**
 * Root TUI component. State, callbacks, navigation keys, screens, and the shell
 * live in cohesive modules; this component only wires the shared hooks together.
 */
export default function TuiApp({ services }) {
  const { columns = 80, rows = 24 } = useWindowSize();
  const { exit } = useApp();
  const compact = columns < 58 || rows < 18;
  const footerLayoutRef = useRef(null);
  const geometryRefs = useMemo(
    () => ({
      root: createRef(),
      topBar: createRef(),
      statusBar: createRef(),
      footer: footerLayoutRef,
    }),
    [footerLayoutRef],
  );
  const inlineActionGeometry = useMemo(() => createInlineActionGeometryRegistry(), []);
  const footerMetrics = useBoxMetrics(footerLayoutRef);
  const footerActionsRef = useRef([]);
  const [focusedFooterAction, setFocusedFooterAction] = useState(null);
  const controller = useTuiController(services);
  useEffect(() => {
    setFocusedFooterAction(null);
  }, [controller.view, controller.activeTab]);

  useNavigationKeys({
    ...controller,
    exit,
    services,
    footerActionsRef,
    inlineActionGeometry,
    focusedFooterAction,
    setFocusedFooterAction,
  });

  return h(
    InlineActionGeometryContext.Provider,
    { value: inlineActionGeometry },
    renderShell({
      ...controller,
      columns,
      rows,
      compact,
      services,
      footerLayoutRef,
      footerMetrics,
      geometryRefs,
      inlineActionGeometry,
      footerActionsRef,
      focusedFooterAction,
      setFocusedFooterAction,
    }),
  );
}
