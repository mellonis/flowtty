// Drag-to-select over the committed frame: the geometry, the text it yields,
// the overlay that shows it, and the controller that drives all three from
// mouse keys. Pure with respect to React — a render root owns one controller
// and feeds it keys and frames. See docs/input.md (selection).
import { Buffer, type ContinuationMark, type Style } from '../cells.js';
import type { Key } from '../keys.js';
import type { Container } from './host.js';
import type { Rect } from './layout.js';
import { contentRectOf, intersectRects } from './geometry.js';
import { unselectableProbe } from './hitTest.js';

/** A cell of the frame, 0-based — the coordinates mouse keys and `onLayout` use. */
export interface Point {
  x: number;
  y: number;
}

/** Where a drag started, where it is now, and what bounds it. Both ends are
 *  already clamped into `clip`. */
export interface SelectionRange {
  anchor: Point;
  head: Point;
  /** The rect the selection may never leave — a `selectionScope`'s content rect,
   *  or the whole frame when nothing scopes it. */
  clip: Rect;
  /** Rects a `selectable={false}` box takes out of it. */
  excluded: readonly Rect[];
}

/** A run of selected cells on one row. `x1` is exclusive. */
export interface SelectionSegment {
  y: number;
  x0: number;
  x1: number;
}

/** One row of a selection. An empty `parts` means every cell of that row fell
 *  inside an excluded rect — the row was skipped, not merely blank. */
export interface SelectionRow {
  y: number;
  parts: readonly SelectionSegment[];
}

/** The scope a press at a given cell selects within. */
export interface SelectionScope {
  clip: Rect;
  excluded: readonly Rect[];
}

/** Pull a point into a rect, so a drag that leaves a pane selects to its edge
 *  rather than into the neighbour. */
export function clampToRect(point: Point, rect: Rect): Point {
  return {
    x: Math.max(rect.left, Math.min(rect.left + rect.width - 1, point.x)),
    y: Math.max(rect.top, Math.min(rect.top + rect.height - 1, point.y)),
  };
}

// Remove [cut0, cut1) from an ordered, disjoint list of runs.
function subtractRun(parts: SelectionSegment[], cut0: number, cut1: number): SelectionSegment[] {
  const out: SelectionSegment[] = [];
  for (const part of parts) {
    if (cut1 <= part.x0 || cut0 >= part.x1) { out.push(part); continue; }
    if (cut0 > part.x0) out.push({ y: part.y, x0: part.x0, x1: cut0 });
    if (cut1 < part.x1) out.push({ y: part.y, x0: cut1, x1: part.x1 });
  }
  return out;
}

/**
 * The selection row by row, in reading order. Stream semantics inside the clip
 * rect: from the anchor to the current cell, both ends inclusive, with the rows
 * between them spanning the clip rect's width — its width only, so a scoped
 * selection never reaches the neighbouring pane or the border between them.
 */
export function selectionRows(range: SelectionRange): SelectionRow[] {
  const { clip } = range;
  const right = clip.left + clip.width;
  let from = range.anchor;
  let to = range.head;
  if (to.y < from.y || (to.y === from.y && to.x < from.x)) [from, to] = [to, from];

  const rows: SelectionRow[] = [];
  for (let y = from.y; y <= to.y; y++) {
    const x0 = y === from.y ? from.x : clip.left;
    const x1 = (y === to.y ? to.x + 1 : right);
    if (x1 <= x0) continue;
    let parts: SelectionSegment[] = [{ y, x0, x1 }];
    for (const rect of range.excluded) {
      if (y < rect.top || y >= rect.top + rect.height) continue;
      parts = subtractRun(parts, rect.left, rect.left + rect.width);
    }
    rows.push({ y, parts });
  }
  return rows;
}

/** The selection as a flat list of cell runs — what the overlay paints. */
export function selectionSegments(range: SelectionRange): SelectionSegment[] {
  return selectionRows(range).flatMap((row) => [...row.parts]);
}

// The selectable parts of one full row of the scope: the clip's width with
// the excluded rects taken out — what a word or a line is bounded by.
function rowParts(scope: SelectionScope, y: number): SelectionSegment[] {
  const { clip } = scope;
  if (y < clip.top || y >= clip.top + clip.height) return [];
  const [row] = selectionRows({
    anchor: { x: clip.left, y }, head: { x: clip.left + clip.width - 1, y }, clip, excluded: scope.excluded,
  });
  return row === undefined ? [] : [...row.parts];
}

