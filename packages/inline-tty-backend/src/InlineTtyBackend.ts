import { Buffer as NodeBuffer } from 'node:buffer';
import { stringWidth, takeWarnings, type Buffer, type Style, type Backend, type Key, type TerminalColorScheme } from '@flowtty/core';
import {
  decodeKeys,
  detectHyperlinkSupport,
  detectColorSupport,
  detectColorDepth,
  type ColorDepth,
  isInteractive,
  RESET, HIDE_CURSOR, SHOW_CURSOR,
  BRACKETED_PASTE_ON, BRACKETED_PASTE_OFF,
  OSC8_CLOSE, osc8Open,
  sgr,
  createAttention, type Attention, type NotificationProtocol,
  createClipboard, type Clipboard, type ClipboardProtocol,
  createColorSchemeTracker, type ColorSchemeTracker,
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
  /** Follow the terminal's light / dark scheme once keys are read, as
   *  `TtyBackend` does. On by default; `false` asks nothing. Nothing is asked
   *  in log-only mode either way. See docs/terminal.md (light and dark). */
  colorScheme?: boolean;
  /** Emit color. Default: from the environment — off when `NO_COLOR` is set,
   *  `FORCE_COLOR` overriding it. Bold, dim, underline and inverse are emitted
   *  either way. */
  color?: boolean;
  /** Color depth in bits: 4, 8 or 24. Default: from the environment —
   *  truecolor only where the terminal announces it. */
  colorDepth?: ColorDepth;
  /** Which escape sequence `notify()` posts a desktop notification with.
   *  `'auto'` (the default) picks one from the environment
   *  (`detectNotificationProtocol`); `'none'` never posts one — and, unlike an
   *  auto-detected `'none'`, does not fall back to the bell. Both are silent in
   *  log-only mode. See docs/terminal.md (notifications). */
  notifications?: NotificationProtocol | 'auto';
  /** Which sequence `copy()` puts text on the clipboard with. `'auto'` (the
   *  default) picks one from the environment (`detectClipboardSupport`);
   *  `'osc52'` writes it whatever the environment says — and, inside tmux,
   *  wraps it in the DCS passthrough; `'none'` never writes one. Silent in
   *  log-only mode either way. See docs/terminal.md (the clipboard). */
  clipboard?: ClipboardProtocol | 'auto';
  /** Cap on the base64 payload of one clipboard write, in bytes. Default
   *  74,994. A text over it is not written AT ALL and `copy()` reports
   *  `false` — never a truncated copy presented as a complete one. */
  clipboardLimit?: number;
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
  readonly hyperlinks: boolean = detectHyperlinkSupport();

  private readonly out: NodeJS.WriteStream;
  private readonly input: NodeJS.ReadStream;
  private readonly liveHeight: number;

  private readonly subscribers = new Set<(key: Key) => void>();
  // Carries an incomplete escape sequence between stdin chunks (see decodeKeys).
  private pendingInput = '';
  private readonly inputDataHandler = (chunk: NodeBuffer | string): void => {
    const s = this.pendingInput + (typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    const { keys, rest, reports } = decodeKeys(s);
    this.pendingInput = rest;
    // The terminal's replies are not input — see TtyBackend.
    if (reports.length > 0) this.scheme.handle(reports);
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
  private readonly attention: Attention;
  private readonly clipboard: Clipboard;
  private readonly scheme: ColorSchemeTracker;
  private readonly followsScheme: boolean;
  private readonly sgrOptions: { color: boolean; depth: ColorDepth };
  /**
   * True when stdout is not an interactive terminal (piped, redirected, CI,
   * `TERM=dumb`). The app has already split its output into permanent lines
   * (`<Static>`) and a live region, so the backend degrades the way build tools
   * do in CI: the permanent lines are printed as plain text, the live region is
   * skipped, and no control sequence is ever written. Keys are not read.
   */
  readonly logOnly: boolean;

  constructor(options: InlineTtyBackendOptions = {}) {
    this.sgrOptions = { color: options.color ?? detectColorSupport(), depth: options.colorDepth ?? detectColorDepth() };
    this.out = options.out ?? process.stdout;
    this.logOnly = !isInteractive(this.out);
    this.input = options.in ?? process.stdin;
    this.liveHeight = Math.max(1, options.liveHeight ?? 10);
    this.attention = createAttention((bytes) => this.out.write(bytes), { notifications: options.notifications });
    this.clipboard = createClipboard((bytes) => this.out.write(bytes), {
      ...(options.clipboard === undefined ? {} : { clipboard: options.clipboard }),
      ...(options.clipboardLimit === undefined ? {} : { limit: options.clipboardLimit }),
    });
    this.followsScheme = options.colorScheme !== false;
    // Its writes stop with stop(), which dispose() calls before the input goes;
    // after that no report can arrive to prompt another.
    this.scheme = createColorSchemeTracker((bytes) => this.out.write(bytes));
  }

  /** Whether the terminal is light or dark — `'unknown'` until it has answered,
   *  and always in log-only mode. See docs/app.md (the color scheme). */
  colorScheme(): TerminalColorScheme {
    return this.scheme.current();
  }

  /** Hear a change of scheme, after `colorScheme()` reflects it. */
  onColorScheme(handler: (scheme: TerminalColorScheme) => void): () => void {
    return this.scheme.subscribe(handler);
  }

  size(): { width: number; height: number } {
    return { width: this.out.columns ?? 80, height: this.liveHeight };
  }

  draw(buffer: Buffer): void {
    if (this.logOnly) return;
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
    if (this.logOnly) { this.out.write(lines.join('\n') + '\n'); return; }
    let out = this.eraseLiveRegion();
    out += lines.join('\n') + '\n';
    // Now redraw the live region beneath the new static lines.
    if (this.liveLines.length > 0) {
      out += this.liveLines.join('\n');
    }
    this.out.write(out);
  }

  /**
   * Ring the terminal bell, as one write, at most once per second (the calls in
   * between are dropped). Silent in log-only mode — a pipe has no bell — and
   * after dispose. BEL changes no cell and moves no cursor, so it never
   * disturbs the live region it lands between.
   */
  bell(): void {
    if (this.logOnly || this.disposed) return;
    this.attention.bell();
  }

  /**
   * Post a desktop notification, as one write, with the title and body
   * sanitized. Where no protocol reaches the terminal this rings the bell
   * instead, unless `notifications: 'none'` asked for silence. Silent in
   * log-only mode and after dispose. See docs/app.md (getting attention).
   */
  notify(title: string, body?: string): void {
    if (this.logOnly || this.disposed) return;
    this.attention.notify(title, body);
  }

  /**
   * Put `text` on the person's clipboard with OSC 52, as one write, and say
   * whether a sequence went out. Nothing is written where the terminal has no
   * OSC 52, where the text is empty or over the size cap (the whole text is
   * refused, never truncated), in log-only mode — a pipe has no clipboard — or
   * after dispose. Write-only: the `?` query form is never emitted. The
   * sequence changes no cell, so it never disturbs the live region it lands
   * between. See docs/app.md (the clipboard).
   */
  copy(text: string): boolean {
    if (this.logOnly || this.disposed) return false;
    return this.clipboard.copy(text);
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
    if (this.logOnly) return () => {}; // nobody is typing into a pipe
    if (!this.inputAttached) {
      if (this.input.isTTY) this.input.setRawMode(true);
      this.input.on('data', this.inputDataHandler);
      this.input.resume();
      this.inputAttached = true;
      // Only a backend that reads keys asks for bracketed paste; dispose() undoes it.
      this.out.write(BRACKETED_PASTE_ON);
      if (this.followsScheme) this.scheme.start();
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
      this.scheme.stop();
      this.out.write(BRACKETED_PASTE_OFF);
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
    // The live region is gone — now a warning cannot land in the middle of it.
    // eslint-disable-next-line no-console
    for (const warning of takeWarnings()) console.warn(warning);
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
          line += RESET + sgr(cell.style, this.sgrOptions);
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
