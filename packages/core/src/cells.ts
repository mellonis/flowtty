export interface Style {
  fg?: string;
  bg?: string;
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

export class Buffer {
  readonly width: number;
  readonly height: number;
  private readonly cells: Cell[];

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
