# flowtty

React for the terminal. A `react-reconciler` host over Yoga flexbox lays out
`<Box>` and `<Text>`, paints them into a cell buffer, and writes that buffer to a
backend — a full-screen TTY, an inline live region, or an in-memory surface for
tests.

![The flowtty showcase playing itself: layout, a form, a table with markdown, progress, a chat, dialogs, and snake](docs/showcase.gif)

> Reconciliation is React's and layout is Yoga's — both proven. flowtty adds what
> sits between them and the terminal: a cell renderer with frame diffing, the
> input layer, and the components and patterns for building an actual app —
> forms, dialogs, scrolling, a chat-style input, a test backend.

## Quick start

```bash
npm install @flowtty/react @flowtty/tty-backend react
```

```tsx
import React, { useState } from 'react';
import { render, Box, Text, useApp, useInput } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

function Counter() {
  const { exit } = useApp();
  const [count, setCount] = useState(0);
  useInput((key) => {
    if (key.name === 'up') setCount((n) => n + 1);
    if (key.name === 'down') setCount((n) => n - 1);
    if (key.name === 'q') exit(count);
  });
  return (
    <Box flexDirection="column" border="round" borderTitle=" counter " paddingX={1} width={34}>
      <Text bold color={count < 0 ? 'red' : 'green'}>{String(count)}</Text>
      <Text dim>↑ / ↓ change it · q quits</Text>
    </Box>
  );
}

const app = await render(<Counter />, new TtyBackend());
console.log('final count:', await app.waitUntilExit());
```

Run it with `tsx`, Bun, or anything that compiles TSX; it also works as a
`bun build --compile` single-file binary. `useInput` gets every key as a plain
object, `useApp().exit(value)` quits, and `waitUntilExit()` resolves once the
terminal is back to normal — so the last line prints on the ordinary screen.

## What's inside

| | |
|---|---|
| **Layout** | flexbox via Yoga, borders with titles, padding / margin / gap, wrap, absolute positioning, `zIndex`, `overflow`, scroll viewports, a dimming backdrop — [docs/layout.md](docs/layout.md) |
| **Components** | `ScrollBox`, `TextInput`, `TextArea`, `Select`, `MultiSelect`, `Table`, `Markdown` (GFM tables, nested lists, highlighted code), `Spinner`, `ProgressBar`, `TaskList`, `Link`, `Static` — [docs/components.md](docs/components.md) |
| **Input, focus, forms** | keys with modifiers, bracketed paste as one event, the mouse wheel, `FocusGroup` + `Button`, `Form` with validation (Zod-friendly) — [docs/input.md](docs/input.md) |
| **The app around them** | `render` / `waitUntilExit` / `useApp().exit`, error handling, a root abort signal, a ticker for animation, `DialogHost` with stacked dialogs — [docs/app.md](docs/app.md) |
| **Testing** | `TestBackend`: frames as strings, cells with styles, `press` / `paste` / `wheel`; scripts that drive a whole app — [docs/testing.md](docs/testing.md) |
| **Terminal specifics** | named and 24-bit color, glyph width, OSC 8 hyperlinks, what is not there yet — [docs/terminal.md](docs/terminal.md) |

Packages: [`@flowtty/react`](packages/react) (components, hooks, `render`),
[`@flowtty/core`](packages/core) (buffer, layout, paint, reducers, `TestBackend`),
[`@flowtty/tty-backend`](packages/tty-backend) (alt screen, keys, mouse),
[`@flowtty/inline-tty-backend`](packages/inline-tty-backend) (a live region with
an append-only log above it).

## Showcase

```bash
npm run showcase            # a self-playing tour: layout, forms, table + markdown,
                            # progress, a chat, dialogs, and a game of snake
```

It plays itself — a script types, tabs and scrolls through seven scenes — and
hands over the keys the moment you press one (`Ctrl+G` gives them back, `Ctrl+N` /
`Ctrl+P` change scene). It needs a 100×30 terminal. `--speed 2`, `--manual`,
`--loop` and `--exit` are there too.

The script is an ordinary list of steps (`type`, `press`, `paste`, `wheel`,
`waitFor`) fed through a `Backend` wrapper, so the very same script runs against
`TestBackend` in the test suite: what gets recorded is what gets tested.
`npm run showcase:record` runs it in a pseudo-terminal, saves every byte it prints
with its timestamp as `docs/showcase.cast` (an asciicast — replay it with
`asciinema play`), and renders `docs/showcase.gif` with `agg`. No browser and no
screen capture are involved.

## Status

Alpha — `1.0.0-alpha.x` on npm. APIs can still change between alphas; each
release's notes list what breaks. Runs on Node and Bun.

Not there yet: cell-accurate wide glyphs (a CJK or emoji glyph takes one grid
cell, so text after it overlaps its right half), mouse clicks, the Kitty keyboard
protocol — see [what is deferred](docs/terminal.md#still-deferred-later-milestones).

## License

MIT
