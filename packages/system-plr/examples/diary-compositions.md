# Planning diary compositions

These snippets illustrate product layouts built from the public components. They are examples,
not additional contracts; state, persistence, routing, and page transitions remain in the product.
The complete day plan and review form are in [USAGE.md](../USAGE.md).

## Weekly goal card

```tsx
"use client";

import { Button, Card, Metric, Progress, Stack, Text } from "@prism-system/ui-system-plr";

export function WeeklyGoal({ onReview }: { onReview: () => void }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Read for thirty minutes</Card.Title>
        <Card.Description>One small promise, kept through the week.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Stack>
          <Metric>
            <Metric.Label>Minutes this week</Metric.Label>
            <Metric.Value>120 / 210</Metric.Value>
            <Metric.Description>Three days completed</Metric.Description>
          </Metric>
          <Progress value={120} max={210} aria-label="Weekly reading goal" />
          <Text>There is still room for a quiet chapter.</Text>
        </Stack>
      </Card.Content>
      <Card.Footer>
        <Button variant="secondary" onClick={onReview}>
          Review week
        </Button>
      </Card.Footer>
    </Card>
  );
}
```

The app may translate the copy and choose the unit. The progress indicator exposes its current
value through `role="progressbar"`; provide a useful accessible name for each report measure.

## Handwritten diary entry

The day page can show the actual written record in the system's handwriting treatment. This is
the existing `Text` contract with `variant="handwriting"`, so no local font stack or CSS copy is
needed; the bundled Caveat subsets cover Russian, English, and digits.

```tsx
import { Card, Stack, Text } from "@prism-system/ui-system-plr";

export function DiaryEntry() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Tuesday, 30 June</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack>
          <Text variant="handwriting">Утро началось с тишины. Записала 3 мысли о неделе.</Text>
          <Text variant="handwriting" lang="en">
            A quiet morning, 3 thoughts, and a walk before the rain.
          </Text>
        </Stack>
      </Card.Content>
    </Card>
  );
}
```

Use handwriting for short reflective entries only. Actions, labels, navigation, and long-form
reading stay in the default `body` style.
