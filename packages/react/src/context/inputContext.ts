import { createContext } from 'react';
import type { Key } from '@flowtty/core';

export type KeySubscriber = (key: Key) => void;

export interface InputSource {
  subscribe(handler: KeySubscriber): () => void;
}

// No-op default: a tree rendered without an InputContext.Provider receives no
// keys (passive view), and useInput's subscribe is a no-op unsubscribe.
const noopSource: InputSource = { subscribe: () => () => {} };

export const InputContext = createContext<InputSource>(noopSource);
