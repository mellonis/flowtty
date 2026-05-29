import { createElement, type ReactNode } from 'react';
import type { BoxProps } from './host.js';

export function Box({ children, ...rest }: BoxProps & { children?: ReactNode }): ReactNode {
  return createElement('flowtty-box', rest, children);
}

/**
 * Sugar for Box that auto-sizes to its string children via the Yoga measure func.
 * In M0, layout props (width, flexDirection, etc.) belong on a wrapping Box, not on Text.
 */
export function Text({ children }: { children?: ReactNode }): ReactNode {
  return createElement('flowtty-box', null, children);
}
