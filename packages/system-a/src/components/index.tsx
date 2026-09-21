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
  DropdownMenu as DropdownMenuPrimitive,
  DropdownMenuArrow as DropdownMenuArrowPrimitive,
  DropdownMenuCheckboxItem as DropdownMenuCheckboxItemPrimitive,
  DropdownMenuContent as DropdownMenuContentPrimitive,
  DropdownMenuGroup as DropdownMenuGroupPrimitive,
  DropdownMenuItem as DropdownMenuItemPrimitive,
  DropdownMenuItemIndicator as DropdownMenuItemIndicatorPrimitive,
  DropdownMenuLabel as DropdownMenuLabelPrimitive,
  DropdownMenuPortal as DropdownMenuPortalPrimitive,
  DropdownMenuRadioGroup as DropdownMenuRadioGroupPrimitive,
  DropdownMenuRadioItem as DropdownMenuRadioItemPrimitive,
  DropdownMenuSeparator as DropdownMenuSeparatorPrimitive,
  DropdownMenuSub as DropdownMenuSubPrimitive,
  DropdownMenuSubContent as DropdownMenuSubContentPrimitive,
  DropdownMenuSubTrigger as DropdownMenuSubTriggerPrimitive,
  DropdownMenuTrigger as DropdownMenuTriggerPrimitive,
  Input as InputPrimitive,
  RadioGroup as RadioGroupPrimitive,
  RadioGroupIndicator as RadioGroupIndicatorPrimitive,
  RadioGroupItem as RadioGroupItemPrimitive,
  Select as SelectPrimitive,
  SelectContent as SelectContentPrimitive,
  SelectGroup as SelectGroupPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectLabel as SelectLabelPrimitive,
  SelectSeparator as SelectSeparatorPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue as SelectValuePrimitive,
  Separator as SeparatorPrimitive,
  Switch as SwitchPrimitive,
  SwitchThumb as SwitchThumbPrimitive,
  Tabs as TabsPrimitive,
  TabsContent as TabsContentPrimitive,
  TabsList as TabsListPrimitive,
  TabsTrigger as TabsTriggerPrimitive,
  Textarea as TextareaPrimitive,
  Tooltip as TooltipPrimitive,
  TooltipArrow as TooltipArrowPrimitive,
  TooltipContent as TooltipContentPrimitive,
  TooltipPortal as TooltipPortalPrimitive,
  TooltipProvider as TooltipProviderPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
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
  type DropdownMenuArrowProps as CoreDropdownMenuArrowProps,
  type DropdownMenuCheckboxItemProps as CoreDropdownMenuCheckboxItemProps,
  type DropdownMenuContentProps as CoreDropdownMenuContentProps,
  type DropdownMenuGroupProps as CoreDropdownMenuGroupProps,
  type DropdownMenuItemIndicatorProps as CoreDropdownMenuItemIndicatorProps,
  type DropdownMenuItemProps as CoreDropdownMenuItemProps,
  type DropdownMenuLabelProps as CoreDropdownMenuLabelProps,
  type DropdownMenuPortalProps as CoreDropdownMenuPortalProps,
  type DropdownMenuProps as CoreDropdownMenuProps,
  type DropdownMenuRadioGroupProps as CoreDropdownMenuRadioGroupProps,
  type DropdownMenuRadioItemProps as CoreDropdownMenuRadioItemProps,
  type DropdownMenuSeparatorProps as CoreDropdownMenuSeparatorProps,
  type DropdownMenuSubContentProps as CoreDropdownMenuSubContentProps,
  type DropdownMenuSubTriggerProps as CoreDropdownMenuSubTriggerProps,
  type DropdownMenuTriggerProps as CoreDropdownMenuTriggerProps,
  type InputProps as CoreInputProps,
  type RadioGroupIndicatorProps as CoreRadioGroupIndicatorProps,
  type RadioGroupItemProps as CoreRadioGroupItemProps,
  type RadioGroupProps as CoreRadioGroupProps,
  type SelectContentProps as CoreSelectContentProps,
  type SelectGroupProps as CoreSelectGroupProps,
  type SelectItemProps as CoreSelectItemProps,
  type SelectLabelProps as CoreSelectLabelProps,
  type SelectProps as CoreSelectProps,
  type SelectSeparatorProps as CoreSelectSeparatorProps,
  type SelectTriggerProps as CoreSelectTriggerProps,
  type SelectValueProps as CoreSelectValueProps,
  type SeparatorProps as CoreSeparatorProps,
  type SwitchProps as CoreSwitchProps,
  type SwitchThumbProps as CoreSwitchThumbProps,
  type TabsContentProps as CoreTabsContentProps,
  type TabsListProps as CoreTabsListProps,
  type TabsProps as CoreTabsProps,
  type TabsTriggerProps as CoreTabsTriggerProps,
  type TextareaProps as CoreTextareaProps,
  type TooltipArrowProps as CoreTooltipArrowProps,
  type TooltipContentProps as CoreTooltipContentProps,
  type TooltipPortalProps as CoreTooltipPortalProps,
  type TooltipProps as CoreTooltipProps,
  type TooltipProviderProps as CoreTooltipProviderProps,
  type TooltipTriggerProps as CoreTooltipTriggerProps,
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

