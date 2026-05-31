import React from "react";
import { Box } from './base/Box.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

/**
 * Inverse-styled help line padded to full width so the inverse background
 * extends past the text. Children must be a single string (we pad it).
 */
export function HelpBar({ children }: { children: string }) {
  const { width } = useTerminalSize();
  return <Box inverse wrap="truncate">{children.padEnd(width)}</Box>;
}
