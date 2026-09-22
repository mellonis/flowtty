/**
 * Whether the terminal is light or dark — what an app needs to pick a palette
 * that fits the screen it is drawn on. `'unknown'` until the terminal has
 * answered, and for good where it never does (a pipe, a multiplexer that eats
 * the query, a test backend nobody told). See docs/app.md (the color scheme).
 */
export type ColorScheme = 'light' | 'dark' | 'unknown';

/** The scheme, plus the terminal's default background as `#rrggbb` when it
 *  reported one — the exact ground an app's own colors sit on. */
export interface TerminalColorScheme {
  scheme: ColorScheme;
  background?: string;
}

/** The value a backend reports before it has heard from the terminal. */
export const UNKNOWN_COLOR_SCHEME: TerminalColorScheme = { scheme: 'unknown' };

/**
 * Light or dark, from a background color's perceived brightness (the
 * Rec. 601 luma of its sRGB channels): above half is light. Good enough for
 * every theme in use — grounds cluster near white or near black, and a theme
 * that sits on the line pairs its ground with either text color.
 */
export function colorSchemeOf(rgb: { r: number; g: number; b: number }): 'light' | 'dark' {
  const luma = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luma > 0.5 ? 'light' : 'dark';
}

/** `#rrggbb` for a color the terminal reported. */
export function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const hex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}
