import { describe, test, expect } from 'vitest';
import { BORDER_CHARS, type BorderStyle } from './borders.js';

describe('BORDER_CHARS', () => {
  const styles: BorderStyle[] = ['single', 'double', 'round', 'bold', 'classic'];

  test.each(styles)('%s style has all 8 single-char slots', (style) => {
    const c = BORDER_CHARS[style];
    for (const slot of ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'] as const) {
      const ch = c[slot];
      expect(typeof ch).toBe('string');
      // each glyph is a single visible char (display-width 1 — all box-drawing chars are width-1)
      expect([...ch].length).toBe(1);
    }
  });

  test('single style uses the canonical box-drawing glyphs', () => {
    expect(BORDER_CHARS.single.tl).toBe('┌');
    expect(BORDER_CHARS.single.tr).toBe('┐');
    expect(BORDER_CHARS.single.bl).toBe('└');
    expect(BORDER_CHARS.single.br).toBe('┘');
    expect(BORDER_CHARS.single.t).toBe('─');
    expect(BORDER_CHARS.single.l).toBe('│');
  });
});
