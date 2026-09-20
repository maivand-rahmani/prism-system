"use client";

import * as React from "react";
import {
  Badge as BadgePrimitive,
  Button as ButtonPrimitive,
  Card as CardPrimitive,
  CardContent as CardContentPrimitive,
  CardDescription as CardDescriptionPrimitive,
  CardFooter as CardFooterPrimitive,
  CardHeader as CardHeaderPrimitive,
  CardTitle as CardTitlePrimitive,
  Checkbox as CheckboxPrimitive,
  Dialog as DialogPrimitive,
  DialogClose as DialogClosePrimitive,
  DialogContent as DialogContentPrimitive,
  DialogDescription as DialogDescriptionPrimitive,
  DialogFooter as DialogFooterPrimitive,
  DialogHeader as DialogHeaderPrimitive,
  DialogOverlay as DialogOverlayPrimitive,
  DialogPortal as DialogPortalPrimitive,
  DialogTitle as DialogTitlePrimitive,
  DialogTrigger as DialogTriggerPrimitive,
  Input as InputPrimitive,
  Select as SelectPrimitive,
  SelectContent as SelectContentPrimitive,
  SelectGroup as SelectGroupPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectLabel as SelectLabelPrimitive,
  SelectSeparator as SelectSeparatorPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue as SelectValuePrimitive,
  Tabs as TabsPrimitive,
  TabsContent as TabsContentPrimitive,
  TabsList as TabsListPrimitive,
  TabsTrigger as TabsTriggerPrimitive,
  cn,
  type BadgeProps as CoreBadgeProps,
  type ButtonProps as CoreButtonProps,
  type CardContentProps as CoreCardContentProps,
  type CardDescriptionProps as CoreCardDescriptionProps,
  type CardFooterProps as CoreCardFooterProps,
  type CardHeaderProps as CoreCardHeaderProps,
  type CardProps as CoreCardProps,
  type CardTitleProps as CoreCardTitleProps,
  type CheckboxProps as CoreCheckboxProps,
  type DialogCloseProps as CoreDialogCloseProps,
  type DialogContentProps as CoreDialogContentProps,
  type DialogDescriptionProps as CoreDialogDescriptionProps,
  type DialogFooterProps as CoreDialogFooterProps,
  type DialogHeaderProps as CoreDialogHeaderProps,
  type DialogOverlayProps as CoreDialogOverlayProps,
  type DialogPortalProps as CoreDialogPortalProps,
  type DialogProps as CoreDialogProps,
  type DialogTitleProps as CoreDialogTitleProps,
  type DialogTriggerProps as CoreDialogTriggerProps,
  type InputProps as CoreInputProps,
  type SelectContentProps as CoreSelectContentProps,
  type SelectGroupProps as CoreSelectGroupProps,
  type SelectItemProps as CoreSelectItemProps,
  type SelectLabelProps as CoreSelectLabelProps,
  type SelectProps as CoreSelectProps,
  type SelectSeparatorProps as CoreSelectSeparatorProps,
  type SelectTriggerProps as CoreSelectTriggerProps,
  type SelectValueProps as CoreSelectValueProps,
  type TabsContentProps as CoreTabsContentProps,
  type TabsListProps as CoreTabsListProps,
  type TabsProps as CoreTabsProps,
  type TabsTriggerProps as CoreTabsTriggerProps,
} from "@prism-system/ui-core";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";
export interface ButtonProps extends CoreButtonProps {
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    loadingText,
    fullWidth = false,
    leftIcon,
    rightIcon,
    asChild = false,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const content = asChild ? (
    loading && loadingText ? (
      loadingText
    ) : (
      children
    )
  ) : (
    <>
      {loading && <span className="maivand-a-spinner" aria-hidden="true" />}
      {!loading && leftIcon}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && rightIcon}
    </>
  );
  return (
    <ButtonPrimitive
      ref={ref}
      asChild={asChild}
      variant={variant}
      size={size}
      className={cn(
        "maivand-a-ui maivand-a-button",
        `maivand-a-button-${variant}`,
        `maivand-a-button-${size}`,
        fullWidth && "maivand-a-button-full",
        className,
      )}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {content}
    </ButtonPrimitive>
  );
});
Button.displayName = "Button";

