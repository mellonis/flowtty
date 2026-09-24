import { isPrintable, type Key } from './keys.js';
import { caretPosition, inputRows, rowIndexAt } from './inputRows.js';

export interface EditorState {
  value: string;
  /** UTF-16 index into `value` (so `value.slice(0, cursor)` is the text before
   *  the caret). It only ever rests on a character boundary: movement and
   *  deletion step over a whole code point, and a cursor handed in between the
   *  two halves of a surrogate pair is snapped back before anything else. */
  cursor: number;
}

const isHigh = (u: string | undefined): boolean => u !== undefined && u >= '\ud800' && u <= '\udbff';
const isLow = (u: string | undefined): boolean => u !== undefined && u >= '\udc00' && u <= '\udfff';
// Index one character to the left / right of `i` (an astral character is two units).
const prevIndex = (v: string, i: number): number => (i >= 2 && isLow(v[i - 1]) && isHigh(v[i - 2]) ? i - 2 : Math.max(0, i - 1));
const nextIndex = (v: string, i: number): number => (isHigh(v[i]) && isLow(v[i + 1]) ? i + 2 : Math.min(v.length, i + 1));

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

export interface EditorOptions {
  /** Multi-line editing: line breaks are part of the value. Shift+Enter,
   *  Alt+Enter and backslash-then-Enter insert one (plain Enter still submits),
   *  up/down move between visual rows, Home/End and the kill bindings work
   *  within the current line, and a paste keeps its line breaks. */
  multiline?: boolean;
  /** Wrap width in cells — what up/down use to walk soft-wrapped rows. Only
   *  read when `multiline`; without it each source line counts as one row.
   *  It MUST be the width the field is actually drawn with (the one passed to
   *  `inputRows` / `caretPosition`): a host that renders the rows itself computes
   *  both, and a mismatch makes up/down land on a different column than shown. */
  width?: number;
}

/**
 * One key against an editor state. Contract hosts rely on: a key the editor has
 * no meaning for (Tab, Ctrl+R, PgUp, the wheel, an unrecognized sequence …)
 * returns `{ kind: 'noop' }` — never an edit — so a host can handle its own keys
 * first and pass everything else through.
 */
export function reduce(state: EditorState, key: Key, opts: EditorOptions = {}): EditorAction {
  const { value } = state;
  // Never edit from inside a surrogate pair.
  let cursor = Math.max(0, Math.min(value.length, state.cursor));
  if (isLow(value[cursor]) && isHigh(value[cursor - 1])) cursor--;
  const multiline = opts.multiline === true;
  // Bounds of the line the cursor is on: the whole value when single-line.
  const lineStart = multiline ? value.lastIndexOf('\n', cursor - 1) + 1 : 0;
  const nextBreak = multiline ? value.indexOf('\n', cursor) : -1;
  const lineEnd = nextBreak < 0 ? value.length : nextBreak;
  const insert = (text: string): EditorAction => ({
    kind: 'edit',
    state: { value: value.slice(0, cursor) + text + value.slice(cursor), cursor: cursor + text.length },
  });

  // Paste: insert the whole text at the cursor. This editor is single-line, so
  // line breaks become spaces — a multi-line paste must never act as Enter.
  if (key.name === 'paste') {
    // Hosts may build the key themselves, so normalize here too, not only in the key parser.
    const pasted = (key.text ?? '').replace(/\r\n?/g, '\n');
    const text = multiline ? pasted : pasted.replace(/\n/g, ' ');
    if (text === '') return { kind: 'noop' };
    return insert(text);
  }

  if (multiline) {
    // Line breaks. Backslash-then-Enter is the one form every terminal delivers:
    // Shift+Enter is often indistinguishable from Enter without the Kitty protocol.
    if (key.name === 'return' && (key.shift || key.meta)) return insert('\n');
    if (key.name === 'return' && cursor > 0 && value[cursor - 1] === '\\') {
      return { kind: 'edit', state: { value: value.slice(0, cursor - 1) + '\n' + value.slice(cursor), cursor } };
    }
    // Row-wise movement over the wrapped layout, keeping the column where the
    // target row is long enough. Off the first/last row → start/end of the value.
    if (key.name === 'up' || key.name === 'down') {
      const width = opts.width ?? Number.MAX_SAFE_INTEGER;
      const rows = inputRows(value, width, cursor);
      const at = caretPosition(value, cursor, width);
      const target = at.row + (key.name === 'up' ? -1 : 1);
      if (target < 0) return { kind: 'edit', state: { value, cursor: 0 } };
      if (target >= rows.length) return { kind: 'edit', state: { value, cursor: value.length } };
      const row = rows[target]!;
      return { kind: 'edit', state: { value, cursor: rowIndexAt(row, at.col) } };
    }
  }

  // Cursor movement
  if (key.name === 'left' && key.meta) return { kind: 'edit', state: { value, cursor: wordLeft(value, cursor) } };
  if (key.name === 'b' && key.meta) return { kind: 'edit', state: { value, cursor: wordLeft(value, cursor) } };
  if (key.name === 'right' && key.meta) return { kind: 'edit', state: { value, cursor: wordRight(value, cursor) } };
  if (key.name === 'f' && key.meta) return { kind: 'edit', state: { value, cursor: wordRight(value, cursor) } };
  if (key.name === 'left') return { kind: 'edit', state: { value, cursor: prevIndex(value, cursor) } };
  if (key.name === 'right') return { kind: 'edit', state: { value, cursor: nextIndex(value, cursor) } };
  if (key.name === 'home') return { kind: 'edit', state: { value, cursor: lineStart } };
  if (key.name === 'end') return { kind: 'edit', state: { value, cursor: lineEnd } };
  if (key.name === 'a' && key.ctrl) return { kind: 'edit', state: { value, cursor: lineStart } };
  if (key.name === 'e' && key.ctrl) return { kind: 'edit', state: { value, cursor: lineEnd } };

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
    return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(lineEnd), cursor } };
  }
  if (key.name === 'u' && key.ctrl) {
    return { kind: 'edit', state: { value: value.slice(0, lineStart) + value.slice(cursor), cursor: lineStart } };
  }

  // Typography: Option+key with an OPT_MAP entry inserts a typography character.
  if (key.meta && OPT_MAP[key.name]) {
    const entry = OPT_MAP[key.name]!;
    const ch = (key.shift && entry[1] !== undefined) ? entry[1]! : entry[0]!;
    return { kind: 'edit', state: { value: value.slice(0, cursor) + ch + value.slice(cursor), cursor: cursor + 1 } };
  }

  // Single-char deletion
  if (key.name === 'backspace') {
    if (cursor === 0) return { kind: 'edit', state: { value, cursor } };
    const from = prevIndex(value, cursor);
    return { kind: 'edit', state: { value: value.slice(0, from) + value.slice(cursor), cursor: from } };
  }
  if (key.name === 'delete' || (key.name === 'd' && key.ctrl)) {
    if (cursor === value.length) return { kind: 'edit', state: { value, cursor } };
    return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(nextIndex(value, cursor)), cursor } };
  }

  // Submit / cancel
  if (key.name === 'return') return { kind: 'submit' };
  if (key.name === 'escape') return { kind: 'cancel' };

  // Printable insertion — single-character name only, no modifiers.
  // (ctrl/meta combinations that didn't match an earlier specific branch are noops,
  // NOT insertions — so Ctrl-Q does nothing rather than typing 'q'.)
  // One CODE POINT, not one UTF-16 unit: an emoji's name is two units long.
  if (isPrintable(key)) return insert(key.name);

  return { kind: 'noop' };
}
