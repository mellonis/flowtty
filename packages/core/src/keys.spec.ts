import { expect, test } from 'vitest';
import { isPrintable, type Key } from './keys.js';

const key = (name: string, mods: Partial<Key> = {}): Key => ({ name, sequence: '', ctrl: false, meta: false, shift: false, ...mods });

test('isPrintable: one character with no ctrl / meta, never a control character', () => {
  expect(isPrintable(key('a'))).toBe(true);
  expect(isPrintable(key(' '))).toBe(true);
  expect(isPrintable(key('ж'))).toBe(true);
  expect(isPrintable(key('😀'))).toBe(true);
  expect(isPrintable(key('a', { shift: true }))).toBe(true);
  expect(isPrintable(key('a', { ctrl: true }))).toBe(false);
  expect(isPrintable(key('a', { meta: true }))).toBe(false);
  expect(isPrintable(key('return'))).toBe(false);
  expect(isPrintable(key('\x1d'))).toBe(false);   // a control byte a backend let through
  expect(isPrintable(key('\x7f'))).toBe(false);
  expect(isPrintable(key('\x00'))).toBe(false);
});
