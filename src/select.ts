import { createElement, useState, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { useFocus } from './use-focus.js';
import { reduce, visibleIndices, type SelectItem, type SelectState } from './select-reducer.js';

export type { SelectItem } from './select-reducer.js';

export interface SelectProps<T> {
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

export function Select<T>(props: SelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, isFocused: explicitFocus } = props;
  const { isFocused: ctxFocused } = useFocus();
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
      onCancel?.();
    }
  }, { isActive: isFocused });

  const visible = visibleIndices(items, state.filter);
  const cursorClamped = Math.min(state.cursor, Math.max(0, visible.length - 1));

  return createElement(Box, null,
    state.filter !== '' && createElement(Text, null, `filter: ${state.filter}`),
    ...visible.map((origIdx, row) =>
      createElement(Text, { key: origIdx },
        (row === cursorClamped ? '▸ ' : '  ') + items[origIdx]!.label,
      ),
    ),
  );
}
