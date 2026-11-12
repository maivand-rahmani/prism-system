---
"@prism-system/ui-core": minor
"@prism-system/ui-system-plr": minor
"@prism-system/tools": minor
---

Add fourteen optional component contracts and their Plan Like Rahmani implementations:
Popover, AlertDialog, ToggleGroup, Toolbar, TagGroup, ListBox, TreeView, TimeField,
SearchField, CheckboxGroup, RangeSlider, DateRangePicker, Spinner, and FileDropzone.
The twenty-nine required components and optional omission semantics are unchanged.

Update `prism-ds` to recognize the expanded catalog and improve narrow-terminal
confirmation, project details, and large-catalog navigation. Older `prism-ds` versions
reject manifests containing the new component names; upgrade the CLI before installing
or upgrading to a design system that declares them.
