import { useContext } from 'react';
import { AbortContext } from '../context/abortContext.js';

/**
 * Returns the render ROOT's AbortSignal, which fires once when the whole tree
 * tears down — on `handle.unmount()` AND on the error path (before
 * backend.dispose()). Null when there's no flowtty render() in scope.
 *
 * This is a WHOLE-APP signal, not a per-component one. It does NOT fire when an
 * individual component (or dialog) unmounts mid-session — for that, use normal
 * effect cleanup. The two are complementary:
 *
 *   - effect cleanup (useEffect return / clearInterval / a `cancelled` flag) is
 *     the PRIMARY teardown — it runs whenever THIS component unmounts.
 *   - this signal is a BACKSTOP for app-level shutdown and a shared cancellation
 *     token you can hand to anything that already speaks AbortSignal (fetch,
 *     addEventListener, etc.) so the work actually stops at the I/O layer when
 *     the process is exiting — not just gets ignored after it resolves.
 *
 *     const signal = useRootAbortSignal();
 *     useEffect(() => {
 *       fetch(url, { signal: signal ?? undefined })
 *         .then(setData)
 *         .catch((e) => { if (e.name !== 'AbortError') throw e; });
 *     }, [url]);
 *
 * The returned value is an AbortSignal, not a controller — observe it, don't
 * abort it. A component deep in the tree cannot tear the whole root down; the
 * controller stays private to render().
 */
export function useRootAbortSignal(): AbortSignal | null {
  return useContext(AbortContext);
}
