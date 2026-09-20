import { createContext, type Context } from 'react';

export interface AppApi {
  /** Quit the app: unmount the tree and restore the terminal. `result` is what
   *  `waitUntilExit()` resolves with. Safe to call from a key handler or an effect. */
  exit(result?: unknown): void;
}

// Outside render() (a component rendered by a bare reconciler in a test) exit is a no-op.
export const AppContext: Context<AppApi> = createContext<AppApi>({ exit: () => {} });
