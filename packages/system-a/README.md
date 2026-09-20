# @prism-system/ui-system-a

System A is the quiet option in the Maivand component family: warm surfaces,
ink-led typography, fine borders, and restrained motion. It is intended for
products where clarity and rhythm should stay in the foreground.

```tsx
import { Button, Card, Input } from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";
```

The package exports the shared V1 primitives: `Button`, `Input`, `Card`,
`Badge`, `Checkbox`, `Tabs`, `Select`, and `Dialog`. Compound pieces such as
`CardHeader` and `DialogContent` are exported alongside their root component.
Styles are included by the package entry point and can also be imported from
`styles.css` by bundlers that keep CSS imports explicit.
