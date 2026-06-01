import { expect, test } from 'vitest';
import { decodeKeys, parseKeypress } from './key-parser.js';

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

test('CRLF collapses into a single return key', () => {
  const keys = parseKeypress('\r\n');
  expect(keys).toEqual([{ name: 'return', sequence: '\r\n', ctrl: false, meta: false, shift: false }]);
  // A bare LF and a bare CR each still produce one return.
  expect(parseKeypress('\n\r').map((k) => k.name)).toEqual(['return', 'return']);
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

test('SS3 ESC O P/Q/R/S → f1/f2/f3/f4 (unmodified function keys)', () => {
  expect(parseKeypress('\x1bOP')[0]!.name).toBe('f1');
  expect(parseKeypress('\x1bOQ')[0]!.name).toBe('f2');
  expect(parseKeypress('\x1bOR')[0]!.name).toBe('f3');
  expect(parseKeypress('\x1bOS')[0]!.name).toBe('f4');
});

test('CSI letter ESC[1;<mod>P..S → modified F1–F4 (vt220 form)', () => {
  // Ctrl+F1..F4
  expect(parseKeypress('\x1b[1;5P')[0]).toMatchObject({ name: 'f1', ctrl: true, meta: false, shift: false });
  expect(parseKeypress('\x1b[1;5Q')[0]).toMatchObject({ name: 'f2', ctrl: true });
  expect(parseKeypress('\x1b[1;5R')[0]).toMatchObject({ name: 'f3', ctrl: true });
  expect(parseKeypress('\x1b[1;5S')[0]).toMatchObject({ name: 'f4', ctrl: true });
  // Shift+F1
  expect(parseKeypress('\x1b[1;2P')[0]).toMatchObject({ name: 'f1', shift: true, ctrl: false });
});

test('cursor-position report (ESC[<row>;<col>R) is not misread as F3', () => {
  // A DSR reply like ESC[10;25R shares the CSI-R final with vt220 F3, but its
  // params are coordinates, not "1;<mod>". Only the 1;<mod≥2> form is a function key.
  expect(parseKeypress('\x1b[10;25R')[0]!.name).toBe('csi-R');
  // Row 1 col 1: first param is "1" but the modifier slot is 1 (= no modifier),
  // which is never a real function-key encoding.
  expect(parseKeypress('\x1b[1;1R')[0]!.name).toBe('csi-R');
  // Bare CSI R (no params) is not a function key in any scheme either.
  expect(parseKeypress('\x1b[R')[0]!.name).toBe('csi-R');
  // The genuine modified-F3 form still resolves. Same guard applies to P/Q/S.
  expect(parseKeypress('\x1b[1;5R')[0]).toMatchObject({ name: 'f3', ctrl: true });
  expect(parseKeypress('\x1b[1;1P')[0]!.name).toBe('csi-P');
});

test('CSI tilde form ESC[11~..[14~ → f1..f4 (alongside existing f5..f12)', () => {
  expect(parseKeypress('\x1b[11~')[0]!.name).toBe('f1');
  expect(parseKeypress('\x1b[12~')[0]!.name).toBe('f2');
  expect(parseKeypress('\x1b[13~')[0]!.name).toBe('f3');
  expect(parseKeypress('\x1b[14~')[0]!.name).toBe('f4');
  // Boundary: f5..f12 still resolve (the f1-f4 addition must not shift these).
  expect(parseKeypress('\x1b[15~')[0]!.name).toBe('f5');
  expect(parseKeypress('\x1b[24~')[0]!.name).toBe('f12');
  // Modified tilde-form F-keys carry the modifier.
  expect(parseKeypress('\x1b[13;5~')[0]).toMatchObject({ name: 'f3', ctrl: true });
});

test('modifier-encoded Home/End and tilde-family carry modifiers', () => {
  expect(parseKeypress('\x1b[1;5H')[0]).toMatchObject({ name: 'home', ctrl: true });
  expect(parseKeypress('\x1b[1;5F')[0]).toMatchObject({ name: 'end', ctrl: true });
  expect(parseKeypress('\x1b[3;5~')[0]).toMatchObject({ name: 'delete', ctrl: true });
  expect(parseKeypress('\x1b[5;2~')[0]).toMatchObject({ name: 'pageup', shift: true });
});

test('decodeKeys hands an incomplete trailing CSI back as rest (not a stray escape)', () => {
  const r = decodeKeys('a\x1b[');
  expect(r.keys.map((k) => k.name)).toEqual(['a']);
  expect(r.rest).toBe('\x1b[');
});

test('decodeKeys hands an incomplete trailing SS3 back as rest', () => {
  const r = decodeKeys('\x1bO');
  expect(r.keys).toEqual([]);
  expect(r.rest).toBe('\x1bO');
});

test('a CSI split across two reads decodes as one key when rest is prepended', () => {
  const first = decodeKeys('\x1b[');
  expect(first.keys).toEqual([]);
  expect(first.rest).toBe('\x1b[');
  // Next read carries the final byte; caller prepends the leftover.
  const second = decodeKeys(first.rest + 'A');
  expect(second.keys.map((k) => k.name)).toEqual(['up']);
  expect(second.rest).toBe('');
});

test('an SS3 split across reads (ESC O | F) decodes as end', () => {
  const first = decodeKeys('\x1bO');
  const second = decodeKeys(first.rest + 'F');
  expect(second.keys.map((k) => k.name)).toEqual(['end']);
  expect(second.rest).toBe('');
});

test('a modifier-encoded CSI split mid-params decodes correctly once completed', () => {
  const first = decodeKeys('x\x1b[1;5');
  expect(first.keys.map((k) => k.name)).toEqual(['x']);
  expect(first.rest).toBe('\x1b[1;5');
  const second = decodeKeys(first.rest + 'D');
  expect(second.keys[0]).toMatchObject({ name: 'left', ctrl: true });
});

test('decodeKeys does NOT buffer a lone trailing ESC — surfaces it as escape', () => {
  const r = decodeKeys('\x1b');
  expect(r.keys.map((k) => k.name)).toEqual(['escape']);
  expect(r.rest).toBe('');
});
