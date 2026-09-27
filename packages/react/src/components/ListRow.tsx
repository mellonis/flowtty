import React from 'react';
import type { ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useHover } from '../hooks/useHover.js';

export interface ListRowProps {
  /** The cursor is on this row. */
  isCursor: boolean;
  /** The list has focus: the cursor marker is cyan and bold, the cursor row
   *  bold; unfocused, the marker is dim and the row plain. */
  isFocused: boolean;
  /** The text after the marker. */
  label: string;
  /** A click on the row. */
  onClick: () => void;
}

/**
 * One row of `ListSelect`, `ListMultiSelect` and the `Select` popup: a cursor
 * marker and a label. Focus has to be visible — Tab landing on a list that
 * looks exactly as before leaves the person lost — so a focused list draws a
 * colored, bold marker and a bold cursor row; unfocused, the marker is still
 * there (it marks the row) but dim. The text is identical either way, so the
 * layout never shifts. Under the pointer the label is underlined, the marker
 * is not: hover and cursor stay apart, and both show when they coincide. A
 * row's hover is its own state, so a move re-renders only the row left and the
 * row entered. See docs/components.md (ListSelect).
 */
export function ListRow({ isCursor, isFocused, label, onClick }: ListRowProps): ReactNode {
  const [hovered, hover] = useHover();
  return (
    <Box flexDirection="row" {...hover} onClick={onClick}>
      <Text color={isFocused && isCursor ? 'cyan' : undefined} bold={isFocused && isCursor} dim={!isFocused}>{isCursor ? '▸ ' : '  '}</Text>
      <Text bold={isFocused && isCursor} underline={hovered}>{label}</Text>
    </Box>
  );
}
