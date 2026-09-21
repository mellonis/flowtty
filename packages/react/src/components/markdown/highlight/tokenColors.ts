// The whole palette of the code highlighter, in one table. Every color is a
// named palette color, so the 256 / 16-color downgrade and NO_COLOR apply
// (docs/components.md — code blocks).

import type { SegBuilder, TokenStyle, TokenType } from './types.js';

export const TOKEN_COLORS: Readonly<Record<TokenType, TokenStyle>> = {
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

function sameStyle(a: TokenStyle, b: TokenStyle): boolean {
  return a.color === b.color && !!a.dim === !!b.dim && !!a.bold === !!b.bold;
}

/** A fresh collector. Adjacent runs with the same style merge into one seg. */
export function createBuilder(): SegBuilder {
  const segs: SegBuilder['segs'] = [];
  return {
    segs,
    push(text: string, token: TokenType): void {
      if (text === '') return;
      const style = TOKEN_COLORS[token];
      const last = segs[segs.length - 1];
      if (last && sameStyle(last, style)) last.text += text;
      else segs.push({ text, ...style });
    },
  };
}
