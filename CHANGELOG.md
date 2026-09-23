# Changelog

All notable changes to the `@flowtty/*` packages. The four packages
(`@flowtty/core`, `@flowtty/react`, `@flowtty/tty-backend`,
`@flowtty/inline-tty-backend`) share one version and are released together.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project is still on `1.0.0-alpha`, so any release may change an API.

## Unreleased

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

