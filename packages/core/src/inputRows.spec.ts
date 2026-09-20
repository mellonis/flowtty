import { expect, test } from 'vitest';
import { inputRows, caretPosition } from './inputRows.js';

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
