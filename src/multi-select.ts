import { createElement, useState, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { reduce, type MultiSelectState } from './multi-select-reducer.js';
import type { SelectItem } from './select-reducer.js';

export interface MultiSelectProps<T> {
  items: SelectItem<T>[];
  /** Currently-selected values (controlled). */
  value: T[];
  /** Called whenever the selected set changes (Space toggle), in original item order. */
  onChange: (value: T[]) => void;
  /** Called on Enter with the current value array (in original item order). */
  onSubmit: (value: T[]) => void;
  onCancel?: () => void;
  isFocused?: boolean;
}

export function MultiSelect<T>(props: MultiSelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, isFocused = true } = props;
  const [state, setState] = useState<MultiSelectState>({ cursor: 0 });
  const cursor = Math.max(0, Math.min(state.cursor, items.length - 1));

  useInput((key) => {
    const action = reduce(items, { cursor }, key);
    if (action.kind === 'state') {
      setState(action.state);
    } else if (action.kind === 'toggle') {
      const toggled = items[action.index]!.value;
      const isOn = value.includes(toggled);
      // Build next array in ORIGINAL item order so callers get a deterministic order:
      const next = items
        .filter((it) => (it.value === toggled ? !isOn : value.includes(it.value)))
        .map((it) => it.value);
      onChange(next);
    } else if (action.kind === 'submit') {
      // Defensive: re-derive in original item order in case `value` was mutated externally.
      const final = items.filter((it) => value.includes(it.value)).map((it) => it.value);
      onSubmit(final);
    } else if (action.kind === 'cancel') {
      onCancel?.();
    }
  }, { isActive: isFocused });

  return createElement(Box, null,
    ...items.map((it, i) =>
      createElement(Text, { key: i },
        (i === cursor ? '▸ ' : '  ') + (value.includes(it.value) ? '[x] ' : '[ ] ') + it.label,
      ),
    ),
  );
}
