import React from "react";
import { Box } from './base/Box.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

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
  return <Box dim width="100%">{ch.repeat(Math.max(0, width))}</Box>;
}
