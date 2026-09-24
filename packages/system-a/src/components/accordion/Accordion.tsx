"use client";

import * as React from "react";
import {
  cn,
  type AccordionContentProps,
  type AccordionHeaderProps,
  type AccordionItemProps,
  type AccordionProps,
  type AccordionTriggerProps,
} from "@prism-system/ui-core";

type AccordionRootInput = {
  type: "single" | "multiple";
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: ((value: string) => void) | ((value: string[]) => void);
  collapsible?: boolean;
} & React.ComponentPropsWithoutRef<"div">;

type AccordionContextValue = {
  isOpen: (value: string) => boolean;
  toggle: (value: string, disabled?: boolean) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
};

type AccordionItemContextValue = {
  value: string;
  disabled: boolean;
  triggerId: string;
  contentId: string;
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);
const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

function useAccordion(): AccordionContextValue {
  const value = React.useContext(AccordionContext);
  if (!value) throw new Error("Accordion parts must be used inside Accordion.");
  return value;
}

function useAccordionItem(): AccordionItemContextValue {
  const value = React.useContext(AccordionItemContext);
  if (!value) throw new Error("Accordion parts must be used inside Accordion.Item.");
  return value;
}

function toOpenValues(
  value: string | string[] | undefined,
  multiple: boolean,
): string[] {
  if (Array.isArray(value)) return [...value];
  if (typeof value === "string" && value.length > 0) return [value];
  return multiple ? [] : [];
}

const AccordionRoot = React.forwardRef<HTMLDivElement, AccordionProps>(function Accordion(
  rawProps,
  ref,
) {
  const {
    type,
    value,
    defaultValue,
    onValueChange,
    collapsible,
    className,
    children,
    ...divProps
  } = rawProps as unknown as AccordionRootInput;

  const multiple = type === "multiple";
  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState<string[]>(() =>
    toOpenValues(defaultValue, multiple),
  );
  const openValues = isControlled ? toOpenValues(value, multiple) : uncontrolled;

  const toggle = React.useCallback(
    (itemValue: string, disabled?: boolean) => {
      if (disabled) return;
      const isOpen = openValues.includes(itemValue);
      if (multiple) {
        const next = isOpen
          ? openValues.filter((entry) => entry !== itemValue)
          : [...openValues, itemValue];
        if (!isControlled) setUncontrolled(next);
        (onValueChange as ((next: string[]) => void) | undefined)?.(next);
        return;
      }
      if (isOpen) {
        if (!collapsible) return;
        if (!isControlled) setUncontrolled([]);
        (onValueChange as ((next: string) => void) | undefined)?.("");
        return;
      }
      if (!isControlled) setUncontrolled([itemValue]);
      (onValueChange as ((next: string) => void) | undefined)?.(itemValue);
    },
    [multiple, openValues, isControlled, collapsible, onValueChange],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const setRootRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref],
  );

  const context = React.useMemo<AccordionContextValue>(
    () => ({ isOpen: (entry) => openValues.includes(entry), toggle, rootRef }),
    [openValues, toggle],
  );

  return (
    <AccordionContext.Provider value={context}>
      <div
        ref={setRootRef}
        data-type={type}
        data-maivand-accordion=""
        className={cn("maivand-a-ui", "maivand-a-accordion", className)}
        {...divProps}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
});
AccordionRoot.displayName = "Accordion";

export const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  function AccordionItem({ value, disabled = false, className, children, ...props }, ref) {
    const accordion = useAccordion();
    const baseId = React.useId();
    const context = React.useMemo<AccordionItemContextValue>(
      () => ({
        value,
        disabled,
        triggerId: `${baseId}-trigger`,
        contentId: `${baseId}-content`,
      }),
      [value, disabled, baseId],
    );
    const open = accordion.isOpen(value);
    return (
      <AccordionItemContext.Provider value={context}>
        <div
          ref={ref}
          data-state={open ? "open" : "closed"}
          data-disabled={disabled || undefined}
          className={cn("maivand-a-accordion-item", className)}
          {...props}
        >
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  },
);
AccordionItem.displayName = "AccordionItem";

export const AccordionHeader = React.forwardRef<HTMLHeadingElement, AccordionHeaderProps>(
  function AccordionHeader({ className, ...props }, ref) {
    return (
      <h3 ref={ref} className={cn("maivand-a-accordion-header", className)} {...props} />
    );
  },
);
AccordionHeader.displayName = "AccordionHeader";

export const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  function AccordionTrigger({ className, onClick, onKeyDown, ...props }, ref) {
    const accordion = useAccordion();
    const item = useAccordionItem();
    const open = accordion.isOpen(item.value);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      accordion.toggle(item.value, item.disabled);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const root = accordion.rootRef.current;
      if (!root) return;
      // Only navigate triggers that belong to this accordion level. A trigger
      // inside a nested accordion has a different closest `[data-maivand-accordion]`
      // root, so Arrow/Home/End never escape into child accordions.
      const triggers = Array.from(
        root.querySelectorAll<HTMLButtonElement>(
          "[data-maivand-accordion-trigger]:not(:disabled)",
        ),
      ).filter((trigger) => trigger.closest("[data-maivand-accordion]") === root);
      if (triggers.length === 0) return;
      const currentIndex = triggers.indexOf(event.currentTarget);
      let nextIndex = currentIndex;
      if (event.key === "ArrowDown") {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % triggers.length;
      } else if (event.key === "ArrowUp") {
        nextIndex =
          currentIndex < 0 ? triggers.length - 1 : (currentIndex - 1 + triggers.length) % triggers.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else {
        nextIndex = triggers.length - 1;
      }
      event.preventDefault();
      triggers[nextIndex]?.focus();
    };

    return (
      <button
        ref={ref}
        type="button"
        id={item.triggerId}
        aria-expanded={open}
        aria-controls={item.contentId}
        aria-disabled={item.disabled || undefined}
        disabled={item.disabled}
        data-state={open ? "open" : "closed"}
        data-maivand-accordion-trigger=""
        className={cn("maivand-a-accordion-trigger", className)}
        {...props}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
AccordionTrigger.displayName = "AccordionTrigger";

export const AccordionContent = React.forwardRef<HTMLDivElement, AccordionContentProps>(
  function AccordionContent({ className, forceMount, children, ...props }, ref) {
    const accordion = useAccordion();
    const item = useAccordionItem();
    const open = accordion.isOpen(item.value);
    return (
      <div
        ref={ref}
        id={item.contentId}
        role="region"
        aria-labelledby={item.triggerId}
        hidden={!open && !forceMount}
        data-state={open ? "open" : "closed"}
        className={cn("maivand-a-accordion-content", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
AccordionContent.displayName = "AccordionContent";

export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Header: AccordionHeader,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
});

export type {
  AccordionProps,
  AccordionItemProps,
  AccordionHeaderProps,
  AccordionTriggerProps,
  AccordionContentProps,
};
