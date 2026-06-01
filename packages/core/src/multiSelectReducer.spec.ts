import { expect, test } from 'vitest';
import { reduce, type MultiSelectState } from './multiSelectReducer.js';
import type { Key } from '@flowtty/core';

function key(partial: Partial<Key> & { name: string }): Key {
  return { sequence: '', ctrl: false, meta: false, shift: false, ...partial };
}

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `i${i}`, value: i }));

test('down/up moves cursor with wrap', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'down' }))).toEqual({ kind: 'state', state: { cursor: 1 } });
  expect(reduce(items(3), { cursor: 2 }, key({ name: 'down' }))).toEqual({ kind: 'state', state: { cursor: 0 } });
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'up' }))).toEqual({ kind: 'state', state: { cursor: 2 } });
});

test('space toggles the cursor item', () => {
  expect(reduce(items(3), { cursor: 1 }, key({ name: ' ', sequence: ' ' }))).toEqual({
    kind: 'toggle', index: 1,
  });
});

test('space clamps an out-of-range cursor to the last item', () => {
  // Cursor stale past the end (list shrank) — toggle must not return an index
  // that would crash a consumer doing items[index].
  expect(reduce(items(3), { cursor: 7 }, key({ name: ' ', sequence: ' ' }))).toEqual({
    kind: 'toggle', index: 2,
  });
  // Negative cursor clamps to 0.
  expect(reduce(items(3), { cursor: -2 }, key({ name: ' ', sequence: ' ' }))).toEqual({
    kind: 'toggle', index: 0,
  });
});

test('enter submits', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'return' }))).toEqual({ kind: 'submit' });
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'enter' }))).toEqual({ kind: 'submit' });
});

test('escape cancels', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'escape' }))).toEqual({ kind: 'cancel' });
});

test('empty items list: up/down are noop, submit still fires', () => {
  expect(reduce(items(0), { cursor: 0 }, key({ name: 'down' }))).toEqual({ kind: 'noop' });
  expect(reduce(items(0), { cursor: 0 }, key({ name: 'return' }))).toEqual({ kind: 'submit' });
});

test('unhandled key is noop', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'a' }))).toEqual({ kind: 'noop' });
});
