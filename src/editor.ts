import type { Key } from './keys.js';

export interface EditorState {
  value: string;
  cursor: number;
}

export type EditorAction =
  | { kind: 'edit'; state: EditorState }
  | { kind: 'submit' }
  | { kind: 'cancel' }
  | { kind: 'noop' };

// A "word char" is alphanumeric (letters of any script, digits, underscore).
// Whitespace and punctuation are word boundaries.
const isWord = (c: string) => /[\p{L}\p{N}_]/u.test(c);

function wordLeft(value: string, cursor: number): number {
  let c = cursor;
  // Skip non-word chars to the left
  while (c > 0 && !isWord(value[c - 1]!)) c--;
  // Then skip word chars to the left, landing at the word start
  while (c > 0 && isWord(value[c - 1]!)) c--;
  return c;
}

function wordRight(value: string, cursor: number): number {
  let c = cursor;
  // Skip non-word chars to the right
  while (c < value.length && !isWord(value[c]!)) c++;
  // Then skip word chars to the right, landing at the word end
  while (c < value.length && isWord(value[c]!)) c++;
  return c;
}

export function reduce(state: EditorState, key: Key): EditorAction {
  const { value, cursor } = state;
  const clamp = (n: number) => Math.max(0, Math.min(value.length, n));

  // Cursor movement
  if (key.name === 'left' && key.meta) return { kind: 'edit', state: { value, cursor: wordLeft(value, cursor) } };
  if (key.name === 'b' && key.meta) return { kind: 'edit', state: { value, cursor: wordLeft(value, cursor) } };
  if (key.name === 'right' && key.meta) return { kind: 'edit', state: { value, cursor: wordRight(value, cursor) } };
  if (key.name === 'f' && key.meta) return { kind: 'edit', state: { value, cursor: wordRight(value, cursor) } };
  if (key.name === 'left') return { kind: 'edit', state: { value, cursor: clamp(cursor - 1) } };
  if (key.name === 'right') return { kind: 'edit', state: { value, cursor: clamp(cursor + 1) } };
  if (key.name === 'home') return { kind: 'edit', state: { value, cursor: 0 } };
  if (key.name === 'end') return { kind: 'edit', state: { value, cursor: value.length } };
  if (key.name === 'a' && key.ctrl) return { kind: 'edit', state: { value, cursor: 0 } };
  if (key.name === 'e' && key.ctrl) return { kind: 'edit', state: { value, cursor: value.length } };

  return { kind: 'noop' };
}
