# Writing a component

A flowtty component is a React component. There is no base class and nothing to
register: it returns `<Box>` and `<Text>`, reads keys with `useInput`, and joins
the focus order with `useFocus`. This page builds one — a `Stepper` you nudge with
←/→ — and tests it. Both files are real and live in
[`packages/examples/extending`](../packages/examples/extending).

- [The component](#the-component)
- [What to notice](#what-to-notice)
- [The test](#the-test)

## The component

```tsx
import React, { useState } from 'react';
import { Box, Text, useFocus, useInput, type Color } from '@flowtty/react';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Color of the filled part. */
  color?: Color;
  /** Override focus; by default the enclosing <FocusGroup> decides. */
  isFocused?: boolean;
}

/** A number you nudge with ←/→, drawn as a bar that fills the width it is given. */
export function Stepper({ value, onChange, min = 0, max = 10, color = 'cyan', isFocused: forced }: StepperProps) {
  // 1. Focus: register with the FocusGroup; outside one, useFocus() says "focused".
  const { isFocused: groupFocus } = useFocus();
  const isFocused = forced ?? groupFocus;

  // 2. Input: only while focused. Handle the keys you own, ignore the rest.
  useInput((key) => {
    if (key.name === 'left') onChange(Math.max(min, value - 1));
    if (key.name === 'right') onChange(Math.min(max, value + 1));
  }, { isActive: isFocused });

  // 3. Size: onLayout reports the width the layout gave us. It fires on EVERY
  //    paint, so only set state when the number actually changed.
  const [width, setWidth] = useState(0);
  const filled = Math.round(((value - min) / (max - min)) * width);

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={isFocused ? color : undefined} bold={isFocused}>{isFocused ? '▸' : ' '}</Text>
      {/* A box stacks its children in a COLUMN unless told otherwise — and <Text> is a
          box, not an inline span — so two runs on one line need flexDirection="row". */}
      <Box flexDirection="row" flexGrow={1} flexShrink={1} onLayout={(r) => { if (r.width !== width) setWidth(r.width); }}>
        <Text color={color}>{'█'.repeat(filled)}</Text>
        <Text dim>{'░'.repeat(Math.max(0, width - filled))}</Text>
      </Box>
      <Text>{String(value).padStart(String(max).length)}</Text>
    </Box>
  );
}
```

## What to notice

- **Focus.** `useFocus()` registers the component with the enclosing
  `<FocusGroup>`, which moves focus on Tab / Shift+Tab in mount order. Outside a
  group it reports `true`, so a lone component just works. Take an `isFocused`
  prop that overrides it — every built-in input does.
- **Show the focus.** A component that looks the same focused and unfocused loses
  the user the moment they Tab onto it. A colored marker, bold, or `inverse` —
  pick one and keep the *text* identical, so nothing shifts.
- **Input.** `useInput(handler, { isActive })` — pass `isActive: isFocused`, or
  every instance on screen reacts to the same key. Handle the keys you own and
  leave the rest alone: a key name is a character (`' '`, `':'`) or one of
  `NAMED_KEYS` — there is no `'space'` or `'enter'` ([keys](input.md)).
- **Size.** `onLayout` gives the rectangle the layout assigned. It fires on every
  paint, so compare before `setState` or you loop forever.
- **Layout defaults are Yoga's, not CSS's.** A box is a *column* by default, and
  `<Text>` is a box — two runs on one line need `flexDirection="row"`.
  `flexShrink` is `0`: without `flexShrink={1}` the bar would keep its natural
  width and overflow ([layout](layout.md)).
- **Width is counted in code points**, one cell each — `'█'.repeat(n)` is `n`
  cells ([display width](terminal.md#display-width)).
- **Types.** An exported function needs an explicit return type only inside the
  `@flowtty/*` packages (their declarations are generated without a type
  checker); in your own code it is up to you.

## The test

```tsx
import React, { useState } from 'react';
import { test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { Stepper } from './Stepper.js';

function Host({ focused = true }: { focused?: boolean }) {
  const [v, setV] = useState(5);
  return <Stepper value={v} onChange={setV} isFocused={focused} />;
}

test('→ fills the bar, ← empties it, and the value stays within bounds', async () => {
  const backend = new TestBackend(16, 1);
  const app = await render(<Host />, backend);
  await flushAsync(backend);                       // the bar measures itself first
  expect(backend.lastFrame).toBe('▸ ██████░░░░░  5');

  backend.press({ name: 'right' });
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('▸ ███████░░░░  6');

  for (let i = 0; i < 20; i++) backend.press({ name: 'right' });
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('▸ ███████████ 10'); // clamped at max
  app.unmount();
});

test('unfocused: no marker, keys ignored', async () => {
  const backend = new TestBackend(16, 1);
  const app = await render(<Host focused={false} />, backend);
  await flushAsync(backend);
  backend.press({ name: 'right' });
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('  ██████░░░░░  5');
  // Style lives in the cells: the filled part is cyan, the rest dim.
  expect(backend.lastBuffer!.get(2, 0).style.fg).toBe('cyan');
  expect(backend.lastBuffer!.get(8, 0).style.dim).toBe(true);
  app.unmount();
});
```

`flushAsync(backend)` after mount lets the bar measure itself and repaint; after a
key it is `flush()`'s more patient sibling — see [Testing](testing.md). Text
assertions cover content and layout; `lastBuffer.get(x, y).style` covers color.
