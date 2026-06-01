import { expect, test } from 'vitest';
import { wrapText } from './wrap.js';

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
