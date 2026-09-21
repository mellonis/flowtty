import { expect, test } from 'vitest';
import { wrapText, wrapTextLines } from './wrap.js';

test('wrap mode: short text fits on one line', () => {
  expect(wrapText('hi', 10, 'wrap')).toEqual(['hi']);
});

test('wrap mode: word-wraps at spaces', () => {
  expect(wrapText('hello world', 7, 'wrap')).toEqual(['hello', 'world']);
  expect(wrapText('a b c d', 3, 'wrap')).toEqual(['a b', 'c d']);
});

test('wrap mode: char-wraps a single word longer than width', () => {
  expect(wrapText('antidisestablishment', 6, 'wrap')).toEqual(['antidi', 'sestab', 'lishme', 'nt']);
});

test('wrap mode: mixed — word-wraps where it can, char-wraps long words', () => {
  expect(wrapText('hi superlongword bye', 6, 'wrap')).toEqual(['hi', 'superl', 'ongwor', 'd bye']);
});

test('wrap mode: preserves explicit newline (wrap each source line independently)', () => {
  expect(wrapText('hello world\nfoo bar', 6, 'wrap')).toEqual(['hello', 'world', 'foo', 'bar']);
});

test('truncate mode: lines longer than width truncated with … (single-cell ellipsis)', () => {
  expect(wrapText('hello world', 7, 'truncate')).toEqual(['hello …']);
  expect(wrapText('hi', 7, 'truncate')).toEqual(['hi']);
});

test('truncate mode: width 1 yields a single ellipsis; width 0 yields empty', () => {
  expect(wrapText('hello', 1, 'truncate')).toEqual(['…']);
  expect(wrapText('hello', 0, 'truncate')).toEqual(['']);
});

test('truncate mode: preserves explicit newline; each source line truncated independently', () => {
  expect(wrapText('hello world\nfoo bar baz', 7, 'truncate')).toEqual(['hello …', 'foo ba…']);
});

test('truncate mode: shows the ellipsis even when the cut falls on a word boundary', () => {
  // chars[width] is a space here; the truncation must still be visible.
  expect(wrapText('hello world', 5, 'truncate')).toEqual(['hell…']);
  expect(wrapText('foo bar baz', 7, 'truncate')).toEqual(['foo ba…']);
});

test('none mode: no wrapping or truncation (lines kept whole)', () => {
  expect(wrapText('hello world', 3, 'none')).toEqual(['hello world']);
  expect(wrapText('a\nb', 1, 'none')).toEqual(['a', 'b']);
});

test('edge: width 0 in wrap mode returns an empty line per source line', () => {
  expect(wrapText('hello', 0, 'wrap')).toEqual(['']);
});

test('wrap mode: a whitespace-only source line collapses, regardless of position', () => {
  // Spaces are word separators with no content, so a spaces-only line yields
  // nothing — consistently, whether it's first, middle, or last.
  expect(wrapText(' \na', 6, 'wrap')).toEqual(['a']);
  expect(wrapText('a\n ', 6, 'wrap')).toEqual(['a']);
});

test('edge: empty input returns a single empty line (matches measureText height=1)', () => {
  expect(wrapText('', 10, 'wrap')).toEqual(['']);
  expect(wrapText('', 10, 'truncate')).toEqual(['']);
  expect(wrapText('', 10, 'none')).toEqual(['']);
});

// ─── wrapTextLines: how each line joins to the next ──────────────────────────
// A selection that covers a wrapped paragraph has to put it back together, and
// that needs to know WHY the line ended: a dropped space, a cut through a word,
// or a line break that was in the source all along.

test('wrapTextLines: a word wrap drops a space, so the join is that space', () => {
  expect(wrapTextLines('hello world', 7, 'wrap')).toEqual([
    { text: 'hello', continues: ' ' },
    { text: 'world' },
  ]);
});

