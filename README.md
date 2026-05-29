# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M0 (renderer core). Not yet usable for real apps — see the design + plan docs.

## M0 limitations (deliberate, will be addressed in later milestones)

- No repaint on React state updates — `render()` paints once.
- No frame diffing — the TTY backend does a full redraw each `draw()`.
- Root Yoga nodes are not freed on `unmount()` (M0 is render-once-then-exit).
- `Text` ignores layout props (sized by a Yoga measure func).
- **No way to set style (color/bold/etc.) from React elements yet** — the cell `Style`, ANSI `sgr()` serializer, and TTY-backend SGR output are all in place, but the React→paint path hardcodes empty style. Element-level styling lands in a later milestone.

## Usage (M0)

```tsx
import { createElement } from 'react';
import { render, Box, Text, TtyBackend } from 'flowtty';

await render(
  createElement(Box, { flexDirection: 'row' },
    createElement(Box, { width: 6 }, createElement(Text, null, 'hello')),
    createElement(Box, { width: 6 }, createElement(Text, null, 'world')),
  ),
  new TtyBackend(),
);
```
