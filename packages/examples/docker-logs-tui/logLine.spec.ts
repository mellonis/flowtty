import { describe, test, expect } from 'vitest';
import { stripAnsi, classifyLevel, filterLines } from './logLine.js';
import type { LogLine } from './types.js';

describe('stripAnsi', () => {
  test('removes CSI color sequences but keeps the text', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });
  test('passes plain text through unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });
});

describe('classifyLevel', () => {
  test.each([
    ['2026-01-01 ERROR boom', 'error'],
    ['fatal: disk full', 'error'],
    ['warn: slow query', 'warn'],
    ['DEBUG connecting', 'debug'],
    ['just an ordinary line', 'info'],
  ] as const)('%s -> %s', (line, level) => {
    expect(classifyLevel(line)).toBe(level);
  });
});

describe('filterLines', () => {
  const lines: LogLine[] = [
    { text: 'connection accepted', level: 'info' },
    { text: 'slow query 412ms', level: 'warn' },
  ];
  test('empty query returns all lines', () => {
    expect(filterLines(lines, '')).toHaveLength(2);
  });
  test('matches case-insensitive substrings', () => {
    expect(filterLines(lines, 'QUERY').map((l) => l.text)).toEqual(['slow query 412ms']);
  });
});
