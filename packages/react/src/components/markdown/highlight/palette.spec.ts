import { describe, expect, test } from 'vitest';
import { DEFAULT_TOKEN_COLORS, createBuilder, resolvePalette } from './tokenColors.js';
import { highlightBlock } from './index.js';

describe('the token palette', () => {
  test('an override restyles what the highlighter emits', () => {
    const palette = resolvePalette({ added: 'blue', removed: { color: 'magenta', dim: true } });
    const lines = highlightBlock(['@@ -1 +1 @@', '-gone', '+new'], 'diff', palette);
    expect(lines[1]!.segs[0]).toEqual({ text: '-gone', color: 'magenta', dim: true });
    expect(lines[2]!.segs[0]).toEqual({ text: '+new', color: 'blue' });
  });

  // A partial style merges over the default one: a band alone keeps the ink.
  test('a partial style keeps the fields it does not name', () => {
    const palette = resolvePalette({ added: { background: '#113311' } });
    expect(palette.added).toEqual({ color: 'green', background: '#113311' });
    expect(palette.removed).toEqual(DEFAULT_TOKEN_COLORS.removed);
  });

  // Runs merge on the RESOLVED style, so two tokens that look alike by default
  // stay apart when only one of them is recoloured.
  test('merging happens after the palette, not before', () => {
    const b = createBuilder(resolvePalette({ number: 'red' }));
    b.push('12', 'number');
    b.push('13', 'selector');
    expect(b.segs).toEqual([{ text: '12', color: 'red' }, { text: '13', color: 'yellow' }]);
  });

  // Review Focus: an unknown token and a token left undefined are both "absent".
  test('an unknown token and an undefined value are ignored', () => {
    const over = { added: undefined, nosuchtoken: 'red' } as never;
    expect(resolvePalette(over)).toEqual(DEFAULT_TOKEN_COLORS);
  });

  // Review Focus: no module state — the defaults are never touched.
  test('resolving leaves the defaults alone, whatever the caller does next', () => {
    resolvePalette({ added: 'blue', removed: 'blue' });
    expect(DEFAULT_TOKEN_COLORS.added).toEqual({ color: 'green' });
    expect(DEFAULT_TOKEN_COLORS.removed).toEqual({ color: 'red' });
    expect(resolvePalette()).toBe(DEFAULT_TOKEN_COLORS);
  });
});
