# Terminal specifics

Color, glyph width, and what the renderer does not do yet.

- [Truecolor](#truecolor)
- [Display width](#display-width)
- [Environment](#environment)
- [Still deferred (later milestones)](#still-deferred-later-milestones)

## Truecolor

`Style.fg` and `Style.bg` accept:

- Named colors: the 8 ANSI names (`'black'`, `'red'`, `'green'`, `'yellow'`, `'blue'`, `'magenta'`, `'cyan'`, `'white'` — codes 30-37 / 40-47), their bright variants (`'redBright'`, … — 90-97 / 100-107), and `'gray'` / `'grey'` for bright black.
  The names are exported as `NAMED_COLORS`; every color prop is typed `Color`
  (`NamedColor | string`), so editors complete them.
- 3-digit hex `#rgb` (each digit doubled — `#f80` → `#ff8800`).
- 6-digit hex `#rrggbb`.
- CSS-style `rgb(R, G, B)` (each channel 0–255 integer).

On a truecolor terminal a `#…` / `rgb(…)` color is emitted as 24-bit SGR
(`\x1b[38;2;R;G;Bm` / `\x1b[48;2;R;G;Bm`). Elsewhere it is **brought down to what
the terminal can show**: the nearest entry of the xterm 256-color palette (the
6×6×6 cube or the gray ramp, whichever is closer — `38;5;N`), or the nearest of
the 16 ANSI colors. Named colors are 16-color codes at any depth.

The depth comes from the environment (`detectColorDepth`): truecolor when
`COLORTERM` is `truecolor` / `24bit` or `TERM` is one of the truecolor-by-name
terminals (kitty, alacritty, wezterm, ghostty, `*-direct`); 256 colors when `TERM`
contains `256color`; otherwise 16. Truecolor is only assumed where it is
*announced* — a 24-bit sequence sent to a 256-color terminal gives wrong colors,
while 256 colors on a truecolor terminal are merely a little duller. If your
terminal supports truecolor but says nothing, set `COLORTERM=truecolor`, or
`FORCE_COLOR=3` (`1` = 16 colors, `2` = 256). Both TTY backends also take a
`colorDepth` option (`4`, `8` or `24` bits); `rgbToAnsi256` / `rgbToAnsi16` are
exported for custom backends.

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

## Environment

**Not a terminal** — stdout is piped or redirected, the app runs in CI, or
`TERM=dumb`. `isInteractive(stream)` (from `@flowtty/tty-backend`) is the test,
and the two backends apply it differently, because the two kinds of app differ:

- **`TtyBackend` refuses**, with an error that says why, before writing a single
  byte — so a log never fills with control sequences. A full-screen app cannot
  degrade on its own: there is nowhere to repaint and no keys to read, and what a
  piped run should print is the app's call. Branch first:

  ```ts
  if (!isInteractive(process.stdout)) { printPlainReport(); process.exit(0); }
  await render(<App />, new TtyBackend());
  ```

  The refusal is a `NotInteractiveError` (exported from `@flowtty/tty-backend`),
  so an app that would rather not ask first can catch it instead. `error.reason`
  is the short why — `'TERM=dumb'`, or stdout not being a terminal:

  ```tsx
  try { await render(<App />, new TtyBackend()); }
  catch (error) {
    if (!(error instanceof NotInteractiveError)) throw error;
    (await render(<Report />, new FinalFrameBackend())).unmount();
  }
  ```

- **`InlineTtyBackend` degrades**, the way build tools do in CI. An inline app
  has already split its output into permanent lines (`<Static>`) and a live
  region, so the permanent lines are printed as plain text and the live region —
  spinners, progress bars, prompts — is skipped. No control sequence is written
  and keys are not read; `backend.logOnly` is `true`. The app's code does not
  change: the same spinner that animates in a terminal simply isn't there in a
  log. (A spinner *cannot* exist in a pipe — it is drawn by overwriting a cell.)
  For a sign of life in CI, emit a `<Static>` line on a timer.

  The `inline-build-log` example shows both faces of one program:

  ```text
  $ npm run inline-build-log              # in a terminal: the log grows, a spinner works under it
  [0] compiled module
  [1] compiled module
  ⠹ compiling...

  $ npm run inline-build-log | cat        # piped: the same log, nothing else, no escape codes
  [0] compiled module
  [1] compiled module
  [2] compiled module
  [3] compiled module
  [4] compiled module
  ```

  A test runs it exactly that way — as a real process with its stdout piped — and
  compares the log byte for byte.

### Which backend for which app

| The app | Backend | Without a terminal |
| --- | --- | --- |
| Full-screen, interactive — a menu, an editor, a dashboard | `TtyBackend` | throws `NotInteractiveError`; the app decides what to print instead |
| Progress while it works, then a result — a build, a deploy | `InlineTtyBackend` | the `<Static>` log lines only; the live region is skipped |
| A report, nothing to ask — a summary, a table, a diff | `FinalFrameBackend`, or `renderToString` with `format: bufferToAnsi` | the same output, without colors |

`FinalFrameBackend` shows nothing while the app runs and prints the last frame
once, when the app is done, into the normal screen — so the report stays in the
scrollback and reads the same in a pipe or in CI. Its height defaults to
`Infinity`, an unbounded surface, so the frame is as tall as its content instead
of being cut off at 24 rows. Nothing is repainted, so a spinner has nothing to
animate: that is the inline backend's job. Color is off unless the stream is a
terminal — a pipe and a CI log get the text, with bold, dim and underline kept;
`FORCE_COLOR=1` or `color: true` prints the colors anyway.

```tsx
import { render } from '@flowtty/react';
import { FinalFrameBackend } from '@flowtty/tty-backend';

const app = await render(<Report />, new FinalFrameBackend());
app.unmount();                // the frame is printed here — nothing before it
await app.waitUntilExit();    // the output has been written by now
```

The frame is printed when the app exits, so the app has to exit: a report that
finishes by itself calls `useApp().exit()` and the caller only awaits
`waitUntilExit()` (see [The app around the components](app.md#quitting-and-work-after-the-ui-is-gone)).
When you want the text rather than the printing, `renderToString` gives you the
frame as a string — pass `format: bufferToAnsi` to keep the styling (see
[The app around the components](app.md#rendering-to-a-string)).
`bufferToAnsi(buffer, { color, depth, hyperlinks })` is exported on its own too:
it turns a `Buffer` into styled lines for the normal screen — no cursor moves, no
clear, `RESET` before every newline so a background never bleeds to the edge, and
trailing blanks trimmed unless they carry a background.

**Color.** `NO_COLOR` — present and non-empty — turns color off; `FORCE_COLOR`
overrides it in either direction (`0` = off, anything else = on). Without color
the backends still emit bold, dim, underline, inverse and strikethrough, so
emphasis survives. All three backends take a `color` option that overrides the
environment: `new TtyBackend(stdout, stdin, { color: false })`.
`detectColorSupport(env)` and `sgr(style, { color })` are exported for custom
backends.

**Signals.** On `SIGTERM`, `SIGHUP` and `SIGINT`, `render()` unmounts and
disposes the backend first — leaving the alt screen, showing the cursor, turning
bracketed paste and mouse reporting off — and then re-raises the signal, so the
process still dies *by* that signal and its exit status says so (143, 129, 130).
If the app has installed its own handler for the signal, flowtty only restores
the terminal and leaves the outcome to that handler. In raw mode Ctrl-C arrives
as a key, not as `SIGINT`; `TtyBackend` treats it (and Ctrl-D) as "restore and
exit 130".

## Still deferred (later milestones)

- Wide-character **rendering**: the grid is still one cell per code point. The
  backends back the cursor up one column after a double-width glyph (measured via
  `stringWidth`) so the row stays column-aligned instead of shifting right — but
  this overlaps the glyph's second column with the next cell. Text printed into
  the normal screen (`FinalFrameBackend`, `bufferToAnsi`) does not do that — a
  backspace would survive into the log file — so such a row runs one column
  longer per wide glyph. Cell-accurate CJK/emoji layout waits on paint reserving
  the second cell.
- Scrolling-region optimization for log-stream apps.
- Column-only cursor moves (`CSI <col>G`) when row is unchanged — small extra perf nibble.
- `position: 'relative'`.
- Mouse clicks / hit-testing (the wheel is supported — see [Paste and mouse wheel](input.md#paste-and-mouse-wheel)), Kitty keyboard protocol.
