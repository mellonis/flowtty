// Box-drawing glyphs for the five named border styles. GRID_CHARS is the single
// runtime table — it carries every glyph a multi-cell grid needs. BORDER_CHARS is
// the same object viewed through a narrower type (corners + edges, no inner
// junctions), so a plain box border and a grid can never disagree on a glyph.
export type BorderStyle = 'single' | 'double' | 'round' | 'bold' | 'classic';

/** The library-wide default for components that draw a box-border chrome
 *  (DialogHost wrappers, Menu panels, Table grids). Declared once so the
 *  default is a single edit, not one per component. */
export const DEFAULT_BORDER_STYLE: BorderStyle = 'round';

// Glyphs for drawing a multi-cell *grid* (e.g. a table): the outer edges (`h`/`v`)
// and corners, the T-junctions where an inner rule meets an outer edge (┬ ┴ ├ ┤),
// and the cross where two inner rules meet (┼). `round` borrows single's junctions —
// only the four outer corners round off.
export interface GridChars {
  h: string; v: string;
  tl: string; tr: string; bl: string; br: string;
  tDown: string; tUp: string; tRight: string; tLeft: string; cross: string;
}

export const GRID_CHARS: Record<BorderStyle, GridChars> = {
  single:  { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘', tDown: '┬', tUp: '┴', tRight: '├', tLeft: '┤', cross: '┼' },
  round:   { h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯', tDown: '┬', tUp: '┴', tRight: '├', tLeft: '┤', cross: '┼' },
  double:  { h: '═', v: '║', tl: '╔', tr: '╗', bl: '╚', br: '╝', tDown: '╦', tUp: '╩', tRight: '╠', tLeft: '╣', cross: '╬' },
  bold:    { h: '━', v: '┃', tl: '┏', tr: '┓', bl: '┗', br: '┛', tDown: '┳', tUp: '┻', tRight: '┣', tLeft: '┫', cross: '╋' },
  classic: { h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+', tDown: '+', tUp: '+', tRight: '+', tLeft: '+', cross: '+' },
};

// A plain box border is a grid without the inner junctions: the four corners plus
// the horizontal (`h`, top & bottom) and vertical (`v`, left & right) edge glyphs.
// Expressed as a view over GridChars so it shares one runtime table.
export type BorderChars = Pick<GridChars, 'h' | 'v' | 'tl' | 'tr' | 'bl' | 'br'>;

// Same runtime table as GRID_CHARS — a box border is just the grid seen through
// the narrower BorderChars view, so there is no second object to keep in sync.
export const BORDER_CHARS: Record<BorderStyle, BorderChars> = GRID_CHARS;
