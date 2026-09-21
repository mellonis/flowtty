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
