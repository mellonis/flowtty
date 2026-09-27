import React from "react";
import { useState, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { ListRow } from './ListRow.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';
import { selectReducer as reduce, visibleIndices, type SelectItem, type SelectState } from '@flowtty/core';

export type { SelectItem } from '@flowtty/core';

export interface ListSelectProps<T> {
  items: SelectItem<T>[];
  /** Currently-highlighted value (controlled). */
  value: T;
  /** Called whenever the highlight moves (arrow nav OR filter narrows the list). */
  onChange: (value: T) => void;
  /** Called on Enter with the highlighted value. */
  onSubmit: (value: T) => void;
  /** Called on Escape. */
  onCancel?: () => void;
  /** Override focus state. If unset (default), the component reads from the
   *  enclosing FocusGroup. If set, this overrides — useful for forcing focus
   *  outside the focus system. */
  isFocused?: boolean;
}

export function ListSelect<T>(props: ListSelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, isFocused: explicitFocus } = props;
  const { isFocused: ctxFocused, focus } = useFocus();
  const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;

  // Initial cursor: position of the controlled value in the (unfiltered) item list.
  const initialCursor = Math.max(0, items.findIndex((it) => it.value === value));
  const [state, setState] = useState<SelectState>({ cursor: initialCursor, filter: '' });

  useInput((key) => {
    const action = reduce(items, state, key);
    if (action.kind === 'state') {
      setState(action.state);
      const newVisible = visibleIndices(items, action.state.filter);
      const newCursor = Math.min(action.state.cursor, Math.max(0, newVisible.length - 1));
      const newItem = newVisible.length > 0 ? items[newVisible[newCursor]!]! : undefined;
      if (newItem !== undefined && newItem.value !== value) onChange(newItem.value);
    } else if (action.kind === 'submit') {
      onSubmit(items[action.index]!.value);
    } else if (action.kind === 'cancel') {
      if (!onCancel) return;
      onCancel();
    } else {
      return;
    }
    return true; // the key did something here: nobody behind the list sees it
  }, { isActive: isFocused });

  const visible = visibleIndices(items, state.filter);
  const cursorClamped = Math.min(state.cursor, Math.max(0, visible.length - 1));

  // A click on a row: the highlight moves there and the value follows, as an
  // arrow key would. Confirming is not the list's business (Enter still is).
  const pick = (row: number): void => {
    focus();
    if (row === cursorClamped) return;
    setState({ cursor: row, filter: state.filter });
    const item = items[visible[row]!]!;
    if (item.value !== value) onChange(item.value);
  };

  return (
    <Box onClick={focus}>{/* blank space focuses; a row's own onClick is nearer and picks */}
      {state.filter !== '' && <Text>{`filter: ${state.filter}`}</Text>}
      {visible.map((origIdx, row) => (
        <ListRow key={origIdx} isCursor={row === cursorClamped} isFocused={isFocused} label={items[origIdx]!.label} onClick={() => pick(row)} />
      ))}
    </Box>
  );
}
