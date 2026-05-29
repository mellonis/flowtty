import { Buffer as NodeBuffer } from 'node:buffer';
import type { Buffer, Style } from '../cells.js';
import type { Key } from '../keys.js';
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, CLEAR, HIDE_CURSOR, RESET, SHOW_CURSOR, sgr } from '../ansi.js';
import { parseKeypress } from '../key-parser.js';
import type { Backend } from './types.js';

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
    for (const h of [...this.resizeSubscribers]) h();
  };
  private resizeAttached = false;

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