export interface TextareaProps extends CoreTextareaProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id: providedId, label, hint, error, invalid = false, size = "md", ...props },
  ref,
) {
  const generatedId = React.useId();
  const id = providedId || `maivand-a-textarea-${generatedId.replace(/:/g, "")}`;
  const hasError = Boolean(error || invalid);
  const describedBy =
    [error ? `${id}-error` : hint ? `${id}-hint` : null, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="maivand-a-ui maivand-a-field">
      {label && (
        <label className="maivand-a-label" htmlFor={id}>
          {label}
        </label>
      )}
      <TextareaPrimitive
        ref={ref}
        id={id}
        size={size}
        invalid={hasError}
        className={cn("maivand-a-textarea", className)}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <span className="maivand-a-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="maivand-a-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
Textarea.displayName = "Textarea";

export type RadioGroupProps = CoreRadioGroupProps;
export type RadioGroupItemProps = CoreRadioGroupItemProps;
export type RadioGroupIndicatorProps = CoreRadioGroupIndicatorProps;
function RadioGroupRoot({ className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive
      className={cn("maivand-a-ui maivand-a-radio-group", className)}
      {...props}
    />
  );
}
export const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  function RadioGroupItem({ className, children, ...props }, ref) {
    return (
      <RadioGroupItemPrimitive
        ref={ref}
        className={cn("maivand-a-radio-item", className)}
        {...props}
      >
        <RadioGroupIndicator />
        {children}
      </RadioGroupItemPrimitive>
    );
  },
);
export const RadioGroupIndicator = React.forwardRef<HTMLSpanElement, RadioGroupIndicatorProps>(
  function RadioGroupIndicator({ className, forceMount, ...props }, ref) {
    return (
      <RadioGroupIndicatorPrimitive
        ref={ref}
        className={cn("maivand-a-radio-indicator", className)}
        {...props}
        {...(forceMount ? { forceMount: true } : {})}
      />
    );
  },
);
export const RadioGroup = Object.assign(RadioGroupRoot, {
  Item: RadioGroupItem,
  Indicator: RadioGroupIndicator,
});

export type SwitchProps = CoreSwitchProps;
export type SwitchThumbProps = CoreSwitchThumbProps;
const SwitchRoot = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, size = "md", invalid = false, children, ...props },
  ref,
) {
  return (
    <SwitchPrimitive
      ref={ref}
      size={size}
      invalid={invalid}
      className={cn("maivand-a-ui maivand-a-switch", `maivand-a-switch-${size}`, className)}
      {...props}
    >
      {children}
      <SwitchThumb />
    </SwitchPrimitive>
  );
});
export const SwitchThumb = React.forwardRef<HTMLSpanElement, SwitchThumbProps>(function SwitchThumb(
  { className, ...props },
  ref,
) {
  return (
    <SwitchThumbPrimitive
      ref={ref}
      className={cn("maivand-a-switch-thumb", className)}
      {...props}
    />
  );
});
export const Switch = Object.assign(SwitchRoot, { Thumb: SwitchThumb });

