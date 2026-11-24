// The whole palette of the code highlighter, in one table, plus the one way a
// caller changes it. Every default color is a named palette color, so the
// 256 / 16-color downgrade and NO_COLOR apply (docs/components.md — code
// blocks); an override is the caller's own Color and their own trade.

import type { CodeSeg, SegBuilder, TokenColors, TokenPalette, TokenStyle, TokenType } from './types.js';

export const DEFAULT_TOKEN_COLORS: TokenPalette = {
  plain: {},
  // Comments are the one place dim still means "secondary" inside code.
  comment: { dim: true },
  string: { color: 'green' },
  number: { color: 'yellow' },
  keyword: { color: 'magenta' },
  type: { color: 'blue' },
  key: { color: 'cyan' },
  command: { color: 'blue' },
  property: { color: 'cyan' },
  selector: { color: 'yellow' },
  tag: { color: 'blue' },
  component: { color: 'cyan' },
  attr: { color: 'yellow' },
  entity: { color: 'magenta' },
  directive: { color: 'magenta' },
  annotation: { color: 'cyan' },
  muted: { dim: true },
  added: { color: 'green' },
  removed: { color: 'red' },
  hunk: { color: 'cyan' },
  // The `+` / `-` glyphs carry the meaning; color only reinforces it, so a
  // file header needs no color of its own.
  header: { bold: true },
};

/**
 * The defaults with the caller's overrides laid over them, token by token. A
 * partial style keeps the fields it does not name; a bare Color is that token's
 * ink. Resolved BEFORE the builder merges neighbouring runs, so two tokens that
 * look alike by default stay apart once only one of them is recoloured.
 *
 * A token the table does not know, and a token mapped to `undefined`, are both
 * absent: a caller's typo draws the default rather than throwing.
 */
export function resolvePalette(overrides?: TokenColors): TokenPalette {
  if (!overrides) return DEFAULT_TOKEN_COLORS;
  const out = { ...DEFAULT_TOKEN_COLORS };
  for (const token of Object.keys(DEFAULT_TOKEN_COLORS) as TokenType[]) {
    const o = overrides[token];
    if (o === undefined) continue;
    out[token] = typeof o === 'string'
      ? { ...DEFAULT_TOKEN_COLORS[token], color: o }
      : { ...DEFAULT_TOKEN_COLORS[token], ...o };
  }
  return out;
}

function sameStyle(a: TokenStyle, b: TokenStyle): boolean {
  return a.color === b.color && !!a.dim === !!b.dim && !!a.bold === !!b.bold;
}

/** A fresh collector. Adjacent runs with the same style merge into one seg. */
export function createBuilder(palette: TokenPalette = DEFAULT_TOKEN_COLORS): SegBuilder {
  const segs: SegBuilder['segs'] = [];
  return {
    segs,
    push(text: string, token: TokenType): void {
      if (text === '') return;
      const style = palette[token];
      const last = segs[segs.length - 1];
      if (last && sameStyle(last, style)) last.text += text;
      else {
        // The band is the layout's, not a run's: only the ink goes on the seg.
        const seg: CodeSeg = { text };
        if (style.color !== undefined) seg.color = style.color;
        if (style.dim !== undefined) seg.dim = style.dim;
        if (style.bold !== undefined) seg.bold = style.bold;
        segs.push(seg);
      }
    },
  };
}