export interface InputProps extends CoreInputProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    id: providedId,
    label,
    hint,
    error,
    invalid = false,
    size = "md",
    startAdornment,
    endAdornment,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const id = providedId || `maivand-a-input-${generatedId.replace(/:/g, "")}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, !error && hint ? hintId : null, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;
  const hasError = Boolean(error || invalid);
  return (
    <div className="maivand-a-ui maivand-a-field">
      {label && (
        <label className="maivand-a-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div
        className={cn(
          "maivand-a-input-shell",
          `maivand-a-input-${size}`,
          hasError && "maivand-a-input-shell-error",
        )}
      >
        {startAdornment && (
          <span className="maivand-a-adornment" aria-hidden="true">
            {startAdornment}
          </span>
        )}
        <InputPrimitive
          ref={ref}
          id={id}
          size={size}
          invalid={hasError}
          className={cn("maivand-a-input", className)}
          aria-describedby={describedBy}
          {...props}
        />
        {endAdornment && <span className="maivand-a-adornment">{endAdornment}</span>}
      </div>
      {error ? (
        <span className="maivand-a-error" id={errorId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="maivand-a-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
Input.displayName = "Input";

export type CardProps = CoreCardProps;
const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "default", padding = "md", asChild = false, ...props },
  ref,
) {
  return (
    <CardPrimitive
      ref={ref}
      variant={variant}
      padding={padding}
      asChild={asChild}
      className={cn(
        "maivand-a-ui maivand-a-card",
        `maivand-a-card-${variant}`,
        `maivand-a-card-padding-${padding}`,
        className,
      )}
      {...props}
    />
  );
});
CardRoot.displayName = "Card";
export const CardHeader = React.forwardRef<HTMLDivElement, CoreCardHeaderProps>(function CardHeader(
  { className, ...props },
  ref,
) {
  return (
    <CardHeaderPrimitive ref={ref} className={cn("maivand-a-card-header", className)} {...props} />
  );
});
export const CardContent = React.forwardRef<HTMLDivElement, CoreCardContentProps>(
  function CardContent({ className, ...props }, ref) {
    return (
      <CardContentPrimitive
        ref={ref}
        className={cn("maivand-a-card-content", className)}
        {...props}
      />
    );
  },
);
export const CardFooter = React.forwardRef<HTMLDivElement, CoreCardFooterProps>(function CardFooter(
  { className, ...props },
  ref,
) {
  return (
    <CardFooterPrimitive ref={ref} className={cn("maivand-a-card-footer", className)} {...props} />
  );
});
export const CardTitle = React.forwardRef<HTMLHeadingElement, CoreCardTitleProps>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <CardTitlePrimitive ref={ref} className={cn("maivand-a-card-title", className)} {...props} />
    );
  },
);
export const CardDescription = React.forwardRef<HTMLParagraphElement, CoreCardDescriptionProps>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <CardDescriptionPrimitive
        ref={ref}
        className={cn("maivand-a-card-description", className)}
        {...props}
      />
    );
  },
);
CardHeader.displayName = "CardHeader";
CardContent.displayName = "CardContent";
CardFooter.displayName = "CardFooter";
CardTitle.displayName = "CardTitle";
CardDescription.displayName = "CardDescription";
export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
});

export type BadgeProps = CoreBadgeProps;
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "default", size = "md", dot = false, asChild = false, children, ...props },
  ref,
) {
  const content =
    dot && !asChild ? (
      <>
        <span className="maivand-a-badge-dot" aria-hidden="true" /> {children}
      </>
    ) : (
      children
    );
  return (
    <BadgePrimitive
      ref={ref}
      asChild={asChild}
      variant={variant}
      size={size}
      className={cn(
        "maivand-a-ui maivand-a-badge",
        `maivand-a-badge-${variant === "default" ? "neutral" : variant}`,
        `maivand-a-badge-${size}`,
        className,
      )}
      {...props}
    >
      {content}
    </BadgePrimitive>
  );
});
Badge.displayName = "Badge";

export interface CheckboxProps extends CoreCheckboxProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
}
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  {
    className,
    label,
    description,
    children,
    checked,
    defaultChecked,
    onCheckedChange,
    invalid = false,
    size = "md",
    ...props
  },
  ref,
) {
  return (
    <span className="maivand-a-ui maivand-a-checkbox">
      <CheckboxPrimitive
        ref={ref}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        invalid={invalid}
        size={size}
        className={cn("maivand-a-checkbox-input", className)}
        {...props}
      >
        <span className="maivand-a-checkbox-box" aria-hidden="true">
          <span className="maivand-a-checkbox-mark">{checked === "indeterminate" ? "–" : "✓"}</span>
        </span>
      </CheckboxPrimitive>
      {(label || description || children) && (
        <span className="maivand-a-checkbox-copy">
          {label && <span className="maivand-a-checkbox-label">{label}</span>}
          {description && <span className="maivand-a-checkbox-description">{description}</span>}
          {children}
        </span>
      )}
    </span>
  );
});
Checkbox.displayName = "Checkbox";

export type TabsProps = CoreTabsProps;
function TabsRoot({ className, orientation = "horizontal", ...props }: TabsProps) {
  return (
    <TabsPrimitive
      orientation={orientation}
      className={cn("maivand-a-ui maivand-a-tabs", className)}
      {...props}
    />
  );
}
export type TabsListProps = CoreTabsListProps;
export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { className, ...props },
  ref,
) {
  return (
    <TabsListPrimitive ref={ref} className={cn("maivand-a-tabs-list", className)} {...props} />
  );
});
export type TabsTriggerProps = CoreTabsTriggerProps;
export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  function TabsTrigger({ className, ...props }, ref) {
    return (
      <TabsTriggerPrimitive
        ref={ref}
        className={cn("maivand-a-tabs-trigger", className)}
        {...props}
      />
    );
  },
);
export type TabsContentProps = CoreTabsContentProps;
export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(function TabsContent(
  { className, forceMount, ...props },
  ref,
) {
  return (
    <TabsContentPrimitive
      ref={ref}
      className={cn("maivand-a-tabs-content", className)}
      {...props}
      {...(forceMount ? { forceMount: true } : {})}
    />
  );
});
export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});
TabsList.displayName = "TabsList";
TabsTrigger.displayName = "TabsTrigger";
TabsContent.displayName = "TabsContent";

export interface SelectProps extends CoreSelectProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
}
const SelectFieldContext = React.createContext<string | undefined>(undefined);
const SelectRoot = function Select({
  className,
  label,
  hint,
  error,
  size: _size = "md",
  id: providedId,
  invalid: _invalid,
  placeholder: _placeholder,
  children,
  ...props
}: SelectProps) {
  const generatedId = React.useId();
  const id = providedId || `maivand-a-select-${generatedId.replace(/:/g, "")}`;
  const messageId = `${id}-message`;
  return (
    <div className={cn("maivand-a-ui maivand-a-select-field", className)}>
      {label && (
        <label className="maivand-a-label" htmlFor={id}>
          {label}
        </label>
      )}
      <SelectFieldContext.Provider value={id}>
        <SelectPrimitive {...props}>{children}</SelectPrimitive>
      </SelectFieldContext.Provider>
      {(error || hint) && (
        <span
          id={messageId}
          className={error ? "maivand-a-error" : "maivand-a-hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
};
SelectRoot.displayName = "Select";
export const SelectTrigger = React.forwardRef<HTMLButtonElement, CoreSelectTriggerProps>(
  function SelectTrigger(
    { className, size = "md", invalid = false, id: providedId, ...props },
    ref,
  ) {
    const fieldId = React.useContext(SelectFieldContext);
    return (
      <SelectTriggerPrimitive
        ref={ref}
        id={providedId || fieldId}
        size={size}
        invalid={invalid}
        className={cn("maivand-a-select-trigger", `maivand-a-input-${size}`, className)}
        {...props}
      />
    );
  },
);
export const SelectValue = React.forwardRef<HTMLSpanElement, CoreSelectValueProps>(
  function SelectValue({ className, ...props }, ref) {
    return (
      <SelectValuePrimitive
        ref={ref}
        className={cn("maivand-a-select-value", className)}
        {...props}
      />
    );
  },
);
export const SelectContent = React.forwardRef<HTMLDivElement, CoreSelectContentProps>(
  function SelectContent({ className, forceMount, position = "popper", ...props }, ref) {
    return (
      <SelectContentPrimitive
        ref={ref}
        className={cn("maivand-a-ui maivand-a-select-content", className)}
        position={position}
        {...props}
        {...(forceMount ? { forceMount: true } : {})}
      />
    );
  },
);
export const SelectGroup = React.forwardRef<HTMLDivElement, CoreSelectGroupProps>(
  function SelectGroup({ className, ...props }, ref) {
    return (
      <SelectGroupPrimitive
        ref={ref}
        className={cn("maivand-a-select-group", className)}
        {...props}
      />
    );
  },
);
export const SelectLabel = React.forwardRef<HTMLDivElement, CoreSelectLabelProps>(
  function SelectLabel({ className, ...props }, ref) {
    return (
      <SelectLabelPrimitive
        ref={ref}
        className={cn("maivand-a-select-label", className)}
        {...props}
      />
    );
  },
);
export const SelectItem = React.forwardRef<HTMLDivElement, CoreSelectItemProps>(function SelectItem(
  { className, ...props },
  ref,
) {
  return (
    <SelectItemPrimitive ref={ref} className={cn("maivand-a-select-item", className)} {...props} />
  );
});
export const SelectSeparator = React.forwardRef<HTMLDivElement, CoreSelectSeparatorProps>(
  function SelectSeparator({ className, ...props }, ref) {
    return (
      <SelectSeparatorPrimitive
        ref={ref}
        className={cn("maivand-a-select-separator", className)}
        {...props}
      />
    );
  },
);
export const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Value: SelectValue,
  Content: SelectContent,
  Group: SelectGroup,
  Label: SelectLabel,
  Item: SelectItem,
  Separator: SelectSeparator,
});

export type DialogProps = CoreDialogProps;
function DialogRoot(props: DialogProps) {
  return <DialogPrimitive {...props} />;
}
export const DialogTrigger = React.forwardRef<HTMLButtonElement, CoreDialogTriggerProps>(
  function DialogTrigger({ className, ...props }, ref) {
    return (
      <DialogTriggerPrimitive
        ref={ref}
        className={cn("maivand-a-button maivand-a-button-primary maivand-a-button-md", className)}
        {...props}
      />
    );
  },
);
export const DialogClose = React.forwardRef<HTMLButtonElement, CoreDialogCloseProps>(
  function DialogClose({ className, ...props }, ref) {
    return (
      <DialogClosePrimitive
        ref={ref}
        className={cn("maivand-a-button maivand-a-button-ghost maivand-a-button-md", className)}
        {...props}
      />
    );
  },
);
export type DialogPortalProps = CoreDialogPortalProps;
export const DialogPortal = ({
  className: _className,
  forceMount,
  ...props
}: CoreDialogPortalProps & { className?: string }) => (
  <DialogPortalPrimitive {...props} {...(forceMount ? { forceMount: true } : {})} />
);
export type DialogOverlayProps = CoreDialogOverlayProps;
export const DialogOverlay = React.forwardRef<HTMLDivElement, CoreDialogOverlayProps>(
  function DialogOverlay({ className, ...props }, ref) {
    return (
      <DialogOverlayPrimitive
        ref={ref}
        className={cn("maivand-a-dialog-overlay", className)}
        {...props}
      />
    );
  },
);
export type DialogContentProps = CoreDialogContentProps;
export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  function DialogContent({ className, children, forceMount, ...props }, ref) {
    return (
      <DialogPortalPrimitive>
        <DialogOverlayPrimitive className="maivand-a-dialog-overlay" />
        <DialogContentPrimitive
          ref={ref}
          className={cn("maivand-a-ui maivand-a-dialog-content", className)}
          {...props}
          {...(forceMount ? { forceMount: true } : {})}
        >
          {children}
        </DialogContentPrimitive>
      </DialogPortalPrimitive>
    );
  },
);
export const DialogHeader = React.forwardRef<HTMLDivElement, CoreDialogHeaderProps>(
  function DialogHeader({ className, ...props }, ref) {
    return (
      <DialogHeaderPrimitive
        ref={ref}
        className={cn("maivand-a-dialog-header", className)}
        {...props}
      />
    );
  },
);
export const DialogTitle = React.forwardRef<HTMLHeadingElement, CoreDialogTitleProps>(
  function DialogTitle({ className, ...props }, ref) {
    return (
      <DialogTitlePrimitive
        ref={ref}
        className={cn("maivand-a-dialog-title", className)}
        {...props}
      />
    );
  },
);
export const DialogDescription = React.forwardRef<HTMLParagraphElement, CoreDialogDescriptionProps>(
  function DialogDescription({ className, ...props }, ref) {
    return (
      <DialogDescriptionPrimitive
        ref={ref}
        className={cn("maivand-a-dialog-description", className)}
        {...props}
      />
    );
  },
);
export const DialogFooter = React.forwardRef<HTMLDivElement, CoreDialogFooterProps>(
  function DialogFooter({ className, ...props }, ref) {
    return (
      <DialogFooterPrimitive
        ref={ref}
        className={cn("maivand-a-dialog-footer", className)}
        {...props}
      />
    );
  },
);
export const Dialog = Object.assign(DialogRoot, {
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Header: DialogHeader,
  Footer: DialogFooter,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
});
DialogTrigger.displayName = "DialogTrigger";
DialogClose.displayName = "DialogClose";
DialogContent.displayName = "DialogContent";
DialogHeader.displayName = "DialogHeader";
DialogTitle.displayName = "DialogTitle";
DialogDescription.displayName = "DialogDescription";
DialogFooter.displayName = "DialogFooter";
DialogOverlay.displayName = "DialogOverlay";
