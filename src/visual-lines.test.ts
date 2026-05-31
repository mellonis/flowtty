import { describe, test, expect } from 'vitest';
import { splitVisualLines } from './visual-lines.js';

describe('splitVisualLines', () => {
  test('nowrap: one visual line per source line, line numbers 1-based', () => {
    const lines = splitVisualLines('a\nbb\nccc', 'nowrap', 80);
    expect(lines).toEqual([
      { text: 'a', lineNum: 1 },
      { text: 'bb', lineNum: 2 },
      { text: 'ccc', lineNum: 3 },
    ]);
  });

  test('wrap: short lines pass through; long lines split at width with continuation lineNum=null', () => {
    const lines = splitVisualLines('short\nthisisalongword\nx', 'wrap', 5);
    expect(lines).toEqual([
      { text: 'short', lineNum: 1 },
      { text: 'thisi', lineNum: 2 },
      { text: 'salon', lineNum: null },
      { text: 'gword', lineNum: null },
      { text: 'x',     lineNum: 3 },
    ]);
  });

  test('wrap with width<=0 degrades to nowrap behavior (no hard-wrap)', () => {
    const lines = splitVisualLines('any long text', 'wrap', 0);
    expect(lines).toEqual([{ text: 'any long text', lineNum: 1 }]);
  });

  test('wrap counts characters by codepoint (Cyrillic = 1 cell each)', () => {
    // 6 Cyrillic chars, width=4 → "Привет" (6) wraps to "Прив" + "ет".
    const lines = splitVisualLines('Привет', 'wrap', 4);
    expect(lines).toEqual([
      { text: 'Прив', lineNum: 1 },
      { text: 'ет',   lineNum: null },
    ]);
  });

  test('empty input yields a single empty visual line (matches measure default height=1)', () => {
    const lines = splitVisualLines('', 'wrap', 10);
    expect(lines).toEqual([{ text: '', lineNum: 1 }]);
  });
});
