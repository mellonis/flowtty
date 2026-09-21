import type { Buffer } from './cells.js';
import type { Key } from './keys.js';

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
   * Subscribe to raw key events. Returns an unsubscribe function.
   * Backends without an input source omit this method.
   */
  onKey?(handler: (key: Key) => void): () => void;
  /**
   * Subscribe to terminal-resize events. Returns an unsubscribe function.
   * Handlers are called AFTER `size()` reflects the new dimensions.
   * Backends with fixed dimensions (e.g. the test backend) omit this method.
   */
  onResize?(handler: () => void): () => void;
  dispose?(): void;
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
