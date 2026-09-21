import { Buffer as NodeBuffer } from 'node:buffer';
import { stringWidth, takeWarnings, type Buffer, type Style, type Backend, type Key } from '@flowtty/core';
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, BRACKETED_PASTE_OFF, BRACKETED_PASTE_ON, CLEAR, MOUSE_OFF, MOUSE_ON, HIDE_CURSOR, OSC8_CLOSE, RESET, SHOW_CURSOR, cellsEqual, cursorTo, detectColorSupport, osc8Open, sgr, takeUnknownColors } from './ansi.js';
import { detectHyperlinkSupport } from './hyperlinks.js';
import { decodeKeys } from './key-parser.js';
import { isInteractive, NotInteractiveError } from './interactive.js';
import { detectColorDepth, type ColorDepth } from './colorDepth.js';
import { createAttention, type Attention, type NotificationProtocol } from './notification.js';

export interface TtyBackendOptions {
  /**
   * Report the mouse wheel as 'wheelup' / 'wheeldown' keys. Off by default:
   * while mouse reporting is on, the terminal hands drag-to-select to the app,
   * so users lose native text selection (most terminals restore it with Shift
   * or Option held).
   */
  mouse?: boolean;
  /** Emit color. Default: from the environment — off when `NO_COLOR` is set,
   *  `FORCE_COLOR` overriding it (see `detectColorSupport`). Bold, dim, underline
   *  and inverse are emitted either way. */
  color?: boolean;
  /** Color depth in bits: 4 (16 colors), 8 (256) or 24 (truecolor). Default: from
   *  the environment (`detectColorDepth`) — truecolor only where the terminal
   *  announces it. `#hex` / `rgb()` colors are brought down to fit. */
  colorDepth?: ColorDepth;
  /** Which escape sequence `notify()` posts a desktop notification with.
   *  `'auto'` (the default) picks one from the environment
   *  (`detectNotificationProtocol`); `'none'` never posts one — and, unlike an
   *  auto-detected `'none'`, does not fall back to the bell. `bell()` is
   *  unaffected. See docs/terminal.md (notifications). */
  notifications?: NotificationProtocol | 'auto';
}

export class TtyBackend implements Backend {
  /** Capability flag — whether the *terminal* honors the OSC 8 hyperlinks this
   *  backend emits, so <Link> renders clickable instead of falling back to a
   *  printed URL. Sniffed from the environment (Apple Terminal.app, e.g., emits
   *  the bytes but never makes them clickable). The painter writes OSC 8
   *  unconditionally regardless of this flag — it only governs <Link> fallback. */
  readonly hyperlinks: boolean = detectHyperlinkSupport();
  private readonly sgrOptions: { color: boolean; depth: ColorDepth };

