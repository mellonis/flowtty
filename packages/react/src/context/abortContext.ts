import { createContext } from 'react';

/**
 * A per-render-root AbortSignal that fires when the root tears down — on
 * unmount AND on the error path (before backend.dispose()). Null when no
 * flowtty render() is in scope (e.g. bare React test setups).
 *
 * The context carries the SIGNAL, never the controller, so components deep in
 * the tree can only observe teardown (`.aborted`, `.addEventListener`,
 * `.throwIfAborted()`) or forward it to `fetch(url, { signal })` — they cannot
 * abort the whole tree. The controller stays private to render().
 */
export const AbortContext = createContext<AbortSignal | null>(null);
