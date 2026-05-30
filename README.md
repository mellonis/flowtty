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
