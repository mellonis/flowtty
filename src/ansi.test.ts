import { expect, test } from 'vitest';
import { sgr, RESET, cursorTo, cellsEqual } from './ansi.js';

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

test('cursorTo(x, y) emits CSI cursor-position with 1-indexed row;col', () => {
  // ANSI cursor positioning is 1-indexed: (col 0, row 0) → CSI 1;1H
  expect(cursorTo(0, 0)).toBe('\x1b[1;1H');
  expect(cursorTo(5, 2)).toBe('\x1b[3;6H'); // row 3, col 6
  expect(cursorTo(0, 9)).toBe('\x1b[10;1H');
});

test('cellsEqual returns true for identical char + style', () => {
  expect(cellsEqual({ char: 'a', style: {} }, { char: 'a', style: {} })).toBe(true);
  expect(cellsEqual(
    { char: 'X', style: { bold: true, fg: 'red' } },
    { char: 'X', style: { bold: true, fg: 'red' } },
  )).toBe(true);
});

test('cellsEqual returns false when char differs', () => {
  expect(cellsEqual({ char: 'a', style: {} }, { char: 'b', style: {} })).toBe(false);
});

test('cellsEqual returns false when style differs', () => {
  expect(cellsEqual(
    { char: 'a', style: {} },
    { char: 'a', style: { bold: true } },
  )).toBe(false);
  expect(cellsEqual(
    { char: 'a', style: { fg: 'red' } },
    { char: 'a', style: { fg: 'blue' } },
  )).toBe(false);
});
