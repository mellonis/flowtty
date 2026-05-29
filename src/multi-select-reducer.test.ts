import { expect, test } from 'vitest';
import { reduce, type MultiSelectState } from './multi-select-reducer.js';
import type { Key } from './keys.js';

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
