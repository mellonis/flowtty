import { expect, test } from 'vitest';
import { Buffer } from '@flowtty/core';
import { bufferToAnsi } from './bufferToAnsi.js';
import { OSC8_CLOSE, RESET, osc8Open } from './ansi.js';

// Every test passes `color` explicitly so the environment (NO_COLOR /
// FORCE_COLOR on the machine running the suite) cannot change the answer.
const opts = { color: true, depth: 24 } as const;

function row(text: string, width = text.length): Buffer {
  const buffer = new Buffer(width, 1);
  for (let x = 0; x < text.length; x++) buffer.set(x, 0, text[x]!);
  return buffer;
}

test('an unstyled buffer serializes to its plain rows, joined with \\n and no trailing newline', () => {
  const buffer = new Buffer(2, 2);
  buffer.set(0, 0, 'a'); buffer.set(1, 0, 'b');
  buffer.set(0, 1, 'c'); buffer.set(1, 1, 'd');
  expect(bufferToAnsi(buffer, opts)).toBe('ab\ncd');
});

test('an empty buffer is an empty string', () => {
  expect(bufferToAnsi(new Buffer(0, 0), opts)).toBe('');
});

test('no cursor addressing, no clear, no alt screen — nothing but text and SGR', () => {
  const buffer = row('hi', 4);
  buffer.set(0, 0, 'h', { bold: true });
  const out = bufferToAnsi(buffer, opts);
  expect(out).not.toContain('\x1b[2J');
  expect(out).not.toContain('\x1b[H');
  expect(out).not.toContain('\x1b[?1049');
  expect(/\x1b\[\d+;\d+H/u.test(out)).toBe(false);
});

test('one SGR per style run — adjacent cells sharing a style do not repeat it', () => {
  const buffer = new Buffer(3, 1);
  buffer.set(0, 0, 'a', { bold: true });
  buffer.set(1, 0, 'b', { bold: true });
  buffer.set(2, 0, 'c', { bold: true });
  expect(bufferToAnsi(buffer, opts)).toBe(`\x1b[1mabc${RESET}`);
});

test('a style change emits RESET first, so attributes never accumulate', () => {
  const buffer = new Buffer(2, 1);
  buffer.set(0, 0, 'a', { bold: true });
  buffer.set(1, 0, 'b', { underline: true });
  expect(bufferToAnsi(buffer, opts)).toBe(`\x1b[1ma${RESET}\x1b[4mb${RESET}`);
});

test('going back to the default style emits a bare RESET', () => {
  const buffer = new Buffer(2, 1);
  buffer.set(0, 0, 'a', { bold: true });
  buffer.set(1, 0, 'b');
  expect(bufferToAnsi(buffer, opts)).toBe(`\x1b[1ma${RESET}b`);
});

test('a line that ends unstyled ends without a RESET', () => {
  expect(bufferToAnsi(row('ab'), opts)).toBe('ab');
});

test('RESET lands before each newline, so a background never bleeds to the line end', () => {
  const buffer = new Buffer(1, 2);
  buffer.set(0, 0, 'a', { bg: 'red' });
  buffer.set(0, 1, 'b', { bg: 'blue' });
  expect(bufferToAnsi(buffer, opts)).toBe(`\x1b[41ma${RESET}\n\x1b[44mb${RESET}`);
});

test('trailing unstyled spaces are trimmed per line', () => {
  const buffer = new Buffer(6, 2);
  buffer.set(0, 0, 'a');
  buffer.set(0, 1, 'b', { bold: true });
  expect(bufferToAnsi(buffer, opts)).toBe(`a\n\x1b[1mb${RESET}`);
});

test('a trailing space with a background color is kept — it is part of the picture', () => {
  const buffer = new Buffer(3, 1);
  buffer.set(0, 0, 'a');
  buffer.set(1, 0, ' ', { bg: 'red' });
  buffer.set(2, 0, ' ', { bg: 'red' });
  expect(bufferToAnsi(buffer, opts)).toBe(`a\x1b[41m  ${RESET}`);
});

test('an inverse or underlined trailing space is kept too; a merely colored-foreground one is not', () => {
  const inverse = new Buffer(2, 1);
  inverse.set(0, 0, 'a');
  inverse.set(1, 0, ' ', { inverse: true });
  expect(bufferToAnsi(inverse, opts)).toBe(`a\x1b[7m ${RESET}`);

  const fgOnly = new Buffer(2, 1);
  fgOnly.set(0, 0, 'a');
  fgOnly.set(1, 0, ' ', { fg: 'red' });
  expect(bufferToAnsi(fgOnly, opts)).toBe('a');
});

test('color: false emits no color codes, but keeps bold / dim / underline', () => {
  const buffer = new Buffer(2, 1);
  buffer.set(0, 0, 'a', { fg: '#ff8800', bold: true });
  buffer.set(1, 0, 'b', { bg: 'blue' });
  const out = bufferToAnsi(buffer, { color: false });
  expect(out).toBe(`\x1b[1ma${RESET}b`);
  expect(out).not.toContain('38;2');
  expect(out).not.toContain('\x1b[44m');
});

test('cells that differ only by a color emit one SGR when color is off', () => {
  const buffer = new Buffer(2, 1);
  buffer.set(0, 0, 'a', { fg: 'red', bold: true });
  buffer.set(1, 0, 'b', { fg: 'blue', bold: true });
  expect(bufferToAnsi(buffer, { color: false })).toBe(`\x1b[1mab${RESET}`);
});

test('depth brings a 24-bit color down the same way the TTY backends do', () => {
  const buffer = new Buffer(1, 1);
  buffer.set(0, 0, 'a', { fg: '#ff0000' });
  expect(bufferToAnsi(buffer, { color: true, depth: 24 })).toBe(`\x1b[38;2;255;0;0ma${RESET}`);
  expect(bufferToAnsi(buffer, { color: true, depth: 8 })).toContain('38;5;');
  expect(bufferToAnsi(buffer, { color: true, depth: 4 })).toBe(`\x1b[91ma${RESET}`); // nearest of 16: bright red
});

test('hyperlinks are off by default and opt-in through the option', () => {
  const buffer = new Buffer(2, 1);
  buffer.set(0, 0, 'o', { link: 'https://example.com' });
  buffer.set(1, 0, 'k', { link: 'https://example.com' });
  expect(bufferToAnsi(buffer, opts)).toBe('ok');
  expect(bufferToAnsi(buffer, { ...opts, hyperlinks: true }))
    .toBe(`${osc8Open('https://example.com')}ok${OSC8_CLOSE}`);
});

test('a hyperlink is closed at the end of its line, never bleeding into the next', () => {
  const buffer = new Buffer(1, 2);
  buffer.set(0, 0, 'a', { link: 'https://example.com' });
  buffer.set(0, 1, 'b');
  const out = bufferToAnsi(buffer, { ...opts, hyperlinks: true });
  expect(out).toBe(`${osc8Open('https://example.com')}a${OSC8_CLOSE}\nb`);
});

test('a wide glyph is written once; its continuation cell emits nothing', () => {
  const buffer = new Buffer(3, 1);
  buffer.set(0, 0, '日');
  buffer.set(2, 0, 'x');
  expect(bufferToAnsi(buffer, opts)).toBe('日x');
});

test('an NBSP survives trimming — only ASCII spaces are trailing filler', () => {
  const buffer = new Buffer(3, 1);
  buffer.set(0, 0, 'a');
  buffer.set(1, 0, ' ');
  expect(bufferToAnsi(buffer, opts)).toBe('a ');
});
