import { createContext, type Context } from 'react';

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
}

// Outside render() (a component rendered by a bare reconciler in a test) exit,
// bell and notify are all no-ops.
export const AppContext: Context<AppApi> = createContext<AppApi>({
  exit: () => {},
  bell: () => {},
  notify: () => {},
});
