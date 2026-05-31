import { createElement, type ReactNode } from 'react';
import type { BoxProps } from './host.js';
import { InputContext, type InputSource } from './input-context.js';

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

export interface TextProps {
  children?: ReactNode;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
  /** Default 'none' (no wrap). 'wrap' = word-wrap with char-wrap fallback. 'truncate' = single-cell ellipsis. */
  wrap?: 'wrap' | 'truncate' | 'none';
}

export function Text({ children, ...style }: TextProps) {
  // Renders to a flowtty-box whose paint pass reads these style props off inst.props.
  return createElement('flowtty-box', style, children);
}
