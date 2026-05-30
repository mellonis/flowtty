import { createElement, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FocusContext, FocusedIdContext, type FocusGroupApi } from './focus-context.js';
import { useInput } from './use-input.js';

export interface FocusGroupProps {
  /** When false, the group doesn't react to Tab/Shift-Tab (e.g., backgrounded by a
   *  higher dialog). Default true. */
  isActive?: boolean;
  children?: ReactNode;
}

/** Manages a list of focusable descendants. The first to register is auto-focused.
 *  Tab cycles forward, Shift-Tab backward. Mount order = tab order (v1). */
export function FocusGroup({ isActive = true, children }: FocusGroupProps): ReactNode {
  // Ordered list of registered ids — append on register, filter on unregister.
  const idsRef = useRef<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Keep a ref to the latest focusedId so the stable isFocused callback can
  // read it without being a dep of the api memo.
  const focusedIdRef = useRef<string | null>(null);
  focusedIdRef.current = focusedId;

  const register = useCallback((id: string) => {
    if (idsRef.current.includes(id)) return;
    idsRef.current = [...idsRef.current, id];
    // Auto-focus the first registrant.
    setFocusedId((current) => current ?? id);
  }, []);

  const unregister = useCallback((id: string) => {
    idsRef.current = idsRef.current.filter((x) => x !== id);
    setFocusedId((current) => {
      if (current !== id) return current;
      // Focused item unmounted — move focus to first remaining, or null.
      return idsRef.current[0] ?? null;
    });
  }, []);

  // isFocused reads from the ref so it has no deps and never changes reference.
  // This keeps api stable across focus updates, preventing consumer useEffects
  // (registration effects) from re-running on every Tab keypress.
  const isFocused = useCallback(
    (id: string) => focusedIdRef.current === id,
    [], // intentionally empty — reads latest state via ref
  );

  // api is stable for the lifetime of the group (all deps are stable).
  // Consumers' useFocus useEffects depend on this object; stability means
  // effects only re-run when the FocusGroup itself mounts/unmounts, NOT on
  // every focus change.
  const api = useMemo<FocusGroupApi>(
    () => ({ register, unregister, isFocused }),
    [register, unregister, isFocused],
  );

  useInput((key) => {
    if (key.name !== 'tab') return;
    const ids = idsRef.current;
    if (ids.length === 0) return;
    setFocusedId((current) => {
      const idx = current ? ids.indexOf(current) : 0;
      const next = key.shift
        ? (idx - 1 + ids.length) % ids.length
        : (idx + 1) % ids.length;
      return ids[next] ?? null;
    });
  }, { isActive });

  // Provide two contexts:
  // 1. FocusContext (stable api) — consumers subscribe for register/unregister only.
  // 2. FocusedIdContext (volatile) — consumers subscribe to re-render on focus changes.
  return createElement(
    FocusContext.Provider,
    { value: api },
    createElement(FocusedIdContext.Provider, { value: focusedId }, children),
  );
}
