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

  onKey?(handler: (key: Key) => unknown): () => void;  // returns an unsubscribe; true from the handler = consumed
  onResize?(handler: () => void): () => void;        // call it when size() would change
  dispose?(): void;                                  // undo whatever the constructor did
  printStatic?(lines: string[]): void;               // permanent lines above a live region
  bell?(): void;                                     // BEL — the portable "over here"
  notify?(title: string, body?: string): void;       // a desktop notification
  copy?(text: string): boolean;                      // put text on the clipboard
  suspend?(): void;                                  // hand the terminal to another program
  resume?(): void;                                   // take it back, drop the diff baseline, repaint
  fullScreen?: boolean;                              // false = a bounded region, not the whole screen
  hyperlinks?: boolean;                              // the terminal honors OSC 8
}
```

Only `size` and `draw` are required; everything else is feature-detected.

- **`draw`** gets a `Buffer` of cells — `get(x, y)` → `{ char, style }`,
  `toString()` for plain text. It always receives the whole frame; diffing against
  the previous one is the backend's business (`TtyBackend` does, and writes only
  what changed).
  A cell's `char` is one grapheme cluster, or `''` for the second column of a
  wide cluster (CJK, emoji) in the cell to its left: write the lead and skip
  the `''` cell — the terminal advanced two columns when it drew the lead. A
  backend that diffs frames must remember that: after a wide cluster at `x`,
  the cell at `x + 2` is the adjacent one. A backend also tells the grid how
  its terminal measures: `setWidthPolicy('cluster' | 'codepoint')` from
  `@flowtty/core`, with `detectWidthPolicy(env)` from `@flowtty/tty-backend`
  as the rule for known terminals. See docs/terminal.md (display width).
- **`onKey`** delivers `Key` objects: `{ name, sequence, ctrl, meta, shift }`, plus
  `text` for a paste, `x` / `y` for the mouse and `button` for a mouse key that
  names one (see docs/input.md, the mouse). Without it the app is a passive
  view and `useInput` handlers never fire. `decodeKeys` from
  `@flowtty/tty-backend` turns raw stdin bytes into keys, if your source is a
  byte stream. A handler that returns `true` has consumed the key: deliver to
  the subscribers first and apply any default of yours — the TTY backends exit
  on Ctrl+C / Ctrl+D and suspend on Ctrl+Z — only when none did; see
  [Keys and useInput](input.md#keys-and-useinput).
- **`dispose`** is where a terminal is put back the way it was found. `render()`
  calls it on unmount, on an unhandled error, and on `SIGTERM` / `SIGHUP` /
  `SIGINT`. Make it idempotent.
- **`fullScreen: false`** tells components that want the whole screen (`Menu`, a
  non-floating dialog) that they don't have it.
- **`printStatic`** is what `<Static>` calls; without it `<Static>` does nothing.
- **`bell`** and **`notify`** are what `useApp().bell()` / `.notify(…)` call, for
  an app asking for attention while the person looks at another window. Omit them
  and those calls are silent. If you implement them: sanitize the text, rate-limit
  the bell, write each as ONE write and never from inside `draw()` — that keeps a
  frame-diffing baseline valid. `createAttention(write, options)` from
  `@flowtty/tty-backend` does all of that; see
  [Terminal specifics](terminal.md#notifications).
- **`copy`** is what `useApp().copy(text)` and copy-on-select call. Return
  whether a clipboard sequence was actually written — `false` is not a failure
  to hide, it is the signal an app falls back on (`pbcopy`, `wl-copy`,
  `clip.exe`), so report it honestly and never report `true` for a text you
  truncated. Same rules as the two above: ONE write, never from inside `draw()`.
  And write-only — never emit the form of the sequence that asks the terminal to
  hand the clipboard back. `createClipboard(write, options)` from
  `@flowtty/tty-backend` does all of that; see
  [Terminal specifics](terminal.md#the-clipboard).
- **`suspend`** and **`resume`** are what `useApp().suspend(fn)` calls around
  `fn`, and what Ctrl+Z uses. `suspend` undoes what the constructor and `onKey`
  did — leave the alternate screen or clear the live region, show the cursor,
  turn reports off, leave raw mode, and stop reading input, so nothing typed
  into the child reaches a subscriber. `resume` redoes it, forgets any
  frame-diff baseline (the next `draw` must be a full frame) and calls the
  `onResize` subscribers — that is what makes the app repaint, and the terminal
  may well have been resized meanwhile. Make `dispose` after `suspend` write
  nothing: the terminal is not yours then. Omit both where there is no terminal
  to hand over; `render()` then runs `fn` and nothing else.

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
export class LastFrameBackend implements Backend {
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
import { LastFrameBackend } from './LastFrameBackend.js';

test('prints nothing while running, and the last frame as plain text on unmount', async () => {
  const written: string[] = [];
  const backend = new LastFrameBackend(20, 4, (t) => written.push(t));
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

The library ships this backend grown up: `FinalFrameBackend` from
`@flowtty/tty-backend` keeps the styling, sizes the frame to its content and
prints deferred warnings after it — see
[Terminal specifics](terminal.md#which-backend-for-which-app).

## Wrapping a backend

Because a backend is just an object, behavior is added by wrapping one. The
showcase's
[`ScriptedBackend`](../packages/examples/showcase/director.ts) forwards `size` and
`draw` to a real backend and delivers, through `onKey`, both the real keyboard and
keys it injects itself — that is how the showcase plays itself on a terminal and,
with a `TestBackend` inside, in the test suite. The same shape gives you a backend
that records frames, throttles repaints, or mirrors the screen somewhere else.

When wrapping, forward the optional members only if the inner backend has them
(`onResize`, `printStatic`, `bell`, `notify`), and copy the `fullScreen` /
`hyperlinks` flags — components feature-detect all of these.