export type DropdownMenuProps = CoreDropdownMenuProps;
function DropdownMenuRoot(props: DropdownMenuProps) {
  return <DropdownMenuPrimitive {...props} />;
}
export const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  CoreDropdownMenuTriggerProps
>(function DropdownMenuTrigger({ className, ...props }, ref) {
  return (
    <DropdownMenuTriggerPrimitive
      ref={ref}
      className={cn(
        "maivand-a-ui",
        "maivand-a-button",
        "maivand-a-button-outline",
        "maivand-a-button-sm",
        className,
      )}
      {...props}
    />
  );
});
export const DropdownMenuPortal = ({ forceMount, ...props }: CoreDropdownMenuPortalProps) => (
  <DropdownMenuPortalPrimitive {...props} {...(forceMount ? { forceMount: true } : {})} />
);
export const DropdownMenuContent = React.forwardRef<HTMLDivElement, CoreDropdownMenuContentProps>(
  function DropdownMenuContent({ className, forceMount, ...props }, ref) {
    return (
      <DropdownMenuContentPrimitive
        ref={ref}
        className={cn("maivand-a-ui maivand-a-menu-content", className)}
        {...props}
        {...(forceMount ? { forceMount: true } : {})}
      />
    );
  },
);
export const DropdownMenuGroup = React.forwardRef<HTMLDivElement, CoreDropdownMenuGroupProps>(
  function DropdownMenuGroup({ className, ...props }, ref) {
    return (
      <DropdownMenuGroupPrimitive
        ref={ref}
        className={cn("maivand-a-menu-group", className)}
        {...props}
      />
    );
  },
);
export const DropdownMenuLabel = React.forwardRef<HTMLDivElement, CoreDropdownMenuLabelProps>(
  function DropdownMenuLabel({ className, ...props }, ref) {
    return (
      <DropdownMenuLabelPrimitive
        ref={ref}
        className={cn("maivand-a-menu-label", className)}
        {...props}
      />
    );
  },
);
export const DropdownMenuItem = React.forwardRef<HTMLDivElement, CoreDropdownMenuItemProps>(
  function DropdownMenuItem({ className, ...props }, ref) {
    return (
      <DropdownMenuItemPrimitive
        ref={ref}
        className={cn("maivand-a-menu-item", className)}
        {...props}
      />
    );
  },
);
export const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuCheckboxItemProps
>(function DropdownMenuCheckboxItem({ className, ...props }, ref) {
  return (
    <DropdownMenuCheckboxItemPrimitive
      ref={ref}
      className={cn("maivand-a-menu-item", className)}
      {...props}
    />
  );
});
export const DropdownMenuRadioGroup = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuRadioGroupProps
>(function DropdownMenuRadioGroup({ className, ...props }, ref) {
  return (
    <DropdownMenuRadioGroupPrimitive
      ref={ref}
      className={cn("maivand-a-menu-group", className)}
      {...props}
    />
  );
});
export const DropdownMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuRadioItemProps
>(function DropdownMenuRadioItem({ className, ...props }, ref) {
  return (
    <DropdownMenuRadioItemPrimitive
      ref={ref}
      className={cn("maivand-a-menu-item", className)}
      {...props}
    />
  );
});
export const DropdownMenuItemIndicator = React.forwardRef<
  HTMLSpanElement,
  CoreDropdownMenuItemIndicatorProps
>(function DropdownMenuItemIndicator({ className, forceMount, ...props }, ref) {
  return (
    <DropdownMenuItemIndicatorPrimitive
      ref={ref}
      className={cn("maivand-a-menu-indicator", className)}
      {...props}
      {...(forceMount ? { forceMount: true } : {})}
    />
  );
});
export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuSeparatorProps
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuSeparatorPrimitive
      ref={ref}
      className={cn("maivand-a-menu-separator", className)}
      {...props}
    />
  );
});
export const DropdownMenuArrow = React.forwardRef<SVGSVGElement, CoreDropdownMenuArrowProps>(
  function DropdownMenuArrow({ className, ...props }, ref) {
    return (
      <DropdownMenuArrowPrimitive
        ref={ref}
        className={cn("maivand-a-menu-arrow", className)}
        {...props}
      />
    );
  },
);
export const DropdownMenuSub = DropdownMenuSubPrimitive;
export const DropdownMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuSubTriggerProps
>(function DropdownMenuSubTrigger({ className, ...props }, ref) {
  return (
    <DropdownMenuSubTriggerPrimitive
      ref={ref}
      className={cn("maivand-a-menu-item", className)}
      {...props}
    />
  );
});
export const DropdownMenuSubContent = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuSubContentProps
>(function DropdownMenuSubContent({ className, forceMount, align, ...props }, ref) {
  // Radix SubContent accepts only start | end; center is normalized to its default.
  const normalizedAlign = align === "center" ? undefined : align;
  return (
    <DropdownMenuSubContentPrimitive
      ref={ref}
      align={normalizedAlign}
      className={cn("maivand-a-ui maivand-a-menu-content", className)}
      {...props}
      {...(forceMount ? { forceMount: true } : {})}
    />
  );
});
export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Portal: DropdownMenuPortal,
  Content: DropdownMenuContent,
  Group: DropdownMenuGroup,
  Label: DropdownMenuLabel,
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  ItemIndicator: DropdownMenuItemIndicator,
  Separator: DropdownMenuSeparator,
  Arrow: DropdownMenuArrow,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
});

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
        className={cn("maivand-a-ui maivand-a-tooltip-trigger", className)}
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
        className={cn("maivand-a-ui maivand-a-tooltip-content", className)}
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
        className={cn("maivand-a-tooltip-arrow", className)}
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

export type SeparatorProps = CoreSeparatorProps;
export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, ...props },
  ref,
) {
  return (
    <SeparatorPrimitive
      ref={ref}
      className={cn("maivand-a-ui maivand-a-separator", className)}
      {...props}
    />
  );
});
Separator.displayName = "Separator";
