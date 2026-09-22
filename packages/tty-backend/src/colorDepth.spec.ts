import { describe, expect, test } from 'vitest';
import { detectColorDepth, rgbToAnsi256, rgbToAnsi16 } from './colorDepth.js';
import { sgr } from './ansi.js';
import { selectedStyle } from '@flowtty/core/host';

describe('detectColorDepth', () => {
  test('COLORTERM announces truecolor', () => {
    expect(detectColorDepth({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })).toBe(24);
    expect(detectColorDepth({ TERM: 'xterm-256color', COLORTERM: '24bit' })).toBe(24);
  });

  test('a 256-color TERM without COLORTERM is 256 colors — not assumed to be more', () => {
    expect(detectColorDepth({ TERM: 'xterm-256color' })).toBe(8);
    expect(detectColorDepth({ TERM: 'screen-256color' })).toBe(8);
    expect(detectColorDepth({ TERM: 'tmux-256color' })).toBe(8);
  });

  test('terminals that are truecolor by name', () => {
    for (const TERM of ['xterm-kitty', 'alacritty', 'wezterm', 'xterm-ghostty', 'xterm-direct']) {
      expect(detectColorDepth({ TERM }), TERM).toBe(24);
    }
  });

  test('anything else gets the 16 ANSI colors', () => {
    expect(detectColorDepth({ TERM: 'xterm' })).toBe(4);
    expect(detectColorDepth({ TERM: 'linux' })).toBe(4);
    expect(detectColorDepth({})).toBe(4);
  });

  test('FORCE_COLOR=1|2|3 picks the depth outright', () => {
    expect(detectColorDepth({ TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1' })).toBe(4);
    expect(detectColorDepth({ TERM: 'xterm', FORCE_COLOR: '2' })).toBe(8);
    expect(detectColorDepth({ TERM: 'xterm', FORCE_COLOR: '3' })).toBe(24);
    expect(detectColorDepth({ TERM: 'xterm-256color', FORCE_COLOR: 'true' })).toBe(8); // on, but says nothing about depth
  });
});

describe('downgrading a 24-bit color', () => {
  test('rgbToAnsi256: exact cube corners, and grays go to the gray ramp', () => {
    expect(rgbToAnsi256(0, 0, 0)).toBe(16);
    expect(rgbToAnsi256(255, 255, 255)).toBe(231);
    expect(rgbToAnsi256(255, 0, 0)).toBe(196);
    expect(rgbToAnsi256(95, 135, 175)).toBe(67);     // exactly on the cube
    expect(rgbToAnsi256(128, 128, 128)).toBe(244);   // closer on the ramp (128) than in the cube (135)
    expect(rgbToAnsi256(18, 18, 18)).toBe(233);
  });

  test('rgbToAnsi16: the nearest of the 16 ANSI colors, as an SGR foreground code', () => {
    expect(rgbToAnsi16(0, 0, 0)).toBe(30);
    expect(rgbToAnsi16(200, 10, 10)).toBe(31);       // red
    expect(rgbToAnsi16(255, 40, 40)).toBe(91);       // bright red
    expect(rgbToAnsi16(250, 250, 250)).toBe(97);     // bright white
    expect(rgbToAnsi16(120, 120, 120)).toBe(90);     // gray = bright black
  });

  test('sgr emits 24-bit by default, 256-color and 16-color codes on request', () => {
    const style = { fg: 'rgb(255, 0, 0)', bg: '#5f87af' };
    expect(sgr(style)).toBe('\x1b[38;2;255;0;0;48;2;95;135;175m');
    expect(sgr(style, { depth: 8 })).toBe('\x1b[38;5;196;48;5;67m');
    // #5f87af is a muted steel blue: of the 16, gray (127,127,127) is far nearer than pure blue (0,0,238).
    expect(sgr(style, { depth: 4 })).toBe('\x1b[91;100m');
  });

  test('named colors are 16-color codes at every depth', () => {
    for (const depth of [4, 8, 24] as const) expect(sgr({ fg: 'red', bg: 'gray' }, { depth })).toBe('\x1b[31;100m');
  });
});

describe('a selected cell', () => {
  // The band comes from `inverse` and the cell's own colors: the glyph's color
  // stays in the FOREGROUND slot and the terminal swaps it onto the band.
  test('emits inverse plus the cell\'s own color codes, in their own slots', () => {
    const style = selectedStyle({ fg: 'cyan', bg: '#3b0000', dim: true });
    expect(style).toEqual({ inverse: true, fg: 'cyan', bg: '#3b0000' });
    expect(sgr(style)).toBe('\x1b[7;36;48;2;59;0;0m');
    expect(sgr(style, { depth: 4 })).toBe('\x1b[7;36;40m');
    // A hex color downgrades through the same foreground mapping as any other.
    const hex = selectedStyle({ fg: '#ff0000' });
    expect(sgr(hex)).toBe('\x1b[7;38;2;255;0;0m');
    expect(sgr(hex, { depth: 8 })).toBe('\x1b[7;38;5;196m');
    expect(sgr(hex, { depth: 4 })).toBe('\x1b[7;91m');
    // `gray` and the bright names are foregrounds like any other.
    expect(sgr(selectedStyle({ fg: 'gray' }))).toBe('\x1b[7;90m');
    expect(sgr(selectedStyle({ fg: 'redBright' }))).toBe('\x1b[7;91m');
  });

  test('degrades to the plain band where color is off', () => {
    expect(sgr(selectedStyle({ fg: 'cyan' }), { color: false })).toBe('\x1b[7m');
    expect(sgr(selectedStyle({ fg: 'cyan', bold: true }), { color: false })).toBe('\x1b[1;7m');
  });
});
