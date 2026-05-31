import { useContext, useEffect, useRef } from 'react';
import { InputContext } from '../context/inputContext.js';
import type { Key } from '@flowtty/core';

export interface UseInputOptions {
  /** When false, the subscription is paused (handler is not called). Default true. */
  isActive?: boolean;
}

/**
 * Subscribe to keyboard events from the surrounding InputContext.
 *
 * The handler ref is updated on each render, so closures capture the latest
 * state without re-subscribing — only `isActive` toggles or context changes
 * (un)subscribe. Cleanup runs on unmount.
 */
export function useInput(handler: (key: Key) => void, opts: UseInputOptions = {}): void {
  const source = useContext(InputContext);
  const ref = useRef(handler);
  ref.current = handler;
  const isActive = opts.isActive !== false;
  useEffect(() => {
    if (!isActive) return;
    const unsubscribe = source.subscribe((key) => ref.current(key));
    return unsubscribe;
  }, [source, isActive]);
}
