import type { Backend, Buffer } from '@flowtty/react';

/**
 * A backend for when there is no terminal: it shows nothing while the app runs,
 * and prints the LAST frame as plain text when the app is done. Enough for
 * `mycli --report | tee log` — the same components, one static page.
 *
 * It implements only what the contract requires (`size`, `draw`) plus `dispose`.
 * No `onKey`: nobody is typing, so `useInput` handlers simply never fire.
 */
export class FinalFrameBackend implements Backend {
  // Not a full-screen surface: components that need one (Menu, non-floating
  // dialogs) check this flag and step aside.
  readonly fullScreen = false;
  private last = '';

  constructor(
    private readonly columns = 80,
    private readonly rows = 24,
    private readonly write: (text: string) => void = (text) => { process.stdout.write(text); },
  ) {}

  size(): { width: number; height: number } {
    return { width: this.columns, height: this.rows };
  }

  // Called after every commit with the whole frame. A real terminal backend
  // diffs it against the previous one; this one just remembers it.
  draw(buffer: Buffer): void {
    this.last = buffer.toString();
  }

  // render()'s unmount — and its error and signal paths — end here.
  dispose(): void {
    if (this.last !== '') this.write(`${this.last}\n`);
    this.last = '';
  }
}
