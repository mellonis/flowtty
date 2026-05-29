import { createElement, type ReactNode } from 'react';
import type { BoxProps } from './host.js';

export function Box({ children, ...rest }: BoxProps & { children?: ReactNode }) {
  return createElement('flowtty-box', rest, children);
}

export interface TextProps {
  children?: ReactNode;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  /** Default 'none' (no wrap). 'wrap' = word-wrap with char-wrap fallback. 'truncate' = single-cell ellipsis. */
  wrap?: 'wrap' | 'truncate' | 'none';
}

export function Text({ children, ...style }: TextProps) {
  // Renders to a flowtty-box whose paint pass reads these style props off inst.props.
  return createElement('flowtty-box', style, children);
}
