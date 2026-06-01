import { describe, test, expect } from 'vitest';
import { BORDER_CHARS, GRID_CHARS, type BorderStyle } from './borders.js';

describe('BORDER_CHARS', () => {
  const styles: BorderStyle[] = ['single', 'double', 'round', 'bold', 'classic'];

  test.each(styles)('%s style has all 6 single-char border slots', (style) => {
    const c = BORDER_CHARS[style];
    for (const slot of ['tl', 'tr', 'bl', 'br', 'h', 'v'] as const) {
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
    expect(BORDER_CHARS.single.h).toBe('─');
    expect(BORDER_CHARS.single.v).toBe('│');
  });
});

describe('GRID_CHARS', () => {
  const styles: BorderStyle[] = ['single', 'double', 'round', 'bold', 'classic'];

  test.each(styles)('%s style has all 11 single-char grid slots', (style) => {
    const c = GRID_CHARS[style];
    for (const slot of ['h', 'v', 'tl', 'tr', 'bl', 'br', 'tDown', 'tUp', 'tRight', 'tLeft', 'cross'] as const) {
      expect([...c[slot]].length).toBe(1);
    }
  });

  test('round borrows single-style junctions; only the outer corners round off', () => {
    expect(GRID_CHARS.round.tl).toBe('╭');
    expect(GRID_CHARS.round.br).toBe('╯');
    expect(GRID_CHARS.round.cross).toBe('┼');
    expect(GRID_CHARS.round.tDown).toBe('┬');
  });
});
