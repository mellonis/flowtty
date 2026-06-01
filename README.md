# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1e (TTY frame diff). `TtyBackend` now writes only the cells that changed
since the previous frame. Adjacent changes on the same row share one cursor
move (the run flows contiguously). Style changes emit SGR only when the pen
state needs updating. **No-op repaints write nothing.** First frame + size
mismatch + terminal resize fall back to a full redraw.

This is a perf-only change — no public API additions. Interactive apps
(counter, prompt, form) that repaint per keystroke now issue a handful of
bytes per frame instead of the full ~hundreds-of-bytes redraw.

### Truecolor

`Style.fg` and `Style.bg` accept:

- Named colors (`'red'`, `'blue'`, `'white'`, …) — emit standard 30-37 / 40-47 codes.
- 3-digit hex `#rgb` (each digit doubled — `#f80` → `#ff8800`).
- 6-digit hex `#rrggbb`.
- CSS-style `rgb(R, G, B)` (each channel 0–255 integer).

24-bit color (`#…` / `rgb(…)`) emits `\x1b[38;2;R;G;Bm` (fg) / `\x1b[48;2;R;G;Bm` (bg).
Modern terminal required (iTerm2, Terminal.app, Windows Terminal, modern xterm).
Unknown values are silently ignored.

### Borders

`<Box border>` draws a one-cell border on all four edges. The cells are reserved
via Yoga's per-edge border slots, so content fits inside the ring automatically.

- `border="single"` → `┌─┐ │ │ └─┘`
- `border="double"` → `╔═╗ ║ ║ ╚═╝`
- `border="round"`  → `╭─╮ │ │ ╰─╯`
- `border="bold"`   → `┏━┓ ┃ ┃ ┗━┛`
- `border="classic"` → ASCII fallback `+-+ | | +-+`

`borderColor` accepts the same values as `color` (named, `#rrggbb`, `rgb(...)`).
Boxes smaller than 2×2 silently skip the border.

### Padding

`<Box>` accepts CSS-style padding props. Per-edge wins over axis wins over shorthand.

- `padding={n}` — all four edges
- `paddingX={n}` — left + right
- `paddingY={n}` — top + bottom
- `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` — per-edge override

Values are integer cell counts. Padding and border combine — a `<Box border="single" padding={1}>` insets content by 2 cells on each side (1 border + 1 padding). `backgroundColor` fills the full rect including padding cells.

### Margin

`<Box>` accepts CSS-style margin props. Same precedence as padding (per-edge > axis > shorthand).

- `margin={n}` — all four edges
- `marginX={n}` — left + right
- `marginY={n}` — top + bottom
- `marginTop`, `marginRight`, `marginBottom`, `marginLeft` — per-edge override

