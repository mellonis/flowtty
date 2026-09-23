import { createContext, type Context } from 'react';
import { UNKNOWN_COLOR_SCHEME, type TerminalColorScheme } from '@flowtty/core';

export interface AppApi {
  /** Quit the app: unmount the tree and restore the terminal. `result` is what
   *  `waitUntilExit()` resolves with. Safe to call from a key handler or an effect. */
  exit(result?: unknown): void;
  /** Ring the terminal bell — the portable "over here". A no-op when the backend
   *  cannot ring one, and the TTY backends rate-limit it to one per second. See
   *  docs/app.md (getting attention). */
  bell(): void;
  /** Post a desktop notification through the terminal, for when the person is
   *  looking at another window. The text is sanitized by the backend; a backend
   *  with no terminal to write to ignores the call. See docs/app.md (getting
   *  attention). */
  notify(title: string, body?: string): void;
  /** Put `text` on the person's system clipboard. Returns whether a clipboard
   *  sequence was actually written — false where the terminal has none (Apple
   *  Terminal, a pipe) and where the backend refused the text. Fires the
   *  `onCopy` render option with `source: 'api'` either way, so an app can fall
   *  back to `pbcopy` / `wl-copy` / `clip.exe` in one place. See docs/app.md
   *  (the clipboard). */
  copy(text: string): boolean;
  /** Hand the terminal to another program for the duration of `fn` — an
   *  editor, a pager, `git commit` — and take it back afterwards with a full
   *  repaint; component state survives. Resolves with what `fn` returned, and
   *  rejects with what it threw (the terminal is taken back either way), or
   *  when a suspension is already in progress. Where the backend has no
   *  terminal to hand over, `fn` simply runs. See docs/app.md (handing the
   *  terminal over). */
  suspend<T>(fn: () => T | Promise<T>): Promise<T>;
  /** Whether the terminal is light or dark, and its background when known —
   *  the backend's answer as of now. For a value that re-renders on a change,
   *  use `useColorScheme()`. See docs/app.md (the color scheme). */
  readonly colorScheme: TerminalColorScheme;
}

// Outside render() (a component rendered by a bare reconciler in a test) exit,
// bell, notify and copy are all no-ops — and copy reports that nothing landed.
export const AppContext: Context<AppApi> = createContext<AppApi>({
  exit: () => {},
  bell: () => {},
  notify: () => {},
  copy: () => false,
  suspend: async (fn) => fn(),
  colorScheme: UNKNOWN_COLOR_SCHEME,
});
