import { createElement, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { BoxProps } from '@flowtty/core';
import { InputContext } from '../../context/inputContext.js';

// A box with `onClick` / `onHoverChange` carries the input scope it was
// rendered in, so the mouse controller can skip it while that scope is muted
// (`inert`, the page under an open dialog) — the same rule `useInput`
// subscriptions follow. Plain boxes never come through here and stay
// hook-free. See docs/input.md (clicks and hover).
function MouseScope({ props, children }: { props: BoxProps; children?: ReactNode }): ReactNode {
  const source = useContext(InputContext);
  const mouseScope = useMemo(() => ({ isMuted: () => source.isMuted?.() ?? false }), [source]);
  // The backend only starts feeding the render root once something subscribes
  // (see `makeKeySource`) — a no-op subscription, through the same source a
  // `useInput` in this scope would use, is what makes a view whose only input
  // is a click or a hover receive mouse keys at all. It never handles a key
  // itself; the mouse controller (which sees every key first) does that.
  // See docs/input.md (clicks and hover).
  useEffect(() => source.subscribe(() => undefined), [source]);
  return createElement('flowtty-box', { ...props, mouseScope }, children);
}

/** The host element for a box: through the mouse scope when it takes clicks or hover, bare otherwise. */
export function hostBox(props: BoxProps, children?: ReactNode): ReactNode {
  if (props.onClick !== undefined || props.onHoverChange !== undefined) return createElement(MouseScope, { props }, children);
  return createElement('flowtty-box', props, children);
}
