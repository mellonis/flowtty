import type { Buffer } from '../cells.js';
import type { Backend } from './types.js';

export class TestBackend implements Backend {
  frames: string[] = [];
  constructor(
    private readonly cols = 40,
    private readonly rows = 10,
  ) {}

  size() {
    return { width: this.cols, height: this.rows };
  }

  draw(buffer: Buffer): void {
    this.frames.push(buffer.toString());
  }

  // The most recent captured frame as plain text.
  get lastFrame(): string {
    return this.frames[this.frames.length - 1] ?? '';
  }
}
