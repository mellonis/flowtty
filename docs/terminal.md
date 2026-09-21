# Terminal specifics

Color, glyph width, and what the renderer does not do yet.

- [Truecolor](#truecolor)
- [Display width](#display-width)
- [Still deferred (later milestones)](#still-deferred-later-milestones)

## Truecolor

`Style.fg` and `Style.bg` accept:

- Named colors: the 8 ANSI names (`'black'`, `'red'`, `'green'`, `'yellow'`, `'blue'`, `'magenta'`, `'cyan'`, `'white'` — codes 30-37 / 40-47), their bright variants (`'redBright'`, … — 90-97 / 100-107), and `'gray'` / `'grey'` for bright black.
  The names are exported as `NAMED_COLORS`; every color prop is typed `Color`
  (`NamedColor | string`), so editors complete them.
- 3-digit hex `#rgb` (each digit doubled — `#f80` → `#ff8800`).
- 6-digit hex `#rrggbb`.
- CSS-style `rgb(R, G, B)` (each channel 0–255 integer).

24-bit color (`#…` / `rgb(…)`) emits `\x1b[38;2;R;G;Bm` (fg) / `\x1b[48;2;R;G;Bm` (bg).
Modern terminal required (iTerm2, Terminal.app, Windows Terminal, modern xterm).
An unknown color name paints nothing; the TTY backends list such names in a
warning when they exit (never mid-frame, where it would corrupt the display).

## Display width

`stringWidth(str)` / `charWidth(codePoint)` measure how many terminal **cells**
text occupies: 1 for most glyphs, 2 for East Asian Wide/Fullwidth and most emoji,
0 for combining marks, zero-width formatters, and control bytes. The tables (the
Markus Kuhn combining set + the East Asian Wide/Fullwidth blocks) are inlined —
no dependency. Use it to align columns or budget a row's width when laying out
your own content (it's the primitive the upcoming `<Table>` builds on).

```ts
import { stringWidth } from '@flowtty/react';

stringWidth('café');  // 4  (combining accent adds 0)
stringWidth('日本語'); // 6  (each ideograph is 2)
stringWidth('a😀b');  // 4
```

Measurement is per-code-point, not grapheme-aware, so an emoji ZWJ sequence
(👩‍👧) over-counts; pre-segment if you need cluster-exact widths. Expects plain
text (styling lives in the cell, not the string).

## Still deferred (later milestones)

- Wide-character **rendering**: the grid is still one cell per code point. The
  backends back the cursor up one column after a double-width glyph (measured via
  `stringWidth`) so the row stays column-aligned instead of shifting right — but
  this overlaps the glyph's second column with the next cell. Cell-accurate
  CJK/emoji layout waits on paint reserving the second cell.
- Scrolling-region optimization for log-stream apps.
- Column-only cursor moves (`CSI <col>G`) when row is unchanged — small extra perf nibble.
- `position: 'relative'`.
- Mouse clicks / hit-testing (the wheel is supported — see [Paste and mouse wheel](input.md#paste-and-mouse-wheel)), Kitty keyboard protocol.
