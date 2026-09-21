import { takeWarnings, type Backend, type Buffer } from '@flowtty/core';
import { bufferToAnsi } from './bufferToAnsi.js';
import { detectColorSupport, takeUnknownColors } from './ansi.js';
import { detectColorDepth, type ColorDepth } from './colorDepth.js';
import { isInteractive } from './interactive.js';

export interface FinalFrameBackendOptions {
  /** Columns. Default: the stream's `columns` when it is a terminal, else 80. */
  width?: number;
  /** Rows. Default: `Infinity` — the frame is as tall as its content. */
  height?: number;
  /** Emit color. Default: on when the stream is an interactive terminal and the
   *  environment allows color (`detectColorSupport`), off otherwise — so a piped
   *  run and a CI log are plain text. `FORCE_COLOR` decides either way, pipe or
   *  not. Bold, dim, underline, inverse and strikethrough are emitted regardless. */
  color?: boolean;
  /** Color depth in bits: 4 (16 colors), 8 (256) or 24 (truecolor).
   *  Default: from the environment (`detectColorDepth`). */
  colorDepth?: ColorDepth;
}

// FORCE_COLOR is an explicit request, so it holds in a pipe too; undefined when unset.
function forcedColor(env: NodeJS.ProcessEnv = process.env): boolean | undefined {
  const force = env.FORCE_COLOR;
  return force === undefined || force === '' ? undefined : force !== '0';
}

/**
 * Backend for an app that asks nothing: it shows nothing while the app runs and
 * prints the LAST frame once, when the app is done, into the normal screen. The
 * output stays in the scrollback and reads the same in a pipe, a file or a CI
 * log — minus the colors, which are off unless there is a terminal to show them.
 *
 * This is the backend for reports: a test summary, a table, a diff, a build
 * result. Nothing is repainted, so a spinner or a progress bar has nothing to
 * animate — use `InlineTtyBackend` for those, and `TtyBackend` for a full-screen
 * app. There is no `onKey` and no `onResize`: nobody is typing, and the frame is
 * printed after the app has finished.
 *
 *     const app = await render(<Report />, new FinalFrameBackend());
 *     app.unmount();   // the frame is printed here
 *
 * The height defaults to `Infinity` — an unbounded surface, whose frame is as
 * tall as its content — so a report is never cut off at 24 rows. See
 * docs/terminal.md (which backend for which app).
 */
export class FinalFrameBackend implements Backend {
  /** Not a screen this backend owns: components that need a full one (Menu, a
   *  non-floating dialog) check this flag and step aside. */
  readonly fullScreen = false;

  private readonly width: number;
  private readonly height: number;
  private readonly ansiOptions: { color: boolean; depth: ColorDepth };
  private last: Buffer | null = null;
  private disposed = false;

  constructor(
    private readonly out: NodeJS.WriteStream = process.stdout,
    options: FinalFrameBackendOptions = {},
  ) {
    this.width = options.width ?? (isInteractive(out) ? out.columns ?? 80 : 80);
    this.height = options.height ?? Infinity;
    this.ansiOptions = {
      color: options.color ?? (forcedColor() ?? (isInteractive(out) && detectColorSupport())),
      depth: options.colorDepth ?? detectColorDepth(),
    };
  }

  size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Called after every commit. Only the last one is ever printed. */
  draw(buffer: Buffer): void {
    this.last = buffer;
  }

  /** render()'s unmount — and its error and signal paths — end here. Idempotent:
   *  the frame is printed once, however many times this is called. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // A trailing newline so the shell prompt (or whatever prints next) starts on
    // its own row; bufferToAnsi itself never ends in one.
    if (this.last !== null) this.out.write(bufferToAnsi(this.last, this.ansiOptions) + '\n');
    // Deferred developer warnings, printed like the other backends print them —
    // after the frame, where they cannot land in the middle of it.
    // eslint-disable-next-line no-console
    for (const warning of takeWarnings()) console.warn(warning);
    const unknown = takeUnknownColors();
    if (unknown.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`flowtty: unknown color name${unknown.length > 1 ? 's' : ''} ignored: ${unknown.join(', ')} — use a named color, '#rgb' / '#rrggbb' or 'rgb(r, g, b)'.`);
    }
  }
}
