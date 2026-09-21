/**
 * Can an interactive UI be drawn on this stream? It has to be a terminal, and
 * one that understands cursor addressing — `TERM=dumb` promises the opposite.
 *
 * Use it to branch before rendering, in an app that also has something to say
 * when it is piped or run in CI:
 *
 *     if (!isInteractive(process.stdout)) { printPlainReport(); process.exit(0); }
 *     await render(<App />, new TtyBackend());
 *
 * Both TTY backends apply the same rule themselves.
 */
export function isInteractive(
  stream: { isTTY?: boolean } = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return stream.isTTY === true && env.TERM !== 'dumb';
}

/** Why `isInteractive` said no — for an error message. */
export function notInteractiveReason(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv = process.env): string {
  return stream.isTTY === true ? 'TERM=dumb' : 'stdout is not a terminal (piped, redirected, or running in CI)';
}

/**
 * Thrown by `TtyBackend` when the stream it was given is not an interactive
 * terminal. A distinct class so an app can tell "there is no terminal here"
 * apart from every other startup failure and print something else instead:
 *
 *     try { await render(<App />, new TtyBackend()); }
 *     catch (error) {
 *       if (!(error instanceof NotInteractiveError)) throw error;
 *       await render(<Report />, new FinalFrameBackend());
 *     }
 *
 * `reason` is the short form ('TERM=dumb', or stdout not being a terminal);
 * `message` carries it plus the advice.
 */
export class NotInteractiveError extends Error {
  override readonly name: string = 'NotInteractiveError';
  /** The short why, as `notInteractiveReason` puts it. */
  readonly reason: string;

  constructor(stream: { isTTY?: boolean } = process.stdout, env: NodeJS.ProcessEnv = process.env) {
    const reason = notInteractiveReason(stream, env);
    super(
      `flowtty: TtyBackend needs an interactive terminal — ${reason}. `
      + 'Check isInteractive(process.stdout) before render(), or catch NotInteractiveError, '
      + 'and render something printable instead: FinalFrameBackend (or renderToString) prints the '
      + 'last frame for output that has nothing to ask, and InlineTtyBackend falls back to printing '
      + 'its <Static> lines.',
    );
    this.reason = reason;
  }
}