/**
 * The word under a cell: the run of non-space cells around it on that row,
 * bounded by the scope's clip and its excluded regions — the range a
 * double-click selects. Null on a blank cell, and on a cell nothing selectable
 * covers. Punctuation counts as word characters. See docs/input.md (selection).
 */
export function wordAt(buffer: Buffer, scope: SelectionScope, x: number, y: number): SelectionRange | null {
  const part = rowParts(scope, y).find((p) => x >= p.x0 && x < p.x1);
  if (part === undefined || buffer.get(x, y).char === ' ') return null;
  let x0 = x;
  while (x0 > part.x0 && buffer.get(x0 - 1, y).char !== ' ') x0--;
  let x1 = x;
  while (x1 + 1 < part.x1 && buffer.get(x1 + 1, y).char !== ' ') x1++;
  return { anchor: { x: x0, y }, head: { x: x1, y }, clip: scope.clip, excluded: scope.excluded };
}

/**
 * The line under a cell: the whole row within the scope, extended up and down
 * over the rows a soft wrap joins to it (see {@link rowContinuation}), so a
 * wrapped paragraph is one line — the range a triple-click selects. Null on a
 * cell outside the scope and on a row nothing selectable covers.
 * See docs/input.md (selection).
 */
export function lineAt(buffer: Buffer, scope: SelectionScope, x: number, y: number): SelectionRange | null {
  const { clip } = scope;
  const rowAt = (row: number): SelectionRow | null => {
    const parts = rowParts(scope, row);
    return parts.length === 0 ? null : { y: row, parts };
  };
  if (x < clip.left || x >= clip.left + clip.width || rowAt(y) === null) return null;
  let top = y;
  for (;;) {
    const above = rowAt(top - 1);
    if (above === null || rowContinuation(buffer, above, rowAt(top)!) === null) break;
    top--;
  }
  let bottom = y;
  for (;;) {
    const below = rowAt(bottom + 1);
    if (below === null || rowContinuation(buffer, rowAt(bottom)!, below) === null) break;
    bottom++;
  }
  return {
    anchor: { x: clip.left, y: top },
    head: { x: clip.left + clip.width - 1, y: bottom },
    clip,
    excluded: scope.excluded,
  };
}

// Does `row`'s selection end exactly where a continuation span ends — covering
// its last cell, and picking up nothing but blanks past it? Blanks are allowed
// because a selection row always runs to the clip's edge while a painted line
// usually stops short of it, and `selectionText` trims them away anyway.
function endsAtSpan(buffer: Buffer, row: SelectionRow, x1: number): boolean {
  let covered = false;
  for (const part of row.parts) {
    for (let x = part.x0; x < part.x1; x++) {
      if (x === x1 - 1) covered = true;
      else if (x >= x1 && buffer.get(x, row.y).char !== ' ') return false;
    }
  }
  return covered;
}

// The mirror image, for the lower row: its selection starts at the continuation
// span, with nothing but blanks selected before it.
function startsAtSpan(buffer: Buffer, row: SelectionRow, x0: number): boolean {
  let covered = false;
  for (const part of row.parts) {
    for (let x = part.x0; x < part.x1; x++) {
      if (x === x0) covered = true;
      else if (x < x0 && buffer.get(x, row.y).char !== ' ') return false;
    }
  }
  return covered;
}

/**
 * The soft wrap that joins one selected row of `buffer` to the next, or null
 * when the two are separate lines. The mark carries what the wrap dropped at
 * the break and where the row's painted text ends — both of which
 * `selectionText` needs to put the source back together.
 *
 * A mark only applies when the selection covers that span and nothing else
 * that has text on it: `above` must end at the span and `below` must start at
 * it, with only blanks selected beyond either end. That is what keeps a wrapped
 * paragraph in one pane from swallowing the neighbouring pane's rows — there
 * the selection carries text past the span's end, and the two rows are separate
 * lines, exactly as the terminal's own selection would copy them.
 *
 * The one decision `selectionText` makes per row.
 */
export function rowContinuation(
  buffer: Buffer,
  above: SelectionRow,
  below: SelectionRow,
): ContinuationMark | null {
  if (below.y !== above.y + 1) return null;
  if (above.parts.length === 0 || below.parts.length === 0) return null;
  for (const mark of buffer.continuationsAt(above.y)) {
    if (endsAtSpan(buffer, above, mark.x1) && startsAtSpan(buffer, below, mark.x0)) return mark;
  }
  return null;
}

