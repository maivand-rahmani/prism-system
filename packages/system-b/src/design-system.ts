import { defineDesignSystemV4 } from "@prism-system/ui-core";
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Container,
  Dialog,
  DropdownMenu,
  FormField,
  Heading,
  Input,
  Link,
  RadioGroup,
  Section,
  Select,
  Separator,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  Toast,
  Tooltip,
} from "./components/index.js";

/**
 * Canonical V4 runtime map for System B.
 *
 * The twenty required V4 components plus exactly the optional capabilities this
 * system implements: `Section`, `Alert`, `Skeleton`, `Toast`, `Avatar`, and
 * `Breadcrumbs`. Omitted optional components are simply unavailable; there are
 * no empty stubs. The component map mirrors `design-system.source.json`.
 */
export const DesignSystem = defineDesignSystemV4({
  id: "system-b",
  name: "System B",
  packageName: "@prism-system/ui-system-b",
  version: "2.0.0",
  componentContract: "v4",
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
    Heading,
    Text,
    Link,
    Container,
    Stack,
    FormField,
    Section,
    Alert,
    Skeleton,
    Toast,
    Avatar,
    Breadcrumbs,
  },
  meta: {
    description: "A contrasty, expressive V4 system with electric accents and physical motion.",
    design: {
      density: "compact",
      theme: "dark-first",
      radius: "small",
      keywords: ["dark-first", "high-contrast", "expressive", "editorial", "physical motion"],
    },
    rules: {
      allowArbitraryColors: false,
      allowArbitraryRadius: false,
      allowArbitraryShadows: false,
      allowPrimitiveDuplication: false,
    },
  },
});
export type DesignSystem = typeof DesignSystem;
