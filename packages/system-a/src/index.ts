import "./styles/index.css";
export * from "./components/index";
export * from "./tokens/index";
import { defineDesignSystem } from "@prism-system/ui-core";
import { Button, Input, Card, Badge, Checkbox, Tabs, Select, Dialog } from "./components/index";

/** The stable V1 registry shape, useful for data-driven showcases and adapters. */
export const DesignSystem = defineDesignSystem({
  id: "system-a",
  name: "System A",
  packageName: "@prism-system/ui-system-a",
  version: "0.1.0",
  components: { Button, Input, Card, Badge, Checkbox, Tabs, Dialog, Select },
  meta: { description: "A calm, focused visual system with warm surfaces and quiet rhythm." },
});
export type DesignSystem = typeof DesignSystem;
