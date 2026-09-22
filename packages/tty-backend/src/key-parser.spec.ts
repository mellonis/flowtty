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

// ─── bracketed paste ─────────────────────────────────────────────────────────

test('a bracketed paste arrives as ONE paste key carrying the whole text', () => {
  const { keys, rest } = decodeKeys('\x1b[200~hello world\x1b[201~');
  expect(rest).toBe('');
  expect(keys).toEqual([{
    name: 'paste', text: 'hello world', sequence: '\x1b[200~hello world\x1b[201~',
    ctrl: false, meta: false, shift: false,
  }]);
});

test('newlines inside a paste stay text — no return key — and line endings normalize to \\n', () => {
  const { keys } = decodeKeys('\x1b[200~one\r\ntwo\rthree\nfour\x1b[201~');
  expect(keys).toHaveLength(1);
  expect(keys[0]!.text).toBe('one\ntwo\nthree\nfour');
  expect(keys.some((k) => k.name === 'return')).toBe(false);
});

test('escape sequences and single letters inside a paste are not decoded as keys', () => {
  const { keys } = decodeKeys('\x1b[200~q\x1b[Aq\x1b[201~');
  expect(keys.map((k) => k.name)).toEqual(['paste']);
  expect(keys[0]!.text).toBe('q\x1b[Aq');
});

test('keys before and after a paste decode normally', () => {
  const { keys } = decodeKeys('a\x1b[200~xy\x1b[201~\r');
  expect(keys.map((k) => k.name)).toEqual(['a', 'paste', 'return']);
});

test('a paste split across reads is buffered whole until its terminator arrives', () => {
  const first = decodeKeys('a\x1b[200~par');
  expect(first.keys.map((k) => k.name)).toEqual(['a']);
  expect(first.rest).toBe('\x1b[200~par');
  const second = decodeKeys(first.rest + 'tial\x1b[201~');
  expect(second.keys.map((k) => k.text)).toEqual(['partial']);
  expect(second.rest).toBe('');
});

test('an empty paste is still one paste key with empty text', () => {
  const { keys } = decodeKeys('\x1b[200~\x1b[201~');
  expect(keys.map((k) => [k.name, k.text])).toEqual([['paste', '']]);
});

// ─── SGR mouse: wheel ────────────────────────────────────────────────────────

test('an SGR wheel report becomes a wheelup / wheeldown key with 0-based cell coordinates', () => {
  const { keys } = decodeKeys('\x1b[<64;10;5M\x1b[<65;1;1M');
  expect(keys).toEqual([
    { name: 'wheelup', x: 9, y: 4, sequence: '\x1b[<64;10;5M', ctrl: false, meta: false, shift: false },
    { name: 'wheeldown', x: 0, y: 0, sequence: '\x1b[<65;1;1M', ctrl: false, meta: false, shift: false },
  ]);
});

test('wheel modifier bits map to shift / meta / ctrl', () => {
  const [shift, meta, ctrl] = decodeKeys('\x1b[<68;1;1M\x1b[<72;1;1M\x1b[<80;1;1M').keys;
  expect([shift!.name, shift!.shift, shift!.meta, shift!.ctrl]).toEqual(['wheelup', true, false, false]);
  expect([meta!.name, meta!.shift, meta!.meta, meta!.ctrl]).toEqual(['wheelup', false, true, false]);
  expect([ctrl!.name, ctrl!.shift, ctrl!.meta, ctrl!.ctrl]).toEqual(['wheelup', false, false, true]);
});

test('a wheel report split across reads is buffered until complete', () => {
  const first = decodeKeys('\x1b[<64;1');
  expect(first.keys).toEqual([]);
  const second = decodeKeys(first.rest + '0;5M');
  expect(second.keys.map((k) => [k.name, k.x, k.y])).toEqual([['wheelup', 9, 4]]);
});

// ─── SGR mouse: buttons ──────────────────────────────────────────────────────

test('a button press becomes mousedown with the button and 0-based cell coordinates', () => {
  const { keys } = decodeKeys('\x1b[<0;3;4M\x1b[<1;3;4M\x1b[<2;3;4M');
  expect(keys).toEqual([
    { name: 'mousedown', button: 'left', x: 2, y: 3, sequence: '\x1b[<0;3;4M', ctrl: false, meta: false, shift: false },
    { name: 'mousedown', button: 'middle', x: 2, y: 3, sequence: '\x1b[<1;3;4M', ctrl: false, meta: false, shift: false },
    { name: 'mousedown', button: 'right', x: 2, y: 3, sequence: '\x1b[<2;3;4M', ctrl: false, meta: false, shift: false },
  ]);
});

