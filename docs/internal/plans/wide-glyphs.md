# Wide glyphs occupy two grid cells — Design

**Issue:** flowtty #15. **Date:** 2026-09-25. **Status:** implemented on branch `wide-glyphs` (plan: `wide-glyphs-plan.md`).

## Problem

The cell grid is one cell per code point. A double-width glyph (CJK, most emoji)
is stored in one cell; `TtyBackend` and `InlineTtyBackend` write `\b` after it
so rows stay column-aligned, which lets the next cell overwrite the glyph's right
half. `bufferToAnsi` (`FinalFrameBackend`, `renderToString`) writes no `\b`, so
there a row runs one column longer per wide glyph. Zero-width code points
(combining marks, variation selectors, ZWJ) each take a cell of their own, so a
decomposed `café` is five columns wide.

`stringWidth` / `charWidth` exist in core (docs/terminal.md, display width) but
nothing inside the library uses them: `measureText`, `wrapText`, `inputRows`,
`splitVisualLines`, `<Table>`, markdown layout and `<Menu>` all count code
points. The markdown-table misalignment bug came from exactly that split.

## Goal

CJK and emoji occupy on the grid exactly the columns they occupy on screen;
nothing overlaps and no row drifts; every width in the library is measured by one
function. Success: `日本語` in `<Text>`, in `<TextInput>` under the caret, in
`<Table>` and in a markdown table lines up; a mouse selection copies a glyph
whole; `renderToString` yields rows of the right width; the caret in a field
never lands inside a glyph.

## Decisions taken in chat

- **Grapheme clusters, not code points** (`Intl.Segmenter`, no dependency). Per
  code point measuring gets flags (🇯🇵: two regional indicators, each Wide) and
  skin-tone modifiers (👍🏽: the modifier is itself Wide) wrong at 4 columns;
  those are common in emoji-heavy content. The runtime floor this sets (Node 16,
  2021) is not a constraint for a project on yoga-wasm and React 18.
- **The editor is in scope**: the caret moves and deletes by cluster, so a field
  never has to draw a caret on half a cluster.
- **Representation A**: a continuation cell with `char: ''`. Rejected: a
  `Cell.width` field (every reader has to consult it; concatenating readers need
  special branches) and "one cell per glyph, the backend skips" (a backend cannot
  tell the gap from a real space; the diff would repaint a space over the glyph's
  right half — the current hole in another wrapping).

## Non-goals

- Probing the terminal for its real emoji width (write a glyph, query the cursor
  position). The library measures by its tables; a terminal that disagrees (VS16
  handling, code points newer than the tables, ZWJ sequences it does not join)
  drifts by a column. Recorded in docs/terminal.md as the known remainder and in
  `_followups.md` as a possible later feature.
- Bidi, and horizontal scrolling of over-wide tables (already a followup).

## 1. Core: the grid contract

### Primitives — `packages/core/src/graphemes.ts`

- `graphemes(text: string): string[]` — grapheme clusters, from one cached
  `Intl.Segmenter(undefined, { granularity: 'grapheme' })`. Fast path: a string
  with no code unit at or above U+0300 returns `[...text]` without the segmenter
  (all Latin and Cyrillic text; the check is a single regex test, ~20 ns).
- `clusterWidth(cluster: string): 0 | 1 | 2` — the maximum `charWidth` over the
  cluster's code points; a U+FE0F (VS16) in a cluster whose base is width 1 raises it
  to 2 (a lone VS16 stays 0). A C0 control
  measures 1, because paint substitutes a space for it. Fast path: a
  single-code-unit cluster below U+0300 is 1 without a table lookup.
- `stringWidth(text)` becomes the sum of `clusterWidth` over `graphemes(text)`.
  Public semantics change for the better: 👍🏽 and 🇯🇵 measure 2, not 4; a ZWJ
  sequence measures 2. `charWidth` (the per-code-point table) stays as is.
- `prevGrapheme(value, i)` / `nextGrapheme(value, i)` — the UTF-16 index of the
  cluster boundary before / after `i` (`i` inside a cluster snaps to its start
  first). Fast path: the existing surrogate-pair logic when the value has no code
  unit at or above U+0300.
- `tsconfig.base.json`: `lib: ["ES2022", "ES2022.Intl"]` so the type checker sees
  `Intl.Segmenter`. `packages/examples/tsconfig.json` is flat and gets the same.

Measured cost (126-character string): spread ~0.9 µs, segmenter ~10 µs, fast-path
test ~0.02 µs. A 120×40 screen full of CJK segments in ~0.3–0.5 ms per paint plus
the same in measuring — invisible against a 16 ms frame. If a profile ever says
otherwise, a `string → clusters` cache at the measure function is the one place
to add it.

