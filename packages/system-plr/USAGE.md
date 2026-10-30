# Compose with Plan Like Rahmani

These examples use the shared contract and the package's published API. Products own their
data, routes, actions, and page composition; this package owns the warm paper-and-oak surfaces,
typography, component states, and tactile feedback.

Import the stylesheet once in the application entry point:

```tsx
import "@prism-system/ui-system-plr/styles.css";
```

The system defaults to the light paper theme. Set `data-prism-theme="dark"` on the document
root to use the dark-wood palette. Literata and Manrope include Cyrillic and are loaded by the
package stylesheet; see [README.md](./README.md) for font-hosting notes.

## Day plan

This is an application composition, not a new component contract. At narrow widths, the grid
reflows and the primary action remains reachable without horizontal scrolling.

```tsx
"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Grid,
  Heading,
  Progress,
  Section,
  Stack,
  Text,
} from "@prism-system/ui-system-plr";

export function DayPlan() {
  return (
    <main>
      <Section>
        <Section.Header>
          <Section.Title>Tuesday, 30 June</Section.Title>
          <Section.Description>Make room for what matters today.</Section.Description>
        </Section.Header>
        <Section.Content>
          <Stack direction="horizontal" wrap>
            <Badge variant="secondary">3 of 5 complete</Badge>
            <Text>Two plans remain</Text>
          </Stack>
          <Progress value={60} aria-label="Today's plan progress" />
          <Grid>
            <Card>
              <Card.Header>
                <Card.Title>Morning · 09:00</Card.Title>
                <Card.Description>Quiet time for the week's first draft.</Card.Description>
              </Card.Header>
              <Card.Content>
                <Checkbox label="Write the opening page" defaultChecked />
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Afternoon · 14:30</Card.Title>
                <Card.Description>Leave a little space between meetings.</Card.Description>
              </Card.Header>
              <Card.Content>
                <Checkbox label="Review the project notes" />
              </Card.Content>
            </Card>
          </Grid>
          <Button type="button">Add a plan</Button>
        </Section.Content>
      </Section>
    </main>
  );
}
```

The displayed date and plan items are sample content. The application decides how dates,
completion, scheduling, and persistence work. Use `EmptyState` for a new day with no plans yet;
use `Alert` or `Toast` for save feedback.

## Evening review form

The product owns validation timing and the save request. The components provide readable writing
surfaces, field relationships, keyboard focus, and clear invalid feedback.

```tsx
"use client";

import * as React from "react";
import { Button, FormField, Stack, Textarea } from "@prism-system/ui-system-plr";

export function EveningReview({ onSave }: { onSave: (reflection: string) => Promise<void> }) {
  const [reflection, setReflection] = React.useState("");
  const [invalid, setInvalid] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const reflectionRef = React.useRef<HTMLTextAreaElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reflection.trim()) {
      setInvalid(true);
      reflectionRef.current?.focus();
      return;
    }
    setInvalid(false);
    setSaving(true);
    try {
      await onSave(reflection.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <FormField id="evening-reflection" required invalid={invalid} disabled={saving}>
          <FormField.Label>What felt meaningful today?</FormField.Label>
          <FormField.Control asChild>
            <Textarea
              ref={reflectionRef}
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              placeholder="A few honest lines are enough."
              rows={5}
            />
          </FormField.Control>
          <FormField.Description>
            Your review is yours; it can be changed later.
          </FormField.Description>
          {invalid && <FormField.Error>Add a reflection before saving.</FormField.Error>}
        </FormField>
        <Button type="submit" loading={saving}>
          Save review
        </Button>
      </Stack>
    </form>
  );
}
```

Add a retryable error message with `Alert` if `onSave` rejects. Keep the source of truth for
review content and any success notice in the product.

## Weekly goals and reports

Combine `Metric`, `Progress`, `Table`, and `DescriptionList` as the report requires. On mobile,
keep labels paired with values and let wide tables scroll inside an application-owned container
rather than shrinking text below a comfortable reading size. When there is no activity, show an
`EmptyState` with one clear next action instead of an empty chart.

See [`examples/diary-compositions.md`](./examples/diary-compositions.md) for additional
combinations from these three product scenarios.

## Keyboard, contrast, and motion

- Use native links and controls or the system components; don't replace keyboard behavior with
  pointer-only handlers.
- Keep the visible focus ring intact and use labels, descriptions, and error text with controls.
- Pair status color with a word, icon, or shape; color alone is not a state description.
- Component hover, press, selection, and disclosure feedback is brief and tactile. Reduced
  motion removes transitions and loading shimmer. Page and section transitions belong to the
  application, not this package.