test('motion with a button held becomes mousedrag (the 32 bit), not a second mousedown', () => {
  const { keys } = decodeKeys('\x1b[<32;3;4M\x1b[<34;10;2M');
  expect(keys.map((k) => [k.name, k.button, k.x, k.y])).toEqual([
    ['mousedrag', 'left', 2, 3],
    ['mousedrag', 'right', 9, 1],
  ]);
});

test('a release (final m) becomes mouseup and names the button SGR 1006 reports', () => {
  const { keys } = decodeKeys('\x1b[<0;3;4m\x1b[<2;3;4m');
  expect(keys.map((k) => [k.name, k.button])).toEqual([
    ['mouseup', 'left'],
    ['mouseup', 'right'],
  ]);
});

test('a release that names no button is still a mouseup — with button left undefined', () => {
  const [up] = decodeKeys('\x1b[<3;3;4m').keys;
  expect(up!.name).toBe('mouseup');
  expect(up!.button).toBeUndefined();
  expect([up!.x, up!.y]).toEqual([2, 3]);
});

test('motion with NO button held is dropped — it is noise unless 1003 is on', () => {
  const { keys, rest } = decodeKeys('a\x1b[<35;5;6Mb');
  expect(keys.map((k) => k.name)).toEqual(['a', 'b']);
  expect(rest).toBe('');
});

test('button codes flowtty does not decode are dropped silently, never mis-named', () => {
  // 66/67 = horizontal wheel; 128+ = the extra buttons (8..11).
  const { keys, rest } = decodeKeys('a\x1b[<66;1;1M\x1b[<67;1;1M\x1b[<128;1;1M\x1b[<131;1;1m b');
  expect(keys.map((k) => k.name)).toEqual(['a', ' ', 'b']);
  expect(rest).toBe('');
});

test('a malformed mouse report is dropped, never turned into a key at a negative cell', () => {
  const { keys, rest } = decodeKeys('a\x1b[<-1;1;1M\x1b[<;;M\x1b[<0;0;0M\x1b[<0;1.5;1Mb');
  expect(keys.map((k) => k.name)).toEqual(['a', 'b']);
  expect(rest).toBe('');
});

test('button modifier bits map to shift / meta / ctrl on down, drag and up alike', () => {
  const { keys } = decodeKeys('\x1b[<4;1;1M\x1b[<8;1;1M\x1b[<16;1;1M\x1b[<36;1;1M\x1b[<16;1;1m');
  expect(keys.map((k) => [k.name, k.button, k.shift, k.meta, k.ctrl])).toEqual([
    ['mousedown', 'left', true, false, false],
    ['mousedown', 'left', false, true, false],
    ['mousedown', 'left', false, false, true],
    ['mousedrag', 'left', true, false, false],
    ['mouseup', 'left', false, false, true],
  ]);
});

test('a button report split across reads is buffered until complete', () => {
  const first = decodeKeys('\x1b[<32;1');
  expect(first.keys).toEqual([]);
  const second = decodeKeys(first.rest + '0;5M');
  expect(second.keys.map((k) => [k.name, k.button, k.x, k.y])).toEqual([['mousedrag', 'left', 9, 4]]);
});

// ─── modified Enter / Tab / Escape / Backspace in CSI-u and modifyOtherKeys form ──

test('Shift+Enter decodes to return+shift in both the CSI-u and the xterm modifyOtherKeys form', () => {
  const { keys } = decodeKeys('\x1b[13;2u\x1b[27;2;13~');
  expect(keys.map((k) => [k.name, k.shift, k.ctrl, k.meta])).toEqual([
    ['return', true, false, false],
    ['return', true, false, false],
  ]);
});

test('other modifiers on Enter carry through (Ctrl+Enter, Alt+Enter)', () => {
  const { keys } = decodeKeys('\x1b[13;5u\x1b[27;3;13~');
  expect(keys.map((k) => [k.name, k.shift, k.ctrl, k.meta])).toEqual([
    ['return', false, true, false],
    ['return', false, false, true],
  ]);
});