/** {@link rowContinuation} as the string that goes between the two rows: what
 *  the wrap dropped, or `'\n'` where they are separate lines. */
export function rowSeparator(buffer: Buffer, above: SelectionRow, below: SelectionRow): string {
  return rowContinuation(buffer, above, below)?.join ?? '\n';
}

// The selected cells of one row, as characters, taking only the cells in
// [from, to) of it. Blanks outside a continuation span are layout, not text.
function rowChars(buffer: Buffer, row: SelectionRow, from: number, to: number): string {
  let line = '';
  for (const part of row.parts) {
    for (let x = Math.max(part.x0, from); x < Math.min(part.x1, to); x++) {
      line += buffer.get(x, row.y).char;
    }
  }
  return line;
}

/**
 * The text of a selection, read out of the frame it was made on: the selected
 * cells of each row, rows joined by what the wrap dropped between them (see
 * {@link rowContinuation}) — so a soft-wrapped paragraph comes back as the one
 * line it was written as.
 *
 * Where a row does NOT carry on below, its trailing ASCII blanks are trimmed
 * (NBSP and every other character kept, as in `Buffer.toString`): a painted
 * blank at the end of a row cannot be told from the fill around it. Where it
 * does, the mark says where the painted text ends — everything up to there is
 * content, trailing space included, and only the padding past it is dropped.
 * Blanks selected to the LEFT of a continuation row's span go the same way,
 * whatever the join: they are the layout's (a pane's padding), never the
 * paragraph's. A row rejoined at a word boundary loses the blanks INSIDE the
 * span too — a list item's hanging indent, painted in the same box as the text
 * — because a wrap that broke at a space never starts the next line with one.
 * A hard cut keeps them: it cut through a run of characters where a blank is
 * the next character.
 *
 * A row a `selectable={false}` region took out WHOLE is skipped wherever it
 * falls: nothing of it was selectable, so it is frame, not a blank line of the
 * text. A row that is merely blank is a line — a paragraph break, an empty line
 * of code — kept inside the selection and dropped at its top and bottom, so a
 * drag to the bottom edge of a scope taller than its text comes back without
 * trailing newlines.
 */
export function selectionText(buffer: Buffer, range: SelectionRange): string {
  // A row where every cell in the clip was taken out is no line of the text at
  // all — a fence label, a menu bar: frame from edge to edge. A row that is
  // merely blank IS a line (a paragraph break, an empty line of code), and is
  // kept inside the selection and dropped at its edges below.
  const rows = selectionRows(range).filter((row) => row.parts.length > 0);
  const blank = rows.map((row) => !/[^ ]/u.test(rowChars(buffer, row, -Infinity, Infinity)));

  let start = 0;
  while (start < rows.length && blank[start]!) start++;
  let end = rows.length;
  while (end > start && blank[end - 1]!) end--;

  // One lookup per adjacent pair, reused for both rows it touches.
  const joins: (ContinuationMark | null)[] = rows.map(
    (row, i) => (i > start && i < end ? rowContinuation(buffer, rows[i - 1]!, row) : null),
  );

  let out = '';
  for (let i = start; i < end; i++) {
    const above = joins[i] ?? null;                         // joins this row to the one above
    const below = (i + 1 < end ? joins[i + 1] : null) ?? null; // and this one to the one below
    const from = above?.x0 ?? -Infinity;
    const to = below?.x1 ?? Infinity;
    let line = rowChars(buffer, rows[i]!, from, to);
    if (below === null) line = line.replace(/ +$/u, ''); // ASCII space only, NOT \s
    if (above !== null && above.join !== '') line = line.replace(/^ +/u, '');
    if (above !== null) out += above.join;
    else if (i > start) out += '\n';
    out += line;
  }
  return out;
}

