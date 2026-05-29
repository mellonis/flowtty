import type { Buffer } from '../cells.js';
import type { Key } from '../keys.js';
import type { Backend } from './types.js';

export class TestBackend implements Backend {
  frames: string[] = [];
  private readonly subscribers = new Set<(key: Key) => void>();

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

  get lastFrame(): string {
    return this.frames[this.frames.length - 1] ?? '';
  }

  onKey(handler: (key: Key) => void): () => void {
    this.subscribers.add(handler);
    return () => { this.subscribers.delete(handler); };
  }

  /** Synchronously deliver one Key to every subscriber. */
  press(key: Partial<Key> & { name: string }): void {
    const k: Key = {
      sequence: key.sequence ?? '',
      ctrl: key.ctrl ?? false,
      meta: key.meta ?? false,
      shift: key.shift ?? false,
      name: key.name,
    };
    for (const h of [...this.subscribers]) h(k);
  }

  /** Emit one Key per character; printable chars only. */
  type(text: string): void {
    for (const ch of text) this.press({ name: ch, sequence: ch });
  }
}
