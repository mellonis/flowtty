import type { Color } from './colors.js';
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
  char: string; // one display column (M0 assumes width-1 glyphs)
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

  set(x: number, y: number, char: string, style: Style = {}): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = { char, style };
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
