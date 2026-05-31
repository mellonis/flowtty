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

export function reduce<T>(items: SelectItem<T>[], state: MultiSelectState, key: Key): MultiSelectAction {
  const n = items.length;

  if (key.name === 'escape') return { kind: 'cancel' };
  if (key.name === 'return' || key.name === 'enter') return { kind: 'submit' };

  if (n === 0) return { kind: 'noop' };

  if (key.name === 'down' || (key.name === 'j' && !key.ctrl && !key.meta)) {
    return { kind: 'state', state: { cursor: (state.cursor + 1) % n } };
  }
  if (key.name === 'up' || (key.name === 'k' && !key.ctrl && !key.meta)) {
    return { kind: 'state', state: { cursor: (state.cursor - 1 + n) % n } };
  }

  if (key.name === ' ') {
    return { kind: 'toggle', index: state.cursor };
  }

  return { kind: 'noop' };
}
