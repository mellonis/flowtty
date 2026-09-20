import type { Key } from './keys.js';
import type { SelectItem } from './selectReducer.js';

export interface MultiSelectState {
  cursor: number;
}

export type MultiSelectAction =
  | { kind: 'state'; state: MultiSelectState }
  | { kind: 'toggle'; index: number }
  | { kind: 'submit' }
  | { kind: 'cancel' }
  | { kind: 'noop' };

export interface MultiSelectOptions {
  /** Rows after the items that the cursor can stand on but that hold no item —
   *  e.g. a trailing "+ add new" row. Navigation wraps over items + extra rows;
   *  Space on an extra row toggles nothing. Default 0. */
  extraRows?: number;
}

export function reduce<T>(
  items: SelectItem<T>[],
  state: MultiSelectState,
  key: Key,
  opts: MultiSelectOptions = {},
): MultiSelectAction {
  const n = items.length + Math.max(0, opts.extraRows ?? 0);

  if (key.name === 'escape') return { kind: 'cancel' };
  if (key.name === 'return') return { kind: 'submit' };

  if (n === 0) return { kind: 'noop' };

  if (key.name === 'down' || (key.name === 'j' && !key.ctrl && !key.meta)) {
    return { kind: 'state', state: { cursor: (state.cursor + 1) % n } };
  }
  if (key.name === 'up' || (key.name === 'k' && !key.ctrl && !key.meta)) {
    return { kind: 'state', state: { cursor: (state.cursor - 1 + n) % n } };
  }

  if (key.name === ' ') {
    // Clamp into range: cursor may be stale relative to the current item count
    // (e.g. the list shrank since it was last set), and consumers index
    // items[index] directly — an out-of-range index would crash them. n >= 1
    // here (the n === 0 case returned above).
    const index = Math.max(0, Math.min(state.cursor, n - 1));
    if (index >= items.length) return { kind: 'noop' }; // an extra row holds no item
    return { kind: 'toggle', index };
  }

  return { kind: 'noop' };
}
