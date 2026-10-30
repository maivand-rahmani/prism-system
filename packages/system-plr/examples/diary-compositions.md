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
