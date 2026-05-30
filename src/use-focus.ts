import { useContext, useEffect, useId } from 'react';
import { FocusContext, FocusedIdContext } from './focus-context.js';

export interface UseFocusResult {
  /** True iff this component is currently the focused one in its enclosing FocusGroup.
   *  Outside a FocusGroup, always true (backward-compat: single component receives input). */
  isFocused: boolean;
}

/** Register the calling component as focusable in the enclosing FocusGroup.
 *  Outside a FocusGroup, isFocused is always true (backward-compat). */
export function useFocus(): UseFocusResult {
  // Stable api — only changes when the FocusGroup itself mounts/unmounts, not
  // when focus moves. This keeps the registration effect stable.
  const group = useContext(FocusContext);
  const id = useId();

  useEffect(() => {
    group.register(id);
    return () => group.unregister(id);
  }, [group, id]);

  // Subscribe to FocusedIdContext to re-render when focus changes within the
  // group. The actual focused-state result comes from group.isFocused(id), which
  // reads a ref maintained by FocusGroup — so we get the correct answer as long
  // as we re-render (which this subscription ensures).
  useContext(FocusedIdContext); // subscribed for re-render only (value unused intentionally)

  return { isFocused: group.isFocused(id) };
}
