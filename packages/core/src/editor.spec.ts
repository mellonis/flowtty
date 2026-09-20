import { expect, test } from 'vitest';
import { reduce, type EditorState } from './editor.js';
import type { Key } from '@flowtty/core';

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

test('printable character inserts at cursor and advances it', () => {
  expect(reduce(s('hllo', 1), key({ name: 'e', sequence: 'e' }))).toEqual({ kind: 'edit', state: s('hello', 2) });
  expect(reduce(s('', 0), key({ name: 'X', sequence: 'X' }))).toEqual({ kind: 'edit', state: s('X', 1) });
});

test('printable character with ctrl/meta is NOT inserted (those are bindings)', () => {
  // Ctrl-A is the home binding (cursor to 0), not an insert of 'a'.
  expect(reduce(s('hi', 2), key({ name: 'a', ctrl: true }))).toMatchObject({ kind: 'edit', state: s('hi', 0) });
  // Ctrl-Q is unbound → noop, NOT insert.
  expect(reduce(s('hi', 2), key({ name: 'q', ctrl: true }))).toEqual({ kind: 'noop' });
});

test('NBSP (U+00A0) inserts byte-exact (the value contains U+00A0, not space)', () => {
  const action = reduce(s('a', 1), key({ name: ' ', sequence: ' ' }));
  expect(action).toEqual({ kind: 'edit', state: s('a ', 2) });
  if (action.kind === 'edit') {
    expect(action.state.value.charCodeAt(1)).toBe(0x00A0);
  }
});

test('return → submit', () => {
  expect(reduce(s('hello', 5), key({ name: 'return' }))).toEqual({ kind: 'submit' });
});

test('Escape → cancel', () => {
  expect(reduce(s('hello', 5), key({ name: 'escape' }))).toEqual({ kind: 'cancel' });
});

test('unbound key returns noop', () => {
  expect(reduce(s('hello', 5), key({ name: 'f5' }))).toEqual({ kind: 'noop' });
});

test('Option+Space inserts NBSP (U+00A0)', () => {
  const action = reduce(s('a', 1), key({ name: ' ', meta: true }));   // was 'space'
  expect(action.kind === 'edit' && action.state.value).toBe('a ');
});

test('Option+- inserts en-dash (U+2013)', () => {
  const action = reduce(s('a', 1), key({ name: '-', meta: true }));
  expect(action.kind === 'edit' && action.state.value).toBe('a–');
});

test('Option+Shift+- inserts em-dash (U+2014)', () => {
  const action = reduce(s('a', 1), key({ name: '-', meta: true, shift: true }));
  expect(action.kind === 'edit' && action.state.value).toBe('a—');
});

test('Option+[ and Option+Shift+[ insert curly double quotes', () => {
  expect((reduce(s('', 0), key({ name: '[', meta: true })) as { state: EditorState }).state.value).toBe('“'); // U+201C left double quote
  expect((reduce(s('', 0), key({ name: '[', meta: true, shift: true })) as { state: EditorState }).state.value).toBe('”'); // U+201D right double quote
});

test('Option+] and Option+Shift+] insert curly single quotes', () => {
  expect((reduce(s('', 0), key({ name: ']', meta: true })) as { state: EditorState }).state.value).toBe('‘'); // U+2018 left single quote
  expect((reduce(s('', 0), key({ name: ']', meta: true, shift: true })) as { state: EditorState }).state.value).toBe('’'); // U+2019 right single quote
});

test('Option+letter that has no typography mapping is a noop (NOT a word op)', () => {
  // 'z' has no entry in OPT_MAP and no word/movement binding
  expect(reduce(s('hi', 2), key({ name: 'z', meta: true }))).toEqual({ kind: 'noop' });
});

test('a paste inserts its whole text at the cursor and moves the cursor past it', () => {
  const a = reduce(s('hello', 2), key({ name: 'paste', text: 'XYZ' }));
  expect(a).toEqual({ kind: 'edit', state: { value: 'heXYZllo', cursor: 5 } });
});

test('a multi-line paste into the single-line editor never submits: line breaks become spaces', () => {
  const a = reduce(s('', 0), key({ name: 'paste', text: 'one\ntwo\n\nthree' }));
  expect(a).toEqual({ kind: 'edit', state: { value: 'one two  three', cursor: 14 } });
});

test('an empty paste is a noop', () => {
  expect(reduce(s('hi', 1), key({ name: 'paste', text: '' }))).toEqual({ kind: 'noop' });
});

// ─── multiline ───────────────────────────────────────────────────────────────

const ml = { multiline: true, width: 10 } as const;
const edit = (a: ReturnType<typeof reduce>) => (a as { state: EditorState }).state;

test('multiline: plain Enter still submits', () => {
  expect(reduce(s('hi', 2), key({ name: 'return' }), ml)).toEqual({ kind: 'submit' });
});

test('multiline: Shift+Enter and Alt+Enter insert a line break at the cursor', () => {
  expect(edit(reduce(s('ab', 1), key({ name: 'return', shift: true }), ml))).toEqual({ value: 'a\nb', cursor: 2 });
  expect(edit(reduce(s('ab', 1), key({ name: 'return', meta: true }), ml))).toEqual({ value: 'a\nb', cursor: 2 });
});

test('multiline: backslash then Enter turns the backslash into a line break instead of submitting', () => {
  expect(edit(reduce(s('one\\two', 4), key({ name: 'return' }), ml))).toEqual({ value: 'one\ntwo', cursor: 4 });
});

test('single-line: backslash + Enter is just submit, and Shift+Enter too', () => {
  expect(reduce(s('one\\', 4), key({ name: 'return' }))).toEqual({ kind: 'submit' });
  expect(reduce(s('one', 3), key({ name: 'return', shift: true }))).toEqual({ kind: 'submit' });
});

