import type { Buffer } from './cells.js';
import type { Key } from './keys.js';
import type { TerminalColorScheme } from './colorScheme.js';

// The seam every renderer backend implements. Drawing is required; key input
// and the inline static-region API are optional capabilities — detect at
// runtime via the optional methods rather than typing the backend.
export interface Backend {
  /**
   * The render area, in cells.
   *
   * `height` may be `Infinity`: an unbounded surface — a report printed once
   * rather than a screen to fit into. The renderer then lays the tree out with
   * no height constraint (percent heights have nothing to resolve against and
   * fall back to auto) and draws a buffer exactly as tall as the content, so a
   * frame can be any number of rows. `useTerminalSize()` reports `Infinity`
   * for the height too, which is what a component should branch on when it
   * would otherwise size itself to the screen.
   */
  size(): { width: number; height: number };
  draw(buffer: Buffer): void;
  /**
   * Subscribe to raw key events. Returns an unsubscribe function. A handler
   * that returns `true` has consumed the key: a backend then skips its own
   * default for it (Ctrl+C / Ctrl+D exit, Ctrl+Z suspend). The result is
   * looked at only for a strict `true` — which is why the type is `unknown`:
   * a handler may be any expression, and an async one's Promise never
   * consumes. Backends without an input source omit this method.
   * See docs/input.md (keys and useInput).
   */
  onKey?(handler: (key: Key) => unknown): () => void;
  /**
   * Subscribe to terminal-resize events. Returns an unsubscribe function.
   * Handlers are called AFTER `size()` reflects the new dimensions.
   * Backends with fixed dimensions (e.g. the test backend) omit this method.
   */
  onResize?(handler: () => void): () => void;
  dispose?(): void;
  /**
   * Whether the terminal is light or dark, and its default background when it
   * reported one — `{ scheme: 'unknown' }` until it has answered, and for good
   * where it never will. The TTY backends ask the terminal on the first key
   * subscription and keep listening for a change; backends with no terminal to
   * ask omit this, and the app then sees `'unknown'`. See docs/app.md (the
   * color scheme).
   */
  colorScheme?(): TerminalColorScheme;
  /**
   * Subscribe to color-scheme changes — the terminal switched between light and
   * dark, or first answered. Handlers are called AFTER `colorScheme()` reflects
   * the new value, with that value. Returns an unsubscribe function.
   */
  onColorScheme?(handler: (scheme: TerminalColorScheme) => void): () => void;
  /**
   * Append plain (already-styled, ANSI-ready) lines ABOVE the live region.
   * The lines scroll naturally into the terminal's scrollback. Backends
   * that own the whole screen (alt-screen TTY) or are headless (TestBackend)
   * may omit this; components like <Static> check for presence at runtime
   * and degrade gracefully when absent.
   */
  printStatic?(lines: string[]): void;
  /**
   * Ring the terminal bell (BEL). The one attention-getter every terminal has:
   * a sound, a flash, a marked tab — whatever the person configured. Backends
   * that can write to a terminal implement it and rate-limit it (flowtty's TTY
   * backends: at most one per second); headless ones omit it.
   *
   * Never called from inside `draw()`, and the bytes go out as one write, so a
   * bell between two frames leaves a frame-diffing backend's baseline valid.
   */
  bell?(): void;
  /**
   * Post a desktop notification through the terminal — what an app reaches for
   * when the person is looking at another window. `title` is the line the
   * notification leads with; `body` the optional rest.
   *
   * Which escape sequence carries it is the backend's business (see
   * docs/terminal.md), as is sanitizing the text: an embedded ESC or BEL would
   * end the sequence early. Backends with no terminal to write to omit this.
   */
  notify?(title: string, body?: string): void;
  /**
   * Put `text` on the person's system clipboard, and say whether a clipboard
   * sequence was actually written — `false` when this terminal has none, when
   * the text was empty, and when it was too large for the sequence to carry
   * (over the cap a backend writes NOTHING rather than a partial copy).
   *
   * `true` means the bytes went out, not that the clipboard changed: no
   * terminal answers that, and asking would mean reading the clipboard, which
   * flowtty never does. An app that must be sure falls back on `false` — see
   * docs/app.md (the clipboard).
   *
   * Which sequence carries it is the backend's business (see
   * docs/terminal.md), as is the size cap. Never called from inside `draw()`,
   * and the bytes go out as one write, so a copy between two frames leaves a
   * frame-diffing backend's baseline valid. Backends with no terminal to write
   * to omit it.
   */
  copy?(text: string): boolean;
  /**
   * Hand the terminal to another program: leave the alternate screen (or clear
   * the live region), show the cursor, turn off mouse and paste reporting,
   * leave raw mode and stop reading input — so a child process gets the
   * terminal as the shell left it, and nothing typed into it reaches `onKey`.
   * `resume` is the reverse; it must also forget any frame-diff baseline, so
   * the next `draw` is a full frame, and tell the `onResize` subscribers, so
   * the app repaints (the terminal may have been resized meanwhile). Backends
   * with no terminal to hand over omit both; `render()` then runs the
   * callback and nothing else. See docs/app.md (handing the terminal over).
   */
  suspend?(): void;
  /** The reverse of `suspend`. A no-op when not suspended. */
  resume?(): void;
  /**
   * Whether this backend owns the entire render area — i.e. components can
   * use the full `size()` for layout and overlay larger panels (Menu cascade,
   * full-screen DialogHost) on top.
   *
   *   true  — TtyBackend (alt-screen), TestBackend (full buffer)
   *   false — @flowtty/inline-tty-backend (only the live region is yours;
   *           scrollback above is append-only and out of layout control)
   *
   * Defaults to `true` when omitted — preserves the behavior of existing
   * backends that don't declare the flag. Inline-style backends MUST set
   * it to `false` so capability-sensitive components (e.g. <Menu>) can
   * refuse to render rather than produce broken overflow UI.
   */
  fullScreen?: boolean;
  /**
   * Whether this backend can emit OSC 8 terminal hyperlinks (clickable links).
   *
   *   true      — TTY backends (alt-screen + inline) wrap linked cells in the
   *               OSC 8 escape, so a `<Link>` is clickable in supporting terminals.
   *   omitted   — treated as false. The headless TestBackend and any output that
   *     /false    can't render clickable links leave them out, so `<Link>` should
   *               degrade to styled text plus a visible URL.
   *
   * Feature-detected like `fullScreen`: components read it (via useBackend())
   * rather than assuming a capability.
   */
  hyperlinks?: boolean;
}
