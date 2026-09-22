import { createContext, createElement, useContext, useEffect, useState, type Context, type ReactNode } from 'react';
import { UNKNOWN_COLOR_SCHEME, type Backend, type TerminalColorScheme } from '@flowtty/core';

const ColorSchemeContext: Context<TerminalColorScheme> = createContext<TerminalColorScheme>(UNKNOWN_COLOR_SCHEME);

/**
 * Whether the terminal is light or dark — `{ scheme, background? }` — and a
 * re-render when that changes: the terminal answered, or the person switched
 * their appearance. `'unknown'` until the terminal has answered, and for good
 * where it never does; an app treats that as "leave the grounds to the
 * terminal". See docs/app.md (the color scheme).
 */
export function useColorScheme(): TerminalColorScheme {
  return useContext(ColorSchemeContext);
}

/** Wraps a subtree in the scheme context. Reads the backend's answer and
 *  follows its `onColorScheme`; a backend without either leaves the subtree on
 *  `'unknown'`. */
export function ColorSchemeProvider({ backend, children }: { backend: Backend; children?: ReactNode }): ReactNode {
  const [scheme, setScheme] = useState<TerminalColorScheme>(() => backend.colorScheme?.() ?? UNKNOWN_COLOR_SCHEME);

  useEffect(() => {
    if (!backend.onColorScheme) return;
    const apply = (next: TerminalColorScheme): void => {
      setScheme((prev) => (prev.scheme === next.scheme && prev.background === next.background ? prev : next));
    };
    const unsubscribe = backend.onColorScheme(apply);
    // An answer that arrived between the first render and this subscription.
    if (backend.colorScheme) apply(backend.colorScheme());
    return unsubscribe;
  }, [backend]);

  return createElement(ColorSchemeContext.Provider, { value: scheme }, children);
}
