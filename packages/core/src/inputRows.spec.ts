import { expect, test } from 'vitest';
import { inputRows, caretPosition, rowIndexAt } from './inputRows.js';

test('each source line is a row; a blank line is a row of its own', () => {
  expect(inputRows('one\n\ntwo', 10).map((r) => [r.text, r.start])).toEqual([['one', 0], ['', 4], ['two', 5]]);
});

test('a line longer than the width hard-wraps into continuation rows', () => {
  const rows = inputRows('abcdefghijKLM', 10);
  expect(rows.map((r) => [r.text, r.start, r.continuation])).toEqual([['abcdefghij', 0, false], ['KLM', 10, true]]);
});

test('an empty value is one empty row', () => {
  expect(inputRows('', 10)).toEqual([{ text: '', start: 0, continuation: false }]);
});

test('the caret at the end of a line followed by a line break stays on that line', () => {
  expect(caretPosition('one\ntwo', 3, 10)).toEqual({ row: 0, col: 3 });
  expect(caretPosition('one\ntwo', 4, 10)).toEqual({ row: 1, col: 0 });
});

test('the caret can stand on a blank line', () => {
  expect(caretPosition('one\n\ntwo', 4, 10)).toEqual({ row: 1, col: 0 });
});

test('at a soft wrap the caret opens the next row', () => {
  expect(caretPosition('abcdefghijKLM', 10, 10)).toEqual({ row: 1, col: 0 });
});

test('at the end of a line that exactly fills the width, the caret gets a row of its own', () => {
  expect(caretPosition('abcdefghij', 10, 10)).toEqual({ row: 1, col: 0 });
  expect(inputRows('abcdefghij', 10, 10).map((r) => r.text)).toEqual(['abcdefghij', '']);
  expect(inputRows('abcdefghij', 10, 3).map((r) => r.text)).toEqual(['abcdefghij']); // caret elsewhere: no extra row
});

test('rows break by column: an emoji is one cluster of two columns, never split between its halves', () => {
  const rows = inputRows('😀😀😀😀😀', 4);
  expect(rows.map((r) => [r.text, r.start])).toEqual([['😀😀', 0], ['😀😀', 4], ['😀', 8]]);
  expect(inputRows('😀😀', 2).map((r) => [r.text, r.start])).toEqual([['😀', 0], ['😀', 2]]);
});

test('caretPosition reports the column in display columns; `start` and `cursor` stay UTF-16 indices', () => {
  expect(caretPosition('😀😀x', 4, 10)).toEqual({ row: 0, col: 4 });
  expect(caretPosition('😀😀😀', 4, 4)).toEqual({ row: 1, col: 0 }); // soft wrap after two emoji
});

// ─── display width ───────────────────────────────────────────────────────────

test('rows break by display column and never split a wide cluster', () => {
  expect(inputRows('日本語', 4).map((r) => [r.text, r.start, r.continuation])).toEqual([['日本', 0, false], ['語', 2, true]]);
  expect(inputRows('a日本', 4).map((r) => r.text)).toEqual(['a日', '本']);
});

test('the caret column is a display column', () => {
  expect(caretPosition('日本語', 1, 10)).toEqual({ row: 0, col: 2 });
  expect(caretPosition('日本語', 2, 10)).toEqual({ row: 0, col: 4 });
  expect(caretPosition('a🇯🇵b', 5, 10)).toEqual({ row: 0, col: 3 }); // after the flag: 1 + 2
});

test('a caret after a row that exactly fills its columns with wide text gets a row of its own', () => {
  expect(inputRows('日本', 4, 2).map((r) => [r.text, r.start])).toEqual([['日本', 0], ['', 2]]);
});

test('rowIndexAt converts a column back to an index; a column inside a wide cluster resolves after it', () => {
  const row = inputRows('a日b', 10)[0]!;
  expect(rowIndexAt(row, 0)).toBe(0);
  expect(rowIndexAt(row, 1)).toBe(1);
  expect(rowIndexAt(row, 2)).toBe(2);
  expect(rowIndexAt(row, 3)).toBe(2);
  expect(rowIndexAt(row, 4)).toBe(3);
});
