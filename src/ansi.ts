import type { Cell, Style } from './cells.js';

export const RESET = '\x1b[0m';

const FG: Record<string, number> = {
  black: 30, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, white: 37,
};

const BG: Record<string, number> = {
  black: 40, red: 41, green: 42, yellow: 43,
  blue: 44, magenta: 45, cyan: 46, white: 47,
};

export function sgr(style: Style): string {
  const codes: number[] = [];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.underline) codes.push(4);
  if (style.inverse) codes.push(7);
  if (style.fg && FG[style.fg] !== undefined) codes.push(FG[style.fg]!);
  if (style.bg && BG[style.bg] !== undefined) codes.push(BG[style.bg]!);
  return codes.length ? `\x1b[${codes.join(';')}m` : '';
}

export const HIDE_CURSOR = '\x1b[?25l';
export const SHOW_CURSOR = '\x1b[?25h';
export const CLEAR = '\x1b[2J\x1b[H';

// Alternate screen buffer — enter on mount, exit on dispose. Without this,
// every full-frame redraw pushes the previous frame into the terminal's
// scrollback, so a long-running app polluting history with hundreds of
// stacked frames. Alt-screen makes redraws in-place and restores the
// user's original terminal content on exit.
export const ALT_SCREEN_ON = '\x1b[?1049h';
export const ALT_SCREEN_OFF = '\x1b[?1049l';

/**
 * CSI Cursor Position: move cursor to (col, row), both 1-indexed in the ANSI
 * spec. We accept 0-indexed (x, y) and convert.
 */
export function cursorTo(x: number, y: number): string {
  return `\x1b[${y + 1};${x + 1}H`;
}

/** True iff two cells have identical char AND identical style. */
export function cellsEqual(a: Cell, b: Cell): boolean {
  if (a.char !== b.char) return false;
  // Style objects are small (~6 optional bool/string fields). JSON.stringify
  // is correct + fast enough at this scale; matches the existing per-cell
  // SGR change-detection pattern used in TtyBackend.draw.
  return JSON.stringify(a.style) === JSON.stringify(b.style);
}
