import { createContext } from 'react';

/** API exposed via FocusContext for components to register themselves as focusable
 *  and check whether they're currently focused. */
export interface FocusGroupApi {
  /** Register a focusable with the group. Returns an id (unique within the group)
   *  that the caller uses to query focus state + unregister on unmount. */
  register(id: string): void;
  unregister(id: string): void;
  /** True iff the focusable with this id is currently the focused one. */
  isFocused(id: string): boolean;
}

/** Sentinel singleton used outside a FocusGroup. Stable reference. */
const noop: FocusGroupApi = {
  register: () => {},
  unregister: () => {},
  // Outside a FocusGroup, "always focused" so default behavior works —
  // components outside a FocusGroup still receive input (backward compat).
  isFocused: () => true,
};

/** Outside a FocusGroup, useFocus() reads from this default → always focused
 *  (preserves backward-compat for components used without a FocusGroup). */
export const FocusContext = createContext<FocusGroupApi>(noop);

/** Carries the currently-focused id so consumers re-render when focus changes.
 *  Kept separate from FocusContext so the stable api object doesn't need to
 *  change on every focus update (which would trigger all useFocus useEffects
 *  to re-run, unregistering and re-registering, resetting focus).
 *
 *  null outside a FocusGroup (or when no focusable has registered yet).
 *  Inside a FocusGroup: the id of the focused focusable, or null if none. */
export const FocusedIdContext = createContext<string | null>(null);
