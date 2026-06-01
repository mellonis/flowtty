import { expect, test } from 'vitest';
import { parseKeypress } from './key-parser.js';

test('printable ASCII becomes one key per char (name === char, no modifiers)', () => {
  expect(parseKeypress('hi')).toEqual([
    { name: 'h', sequence: 'h', ctrl: false, meta: false, shift: false },
    { name: 'i', sequence: 'i', ctrl: false, meta: false, shift: false },
  ]);
});

test('printable Space → name " " (single byte; consumers normalize, parser does not)', () => {
  const keys = parseKeypress(' ');
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatchObject({ name: ' ', sequence: ' ', ctrl: false, meta: false });
});

test('Return / newline / Tab / Backspace map to canonical names', () => {
  expect(parseKeypress('\r')[0]!.name).toBe('return');
  expect(parseKeypress('\n')[0]!.name).toBe('return');
  expect(parseKeypress('\t')[0]!.name).toBe('tab');
  expect(parseKeypress('\x7f')[0]!.name).toBe('backspace');
  expect(parseKeypress('\x08')[0]!.name).toBe('backspace');
});

test('lone ESC at end of buffer → escape key', () => {
  expect(parseKeypress('\x1b')).toEqual([
    { name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false },
  ]);
});

test('Ctrl-A..Z → name is lowercase letter with ctrl=true', () => {
  expect(parseKeypress('\x01')[0]).toMatchObject({ name: 'a', ctrl: true, meta: false, shift: false });
  expect(parseKeypress('\x05')[0]).toMatchObject({ name: 'e', ctrl: true });
  expect(parseKeypress('\x17')[0]).toMatchObject({ name: 'w', ctrl: true });
});

test('CSI arrows ESC[A/B/C/D → up/down/right/left', () => {
  expect(parseKeypress('\x1b[A')[0]!.name).toBe('up');
  expect(parseKeypress('\x1b[B')[0]!.name).toBe('down');
  expect(parseKeypress('\x1b[C')[0]!.name).toBe('right');
  expect(parseKeypress('\x1b[D')[0]!.name).toBe('left');
});

test('CSI ESC[H / ESC[F → home/end', () => {
  expect(parseKeypress('\x1b[H')[0]!.name).toBe('home');
  expect(parseKeypress('\x1b[F')[0]!.name).toBe('end');
});

test('CSI ~ family: ESC[3~ delete, ESC[5~ pageup, ESC[6~ pagedown, ESC[1~ home, ESC[4~ end, ESC[2~ insert', () => {
  expect(parseKeypress('\x1b[3~')[0]!.name).toBe('delete');
  expect(parseKeypress('\x1b[5~')[0]!.name).toBe('pageup');
  expect(parseKeypress('\x1b[6~')[0]!.name).toBe('pagedown');
  expect(parseKeypress('\x1b[1~')[0]!.name).toBe('home');
  expect(parseKeypress('\x1b[4~')[0]!.name).toBe('end');
  expect(parseKeypress('\x1b[2~')[0]!.name).toBe('insert');
});

test('SS3 ESC O A/B/C/D → up/down/right/left (alternate arrow encoding)', () => {
  expect(parseKeypress('\x1bOA')[0]!.name).toBe('up');
  expect(parseKeypress('\x1bOB')[0]!.name).toBe('down');
  expect(parseKeypress('\x1bOH')[0]!.name).toBe('home');
  expect(parseKeypress('\x1bOF')[0]!.name).toBe('end');
});

test('Mac Option-as-Meta: ESC + char → {name: char, meta: true} (word ops + typography)', () => {
  expect(parseKeypress('\x1bb')[0]).toMatchObject({ name: 'b', meta: true, ctrl: false });
  expect(parseKeypress('\x1b ')[0]).toMatchObject({ name: ' ', meta: true });
  expect(parseKeypress('\x1b-')[0]).toMatchObject({ name: '-', meta: true });
});

test('Mac Option+Backspace: ESC + DEL → {name: backspace, meta: true} (editor.ts word-back)', () => {
  expect(parseKeypress('\x1b\x7f')[0]).toMatchObject({ name: 'backspace', meta: true });
});

test('multiple keys in one chunk decode in order', () => {
  expect(parseKeypress('ab\x1b[C').map((k) => k.name)).toEqual(['a', 'b', 'right']);
});

test('astral characters (emoji) decode as one Key, not split surrogate halves', () => {
  const keys = parseKeypress('😀');
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatchObject({ name: '😀', sequence: '😀' });
  // Mixed with ASCII still preserves order and code-point boundaries.
  expect(parseKeypress('a😀b').map((k) => k.name)).toEqual(['a', '😀', 'b']);
});

test('unterminated CSI mid-buffer surfaces as escape (rather than swallowing silently)', () => {
  const keys = parseKeypress('\x1b[');
  expect(keys[0]!.name).toBe('escape');
});

test('Shift+Tab (CSI Z) parses as tab with shift=true', () => {
  const keys = parseKeypress('\x1b[Z');
  expect(keys).toEqual([{ name: 'tab', sequence: '\x1b[Z', ctrl: false, meta: false, shift: true }]);
});

test('modifier-encoded arrows carry ctrl/shift/alt instead of decoding as plain arrows', () => {
  expect(parseKeypress('\x1b[1;5D')[0]).toMatchObject({ name: 'left', ctrl: true, meta: false, shift: false });
  expect(parseKeypress('\x1b[1;2A')[0]).toMatchObject({ name: 'up', ctrl: false, meta: false, shift: true });
  expect(parseKeypress('\x1b[1;3C')[0]).toMatchObject({ name: 'right', ctrl: false, meta: true, shift: false });
  // mod 7: (7-1)=6 = Alt(2)|Ctrl(4) → Ctrl+Alt+Left
  expect(parseKeypress('\x1b[1;7D')[0]).toMatchObject({ name: 'left', ctrl: true, meta: true, shift: false });
});

test('modifier-encoded Home/End and tilde-family carry modifiers', () => {
  expect(parseKeypress('\x1b[1;5H')[0]).toMatchObject({ name: 'home', ctrl: true });
  expect(parseKeypress('\x1b[1;5F')[0]).toMatchObject({ name: 'end', ctrl: true });
  expect(parseKeypress('\x1b[3;5~')[0]).toMatchObject({ name: 'delete', ctrl: true });
  expect(parseKeypress('\x1b[5;2~')[0]).toMatchObject({ name: 'pageup', shift: true });
});
