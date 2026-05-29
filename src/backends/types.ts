import type { Buffer } from '../cells.js';
import type { Key } from '../keys.js';

// The seam every renderer backend implements. Drawing is required; key input
// is optional (a passive view backend may render without ever sending keys).
export interface Backend {
  size(): { width: number; height: number };
  draw(buffer: Buffer): void;
  /**
   * Subscribe to raw key events. Returns an unsubscribe function.
   * Backends without an input source omit this method.
   */
  onKey?(handler: (key: Key) => void): () => void;
  dispose?(): void;
}
