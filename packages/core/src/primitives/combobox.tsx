"use client";

import * as React from "react";

import type {
  ComboboxContentProps,
  ComboboxInputProps,
  ComboboxItemProps,
  ComboboxProps,
} from "../contracts/combobox.js";
import { useComposedRefs } from "../hooks/useComposedRefs.js";
import { useControllableState } from "../hooks/useControllableState.js";
import { useIsomorphicLayoutEffect } from "../hooks/useIsomorphicLayoutEffect.js";
import { cn } from "../utils/cn.js";

/* -------------------------------------------------------------------------- */
/* Option registry                                                             */
/* -------------------------------------------------------------------------- */

/** The fields an option registers with its root. */
interface ComboboxOptionRegistration {
  /** Stable id used for `aria-activedescendant` and active tracking. */
  id: string;
  /** Committed value this option selects. */
  value: string;
  disabled: boolean;
  /** Text committed to the input when this option is selected. */
  textValue: string;
  element: HTMLElement | null;
}

interface RegisteredComboboxOption extends ComboboxOptionRegistration {
  /** Registration order, used as a fallback when DOM order is unavailable. */
  order: number;
}

/* `Node.DOCUMENT_POSITION_*` bit flags, kept numeric so the module stays DOM-free. */
const DOCUMENT_POSITION_PRECEDING = 2;
const DOCUMENT_POSITION_FOLLOWING = 4;

/**
 * Sort registered options by document position, falling back to registration
 * order when the DOM cannot compare them (for example during server rendering).
 */
