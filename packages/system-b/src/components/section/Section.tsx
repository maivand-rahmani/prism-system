"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";
import type {
  SectionContentProps,
  SectionDescriptionProps,
  SectionFooterProps,
  SectionHeaderProps,
  SectionProps,
  SectionTitleProps,
} from "@prism-system/ui-core";

const SectionRoot = React.forwardRef<HTMLElement, SectionProps>(function Section(
  { className, ...props },
  ref,
) {
  return (
    <section ref={ref} className={cn("maivand-b-ui", "maivand-b-section", className)} {...props} />
  );
});
SectionRoot.displayName = "Section";

export const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  function SectionHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn("maivand-b-section-header", className)} {...props} />;
  },
);

export const SectionTitle = React.forwardRef<HTMLHeadingElement, SectionTitleProps>(
  function SectionTitle({ className, ...props }, ref) {
    return <h2 ref={ref} className={cn("maivand-b-section-title", className)} {...props} />;
  },
);

export const SectionDescription = React.forwardRef<HTMLParagraphElement, SectionDescriptionProps>(
  function SectionDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn("maivand-b-section-description", className)} {...props} />;
  },
);

export const SectionContent = React.forwardRef<HTMLDivElement, SectionContentProps>(
  function SectionContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("maivand-b-section-content", className)} {...props} />;
  },
);

export const SectionFooter = React.forwardRef<HTMLDivElement, SectionFooterProps>(
  function SectionFooter({ className, ...props }, ref) {
    return <div ref={ref} className={cn("maivand-b-section-footer", className)} {...props} />;
  },
);

export const Section = Object.assign(SectionRoot, {
  Header: SectionHeader,
  Title: SectionTitle,
  Description: SectionDescription,
  Content: SectionContent,
  Footer: SectionFooter,
});

export type {
  SectionProps,
  SectionHeaderProps,
  SectionTitleProps,
  SectionDescriptionProps,
  SectionContentProps,
  SectionFooterProps,
};
