# Changelog

All notable changes to the `@flowtty/*` packages. The four packages
(`@flowtty/core`, `@flowtty/react`, `@flowtty/tty-backend`,
`@flowtty/inline-tty-backend`) share one version and are released together.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project is still on `1.0.0-alpha`, so any release may change an API.

## 1.0.0-alpha.33 — 2026-09-28

### Added

- **A hover look for the built-in components.** With the backend's `mouse:
  { hover: true }`, the thing under the pointer is underlined — a look no
  focus state uses, so the two read apart and both show when they coincide:
  `Button` its `[ label ]`, `Checkbox` its label (the marker with no label),
  `ListSelect`, `ListMultiSelect` and the `Select` popup the row's label,
  `Table` with `onRowClick` the row's cells, the closed `Select` its value.
  `TextInput`, `TextArea` and `ScrollList` rows show nothing. A list row's
  hover is its own state: a move re-renders the row left and the row entered,
  nothing else. See docs/input.md (clicks and hover).

## 1.0.0-alpha.32 — 2026-09-28

### Added

- **Clicks and hover from the committed frame.** `onClick` on any box (the
  box painted on top wins, the nearest handler up from it gets the click,
  the press and release are withheld from `useInput`), `onHoverChange` and
  `useHover()` (a component re-renders only when the pointer enters or leaves
  its box), delivered by a `MouseController` in `@flowtty/core/host` next to
  the selection controller. A box under `inert` or under an open dialog gets
  neither. `render(…, { mouse: false })` turns it off. See docs/input.md
  (clicks and hover).
- `TtyBackend` `mouse: { hover: true }`: any-event tracking; motion with no
  button held arrives as `mousemove`, coalesced to one per cell and at most
  one per ~16 ms; a focus-out arrives as `mouseleave`. `TestBackend.mouse`
  takes `'move'` and `'leave'`.
- A click picks the row: `ListSelect` moves its highlight (`onChange`, never
  `onSubmit`), `ListMultiSelect` toggles, `Table` and `ScrollList` report
  `onRowClick(index, key)`, the `Select` popup picks and closes (toggles and
  stays open with `multiple`).
- `Menu` takes the mouse: a click on a bar item engages and opens its panel
  (the open one closes, another switches), a click on a panel item does what
  Enter does, a press anywhere else while engaged collapses and disengages
  and is consumed. Keyboard behaviour unchanged.

### Changed

- `Button`, `Checkbox`, `TextInput`, `TextArea`, `ListSelect`, `ListMultiSelect`
  and the `Select` field detect their click through `onClick` on their own
  box instead of `useClick` over an `onLayout` rect. Same behaviour on its
  own; inside a row with `onRowClick` such a component now takes its click
  where before the row took it. `useClick` stays exported for a hit area that
  is not a box of its own.

### Fixed

- A stdin chunk that ended exactly on the `ESC` of a mouse report or an
  arrow key delivered an Escape key, and the rest of the sequence as typed
  text (`[<65;3;4M` in a field while scrolling). `TtyBackend` now holds a
  trailing `ESC` for 30 ms: more bytes complete the sequence, silence makes
  it the Escape key.

## 1.0.0-alpha.31 — 2026-09-25

### Changed

- **Wide glyphs occupy two grid cells.** A CJK ideograph or an emoji takes the
  two columns it takes on screen: paint reserves the second cell, the backends
  no longer back the cursor up over it, and nothing overlaps its right half.
  Every width in the library — layout, `wrapText`, `<TextInput>` /
  `<TextArea>`, `<Table>`, markdown tables and code blocks, `<Menu>` — is
  measured in display columns. See docs/terminal.md (display width).
- **`Cell.char` is a grapheme cluster, or `''` for the second column of a wide
  one.** A backend writes the lead and skips the `''` cell. Backends built on
  the old one-cell-per-code-point grid must adopt this (docs/writing-a-backend.md).
- **`stringWidth` measures grapheme clusters**: a flag, an emoji with a skin
  tone and a ZWJ sequence are 2, not the sum of their parts; a control
  character counts the column paint gives it (1).
- The editor (`<TextInput>`, `<TextArea>`) moves and deletes by grapheme
  cluster, so a caret never lands inside a flag or a decomposed accent.
- DEL and C1 control characters in text are painted as a space, like C0.

### Added

- `graphemes`, `clusterWidth`, `fitClusters`, `prevGrapheme`, `nextGrapheme`
  from `@flowtty/core` and `@flowtty/react`.
- A width policy, `setWidthPolicy` / `widthPolicy` (`'cluster'` or
  `'codepoint'`): macOS Terminal.app measures per code point, so on it a
  skin-tone emoji is two cells of two columns, a ZWJ one more for the joiner,
  and a VS16 sequence one column, instead of a row that wraps. `TtyBackend` and `InlineTtyBackend`
  detect it (`widths: 'auto'`, `TERM_PROGRAM=Apple_Terminal` outside tmux /
  herdr) and take `widths` / `env` options to override;
  `detectWidthPolicy(env)` is exported from `@flowtty/tty-backend`. See
  docs/terminal.md (display width).

## 1.0.0-alpha.30 — 2026-09-24

### Added

- `useInput(handler, { fallback: true })`: the fallback phase — a handler that
  hears a key only when no capture and no ordinary handler consumed it, where
  an app's global keymap belongs. Fallbacks hear a key in mount order among
  themselves and are muted with their subtree. See docs/input.md (keys and
  useInput).

## 1.0.0-alpha.29 — 2026-09-24

### Fixed

- `TextInput` in a row laid out at the width of its own text and then
  windowed the text to that width, so nothing typed ever showed; with
  `frame="none"` it collapsed to nothing. A field sized to its content now
  grows with its text instead of scrolling; `width`, `flexGrow` and
  `flexShrink` pass through, so a row can pin it or give it a share. See
  docs/components.md (TextInput).

## 1.0.0-alpha.28 — 2026-09-24

### Added

- `useInput(handler, { capture: true })`: the capture phase — a handler that
  hears every key before the ordinary ones, whatever was mounted when, and can
  consume it; muted with its subtree like the rest. For an app's own chords.
  See docs/input.md (keys and useInput).

### Fixed

- The delivery order did not survive a dialog or an `inert` box: `DialogHost`
  and `<Box inert>` muted a subtree by swapping its input source, which made
  every handler under it resubscribe at the end of the queue, behind the
  handlers above — after the first dialog a root handler heard every key
  before every field. Muting is now a check at delivery on a source that lives
  as long as the subtree; nobody moves.

## 1.0.0-alpha.27 — 2026-09-24

### Fixed

- The control bytes 0x00 and 0x1C–0x1F (Ctrl+@, Ctrl+\, Ctrl+], Ctrl+^,
  Ctrl+_) arrived as printable keys, so a focused list took Ctrl+] as a
  filter character and consumed it. The parser names them like the other
  chords, and `isPrintable(key)` — new in `@flowtty/core` — is what a field
  types and a filter accepts: never a control character, whatever a backend
  sends. See docs/input.md (paste and the mouse, key names).

## 1.0.0-alpha.26 — 2026-09-24

### Added

- A click focuses a field: `TextInput`, `TextArea`, `ListSelect`,
  `ListMultiSelect`, `Select`, `Checkbox` and `Button` take focus on a mouse
  click inside them; `Button` presses on one. `FocusGroup` gains `focus(id)`,
  `useFocus()` returns `focus()`, and `useClick(rectRef, onClick)` — a press
  and a release on an `onLayout` rect, a drag cancels — is public for any
  clickable component. See docs/input.md (Focus + Button).
- `TextInput frame`: `field` (default, the band), `none` (bare text sized to
  its content, for a filter bar) or `border` — the same three `Select` has.
  See docs/components.md (TextInput).

### Changed

- The built-in components consume the keys they act on: a focused field, a
  list, a button, a scroll box, a menu and `FocusGroup` return `true` for a
  key they used, so a root `useInput` handler no longer sees it — typing `q`
  into a field no longer quits an app that binds `q`. Keys a component ignores
  still fall through. `useInput` stays subscribed while `isActive` is false
  and mutes on delivery, so focus no longer moves a handler in the delivery
  order. See docs/input.md (keys and useInput).

## 1.0.0-alpha.25 — 2026-09-24

### Added

- `<Checkbox>`: one yes / no with a `mixed` state, focusable; Space or a click
  toggles (`mixed` goes to `true`), Enter is left to the form. `frame` picks
  `[ ]` / `[x]` / `[-]` or the glyphs `☐` / `☑` / `⊟`. The multi lists take
  `checkboxFrame` to draw their rows with the same markers, and Markdown's task
  lists draw the same glyphs — one helper, `checkboxMarker`, for all of them.
  See docs/components.md (Checkbox).
- The TTY backends take the console over while they own the screen, so a
  `console.log` / `warn` / `error` — React's warnings included — no longer
  lands in the frame: `TtyBackend` prints the lines once the alternate screen
  is gone, `InlineTtyBackend` at once above the live region. On when the output
  is a terminal; `captureConsole` overrides, `onConsole` hands the app each
  line. See docs/terminal.md (console output).

## 1.0.0-alpha.24 — 2026-09-24

### Added

- `<Select>`: a dropdown. A one-line field showing the chosen value and `▾`
  that opens a popup under it (or above, when there is no room) to choose
  from — typing filters, ↑/↓ and the wheel move, Enter picks, Escape closes;
  `multiple` for any number with Space toggling and `onAddNew`; `frame` picks
  the field's look (`field`, `none`, `border`). The popup is a floating dialog,
  so a `<DialogHost>` is required. See docs/components.md (Select, Choosing).
- `openDialog(el, { floating: true, anchor, height })` pins a floating dialog
  to a rect — under it, or above when it does not fit — instead of centring
  it. See docs/app.md (DialogHost).
- docs/components.md (Choosing): which of `Select`, `ListSelect`,
  `ListMultiSelect` and `Menu` to reach for, and the vocabulary they share;
  `Menu` has a section of its own now.

### Changed

- The inline lists are `ListSelect` and `ListMultiSelect`; `Select` is the
  dropdown. No aliases: an app using the old `Select` / `MultiSelect` renames
  its imports.

## 1.0.0-alpha.23 — 2026-09-24

### Added

- `useApp().suspend(fn)` and `handle.suspend(fn)`: hand the terminal to another
  program — `$EDITOR`, a pager, `git commit` — for the duration of `fn`, and
  take it back with a full repaint and the component state intact. Backed by a
  new optional `suspend()` / `resume()` on `Backend`, implemented by both TTY
  backends and recorded by `TestBackend`. See docs/app.md (handing the terminal
  over).
- Ctrl+Z suspends the process: the TTY backends hand the terminal back, stop
  with `SIGTSTP`, and take it again on `fg`. `suspendKey: false` delivers Ctrl+Z
  as a key instead. A `SIGCONT` after a stop the app never asked for repaints
  too.
- A `useInput` handler that returns `true` consumes the key: later subscribers
  do not see it, and the backend skips its default for it — Ctrl+C / Ctrl+D no
  longer exit and Ctrl+Z no longer suspends when a handler took them. Keys are
  delivered in subscription order (children before parents on mount). Backend
  `onKey` handlers may return a value; `TestBackend.press()` returns whether
  the key was consumed. See docs/input.md (keys and useInput).
- Double-click selects the word under the pointer and triple-click the line —
  a soft-wrapped paragraph as one — through the same copy-on-select path as a
  drag, bounded by `selectionScope` and `selectable={false}`. The TTY backend
  counts presses (`createClickCounter`) and puts the count on the `mousedown`
  key as `Key.clicks`; `TestBackend.mouse()` takes `{ clicks }`. See
  docs/input.md (selection).
- Selection from code: `select(anchor, head)`, `selectWord(x, y)`,
  `selectLine(x, y)` and `clearSelection()` on `useApp()` and on the render
  handle, in frame cells, with `onCopy` fired as `source: 'api'`. See
  docs/app.md (selecting from code).

### Changed

- Ctrl+C, Ctrl+D and Ctrl+Z now reach `useInput` handlers before the backend
  acts on them; a handler that returns nothing changes nothing.

## 1.0.0-alpha.22 — 2026-09-23

### Fixed

- `<ScrollList>` re-rendered its whole window — the viewport plus the overscan
  on each side — on every scroll step, because the window was recomputed
  exactly around the viewport and so moved with every row. The window's edges
  now snap to a grid half the overscan wide: a small step keeps the window and
  re-renders nothing, and the cost of a step no longer grows with how rich the
  rows are. See docs/layout.md (ScrollList).
- `<ScrollBox scrollbar>` painted two frames per scroll step: the paint's
  metrics moved the thumb in a second render. The step now sets the metrics
  it will produce, so the thumb moves in the same frame as the rows.

## 1.0.0-alpha.21 — 2026-09-22

### Added

- `<Shimmer>`: a running label that does not blink — a bright band travels
  along the text while something is in flight, in one colour or a gradient
  of the app's accent colours, and stops as a still frame when `running` is
  false. See docs/components.md (Shimmer).

## 1.0.0-alpha.20 — 2026-09-22

### Fixed

- `<ScrollList>`: a soft-wrapped paragraph inside a row copies as one line
  again. The row box was a one-row clip, and a continuation mark is dropped
  when the row below lies outside its clip — so under the list every wrapped
  row came back as several lines. The row box now fixes the height without
  clipping.

## 1.0.0-alpha.19 — 2026-09-22

### Added

- `<ScrollList>`: a `<ScrollBox>` for long lists of equal-height rows that
  renders only the rows near the viewport, so a keystroke over a 400-message
  chat costs what a short one does. It takes `items`, `renderItem`, `keyOf`,
  `rowHeight` and `overscan` on top of every `<ScrollBox>` prop — anchoring,
  paging, the wheel, the scrollbar, overlays and the `ref` handle all carry
  over. See docs/layout.md (ScrollList).

## 1.0.0-alpha.18 — 2026-09-22

### Fixed

- Drag-selection stays readable over text that carries a color of its own. A
  selected cell used to move its `fg` into `bg` under `inverse`, which put the
  glyph in its own color on a band of the terminal's default foreground; once a
  box's `color` reached every descendant, an app whose ink sat near that
  foreground saw the selected text vanish into the band. A selected cell now
  keeps its `fg` and `bg` as they are and lets `inverse` swap them, so the band
  is the text's own color and the glyph its own background — a pair that
  contrasts on either theme.

## 1.0.0-alpha.17 — 2026-09-22

### Added

- The app can follow the terminal's light or dark scheme. `useColorScheme()`
  returns `{ scheme: 'light' | 'dark' | 'unknown', background? }` and re-renders
  when the terminal switches; `useApp().colorScheme` and the render handle give
  the same answer as of now. The TTY backends ask for the background with OSC 11
  once keys are read, listen for a change through DEC mode 2031 where the
  terminal announces one, and ask again on every focus-in where it does not; the
  replies never reach a key handler. `colorScheme: false` turns it off.
  `TestBackend.setColorScheme()` stands in for the terminal in a test.

## 1.0.0-alpha.16 — 2026-09-22

### Added

- A box's `color` reaches every descendant that sets none of its own, the way
  `backgroundColor` already did: text, `<Span>` runs and border glyphs inside a
  `<Box color="white">` paint white unless they say otherwise. `color: 'default'`
  resets a subtree to the terminal's own foreground. A panel that paints a dark
  background can now set its text color once and stay readable on a light
  terminal theme.
- A border with no `borderColor` takes the box's effective text color, so a
  colored panel keeps its frame visible; `borderColor: 'default'` keeps the
  terminal foreground.

## 1.0.0-alpha.15 — 2026-09-21

### Added

- Mouse selection with copy-on-select: drag over the drawn frame to select,
  release to copy. Selection scopes per pane, `selectable={false}` to keep
  chrome out of it, soft-wrapped paragraphs pasted back as one line.
  `useApp().copy()` and the `copy` backend capability (OSC 52) with an `onCopy`
  fallback signal; `TestBackend` records clipboard writes and drives the mouse.

## 1.0.0-alpha.14 — 2026-09-21

### Added

- `useApp().bell()` and `useApp().notify()` to get attention from another
  window; `TestBackend` records both.
- Markdown code blocks: a highlighter for 25 languages, diff blocks, and a quiet
  fence for plain output.

## 1.0.0-alpha.13 — 2026-09-21

### Added

- `<Span>` for styled runs inside a `<Text>`: pieces of one paragraph that wrap
  together and carry their style across a line break.
- `FinalFrameBackend`, `renderToString` and `NotInteractiveError`: one-shot
  output on a surface as tall as its content.
- `CONTRIBUTING.md`, "writing a component" and "writing a backend" pages, and
  documentation of the input components.
- The TTY backend brings 24-bit colors down to what the terminal can show.
- A dev warning when a `<Text>` mixes text with child boxes.

### Fixed

- `Select` sends `j` and `k` to the filter instead of navigating.

## 1.0.0-alpha.12 — 2026-09-21

### Added

- The TTY backend honors `NO_COLOR` and `FORCE_COLOR`.
- The README became a landing page; the reference moved to `docs/`.

### Fixed

- The terminal is restored on SIGTERM, SIGHUP and SIGINT.
- Backends no longer write control sequences into a stdout that is not a terminal.
- The selected `Table` row no longer highlights the outer borders.

## 1.0.0-alpha.11 — 2026-09-21

### Added

- A dimming backdrop: `<Box backdrop="dim">` and `<DialogHost backdrop>`.
- A self-playing showcase in the examples, recorded as an asciicast and a GIF by
  the same script that tests it.

### Fixed

- `Select` and `MultiSelect` show focus.
- Markdown hard-wraps fenced code lines to the width.

## 1.0.0-alpha.10 — 2026-09-21

### Added

- `NAMED_COLORS` and a `Color` type on every color prop, so editors complete the
  names while hex and `rgb()` values stay valid.

### Changed

- The build moved from tsup to tsdown; TypeScript 7.
- `multiSelectReducer` takes `extraRows`; `MultiSelect` drops its placeholder item.
- The editor's unknown-key contract is pinned in the documentation.

## 1.0.0-alpha.9 — 2026-09-21

### Added

- `waitUntilExit()` on the render handle and `useApp().exit()`.
- `MultiSelect.onAddNew` can return the new item's value.

### Fixed

- A scroll viewport is the containing block of its overlays.

## 1.0.0-alpha.8 — 2026-09-21

### Fixed

- The editor treats an astral character (an emoji, for example) as one character.

## 1.0.0-alpha.7 — 2026-09-21

### Added

- Scroll viewports and `<ScrollBox>`.
- Multi-line editing and `<TextArea>`.
- The TTY backend decodes keys reported by code point (CSI-u, modifyOtherKeys).
- `TextInput` renders its `validate` error, gains `defaultValue`, and reads in
  dark themes.
- `gray` and the bright color names; unknown color names are reported on exit.
- A named key list and types; `TestBackend.press` rejects impossible names.
- A scripted publish that flips `exports` to `dist/` and always restores them.

### Fixed

- Readable `TextArea` text on its default light field.

## 1.0.0-alpha.6 — 2026-09-20

### Added

- Bracketed paste delivered as a single `paste` key.
- The mouse wheel as `wheelup` / `wheeldown` keys (opt-in).

## 1.0.0-alpha.5 — 2026-09-20

### Fixed

- Re-ordering keyed children no longer aborts Yoga.
- An empty `<Text>` takes one row.

## 1.0.0-alpha.4 — 2026-09-20

### Fixed

- Markdown layout is measured in grid columns, not display cells.

## 1.0.0-alpha.3 — 2026-09-20

### Added

- Markdown nested lists, source numbering and GFM tables.

### Fixed

- React is acquired through a single ESM import in the dist, so a consumer never
  ends up with two copies.
- East Asian Wide BMP emoji take two cells.

## 1.0.0-alpha.2 — 2026-08-07

### Added

- `borderBackgroundColor`; border cells inherit the box background.

## 1.0.0-alpha.1 — 2026-06-03

The first published release. What the four packages held at that point:

- `@flowtty/core`: the cell `Buffer`, `Style` and `Key` types, the `Backend`
  interface, the text `wrap` and display-width helpers, the editor and the
  select reducers, `TestBackend`; the adapter-facing `host` subpath with Yoga
  layout and paint.
- `@flowtty/react`: `render()` on a `react-reconciler` host, `<Box>` and
  `<Text>` with the flexbox prop set (borders with titles, padding, margin, gap,
  flex sizing and wrap, `alignContent`, min/max sizes, `aspectRatio`, `display`,
  absolute positioning, `zIndex`, `overflow`, `onLayout`), `useInput`,
  `useTerminalSize`, `FocusGroup` and `useFocus`, `Button`, `TextInput`,
  `Select`, `MultiSelect`, `Confirm`, `Form` and `useField`, `DialogHost` with a
  dialog stack, `Menu`, `<Static>`, `ErrorBoundary` and the `onError` option, a
  root abort signal, ticker-driven `Spinner`, `ProgressBar` and `TaskList`,
  `<Markdown>`, `<Link>` and OSC 8 hyperlinks, `<Table>`.
- `@flowtty/tty-backend`: the alt screen with a frame diff, raw-mode key
  parsing with modifiers, named and 24-bit color.
- `@flowtty/inline-tty-backend`: a redrawable live region with an append-only
  log above it, the backend behind `<Static>`.