function compareOptions(a: RegisteredComboboxOption, b: RegisteredComboboxOption): number {
  const aElement = a.element;
  const bElement = b.element;

  if (
    aElement !== null &&
    bElement !== null &&
    aElement !== bElement &&
    typeof aElement.compareDocumentPosition === "function"
  ) {
    const relation = aElement.compareDocumentPosition(bElement);
    if ((relation & DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
    if ((relation & DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  }

  return a.order - b.order;
}

/**
 * Compute the next enabled-option index for `ArrowDown`/`ArrowUp` navigation.
 *
 * With no active option (`currentIndex` is `-1`) the first option is activated
 * for `1` and the last for `-1`; otherwise the index moves by `direction` and
 * clamps at the edges without wrapping. Returns `-1` when there is nothing
 * enabled to activate. Exported as the pure navigation model of the primitive.
 */
export function getNextEnabledIndex(
  enabledCount: number,
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (enabledCount <= 0) return -1;

  if (currentIndex < 0 || currentIndex >= enabledCount) {
    return direction === 1 ? 0 : enabledCount - 1;
  }

  return Math.min(Math.max(currentIndex + direction, 0), enabledCount - 1);
}

/**
 * Whether `value` represents a committed selection.
 *
 * `undefined` (nothing selected yet) and `""` (cleared by editing, by the
 * parent, or by a form reset) both mean "no selection". `aria-selected`,
 * required validity, and the required message all derive from this predicate.
 */
export function hasCommittedSelection(value: string | undefined): boolean {
  return value != null && value !== "";
}

/**
 * Resolve the committed selection from the controllable value and the
 * invalidated-selection marker.
 *
 * Editing the query after a selection marks the previously selected value as
 * invalidated: the primitive keeps reporting `""` for it until a new selection
 * is committed or the parent supplies a different value. This is what keeps a
 * controlled root whose parent has not rerendered yet from submitting the
 * stale value under the new query.
 */
export function resolveCommittedValue(
  value: string | undefined,
  invalidatedValue: string | undefined,
): string | undefined {
  return invalidatedValue !== undefined && value === invalidatedValue ? "" : value;
}

/**
 * State a native form reset restores.
 *
 * Resetting is not an edit, so `invalidatedValue` is always `undefined`: a
 * reset never marks the current selection invalidated. `value` is the
 * uncontrolled selection restored from `defaultValue`; it is `undefined` for a
 * controlled root, whose `value` stays parent-owned and must not be written
 * locally.
 */
export interface ComboboxResetState {
  invalidatedValue: undefined;
  value: string | undefined;
}

/**
 * Resolve the state a native form reset restores.
 *
 * Uncontrolled selection returns to `defaultValue` (or `""`). A controlled
 * selection is parent-owned: the reset clears any edit invalidation but leaves
 * the current `value` to the parent, so a controlled value that already equals
 * the parent's reset value can never stay suppressed by the reset itself.
 */
export function resolveResetState(
  valueProp: string | undefined,
  defaultValue: string | undefined,
): ComboboxResetState {
  return {
    invalidatedValue: undefined,
    value: valueProp === undefined ? (defaultValue ?? "") : undefined,
  };
}

/**
 * Whether a deferred native reset may still be applied.
 *
 * The reset is skipped when the event was canceled, and also when the
 * component actually unmounted before the deferred callback ran. Ordinary
 * re-renders and effect re-subscriptions must never invalidate an accepted
 * reset: the form listener effect re-runs whenever controlled
 * `value`/`inputValue` change, but the component is still mounted and the
 * reset still happened. `mounted` must therefore come from a ref that survives
 * re-renders, not from a per-effect local flag. Exported as the pure
 * reset-decision model of the primitive.
 */
export function shouldApplyDeferredReset(
  event: { readonly defaultPrevented: boolean },
  mounted: boolean,
): boolean {
  return mounted && !event.defaultPrevented;
}

/**
 * Apply an accepted native form reset once the `reset` dispatch has finished.
 *
 * The native `reset` event is cancelable: a listener that runs after the
 * primitive's own can call `preventDefault()`, and a native reset then leaves
 * the form controls alone. Deciding inside the listener would restore local
 * state even for a canceled event and diverge from native behavior, so the
 * decision is deferred to a microtask — after every synchronous listener has
 * run — and `apply` is called only when the event was not canceled and the
 * component is still mounted. `apply` must therefore be safe to skip, and
 * `isMounted` must report the live component, not the lifetime of a single
 * effect subscription. Exported as the pure reset-scheduling model of the
 * primitive.
 */
export function deferAcceptedReset(
  event: { readonly defaultPrevented: boolean },
  apply: () => void,
  isMounted: () => boolean = () => true,
): void {
  queueMicrotask(() => {
    if (!shouldApplyDeferredReset(event, isMounted())) return;
    apply();
  });
}

/**
 * Non-localized fallback used for native constraint validation when `required`
 * is set and no `requiredMessage` was provided. Consumers localize by passing
 * `requiredMessage`.
 */
export const REQUIRED_FALLBACK_MESSAGE = "Please select an option.";

/**
 * Native custom-validity message for the visible combobox input.
 *
 * Returns `""` (valid) unless `required` is set with no committed selection; in
 * that case it returns the localized `requiredMessage` or the non-localized
 * `REQUIRED_FALLBACK_MESSAGE` so native form validation still blocks
 * submission. Query text alone never satisfies `required`.
 */
export function getRequiredValidityMessage(
  required: boolean,
  hasSelection: boolean,
  requiredMessage: string | undefined,
): string {
  if (!required || hasSelection) return "";
  return requiredMessage != null && requiredMessage !== ""
    ? requiredMessage
    : REQUIRED_FALLBACK_MESSAGE;
}

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

interface ComboboxContextValue {
  baseId: string;
  contentId: string;
  requiredMessageId: string;
  /** Effective committed selection (an invalidated value reports `""`). */
  value: string | undefined;
  inputValue: string;
  open: boolean;
  disabled: boolean;
  required: boolean;
  invalid: boolean;
  activeOptionId: string | undefined;
  showRequiredMessage: boolean;
  hasCommittedSelection: boolean;
  touched: boolean;
  requiredMessage: string | undefined;
  setInputValue: (inputValue: string) => void;
  setOpen: (open: boolean) => void;
  setActiveOptionId: (id: string | undefined) => void;
  openPopup: () => void;
  closePopup: () => void;
  moveActive: (direction: 1 | -1) => void;
  selectActive: () => boolean;
  selectOption: (id: string) => void;
  invalidateSelection: () => void;
  registerOption: (option: ComboboxOptionRegistration) => void;
  unregisterOption: (id: string) => void;
  markTouched: () => void;
}

const ComboboxContext = React.createContext<ComboboxContextValue | null>(null);
ComboboxContext.displayName = "ComboboxContext";

function useComboboxContext(part: string): ComboboxContextValue {
  const context = React.useContext(ComboboxContext);
  if (context === null) {
    throw new Error(`${part} must be rendered inside <Combobox>.`);
  }
  return context;
}

/* -------------------------------------------------------------------------- */
/* Root                                                                        */
/* -------------------------------------------------------------------------- */

const ComboboxRoot = React.forwardRef<HTMLDivElement, ComboboxProps>(function ComboboxRoot(
  {
    value: valueProp,
    defaultValue,
    onValueChange,
    inputValue: inputValueProp,
    defaultInputValue,
    onInputValueChange,
    open: openProp,
    defaultOpen,
    onOpenChange,
    disabled = false,
    required = false,
    requiredMessage,
    invalid = false,
    name,
    className,
    children,
    ...props
  },
  forwardedRef,
) {
  const baseId = React.useId();
  const contentId = `${baseId}-content`;
  const requiredMessageId = `${baseId}-required`;

  const [value, setValue] = useControllableState<string>({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChange,
  });
  const [inputValue = "", setInputValue] = useControllableState<string>({
    prop: inputValueProp,
    defaultProp: defaultInputValue ?? "",
    onChange: onInputValueChange,
  });
  const [open = false, setOpen] = useControllableState<boolean>({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  const [activeOptionId, setActiveOptionId] = React.useState<string | undefined>(undefined);
  const [touched, setTouched] = React.useState(false);
  /**
   * The value that was invalidated by editing the query. While the controllable
   * value still reports it, the primitive keeps treating the field as
   * unselected, so a controlled parent that has not rerendered yet cannot leak
   * the old value into the hidden form input.
   */
  const [invalidatedValue, setInvalidatedValue] = React.useState<string | undefined>(undefined);

  const committedValue = resolveCommittedValue(value, invalidatedValue);
  const hasSelection = hasCommittedSelection(committedValue);

  const optionsRef = React.useRef<Map<string, RegisteredComboboxOption>>(new Map());
  const orderRef = React.useRef(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const composedRef = useComposedRefs(forwardedRef, rootRef);

  const registerOption = React.useCallback((option: ComboboxOptionRegistration) => {
    const existing = optionsRef.current.get(option.id);
    optionsRef.current.set(option.id, {
      ...option,
      order: existing?.order ?? orderRef.current++,
    });
  }, []);

  const unregisterOption = React.useCallback((id: string) => {
    optionsRef.current.delete(id);
    setActiveOptionId((current) => (current === id ? undefined : current));
  }, []);

  const getEnabledOptions = React.useCallback((): RegisteredComboboxOption[] => {
    return Array.from(optionsRef.current.values())
      .filter((option) => !option.disabled)
      .sort(compareOptions);
  }, []);

  const openPopup = React.useCallback(() => setOpen(true), [setOpen]);
  const closePopup = React.useCallback(() => setOpen(false), [setOpen]);
  const markTouched = React.useCallback(() => setTouched(true), []);

  const selectOption = React.useCallback(
    (id: string) => {
      const option = optionsRef.current.get(id);
      if (!option || option.disabled || disabled) return;
      // A real selection is a fresh commit: drop any invalidation suppression.
      setInvalidatedValue(undefined);
      setValue(option.value);
      setInputValue(option.textValue);
      setOpen(false);
    },
    [disabled, setInputValue, setOpen, setValue],
  );

  /**
   * Editing the query invalidates the committed selection: report
   * `onValueChange("")` immediately and suppress the stale value locally until
   * an enabled option is selected again. `Escape` only closes the popup, so the
   * typed query stays but the stale submitted value never comes back.
   */
  const invalidateSelection = React.useCallback(() => {
    if (!hasSelection) return;
    setInvalidatedValue(value);
    setValue("");
  }, [hasSelection, setValue, value]);

  // A value that diverges from the invalidated one is a fresh commit (the
  // parent explicitly changed it), so the suppression is no longer needed.
  useIsomorphicLayoutEffect(() => {
    if (invalidatedValue !== undefined && value !== invalidatedValue) {
      setInvalidatedValue(undefined);
    }
  }, [invalidatedValue, value]);

  const moveActive = React.useCallback(
    (direction: 1 | -1) => {
      const options = getEnabledOptions();
      const currentIndex =
        activeOptionId === undefined
          ? -1
          : options.findIndex((option) => option.id === activeOptionId);
      const nextIndex = getNextEnabledIndex(options.length, currentIndex, direction);
      if (nextIndex === -1) return;
      setActiveOptionId(options[nextIndex]?.id);
    },
    [activeOptionId, getEnabledOptions],
  );

  const selectActive = React.useCallback((): boolean => {
    if (activeOptionId === undefined) return false;
    const option = optionsRef.current.get(activeOptionId);
    if (!option || option.disabled || disabled) return false;
    selectOption(option.id);
    return true;
  }, [activeOptionId, disabled, selectOption]);

  // Active option is popup-scoped: every close resets navigation so the next
  // open activates the first/last option again.
  useIsomorphicLayoutEffect(() => {
    if (!open) setActiveOptionId(undefined);
  }, [open]);

  const showRequiredMessage = required && requiredMessage != null && !hasSelection && touched;

  /**
   * Restore state on native form reset.
   *
   * Uncontrolled selection and query return to their defaults. A controlled
   * part stays parent-owned: the reset clears any edit invalidation but never
   * introduces one (resetting is not an edit and reports no value change), so
   * the parent's current `value` again represents the committed selection. That
   * is what keeps a controlled value equal to the parent's reset value from
   * staying suppressed forever; the parent still owns applying its own reset to
   * `value`/`inputValue`.
   */
  const resetToDefaults = React.useCallback(() => {
    setActiveOptionId(undefined);
    setTouched(false);
    setOpen(false);
    const reset = resolveResetState(valueProp, defaultValue);
    setInvalidatedValue(reset.invalidatedValue);
    if (reset.value !== undefined) setValue(reset.value);
    if (inputValueProp === undefined) setInputValue(defaultInputValue ?? "");
  }, [
    defaultInputValue,
    defaultValue,
    inputValueProp,
    setInputValue,
    setOpen,
    setValue,
    valueProp,
  ]);

  /**
   * Live mount flag for deferred reset work. An accepted reset is deferred to a
   * microtask; it must only be skipped after an actual unmount, never because
   * an effect re-subscribed while the component stayed mounted.
   */
  const mountedRef = React.useRef(true);
  useIsomorphicLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Latest reset logic for the deferred callback. The form listener effect can
   * re-subscribe when a controlled prop changes; the deferred reset must then
   * still apply the current semantics instead of the closure captured at
   * dispatch time.
   */
  const resetToDefaultsRef = React.useRef(resetToDefaults);

  // `reset` fires on the owning form and does not bubble to descendants, so the
  // listener lives on the closest form of the root. The event is cancelable:
  // the reset is deferred until the synchronous dispatch has finished and is
  // skipped when a later listener canceled it or the root unmounted, matching
  // native reset behavior. The effect re-runs with `resetToDefaults` so the
  // latest controlled props are also used to re-discover the owning form, but
  // re-subscription must never drop an accepted reset: the deferred callback
  // reads refs instead of effect-local state.
  useIsomorphicLayoutEffect(() => {
    resetToDefaultsRef.current = resetToDefaults;
    const form = rootRef.current?.closest("form") ?? null;
    if (form === null) return;
    const handleReset = (event: Event) => {
      deferAcceptedReset(
        event,
        () => {
          resetToDefaultsRef.current();
        },
        () => mountedRef.current,
      );
    };
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("reset", handleReset);
    };
  }, [resetToDefaults]);

  const contextValue = React.useMemo<ComboboxContextValue>(
    () => ({
      baseId,
      contentId,
      requiredMessageId,
      value: committedValue,
      inputValue,
      open,
      disabled,
      required,
      invalid,
      activeOptionId,
      showRequiredMessage,
      hasCommittedSelection: hasSelection,
      touched,
      requiredMessage,
      setInputValue,
      setOpen,
      setActiveOptionId,
      openPopup,
      closePopup,
      moveActive,
      selectActive,
      selectOption,
      invalidateSelection,
      registerOption,
      unregisterOption,
      markTouched,
    }),
    [
      activeOptionId,
      baseId,
      closePopup,
      committedValue,
      contentId,
      disabled,
      hasSelection,
      inputValue,
      invalid,
      invalidateSelection,
      markTouched,
      moveActive,
      open,
      openPopup,
      registerOption,
      required,
      requiredMessage,
      requiredMessageId,
      selectActive,
      selectOption,
      setInputValue,
      setOpen,
      showRequiredMessage,
      touched,
      unregisterOption,
    ],
  );

  return (
    <ComboboxContext.Provider value={contextValue}>
      <div
        {...props}
        ref={composedRef}
        data-slot="combobox"
        data-state={open ? "open" : "closed"}
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        className={cn(className)}
      >
        {children}
        {name != null ? (
          <input
            type="hidden"
            data-slot="combobox-hidden-input"
            name={name}
            value={committedValue ?? ""}
            disabled={disabled || undefined}
          />
        ) : null}
        {required && requiredMessage != null && !hasSelection ? (
          <span
            id={requiredMessageId}
            data-slot="combobox-required-message"
            role="alert"
            hidden={!showRequiredMessage}
          >
            {requiredMessage}
          </span>
        ) : null}
      </div>
    </ComboboxContext.Provider>
  );
});

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

const ComboboxInput = React.forwardRef<HTMLInputElement, ComboboxInputProps>(function ComboboxInput(
  {
    id,
    className,
    disabled: disabledProp,
    required: requiredProp,
    invalid: invalidProp,
    onBlur,
    onInvalid,
    onKeyDown,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    "aria-required": ariaRequired,
    ...props
  },
  forwardedRef,
) {
  const context = useComboboxContext("Combobox.Input");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const composedRef = useComposedRefs(forwardedRef, inputRef);

  const inputId = id ?? `${context.baseId}-input`;
  const isDisabled = context.disabled || disabledProp === true;
  const resolvedRequired = ariaRequired ?? requiredProp ?? context.required;
  const isRequired = resolvedRequired === true || resolvedRequired === "true";
  const resolvedInvalid = ariaInvalid ?? invalidProp ?? context.invalid;
  const requiredInvalid = isRequired && !context.hasCommittedSelection && context.touched;
  const describedBy =
    [ariaDescribedBy, context.showRequiredMessage ? context.requiredMessageId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  // `required` is enforced through native custom validity on this input, the
  // focusable control. Query text alone never clears it: only a committed
  // selection does. Cleanup removes the custom error on unmount and on every
  // reconfigure, so no stale validity error survives.
  const customValidityMessage = isDisabled
    ? ""
    : getRequiredValidityMessage(
        isRequired,
        context.hasCommittedSelection,
        context.requiredMessage,
      );

  useIsomorphicLayoutEffect(() => {
    const element = inputRef.current;
    if (element === null) return;
    element.setCustomValidity(customValidityMessage);
    return () => {
      element.setCustomValidity("");
    };
  }, [customValidityMessage]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Any edit invalidates the committed selection before the query changes.
    context.invalidateSelection();
    context.setInputValue(event.target.value);
    if (!isDisabled) context.openPopup();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || isDisabled) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!context.open) context.openPopup();
        context.moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!context.open) context.openPopup();
        context.moveActive(-1);
        break;
      case "Enter":
        // Select only a real active option; otherwise let the form submit.
        if (context.open && context.selectActive()) event.preventDefault();
        break;
      case "Escape":
        // Close without committing: the typed query is preserved and an
        // invalidated selection is not restored.
        if (context.open) {
          event.preventDefault();
          context.closePopup();
        }
        break;
      case "Tab":
        // Close without preventing the native focus movement.
        if (context.open) context.closePopup();
        break;
      default:
        break;
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(event);
    context.markTouched();
    context.closePopup();
  };

  const handleInvalid = (event: React.FormEvent<HTMLInputElement>) => {
    onInvalid?.(event);
    // A failed native constraint check counts as interaction, so the required
    // message and `aria-invalid` become visible from the same submit attempt.
    if (isRequired && !context.hasCommittedSelection) context.markTouched();
  };

  return (
    <input
      ref={composedRef}
      type="text"
      autoComplete="off"
      {...props}
      id={inputId}
      value={context.inputValue}
      disabled={isDisabled}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onInvalid={handleInvalid}
      role="combobox"
      aria-expanded={context.open}
      aria-controls={context.contentId}
      aria-haspopup="listbox"
      aria-autocomplete="list"
      aria-activedescendant={
        context.open && context.activeOptionId ? context.activeOptionId : undefined
      }
      aria-invalid={resolvedInvalid || requiredInvalid || undefined}
      aria-required={resolvedRequired || undefined}
      aria-describedby={describedBy}
      data-slot="combobox-input"
      data-state={context.open ? "open" : "closed"}
      className={cn(className)}
    />
  );
});

/* -------------------------------------------------------------------------- */
/* Content                                                                     */
/* -------------------------------------------------------------------------- */

const ComboboxContent = React.forwardRef<HTMLDivElement, ComboboxContentProps>(
  function ComboboxContent({ className, onMouseDown, children, ...props }, forwardedRef) {
    const context = useComboboxContext("Combobox.Content");

    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
      onMouseDown?.(event);
      // Keep focus on the combobox input while interacting with the popup.
      if (!event.defaultPrevented) event.preventDefault();
    };

    return (
      <div
        {...props}
        ref={forwardedRef}
        id={context.contentId}
        role="listbox"
        hidden={!context.open}
        data-slot="combobox-content"
        data-state={context.open ? "open" : "closed"}
        onMouseDown={handleMouseDown}
        className={cn(className)}
      >
        {children}
      </div>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Item                                                                        */
/* -------------------------------------------------------------------------- */

const ComboboxItem = React.forwardRef<HTMLDivElement, ComboboxItemProps>(function ComboboxItem(
  {
    value,
    disabled = false,
    textValue,
    className,
    children,
    onClick,
    onMouseDown,
    onMouseEnter,
    ...props
  },
  forwardedRef,
) {
  const context = useComboboxContext("Combobox.Item");
  const registrationId = React.useId();
  const elementRef = React.useRef<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(forwardedRef, elementRef);

  const { registerOption, unregisterOption, selectOption, setActiveOptionId } = context;

  const selected = context.value === value;
  const active = context.activeOptionId === registrationId;
  const resolvedTextValue = textValue ?? (typeof children === "string" ? children : value);

  useIsomorphicLayoutEffect(() => {
    registerOption({
      id: registrationId,
      value,
      disabled,
      textValue: resolvedTextValue,
      element: elementRef.current,
    });
    return () => unregisterOption(registrationId);
  }, [registerOption, unregisterOption, registrationId, value, disabled, resolvedTextValue]);

  useIsomorphicLayoutEffect(() => {
    if (active) elementRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;
    selectOption(registrationId);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(event);
    // Keep focus on the input instead of moving it to the option.
    if (!event.defaultPrevented) event.preventDefault();
  };

  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    onMouseEnter?.(event);
    if (!disabled) setActiveOptionId(registrationId);
  };

  return (
    <div
      {...props}
      ref={composedRef}
      id={registrationId}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      data-slot="combobox-item"
      data-state={selected ? "selected" : "unselected"}
      data-active={active || undefined}
      data-disabled={disabled || undefined}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      className={cn(className)}
    >
      {children}
    </div>
  );
});

ComboboxRoot.displayName = "Combobox";
ComboboxInput.displayName = "ComboboxInput";
ComboboxContent.displayName = "ComboboxContent";
ComboboxItem.displayName = "ComboboxItem";

/**
 * The unstyled Combobox compound component.
 *
 * `Combobox` is callable and carries `Combobox.Input`, `Combobox.Content`, and
 * `Combobox.Item` as static members. It owns selection/query/popup state, option
 * registration, ARIA/id relationships, arrow-key navigation, the active
 * descendant, selection invalidation on edit, native required validation,
 * native form reset (restoring uncontrolled state and clearing edit
 * invalidation unless the cancelable `reset` event was canceled), and the
 * hidden named form value. It renders no appearance of its own.
 */
export const Combobox = Object.assign(ComboboxRoot, {
  Input: ComboboxInput,
  Content: ComboboxContent,
  Item: ComboboxItem,
});

export { ComboboxContent, ComboboxInput, ComboboxItem };
