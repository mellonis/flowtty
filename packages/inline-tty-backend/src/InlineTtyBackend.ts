import { Buffer as NodeBuffer } from 'node:buffer';
import { stringWidth, type Buffer, type Style, type Backend, type Key } from '@flowtty/core';
import {
  decodeKeys,
  detectHyperlinkSupport,
  RESET, HIDE_CURSOR, SHOW_CURSOR,
  OSC8_CLOSE, osc8Open,
  sgr,
} from '@flowtty/tty-backend';

export interface InlineTtyBackendOptions {
  /** Height in rows of the live region. Default 10. */
  liveHeight?: number;
  /**
   * Output stream; defaults to process.stdout. The stream's `.columns`
   * property is used for terminal width when present, falling back to 80.
   */
  out?: NodeJS.WriteStream;
  /** Input stream for keys; defaults to process.stdin. */
  in?: NodeJS.ReadStream;
}

/**
 * Backend that renders into a fixed-height "live region" with append-only log
 * lines scrolling above (the Ink `<Static>` pattern). Unlike `TtyBackend`,
 * this does NOT take over the terminal (no alt-screen) — output stays in
 * scrollback after the program exits.
 *
 * Use cases: CLI build tools, deploys, downloads — anything that mixes
 * streaming log output with a live status line.
 *
 * Components that fundamentally need full-screen height (`<Menu>` cascading
 * dropdowns, `<DialogHost>` full-screen mode, large `<Editor>`) won't fit
 * in the live region. Stick to lightweight widgets (`<TextInput>`, small
 * `<Select>`, spinners, progress) when targeting this backend.
 */
export class InlineTtyBackend implements Backend {
  /** Capability flag — signals components that need to overlay larger panels
   *  (Menu cascade, full-screen DialogHost) to refuse to render. */
  readonly fullScreen = false;

  /** Capability flag — whether the terminal honors the OSC 8 hyperlinks this
   *  backend emits (it's a real TTY, just inline), so <Link> renders clickable
   *  instead of printing a fallback URL. Sniffed from the environment; the
   *  painter writes OSC 8 unconditionally regardless. */
  readonly hyperlinks = detectHyperlinkSupport();

  private readonly out: NodeJS.WriteStream;
  private readonly input: NodeJS.ReadStream;
  private readonly liveHeight: number;

  private readonly subscribers = new Set<(key: Key) => void>();
  // Carries an incomplete escape sequence between stdin chunks (see decodeKeys).
  private pendingInput = '';
  private readonly inputDataHandler = (chunk: NodeBuffer | string): void => {
    const s = this.pendingInput + (typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    const { keys, rest } = decodeKeys(s);
    this.pendingInput = rest;
    for (const key of keys) {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        this.dispose();
        process.exit(130);
      }
      for (const h of [...this.subscribers]) h(key);
    }
  };
  private inputAttached = false;

  private readonly resizeSubscribers = new Set<() => void>();
  private readonly resizeNotify = (): void => {
    for (const h of [...this.resizeSubscribers]) h();
  };
  private resizeAttached = false;

  // Last serialized live-region rows. Stored so printStatic can redraw the
  // live region beneath the new static lines without re-running the paint
  // pipeline (it only owns the byte stream, not the Buffer).
  private liveLines: string[] = [];
  private cursorHidden = false;
  private disposed = false;

  constructor(options: InlineTtyBackendOptions = {}) {
    this.out = options.out ?? process.stdout;
    this.input = options.in ?? process.stdin;
    this.liveHeight = Math.max(1, options.liveHeight ?? 10);
  }

  size() {
    return { width: this.out.columns ?? 80, height: this.liveHeight };
  }

  draw(buffer: Buffer): void {
    this.ensureCursorHidden();
    // Erase the previous live region (cursor up + clear-from-cursor) and
    // write the new one in its place. The cursor sits at the start of the
    // first live-region row after the erase.
    let out = this.eraseLiveRegion();
    const lines = this.serializeBuffer(buffer);
    out += lines.join('\n');
    this.out.write(out);
    this.liveLines = lines;
  }

