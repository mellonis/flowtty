import React from "react";
import { type ReactNode } from 'react';
import { Box } from './base/Box.js';

/**
 * Bold left-aligned header row. Spans the full container width so it sits on
 * its own row in a column layout.
 */
export function Title({ children }: { children: ReactNode }) {
  return <Box width="100%" bold>{children}</Box>;
}