/**
 * How one selected cell is drawn: a band with the text on it still readable —
 * what a terminal's own selection looks like.
 *
 * Only `inverse` can paint a band that suits the theme: nothing else names the
 * terminal's default colors, and the selection code names no color of its own.
 * Inverse swaps a cell's two slots, so a selected cell keeps its `fg` and `bg`
 * EXACTLY as they are and lets the terminal draw the band from the one and the
 * glyph from the other. The two colors of a cell contrast by construction —
 * that is what made the text readable before it was selected — so the swap
 * contrasts too: a plain cell is the default band with the glyph in the
 * default background; a cell whose `fg` is the box's inherited ink (see
 * docs/layout.md, inherited colors) is a band of that ink with the glyph in
 * the default background; white on a black panel is a white band with a black
 * glyph; a cyan token is a cyan band. Where the backend has no color at all
 * the band is all that is left, which is exactly right.
 *
 * The band is NOT uniform: it takes the color of the text on it. The earlier
 * rule moved `fg` into `bg` so that the band came out in the default foreground
 * everywhere and the glyph in the cell's own color — sound while most cells had
 * no `fg`, but once a box's `color` reaches every descendant nearly every cell
 * has one, chosen to sit close to the terminal's own foreground, and the glyph
 * then drowned in a band of the same color. Per-cell bands of contrasting pairs
 * are what stays readable on either theme.
 *
 * `dim` goes. SGR 2 and 7 combine differently across terminals — some faint the
 * color before the swap, some after — so a dim cell can come out as a hole in
 * the band, which is the patchiness this avoids. Bold, underline, strikethrough
 * and an OSC 8 link (so a selected link is still clickable) stay.
 *
 * A cell that was ALREADY inverse — a selected table row, a focused button, the
 * cursor — would vanish into the band, so it is drawn the other way round: not
 * inverse, keeping its own `fg` and `bg`. It shows the pair the way the box
 * around it does, a hole in the band, which is how it stays distinguishable.
 *
 * The one place the look of a selection is decided.
 */
export function selectedStyle(style: Style): Style {
  const out: Style = {};
  if (style.bold) out.bold = true;
  if (style.underline) out.underline = true;
  if (style.strikethrough) out.strikethrough = true;
  if (style.link !== undefined) out.link = style.link;
  if (style.fg !== undefined) out.fg = style.fg;
  if (style.bg !== undefined) out.bg = style.bg;
  // Set the key only when it is on: backends compare whole styles, and
  // `{ inverse: false }` would read as a change to every plain cell it is
  // compared against. An already-inverse cell is left un-inverted: inverting
  // it again would bury it in the band.
  if (!style.inverse) out.inverse = true;
  return out;
}

/**
 * The frame with the selection shown on it: every selected cell restyled by
 * {@link selectedStyle}. The given buffer is never touched — a backend may
 * still be diffing against it — and is handed straight back when there is
 * nothing to show.
 */
export function applySelection(buffer: Buffer, segments: readonly SelectionSegment[]): Buffer {
  if (segments.length === 0) return buffer;
  const out = buffer.clone();
  for (const seg of segments) {
    for (let x = seg.x0; x < seg.x1; x++) {
      const cell = buffer.get(x, seg.y);
      out.set(x, seg.y, cell.char, selectedStyle(cell.style));
    }
  }
  return out;
}

/**
 * What a press at cell (x, y) selects within: the nearest ancestor-or-self with
 * `selectionScope` bounds it to that box's content rect (inside its border and
 * padding, and inside every clipping ancestor); with none, to the whole frame.
 *
 * A press that lands on a `selectable={false}` region still anchors there —
 * dragging out of a code block's gutter, or off a password field into the text
 * beside it, is an ordinary gesture. What the region takes out is the copy, not
 * the drag: its cells are never highlighted and never read, so a press and
 * release inside one still yields nothing.
 *
 * The opted-out regions it reports are the ones painted AFTER the scope box —
 * its own subtree, and anything drawn over it later. A box painted BEFORE it is
 * behind it: a dialog over a menu bar marked `selectable={false}` covers the
 * bar, and a region nobody can see must not cut a hole in a selection made in
 * what covers it. A menu dropdown opened over a scoped pane is the mirror case
 * and is still taken out, because it is painted after. Paint order is the
 * traversal order of the walk, so "later" is exactly "on top".
 *
 * An unscoped drag selects the whole frame and takes every opted-out region
 * with it: it is the frame itself, and nothing was painted over it.
 *
 * What this does not model is transparency — a box painted after the scope but
 * leaving the cells under it alone (no background, no text) still takes its
 * rect out. Only per-cell ownership could tell those apart, and a selection
 * that dropped too little would copy chrome, which is the worse failure.
 */
