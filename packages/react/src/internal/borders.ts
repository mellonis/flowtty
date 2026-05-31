// Five named border styles. Each value is an 8-char string in the fixed order:
//   tl, t, tr, r, br, b, bl, l
// where t/r/b/l are the repeating edge glyphs (single char each) and tl/tr/br/bl
// are the four corners. Paint repeats the edge chars to fill the box width/height.
export type BorderStyle = 'single' | 'double' | 'round' | 'bold' | 'classic';

export interface BorderChars {
  tl: string; t: string; tr: string;
  r: string;
  br: string; b: string; bl: string;
  l: string;
}

export const BORDER_CHARS: Record<BorderStyle, BorderChars> = {
  single:  { tl: '┌', t: '─', tr: '┐', r: '│', br: '┘', b: '─', bl: '└', l: '│' },
  double:  { tl: '╔', t: '═', tr: '╗', r: '║', br: '╝', b: '═', bl: '╚', l: '║' },
  round:   { tl: '╭', t: '─', tr: '╮', r: '│', br: '╯', b: '─', bl: '╰', l: '│' },
  bold:    { tl: '┏', t: '━', tr: '┓', r: '┃', br: '┛', b: '━', bl: '┗', l: '┃' },
  classic: { tl: '+', t: '-', tr: '+', r: '|', br: '+', b: '-', bl: '+', l: '|' },
};
