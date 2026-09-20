import { expect, test } from 'vitest';
import { NAMED_COLORS } from './colors.js';

test('named colors: the 8 ANSI names, gray/grey, and a bright variant of each ANSI name', () => {
  const base = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  for (const name of base) {
    expect(NAMED_COLORS).toContain(name);
    expect(NAMED_COLORS).toContain(`${name}Bright`);
  }
  expect(NAMED_COLORS).toContain('gray');
  expect(NAMED_COLORS).toContain('grey');
  expect(new Set(NAMED_COLORS).size).toBe(NAMED_COLORS.length);
});
