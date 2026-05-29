import type { Buffer, Style } from '../cells.js';
import { CLEAR, HIDE_CURSOR, RESET, SHOW_CURSOR, sgr } from '../ansi.js';
import type { Backend } from './types.js';

export class TtyBackend implements Backend {
  constructor(private readonly out: NodeJS.WriteStream = process.stdout) {
    this.out.write(HIDE_CURSOR);
  }

  size() {
    return { width: this.out.columns ?? 80, height: this.out.rows ?? 24 };
  }

  // M0: full-frame redraw (no diffing). Clears, then writes every line with
  // per-cell SGR. Frame-diffing is a later optimization behind this same seam.
  draw(buffer: Buffer): void {
    let outStr = CLEAR;
    for (let y = 0; y < buffer.height; y++) {
      let line = '';
      let last: Style | null = null;
      for (let x = 0; x < buffer.width; x++) {
        const cell = buffer.get(x, y);
        const styleStr = sgr(cell.style);
        if (JSON.stringify(cell.style) !== JSON.stringify(last)) {
          line += RESET + styleStr;
          last = cell.style;
        }
        line += cell.char;
      }
      outStr += line + RESET + (y < buffer.height - 1 ? '\n' : '');
    }
    this.out.write(outStr);
  }

  dispose(): void {
    this.out.write(SHOW_CURSOR + RESET);
  }
}
