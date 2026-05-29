import { expect, test } from 'vitest';
import { sgr, RESET } from './ansi.js';

test('sgr emits nothing for an empty style', () => {
  expect(sgr({})).toBe('');
});

test('sgr emits bold and a basic fg color', () => {
  expect(sgr({ bold: true })).toBe('\x1b[1m');
  expect(sgr({ fg: 'red' })).toBe('\x1b[31m');
  expect(sgr({ bold: true, fg: 'red' })).toBe('\x1b[1;31m');
});

test('RESET is the SGR reset', () => {
  expect(RESET).toBe('\x1b[0m');
});

test('sgr emits bg color codes (named, 40–47)', () => {
  expect(sgr({ bg: 'red' })).toBe('\x1b[41m');
  expect(sgr({ bg: 'blue' })).toBe('\x1b[44m');
  expect(sgr({ bold: true, fg: 'red', bg: 'blue' })).toBe('\x1b[1;31;44m');
});

test('sgr ignores unknown bg colors (matches the existing fg behavior)', () => {
  expect(sgr({ bg: '#ff0000' })).toBe(''); // truecolor not in M1d
});
