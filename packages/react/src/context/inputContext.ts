import { createContext, type Context } from 'react';
import type { Key } from '@flowtty/core';

/** A `useInput` handler. Returning `true` consumes the key: no later
 *  subscriber sees it, and no backend default runs for it. Only a strict
 *  `true` counts, hence `unknown`: a handler may be any expression, and an
 *  async handler's Promise never consumes. */
export type KeySubscriber = (key: Key) => unknown;

export interface InputSource {
  subscribe(handler: KeySubscriber): () => void;
}

// No-op default: a tree rendered without an InputContext.Provider receives no
// keys (passive view), and useInput's subscribe is a no-op unsubscribe.
const noopSource: InputSource = { subscribe: () => () => {} };

export const InputContext: Context<InputSource> = createContext<InputSource>(noopSource);
