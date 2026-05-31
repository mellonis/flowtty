import type { Key } from '@flowtty/core';

export interface EditorState {
  value: string;
  cursor: number;
}

export type EditorAction =
  | { kind: 'edit'; state: EditorState }
  | { kind: 'submit' }
  | { kind: 'cancel' }
  | { kind: 'noop' };

// Mac Option-modifier typography map. Each entry: keyName → [unshifted, shifted?].
// Inserted byte-exact: NBSP, en/em dash, curly quotes.
const OPT_MAP: Record<string, [string] | [string, string]> = {
  ' ': [' '],                                   // U+00A0 NBSP
  '-':   ['–', '—'],     // en-dash U+2013, em-dash U+2014
  '[':   ['“', '”'],     // left/right double quote
  ']':   ['‘', '’'],     // left/right single quote
};

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

  // Word deletion (check meta-modified BEFORE plain backspace/delete)
  if (key.name === 'backspace' && key.meta) {
    const start = wordLeft(value, cursor);
    return { kind: 'edit', state: { value: value.slice(0, start) + value.slice(cursor), cursor: start } };
  }
  if (key.name === 'w' && key.ctrl) {
    const start = wordLeft(value, cursor);
    return { kind: 'edit', state: { value: value.slice(0, start) + value.slice(cursor), cursor: start } };
  }
  if (key.name === 'd' && key.meta) {
    const end = wordRight(value, cursor);
    return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(end), cursor } };
  }
  if (key.name === 'delete' && key.meta) {
    const end = wordRight(value, cursor);
    return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(end), cursor } };
  }

  // Kill bindings
  if (key.name === 'k' && key.ctrl) {
    return { kind: 'edit', state: { value: value.slice(0, cursor), cursor } };
  }
  if (key.name === 'u' && key.ctrl) {
    return { kind: 'edit', state: { value: value.slice(cursor), cursor: 0 } };
  }

  // Typography: Option+key with an OPT_MAP entry inserts a typography character.
  if (key.meta && OPT_MAP[key.name]) {
    const entry = OPT_MAP[key.name]!;
    const ch = (key.shift && entry[1] !== undefined) ? entry[1]! : entry[0]!;
    return { kind: 'edit', state: { value: value.slice(0, cursor) + ch + value.slice(cursor), cursor: cursor + 1 } };
  }

  // Single-char deletion
  if (key.name === 'backspace') {
    if (cursor === 0) return { kind: 'edit', state };
    return { kind: 'edit', state: { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 } };
  }
  if (key.name === 'delete' || (key.name === 'd' && key.ctrl)) {
    if (cursor === value.length) return { kind: 'edit', state };
    return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(cursor + 1), cursor } };
  }

  // Submit / cancel
  if (key.name === 'return' || key.name === 'enter') return { kind: 'submit' };
  if (key.name === 'escape') return { kind: 'cancel' };

  // Printable insertion — single-character name only, no modifiers.
  // (ctrl/meta combinations that didn't match an earlier specific branch are noops,
  // NOT insertions — so Ctrl-Q does nothing rather than typing 'q'.)
  if (!key.ctrl && !key.meta && key.name.length === 1) {
    const ch = key.name;
    return { kind: 'edit', state: { value: value.slice(0, cursor) + ch + value.slice(cursor), cursor: cursor + 1 } };
  }

  return { kind: 'noop' };
}
