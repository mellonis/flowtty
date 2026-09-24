import { createElement, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { BoxProps } from '@flowtty/core';
import { InputContext, createMutedSource, type InputSource } from '../../context/inputContext.js';

// `inert` drops a subtree out of input dispatch without affecting layout or
// paint. The muting source is created once per box and reads the flag at
// delivery, so flipping `inert` never resubscribes the subtree's handlers —
// which would move them behind handlers that did not resubscribe.
// See docs/input.md (keys and useInput).
function InertScope({ inert, children }: { inert: boolean; children?: ReactNode }): ReactNode {
  const outer = useContext(InputContext);
  const inertRef = useRef(inert);
  inertRef.current = inert;
  const source = useMemo<InputSource>(() => createMutedSource(outer, () => inertRef.current), [outer]);
  return createElement(InputContext.Provider, { value: source }, children);
}

export function Box({ children, inert, ...rest }: BoxProps & { children?: ReactNode; inert?: boolean }): ReactNode {
  const node = createElement('flowtty-box', rest, children);
  // A box that never says anything about `inert` stays hook-free: there are
  // thousands of them. One that does gets a scope that lives as long as it does.
  if (inert !== undefined) return createElement(InertScope, { inert }, node);
  return node;
}
