import { expect, test } from 'vitest';
import { reduce, visibleIndices, type SelectState } from './select-reducer.js';
import type { Key } from './keys.js';

function key(partial: Partial<Key> & { name: string }): Key {
  return { sequence: '', ctrl: false, meta: false, shift: false, ...partial };
}

const labels = (items: string[]) => items.map((label, i) => ({ label, value: i }));

test('visibleIndices: empty filter returns all items', () => {
  expect(visibleIndices(labels(['a', 'b', 'c']), '')).toEqual([0, 1, 2]);
});

test('visibleIndices: substring match (case-insensitive)', () => {
  expect(visibleIndices(labels(['Apple', 'banana', 'cherry']), 'an')).toEqual([1]);
  expect(visibleIndices(labels(['Apple', 'banana', 'cherry']), 'A')).toEqual([0, 1]);
});

test('down arrow advances cursor within visible items', () => {
  const items = labels(['a', 'b', 'c']);
  const s: SelectState = { cursor: 0, filter: '' };
  expect(reduce(items, s, key({ name: 'down' }))).toEqual({ kind: 'state', state: { cursor: 1, filter: '' } });
});

test('down arrow wraps from last to first', () => {
  const items = labels(['a', 'b', 'c']);
  expect(reduce(items, { cursor: 2, filter: '' }, key({ name: 'down' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: '' },
  });
});

test('up arrow goes back; wraps from first to last', () => {
  const items = labels(['a', 'b', 'c']);
  expect(reduce(items, { cursor: 1, filter: '' }, key({ name: 'up' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: '' },
  });
  expect(reduce(items, { cursor: 0, filter: '' }, key({ name: 'up' }))).toEqual({
    kind: 'state', state: { cursor: 2, filter: '' },
  });
});

test('printable char appends to filter and resets cursor to 0', () => {
  const items = labels(['apple', 'banana', 'cherry']);
  expect(reduce(items, { cursor: 2, filter: '' }, key({ name: 'b', sequence: 'b' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: 'b' },
  });
});

test('backspace removes last filter char and resets cursor', () => {
  const items = labels(['a', 'b']);
  expect(reduce(items, { cursor: 1, filter: 'xy' }, key({ name: 'backspace' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: 'x' },
  });
  expect(reduce(items, { cursor: 0, filter: '' }, key({ name: 'backspace' }))).toEqual({ kind: 'noop' });
});

test('enter submits the ORIGINAL index of the visible item at the cursor', () => {
  const items = labels(['apple', 'banana', 'cherry']);
  // Filter 'an' → visible [banana] (original index 1); cursor 0 there.
  expect(reduce(items, { cursor: 0, filter: 'an' }, key({ name: 'return' }))).toEqual({
    kind: 'submit', index: 1,
  });
});

test('enter on empty visible list is noop (no item to submit)', () => {
  const items = labels(['apple', 'banana']);
  expect(reduce(items, { cursor: 0, filter: 'xyz' }, key({ name: 'return' }))).toEqual({ kind: 'noop' });
});

test('escape cancels', () => {
  const items = labels(['a']);
  expect(reduce(items, { cursor: 0, filter: '' }, key({ name: 'escape' }))).toEqual({ kind: 'cancel' });
});

test('cursor clamps to visible range when filter narrows the list', () => {
  const items = labels(['apple', 'banana', 'cherry']);
  // Type 'b' from cursor=2: visibleIndices('b') = [1] (banana); reducer resets cursor to 0
  expect(reduce(items, { cursor: 2, filter: '' }, key({ name: 'b', sequence: 'b' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: 'b' },
  });
});
