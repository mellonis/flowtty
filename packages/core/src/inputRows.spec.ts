import { expect, test } from 'vitest';
import { inputRows, caretPosition, rowIndexAt } from './inputRows.js';
import { wrapText, wrapTextLines } from './wrap.js';

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

// The field breaks at words — the same break the output prints — so what is typed
// reads as what is shown. It used to pack clusters to the width, cutting words
// mid-way (2026-11-22).
test('a source line breaks into the rows wrapText prints, at words', () => {
  const line = 'see the quick brown fox jump over the lazy dog';
  for (const width of [5, 7, 10, 12, 20, 44, 45, 46]) {
    expect(inputRows(line, width).map((r) => r.text)).toEqual(wrapText(line, width, 'wrap'));
  }
});

test('a word wider than the width hard-breaks at clusters — the same rows as the output', () => {
  for (const width of [2, 3, 4, 5]) {
    expect(inputRows('ab 🙂🙂🙂🙂 cd', width).map((r) => r.text)).toEqual(wrapText('ab 🙂🙂🙂🙂 cd', width, 'wrap'));
  }
});

test('at a word wrap the caret opens the next row, and stands at the row end before the break', () => {
  // 'aa bb' at width 3: rows 'aa' | 'bb', the break consuming the space at 2.
  expect(inputRows('aa bb', 3).map((r) => [r.text, r.start])).toEqual([['aa', 0], ['bb', 3]]);
  expect(caretPosition('aa bb', 2, 3)).toEqual({ row: 0, col: 2 }); // before the break: that row's end
  expect(caretPosition('aa bb', 3, 3)).toEqual({ row: 1, col: 0 }); // after it: the next row opens
  expect(caretPosition('aa bb', 5, 3)).toEqual({ row: 1, col: 2 });
});

test('every cursor round-trips through rowIndexAt on the row that shows it', () => {
  const value = 'see the quick brown fox\nand a second line that wraps too';
  for (const width of [6, 11, 17]) {
    const rows = inputRows(value, width);
    for (let cursor = 0; cursor <= value.length; cursor++) {
      const at = caretPosition(value, cursor, width);
      expect(rowIndexAt(rows[at.row]!, at.col)).toBe(cursor);
    }
  }
});

test('a caret in a dropped run of spaces stands at the row end before it, and gets a row at the value end', () => {
  // 'aa   bb' at width 3: the rows are 'aa ' | 'bb' — the first row keeps what fits
  // and the wrap drops '  ' before the next word; the caret inside the dropped run
  // stands at the end of the row before it (its trailing space shown).
  expect(inputRows('aa   bb', 3).map((r) => [r.text, r.start])).toEqual([['aa ', 0], ['bb', 5]]);
  expect(caretPosition('aa   bb', 3, 3)).toEqual({ row: 0, col: 3 });
  expect(caretPosition('aa   bb', 4, 3)).toEqual({ row: 0, col: 3 });
  // A caret past the last row's end has a row to stand on (the "exactly fills" rule,
  // generalised to a break the value ends on).
  expect(inputRows('aa   bb ', 3, 8).map((r) => r.text)).toEqual(['aa ', 'bb ', '']);
  expect(caretPosition('aa   bb ', 8, 3)).toEqual({ row: 2, col: 0 });
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

test('the FIELD keeps a leading run of spaces where the OUTPUT trims it', () => {
  // Two worlds, both pinned: the printed rows are `asPainted` (line-outer spaces
  // trimmed, a line of only separators collapsed — wrap.spec, selection.spec),
  // while the field must not lose what was typed: the indent is content there
  // and every source line has a row ("as typed" copy).
  expect(wrapTextLines('  npm test', 90, 'wrap')).toEqual([{ text: 'npm test' }]);
  expect(wrapTextLines('   ', 5, 'wrap')).toEqual([{ text: '' }]);
  expect(wrapTextLines('  ab cd', 4, 'wrap')).toEqual([
    { text: 'ab', continues: ' ' },
    { text: 'cd' },
  ]);
  // The field's rows hold the indent and a spaces-only line — and the caret walks
  // the indent, not past it.
  expect(inputRows('run\n   \n  npm test', 90).map((row) => row.text)).toEqual(['run', '   ', '  npm test']);
  expect(inputRows('run\n  npm test', 90).map((row) => row.text)).toEqual(['run', '  npm test']);
  expect(inputRows('  npm', 20)).toEqual([{ text: '  npm', start: 0, continuation: false }]);
  expect(caretPosition('  npm', 4, 20)).toEqual({ row: 0, col: 4 });
  // A wrapped row's text is a contiguous source slice, so a copy that joins rows
  // with `next.start − (start + text.length)` rejoins the line as typed.
  const rows = inputRows('run\n  ab   cd', 4);
  expect(rows.map((row) => [row.text, row.start])).toEqual([['run', 0], ['  ab', 4], ['cd', 11]]);
});
