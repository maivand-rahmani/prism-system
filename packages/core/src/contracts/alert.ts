import type { ComponentPropsWithoutRef } from "react";

export interface AlertOwnProps {
  /**
   * ARIA live role. `"status"` (default) announces politely; `"alert"` is
   * assertive and should be reserved for important, time-sensitive messages.
   */
  role?: "status" | "alert";
}

/**
 * Alert is an inline message. Sub-components are attached as static members:
 * `Alert.Title`, `Alert.Description`.
 *
 * The root renders a native `<div>`; implementations apply the live role and
 * keep the message in the accessibility tree.
 */
export type AlertProps = AlertOwnProps & ComponentPropsWithoutRef<"div">;
export type AlertTitleProps = ComponentPropsWithoutRef<"h5">;
export type AlertDescriptionProps = ComponentPropsWithoutRef<"p">;
