"use client";

import * as React from "react";
import {
  Tooltip as TooltipPrimitive,
  TooltipArrow as TooltipArrowPrimitive,
  TooltipContent as TooltipContentPrimitive,
  TooltipPortal as TooltipPortalPrimitive,
  TooltipProvider as TooltipProviderPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
  cn,
  type TooltipArrowProps as CoreTooltipArrowProps,
  type TooltipContentProps as CoreTooltipContentProps,
  type TooltipPortalProps as CoreTooltipPortalProps,
  type TooltipProps as CoreTooltipProps,
  type TooltipProviderProps as CoreTooltipProviderProps,
  type TooltipTriggerProps as CoreTooltipTriggerProps,
} from "@prism-system/ui-core";

export type TooltipProps = CoreTooltipProps;

export function TooltipProvider(props: CoreTooltipProviderProps) {
  return <TooltipProviderPrimitive {...props} />;
}

function TooltipRoot(props: TooltipProps) {
  return <TooltipPrimitive {...props} />;
}

export const TooltipTrigger = React.forwardRef<HTMLButtonElement, CoreTooltipTriggerProps>(
  function TooltipTrigger({ className, ...props }, ref) {
    return (
      <TooltipTriggerPrimitive
        ref={ref}
        className={cn("maivand-b-ui maivand-b-tooltip-trigger", className)}
        {...props}
      />
    );
  },
);

export const TooltipPortal = ({ forceMount, ...props }: CoreTooltipPortalProps) => (
  <TooltipPortalPrimitive {...props} {...(forceMount ? { forceMount: true } : {})} />
);

export const TooltipContent = React.forwardRef<HTMLDivElement, CoreTooltipContentProps>(
  function TooltipContent({ className, forceMount, ...props }, ref) {
    return (
      <TooltipContentPrimitive
        ref={ref}
        className={cn("maivand-b-ui maivand-b-tooltip-content", className)}
        {...props}
        {...(forceMount ? { forceMount: true } : {})}
      />
    );
  },
);

export const TooltipArrow = React.forwardRef<SVGSVGElement, CoreTooltipArrowProps>(
  function TooltipArrow({ className, ...props }, ref) {
    return (
      <TooltipArrowPrimitive
        ref={ref}
        className={cn("maivand-b-tooltip-arrow", className)}
        {...props}
      />
    );
  },
);

export const Tooltip = Object.assign(TooltipRoot, {
  Provider: TooltipProvider,
  Trigger: TooltipTrigger,
  Portal: TooltipPortal,
  Content: TooltipContent,
  Arrow: TooltipArrow,
});