Values are integer cell counts. Negative values are allowed — Yoga supports them for overlap layouts (a child with `marginLeft={-1}` shifts one cell into its preceding sibling's space).

### Gap

`<Box>` accepts CSS-style gap props for spacing between flex children.

- `gap={n}` — both axes
- `rowGap={n}` — vertical spacing (between rows / column-flex items)
- `columnGap={n}` — horizontal spacing (between columns / row-flex items)

Per-axis wins over shorthand. Gap applies BETWEEN siblings only — no extra space at the parent's leading or trailing edge. Often cleaner than per-child `marginRight`/`marginBottom` for evenly-spaced lists.

### Flex sizing

`<Box>` accepts the three flex sizing props:

- `flexGrow={n}` — claim a share of leftover space (proportional weight; default `0`)
- `flexShrink={n}` — claim a share of deficit when siblings overflow (proportional weight; default `0`)
- `flexBasis={n | 'auto' | '50%'}` — initial size before grow/shrink applies (default `'auto'` — uses `width`/`height`)

**Defaults match Yoga, not CSS.** CSS sets `flex-shrink` to `1` by default — flowtty (via Yoga) leaves it at `0`, so children overflow rather than shrink unless `flexShrink={1}` is set explicitly. Useful when overflow is intentional; surprising if you're used to CSS.

### Flex wrap

`<Box flexWrap>` controls multi-line flex layouts. Default `'nowrap'`.

- `flexWrap="nowrap"` (default) — single line; children overflow or shrink to fit
- `flexWrap="wrap"` — children flow to additional lines when they exceed the main axis
- `flexWrap="wrap-reverse"` — same as `wrap`, but wrap lines stack in reverse cross-axis order

When wrap is on, `rowGap` controls spacing between wrap lines (perpendicular to the main axis); `columnGap` continues to control spacing between items on the same line.

### Align content

`<Box alignContent>` controls cross-axis distribution of wrap lines. Only effective when `flexWrap` is `'wrap'` or `'wrap-reverse'` AND the parent has more cross-axis space than the wrap lines need. Default `'flex-start'`.

- `'flex-start'` (default) — lines packed at cross-axis start
- `'flex-end'` — lines packed at cross-axis end
- `'center'` — lines centered
- `'space-between'` — first line at start, last at end, free space between
- `'space-around'` — equal space around each line
- `'space-evenly'` — equal space between all lines including edges
- `'stretch'` — lines stretch to fill cross-axis space

CSS deviation: CSS3 defaults `align-content` to `'stretch'` for flex; flowtty defaults to `'flex-start'` (deterministic, doesn't reflow content unexpectedly).

### zIndex

`<Box zIndex>` is an integer; higher values paint on top of lower within the same paint pass. Default `0`. Tree order is the natural tiebreaker (later sibling wins).

**Does NOT cross pass boundaries.** Stack-flow children paint first, then absolutes — an absolute with `zIndex={0}` still overlays a stack-flow with `zIndex={999}`. zIndex only reorders siblings within the same pass.

### Overflow

`<Box overflow>` controls whether descendants are clipped to this box's content rect. Default `'visible'`.

- `'visible'` (default) — descendants may extend past this box (current behavior)
- `'hidden'` — descendants clipped to content rect; ALL descendant writes (backgrounds, borders, own-text, nested children) are gated

`'hidden'` does NOT clip the box's own background or border — those are this box's own area, not its descendants' writes. Clips are intersected across nested `overflow: 'hidden'` ancestors.

### Size constraints

`<Box>` accepts four optional min/max size props that clamp Yoga's computed size:

- `minWidth={n | '50%'}` — prevents flexShrink (and content) from shrinking below this
- `maxWidth={n | '50%'}` — caps flexGrow (and explicit width) at this
- `minHeight={n | '50%'}` — column-flex analog of `minWidth`
- `maxHeight={n | '50%'}` — column-flex analog of `maxWidth`

Each accepts a cell count or a percent string. Undefined = no constraint. Useful for responsive layouts (e.g. `maxWidth: '80%'` on a content panel) and for keeping flex-grow children from claiming all available space.

### Aspect ratio

`<Box aspectRatio>` is a number representing `width / height` (CSS convention). When one dimension is constrained (via `width`, `height`, or flex sizing), Yoga derives the other from the ratio.

- `aspectRatio={2}` — twice as wide as tall (e.g., `width=10` → `height=5`)
- `aspectRatio={0.5}` — twice as tall as wide (e.g., `height=4` → `width=2`)
- `aspectRatio={1}` — square

Useful for media-style panels where you want a fixed shape regardless of container size — e.g., a flex child with `flexGrow={1} aspectRatio={3}` claims leftover horizontal space and adjusts its height to maintain a 3:1 ratio.

### Display

`<Box display>` controls whether this box (and its subtree) participates in layout. Default `'flex'`.

- `display="flex"` (default) — normal flexbox participation
- `display="none"` — box and all descendants are removed from layout and skipped by paint. Siblings reflow as if this box didn't exist. React state is preserved (unlike conditionally unmounting).

Useful for tab panels, collapsible sections, and conditional UI where remounting would lose form state, scroll position, or other ephemeral state.

### Size awareness

Two complementary primitives for components that need to know their allocated space.

**`onLayout` (per-box, nested-friendly):**

```tsx
<Box onLayout={(rect) => {/* rect = { left, top, width, height } */}}>
```

Fires after layout with this box's computed rect. Use for components inside a flexbox layout (e.g. an `<ArticleReader>` in a 70% panel needs to paginate against the panel's width, not the terminal's). **Diff before `setState`** — onLayout fires on every paint; unconditionally setting state with a new object infinite-loops:

```tsx
<Box flexGrow={1} onLayout={(r) => {
  if (!size || size.width !== r.width || size.height !== r.height) setSize(r);
}}>
```

**`useTerminalSize()` (whole terminal):**

```tsx
import { useTerminalSize } from 'flowtty';

function App() {
  const { width, height } = useTerminalSize();
  return <Box width={width} height={height}>…</Box>;
}
```

Returns the current terminal size; re-renders on `backend.onResize` (TTY) or initial-only (TestBackend / fixed-size). Useful for full-screen apps that own the terminal. For nested components, prefer `onLayout`.

### Error handling

flowtty wraps the user tree in a React error boundary AND registers process-level
`uncaughtException` / `unhandledRejection` handlers. When ANY error is caught,
flowtty calls `backend.dispose()` first (restores the terminal) and then either:

- invokes the `onError` callback if provided in `render(element, backend, { onError })`, OR
- prints the error to stderr and exits with code 1 (default).

```tsx
await render(<App />, backend, {
  onError: ({ error, source }) => {
    // source: 'react' | 'uncaughtException' | 'unhandledRejection'
    console.error(`[${source}]`, error);
    process.exit(1);
  },
});
```

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

### Root abort signal

`useRootAbortSignal()` returns the render root's `AbortSignal` — the one flowtty
fires (once) when the whole tree tears down, on both `handle.unmount()` and the
error path (just before `backend.dispose()`). It returns `null` when there's no
flowtty `render()` in scope.

```tsx
import { useRootAbortSignal } from 'flowtty';

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
root signal to async I/O for clean shutdown. A `cancelled` flag for the dialog closing plus the root signal on the `fetch` covers both.

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

### Ticker (animation clock)

`useTicker()` returns a frame counter that advances by one every `interval` ms.
It's the base clock under `<Spinner>`, `<ProgressBar>`, and elapsed-time
displays — anything that needs to repaint on a timer.

```tsx
import { useTicker, Text } from 'flowtty';

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

### Spinner

`<Spinner>` is an animated busy indicator built on `useTicker`. Mount it while
work is in flight; unmount it when done (the animation stops on unmount and on
whole-app teardown automatically).

```tsx
import { Spinner } from 'flowtty';

<Spinner />                                  // default 'dots' set
<Spinner type="line" label="Building" />     // named set + trailing label
<Spinner frames={['🌑','🌒','🌓','🌔','🌕']} interval={120} color="cyan" />
```

Props:

- `type` — named frame set: `'dots'` (default), `'line'`, `'simpleDots'`, `'arc'`, `'circle'`.
- `frames` — a custom frame list (overrides `type`); keep frames equal-width to avoid jitter.
- `interval` — ms per frame (defaults to the chosen set's natural cadence).
- `label` — optional text rendered one space after the glyph.
- `color` — applied to the spinner glyph (named / `#rrggbb` / `rgb(...)`).

The frame sets are a curated subset of the cli-spinners catalogue, inlined so
the package stays dependency-free.

### ProgressBar

`<ProgressBar>` is a determinate bar driven entirely by props — re-render with a
new `value` to advance it (it does not self-animate).

```tsx
import { ProgressBar } from 'flowtty';

<ProgressBar value={0.5} />                          // fills the row, 50%
<ProgressBar value={3} total={4} width={20} showPercent />
<ProgressBar value={done} total={files} color="green" />
```

Props:

- `value` — progress; a 0..1 fraction unless `total` is set, then it's `value / total`.
- `total` — optional denominator; the fraction is clamped to 0..1.
- `width` — fixed cell width. Omit to **fill the row** (measured via `onLayout`).
- `char` / `emptyChar` — filled / empty glyphs (default `█` / `░`).
- `color` — color of the filled portion.
- `showPercent` — append a ` NN%` readout; in fill mode it reserves its own space
  so the bar measures the remainder.

### TaskList

`<TaskList>` renders a vertical checklist where each task shows a state icon —
`◌` pending, an animated spinner while running, `✓` success, `✗` error, `↓`
skipped. It's data-driven: update a task's `state` and re-render to advance it.

```tsx
import { TaskList } from 'flowtty';

<TaskList tasks={[
  { label: 'Install deps', state: 'success' },
  { label: 'Compile',      state: 'running' },
  { label: 'Test',         state: 'error', detail: '2 failing' },
  { label: 'Deploy',       state: 'pending' },
]} />
```

Each `TaskItem` has a `label`, an optional `state` (default `'pending'`), and an
optional `detail` (dimmed text after the label). `spinnerType` picks the spinner
set used for running tasks. Running tasks animate via `<Spinner>` (and thus
`useTicker`), so they stop cleanly on unmount / teardown.

### Markdown

`<Markdown>` renders a markdown string as styled terminal text. It's a
best-effort, line-based renderer — not a CommonMark implementation — covering
the subset that reads well in a cell grid:

```tsx
import { Markdown } from 'flowtty';

<Markdown>{`
# Heading

A paragraph with **bold**, *emphasis*, \`inline code\` and a [link](https://x).

- bullet one
- bullet two

> a blockquote

\`\`\`ts
const x: number = 1;
\`\`\`
`}</Markdown>
```

Style mapping (the terminal cell model has no italic — see [Text](#text)):

| Markdown            | Rendered as                                  |
|---------------------|----------------------------------------------|
| `# … ######`        | bold + a per-level color, dim `#` prefix kept |
| `**bold**`          | bold                                         |
| `*emphasis*`        | underline (no italic in a cell grid)         |
| `` `code` ``        | cyan                                         |
| `[text](url)`       | blue + underline; url emitted as an OSC 8 hyperlink (clickable on capable backends) — see [Link](#link) |
| `![alt](src)`       | dim `alt` text (images can't render in a TTY)|
| `> quote`           | dim, with a `│ ` gutter                      |
| `- ` / `1. ` lists  | colored marker + hanging indent on wrap      |
| ` ```lang ` fences  | per-language token colors (js/ts, json)      |
| `---`               | a dim horizontal rule                        |

Emphasis is **asterisk-only** on purpose: `_` is left alone so `snake_case`
identifiers in prose aren't mangled.

**Why pre-wrap instead of leaning on Yoga's `flexWrap`?** The component lays the
markdown out into a flat list of styled *visual lines* (`layoutMarkdown(src,
width)`), each a run of styled spans, pre-wrapped to the resolved width. That
gives a stable line count, so a host that paginates by row — slicing the body by terminal height — can page
through rendered markdown exactly the way it pages raw text. `layoutMarkdown` is
exported for that use; `<Markdown>` itself just measures its width (via
`onLayout`) and renders every line. Pass an explicit `width` to skip the
measure-and-relayout paint.

> A host can open article `.md` files rendered this way by default and flip
> to a **raw source view** — the markdown source
> shown verbatim but syntax-highlighted in place (markers kept and dimmed,
> headings/lists/links/fences colored, fenced-code token-colored). That view
> uses `highlightMarkdownSource(src, width, wrap)`, the source-preserving
> counterpart to `layoutMarkdown` (it never collapses whitespace, so code
> indentation survives, and it hard-wraps rather than word-wraps).

### Link

`<Link href>` renders a terminal hyperlink. On a backend that advertises the
`hyperlinks` capability (the TTY backends, when the terminal supports it), the
label is emitted as an [OSC 8](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)
hyperlink — clickable (or ⌘/Ctrl-click) in supporting terminals. Where it can't
(a plain pipe, the headless test surface, or a terminal that ignores OSC 8 such
as Apple Terminal.app), it degrades to the styled label followed by a dim
`(url)` so the address is still reachable.

```tsx
import { Link } from 'flowtty';

<Link href="https://example.com">the docs</Link>
// capable terminal:  the docs        (clickable)
// otherwise:         the docs (https://example.com)
```

| Prop              | Default  | Notes                                                        |
|-------------------|----------|--------------------------------------------------------------|
| `href`            | —        | Target URL. Control bytes are stripped before emission.      |
| `children`        | `href`   | Visible label; falls back to the URL itself.                 |
| `color`           | `'blue'` | Label color (always underlined).                             |
| `showUrlFallback` | `true`   | Append ` (url)` when the backend can't render a clickable link and the label differs from the URL. |

`hyperlinks` is a backend **capability flag** (like `fullScreen`): omitted means
"can't", so `<Link>` degrades gracefully rather than promising a clickable link
the terminal won't honor. OSC 8 support is a property of the *terminal*, not of
stdout being a TTY, and there's no escape-sequence query for it — so the TTY
backends sniff the environment (`TERM_PROGRAM` allowlist, `VTE_VERSION`,
`WT_SESSION`, …; Apple Terminal.app is excluded). Override with
`FORCE_HYPERLINKS=1` / `=0`. The painter always emits the OSC 8 bytes; the flag
only governs `<Link>` fallback (rendered-markdown links emit OSC 8 either way).
The URL rides in the cell `Style.link`, so it threads through the same paint +
frame-diff path as visual attributes.

### Display width

`stringWidth(str)` / `charWidth(codePoint)` measure how many terminal **cells**
text occupies: 1 for most glyphs, 2 for East Asian Wide/Fullwidth and most emoji,
0 for combining marks, zero-width formatters, and control bytes. The tables (the
Markus Kuhn combining set + the East Asian Wide/Fullwidth blocks) are inlined —
no dependency. Use it to align columns or budget a row's width when laying out
your own content (it's the primitive the upcoming `<Table>` builds on).

```ts
import { stringWidth } from 'flowtty';

stringWidth('café');  // 4  (combining accent adds 0)
stringWidth('日本語'); // 6  (each ideograph is 2)
stringWidth('a😀b');  // 4
```

Measurement is per-code-point, not grapheme-aware, so an emoji ZWJ sequence
(👩‍👧) over-counts; pre-segment if you need cluster-exact widths. Expects plain
text (styling lives in the cell, not the string).

### Still deferred (later milestones)

- Wide-character **rendering**: the grid is still one cell per code point. The
  backends back the cursor up one column after a double-width glyph (measured via
  `stringWidth`) so the row stays column-aligned instead of shifting right — but
  this overlaps the glyph's second column with the next cell. Cell-accurate
  CJK/emoji layout waits on paint reserving the second cell.
- Scrolling-region optimization for log-stream apps.
- Column-only cursor moves (`CSI <col>G`) when row is unchanged — small extra perf nibble.
- Truecolor (`#rgb` / `rgb(…)`).
- Explicit `zIndex` prop, `position: 'relative'`.
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows.

### Usage with Zod

```tsx
import { z } from 'zod';
import { useState } from 'react';
import { render, TextInput, Box, Text } from 'flowtty';

const Slug = z.string().regex(/^[a-z0-9-]+$/, 'kebab-case only');

function App() {
  const [v, setV] = useState('');
  const validate = (x: string) => {
    const r = Slug.safeParse(x);
    return r.success ? null : r.error.issues[0]?.message ?? 'invalid';
  };
  return (
    <Box>
      <TextInput value={v} onChange={setV} validate={validate} onSubmit={(s) => console.log('slug:', s)} />
    </Box>
  );
}
```

### DialogHost (stack)

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

### Focus + Button

Components inside a `<FocusGroup>` can call `useFocus()` to know if they're the active focusable. Tab cycles forward, Shift-Tab backward. First registered = auto-focused.

`<DialogHost>` wraps each stack entry in an implicit `FocusGroup`, so Tab is scoped to the top dialog by default — no setup needed. Host content also gets its own implicit group.

`<Button>` is focusable. Props:

```tsx
<Button label="Open" shortcut="o" onPress={() => ...} />
```

- `Enter` when focused → `onPress()`
- `shortcut` key (anywhere in the input scope) → `onPress()` even when not focused
- Focused state: bold + inverse-video label

TextInput / Select / MultiSelect also plug into the focus system. Their `isFocused` prop becomes optional — if unset, they read from the FocusGroup. If set explicitly, the prop overrides.

Outside a FocusGroup, `useFocus()` returns `{isFocused: true}` (safe default — single component receives input as before).

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
