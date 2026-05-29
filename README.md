# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1a (interactivity infrastructure). Keyboard input now reaches components via
`useInput`, React state updates trigger repaints automatically, and the test
backend (`flowtty/testing`) can inject synthetic keys with `press`/`type` +
`flush`. Root Yoga nodes are freed on `unmount` (the M0 leak is fixed).

### Still deferred (will land in later milestones)

- TTY-backend stdin raw-mode + key parsing — synthetic keys via TestBackend
  work today; real-terminal interactivity ships with M1c.
- Frame diffing — the TTY backend still does a full redraw each `draw()`.
- `<Text>` ignores layout props (sized by a Yoga measure func).
- Element-level styling — the React → paint path still hardcodes empty style;
  cell `Style` + `sgr()` + TTY SGR output remain reachable only from a
  hand-built `Buffer`.
- `<TextInput>` / `<Select>` / `<MultiSelect>` / `<Confirm>` / `<Form>` —
  prompt primitives ship in M1b and M1c.

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
