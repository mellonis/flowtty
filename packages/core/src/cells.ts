import type { Color } from './colors.js';
import { clusterWidth } from './graphemes.js';
import { noteWarning } from './warnings.js';
export interface Style {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
  /**
   * Target URL for an OSC 8 terminal hyperlink. Backends that can emit
   * clickable links (TTY / inline TTY) wrap this cell's char in the hyperlink
   * escape; backends that can't (headless test surface) ignore it. Carried in
   * Style so it threads through the same paint + diff path as visual attrs.
   */
  link?: string;
}

export interface Cell {
  /**
   * One grapheme cluster of display width 1 or 2 (`clusterWidth`), `''` for
   * the continuation column of the wide cluster in the cell to its left (it
   * carries the lead's style), or `' '` filler. Readers that concatenate chars
   * get the row's text for free; a backend skips `''` — the terminal advanced
   * over that column when it drew the lead. See docs/terminal.md (display width).
   */
  char: string;
  style: Style;
}

/**
 * "The text painted in `[x0, x1)` of row `y` carries on at column `x0` of row
 * `y + 1`, with no line break between them in the source."
 *
 * Per span rather than per row, because one row of a multi-pane layout holds
 * several boxes side by side and only one of them may be wrapping: a flag on
 * the whole row would splice the neighbour's text into the paragraph.
 *
 * `join` is the text the wrap dropped at the break — `' '` (or a longer run) at
 * a word boundary, `''` for a cut through a long word — so the source can be
 * put back together character for character.
 *
 * `x1` is where the row's painted TEXT ends, not where its box does: a trailing
 * space inside the span is content the copy keeps, and the cells past it are
 * padding it trims. See docs/input.md (selection).
 */
export interface ContinuationMark {
  y: number;
  x0: number;
  /** Exclusive, as everywhere else in the cell grid. */
  x1: number;
  join: string;
}

export class Buffer {
  readonly width: number;
  readonly height: number;
  private readonly cells: Cell[];
  // Keyed by row, so reading the marks of one row costs nothing on a frame that
  // has thousands. A Buffer is built fresh by each paint and never reused
  // across frames, so marks are only ever cleared by being left behind with the
  // frame they described; `clone()` is the one place they have to travel.
  private continuations: Map<number, ContinuationMark[]> | null = null;

  constructor(width: number, height: number) {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.cells = Array.from({ length: this.width * this.height }, () => ({
      char: ' ',
      style: {},
    }));
  }

  /**
   * Write one cluster at (x, y). A wide cluster takes this cell and the next
   * (`''`); at the right edge, where it cannot, a blank is written instead.
   * Whichever half of an existing wide cluster this write lands on, the other
   * half becomes a blank in its old style — half a glyph is never left behind.
   * A zero-width cluster (a lone combining mark) has no cell and is stored as
   * a blank; `''` is not accepted, it is what `set` writes, never what it takes.
   */
  set(x: number, y: number, char: string, style: Style = {}): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (char === '') {
      noteWarning('flowtty: Buffer.set was given an empty char; the continuation of a wide glyph is written by set itself. The call was ignored.');
      return;
    }
    const cells = this.cells;
    const i = y * this.width + x;
    this.untear(i, x);
    let w = clusterWidth(char);
    if (w === 0) { char = ' '; w = 1; }
    if (w === 2) {
      if (x + 1 >= this.width) { cells[i] = { char: ' ', style }; return; }
      // The cell to the right becomes this cluster's continuation; if it was
      // the lead of another wide cluster, that one's continuation is orphaned.
      this.untear(i + 1, x + 1);
      cells[i] = { char, style };
      cells[i + 1] = { char: '', style };
      return;
    }
    cells[i] = { char, style };
  }

  // Cell `i` (at column `x`) is about to be overwritten: if it is one half of
  // a wide cluster, blank the other half so the frame never shows a torn glyph.
  private untear(i: number, x: number): void {
    const cells = this.cells;
    if (cells[i]!.char === '') {
      cells[i - 1] = { char: ' ', style: cells[i - 1]!.style }; // a continuation never sits in column 0
    } else if (x + 1 < this.width && cells[i + 1]!.char === '') {
      cells[i + 1] = { char: ' ', style: cells[i + 1]!.style };
    }
  }

  // Out-of-bounds reads return a fresh blank cell (mirrors set()'s no-op).
  get(x: number, y: number): Cell {
    return this.cells[y * this.width + x] ?? { char: ' ', style: {} };
  }

  /**
   * A copy that can be restyled without touching this buffer — what a renderer
   * uses to lay an overlay over a frame a backend is already diffing against.
   *
   * Cells are treated as immutable: `set` replaces a cell rather than editing
   * it, so the copy may share cell objects until it is written to.
   */
  clone(): Buffer {
    const copy = new Buffer(this.width, this.height);
    for (let i = 0; i < this.cells.length; i++) copy.cells[i] = this.cells[i]!;
    if (this.continuations !== null) {
      // Per-row arrays copied, not shared: an overlay drawn on the clone must
      // not be able to add a mark to the frame a backend is still diffing.
      copy.continuations = new Map();
      for (const [y, marks] of this.continuations) copy.continuations.set(y, [...marks]);
    }
    return copy;
  }

  /**
   * Record that a painted span carries on at the start of the next row — see
   * {@link ContinuationMark}. The painter calls this for a line a soft wrap
   * produced, and for a box whose `wrapContinues` prop says the component laid
   * the wrap out itself. A mark on a row this buffer does not have is dropped,
   * mirroring `set()`'s out-of-bounds no-op.
   */
  markContinuation(mark: ContinuationMark): void {
    if (mark.y < 0 || mark.y >= this.height) return;
    this.continuations ??= new Map();
    const row = this.continuations.get(mark.y);
    if (row === undefined) this.continuations.set(mark.y, [mark]);
    else row.push(mark);
  }

  /** The continuation marks recorded on row `y`, in paint order. */
  continuationsAt(y: number): readonly ContinuationMark[] {
    return this.continuations?.get(y) ?? [];
  }

  // Plain-text frame. Trailing ASCII spaces are trimmed (cosmetic), but NBSP
  // (U+00A0) and other content are preserved — NBSP-safety is a flowtty value.
  // A continuation cell (`''`) vanishes in the concatenation, as it takes no
  // extra column on screen.
  toString(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      for (let x = 0; x < this.width; x++) line += this.get(x, y).char;
      lines.push(line.replace(/ +$/u, '')); // ASCII space only, NOT \s
    }
    return lines.join('\n').replace(/\n+$/u, '');
  }
}
