import { Buffer } from '../cells.js';
import { NAMED_KEYS, type Key } from '../keys.js';
import type { Backend } from '../backend.js';

// Common guesses, mapped to the name the decoder actually produces.
const KEY_NAME_HINTS: Record<string, string> = {
  space: ' ', enter: 'return', esc: 'escape', del: 'delete', ins: 'insert',
  pgup: 'pageup', pgdn: 'pagedown', pgdown: 'pagedown', bs: 'backspace',
};

function assertRealKeyName(name: string): void {
  // One code point = a printable key; csi-* = the parser's name for an unknown sequence.
  if ([...name].length === 1 || name.startsWith('csi-')) return;
  if ((NAMED_KEYS as readonly string[]).includes(name)) return;
  const hint = KEY_NAME_HINTS[name.toLowerCase()];
  throw new Error(
    `TestBackend.press: '${name}' is not a key name any terminal produces`
    + (hint !== undefined ? ` — use '${hint}'.` : `. A printable key is named by its character (':' not 'colon'); named keys: ${NAMED_KEYS.join(', ')}.`),
  );
}

export class TestBackend implements Backend {
  frames: string[] = [];
  /** How many times the app rang the bell. Nothing is written anywhere. */
  bells: number = 0;
  /** Every notification the app posted, in order — `body` absent when it was. */
  notifications: { title: string; body?: string }[] = [];
  private buffers: Buffer[] = [];
  private readonly subscribers = new Set<(key: Key) => void>();

  constructor(
    private readonly cols = 40,
    private readonly rows = 10,
  ) {}

  size(): { width: number; height: number } {
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

  /**
   * Synchronously deliver one Key to every subscriber. Throws on a name no
   * terminal can produce (`'space'`, `'enter'`): a test that presses such a key
   * exercises a branch real input never reaches, and would pass anyway.
   */
  press(key: Partial<Key> & { name: string }): void {
    assertRealKeyName(key.name);
    const k: Key = {
      ...(key.text !== undefined ? { text: key.text } : {}),
      ...(key.x !== undefined ? { x: key.x } : {}),
      ...(key.y !== undefined ? { y: key.y } : {}),
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

  /** Count a bell instead of writing one. */
  bell(): void {
    this.bells += 1;
  }

  /** Record a notification instead of posting one. The text is kept exactly as
   *  the app passed it — sanitizing is a TTY backend's job, and a test wants to
   *  see what the app asked for. */
  notify(title: string, body?: string): void {
    this.notifications.push(body === undefined ? { title } : { title, body });
  }

  /** Deliver one mouse-wheel step at cell (x, y) — what a TTY backend with `mouse` on emits. */
  wheel(direction: 'up' | 'down', x = 0, y = 0): void {
    this.press({ name: direction === 'up' ? 'wheelup' : 'wheeldown', x, y });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  dispose(): void {}
}