  /**
   * Emit `lines` ABOVE the live region. They become permanent terminal
   * output (scrollback-friendly). The live region is redrawn beneath them
   * using the most recent `draw()`'s content; if `draw()` hasn't been
   * called yet, the static lines are simply appended.
   *
   * `lines` should already carry any ANSI styling the caller wants. The
   * backend writes them verbatim followed by `\n` each.
   */
  printStatic(lines: string[]): void {
    if (lines.length === 0) return;
    let out = this.eraseLiveRegion();
    out += lines.join('\n') + '\n';
    // Now redraw the live region beneath the new static lines.
    if (this.liveLines.length > 0) {
      out += this.liveLines.join('\n');
    }
    this.out.write(out);
  }

  onResize(handler: () => void): () => void {
    if (!this.resizeAttached) {
      this.out.on('resize', this.resizeNotify);
      this.resizeAttached = true;
    }
    this.resizeSubscribers.add(handler);
    return () => { this.resizeSubscribers.delete(handler); };
  }

  onKey(handler: (key: Key) => void): () => void {
    if (!this.inputAttached) {
      if (this.input.isTTY) this.input.setRawMode(true);
      this.input.on('data', this.inputDataHandler);
      this.input.resume();
      this.inputAttached = true;
    }
    this.subscribers.add(handler);
    return () => { this.subscribers.delete(handler); };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.inputAttached) {
      this.input.removeListener('data', this.inputDataHandler);
      if (this.input.isTTY) this.input.setRawMode(false);
      this.input.pause();
      this.inputAttached = false;
      this.pendingInput = '';
    }
    if (this.resizeAttached) {
      this.out.removeListener('resize', this.resizeNotify);
      this.resizeAttached = false;
    }
    if (this.cursorHidden) {
      // Show cursor + drop the pen to default. Emit a trailing newline so
      // the next shell prompt isn't on the same row as the last live frame.
      this.out.write(SHOW_CURSOR + RESET + '\n');
      this.cursorHidden = false;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private ensureCursorHidden(): void {
    if (!this.cursorHidden) {
      this.out.write(HIDE_CURSOR);
      this.cursorHidden = true;
    }
  }

  /**
   * Return the ANSI string that erases the current live region and leaves
   * the cursor at the start of its top row. Does NOT touch the scrollback
   * (text above the live region). If no live region is drawn yet, returns
   * an empty string.
   *
   * After draw() the cursor sits at the END of the bottom row of the live
   * region. To erase JUST the live region:
   *   - \r          — column 0 of current row (still the bottom row)
   *   - \x1b[<N-1>A — cursor up N-1 rows (only if N > 1; CUU with 0 is treated
   *                   as 1 by most terminals, so we have to skip the sequence
   *                   when N == 1)
   *   - \x1b[J      — erase from cursor to end of screen
   *
   * Earlier versions used \x1b[NF (CPL) which conveniently combines the up +
   * column-0 moves — but CPL ALWAYS moves up at least 1 line (it has no
   * "stay here" form), so for N == 1 it overshoots into the scrollback row.
   */
  private eraseLiveRegion(): string {
    const n = this.liveLines.length;
    if (n === 0) return '';
    if (n === 1) return '\r\x1b[J';
    return `\r\x1b[${n - 1}A\x1b[J`;
  }

  /**
   * Serialize a Buffer into ANSI-styled rows, one per buffer row. Style
   * runs are collapsed (no SGR between adjacent same-style cells). Trailing
   * RESET on every line so the pen state is predictable for the next line.
   */
  private serializeBuffer(buffer: Buffer): string[] {
    const lines: string[] = [];
    for (let y = 0; y < buffer.height; y++) {
      let line = '';
      let last: Style | null = null;
      // OSC 8 link state for the current run. RESET doesn't close a hyperlink,
      // so track it separately and force-close at end of each line.
      let lineLink: string | undefined;
      for (let x = 0; x < buffer.width; x++) {
        const cell = buffer.get(x, y);
        if (JSON.stringify(cell.style) !== JSON.stringify(last)) {
          if (lineLink !== undefined && lineLink !== cell.style.link) line += OSC8_CLOSE;
          line += RESET + sgr(cell.style);
          if (cell.style.link !== undefined && cell.style.link !== lineLink) line += osc8Open(cell.style.link);
          last = cell.style;
          lineLink = cell.style.link;
        }
        line += cell.char;
        // Interim wide-char handling (see TtyBackend.drawFull): back the cursor
        // up one after an East Asian Wide/emoji glyph so the next cell overwrites
        // its second column rather than shifting the row right.
        if (stringWidth(cell.char) === 2) line += '\b';
      }
      if (lineLink !== undefined) line += OSC8_CLOSE;
      lines.push(line + RESET);
    }
    return lines;
  }
}