export function selectionScopeAt(container: Container, x: number, y: number, frame: Rect): SelectionScope | null {
  const { path, regions } = unselectableProbe(container, x, y);

  let clip = frame;
  // -1 keeps every region: an unscoped drag has nothing painted over it.
  let scopeOrder = -1;
  for (let i = path.length - 1; i >= 0; i--) {
    const entry = path[i]!;
    if (entry.inst.props.selectionScope) {
      scopeOrder = entry.order;
      clip = intersectRects(entry.clip, contentRectOf(entry.inst, entry.rect));
      break;
    }
  }
  clip = intersectRects(clip, frame);
  if (clip.width <= 0 || clip.height <= 0) return null;

  const excluded = regions
    .filter((region) => region.order > scopeOrder)
    .map((region) => region.rect)
    .filter(
      (r) => r.left < clip.left + clip.width && r.left + r.width > clip.left
        && r.top < clip.top + clip.height && r.top + r.height > clip.top,
    );
  return { clip, excluded };
}

/** What a `SelectionController` needs from the render root that owns it. */
export interface SelectionHost {
  /** The laid-out tree, hit-tested when a press arrives. */
  container: Container;
  /** The last frame `paint` produced, WITHOUT the overlay. Null before the
   *  first one. */
  frame(): Buffer | null;
  /** The highlight changed and the frame on screen no longer shows it. Called
   *  only on an actual change; the host decides when to put it on screen, and
   *  can drop the request if a repaint gets there first. No layout and no
   *  re-render are involved either way — the same frame is redrawn. */
  present(): void;
  /** The text a finished drag selected. The seam the clipboard hangs off. */
  onSelect?: (text: string) => void;
}

/**
 * Render-root state, not React state: a drag re-runs the overlay and the draw,
 * nothing else.
 *
 * Left button only. `mousedown` anchors (and drops whatever was selected),
 * `mousedrag` extends, `mouseup` finishes and reports the text. A press and a
 * release on the same cell is a click and selects nothing. Any non-mouse key
 * drops a finished selection; the wheel does not, because content that scrolls
 * under a selection invalidates it through `observe` instead.
 */
export class SelectionController {
  private readonly host: SelectionHost;
  private range: SelectionRange | null = null;
  private dragging = false;
  private cached: SelectionSegment[] = [];
  /** The characters the selection covered when it was last computed — compared
   *  against each new frame, so a highlight never sits over text that changed. */
  private snapshot = '';
  private frameSize: { width: number; height: number } | null = null;

  constructor(host: SelectionHost) {
    this.host = host;
  }

  /** The cell runs currently highlighted. Empty when nothing is selected. */
  get segments(): readonly SelectionSegment[] {
    return this.cached;
  }

  /** Feed one key, before any `useInput` subscriber sees it. */
  handleKey(key: Key): void {
    switch (key.name) {
      case 'mousedown': this.press(key); return;
      case 'mousedrag': this.extend(key); return;
      case 'mouseup': this.release(); return;
      // The wheel is a mouse key, not a keystroke: it leaves a selection alone,
      // and the content check drops it if the pane under it actually scrolled.
      case 'wheelup': case 'wheeldown': return;
      default: this.drop();
    }
  }

  /** The frame with the overlay on it, or the frame itself when nothing is
   *  selected. */
  decorate(buffer: Buffer): Buffer {
    return applySelection(buffer, this.cached);
  }

  /**
   * A new frame was painted. Drops the selection when the cells under it now
   * hold different characters (a pane scrolled, a reply streamed in) or the
   * frame changed size; a repaint that leaves them alone (a spinner elsewhere)
   * keeps it.
   */
  observe(buffer: Buffer): void {
    if (this.cached.length === 0) return;
    const size = this.frameSize;
    if (size !== null && (buffer.width !== size.width || buffer.height !== size.height)) {
      this.clear();
      return;
    }
    if (charsOf(buffer, this.cached) !== this.snapshot) this.clear();
  }

  /** Drop the selection and end any drag, without redrawing — for a resize,
   *  where a full repaint follows anyway. */
  clear(): void {
    this.range = null;
    this.dragging = false;
    this.cached = [];
    this.snapshot = '';
    this.frameSize = null;
  }

