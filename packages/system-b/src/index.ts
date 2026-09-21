import "./styles/index.css";
export * from "./components/index";
export * from "./tokens/index";
import { defineDesignSystemV2 } from "@prism-system/ui-core";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DropdownMenu,
  Input,
  RadioGroup,
  Select,
  Separator,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
} from "./components/index";

/** The canonical V2 component map for registry and data-driven consumers. */
export const DesignSystem = defineDesignSystemV2({
  id: "system-b",
  name: "System B",
  packageName: "@prism-system/ui-system-b",
  version: "0.1.1",
  componentContract: "v2",
  components: {
    Button,
    Input,
    Textarea,
    Card,
    Badge,
    Checkbox,
    RadioGroup,
    Switch,
    Select,
    Tabs,
    Dialog,
    DropdownMenu,
    Tooltip,
    Separator,
  },
  meta: {
    description: "A contrasty, expressive visual system with electric accents and physical motion.",
  },
});
export type DesignSystem = typeof DesignSystem;