  private readonly subscribers = new Set<(key: Key) => void>();
  // Carries an incomplete escape sequence from one stdin chunk to the next, so
  // a sequence split across reads decodes as one key rather than a stray Escape.
  private pendingInput = '';
  // Arrow-property so `removeListener` finds the same reference we added.
  // `NodeBuffer` avoids the name-clash with our cells `Buffer` import.
  private readonly inputDataHandler = (chunk: NodeBuffer | string): void => {
    const s = this.pendingInput + (typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    const { keys, rest } = decodeKeys(s);
    this.pendingInput = rest;
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
  // The bell + desktop notifications. Assigned in the constructor rather than
  // here, because it reads `options` — a constructor parameter property.
  private readonly attention: Attention;
  private disposed = false;

  constructor(
    private readonly out: NodeJS.WriteStream = process.stdout,
    private readonly input: NodeJS.ReadStream = process.stdin,
    private readonly options: TtyBackendOptions = {},
  ) {
    // A full-screen app cannot degrade: without a terminal there is nowhere to
    // repaint and no keys to read, and what a piped run should print is the
    // app's call, not the backend's. Fail before writing a single byte, so a log
    // never fills with control sequences. (`isInteractive` lets an app branch first.)
    if (!isInteractive(out)) throw new NotInteractiveError(out);
    this.sgrOptions = { color: options.color ?? detectColorSupport(), depth: options.colorDepth ?? detectColorDepth() };
    // Enter the alternate screen buffer + hide cursor, atomic write.
    // Alt-screen ensures full-frame redraws happen in place and the user's
    // pre-launch terminal content is restored on dispose.
    this.out.write(ALT_SCREEN_ON + HIDE_CURSOR);
    this.terminalEntered = true;
    this.attention = createAttention((bytes) => this.out.write(bytes), { notifications: options.notifications });
  }

  size(): { width: number; height: number } {
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
      // Active OSC 8 link for the current run. RESET doesn't close a hyperlink,
      // so we track it separately and close/reopen only on link transitions,
      // and force-close at end of line so it never bleeds into the next row.
      let lineLink: string | undefined;
      for (let x = 0; x < buffer.width; x++) {
        const cell = buffer.get(x, y);
        if (JSON.stringify(cell.style) !== JSON.stringify(last)) {
          if (lineLink !== undefined && lineLink !== cell.style.link) line += OSC8_CLOSE;
          line += RESET + sgr(cell.style, this.sgrOptions);
          if (cell.style.link !== undefined && cell.style.link !== lineLink) line += osc8Open(cell.style.link);
          last = cell.style;
          lineLink = cell.style.link;
        }
        line += cell.char;
        // Interim wide-char handling: the grid is one cell per code point, but
        // the terminal advances TWO columns for an East Asian Wide/emoji glyph.
        // Back the cursor up one so the next cell overwrites the glyph's second
        // column instead of the whole row shifting right. Accepts visual overlap
        // (the glyph's right half gets clobbered) to keep column alignment.
        if (stringWidth(cell.char) === 2) line += '\b';
      }
      if (lineLink !== undefined) line += OSC8_CLOSE;
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
    // Active OSC 8 link on the pen. Each draw call starts with no open link
    // (prior calls force-close before their trailing RESET), so we open/close
    // only the links touched by changed cells; already-painted linked cells
    // keep their association in the terminal and aren't disturbed.
    let penLink: string | undefined;
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
          if (penLink !== undefined && penLink !== b.style.link) out += OSC8_CLOSE;
          out += RESET + sgr(b.style, this.sgrOptions);
          if (b.style.link !== undefined && b.style.link !== penLink) out += osc8Open(b.style.link);
          penStyle = b.style;
          penLink = b.style.link;
        }
        out += b.char;
        // See drawFull: back the cursor up one after a wide glyph. lastX stays
        // `x` because \b leaves the cursor at physical x+1, so the adjacency
        // check still skips cursor positioning for a changed cell at x+1.
        if (stringWidth(b.char) === 2) out += '\b';
        lastX = x;
        lastY = y;
      }
    }

    if (out !== '') {
      if (penLink !== undefined) out += OSC8_CLOSE;
      this.out.write(out + RESET);
    }
  }

  /**
   * Ring the terminal bell, as one write, at most once per second — a loop
   * cannot turn the terminal into a buzzer, and the calls in between are
   * dropped rather than queued. Nothing is written once the backend is
   * disposed: the terminal is no longer ours.
   *
   * BEL moves no cursor and changes no cell, and goes out on its own write, so
   * ringing it between two frames leaves the frame-diff baseline valid.
   */
  bell(): void {
    if (this.disposed) return;
    this.attention.bell();
  }

  /**
   * Post a desktop notification, as one write. Title and body are sanitized
   * (controls stripped, one line, capped) and carried by the protocol the
   * `notifications` option chose. Where no protocol reaches the terminal — a
   * multiplexer, a bare console — this rings the bell instead, unless
   * `notifications: 'none'` asked for silence. Nothing is written after
   * dispose. See docs/app.md (getting attention).
   */
  notify(title: string, body?: string): void {
    if (this.disposed) return;
    this.attention.notify(title, body);
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
      // Only a backend that reads keys asks for bracketed paste; dispose() undoes it.
      this.out.write(BRACKETED_PASTE_ON + (this.options.mouse ? MOUSE_ON : ''));
    }
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
      // Intentionally do NOT detach on unsubscribe — render() always unsubs
      // on unmount, and dispose() (not unsubscribe) owns lifecycle cleanup.
    };
  }

  dispose(): void {
    // Set first: from here on the terminal is being handed back, so a late
    // bell() or notify() has nowhere to write.
    this.disposed = true;
    if (this.inputAttached) {
      this.input.removeListener('data', this.inputDataHandler);
      if (this.input.isTTY) this.input.setRawMode(false);
      this.input.pause();
      this.inputAttached = false;
      this.pendingInput = '';
      this.out.write((this.options.mouse ? MOUSE_OFF : '') + BRACKETED_PASTE_OFF);
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
    // Only now is it safe to print: the alt screen is gone.
    // eslint-disable-next-line no-console
    for (const warning of takeWarnings()) console.warn(warning);
    const unknown = takeUnknownColors();
    if (unknown.length > 0) {
      console.warn(`flowtty: unknown color name${unknown.length > 1 ? 's' : ''} ignored: ${unknown.join(', ')} — use a named color, '#rgb' / '#rrggbb' or 'rgb(r, g, b)'.`);
    }
  }
}