test('wrapTextLines: a cut through a long word joins with nothing', () => {
  expect(wrapTextLines('antidisestablishment', 6, 'wrap')).toEqual([
    { text: 'antidi', continues: '' },
    { text: 'sestab', continues: '' },
    { text: 'lishme', continues: '' },
    { text: 'nt' },
  ]);
});

test('wrapTextLines: mixed breaks each carry what they dropped', () => {
  expect(wrapTextLines('hi superlongword bye', 6, 'wrap')).toEqual([
    { text: 'hi', continues: ' ' },
    { text: 'superl', continues: '' },
    { text: 'ongwor', continues: '' },
    { text: 'd bye' },
  ]);
});

test('wrapTextLines: a newline in the source is never a continuation', () => {
  expect(wrapTextLines('hello world\nfoo bar', 6, 'wrap')).toEqual([
    { text: 'hello', continues: ' ' },
    { text: 'world' },
    { text: 'foo', continues: ' ' },
    { text: 'bar' },
  ]);
});

test('wrapTextLines: truncate and none never continue — content is cut, not carried', () => {
  expect(wrapTextLines('hello world', 7, 'truncate')).toEqual([{ text: 'hello …' }]);
  expect(wrapTextLines('a\nb', 1, 'none')).toEqual([{ text: 'a' }, { text: 'b' }]);
});

test('wrapTextLines: the last line of a source line never continues past the newline', () => {
  // The source line ends in a space the wrap ate, but the break after it is the
  // `\n` the author wrote: joining the two rows would paste 'abc def'.
  expect(wrapTextLines('abc \ndef', 3, 'wrap').map((l) => l.continues))
    .toEqual([undefined, undefined]);
});

// What `wrap` mode does not paint, and so cannot be read back out of a frame.
// Documented in docs/input.md (selection).
function asPainted(source: string): string {
  return source
    .split('\n')
    .filter((line) => /[^ ]/u.test(line) || line === '')
    .map((line) => line.replace(/^ +/u, '').replace(/ +$/u, ''))
    .join('\n');
}

const ROUND_TRIP_CORPUS = [
  'hello world',
  'antidisestablishment',
  'hi superlongword bye',
  'a b c d',
  'abc  def',          // two spaces at the break
  'ab   cd',           // three, so one of them survives as painted text
  'one    two   three',
  'const x = 1;',
  'a\nb',
  'one two\n\nthree four',
  'wrap  a superlongunbreakableword  here',
  'ключ значение 🙂 emoji',
  'a\u00a0b nbsp\u00a0word',   // NBSP is content, not a space: never a break, never trimmed
  'a\n\u00a0\nb',
];

test('wrapTextLines: the joins put every source line back exactly', () => {
  for (const source of ROUND_TRIP_CORPUS) {
    for (const width of [1, 2, 3, 6, 7, 12, 20]) {
      const lines = wrapTextLines(source, width, 'wrap');
      let out = '';
      for (const [i, line] of lines.entries()) {
        out += line.text;
        // `continues` IS what the wrap dropped at the break — '' for a cut
        // through a word, one or more spaces for a word wrap.
        if (i < lines.length - 1) out += line.continues ?? '\n';
      }
      expect(out, `${JSON.stringify(source)} at width ${width}`).toBe(asPainted(source));
    }
  }
});

test('wrapText is wrapTextLines without the joins', () => {
  const args = ['hi superlongword bye', 6, 'wrap'] as const;
  expect(wrapText(...args)).toEqual(wrapTextLines(...args).map((l) => l.text));
});

test('wrapTextLines: a break inside a run of spaces carries the whole run', () => {
  // The greedy pass joins words with one space; the line keeps the spaces that
  // still fitted and the mark carries the rest.
  expect(wrapTextLines('abc  def', 3, 'wrap')).toEqual([
    { text: 'abc', continues: '  ' },
    { text: 'def' },
  ]);
  expect(wrapTextLines('ab   cd', 3, 'wrap')).toEqual([
    { text: 'ab ', continues: '  ' },
    { text: 'cd' },
  ]);
});
