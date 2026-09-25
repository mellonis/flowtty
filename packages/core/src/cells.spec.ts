import { expect, test } from 'vitest';
import { Buffer } from './cells.js';
import { takeWarnings } from './warnings.js';

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

// ─── continuation marks ──────────────────────────────────────────────────────
// "The text in this span carries on at the start of the next row, with no line
// break in the source." Per span, not per row: one row of a multi-pane layout
// holds several boxes side by side, and only one of them may be wrapping.

test('a fresh buffer carries no continuation marks', () => {
  expect(new Buffer(4, 2).continuationsAt(0)).toEqual([]);
});

test('continuation marks are recorded and read back per row', () => {
  const b = new Buffer(20, 3);
  b.markContinuation({ y: 0, x0: 0, x1: 5, join: 'space' });
  b.markContinuation({ y: 0, x0: 10, x1: 14, join: 'none' });
  b.markContinuation({ y: 1, x0: 0, x1: 5, join: 'space' });
  expect(b.continuationsAt(0)).toEqual([
    { y: 0, x0: 0, x1: 5, join: 'space' },
    { y: 0, x0: 10, x1: 14, join: 'none' },
  ]);
  expect(b.continuationsAt(1)).toEqual([{ y: 1, x0: 0, x1: 5, join: 'space' }]);
  expect(b.continuationsAt(2)).toEqual([]);
});

test('a mark on a row the buffer does not have is dropped', () => {
  const b = new Buffer(4, 2);
  b.markContinuation({ y: 5, x0: 0, x1: 2, join: 'space' });
  b.markContinuation({ y: -1, x0: 0, x1: 2, join: 'space' });
  expect(b.continuationsAt(5)).toEqual([]);
  expect(b.continuationsAt(-1)).toEqual([]);
});

test('a clone carries the marks, and the two lists are independent', () => {
  const b = new Buffer(8, 2);
  b.markContinuation({ y: 0, x0: 0, x1: 4, join: 'space' });
  const copy = b.clone();
  expect(copy.continuationsAt(0)).toEqual([{ y: 0, x0: 0, x1: 4, join: 'space' }]);
  copy.markContinuation({ y: 1, x0: 0, x1: 4, join: 'none' });
  expect(b.continuationsAt(1)).toEqual([]);
});

test('marks are invisible to toString — they describe the text, they are not in it', () => {
  const b = new Buffer(3, 2);
  b.set(0, 0, 'a');
  b.set(0, 1, 'b');
  const plain = b.toString();
  b.markContinuation({ y: 0, x0: 0, x1: 1, join: 'space' });
  expect(b.toString()).toBe(plain);
});

// ─── wide clusters ───────────────────────────────────────────────────────────
// A wide cluster (CJK, emoji) is a lead cell plus a continuation cell with an
// empty char; set keeps the pair whole whichever half a write lands on.

test('a wide cluster takes a lead cell and a continuation cell with the same style', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, '日', { bold: true });
  b.set(2, 0, 'x');
  expect(b.get(0, 0)).toEqual({ char: '日', style: { bold: true } });
  expect(b.get(1, 0)).toEqual({ char: '', style: { bold: true } });
  expect(b.get(2, 0).char).toBe('x');
  expect(b.toString()).toBe('日x');
});

test('a flag and a skin-tone emoji are one wide cluster each', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, '🇯🇵');
  b.set(2, 0, '👍🏽');
  expect(b.get(1, 0).char).toBe('');
  expect(b.get(3, 0).char).toBe('');
  expect(b.toString()).toBe('🇯🇵👍🏽');
});

test('a wide cluster in the last column becomes a blank, never a torn glyph', () => {
  const b = new Buffer(2, 1);
  b.set(1, 0, '日', { bold: true });
  expect(b.get(1, 0)).toEqual({ char: ' ', style: { bold: true } });
});

test('overwriting the lead blanks the continuation', () => {
  const b = new Buffer(3, 1);
  b.set(0, 0, '日', { bold: true });
  b.set(0, 0, 'a');
  expect(b.get(0, 0).char).toBe('a');
  expect(b.get(1, 0)).toEqual({ char: ' ', style: { bold: true } });
});

test('overwriting the continuation blanks the lead', () => {
  const b = new Buffer(3, 1);
  b.set(0, 0, '日', { bold: true });
  b.set(1, 0, 'b');
  expect(b.get(0, 0)).toEqual({ char: ' ', style: { bold: true } });
  expect(b.get(1, 0).char).toBe('b');
});

test('a wide cluster written over the lead of another orphans nothing', () => {
  const b = new Buffer(4, 1);
  b.set(1, 0, '日'); // cells 1,2
  b.set(0, 0, '本'); // cells 0,1 — 日's lead is overwritten, its continuation at 2 must blank
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual(['本', '', ' ', ' ']);
});

test('a wide cluster written over a continuation blanks that lead and takes its own pair', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, '日'); // cells 0,1
  b.set(1, 0, '本'); // cells 1,2 — 日 loses its continuation
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual([' ', '本', '', ' ']);
});

test('set with an empty char is ignored and noted: only set itself writes a continuation', () => {
  const b = new Buffer(2, 1);
  b.set(0, 0, 'a');
  b.set(0, 0, '');
  expect(b.get(0, 0).char).toBe('a');
  expect(takeWarnings().some((w) => w.includes('Buffer.set'))).toBe(true);
});

test('a zero-width cluster never lands in a cell', () => {
  const b = new Buffer(2, 1);
  b.set(0, 0, '́');
  expect(b.get(0, 0).char).toBe(' ');
});

test('clone keeps the pair', () => {
  const b = new Buffer(3, 1);
  b.set(0, 0, '日');
  const c = b.clone();
  c.set(0, 0, 'a');
  expect(b.get(1, 0).char).toBe('');
  expect(c.get(1, 0).char).toBe(' ');
});
