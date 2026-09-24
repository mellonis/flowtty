# Terminal specifics

Color, glyph width, and what the renderer does not do yet.

- [Truecolor](#truecolor)
- [Display width](#display-width)
- [Environment](#environment)
- [Notifications](#notifications)
- [The clipboard](#the-clipboard)
- [Light and dark](#light-and-dark)
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

## Notifications

`useApp().bell()` and `useApp().notify(title, body?)` (see
[The app around the components](app.md#getting-attention)) are the app's side of
this. The bell is one byte every terminal understands. A desktop notification is
not: there is no single escape sequence for it, so the TTY backends pick one from
the environment.

| Where | What is sent | Why |
| --- | --- | --- |
| `TERM=foot*`, `TERM=rxvt-unicode*` | `OSC 777` — `ESC ] 777 ; notify ; title ; body ST` | the terminal's own protocol, documented by it, and it keeps title and body apart |
| `TERM=dumb`, `TERM=linux` | nothing (the bell instead) | no escape handling at all, or a bare console with no desktop behind it to notify |
| tmux, GNU screen (`TMUX`, `STY`, `TERM=tmux*` / `screen*`) | nothing (the bell instead) | see below |
| everything else | `OSC 9` — `ESC ] 9 ; text ST` | the widest-understood form (iTerm2's), which kitty, WezTerm, ghostty, rio and VS Code read too; a terminal that does not understand it swallows the OSC rather than printing it |

The table is deliberately short. A terminal is listed only where its own
documentation says which protocol it speaks; everything else falls through to the
default, which is inert where it is not understood. No terminal is on a
"prints garbage" list, because none could be confirmed to print an unknown OSC as
text — `TERM=dumb` and the Linux console are excluded for having nothing to
notify, not for making a mess. OSC 99 (kitty's own protocol) is not implemented:
a title and a body need two chunked sequences to be correct, and kitty documents
that it reads OSC 9 as well, so the default already reaches it.

With `OSC 9` the title and body are joined into the one field it carries
(`title: body`). ConEmu and Windows Terminal read `OSC 9 ; <digits> ; …` as a
numbered sub-command — `9;4` is a progress report — so a message whose first
field would be numeric gets a leading space, and is shown rather than obeyed.
With `OSC 777` a `;` inside the title or body would move the rest into the next
field, so it becomes a comma.

**tmux and screen.** Both swallow an OSC they do not know unless the pane has
passthrough turned on, which it does not by default (`allow-passthrough` is off
in tmux, and screen's passthrough is a different, size-limited form). Rather than
write bytes that would be dropped — or, with the wrong guess, land in the pane as
text — a multiplexer is detected and `notify()` rings the bell instead. The bell
is not a consolation prize there: tmux turns it into a bell flag on the window in
its status line, which is exactly "something happened in the window you are not
looking at". Forcing a protocol (below) inside tmux sends it wrapped in tmux's
DCS passthrough, for a pane configured with `allow-passthrough on`; under screen
a forced protocol is sent unwrapped and will not reach the terminal.

**The option.** Both TTY backends take `notifications: 'auto' | 'osc9' |
'osc777' | 'none'` (default `'auto'`, the table above):

```ts
new TtyBackend(process.stdout, process.stdin, { notifications: 'osc777' });
new InlineTtyBackend({ notifications: 'none' });
```

`'none'` asked for explicitly means silence — `notify()` does nothing at all. A
`'none'` that detection arrived at means "no protocol reaches this terminal", and
there `notify()` rings the bell. `bell()` is unaffected by the option either way,
and both are silent in `InlineTtyBackend`'s log-only mode and after `dispose()`.
`detectNotificationProtocol(env)`, `notificationSequence(title, body, protocol)`
and `sanitizeNotificationText(text)` are exported from `@flowtty/tty-backend` for
custom backends, alongside `createAttention(write, options)`, which is what both
backends drive their `bell()` and `notify()` from.

## The clipboard

`useApp().copy(text)` and copy-on-select (see
[The app around the components](app.md#the-clipboard)) go out as **OSC 52** —
`ESC ] 52 ; c ; <base64 of the UTF-8 text> ST` — the xterm sequence every
terminal that has a clipboard escape copied. One write, never from inside
`draw()`, and it moves no cursor and changes no cell, so a copy between two
frames leaves the frame-diff baseline exactly as it was.

**Write-only.** OSC 52 also has a `?` form that asks the terminal to send the
clipboard *back*, over the same channel the app reads keys from. flowtty never
emits it, and cannot: the payload of every sequence it builds is base64, and
base64 has no `?`.

**The size cap.** Terminals cap what they will accept in one OSC 52, and the
common xterm-derived ceiling is 74,994 bytes of base64. Over it, flowtty writes
**nothing** and `copy()` reports `false` — never a partial base64, and never a
truncated copy presented as a complete one. `clipboardLimit` moves the cap.

**Where a write is attempted.**

| Where | What is sent | Why |
| --- | --- | --- |
| `TERM_PROGRAM=Apple_Terminal` | nothing | Apple Terminal implements no OSC 52; the app's own `pbcopy` is the path there |
| GNU screen (`STY`, `TERM=screen*`) | nothing | no clipboard of its own, and its passthrough is a different, size-limited form |
| `TERM=dumb`, `TERM=linux` | nothing | no escape handling, or no clipboard behind the console |
| tmux (`TMUX`, `TERM=tmux*`) | `OSC 52`, unwrapped | tmux reads the sequence from the application itself; its `set-clipboard` option governs that and must not be `off` |
| everything else | `OSC 52` | the one sequence there is; a terminal that does not know it swallows the OSC |

As with notifications, the table is short on purpose: a terminal is listed only
where its own behaviour is known. Everything else falls through to the attempt,
which is inert where it is not understood — and there is no way to ask a terminal
whether a write landed, so `copy()` returning `true` means the bytes went out.
[Selection](input.md#selection) lists the three settings worth knowing about
(Apple Terminal, iTerm2's clipboard-access setting, tmux's `set-clipboard`).

**The option.** Both TTY backends take `clipboard: 'auto' | 'osc52' | 'none'`
(default `'auto'`, the table above) and `clipboardLimit`:

```ts
new TtyBackend(process.stdout, process.stdin, { clipboard: 'osc52' });
new InlineTtyBackend({ clipboard: 'none' });
```

`'osc52'` asked for explicitly writes the sequence whatever the environment says
— and inside tmux wraps it in tmux's DCS passthrough, for a pane configured with
`allow-passthrough on`. `'none'` never writes one and `copy()` always reports
`false`. Both are silent in `InlineTtyBackend`'s log-only mode and after
`dispose()`. `FinalFrameBackend` has no `copy()` at all: nothing is interactive
there. `detectClipboardSupport(env)`, `clipboardSequence(text, limit)` and
`createClipboard(write, options)` are exported from `@flowtty/tty-backend` for
custom backends.

## Light and dark

`useColorScheme()` (see [The app around the components](app.md#the-color-scheme))
is fed by three sequences, all asked for with the first key subscription — the
answers come down stdin, and a backend nobody reads keys from cannot hear them.

1. **The background, once.** `OSC 11 ; ?` asks the terminal for its default
   background; it answers `OSC 11 ; rgb:rrrr/gggg/bbbb ST`, and the backend
   decides light or dark by the color's brightness (above half is light). No
   answer — a terminal that does not know the query, a multiplexer that eats it
   — means `'unknown'`, quietly; nothing waits for it.
2. **A change, where the terminal announces one.** DEC mode 2031 (`CSI ? 2031 h`)
   asks to be told when the scheme switches; the terminal sends
   `CSI ? 997 ; 1 n` (dark) or `CSI ? 997 ; 2 n` (light). The backend takes the
   scheme from that at once and asks for the background again, so the two agree
   within one round trip.
3. **Otherwise, the next time the window is looked at.** Focus reporting
   (`CSI ? 1004 h`) makes the terminal send `CSI I` / `CSI O` as the window
   gains and loses focus, and the backend asks for the background again on every
   focus-in: the scheme usually flips while the window is in the background, and
   the person sees it when they come back.

Every reply is taken out of the key stream by the parser (`decodeKeys` returns
them as `reports`), so no input handler ever sees one as a key. Both modes are
turned off on `dispose()`, in reverse order, as the mouse modes are.

| Terminal | The first answer | A change is heard |
| --- | --- | --- |
| Ghostty, kitty, Contour, foot | at once | at once (mode 2031) |
| iTerm2, Apple Terminal, Alacritty, WezTerm, Windows Terminal, VS Code | at once | on the next focus-in |
| tmux | when `allow-passthrough` lets OSC 11 through; newer tmux answers 2031 itself | as the outer terminal allows |
| GNU screen, `TERM=linux` | never — `'unknown'` | never |

The table is short on purpose, and the second row is the safe assumption for a
terminal not listed: focus reporting is nearly universal, and where a terminal
answers 2031 as well, the change simply arrives sooner.

**The option.** Both TTY backends take `colorScheme: boolean` (default `true`).
`false` asks nothing: no query, no modes, `colorScheme()` stays `'unknown'`.
`InlineTtyBackend` asks nothing in log-only mode either way, and
`FinalFrameBackend` has no scheme at all — nothing is interactive there.
`createColorSchemeTracker(write)`, `decodeKeys`'s `TerminalReport` and the three
sequences (`BACKGROUND_QUERY`, `COLOR_SCHEME_REPORTS_ON` / `_OFF`) are exported
from `@flowtty/tty-backend` for custom backends; `colorSchemeOf(rgb)` — the
brightness rule — from `@flowtty/core`.

## Console output

While a TTY backend owns the screen, a line printed with `console.log`,
`console.warn` or `console.error` — by the app, by a library, by React's own
warnings — would land in the alternate screen and stay there until the next full
repaint, because the frame diff knows nothing of it. So the backends take the
console over:

- **`TtyBackend`** holds the lines back and prints them through the restored
  console once the alternate screen is gone — the same moment flowtty's own
  deferred warnings appear. `suspend()` hands the console to the child along
  with the terminal, and `resume()` takes it back.
- **`InlineTtyBackend`** prints each line at once above the live region, where a
  build tool's logs belong; in log-only mode it takes nothing.

The capture is on when the output stream is a terminal and off otherwise — a
`2> app.log` keeps working — and `captureConsole: true | false` in the backend
options overrides that. `onConsole(entry)` hands the app each line as it happens
(`{ level, line }`, the line as `console` would have printed it) for a log pane
of its own; with it set, `TtyBackend` prints nothing at exit and
`InlineTtyBackend` nothing above the region. A `console` method something
replaces during the session — a logger, a test spy — is left as it is when the
backend releases the console.

Direct writes to `process.stdout` / `process.stderr` are not covered: they still
hit the screen. Keep them out of a running app, or write to a file.

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
- Hit-testing a mouse key against the laid-out tree — the wheel and the buttons
  are reported with the cell under the pointer, but working out which component
  that cell belongs to is still the app's job (see
  [Paste and the mouse](input.md#paste-and-the-mouse)).
- Kitty keyboard protocol.
