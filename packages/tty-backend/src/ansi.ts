import type { Cell, NamedColor, Style } from '@flowtty/core';

export const RESET = '\x1b[0m';

// Bracketed paste mode: the terminal wraps pasted text in ESC[200~ … ESC[201~ so
// the key parser can deliver it as one 'paste' key instead of a run of keystrokes.
export const BRACKETED_PASTE_ON = '\x1b[?2004h';
export const BRACKETED_PASTE_OFF = '\x1b[?2004l';

// Mouse reporting: button events (1000) in SGR encoding (1006) — decimal
// coordinates with no 223-column cap. Turned off in reverse order.
export const MOUSE_ON = '\x1b[?1000h\x1b[?1006h';
export const MOUSE_OFF = '\x1b[?1006l\x1b[?1000l';

// The 8 ANSI colors plus their bright variants (`redBright` …, 90–97), with
// `gray` / `grey` as the familiar names for bright black. Background codes are
// the same numbers + 10. Typed over core's NamedColor: a name added there does
// not compile here until it has a code.
const FG: Record<NamedColor, number> = {
  black: 30, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, white: 37,
  gray: 90, grey: 90,
  blackBright: 90, redBright: 91, greenBright: 92, yellowBright: 93,
  blueBright: 94, magentaBright: 95, cyanBright: 96, whiteBright: 97,
};

// Lookups take an arbitrary string (a hex value, a typo), so read through a
// plain index signature; `FG` itself stays exhaustive over NamedColor.
const fgCode = (name: string): number | undefined => (FG as Record<string, number | undefined>)[name];
const bgCode = (name: string): number | undefined => { const c = fgCode(name); return c === undefined ? undefined : c + 10; };

// A color that is neither a known name nor parseable paints nothing — silently,
// which makes a typo (`'grayish'`) look like a layout bug. The names are kept so a
// backend can report them once it is safe to print (after leaving the alt
// screen); a warning written mid-frame would corrupt the display. `'default'` is
// the "no background" sentinel, not a mistake.
const unknownColors = new Set<string>();
const noteUnknownColor = (name: string): void => { if (name !== 'default') unknownColors.add(name); };

/** Unknown color names seen since the last call; clears the list. */
export function takeUnknownColors(): string[] {
  const names = [...unknownColors];
  unknownColors.clear();
  return names;
}

/**
 * Parse a color string into 0–255 RGB components.
 * Accepts:
 *   - "#rgb"     — 3-digit hex, each digit doubled (e.g. "#f80" → ff,88,00)
 *   - "#rrggbb"  — 6-digit hex
 *   - "rgb(R, G, B)" — CSS-style, each channel 0–255 integer
 * Returns null for anything else (named colors, malformed, out-of-range).
 * Callers should fall back to a named-color map on null.
 */
export function parseColor(input: string): { r: number; g: number; b: number } | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  const s = input.trim();

  // Hex form
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      if (!/^[0-9a-fA-F]{3}$/.test(hex)) return null;
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
    return null;
  }

  // rgb(r, g, b) form
  const m = /^rgb\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i.exec(s);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    return { r, g, b };
  }

  return null;
}

export interface SgrOptions {
  /** Emit fg / bg color codes. Default true. Off, the other attributes (bold,
   *  dim, underline, inverse, strikethrough) are still emitted. */
  color?: boolean;
}

/**
 * Should color be emitted? Follows the two conventions CLIs agree on:
 * `NO_COLOR` — present and non-empty — turns it off (no-color.org), and
 * `FORCE_COLOR` overrides that in either direction (`0` = off, anything else = on).
 */
export function detectColorSupport(env: NodeJS.ProcessEnv = process.env): boolean {
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== '') return force !== '0';
  return !(env.NO_COLOR !== undefined && env.NO_COLOR !== '');
}

export function sgr(style: Style, opts: SgrOptions = {}): string {
  const color = opts.color !== false;
  const parts: string[] = [];
  if (style.bold) parts.push('1');
  if (style.dim) parts.push('2');
  if (style.underline) parts.push('4');
  if (style.inverse) parts.push('7');
  if (style.strikethrough) parts.push('9');
  if (color && style.fg) {
    const rgb = parseColor(style.fg);
    if (rgb) {
      parts.push(`38;2;${rgb.r};${rgb.g};${rgb.b}`);
    } else {
      const code = fgCode(style.fg);
      if (code !== undefined) parts.push(String(code));
      else noteUnknownColor(style.fg);
    }
  }
  if (color && style.bg) {
    const rgb = parseColor(style.bg);
    if (rgb) {
      parts.push(`48;2;${rgb.r};${rgb.g};${rgb.b}`);
    } else {
      const code = bgCode(style.bg);
      if (code !== undefined) parts.push(String(code));
      else noteUnknownColor(style.bg);
    }
  }
  return parts.length ? `\x1b[${parts.join(';')}m` : '';
}

export const HIDE_CURSOR = '\x1b[?25l';
export const SHOW_CURSOR = '\x1b[?25h';
export const CLEAR = '\x1b[2J\x1b[H';

// OSC 8 hyperlink. `osc8Open(url)` starts a clickable region pointing at url;
// OSC8_CLOSE ends it. Cells written between the two become one hyperlink (the
// terminal coalesces adjacent cells sharing a URI). Unlike SGR, OSC 8 state is
// NOT cleared by RESET — callers must emit OSC8_CLOSE explicitly. The url is
// sanitized: control bytes (which could terminate the sequence early or inject
// a second escape) are stripped, since the ST/BEL terminator and any embedded
// ESC would corrupt the stream.
export const OSC8_CLOSE = '\x1b]8;;\x1b\\';
export function osc8Open(url: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally stripping C0/DEL
  const safe = url.replace(/[\x00-\x1f\x7f]/gu, '');
  return `\x1b]8;;${safe}\x1b\\`;
}

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
