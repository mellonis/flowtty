import { Buffer as NodeBuffer } from 'node:buffer';
import type { Buffer, Style, Backend, Key } from '@flowtty/core';
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, CLEAR, HIDE_CURSOR, RESET, SHOW_CURSOR, cellsEqual, cursorTo, sgr } from './ansi.js';
import { parseKeypress } from './key-parser.js';

export class TtyBackend implements Backend {
  private readonly subscribers = new Set<(key: Key) => void>();
  // Arrow-property so `removeListener` finds the same reference we added.
  // `NodeBuffer` avoids the name-clash with our cells `Buffer` import.
  private readonly inputDataHandler = (chunk: NodeBuffer | string): void => {
    const s = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const keys = parseKeypress(s);
    for (const key of keys) {
      // Ctrl-C / Ctrl-D in raw mode are delivered as keypresses (NOT signals —
      // raw mode swallows SIGINT). Default-handle them as "exit with restore"
      // so apps aren't unkillable. Apps wanting custom behavior can wrap
      // TtyBackend or implement their own backend.
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        this.dispose();
        process.exit(130);
      }
      for (const h of [...this.subscribers]) h(key);
    }
  };
  private inputAttached = false;
  private terminalEntered = false;
  private readonly resizeSubscribers = new Set<() => void>();
  private readonly resizeNotify = (): void => {
    // Invalidate the diff baseline — the next paint will likely use new dimensions
    // and previous cell coordinates would be wrong against the resized terminal.
    this.previousBuffer = null;
    for (const h of [...this.resizeSubscribers]) h();
  };
  private resizeAttached = false;
  private previousBuffer: Buffer | null = null;

  constructor(
    private readonly out: NodeJS.WriteStream = process.stdout,
    private readonly input: NodeJS.ReadStream = process.stdin,
  ) {
    // Enter the alternate screen buffer + hide cursor, atomic write.
    // Alt-screen ensures full-frame redraws happen in place and the user's
    // pre-launch terminal content is restored on dispose.
    this.out.write(ALT_SCREEN_ON + HIDE_CURSOR);
    this.terminalEntered = true;
  }

  size() {
    return { width: this.out.columns ?? 80, height: this.out.rows ?? 24 };
  }

  draw(buffer: Buffer): void {
    if (
      this.previousBuffer === null ||
      this.previousBuffer.width !== buffer.width ||
      this.previousBuffer.height !== buffer.height
    ) {
      this.drawFull(buffer);
    } else {
      this.drawDiff(this.previousBuffer, buffer);
    }
    this.previousBuffer = buffer;
  }

  // Extracted from the original draw — full-frame redraw with CLEAR and per-line
  // SGR runs. Used on the first frame and after size changes.
  private drawFull(buffer: Buffer): void {
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

  // Emit only cells that differ from `prev`. Adjacency optimization: when the
  // previous emitted cell was at (x-1, y), skip the cursor positioning for the
  // next cell — characters flow naturally to the right after a write.
  // Style state is tracked across all changes so we only emit SGR when needed.
  private drawDiff(prev: Buffer, next: Buffer): void {
    let out = '';
    // The terminal pen is always at RESET after a drawFull or drawDiff call
    // (both end with a trailing RESET). Initialize the pen to the default/reset
    // style so we skip needless RESET+sgr for cells that carry an empty style.
    let penStyle: Style = {};
    let lastX = -2;
    let lastY = -2;

    for (let y = 0; y < next.height; y++) {
      for (let x = 0; x < next.width; x++) {
        const a = prev.get(x, y);
        const b = next.get(x, y);
        if (cellsEqual(a, b)) continue;

        // Cursor move iff this cell isn't immediately right of the prior emitted one.
        if (!(y === lastY && x === lastX + 1)) {
          out += cursorTo(x, y);
        }
        // Style change iff the pen's style doesn't already match.
        if (JSON.stringify(b.style) !== JSON.stringify(penStyle)) {
          out += RESET + sgr(b.style);
          penStyle = b.style;
        }
        out += b.char;
        lastX = x;
        lastY = y;
      }
    }

    if (out !== '') {
      this.out.write(out + RESET);
    }
  }

  onResize(handler: () => void): () => void {
    // Lazy: only attach the underlying 'resize' listener when the first
    // subscriber arrives. `tty.WriteStream` emits 'resize' on SIGWINCH.
    if (!this.resizeAttached) {
      this.out.on('resize', this.resizeNotify);
      this.resizeAttached = true;
    }
    this.resizeSubscribers.add(handler);
    return () => { this.resizeSubscribers.delete(handler); };
  }

  onKey(handler: (key: Key) => void): () => void {
    // Lazy: only flip stdin into raw mode + attach when the first subscriber arrives,
    // so a passive view backend doesn't claim the terminal.
    if (!this.inputAttached) {
      if (this.input.isTTY) this.input.setRawMode(true);
      this.input.on('data', this.inputDataHandler);
      this.input.resume();
      this.inputAttached = true;
    }
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
      // Intentionally do NOT detach on unsubscribe — render() always unsubs
      // on unmount, and dispose() (not unsubscribe) owns lifecycle cleanup.
    };
  }

  dispose(): void {
    if (this.inputAttached) {
      this.input.removeListener('data', this.inputDataHandler);
      if (this.input.isTTY) this.input.setRawMode(false);
      this.input.pause();
      this.inputAttached = false;
    }
    if (this.resizeAttached) {
      this.out.removeListener('resize', this.resizeNotify);
      this.resizeAttached = false;
    }
    if (this.terminalEntered) {
      // Show cursor + reset SGR while still in alt-screen, then exit alt-screen
      // so the user's original terminal content returns clean.
      this.out.write(SHOW_CURSOR + RESET + ALT_SCREEN_OFF);
      this.terminalEntered = false;
    }
  }
}
