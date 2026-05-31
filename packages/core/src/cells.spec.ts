import { expect, test } from 'vitest';
import { Buffer } from './cells.js';

test('blank buffer renders empty lines', () => {
  const b = new Buffer(3, 2);
  expect(b.toString()).toBe('');
});

test('set places a char at x,y', () => {
  const b = new Buffer(5, 2);
  b.set(0, 0, 'h');
  b.set(1, 0, 'i');
  b.set(0, 1, 'y');
  expect(b.toString()).toBe('hi\ny');
});

test('out-of-bounds set is ignored', () => {
  const b = new Buffer(2, 1);
  b.set(5, 5, 'x');
  expect(b.toString()).toBe('');
});

test('toString trims trailing ASCII spaces but preserves NBSP', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, 'a');
  b.set(1, 0, ' '); // NBSP must survive
  expect(b.toString()).toBe('a ');
});

test('get reads back what set wrote', () => {
  const b = new Buffer(3, 2);
  b.set(1, 0, 'x', { bold: true });
  expect(b.get(1, 0)).toEqual({ char: 'x', style: { bold: true } });
});

test('get on out-of-bounds returns a blank cell without throwing', () => {
  const b = new Buffer(2, 1);
  expect(b.get(10, 10)).toEqual({ char: ' ', style: {} });
});
