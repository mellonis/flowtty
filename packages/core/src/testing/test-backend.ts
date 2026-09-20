import { Buffer } from '../cells.js';
import type { Key } from '../keys.js';
import type { Backend } from '../backend.js';

export class TestBackend implements Backend {
  frames: string[] = [];
  private buffers: Buffer[] = [];
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
    this.buffers.push(buffer);
  }

  get lastFrame(): string {
    return this.frames[this.frames.length - 1] ?? '';
  }

  get lastBuffer(): Buffer | null {
    return this.buffers[this.buffers.length - 1] ?? null;
  }

  onKey(handler: (key: Key) => void): () => void {
    this.subscribers.add(handler);
    return () => { this.subscribers.delete(handler); };
  }

  /** Synchronously deliver one Key to every subscriber. */
  press(key: Partial<Key> & { name: string }): void {
    const k: Key = {
      ...(key.text !== undefined ? { text: key.text } : {}),
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

  /** Deliver `text` as ONE 'paste' key — what a TTY backend emits for a bracketed paste. */
  paste(text: string): void {
    this.press({ name: 'paste', text: text.replace(/\r\n?/g, '\n') });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  dispose(): void {}
}
