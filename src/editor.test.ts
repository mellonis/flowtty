import { expect, test } from 'vitest';
import { reduce, type EditorState } from './editor.js';
import type { Key } from './keys.js';

function key(partial: Partial<Key> & { name: string }): Key {
  return { sequence: '', ctrl: false, meta: false, shift: false, ...partial };
}

const s = (value: string, cursor: number): EditorState => ({ value, cursor });

test('left arrow moves cursor one back (clamped at 0)', () => {
  expect(reduce(s('hello', 3), key({ name: 'left' }))).toEqual({ kind: 'edit', state: s('hello', 2) });
  expect(reduce(s('hello', 0), key({ name: 'left' }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('right arrow moves cursor one forward (clamped at value.length)', () => {
  expect(reduce(s('hello', 3), key({ name: 'right' }))).toEqual({ kind: 'edit', state: s('hello', 4) });
  expect(reduce(s('hello', 5), key({ name: 'right' }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('home (and Ctrl-A) jumps to start', () => {
  expect(reduce(s('hello', 3), key({ name: 'home' }))).toEqual({ kind: 'edit', state: s('hello', 0) });
  expect(reduce(s('hello', 3), key({ name: 'a', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('end (and Ctrl-E) jumps to end', () => {
  expect(reduce(s('hello', 1), key({ name: 'end' }))).toEqual({ kind: 'edit', state: s('hello', 5) });
  expect(reduce(s('hello', 1), key({ name: 'e', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Option+left and Option+B jump to previous word start', () => {
  // "hello world foo" with cursor at 13 → previous word start is 12 ("foo")
  expect(reduce(s('hello world foo', 13), key({ name: 'left', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 12) });
  expect(reduce(s('hello world foo', 13), key({ name: 'b', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 12) });
  // From within "world" (cursor at 9, inside 'world'), goes to start of "world" (6)
  expect(reduce(s('hello world foo', 9), key({ name: 'left', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 6) });
  // From cursor 0, stays at 0
  expect(reduce(s('hello', 0), key({ name: 'left', meta: true }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('Option+right and Option+F jump to end of current/next word', () => {
  // "hello world foo" with cursor at 0 → end of "hello" is 5
  expect(reduce(s('hello world foo', 0), key({ name: 'right', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 5) });
  expect(reduce(s('hello world foo', 0), key({ name: 'f', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 5) });
  // From end of "hello" (cursor 5), skips space then to end of "world" (11)
  expect(reduce(s('hello world foo', 5), key({ name: 'right', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 11) });
});
