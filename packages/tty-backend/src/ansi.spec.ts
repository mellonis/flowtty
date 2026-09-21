import { expect, test, describe } from 'vitest';
import { NAMED_COLORS } from '@flowtty/core';
import { sgr, RESET, cursorTo, cellsEqual, parseColor, OSC8_CLOSE, osc8Open, takeUnknownColors, detectColorSupport } from './ansi.js';

describe('OSC 8 hyperlinks', () => {
  test('osc8Open wraps the URL in the OSC 8 open sequence with an ST terminator', () => {
    expect(osc8Open('https://x.dev')).toBe('\x1b]8;;https://x.dev\x1b\\');
  });

  test('OSC8_CLOSE is the empty-URL close sequence', () => {
    expect(OSC8_CLOSE).toBe('\x1b]8;;\x1b\\');
  });

  test('osc8Open strips control bytes so an embedded ESC/BEL cannot terminate early', () => {
    expect(osc8Open('http://x\x1b\x07/\x00y')).toBe('\x1b]8;;http://x/y\x1b\\');
  });

  test('cellsEqual treats a link difference as a change (link rides in Style)', () => {
    const a = { char: 'a', style: { link: 'http://x' } };
    const b = { char: 'a', style: { link: 'http://y' } };
    const c = { char: 'a', style: { link: 'http://x' } };
    expect(cellsEqual(a, b)).toBe(false);
    expect(cellsEqual(a, c)).toBe(true);
  });
});

test('sgr emits nothing for an empty style', () => {
  expect(sgr({})).toBe('');
});

test('sgr emits bold and a basic fg color', () => {
  expect(sgr({ bold: true })).toBe('\x1b[1m');
  expect(sgr({ fg: 'red' })).toBe('\x1b[31m');
  expect(sgr({ bold: true, fg: 'red' })).toBe('\x1b[1;31m');
});

test('RESET is the SGR reset', () => {
  expect(RESET).toBe('\x1b[0m');
});

test('sgr emits bg color codes (named, 40–47)', () => {
  expect(sgr({ bg: 'red' })).toBe('\x1b[41m');
  expect(sgr({ bg: 'blue' })).toBe('\x1b[44m');
  expect(sgr({ bold: true, fg: 'red', bg: 'blue' })).toBe('\x1b[1;31;44m');
});

test('sgr emits truecolor bg escape for #rrggbb (was ignored in M1d, now truecolor)', () => {
  expect(sgr({ bg: '#ff0000' })).toBe('\x1b[48;2;255;0;0m');
});

test('cursorTo(x, y) emits CSI cursor-position with 1-indexed row;col', () => {
  // ANSI cursor positioning is 1-indexed: (col 0, row 0) → CSI 1;1H
  expect(cursorTo(0, 0)).toBe('\x1b[1;1H');
  expect(cursorTo(5, 2)).toBe('\x1b[3;6H'); // row 3, col 6
  expect(cursorTo(0, 9)).toBe('\x1b[10;1H');
});

test('cellsEqual returns true for identical char + style', () => {
  expect(cellsEqual({ char: 'a', style: {} }, { char: 'a', style: {} })).toBe(true);
  expect(cellsEqual(
    { char: 'X', style: { bold: true, fg: 'red' } },
    { char: 'X', style: { bold: true, fg: 'red' } },
  )).toBe(true);
});

test('cellsEqual returns false when char differs', () => {
  expect(cellsEqual({ char: 'a', style: {} }, { char: 'b', style: {} })).toBe(false);
});

test('cellsEqual returns false when style differs', () => {
  expect(cellsEqual(
    { char: 'a', style: {} },
    { char: 'a', style: { bold: true } },
  )).toBe(false);
  expect(cellsEqual(
    { char: 'a', style: { fg: 'red' } },
    { char: 'a', style: { fg: 'blue' } },
  )).toBe(false);
});

