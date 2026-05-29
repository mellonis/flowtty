import { createElement, type ReactNode } from 'react';
import type { BoxProps } from './host.js';

export function Box({ children, ...rest }: BoxProps & { children?: ReactNode }): ReactNode {
  return createElement('flowtty-box', rest, children);
}

export function Text({ children }: { children?: ReactNode }): ReactNode {
  return createElement('flowtty-box', null, children);
}
