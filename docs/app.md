# The app around the components

Starting and stopping, errors, cancellation, animation, dialogs.

- [Quitting, and work after the UI is gone](#quitting-and-work-after-the-ui-is-gone)
- [Rendering to a string](#rendering-to-a-string)
- [Error handling](#error-handling)
- [Getting attention](#getting-attention)
- [The clipboard](#the-clipboard)
- [The color scheme](#the-color-scheme)
- [Root abort signal](#root-abort-signal)
- [Ticker (animation clock)](#ticker-animation-clock)
- [DialogHost (stack)](#dialoghost-stack)

## Quitting, and work after the UI is gone

`render()` resolves to a handle:

```tsx
const app = await render(<App />, new TtyBackend());
const result = await app.waitUntilExit();   // the terminal is restored by now
console.log('picked:', result);             // prints to the normal screen
process.exit(0);
```

- `app.unmount()` tears the tree down and restores the terminal (idempotent).
- `app.waitUntilExit()` resolves once that has happened — the place to print a
  summary, flush a file or set an exit code. It resolves with the value passed to
  `exit(value)`, or `undefined` for a plain unmount, and also after a handled
  error (the error itself goes to `onError`).
- Inside a component, `useApp().exit(value?)` quits. It is safe to call from a
  key handler or an effect:

```tsx
function Menu() {
  const { exit } = useApp();
  useInput((key) => { if (key.name === 'q') exit(); });
  return <Select items={items} onSubmit={(v) => exit(v)} />;
}
```

## Rendering to a string

Not every terminal program is an app. A summary at the end of a build, a table a
script prints and forgets, an example in a README — those want one frame of
output, in the scrollback, that survives being piped into a file. `renderToString`
gives you that: it mounts the tree, lets its effects settle, takes the frame and
unmounts. Nothing stays running, and no terminal is touched.

```tsx
import { renderToString, Box, Text, Table } from '@flowtty/react';

const report = await renderToString(
  <Box border="round" padding={1} flexDirection="column">
    <Text bold>Build finished</Text>
    <Table data={rows} columns={columns} />
  </Box>,
);
console.log(report);
```

Options:

- `width` — columns to lay out in. Default `80`. Pass `process.stdout.columns`
  to match the terminal, and a fixed number when the output must not change with
  the window (a snapshot, a file).
- `height` — rows. By default there is no limit: the frame is exactly as tall as
  its content, so a 200-row table comes back in full. Give a number to lay out
  against a fixed height instead.
- `format` — turns the final `Buffer` into text. The default is plain text
  (`buffer.toString()`), which drops trailing spaces on every line. Colors and
  attributes live in the buffer's cells, not in that string, so to keep them
  pass a formatter that writes escapes:

```tsx
import { bufferToAnsi } from '@flowtty/tty-backend';

const colored = await renderToString(<Report />, {
  format: (buffer) => bufferToAnsi(buffer, { color: true }),
});
```

`bufferToAnsi` is the same painter the TTY backend uses, so the styling matches
what an app would show. It takes an options object — `color` to force escapes on
or off, `depth` to bring 24-bit colors down to what a terminal can show; see
[docs/terminal.md](terminal.md) for the depths. Passed bare
(`{ format: bufferToAnsi }`) it decides both by sniffing the environment, which
means no color at all when the output is a pipe — say `{ color: true }` when the
colors are the point.

The returned string never ends in a newline; `console.log` adds the one you want.

An error thrown anywhere in the tree rejects the promise instead of taking the
process down, so a failed report is a `catch` like any other.

The unbounded height is a backend capability, not a trick of this function: any
backend whose `size()` reports `Infinity` for the height gets a frame as tall as
its content. Percent heights then have nothing to resolve against and fall back
to auto, and `useTerminalSize()` reports `Infinity` — which is what a component
that would otherwise size itself to the screen should branch on.

For snapshot tests, `renderToString` is often all you need; `TestBackend` is for
apps you drive with input (see [docs/testing.md](testing.md)).

## Error handling

flowtty wraps the user tree in a React error boundary AND registers process-level
`uncaughtException` / `unhandledRejection` handlers. When ANY error is caught,
flowtty calls `backend.dispose()` first (restores the terminal) and then either:

- invokes the `onError` callback if provided in `render(element, backend, { onError })`, OR
- prints the error to stderr and exits with code 1 (default).

```tsx
await render(<App />, backend, {
  onError: ({ error, source }) => {
    // source: 'react' | 'uncaughtException' | 'unhandledRejection' | 'callback'
    console.error(`[${source}]`, error);
    process.exit(1);
  },
});
```

`'callback'` is a function you gave flowtty to call — `onCopy` — that threw.
It is handled here rather than left to escape: it runs on the key path, and an
exception there would leave the terminal in the alt screen with mouse reporting
still on. The key is dispatched to your `useInput` subscribers BEFORE `onCopy`
runs, so a callback of yours can never keep one from arriving.

The cleanup runs at most ONCE per render handle — subsequent errors after the
first are ignored to avoid double-disposal. Process error listeners are removed
when `handle.unmount()` is called, so multiple `render()` calls in sequence
(e.g. in tests) don't leak listeners.

**Logging errors to a file (development pattern):**

flowtty intentionally doesn't bake file-logging into the default behavior — `onError` is the escape hatch. Common pattern for development:

```tsx
import { appendFileSync } from 'node:fs';

await render(<App />, backend, {
  onError: ({ error, source }) => {
    const stamp = new Date().toISOString();
    const trace = error instanceof Error ? (error.stack ?? error.message) : String(error);
    appendFileSync('./flowtty-errors.log', `[${stamp}] [${source}] ${trace}\n\n`);
    console.error(error);
    process.exit(1);
  },
});
```

Then `tail -f flowtty-errors.log` in a second terminal during development. Adjust path / format / rotation per your needs.

Without this safety net, an unhandled error during render or in a useEffect would
leave the terminal in alt-screen mode with raw input still enabled — recovery
would require killing the shell or running `reset`.

## Getting attention

A reminder fires, a long build finishes, a deploy wants a yes — and the person is
looking at another window. Two ways to reach them, both on `useApp()` and on the
render handle:

```tsx
function Build() {
  const { bell, notify } = useApp();
  useEffect(() => {
    run().then(() => notify('Build finished', '12 packages, 0 errors'));
  }, [notify]);
  useInput((key) => { if (key.name === 'x') bell(); });
  // …
}
```

```tsx
const app = await render(<Build />, new TtyBackend());
app.notify('Build started');       // the same two, from outside the tree
```

- **`bell()`** writes BEL. Every terminal has one, and what it does is the
  person's setting: a sound, a flash, a marked tab, a bounce in the dock. It also
  travels through tmux, which turns it into a bell flag on the window in its
  status line.
- **`notify(title, body?)`** posts a desktop notification through the terminal.
  Which escape sequence carries it depends on the terminal — see
  [Terminal specifics](terminal.md#notifications) for the protocols, the
  `notifications` option, and what happens inside tmux.

**The text is sanitized.** Control characters are stripped (an embedded `ESC` or
`BEL` would end the sequence early and let the rest be read as terminal input),
newlines and runs of whitespace collapse to a single space, and each of title and
body is capped at 256 code points. Write what you mean; a log line pasted in
verbatim cannot break out.

**The bell is rate-limited** to one per second. A loop that rings it faster gets
one ring, not a buzzer — the calls in between are dropped, not queued.
Notifications are not rate-limited: one notification is one thing the person
asked to be told.

**Both are silent when there is nothing to interrupt**, and an app never has to
check which backend it is running on:

| Where | `bell()` | `notify()` |
| --- | --- | --- |
| `TtyBackend`, `InlineTtyBackend` in a terminal | rings | posts, or rings the bell where no protocol reaches the terminal |
| `InlineTtyBackend` in a pipe or CI (`logOnly`) | nothing | nothing |
| `FinalFrameBackend`, `renderToString` | nothing | nothing |
| after `unmount()` | nothing | nothing |
| `TestBackend` | counted | recorded |

Neither writes from inside `draw()`, and each goes out as a single write that
moves no cursor and changes no cell — so asking for attention between two frames
leaves a frame-diffing backend's baseline exactly as it was.

**In a test**, `TestBackend` records both instead of writing anything:

```tsx
const backend = new TestBackend(40, 3);
const app = await render(<Build />, backend);
await flushAsync(backend);
expect(backend.bells).toBe(1);
expect(backend.notifications).toEqual([{ title: 'Build finished', body: '12 packages, 0 errors' }]);
```

The recorded text is what the app passed, not what a terminal would receive —
sanitizing is a TTY backend's job (see [Testing](testing.md)).

## The clipboard

`useApp().copy(text)` puts text on the person's system clipboard, and the render
handle has the same `copy(text)` for outside the tree. A drag over the frame
copies by itself — see [Selection](input.md#selection) — and both paths report
through the same `onCopy`.

```tsx
function Doc({ source }: { source: string }) {
  const { copy } = useApp();
  const [blocks, setBlocks] = useState<MarkdownCodeBlock[]>([]);
  useInput((key) => { if (key.name === 'y') copy(blocks.at(-1)?.source ?? ''); });
  return <Markdown onCodeBlocks={setBlocks}>{source}</Markdown>;
}
```

`copy()` returns whether a clipboard sequence was actually written — false where
the terminal has none, where the text was too large for one (the backend writes
nothing rather than half of it), and after unmount. The TTY backends carry it as
OSC 52, in one write, never from inside `draw()`; see
[Terminal specifics](terminal.md#the-clipboard) for the `clipboard` option and
the size cap. flowtty only ever *writes* the clipboard — the read form of the
sequence is never emitted.

**`onCopy` fires either way**, which is the point: `delivered: false` is the
signal to reach for the platform's own tool.

```tsx
import { spawn } from 'node:child_process';

const PASTE_COMMAND = process.platform === 'darwin' ? 'pbcopy'
  : process.platform === 'win32' ? 'clip.exe'
    : 'wl-copy';

await render(<App />, backend, {
  onCopy: ({ text, delivered, source }) => {
    setToast(`copied ${text.length} chars${source === 'selection' ? '' : ' (menu)'}`);
    if (delivered) return;                       // the terminal took it
    const child = spawn(PASTE_COMMAND, { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => {});                 // no such tool here — nothing more to try
    child.stdin.end(text);
  },
});
```

If `onCopy` throws — a synchronous `spawn` of a tool that is not there — flowtty
handles it like any other error (`source: 'callback'`, see
[Error handling](#error-handling)): the terminal is restored and `onError` is
called. The key it came with has already reached the app by then.

`delivered: true` means the bytes went out, not that the clipboard changed: no
terminal answers that question, and asking would mean reading the clipboard.
Where that distinction matters — Apple Terminal has no OSC 52 at all — the table
in [Selection](input.md#selection) says what is verified.

**In a test**, `TestBackend` records the copies instead of writing any, and
`clipboardAvailable = false` stands in for a terminal without OSC 52 so the
fallback above can be exercised:

```tsx
const backend = new TestBackend(40, 3);
backend.clipboardAvailable = false;
const app = await render(<App />, backend, { onCopy });
// … drag …
expect(backend.clipboard).toEqual([]);
expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: false, source: 'selection' });
```

## The color scheme

A terminal is light or dark, and on macOS it can switch by itself — Auto
appearance goes dark after sunset, and the terminal follows. An app that paints
its own grounds picks them for one scheme; on the other, a dark modal is a black
box on a white screen. `useColorScheme()` says which scheme the terminal is on,
and re-renders when that changes:

```tsx
function Panel({ children }: { children: ReactNode }) {
  const { scheme } = useColorScheme();
  const ground = scheme === 'light' ? '#f4f0e6' : scheme === 'dark' ? '#1e1e2e' : 'default';
  return <Box border="round" padding={1} backgroundColor={ground} color={scheme === 'light' ? 'black' : 'white'}>{children}</Box>;
}
```

The value is `{ scheme, background? }`: `scheme` is `'light'`, `'dark'` or
`'unknown'`, and `background` is the terminal's default background as
`#rrggbb` when it reported one — the exact ground an app's colors sit on,
for a panel that wants to be a shade off it. `useApp().colorScheme` and the
render handle's `colorScheme` give the same answer as of now, without a
re-render; a component reads the hook, a key handler reads the app.

**`'unknown'` is a real state**, not a transient one. It is what the app sees
until the terminal answers — the TTY backends ask with the first key
subscription, and the reply comes back a moment later — and what it sees for
good where the terminal never answers: a multiplexer that eats the query, an
old terminal, `TestBackend` before a test sets it. Treat it as "leave the
grounds to the terminal": `backgroundColor: 'default'` and no text color, which
read correctly on either scheme (see [Inherited colors](layout.md#inherited-colors)).

**When a change arrives** depends on the terminal — at once where it announces
the switch, on the next focus-in where it does not, never inside some
multiplexers. [Terminal specifics](terminal.md#light-and-dark) has the table,
the sequences, and the `colorScheme` backend option that turns the whole thing
off.

**In a test**, `TestBackend` never answers by itself. `setColorScheme(scheme,
background?)` stands in for the terminal answering or switching, and every
`useColorScheme()` re-renders:

```tsx
const backend = new TestBackend(40, 5);
const app = await render(<Panel>hi</Panel>, backend);
await flushAsync(backend);                        // scheme is 'unknown': grounds left to the terminal
backend.setColorScheme('light', '#fdf6e3');
await flushAsync(backend);
expect(backend.lastBuffer!.get(1, 1).style.bg).toBe('#f4f0e6');
```

## Handing the terminal over

Open `$EDITOR` on a file, page through a diff, run `git commit`: another program
needs the real terminal — the normal screen, cooked mode, no mouse or paste
reporting — and the app needs all of it back afterwards. `suspend(fn)`, on
`useApp()` and on the render handle, does both:

```tsx
function Note({ path }: { path: string }) {
  const { suspend } = useApp();
  useInput((key) => {
    if (key.name === 'e') {
      void suspend(() => spawnSync(process.env.EDITOR ?? 'vi', [path], { stdio: 'inherit' }));
    }
  });
  // …
}
```

While `fn` runs the terminal is the child's: the alternate screen is left (an
inline app clears its live region), the cursor is shown, raw mode and every
report are off, and nothing typed reaches a `useInput` handler. When `fn`
returns — or throws; the terminal is taken back either way, and the error is
rethrown — the app repaints a full frame at whatever size the terminal is now.
Component state survives: nothing is unmounted. State updates committed
meanwhile add up to that one frame.

`suspend` resolves with what `fn` returned. One suspension at a time: a call
while another is in progress rejects. Where the backend has no terminal to hand
over (`TestBackend`, `renderToString`), `fn` simply runs; `TestBackend` records
the hand-over as `suspended` / `suspensions`, so an app can test its editor
flow — see [Testing](testing.md#sending-input).

**Ctrl+Z** does the same for the shell: the TTY backends hand the terminal
back, stop the process with `SIGTSTP`, and take the terminal again with a full
repaint when `fg` continues it. An app that uses Ctrl+Z itself — an editor's
undo — turns that off with `suspendKey: false` in the backend options, and
Ctrl+Z arrives as `{ name: 'z', ctrl: true }`. A `kill -STOP` / `fg` cycle the
app never asked for is handled the same way on `SIGCONT`.

## Root abort signal

`useRootAbortSignal()` returns the render root's `AbortSignal` — the one flowtty
fires (once) when the whole tree tears down, on both `handle.unmount()` and the
error path (just before `backend.dispose()`). It returns `null` when there's no
flowtty `render()` in scope.

```tsx
import { useRootAbortSignal } from '@flowtty/react';

function Things() {
  const signal = useRootAbortSignal();
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/things', { signal: signal ?? undefined })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => { if (e.name !== 'AbortError') throw e; });
  }, [signal]);
  // …
}
```

**Why this instead of `useEffect` cleanup?** It isn't *instead* — they solve
different problems and are meant to be used together:

- **`useEffect` cleanup (or a `cancelled` flag) is per-component.** It runs when
  *this* component unmounts — a dialog closing, a list row scrolling out of the
  window. Its job is to stop a stale `setState` from landing after the component
  is gone. It does **not** cancel the underlying work; a `fetch` whose `.then`
  is now a no-op is still holding a socket open.
- **`useRootAbortSignal()` is whole-app.** It fires only when the entire render
  root goes away (the process is exiting, or an error tore everything down). Its
  job is to cancel work *at the I/O layer* so the runtime can actually shut down
  — an in-flight `fetch` is aborted at the socket, a long timer's callback bails
  — rather than leaving the event loop alive waiting on requests nobody will
  read. It's also a ready-made cancellation token for anything that already
  speaks `AbortSignal` (`fetch`, `addEventListener`, `setTimeout` via wrappers).

So: keep your effect cleanup for per-unmount correctness, and *also* forward the
root signal to async I/O for clean shutdown. The `things-tui` example wires both
(see `ThingDetailView` — a `cancelled` flag for the dialog closing plus the root
signal on the `fetch`).

**Composing with your own controller.** Since the hook returns a plain
`AbortSignal`, you can merge it with controllers *you* own via `AbortSignal.any()`
(Node 20.3+) — the combined signal aborts when *either* source fires. This is the
clean way to fold "this component unmounted", "the user hit cancel", or "the
request timed out" into the same token as "the app is shutting down":

```tsx
const root = useRootAbortSignal();
useEffect(() => {
  const local = new AbortController();              // per-unmount / cancel button
  const signal = root ? AbortSignal.any([root, local.signal]) : local.signal;
  fetch(url, { signal })
    .then(setData)
    .catch((e) => { if (e.name !== 'AbortError') throw e; });
  return () => local.abort();                        // fires on THIS effect's cleanup
}, [url, root]);
```

That single combined signal makes the `fetch` abort on a per-component unmount
(via `local.abort()` in the cleanup) *and* on whole-app teardown (via `root`) —
collapsing the two-layer pattern above into one cancellation token. Mix in
`AbortSignal.timeout(ms)` the same way for a deadline.

**It's a signal, not a controller.** The hook hands back an `AbortSignal`, which
has no `.abort()` — only flowtty's private controller can fire it. A component
deep in the tree can observe teardown (`.aborted`, `addEventListener('abort')`,
`.throwIfAborted()`) or forward the signal, but it cannot abort the whole app.

## Ticker (animation clock)

`useTicker()` returns a frame counter that advances by one every `interval` ms.
It's the base clock under `<Spinner>`, `<ProgressBar>`, and elapsed-time
displays — anything that needs to repaint on a timer.

```tsx
import { useTicker, Text } from '@flowtty/react';

function Clock() {
  const tick = useTicker({ interval: 1000 });   // one tick per second
  return <Text>elapsed: {tick}s</Text>;
}
```

Options:

- `interval` — milliseconds between ticks (default `80`, a common animation cadence).
- `active` — when `false`, the ticker pauses and the count holds; flip back to
  `true` to resume (it does not reset). Default `true`.

The interval is torn down on unmount **and** the instant the
[root abort signal](#root-abort-signal) fires, so an animation can never keep
ticking — or keep the Node event loop alive — past the tree it belongs to. This
is the reference implementation of "an interval that respects the root signal".

## DialogHost (stack)

`<DialogHost>` lets components anywhere in its subtree open dialogs via
`useDialogHost().openDialog(element)`. Each call **pushes** a new dialog on
top of the stack — previously open dialogs stay alive, render behind the new
one, and only receive input when they become the top of the stack again.

`useDialog().done(value)` / `.cancel()` **pop** the top dialog, resolving the
`openDialog` promise it returned. Lower stack entries are untouched.

**Input gating:**

- Host content's `useInput` is muted whenever ANY dialog is open.
- Lower dialogs' `useInput` is muted while a higher dialog is on top.
- Only the topmost dialog receives keys.

**Caveat:** all dialogs share a single `dialogApi` instance — calling `done()` or `cancel()` always pops the TOP, regardless of which dialog component triggered it. Since input is gated to the top dialog, normal user-driven flows are safe; the edge case is async side-effects from a lower dialog (e.g. a useEffect / setTimeout) that calls `done` after a new dialog opened on top — it would pop the wrong entry. Wrap async work in `isMounted` guards if you need to be paranoid.

**Selection.** Each dialog is its own selection scope: a drag inside one is
confined to what the dialog says and picks up neither its border nor the content
it covers. See [Selection](input.md#selection).

**Backdrop.** `<DialogHost backdrop>` dims everything behind an open floating
dialog — the host content and any dialog below it — while the dialog itself stays
bright; `openDialog(el, { floating: true, backdrop: false })` overrides it for one
dialog. It is built on a `<Box backdrop="dim">` prop, which restyles the cells
already painted under the box instead of covering them (characters and colors
stay, `bold` is dropped). `dim` is a flag on a cell, not an opacity, so a stack of
dialogs never darkens anything twice.
