import { expect, test } from 'vitest';
import { TestBackend } from './test-backend.js';
import { NAMED_KEYS, type Key } from '../keys.js';
import { Buffer } from '../cells.js';

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

test('TestBackend.lastBuffer exposes the last drawn Buffer for cell-level assertions', () => {
  const b = new TestBackend(4, 1);
  const buf = new Buffer(4, 1);
  buf.set(0, 0, 'X', { bold: true, fg: 'red' });
  b.draw(buf);
  const got = b.lastBuffer;
  expect(got).not.toBeNull();
  expect(got!.get(0, 0)).toEqual({ char: 'X', style: { bold: true, fg: 'red' } });
});

test('TestBackend.paste delivers the text as ONE paste key, not a key per character', () => {
  const b = new TestBackend(4, 1);
  const got: Array<[string, string | undefined]> = [];
  b.onKey((k) => got.push([k.name, k.text]));
  b.paste('a\nb');
  expect(got).toEqual([['paste', 'a\nb']]);
});

test('TestBackend.wheel delivers a wheelup / wheeldown key at the given cell', () => {
  const b = new TestBackend(10, 4);
  const got: Array<[string, number | undefined, number | undefined]> = [];
  b.onKey((k) => got.push([k.name, k.x, k.y]));
  b.wheel('down', 3, 2);
  b.wheel('up');
  expect(got).toEqual([['wheeldown', 3, 2], ['wheelup', 0, 0]]);
});

test('TestBackend.press rejects a name no terminal can produce, and says what to use instead', () => {
  const b = new TestBackend(4, 1);
  expect(() => b.press({ name: 'space' })).toThrow(/'space'.*' '/s);
  expect(() => b.press({ name: 'enter' })).toThrow(/'enter'.*'return'/s);
  expect(() => b.press({ name: 'esc' })).toThrow(/'esc'.*'escape'/s);
  expect(() => b.press({ name: 'colon' })).toThrow(/not a key name/);
});

test('TestBackend.press accepts every named key, any single character, and the decoder\'s csi-* fallbacks', () => {
  const b = new TestBackend(4, 1);
  const got: string[] = [];
  b.onKey((k) => got.push(k.name));
  for (const name of [...NAMED_KEYS, ' ', ':', 'a', 'ж', '😀', 'csi-u']) b.press({ name });
  expect(got).toHaveLength(NAMED_KEYS.length + 6);
});

test('TestBackend records bells and notifications instead of writing them anywhere', () => {
  const b = new TestBackend(4, 1);
  expect(b.bells).toBe(0);
  expect(b.notifications).toEqual([]);
  b.bell();
  b.bell();
  b.notify('Build', 'done');
  b.notify('Reminder');
  expect(b.bells).toBe(2);
  expect(b.notifications).toEqual([{ title: 'Build', body: 'done' }, { title: 'Reminder' }]);
});
