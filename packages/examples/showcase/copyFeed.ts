// The showcase's side of `render(…, { onCopy })`: the render option lives
// outside the tree, and the tour wants to show a "copied N chars" line inside
// it. A one-value store bridges the two.
import { useSyncExternalStore } from 'react';
import type { CopyEvent } from '@flowtty/react';

export class CopyFeed {
  private last: CopyEvent | null = null;
  private readonly listeners = new Set<() => void>();

  get = (): CopyEvent | null => this.last;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** What `render`'s `onCopy` is wired to. */
  push = (event: CopyEvent): void => {
    this.last = event;
    for (const listener of [...this.listeners]) listener();
  };
}

// Stable identities for the no-feed case: fresh closures would make
// useSyncExternalStore re-subscribe on every render.
const NEVER = (): (() => void) => () => {};
const NOTHING = (): CopyEvent | null => null;

/** The last copy, or null when nothing has been copied yet. */
export function useLastCopy(feed: CopyFeed | undefined): CopyEvent | null {
  return useSyncExternalStore(feed?.subscribe ?? NEVER, feed?.get ?? NOTHING, feed?.get ?? NOTHING);
}
