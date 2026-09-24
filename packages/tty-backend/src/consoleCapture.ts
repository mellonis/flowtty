import { format } from 'node:util';

export type ConsoleLevel = 'log' | 'info' | 'debug' | 'warn' | 'error';

/** One captured console call: its level and the line `console` would have printed. */
export interface ConsoleEntry {
  level: ConsoleLevel;
  line: string;
}

export interface ConsoleCapture {
  /** Put the original `console` methods back and hand over what was captured
   *  (empty once released). */
  release(): ConsoleEntry[];
}

const LEVELS: readonly ConsoleLevel[] = ['log', 'info', 'debug', 'warn', 'error'];

/**
 * Take over `console.log` / `info` / `debug` / `warn` / `error` so that nothing
 * printed through them reaches the terminal while a backend owns the screen —
 * a line written there lands in the alternate screen and stays until the next
 * full repaint. Each call is kept as the line `console` would have printed
 * (`util.format`), and handed to `onEntry` at once when given. Direct writes to
 * `process.stdout` / `process.stderr` are not covered.
 * See docs/terminal.md (console output).
 */
export function captureConsole(onEntry?: (entry: ConsoleEntry) => void): ConsoleCapture {
  const originals = new Map<ConsoleLevel, (...args: unknown[]) => void>();
  const patched = new Map<ConsoleLevel, (...args: unknown[]) => void>();
  let entries: ConsoleEntry[] = [];
  for (const level of LEVELS) {
    originals.set(level, console[level] as (...args: unknown[]) => void);
    const patch = (...args: unknown[]): void => {
      const entry: ConsoleEntry = { level, line: format(...args) };
      entries.push(entry);
      onEntry?.(entry);
    };
    patched.set(level, patch);
    console[level] = patch;
  }
  let released = false;
  return {
    release() {
      if (released) return [];
      released = true;
      // Put the original back only where our patch still is: a method someone
      // replaced meanwhile — a logger, a test spy — is theirs, not ours.
      for (const [level, fn] of originals) {
        if (console[level] === patched.get(level)) console[level] = fn as typeof console.log;
      }
      const out = entries;
      entries = [];
      return out;
    },
  };
}
