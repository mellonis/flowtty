import type { Key } from './keys.js';

export interface SelectItem<T> {
  label: string;
  value: T;
}

export interface SelectState {
  cursor: number;  // index into the visible (filtered) list
  filter: string;
}

export type SelectAction =
  | { kind: 'state'; state: SelectState }
  | { kind: 'submit'; index: number }  // index into the ORIGINAL items array
  | { kind: 'cancel' }
  | { kind: 'noop' };

/**
 * Indices into `items` of items whose label contains `filter` (case-insensitive
 * substring). Empty filter → all indices.
 */
export function visibleIndices<T>(items: SelectItem<T>[], filter: string): number[] {
  if (filter === '') return items.map((_, i) => i);
  const q = filter.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.label.toLowerCase().includes(q)) out.push(i);
  }
  return out;
}

export function reduce<T>(items: SelectItem<T>[], state: SelectState, key: Key): SelectAction {
  const visible = visibleIndices(items, state.filter);
  const n = visible.length;

  if (key.name === 'escape') return { kind: 'cancel' };

  if (key.name === 'return') {
    if (n === 0) return { kind: 'noop' };
    const cursor = Math.min(state.cursor, n - 1);
    return { kind: 'submit', index: visible[cursor]! };
  }

  if (key.name === 'down' || (key.name === 'j' && !key.ctrl && !key.meta)) {
    if (n === 0) return { kind: 'noop' };
    return { kind: 'state', state: { cursor: (state.cursor + 1) % n, filter: state.filter } };
  }
  if (key.name === 'up' || (key.name === 'k' && !key.ctrl && !key.meta)) {
    if (n === 0) return { kind: 'noop' };
    return { kind: 'state', state: { cursor: (state.cursor - 1 + n) % n, filter: state.filter } };
  }

  if (key.name === 'backspace') {
    if (state.filter === '') return { kind: 'noop' };
    return { kind: 'state', state: { cursor: 0, filter: state.filter.slice(0, -1) } };
  }

  // Printable single-char (no ctrl/meta) appends to filter; cursor resets to 0
  // so the user always sees the first match after typing.
  if (!key.ctrl && !key.meta && key.name.length === 1) {
    return { kind: 'state', state: { cursor: 0, filter: state.filter + key.name } };
  }

  return { kind: 'noop' };
}
