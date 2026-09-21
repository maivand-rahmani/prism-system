import * as React from "react";
import { Badge as BadgeA, Button as ButtonA, Card as CardA } from "@prism-system/ui-system-a";
import { Badge as BadgeB, Button as ButtonB, Card as CardB } from "@prism-system/ui-system-b";

/**
 * The same product composition rendered with each supported design system. The
 * product owns layout and composition; the design system owns the visual
 * language. Both systems are imported by public package name only.
 */
export function DashboardWithSystemA() {
  return (
    <CardA>
      <CardA.Header>
        <CardA.Title>Dashboard</CardA.Title>
      </CardA.Header>
      <CardA.Content>
        <BadgeA variant="success">Live</BadgeA>
        <ButtonA variant="primary">Refresh</ButtonA>
      </CardA.Content>
    </CardA>
  );
}

export function DashboardWithSystemB() {
  return (
    <CardB>
      <CardB.Header>
        <CardB.Title>Dashboard</CardB.Title>
      </CardB.Header>
      <CardB.Content>
        <BadgeB variant="success">Live</BadgeB>
        <ButtonB variant="primary">Refresh</ButtonB>
      </CardB.Content>
    </CardB>
  );
}
