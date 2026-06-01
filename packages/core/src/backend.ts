import type { Buffer } from './cells.js';
import type { Key } from './keys.js';

// The seam every renderer backend implements. Drawing is required; key input
// and the inline static-region API are optional capabilities — detect at
// runtime via the optional methods rather than typing the backend.
export interface Backend {
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