test('CSI-u / modifyOtherKeys forms of Tab, Escape, Backspace and printable keys decode to the usual names', () => {
  const { keys } = decodeKeys('\x1b[9;2u\x1b[27u\x1b[127;3u\x1b[97;5u\x1b[27;5;97~');
  expect(keys.map((k) => [k.name, k.shift, k.ctrl, k.meta])).toEqual([
    ['tab', true, false, false],
    ['escape', false, false, false],
    ['backspace', false, false, true],
    ['a', false, true, false],
    ['a', false, true, false],
  ]);
});

// ─── terminal reports ────────────────────────────────────────────────────────
// What the terminal says back — a background query answered, a scheme change
// announced, the window focused — comes down the same stdin as the keys. The
// parser hands it out as reports, and no key handler ever sees it.

test('an OSC 11 reply is a background report, not a key — BEL or ST terminated', () => {
  const bel = decodeKeys('\x1b]11;rgb:fdfd/f6f6/e3e3\x07');
  expect(bel.keys).toEqual([]);
  expect(bel.reports).toEqual([{ type: 'background', color: { r: 0xfd, g: 0xf6, b: 0xe3 } }]);
  const st = decodeKeys('\x1b]11;rgb:0000/2b2b/3636\x1b\\');
  expect(st.keys).toEqual([]);
  expect(st.reports).toEqual([{ type: 'background', color: { r: 0, g: 0x2b, b: 0x36 } }]);
});

test('the reply comes out of the middle of a key stream untouched by it', () => {
  const r = decodeKeys('a\x1b]11;rgb:ffff/ffff/ffff\x07b');
  expect(r.keys.map((k) => k.name)).toEqual(['a', 'b']);
  expect(r.reports).toHaveLength(1);
});

test('a reply split across reads waits whole in `rest`, like a paste', () => {
  const first = decodeKeys('\x1b]11;rgb:ff');
  expect(first.keys).toEqual([]);
  expect(first.reports).toEqual([]);
  expect(first.rest).toBe('\x1b]11;rgb:ff');
  const second = decodeKeys(first.rest + 'ff/ffff/ffff\x07');
  expect(second.reports).toEqual([{ type: 'background', color: { r: 255, g: 255, b: 255 } }]);
  expect(second.rest).toBe('');
});

test('a channel is 1 to 4 hex digits, scaled to 8 bits; an unreadable reply is swallowed', () => {
  expect(decodeKeys('\x1b]11;rgb:f/8/0\x07').reports).toEqual([{ type: 'background', color: { r: 255, g: 136, b: 0 } }]);
  expect(decodeKeys('\x1b]11;rgb:ff/88/00\x07').reports).toEqual([{ type: 'background', color: { r: 255, g: 136, b: 0 } }]);
  expect(decodeKeys('\x1b]11;#ff8800\x07').reports).toEqual([{ type: 'background', color: { r: 255, g: 136, b: 0 } }]);
  const bad = decodeKeys('\x1b]11;purple\x07');
  expect(bad.keys).toEqual([]);
  expect(bad.reports).toEqual([]);
});

test('any other OSC the terminal sends is swallowed whole', () => {
  const r = decodeKeys('\x1b]10;rgb:0000/0000/0000\x07x');
  expect(r.keys.map((k) => k.name)).toEqual(['x']);
  expect(r.reports).toEqual([]);
});

test('a DEC 2031 notification is a colorScheme report: 1 is dark, 2 is light', () => {
  expect(decodeKeys('\x1b[?997;1n').reports).toEqual([{ type: 'colorScheme', scheme: 'dark' }]);
  expect(decodeKeys('\x1b[?997;2n').reports).toEqual([{ type: 'colorScheme', scheme: 'light' }]);
  expect(decodeKeys('\x1b[?997;1n').keys).toEqual([]);
});

test('focus in and out are focus reports, not csi-I / csi-O keys', () => {
  const r = decodeKeys('\x1b[I\x1b[O');
  expect(r.keys).toEqual([]);
  expect(r.reports).toEqual([{ type: 'focus', focused: true }, { type: 'focus', focused: false }]);
});

test('parseKeypress drops the reports and keeps the keys', () => {
  expect(parseKeypress('\x1b[?997;2nq').map((k) => k.name)).toEqual(['q']);
});