### `Cell.char` (`packages/core/src/cells.ts`)

`char` is one of:

- one grapheme cluster of width 1 or 2 (the lead cell);
- `''` — the continuation column of the wide cluster in the cell to its left; it
  carries the lead's style;
- `' '` — filler.

A width-0 cluster (a lone combining mark at the start of a text) never lands in a
cell: paint and measuring skip it.

### The invariant, kept by `Buffer.set(x, y, char, style)` (signature unchanged)

- A wide cluster writes two cells: the lead, and `''` with the same style at
  `x + 1`. At the right edge (`x === width - 1`) it does not fit and `' '` is
  written instead. A torn glyph is never stored.
- Writing over the lead of a wide cluster replaces its continuation with `' '`
  in the continuation's former style. Writing over a continuation replaces its
  lead with `' '` likewise. A window edge, a caret over text, an overlay or a
  border never leaves half a glyph behind.
- `set` with `char === ''` outside the pair is a no-op that notes a dev warning
  (`warnings.ts`): the only writer of `''` is `set` itself.
- `set` computes the width itself through `clusterWidth` (fast path for a
  single-code-unit `char` below U+0300), so paint, backends and tests do not pass
  it separately.

`get`, `clone`, `toString`, continuation marks: unchanged. `''` vanishes in
concatenation, so `toString`, selection copy and `renderToString` need no branch;
trailing-space trimming behaves as before.

## 2. Measuring and wrapping

One rule: anything that means "how many columns" is `stringWidth`; anything that
means "which character" walks `graphemes`. String indices stay UTF-16.

- `measureText` (host.ts): a line's width is `stringWidth`. The Yoga measure
  function wraps through the same `wrapText`, so it follows.
- `wrapTextLines` (wrap.ts): the greedy word wrap keeps its shape; a word and a
  candidate are measured by `stringWidth`. Cutting an over-long word goes by
  cluster and never splits a wide one: if it does not fit the remainder of the
  line, the line ends a column early and the cluster starts the next line.
  `recordDropped` works by `indexOf` on the source: unchanged. `truncateLine`
  measures in columns; the ellipsis takes one; a wide cluster that would not fit
  before it is dropped, so the line comes out a column short.
- `splitVisualLines` (visualLines.ts): hard wrap by cluster, the same
  never-split rule.
- `inputRows` (inputRows.ts): rows break by column; `start` stays a UTF-16
  index; the caret's `col` is a column, not a cluster index. The header comment
  on units is rewritten. Caret rules at a soft wrap are unchanged.
- Markdown layout (`markdown/layout.ts`): `StyledChar.ch` is a cluster,
  `cellWidth` switches to `clusterWidth`, `textWidth` to `stringWidth` — the
  switch that file's comment promised. Markdown tables and code blocks follow.
- `<Table>`: `cpLen` / `fitCell` measure columns, truncate by cluster, pad by the
  column deficit.
- `<Menu>` measures labels by `stringWidth`. The implementation plan lists every
  `[...s].length` in `packages/react` that means a width and switches it; the
  ones that mean a character count (the key-name check in `TestBackend`) stay.

## 3. Paint

- The text loop iterates `graphemes(line)` instead of `[...line]`; `col`
  advances by the cluster's width; a width-0 cluster is skipped without a cell.
  C0 controls become a space as today.
- `setClipped` checks both columns of a wide cluster against the clip; if the
  second is outside, the first gets `' '`. The buffer edge is `Buffer.set`'s
  job. Two sites, one rule ("half a glyph never exists"): only paint knows the
  clip, only the buffer knows its edge.
- Run styles (`runStyles`): one `Style` per cluster instead of per code point,
  and `source` is cut by cluster too, so the forward search matches what is
  painted.
- Continuation marks for selection: `x1` is `content.left + stringWidth(text)`,
  not the cluster count. `wrapContinues.textWidth` is already columns by
  contract; a component computes it by `stringWidth`.
- `hitTest`: unchanged (it finds a box, not a character).
- Selection (`selection.ts`): word bounds and copy read cells by concatenation
  and by "is this a space"; `''` is not a space, so a word through a wide glyph
  is one word. The overlay (`selection.ts`, the restyle loop) skips continuation
  cells: it writes the lead with the wide cluster and `set` re-creates the pair.

## 4. Backends

- `TtyBackend.drawFull`: writes `cell.char`, skips `''`, drops `\b`. A row is
  exactly `width` columns because the wide cluster took its two.
