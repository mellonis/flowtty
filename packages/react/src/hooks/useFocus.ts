import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { Rect } from '@flowtty/core/host';
import { FocusContext, FocusedIdContext, noFocusGroup } from '../context/focusContext.js';
import { ScrollRevealContext } from '../context/scrollContext.js';

export interface UseFocusResult {
  /** True iff this component is currently the focused one in its enclosing FocusGroup.
   *  Outside a FocusGroup, always true (backward-compat: single component receives input). */
  isFocused: boolean;
  /** Make this component the focused one — what a field does on a click.
   *  Stable across renders. A no-op outside a FocusGroup. */
  focus: () => void;
  /** Put this on the component's own box. The nearest `<ScrollBox>` then keeps
   *  the component in view: it scrolls to show it when it takes focus, and
   *  again while it has focus if it grows. Stable across renders;
   *  compose it with the box's own `onLayout` when there is one. Outside a
   *  FocusGroup it only records the rect. See docs/input.md (focus + Button). */
  onLayout: (rect: Rect) => void;
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
  const focus = useCallback(() => group.focus(id), [group, id]);
  const isFocused = group.isFocused(id);

  // Keeping the focused component in view: when the user moves focus onto
  // it, and while it has focus if it grows. Not when the group placed the
  // focus itself (the auto-focused first field must not move a view the app
  // placed), and never because its rect moved — a wheel step moves every
  // rect in the box, and the user must be able to scroll a focused field away. Outside a group every component is
  // "focused", and they would fight over the viewport — so nothing is revealed
  // there. The rect is the one the last paint reported: the component is still
  // where it was when focus reaches it.
  const reveal = useContext(ScrollRevealContext);
  const revealing = group !== noFocusGroup && isFocused;
  const rectRef = useRef<Rect | null>(null);
  const revealingRef = useRef(revealing);
  // A layout effect: it runs in the commit that gave the component focus, so
  // the scroll it asks for lands in the same frame as the focus look.
  useLayoutEffect(() => {
    const gained = revealing && !revealingRef.current;
    revealingRef.current = revealing;
    if (gained && group.focusedByUser() && rectRef.current !== null) reveal(rectRef.current);
  }, [revealing, reveal, group]);
  const onLayout = useCallback((r: Rect) => {
    const prev = rectRef.current;
    rectRef.current = r;
    // Fires every paint: only a change of height asks again.
    if (revealingRef.current && prev !== null && prev.height !== r.height) reveal(r);
  }, [reveal]);

  return { isFocused, focus, onLayout };
}