  /** Select from `anchor` to `head` (frame cells, both inclusive) the way a
   *  drag between them would, within the anchor's scope, and report the text
   *  through `onSelect`. Returns the text; `''` when nothing there is
   *  selectable. See docs/app.md (selecting from code). */
  select(anchor: Point, head: Point): string {
    this.drop();
    const scope = this.scopeAt(anchor.x, anchor.y);
    if (scope === null) return '';
    return this.apply({
      anchor: clampToRect(anchor, scope.clip),
      head: clampToRect(head, scope.clip),
      clip: scope.clip,
      excluded: scope.excluded,
    });
  }

  /** Select the word under a cell — the double-click rule. Returns the text. */
  selectWord(x: number, y: number): string {
    this.drop();
    const scope = this.scopeAt(x, y);
    return scope === null ? '' : this.apply(wordAt(this.host.frame()!, scope, x, y));
  }

  /** Select the line under a cell, a wrapped paragraph as one — the
   *  triple-click rule. Returns the text. */
  selectLine(x: number, y: number): string {
    this.drop();
    const scope = this.scopeAt(x, y);
    return scope === null ? '' : this.apply(lineAt(this.host.frame()!, scope, x, y));
  }

  // Drop a selection and show the frame without it.
  private drop(): void {
    const had = this.cached.length > 0;
    this.clear();
    if (had) this.host.present();
  }

  private press(key: Key): void {
    this.drop(); // a new press always starts from nothing
    if (key.button !== undefined && key.button !== 'left') return;
    if (key.x === undefined || key.y === undefined) return;
    const scope = this.scopeAt(key.x, key.y);
    if (scope === null) return;
    // A double-click takes the word and a triple-click the line: the selection
    // is complete on the press, and the release that follows has nothing to do.
    if (key.clicks === 2 || key.clicks === 3) {
      const frame = this.host.frame()!;
      this.apply(key.clicks === 2 ? wordAt(frame, scope, key.x, key.y) : lineAt(frame, scope, key.x, key.y));
      return;
    }
    // The press may have landed on the scope's own border or padding; the
    // anchor belongs inside its content rect either way.
    const anchor = clampToRect({ x: key.x, y: key.y }, scope.clip);
    this.range = { anchor, head: anchor, clip: scope.clip, excluded: scope.excluded };
    this.dragging = true;
  }

  // The scope a press at (x, y) selects within, or null before the first frame.
  private scopeAt(x: number, y: number): SelectionScope | null {
    const frame = this.host.frame();
    if (frame === null) return null;
    return selectionScopeAt(this.host.container, x, y, { left: 0, top: 0, width: frame.width, height: frame.height });
  }

  // Show `range` as the finished selection and report its text; null, or a
  // range over nothing selectable, shows and reports nothing. Returns the text.
  private apply(range: SelectionRange | null): string {
    this.dragging = false;
    this.range = range;
    this.recompute();
    if (this.cached.length === 0) {
      this.range = null;
      return '';
    }
    this.host.present();
    const frame = this.host.frame();
    const text = frame === null ? '' : selectionText(frame, range!);
    this.host.onSelect?.(text);
    return text;
  }

  private extend(key: Key): void {
    const range = this.range;
    if (!this.dragging || range === null) return;
    if (key.x === undefined || key.y === undefined) return;
    const head = clampToRect({ x: key.x, y: key.y }, range.clip);
    if (head.x === range.head.x && head.y === range.head.y) return;
    this.range = { ...range, head };
    this.recompute();
    this.host.present();
  }

  private release(): void {
    if (!this.dragging) return;
    this.dragging = false;
    const range = this.range;
    // A press and a release on the same cell is a click, not a selection.
    if (range === null || (range.head.x === range.anchor.x && range.head.y === range.anchor.y)) {
      this.drop();
      return;
    }
    const frame = this.host.frame();
    this.host.onSelect?.(frame === null ? '' : selectionText(frame, range));
  }

  private recompute(): void {
    this.cached = this.range === null ? [] : selectionSegments(this.range);
    const frame = this.host.frame();
    this.snapshot = frame === null ? '' : charsOf(frame, this.cached);
    this.frameSize = frame === null ? null : { width: frame.width, height: frame.height };
  }
}

// The characters a selection covers, as one string — the cheap fingerprint the
// content check compares between frames.
function charsOf(buffer: Buffer, segments: readonly SelectionSegment[]): string {
  let out = '';
  for (const seg of segments) {
    for (let x = seg.x0; x < seg.x1; x++) out += buffer.get(x, seg.y).char;
  }
  return out;
}