- `TtyBackend.drawDiff`: a `''` cell is never emitted, but it can appear in the
  diff (the pair always changes together). After emitting a wide lead,
  `lastX = x + 1` (the physical cursor moved two columns); a continuation cell
  in the diff only advances `lastX`; a cell that became `' '` from a former `''`
  is emitted as an ordinary space. Adjacency stays correct and a separately
  repainted space never lands on a glyph's right half.
- `InlineTtyBackend.serializeBuffer`: as `drawFull`. The spec "backs cursor one
  column after a wide glyph" becomes "emits the glyph once, nothing between it
  and the next cell".
- `bufferToAnsi`: skips `''`; the long comment on `\b` and the "one column
  longer" trade shrinks to a pointer at the contract. `isTrailingFiller`:
  unchanged.
- `TestBackend`: frames are read through `toString`; unchanged. docs/testing.md
  gets one sentence: a frame row with `日本` looks shorter than the grid because
  continuation cells do not appear in the text.
- docs/writing-a-backend.md: the `''` rule and the `lastX` note for diffing
  backends.

## 5. Editor and components

- `editor.ts`: `prevIndex` / `nextIndex` become `prevGrapheme` / `nextGrapheme`.
  "Never edit from inside a surrogate pair" widens to "from inside a cluster":
  a cursor handed inside one snaps to its start. Backspace and Delete remove a
  cluster. Word movement is unchanged (it tests characters, not columns).
  `insert` is unchanged (`cursor + text.length` stays UTF-16).
- `TextInput`: `chars` comes from `graphemes`; `caretAt` and `scrollOffset` are
  columns (`stringWidth(value.slice(0, cursor))`). The window is cut by column
  with the rule "a wide cluster half inside the window yields a blank column", so
  scrolling a long CJK value never tears a glyph at an edge. The caret cell on a
  wide cluster spans two columns and the inverse covers both, because the
  continuation inherits the style. `afterLen` (padding to width) is columns. The
  mask stays one `•` per cluster.
- `TextArea`: `caret.col` is columns (§2), so `cells.slice(0, caret.col)`
  becomes a cut by column; the ghost tail is cut by column under the same rule.
  Everything else goes through `inputRows`.
- `<Shimmer>`: the band runs over clusters, its position in columns.
- `[...x]` sites in `FocusGroup`, `Select`, `DialogHost` copy arrays, not
  strings: untouched.

## 6. Tests, public surface, documents, order

### Tests (gates stay `npm test` + `npm run typecheck`)

- core: `graphemes.spec` (segmentation, fast path, `clusterWidth` for a flag, a
  skin tone, VS16, a C0 control, a lone combining mark; `prevGrapheme` /
  `nextGrapheme`), `cells.spec` (the pair; overwriting in both directions; the
  right edge; `set('')`), `wrap`, `visualLines`, `inputRows`, `editor`,
  `paint.spec` (clip on the second column, run styles by cluster, continuation
  mark in columns), `selection.spec` (double-click and copy through 日本語).
- backends: `tty.spec` (drawFull without `\b`; drawDiff: the pair changes
  together, adjacency after a wide cell, a space where a continuation was),
  `InlineTtyBackend.spec`, `bufferToAnsi.spec`.
- react: `TextInput`, `TextArea`, `Table`, `Markdown` (a table with CJK aligns —
  the bug from the issue), `Menu`, `Shimmer`.
- end to end: one test in `render.spec` — a `<Box flexDirection="row">` with a
  `<Text>` of `日本語` beside Latin text gives straight columns in `toString`.

### Public surface

`@flowtty/core` and `@flowtty/react` export `graphemes`, `clusterWidth`,
`prevGrapheme`, `nextGrapheme` beside `stringWidth` and `charWidth`. Breaking
for the alpha, each its own CHANGELOG line: the `Cell.char` contract (backend
authors) and `stringWidth` measuring clusters.

### Documents

docs/terminal.md (display width rewritten: the unit, the primitives, the
terminal remainder), docs/writing-a-backend.md (the `''` rule, `lastX`),
docs/testing.md (one sentence on `toString`), docs/components.md where
`TextInput` / `Table` mention units. The comment in `markdown/layout.ts` that
promised the switch is fulfilled and shortened. Published pages cite
`docs/*.md`, never this note or the issue.

### Order

Bottom up, each step green on its own: primitives and `Buffer` → measuring and
wrapping → paint and selection → backends → editor and fields → the remaining
components → docs and CHANGELOG. Between "paint" and "backends" the screen is
temporarily worse (paint reserves, the backend still writes `\b`), so this is
one branch and one PR, not a series.
