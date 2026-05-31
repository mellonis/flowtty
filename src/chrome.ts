/**
 * Small, opinionated chrome components that every list/detail view tends to
 * reinvent: a centered bold title, a horizontal rule, and a bottom help bar.
 *
 * All three read terminal width from `useTerminalSize` and span 100% — no
 * width prop. Drop them in and they fit.
 */

import { createElement, type ReactNode } from 'react';
import { Box } from './components.js';
import { useTerminalSize } from './terminal-size.js';

/**
 * Bold left-aligned header row. Spans the full container width so it sits on
 * its own row in a column layout.
 */
export function Title({ children }: { children: ReactNode }) {
  return createElement(Box, { width: '100%', bold: true }, children);
}

/**
 * Horizontal rule that fills its container's width. Uses width:'100%' on the
 * Box so the actual rendered width matches the parent (not the full terminal).
 * The char string is over-provisioned to terminal width; paint clips to the
 * box's content rect.
 */
export interface HRuleProps { char?: string }
export function HRule(props: HRuleProps) {
  const { width } = useTerminalSize();
  const ch = props.char ?? '─';
  return createElement(Box, { dim: true, width: '100%' }, ch.repeat(Math.max(0, width)));
}

/**
 * Inverse-styled help line padded to full width so the inverse background
 * extends past the text. Children must be a single string (we pad it).
 */
export function HelpBar({ children }: { children: string }) {
  const { width } = useTerminalSize();
  return createElement(Box, { inverse: true, wrap: 'truncate' }, children.padEnd(width));
}
