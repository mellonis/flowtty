import { createContext, type Context } from 'react';
import type { Key } from '@flowtty/core';

/** A `useInput` handler. Returning `true` consumes the key: no later
 *  subscriber sees it, and no backend default runs for it. Only a strict
 *  `true` counts, hence `unknown`: a handler may be any expression, and an
 *  async handler's Promise never consumes. */
export type KeySubscriber = (key: Key) => unknown;

export interface SubscribeOptions {
  /** Hear a key before every ordinary subscriber — the capture phase. Capture
   *  handlers hear it in mount order among themselves, and can consume it. */
  capture?: boolean;
  /** Hear a key only when no capture and no ordinary subscriber consumed it —
   *  the fallback phase, for an app's own keymap. Fallbacks hear it in mount
   *  order among themselves, and can consume it. */
  fallback?: boolean;
}

export interface InputSource {
  subscribe(handler: KeySubscriber, options?: SubscribeOptions): () => void;
}

/**
 * A source that mutes a subtree without moving anyone in the delivery order:
 * it registers each handler with the outer source once, wrapped in a check of
 * `isMuted` at delivery. Swapping the context value instead would make every
 * `useInput` under it resubscribe — at the end of the queue, behind handlers
 * that did not — each time the mute flipped. Create one per subtree and keep
 * it for the subtree's life. See docs/input.md (keys and useInput).
 */
export function createMutedSource(outer: InputSource, isMuted: () => boolean): InputSource {
  return {
    subscribe: (handler, options) => outer.subscribe((key) => (isMuted() ? undefined : handler(key)), options),
  };
}

// No-op default: a tree rendered without an InputContext.Provider receives no
// keys (passive view), and useInput's subscribe is a no-op unsubscribe.
const noopSource: InputSource = { subscribe: () => () => {} };

export const InputContext: Context<InputSource> = createContext<InputSource>(noopSource);