test('multiline: a paste keeps its line breaks', () => {
  expect(edit(reduce(s('ab', 1), key({ name: 'paste', text: 'x\ny' }), ml))).toEqual({ value: 'ax\nyb', cursor: 4 });
});

test('multiline: down / up move between lines keeping the column', () => {
  const v = 'hello\nworld!\nx';
  expect(edit(reduce(s(v, 3), key({ name: 'down' }), ml)).cursor).toBe(9);   // "wor|ld!"
  expect(edit(reduce(s(v, 9), key({ name: 'up' }), ml)).cursor).toBe(3);
});

test('multiline: moving onto a shorter line clamps to its end; onto a blank line lands on it', () => {
  const v = 'hello\n\nx';
  expect(edit(reduce(s(v, 4), key({ name: 'down' }), ml)).cursor).toBe(6);   // the blank line
  expect(edit(reduce(s(v, 6), key({ name: 'down' }), ml)).cursor).toBe(7);   // col 0 of "x"
  expect(edit(reduce(s('hello\nx', 4), key({ name: 'down' }), ml)).cursor).toBe(7); // end of "x"
});

test('multiline: up on the first row goes to the start, down on the last row to the end', () => {
  expect(edit(reduce(s('hello\nx', 3), key({ name: 'up' }), ml)).cursor).toBe(0);
  expect(edit(reduce(s('hello\nxyz', 7), key({ name: 'down' }), ml)).cursor).toBe(9);
});

test('multiline: up / down walk soft-wrapped rows of one long line', () => {
  const v = 'abcdefghijKLMNOPQRSTuvw'; // rows at width 10: abcdefghij / KLMNOPQRST / uvw
  expect(edit(reduce(s(v, 2), key({ name: 'down' }), ml)).cursor).toBe(12);
  expect(edit(reduce(s(v, 12), key({ name: 'down' }), ml)).cursor).toBe(22);
  expect(edit(reduce(s(v, 17), key({ name: 'down' }), ml)).cursor).toBe(23); // clamps to the short last row
  expect(edit(reduce(s(v, 22), key({ name: 'up' }), ml)).cursor).toBe(12);
});

test('multiline: Home / End and ^a / ^e work within the current line, not the whole value', () => {
  const v = 'one\ntwo three\nfour';
  expect(edit(reduce(s(v, 7), key({ name: 'home' }), ml)).cursor).toBe(4);
  expect(edit(reduce(s(v, 7), key({ name: 'end' }), ml)).cursor).toBe(13);
  expect(edit(reduce(s(v, 7), key({ name: 'a', ctrl: true }), ml)).cursor).toBe(4);
  expect(edit(reduce(s(v, 7), key({ name: 'e', ctrl: true }), ml)).cursor).toBe(13);
});

test('multiline: ^k / ^u kill to the end / start of the current line only', () => {
  const v = 'one\ntwo three\nfour';
  expect(edit(reduce(s(v, 7), key({ name: 'k', ctrl: true }), ml))).toEqual({ value: 'one\ntwo\nfour', cursor: 7 });
  expect(edit(reduce(s(v, 7), key({ name: 'u', ctrl: true }), ml))).toEqual({ value: 'one\n three\nfour', cursor: 4 });
});

test('multiline: backspace at the start of a line joins it to the previous one', () => {
  expect(edit(reduce(s('ab\ncd', 3), key({ name: 'backspace' }), ml))).toEqual({ value: 'abcd', cursor: 2 });
});

// ─── astral characters (emoji = two UTF-16 units) and CR in pastes ───────────

test('left / right step over a whole astral character, never into the middle of it', () => {
  const v = 'a😀b'; // units: a(0) 😀(1,2) b(3)
  expect(edit(reduce(s(v, 1), key({ name: 'right' }))).cursor).toBe(3);
  expect(edit(reduce(s(v, 3), key({ name: 'left' }))).cursor).toBe(1);
});

test('backspace / delete remove a whole astral character', () => {
  expect(edit(reduce(s('a😀b', 3), key({ name: 'backspace' })))).toEqual({ value: 'ab', cursor: 1 });
  expect(edit(reduce(s('a😀b', 1), key({ name: 'delete' })))).toEqual({ value: 'ab', cursor: 1 });
});

test('a cursor handed in mid-pair is snapped to the character boundary before editing', () => {
  expect(edit(reduce(s('a😀b', 2), key({ name: 'x' })))).toEqual({ value: 'ax😀b', cursor: 2 });
  expect(edit(reduce(s('a😀b', 2), key({ name: 'backspace' })))).toEqual({ value: '😀b', cursor: 0 });
});

test('typing an astral character inserts it and moves the cursor past both units', () => {
  expect(edit(reduce(s('ab', 1), key({ name: '😀' })))).toEqual({ value: 'a😀b', cursor: 3 });
});

test('a paste normalizes CRLF and lone CR to LF (multiline) — no CR ever enters the value', () => {
  expect(edit(reduce(s('ab', 1), key({ name: 'paste', text: 'x\r\ny\rz' }), ml))).toEqual({ value: 'ax\ny\nzb', cursor: 6 });
  expect(edit(reduce(s('', 0), key({ name: 'paste', text: 'x\r\ny' })))).toEqual({ value: 'x y', cursor: 3 });
});

test('multiline: up / down keep the column counted in characters across rows with astral characters', () => {
  const v = '😀😀😀x\nabcdef'; // col 3 on row 0 is before "x" (unit index 6)
  expect(edit(reduce(s(v, 6), key({ name: 'down' }), ml)).cursor).toBe(11);  // "abc|def"
  expect(edit(reduce(s(v, 11), key({ name: 'up' }), ml)).cursor).toBe(6);
});
