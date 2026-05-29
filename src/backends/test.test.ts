import { expect, test } from 'vitest';
import { TestBackend } from './test.js';
import type { Key } from '../keys.js';

test('onKey returns an unsubscribe; subscribers receive press()', () => {
  const b = new TestBackend(10, 1);
  const received: Key[] = [];
  const unsubscribe = b.onKey((k) => received.push(k));
  b.press({ name: 'a' });
  b.press({ name: 'return' });
  expect(received).toHaveLength(2);
  expect(received[0]).toMatchObject({ name: 'a', ctrl: false, meta: false, shift: false });
  expect(received[1]).toMatchObject({ name: 'return' });
  unsubscribe();
  b.press({ name: 'b' });
  expect(received).toHaveLength(2); // no new event after unsubscribe
});

test('type() emits one Key per character', () => {
  const b = new TestBackend(10, 1);
  const names: string[] = [];
  b.onKey((k) => names.push(k.name));
  b.type('hi');
  expect(names).toEqual(['h', 'i']);
});

test('multiple subscribers all receive each press', () => {
  const b = new TestBackend(10, 1);
  const a: Key[] = [];
  const c: Key[] = [];
  b.onKey((k) => a.push(k));
  b.onKey((k) => c.push(k));
  b.press({ name: 'x' });
  expect(a).toHaveLength(1);
  expect(c).toHaveLength(1);
});
