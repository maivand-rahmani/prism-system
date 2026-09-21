---
"@prism-system/ui-system-a": major
"@prism-system/ui-system-b": major
---

Adopt the canonical fourteen-component V2 contract (breaking public contract change).

- The public API grows from the historical eight components (`Button`, `Input`, `Card`,
  `Badge`, `Checkbox`, `Tabs`, `Dialog`, `Select`) to the canonical fourteen by adding
  `Textarea`, `RadioGroup`, `Switch`, `DropdownMenu`, `Tooltip`, and `Separator`, in
  canonical order.
- Each system declares the V2 marker (`componentContract: "v2"` /
  `defineDesignSystemV2`) and implements the new components' required compound statics
  (for example `RadioGroup.Item`, `Switch.Thumb`, `DropdownMenu.*`, `Tooltip.Content`).
- Consumers must migrate from the eight-component V1 map to the fourteen-component V2
  contract; V1 is archived and unsupported.
