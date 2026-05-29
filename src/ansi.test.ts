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
