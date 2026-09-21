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
  `flush()` leaves you with a stale frame. Pass the backend — without it, it is a
  single `setTimeout(0)`.

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
```

`press()` throws on a name no terminal produces — `'space'`, `'enter'`, `'esc'` —
and says what to use instead (`' '`, `'return'`, `'escape'`). A printable key is
named by its character; the rest come from `NAMED_KEYS`. A test that presses an
impossible name exercises a branch real input never reaches, and would pass.

`wheel()` defaults to cell (0, 0). A `<ScrollBox>` only reacts while the pointer
is over it, so pass coordinates inside the box unless it sits at the origin.

## Driving a whole app with a script

For end-to-end tests, wrap the backend and feed it a script. The showcase in
`packages/examples/showcase` does this, and its `director.ts` is small enough to
copy:

- `ScriptedBackend` wraps any `Backend`. Drawing and size pass through; `onKey`
  delivers the real keyboard *and* keys injected with `inject()`. It also keeps
  the last frame's text.
- `play(backend, steps, { speed })` runs a list of steps — `type`, `press`,
  `paste`, `wheel`, `wait`, and `waitFor(text)`, which blocks until the frame
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
