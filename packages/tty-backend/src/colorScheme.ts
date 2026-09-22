import { colorSchemeOf, rgbToHex, UNKNOWN_COLOR_SCHEME, type TerminalColorScheme } from '@flowtty/core';
import { BACKGROUND_QUERY, COLOR_SCHEME_REPORTS_ON, COLOR_SCHEME_REPORTS_OFF } from './ansi.js';
import type { TerminalReport } from './key-parser.js';

/**
 * What a TTY backend drives its `colorScheme()` / `onColorScheme()` from: the
 * current answer, and the reactions to what the terminal reports. Shared by
 * the alt-screen and the inline backend, which differ only in where the
 * bytes go. See docs/terminal.md (light and dark).
 */
export interface ColorSchemeTracker {
  /** The scheme as last heard — `{ scheme: 'unknown' }` until the terminal answers. */
  current(): TerminalColorScheme;
  /** Ask the terminal: turn on change and focus reports, query the background.
   *  One write; nothing is known until the reply comes back through `handle`. */
  start(): void;
  /** Turn the reports back off. The last answer is kept. */
  stop(): void;
  /** Act on what the parser took out of the key stream. */
  handle(reports: readonly TerminalReport[]): void;
  /** Called after `current()` changed, with the new value. */
  subscribe(handler: (scheme: TerminalColorScheme) => void): () => void;
}

/**
 * Build a tracker over a byte sink. The rules:
 *
 * - A background reply sets the background and decides light / dark from it.
 * - A DEC 2031 notification sets the scheme and asks for the background again,
 *   so the two never disagree for longer than one round trip.
 * - A focus-in asks for the background again: a terminal without 2031 changed
 *   its scheme while the window was in the background, if at all.
 * - Subscribers hear only a change — the same answer twice is one answer.
 */
export function createColorSchemeTracker(write: (bytes: string) => void): ColorSchemeTracker {
  let state: TerminalColorScheme = UNKNOWN_COLOR_SCHEME;
  let started = false;
  const subscribers = new Set<(scheme: TerminalColorScheme) => void>();

  const set = (next: TerminalColorScheme): void => {
    if (next.scheme === state.scheme && next.background === state.background) return;
    state = next;
    for (const h of [...subscribers]) h(state);
  };

  return {
    current: () => state,
    start() {
      if (started) return;
      started = true;
      write(COLOR_SCHEME_REPORTS_ON + BACKGROUND_QUERY);
    },
    stop() {
      if (!started) return;
      started = false;
      write(COLOR_SCHEME_REPORTS_OFF);
    },
    handle(reports) {
      for (const report of reports) {
        if (report.type === 'background') {
          set({ scheme: colorSchemeOf(report.color), background: rgbToHex(report.color) });
        } else if (report.type === 'colorScheme') {
          set(state.background === undefined ? { scheme: report.scheme } : { scheme: report.scheme, background: state.background });
          if (started) write(BACKGROUND_QUERY);
        } else if (report.focused && started) {
          write(BACKGROUND_QUERY);
        }
      }
    },
    subscribe(handler) {
      subscribers.add(handler);
      return () => { subscribers.delete(handler); };
    },
  };
}
