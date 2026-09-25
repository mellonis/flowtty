import React from "react";
import type { ReactNode } from 'react';
import { stringWidth } from '@flowtty/core';
import { Box } from './base/Box.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

/**
 * Inverse-styled help line padded to full width so the inverse background
 * extends past the text. Children must be a single string (we pad it).
 */
export function HelpBar({ children }: { children: string }): ReactNode {
  const { width } = useTerminalSize();
  // Padded by display column: a wide glyph in the text takes two.
  return <Box inverse wrap="truncate">{children + ' '.repeat(Math.max(0, width - stringWidth(children)))}</Box>;
}
