# Testing

A flowtty app renders into a `Backend`, and `TestBackend` is one that keeps the
frames in memory. No terminal, no snapshots of escape codes — a frame is a string,
and a cell is a character with a style.

- [A first test](#a-first-test)
- [Waiting for the frame](#waiting-for-the-frame)
- [Frames and cells](#frames-and-cells)
- [Sending input](#sending-input)
- [Driving a whole app with a script](#driving-a-whole-app-with-a-script)

## A first test

```tsx
import { render, Text, useInput } from '@flowtty/react';
import { TestBackend, flush } from '@flowtty/core/testing';

function Counter() {
  const [n, setN] = useState(0);
  useInput((key) => { if (key.name === 'up') setN((v) => v + 1); });
  return <Text>{`count ${n}`}</Text>;
}

test('up increments', async () => {
  const backend = new TestBackend(20, 3);          // columns, rows
  const app = await render(<Counter />, backend);
  backend.press({ name: 'up' });
  await flush();
  expect(backend.lastFrame).toBe('count 1');
  app.unmount();
});
```

The examples use vitest; nothing here depends on it.

## Waiting for the frame

A key handler runs synchronously, but the repaint is coalesced into a microtask.

- `await flush()` — drains microtasks. Enough after a `press` whose handler only
  calls `setState`.
- `await flushAsync(backend)` — also lets effects and their follow-up renders
  settle: it keeps yielding until two rounds in a row add no new frame. Use it
  after mount, after anything that goes through `useEffect` (a form field
  registering, a component measuring itself with `onLayout`), and whenever
  `flush()` leaves you with a stale frame. Always pass the backend: it is what
  makes the wait adaptive.
- `await flushAsync()` — the bare form waits a fixed amount (one `setTimeout(0)`)
  instead of watching for frames. It cannot settle an effect cascade, and on a
  loaded machine it can return before the repaint it was meant to wait for, so a
  test written against it passes locally and fails now and then in CI. Use it only
  where there is genuinely no backend to watch.

For work on a real timer (a spinner, a streamed reply) wait for the *text* you
expect rather than for a duration — see the script runner below.

## Frames and cells

- `backend.lastFrame` — the last frame as text, rows joined by `\n`, trailing
  spaces and trailing blank rows trimmed. `backend.frames` has every frame.
- `backend.lastBuffer` — the last frame's cells. `get(x, y)` returns
  `{ char, style }`, where `style` carries `fg`, `bg`, `bold`, `dim`,
  `underline`, `inverse`, `strikethrough`, `link`.

Assert on text for content and layout, on cells for styling:

```tsx
expect(backend.lastFrame).toBe('▸ [ ] a\n  [ ] b');
expect(backend.lastBuffer!.get(0, 0).style).toMatchObject({ fg: 'cyan', bold: true }); // the focused marker
```

The grid is one cell per code point, so `x` in `get(x, y)` is a character index
into the row — see [Display width](terminal.md#display-width).

- `backend.bells` — how many times the app rang the bell; `backend.notifications`
  — every `{ title, body? }` it posted, in order, exactly as the app passed them
  (see [Getting attention](app.md#getting-attention)).

For a component that takes no input, there is a shorter way: `renderToString`
mounts it, waits for its effects and returns the frame — a snapshot with no
backend and no unmount to remember, as tall as the content, so nothing is cut off.

```tsx
expect(await renderToString(<Report data={rows} />, { width: 60 })).toMatchSnapshot();
```

See [Rendering to a string](app.md#rendering-to-a-string). Reach for
`TestBackend` when the test presses keys.

## Sending input

```tsx
backend.press({ name: 'return' });
backend.press({ name: 'c', ctrl: true });
backend.type('hello');                 // one key per character
backend.paste('two\nlines');           // ONE 'paste' key, as a terminal delivers it
backend.wheel('down', 10, 4);          // a wheel step at cell (10, 4)
backend.mouse('down', 4, 2);           // press the left button at cell (4, 2)
backend.mouse('drag', 9, 2);           // …drag across to (9, 2)…
backend.mouse('up', 9, 2);             // …and release
```

`press()` returns whether a `useInput` handler consumed the key (returned
`true`) — the answer a TTY backend acts on to skip its Ctrl+C / Ctrl+Z default;
see [Keys and useInput](input.md#keys-and-useinput). It throws on a name no terminal produces — `'space'`, `'enter'`, `'esc'` —
and says what to use instead (`' '`, `'return'`, `'escape'`). A printable key is
named by its character; the rest come from `NAMED_KEYS`. A test that presses an
impossible name exercises a branch real input never reaches, and would pass.

`wheel()` and `mouse()` default to cell (0, 0). A `<ScrollBox>` only reacts while
the pointer is over it, so pass coordinates inside the box unless it sits at the
origin. `mouse()` takes a fourth argument, `{ button, shift, meta, ctrl, clicks }` —
`button` defaults to `'left'`, and `clicks: 2` (or `3`) on a `'down'` is the
double-click (triple-click) a TTY backend would have counted. A drag is a `'down'`, one `'drag'` per cell
crossed and an `'up'`, which is how a terminal reports one; see
[Paste and the mouse](input.md#paste-and-the-mouse).

A drag also selects and copies. The cells it covered come back with `inverse`
toggled in `lastBuffer`; the text lands in `backend.clipboard` and goes to the
`onCopy` render option, which a test can pass a spy to:

```tsx
const onCopy = vi.fn();
const backend = new TestBackend(20, 3);
await render(<App />, backend, { onCopy });
backend.mouse('down', 0, 0);
backend.mouse('drag', 4, 0);
backend.mouse('up', 4, 0);
await flush();
expect(backend.clipboard).toEqual(['hello']);
expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: true, source: 'selection' });
```

`backend.clipboard` records the text exactly as the app passed it — encoding and
the size cap are a TTY backend's job. Set `backend.clipboardAvailable = false` to
stand in for a terminal with no clipboard sequence: `copy()` then refuses,
nothing is recorded, and `onCopy` still fires with `delivered: false` — which is
how an app's `pbcopy` fallback gets tested. See [Selection](input.md#selection)
and [The clipboard](app.md#the-clipboard).

A hand-over of the terminal (`useApp().suspend(fn)` — an editor, a pager) is
recorded the same way: `backend.suspended` is true while `fn` runs, and
`backend.suspensions` counts the hand-overs. Nothing is written anywhere. See
[Handing the terminal over](app.md#handing-the-terminal-over).

The selection API works against a `TestBackend` too: `handle.select(…)`,
`selectWord`, `selectLine` return the text and put the highlight on the frame,
and `onCopy` fires with `source: 'api'`. See
[Selecting from code](app.md#selecting-from-code).

`TestBackend` never answers the light-or-dark question by itself — a component
sees `'unknown'`, as it would in a terminal that does not answer. Set the answer
to test the other branches:

```tsx
backend.setColorScheme('dark');                   // { scheme: 'dark' }, every useColorScheme() re-renders
backend.setColorScheme('light', '#fdf6e3');       // …with the background the terminal would have reported
```

Setting what is already set tells no one, as a TTY backend tells no one about an
unchanged reply. See [The color scheme](app.md#the-color-scheme).

## Driving a whole app with a script

For end-to-end tests, wrap the backend and feed it a script. The showcase in
`packages/examples/showcase` does this, and its `director.ts` is small enough to
copy:

- `ScriptedBackend` wraps any `Backend`. Drawing and size pass through; `onKey`
  delivers the real keyboard *and* keys injected with `inject()`. It also keeps
  the last frame's text.
- `play(backend, steps, { speed })` runs a list of steps — `type`, `press`,
  `paste`, `wheel`, `mouse`, `wait`, and `waitFor(text)`, which blocks until the frame
  shows that text and throws, with the frame, if it never does.

```tsx
const inner = new TestBackend(100, 30);
const backend = new ScriptedBackend(inner);
const app = await render(<App />, backend);
await play(backend, [type('Ada'), press('tab'), press('return'), waitFor('Saved ✓')], { speed: Infinity });
expect(inner.lastFrame).toContain('"Ada"');
```

Because the wrapper is just a `Backend`, the same script runs against a real
`TtyBackend` — that is how the showcase plays itself, and how its recording is
made from the very steps its tests run.
