import React from "react";
import { useState, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';
import { multiSelectReducer as reduce, type MultiSelectState, type SelectItem } from '@flowtty/core';

export interface MultiSelectProps<T> {
  items: SelectItem<T>[];
  /** Currently-selected values (controlled). */
  value: T[];
  /** Called whenever the selected set changes (Space toggle), in original item order. */
  onChange: (value: T[]) => void;
  /** Called on Enter with the current value array (in original item order). */
  onSubmit: (value: T[]) => void;
  onCancel?: () => void;
  /** Override focus state. If unset (default), the component reads from the
   *  enclosing FocusGroup. If set, this overrides — useful for forcing focus
   *  outside the focus system. */
  isFocused?: boolean;
  /** When provided, a "+ add new" row appears after items; Enter on it calls this callback. */
  onAddNew?: () => void;
}

export function MultiSelect<T>(props: MultiSelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, onAddNew, isFocused: explicitFocus } = props;
  const { isFocused: ctxFocused } = useFocus();
  const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;
  const totalRows = items.length + (onAddNew ? 1 : 0);
  const [state, setState] = useState<MultiSelectState>({ cursor: 0 });
  const cursor = Math.max(0, Math.min(state.cursor, totalRows - 1));
  const onAddRow = onAddNew !== undefined && cursor === items.length;

  useInput((key) => {
    // Add-new-row specific routing BEFORE reducer.
    if (onAddRow) {
      if (key.name === 'return') { onAddNew!(); return; }
      if (key.name === ' ') return;   // Space is noop on the add row
      // (Up/Down/k/j fall through to the reducer for navigation.)
    }
    // Pad items so the reducer sees `totalRows` entries for navigation wrap.
    // The synthetic add-row value is never looked up (Space guarded above;
    // Enter routes via onAddRow check before submit-handling).
    const paddedItems = onAddNew !== undefined
      ? [...items, { label: '+ add new', value: '\0__add_new__\0' as unknown as T }]
      : items;
    const action = reduce(paddedItems, { cursor }, key);
    if (action.kind === 'state') {
      setState(action.state);
    } else if (action.kind === 'toggle') {
      // Only fires for real item rows (Space on add row guarded above).
      const toggled = items[action.index]!.value;
      const isOn = value.includes(toggled);
      // Build next array in ORIGINAL item order so callers get a deterministic order:
      const next = items
        .filter((it) => (it.value === toggled ? !isOn : value.includes(it.value)))
        .map((it) => it.value);
      onChange(next);
    } else if (action.kind === 'submit') {
      // Submit only fires when cursor is on a real item row (add-row Enter handled above).
      if (!onAddRow) {
        const final = items.filter((it) => value.includes(it.value)).map((it) => it.value);
        onSubmit(final);
      }
    } else if (action.kind === 'cancel') {
      onCancel?.();
    }
  }, { isActive: isFocused });

  return (
    <Box>
      {items.map((it, i) => (
        <Text key={i}>
          {(i === cursor ? '▸ ' : '  ') + (value.includes(it.value) ? '[x] ' : '[ ] ') + it.label}
        </Text>
      ))}
      {onAddNew !== undefined && (
        <Text key="__add__">
          {(cursor === items.length ? '▸ ' : '  ') + '+ add new'}
        </Text>
      )}
    </Box>
  );
}
