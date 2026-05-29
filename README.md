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
