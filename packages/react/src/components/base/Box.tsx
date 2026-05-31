import { createElement, type ReactNode } from 'react';
import type { BoxProps } from '../../internal/host.js';
import { InputContext, type InputSource } from '../../context/inputContext.js';

// Singleton muted input source. Subscribers never fire — used by `inert={true}`
// to drop a subtree out of input dispatch without affecting layout or paint.
const MUTED_INPUT: InputSource = { subscribe: () => () => {} };

export function Box({ children, inert, ...rest }: BoxProps & { children?: ReactNode; inert?: boolean }) {
  const node = createElement('flowtty-box', rest, children);
  if (inert) {
    return createElement(InputContext.Provider, { value: MUTED_INPUT }, node);
  }
  return node;
}
