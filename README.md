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

### Still deferred (later milestones)

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
