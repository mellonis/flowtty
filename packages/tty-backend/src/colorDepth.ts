// How many colors the terminal can show, and how to bring a 24-bit color down to
// that. Named colors never need this — they are 16-color codes at any depth.

/** Color depth in bits, as Node's `getColorDepth()` counts them: 4 = the 16 ANSI
 *  colors, 8 = the xterm 256-color palette, 24 = truecolor. */
export type ColorDepth = 4 | 8 | 24;

// Terminals that do truecolor and say so only through TERM.
const TRUECOLOR_TERMS = new Set(['xterm-kitty', 'alacritty', 'wezterm', 'xterm-ghostty']);

/**
 * The terminal's color depth, from the environment. Truecolor is only assumed
 * when the terminal ANNOUNCES it: a 24-bit sequence sent to a 256-color terminal
 * gives wrong colors (or none), while 256 colors on a truecolor terminal are
 * merely a little duller — so when unsure, err low.
 *
 * Node's own `stream.getColorDepth()` is deliberately not used: it answers "256"
 * for Apple Terminal from TERM_PROGRAM alone, before it ever looks at COLORTERM.
 *
 * `FORCE_COLOR=1|2|3` picks 16 / 256 / truecolor outright. (Whether to emit color
 * at all is `detectColorSupport`'s question.)
 */
export function detectColorDepth(env: NodeJS.ProcessEnv = process.env): ColorDepth {
  if (env.FORCE_COLOR === '1') return 4;
  if (env.FORCE_COLOR === '2') return 8;
  if (env.FORCE_COLOR === '3') return 24;
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 24;
  const term = env.TERM ?? '';
  if (TRUECOLOR_TERMS.has(term) || term.endsWith('-direct')) return 24;
  if (term.includes('256color')) return 8;
  return 4;
}

const CUBE = [0, 95, 135, 175, 215, 255] as const;
const nearestCubeIndex = (v: number): number => {
  let best = 0;
  for (let i = 1; i < CUBE.length; i++) if (Math.abs(CUBE[i]! - v) < Math.abs(CUBE[best]! - v)) best = i;
  return best;
};
const dist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number =>
  (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;

/** Nearest entry of the xterm 256-color palette: the 6×6×6 cube (16–231) or the
 *  24-step gray ramp (232–255), whichever is closer. */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  const ri = nearestCubeIndex(r), gi = nearestCubeIndex(g), bi = nearestCubeIndex(b);
  const cubeDist = dist(r, g, b, CUBE[ri]!, CUBE[gi]!, CUBE[bi]!);
  // Gray ramp: 232 + i has the level 8 + 10·i.
  const gi24 = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const level = 8 + 10 * gi24;
  return dist(r, g, b, level, level, level) < cubeDist ? 232 + gi24 : 16 + 36 * ri + 6 * gi + bi;
}

// xterm's default values for the 16 ANSI colors, in SGR order: 30–37, then 90–97.
const ANSI16: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0], [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
  [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0], [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
];

/** Nearest of the 16 ANSI colors, as an SGR FOREGROUND code (30–37, 90–97); add 10 for background. */
export function rgbToAnsi16(r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  ANSI16.forEach(([cr, cg, cb], i) => {
    const d = dist(r, g, b, cr, cg, cb);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best < 8 ? 30 + best : 90 + (best - 8);
}
