# @flowtty/tty-backend

The canonical TTY backend for [flowtty](https://github.com/mellonis/flowtty) — a library for building terminal apps in React.

It implements [`@flowtty/core`](https://github.com/mellonis/flowtty/tree/master/packages/core)'s `Backend` interface against a real terminal:

- Paints the cell `Buffer` to stdout using the **alt-screen**, full-frame model.
- **Frame diffing** — writes only the cells that changed since the previous frame; adjacent changes share one cursor move, and no-op repaints write nothing.
- Reads **raw input** and parses key sequences (arrows, function keys via xterm tilde sequences, Ctrl/Alt modifiers).
- Restores cooked mode and shows the cursor on `dispose()`.
- **Asks for attention** — `bell()` (rate-limited to one per second) and `notify(title, body?)`, a desktop notification posted through the terminal, with the text sanitized.

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

Also exported:

- `FinalFrameBackend` — for an app that asks nothing: it shows nothing while the app runs and prints the **last frame** once, when the app is done, into the normal screen. The report stays in the scrollback and reads the same in a pipe or in CI, without the colors. Its height defaults to `Infinity`, so the frame is as tall as its content.
- `bufferToAnsi(buffer, options)` — turns a cell `Buffer` into styled lines of text for the normal screen: no cursor addressing, no alt screen. It is what `FinalFrameBackend` prints, and what to pass as `renderToString`'s `format` to keep the styling.
- `NotInteractiveError` — what `TtyBackend` throws when its stream is not a terminal, alongside `isInteractive(stream)` for asking before rendering.

- `detectNotificationProtocol(env)`, `notificationSequence(title, body, protocol)`, `sanitizeNotificationText(text)` and `createAttention(write, options)` — the bell and desktop notifications as plain text-to-bytes, for custom backends.

Pasted text arrives as one `{ name: 'paste', text }` key (bracketed paste is enabled automatically). The third constructor argument takes the options: `{ mouse: true }` to receive `wheelup` / `wheeldown` keys — off by default because mouse reporting takes over the terminal's native text selection — and `{ notifications }` (`'auto'` by default, or `'osc9'` / `'osc777'` / `'none'`) to choose which escape sequence `notify()` uses.

For an **inline** (non-alt-screen) live region with append-only log lines above it, use [`@flowtty/inline-tty-backend`](https://github.com/mellonis/flowtty/tree/master/packages/inline-tty-backend) instead.

## See also

- [`@flowtty/react`](https://github.com/mellonis/flowtty/tree/master/packages/react) — the React adapter.
- [`@flowtty/core`](https://github.com/mellonis/flowtty/tree/master/packages/core) — the `Backend` interface and data model.
- [flowtty on GitHub](https://github.com/mellonis/flowtty) — full docs and examples.
