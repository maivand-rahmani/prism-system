"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";
import type { AvatarFallbackProps, AvatarImageProps, AvatarProps } from "@prism-system/ui-core";

type AvatarStatus = "idle" | "loading" | "loaded" | "error";

interface AvatarContextValue {
  status: AvatarStatus;
  setStatus: (status: AvatarStatus) => void;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

const AvatarRoot = React.forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { className, children, ...props },
  ref,
) {
  const [status, setStatus] = React.useState<AvatarStatus>("loading");
  const value = React.useMemo<AvatarContextValue>(() => ({ status, setStatus }), [status]);
  return (
    <AvatarContext.Provider value={value}>
      <span
        ref={ref}
        data-status={status}
        className={cn("maivand-b-ui", "maivand-b-avatar", className)}
        {...props}
      >
        {children}
      </span>
    </AvatarContext.Provider>
  );
});
AvatarRoot.displayName = "Avatar";

export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  function AvatarImage({ className, alt, onLoad, onError, ...props }, ref) {
    const context = React.useContext(AvatarContext);
    return (
      <img
        ref={ref}
        alt={alt}
        className={cn("maivand-b-avatar-image", className)}
        onLoad={(event) => {
          context?.setStatus("loaded");
          onLoad?.(event);
        }}
        onError={(event) => {
          context?.setStatus("error");
          onError?.(event);
        }}
        {...props}
      />
    );
  },
);

export const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  function AvatarFallback({ className, ...props }, ref) {
    return <span ref={ref} className={cn("maivand-b-avatar-fallback", className)} {...props} />;
  },
);

export const Avatar = Object.assign(AvatarRoot, {
  Image: AvatarImage,
  Fallback: AvatarFallback,
});

export type { AvatarProps, AvatarImageProps, AvatarFallbackProps };
