# Writing a backend

A backend is where frames go and where keys come from. `render(element, backend)`
asks it for a size, hands it a cell buffer after every commit, and — if it offers
any — subscribes to its keys. Everything above that line (layout, paint,
components) is the same for every backend, which is why the test suite can use an
in-memory one.

- [The contract](#the-contract)
- [A complete backend](#a-complete-backend)
- [Wrapping a backend](#wrapping-a-backend)

## The contract

```ts
interface Backend {
  size(): { width: number; height: number };   // required — in cells
  draw(buffer: Buffer): void;                    // required — the whole frame, every time

  onKey?(handler: (key: Key) => void): () => void;   // returns an unsubscribe
  onResize?(handler: () => void): () => void;        // call it when size() would change
  dispose?(): void;                                  // undo whatever the constructor did
  printStatic?(lines: string[]): void;               // permanent lines above a live region
  fullScreen?: boolean;                              // false = a bounded region, not the whole screen
  hyperlinks?: boolean;                              // the terminal honors OSC 8
}
```

Only `size` and `draw` are required; everything else is feature-detected.

- **`draw`** gets a `Buffer` of cells — `get(x, y)` → `{ char, style }`,
  `toString()` for plain text. It always receives the whole frame; diffing against
  the previous one is the backend's business (`TtyBackend` does, and writes only
  what changed).
- **`onKey`** delivers `Key` objects: `{ name, sequence, ctrl, meta, shift }`, plus
  `text` for a paste and `x` / `y` for the mouse. Without it the app is a passive
  view and `useInput` handlers never fire. `decodeKeys` from
  `@flowtty/tty-backend` turns raw stdin bytes into keys, if your source is a
  byte stream.
- **`dispose`** is where a terminal is put back the way it was found. `render()`
  calls it on unmount, on an unhandled error, and on `SIGTERM` / `SIGHUP` /
  `SIGINT`. Make it idempotent.
- **`fullScreen: false`** tells components that want the whole screen (`Menu`, a
  non-floating dialog) that they don't have it.
- **`printStatic`** is what `<Static>` calls; without it `<Static>` does nothing.

## A complete backend

This one is for the case where there is no terminal at all: nothing is shown
while the app runs, and the last frame is printed as plain text at the end.

```ts
import type { Backend, Buffer } from '@flowtty/react';

/**
 * A backend for when there is no terminal: it shows nothing while the app runs,
 * and prints the LAST frame as plain text when the app is done. Enough for
 * `mycli --report | tee log` — the same components, one static page.
 *
 * It implements only what the contract requires (`size`, `draw`) plus `dispose`.
 * No `onKey`: nobody is typing, so `useInput` handlers simply never fire.
 */
export class FinalFrameBackend implements Backend {
  // Not a full-screen surface: components that need one (Menu, non-floating
  // dialogs) check this flag and step aside.
  readonly fullScreen = false;
  private last = '';

  constructor(
    private readonly columns = 80,
    private readonly rows = 24,
    private readonly write: (text: string) => void = (text) => { process.stdout.write(text); },
  ) {}

  size(): { width: number; height: number } {
    return { width: this.columns, height: this.rows };
  }

  // Called after every commit with the whole frame. A real terminal backend
  // diffs it against the previous one; this one just remembers it.
  draw(buffer: Buffer): void {
    this.last = buffer.toString();
  }

  // render()'s unmount — and its error and signal paths — end here.
  dispose(): void {
    if (this.last !== '') this.write(`${this.last}\n`);
    this.last = '';
  }
}
```

```tsx
import React from 'react';
import { test, expect } from 'vitest';
import { render, Box, Text } from '@flowtty/react';
import { FinalFrameBackend } from './FinalFrameBackend.js';

test('prints nothing while running, and the last frame as plain text on unmount', async () => {
  const written: string[] = [];
  const backend = new FinalFrameBackend(20, 4, (t) => written.push(t));
  const app = await render(
    <Box flexDirection="column" border="round" width={20}>
      <Text color="green" bold>3 passed</Text>
      <Text dim>0 failed</Text>
    </Box>,
    backend,
  );
  expect(written).toEqual([]);
  app.unmount();
  expect(written.join('')).toBe('╭──────────────────╮\n│3 passed          │\n│0 failed          │\n╰──────────────────╯\n');
  expect(written.join('')).not.toContain('\x1b');
});
```

## Wrapping a backend

Because a backend is just an object, behavior is added by wrapping one. The
showcase's
[`ScriptedBackend`](../packages/examples/showcase/director.ts) forwards `size` and
`draw` to a real backend and delivers, through `onKey`, both the real keyboard and
keys it injects itself — that is how the showcase plays itself on a terminal and,
with a `TestBackend` inside, in the test suite. The same shape gives you a backend
that records frames, throttles repaints, or mirrors the screen somewhere else.

When wrapping, forward the optional members only if the inner backend has them
(`onResize`, `printStatic`), and copy the `fullScreen` / `hyperlinks` flags —
components feature-detect all of these.
