import React from "react";
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** When provided, a "+ add new" row appears after items; Enter on it calls this
   *  callback. Return the new item's value — directly or as a promise, e.g. after
   *  a sub-prompt — and the component selects it and moves the cursor onto it
   *  once it shows up in `items` (adding it to `items` is the caller's job).
   *  Return `null` / nothing to leave the selection alone (a cancelled prompt). */
  onAddNew?: () => void | T | null | Promise<T | null | void>;
}

export function MultiSelect<T>(props: MultiSelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, onAddNew, isFocused: explicitFocus } = props;
  const { isFocused: ctxFocused } = useFocus();
  const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;
  const totalRows = items.length + (onAddNew ? 1 : 0);
  const [state, setState] = useState<MultiSelectState>({ cursor: 0 });
  const cursor = Math.max(0, Math.min(state.cursor, totalRows - 1));
  const onAddRow = onAddNew !== undefined && cursor === items.length;

  // The freshly added value, waiting to be selected. Held until it appears in
  // `items`: the caller's setItems and our onChange land in separate renders.
  const valueRef = useRef(value);
  valueRef.current = value;
  const [added, setAdded] = useState<{ value: T } | null>(null);
  useEffect(() => {
    if (added === null) return;
    const index = items.findIndex((it) => it.value === added.value);
    if (index < 0) return;
    setAdded(null);
    setState({ cursor: index });
    const current = valueRef.current;
    if (!current.includes(added.value)) {
      onChange(items.filter((it) => it.value === added.value || current.includes(it.value)).map((it) => it.value));
    }
  }, [added, items, onChange]);
  const addNew = () => {
    void Promise.resolve(onAddNew!()).then((result) => {
      if (result !== null && result !== undefined) setAdded({ value: result as T });
    });
  };

  useInput((key) => {
    // Enter on the "+ add new" row adds instead of submitting. Everything else —
    // navigation over that row, Space doing nothing on it — is the reducer's job:
    // it is told the row exists, so no placeholder item has to be invented.
    if (onAddRow && key.name === 'return') { addNew(); return; }
    const action = reduce(items, { cursor }, key, { extraRows: onAddNew !== undefined ? 1 : 0 });
    if (action.kind === 'state') {
      setState(action.state);
    } else if (action.kind === 'toggle') {
      // Only fires for real item rows (the reducer never toggles an extra row).
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

  // Focus has to be visible: Tab landing on a list that looks exactly as before
  // leaves the user lost. Focused → a colored, bold marker and a bold cursor
  // row; unfocused → the marker is still there (it marks the row) but dim. The
  // text is identical either way, so layouts don't shift.
  const row = (isCursor: boolean, label: string, key: string | number) => (
    <Box key={key} flexDirection="row">
      <Text color={isFocused && isCursor ? 'cyan' : undefined} bold={isFocused && isCursor} dim={!isFocused}>{isCursor ? '▸ ' : '  '}</Text>
      <Text bold={isFocused && isCursor}>{label}</Text>
    </Box>
  );
  return (
    <Box flexDirection="column">
      {items.map((it, i) => row(i === cursor, (value.includes(it.value) ? '[x] ' : '[ ] ') + it.label, i))}
      {onAddNew !== undefined && row(cursor === items.length, '+ add new', '__add__')}
    </Box>
  );
}
