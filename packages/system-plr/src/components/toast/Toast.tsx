"use client";

import * as React from "react";
import { Slot, cn } from "@prism-system/ui-core";
import type {
  ToastActionProps,
  ToastCloseProps,
  ToastDescriptionProps,
  ToastProps,
  ToastProviderProps,
  ToastTitleProps,
  ToastViewportProps,
} from "@prism-system/ui-core";

const ToastDurationContext = React.createContext<number | null | undefined>(undefined);

/** Close callbacks for the toast root that owns each `Toast.Close` descendant. */
const ToastCloseContext = React.createContext<(() => void) | null>(null);

const DEFAULT_TOAST_DURATION = 5000;

export function ToastProvider({ children, duration }: ToastProviderProps) {
  return <ToastDurationContext.Provider value={duration}>{children}</ToastDurationContext.Provider>;
}

const ToastRoot = React.forwardRef<HTMLLIElement, ToastProps>(function ToastRoot(
  {
    className,
    open: openProp,
    defaultOpen = true,
    onOpenChange,
    duration,
    role = "status",
    children,
    ...props
  },
  ref,
) {
  const providerDuration = React.useContext(ToastDurationContext);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const close = React.useCallback(() => setOpen(false), [setOpen]);

  const effectiveDuration =
    duration !== undefined
      ? duration
      : providerDuration !== undefined
        ? providerDuration
        : DEFAULT_TOAST_DURATION;
  const remainingRef = React.useRef<number | null>(effectiveDuration);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (!open || effectiveDuration === null || paused) return;
    const remaining = remainingRef.current;
    if (remaining === null) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => setOpen(false), remaining);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remaining - (Date.now() - startedAt));
    };
  }, [open, paused, effectiveDuration, setOpen]);

  if (!open) return null;

  return (
    <ToastCloseContext.Provider value={close}>
      <li
        ref={ref}
        role={role}
        data-state="open"
        className={cn("maivand-plr-ui", "maivand-plr-toast", className)}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
        }}
        {...props}
      >
        {children}
      </li>
    </ToastCloseContext.Provider>
  );
});
ToastRoot.displayName = "Toast";

export const ToastViewport = React.forwardRef<HTMLOListElement, ToastViewportProps>(
  function ToastViewport({ className, ...props }, ref) {
    return (
      <ol
        ref={ref}
        className={cn("maivand-plr-ui", "maivand-plr-toast-viewport", className)}
        {...props}
      />
    );
  },
);

export const ToastTitle = React.forwardRef<HTMLHeadingElement, ToastTitleProps>(function ToastTitle(
  { className, ...props },
  ref,
) {
  return <h5 ref={ref} className={cn("maivand-plr-toast-title", className)} {...props} />;
});

export const ToastDescription = React.forwardRef<HTMLParagraphElement, ToastDescriptionProps>(
  function ToastDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn("maivand-plr-toast-description", className)} {...props} />;
  },
);

export const ToastAction = React.forwardRef<HTMLButtonElement, ToastActionProps>(
  function ToastAction({ className, asChild = false, altText, children, ...props }, ref) {
    // `asChild` swaps in Slot; type the local render element from this
    // component's own props/ref instead of the Fiber-widened `React.ElementType`.
    const Comp = (asChild ? Slot : "button") as React.ElementType as React.ComponentType<
      React.ComponentPropsWithoutRef<"button"> & React.RefAttributes<HTMLButtonElement>
    >;
    return (
      <Comp
        ref={ref}
        aria-label={altText}
        className={cn("maivand-plr-toast-action", className)}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);

export const ToastClose = React.forwardRef<HTMLButtonElement, ToastCloseProps>(function ToastClose(
  { className, asChild = false, children, onClick, ...props },
  ref,
) {
  const close = React.useContext(ToastCloseContext);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    close?.();
  };

  // `asChild` swaps in Slot; type the local render element from this
  // component's own props/ref instead of the Fiber-widened `React.ElementType`.
  const Comp = (asChild ? Slot : "button") as React.ElementType as React.ComponentType<
    React.ComponentPropsWithoutRef<"button"> & React.RefAttributes<HTMLButtonElement>
  >;
  return (
    <Comp
      ref={ref}
      className={cn("maivand-plr-toast-close", className)}
      {...props}
      onClick={handleClick}
    >
      {children}
    </Comp>
  );
});

export const Toast = Object.assign(ToastRoot, {
  Provider: ToastProvider,
  Viewport: ToastViewport,
  Root: ToastRoot,
  Title: ToastTitle,
  Description: ToastDescription,
  Action: ToastAction,
  Close: ToastClose,
});
