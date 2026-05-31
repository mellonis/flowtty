import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Backend } from '@flowtty/core';

export interface TerminalSize {
  width: number;
  height: number;
}

const TerminalSizeContext = createContext<TerminalSize>({ width: 0, height: 0 });

/** Returns the current terminal size. Re-renders subscribers when the backend reports a resize.
 *  For fixed-size backends (e.g. TestBackend), returns the initial size and never updates. */
export function useTerminalSize(): TerminalSize {
  return useContext(TerminalSizeContext);
}

/** Wraps a subtree in TerminalSizeContext.Provider. Subscribes to backend.onResize and updates
 *  the context value on each resize. Diff guard prevents re-renders on identical sizes. */
export function TerminalSizeProvider({ backend, children }: { backend: Backend; children?: ReactNode }) {
  const [size, setSize] = useState<TerminalSize>(() => backend.size());

  useEffect(() => {
    if (!backend.onResize) return;
    return backend.onResize(() => {
      const next = backend.size();
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    });
  }, [backend]);

  return createElement(TerminalSizeContext.Provider, { value: size }, children);
}
