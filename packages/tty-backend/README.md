# @flowtty/tty-backend

The canonical TTY backend for [flowtty](https://github.com/mellonis/flowtty) — a library for building terminal apps in React.

It implements [`@flowtty/core`](https://github.com/mellonis/flowtty/tree/master/packages/core)'s `Backend` interface against a real terminal:

- Paints the cell `Buffer` to stdout using the **alt-screen**, full-frame model.
- **Frame diffing** — writes only the cells that changed since the previous frame; adjacent changes share one cursor move, and no-op repaints write nothing.
- Reads **raw input** and parses key sequences (arrows, function keys via xterm tilde sequences, Ctrl/Alt modifiers).
- Restores cooked mode and shows the cursor on `dispose()`.

This is the backend you pass to `render()` for CLI tools and full-screen terminal apps.

## Install

```bash
npm install @flowtty/react @flowtty/tty-backend react
```

## Usage

```tsx
import { render, Box, Text } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

await render(
  <Box flexDirection="column">
    <Text bold>Hello, flowtty!</Text>
  </Box>,
  new TtyBackend(),
);
```

For an **inline** (non-alt-screen) live region with append-only log lines above it, use [`@flowtty/inline-tty-backend`](https://github.com/mellonis/flowtty/tree/master/packages/inline-tty-backend) instead.

## See also

- [`@flowtty/react`](https://github.com/mellonis/flowtty/tree/master/packages/react) — the React adapter.
- [`@flowtty/core`](https://github.com/mellonis/flowtty/tree/master/packages/core) — the `Backend` interface and data model.
- [flowtty on GitHub](https://github.com/mellonis/flowtty) — full docs and examples.
