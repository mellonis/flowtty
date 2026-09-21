import { type ReactNode } from 'react';
import { type Backend, type Buffer } from '@flowtty/core';
import { render } from './render.js';

export interface RenderToStringOptions {
  /** Columns to lay out in. Default 80. */
  width?: number;
  /** Rows. Default: as tall as the content. */
  height?: number;
  /**
   * Turn the final buffer into text. Default: plain text (`buffer.toString()`),
   * which trims trailing spaces per line. Pass one to keep styling — e.g.
   * `bufferToAnsi` from `@flowtty/tty-backend`. Whatever it returns is used
   * as-is, minus any trailing newlines: the result never ends in one.
   */
  format?: (buffer: Buffer) => string;
}

// Headless one-shot surface: keeps the last frame and counts frames so the
// settle loop below has something to watch. No key source (nothing to type
// into) and not full-screen — this is output, not a screen to own.
class CaptureBackend implements Backend {
  last: Buffer | null = null;
  frames = 0;
  readonly fullScreen = false;

  constructor(private readonly cols: number, private readonly rows: number) {}

  size(): { width: number; height: number } {
    return { width: this.cols, height: this.rows };
  }

  draw(buffer: Buffer): void {
    this.last = buffer;
    this.frames += 1;
  }
}

/**
 * Let effects and the renders they trigger settle, then stop.
 *
 * Same shape as `flushAsync` in the testing surface, and for the same reason: a
 * `setState` in a passive effect lands on React's default lane, which the
 * Scheduler only drains on a macrotask. Each round yields one macrotask plus a
 * microtask pair (the coalesced repaint); we stop after two rounds in a row
 * that produced no new frame, so one macrotask-ordering inversion can't read as
 * quiescence. Inlined rather than imported: `@flowtty/core/testing` is the test
 * surface, and this is a production path.
 */
async function settle(backend: CaptureBackend): Promise<void> {
  const MAX_ROUNDS = 20;
  let stableRounds = 0;
  for (let i = 0; i < MAX_ROUNDS && stableRounds < 2; i++) {
    const before = backend.frames;
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    await Promise.resolve();
    await Promise.resolve();
    stableRounds = backend.frames === before ? stableRounds + 1 : 0;
  }
}

/**
 * Render a tree once and return the frame as a string — no terminal involved.
 *
 * For report-style output that stays in the scrollback and survives a pipe, for
 * snapshot tests, and for generating examples. The tree is mounted, given a
 * moment for its effects to settle, captured and unmounted; nothing is left
 * running. An error thrown by the tree rejects the returned promise.
 *
 * See docs/app.md (rendering to a string).
 */
export async function renderToString(
  element: ReactNode,
  options: RenderToStringOptions = {},
): Promise<string> {
  // No height given → an unbounded surface: the frame is as tall as the content.
  const backend = new CaptureBackend(options.width ?? 80, options.height ?? Infinity);

  // render() does not reject on a tree error — it hands the error to onError and
  // tears down. Turn that into a rejection of OUR promise, and race it against
  // the settle loop, which would otherwise keep spinning on a dead tree.
  let fail!: (error: unknown) => void;
  const failed = new Promise<never>((_resolve, reject) => { fail = reject; });

  const handle = await render(element, backend, { onError: ({ error }) => { fail(error); } });
  try {
    await Promise.race([settle(backend), failed]);
  } finally {
    // Idempotent, and already a no-op on the error path (render tore down there).
    handle.unmount();
  }

  const buffer = backend.last;
  if (buffer === null) return '';
  const format = options.format ?? ((b: Buffer) => b.toString());
  return format(buffer).replace(/\n+$/u, '');
}
