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

test('backspace deletes left of cursor', () => {
  expect(reduce(s('hello', 3), key({ name: 'backspace' }))).toEqual({ kind: 'edit', state: s('helo', 2) });
  expect(reduce(s('hello', 0), key({ name: 'backspace' }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('delete (forward) removes right of cursor', () => {
  expect(reduce(s('hello', 1), key({ name: 'delete' }))).toEqual({ kind: 'edit', state: s('hllo', 1) });
  expect(reduce(s('hello', 5), key({ name: 'delete' }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Ctrl-D deletes forward (emacs alias for delete)', () => {
  expect(reduce(s('hello', 1), key({ name: 'd', ctrl: true }))).toEqual({ kind: 'edit', state: s('hllo', 1) });
});

test('Option+Backspace and Ctrl-W delete the previous word', () => {
  expect(reduce(s('hello world', 11), key({ name: 'backspace', meta: true }))).toEqual({ kind: 'edit', state: s('hello ', 6) });
  expect(reduce(s('hello world', 11), key({ name: 'w', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello ', 6) });
});

test('Option+D (and Option+Delete) deletes the next word', () => {
  expect(reduce(s('hello world', 5), key({ name: 'd', meta: true }))).toEqual({ kind: 'edit', state: s('hello', 5) });
  expect(reduce(s('hello world', 5), key({ name: 'delete', meta: true }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Ctrl-K kills from cursor to end', () => {
  expect(reduce(s('hello world', 5), key({ name: 'k', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Ctrl-U kills from cursor to start', () => {
  expect(reduce(s('hello world', 6), key({ name: 'u', ctrl: true }))).toEqual({ kind: 'edit', state: s('world', 0) });
});
