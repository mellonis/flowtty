import type { Buffer } from '../cells.js';

// The seam every renderer backend implements. M0 needs only size + draw.
export interface Backend {
  size(): { width: number; height: number };
  draw(buffer: Buffer): void;
  // Optional teardown (TTY restores the terminal; test backend is a no-op).
  dispose?(): void;
}