describe('parseColor', () => {
  test('#rgb 3-digit hex expands each digit', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0 }); // f→ff, 8→88, 0→00
  });

  test('#rrggbb 6-digit hex parses each byte', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseColor('#1a2b3c')).toEqual({ r: 26, g: 43, b: 60 });
  });

  test('hex is case-insensitive', () => {
    expect(parseColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#AbCdEf')).toEqual({ r: 171, g: 205, b: 239 });
  });

  test('rgb(r, g, b) parses with or without whitespace', () => {
    expect(parseColor('rgb(255,128,0)')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseColor('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseColor('rgb( 255 , 128 , 0 )')).toEqual({ r: 255, g: 128, b: 0 });
  });

  test('returns null for named colors (caller falls through to named-color map)', () => {
    expect(parseColor('red')).toBeNull();
    expect(parseColor('white')).toBeNull();
  });

  test('returns null for malformed input', () => {
    expect(parseColor('#xyz')).toBeNull();
    expect(parseColor('#ff')).toBeNull();      // wrong length
    expect(parseColor('#ffff')).toBeNull();    // wrong length
    expect(parseColor('#fffffff')).toBeNull(); // wrong length
    expect(parseColor('rgb(1,2)')).toBeNull(); // wrong arity
    expect(parseColor('rgb(a,b,c)')).toBeNull();
    expect(parseColor('')).toBeNull();
  });

  test('returns null for out-of-range rgb values (no clamping)', () => {
    expect(parseColor('rgb(256, 0, 0)')).toBeNull();
    expect(parseColor('rgb(-1, 0, 0)')).toBeNull();
    expect(parseColor('rgb(300, 128, 0)')).toBeNull();
  });
});

describe('sgr truecolor', () => {
  test('fg with #rrggbb emits 24-bit foreground escape', () => {
    expect(sgr({ fg: '#ff0000' })).toBe('\x1b[38;2;255;0;0m');
  });

  test('bg with rgb(...) emits 24-bit background escape', () => {
    expect(sgr({ bg: 'rgb(0, 128, 255)' })).toBe('\x1b[48;2;0;128;255m');
  });

  test('fg + bg + bold combine in one escape', () => {
    // Order: existing sgr orders modifiers then fg then bg (verify against current impl)
    const out = sgr({ fg: '#ff8800', bg: 'rgb(0,0,128)', bold: true });
    expect(out).toContain('38;2;255;136;0');
    expect(out).toContain('48;2;0;0;128');
    expect(out).toContain('1'); // bold
    expect(out.startsWith('\x1b[')).toBe(true);
    expect(out.endsWith('m')).toBe(true);
  });

  test('named color still works (fallback path)', () => {
    expect(sgr({ fg: 'red' })).toBe('\x1b[31m');
    expect(sgr({ bg: 'blue' })).toBe('\x1b[44m');
  });

  test('unknown color value is silently ignored (no SGR emitted for it)', () => {
    // Neither parses as truecolor nor matches named map.
    expect(sgr({ fg: 'nonsense' })).toBe('');
    expect(sgr({ bg: '#xyz', bold: true })).toBe('\x1b[1m');
  });
});

test('sgr knows gray / grey and the bright variants, for fg and bg', () => {
  expect(sgr({ fg: 'gray' })).toBe('\x1b[90m');
  expect(sgr({ fg: 'grey' })).toBe('\x1b[90m');
  expect(sgr({ fg: 'blackBright' })).toBe('\x1b[90m');
  expect(sgr({ fg: 'redBright' })).toBe('\x1b[91m');
  expect(sgr({ fg: 'whiteBright' })).toBe('\x1b[97m');
  expect(sgr({ bg: 'gray' })).toBe('\x1b[100m');
  expect(sgr({ bg: 'cyanBright' })).toBe('\x1b[106m');
});

test('an unknown color name is ignored but remembered once, so a backend can report it on exit', () => {
  takeUnknownColors(); // reset
  expect(sgr({ fg: 'grayish', bg: 'grayish' })).toBe('');
  sgr({ fg: 'grayish' });
  sgr({ bg: 'default' }); // the "no background" sentinel is not a mistake
  expect(takeUnknownColors()).toEqual(['grayish']);
  expect(takeUnknownColors()).toEqual([]);
});

test('every named color from core has an SGR code, for fg and bg', () => {
  for (const name of NAMED_COLORS) {
    expect(sgr({ fg: name }), `fg ${name}`).toMatch(/^\x1b\[(3[0-7]|9[0-7])m$/);
    expect(sgr({ bg: name }), `bg ${name}`).toMatch(/^\x1b\[(4[0-7]|10[0-7])m$/);
  }
});

// ─── NO_COLOR / FORCE_COLOR ──────────────────────────────────────────────────

test('sgr with color off drops fg and bg but keeps the other attributes', () => {
  expect(sgr({ fg: 'red', bg: '#112233', bold: true, underline: true }, { color: false })).toBe('\x1b[1;4m');
  expect(sgr({ fg: 'red' }, { color: false })).toBe('');
  expect(sgr({ inverse: true, dim: true }, { color: false })).toBe('\x1b[2;7m');
});

test('detectColorSupport: NO_COLOR (any non-empty value) turns color off; FORCE_COLOR wins over it', () => {
  expect(detectColorSupport({})).toBe(true);
  expect(detectColorSupport({ NO_COLOR: '1' })).toBe(false);
  expect(detectColorSupport({ NO_COLOR: 'true' })).toBe(false);
  expect(detectColorSupport({ NO_COLOR: '' })).toBe(true);           // per no-color.org: present AND non-empty
  expect(detectColorSupport({ NO_COLOR: '1', FORCE_COLOR: '1' })).toBe(true);
  expect(detectColorSupport({ FORCE_COLOR: '0' })).toBe(false);
  expect(detectColorSupport({ NO_COLOR: '1', FORCE_COLOR: '0' })).toBe(false);
});
