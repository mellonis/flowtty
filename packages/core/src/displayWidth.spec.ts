import { describe, test, expect } from 'vitest';
import { charWidth, stringWidth } from './displayWidth.js';

describe('charWidth', () => {
  test('ASCII and Latin printable are width 1', () => {
    expect(charWidth(0x41)).toBe(1);      // 'A'
    expect(charWidth(0x20)).toBe(1);      // space
    expect(charWidth(0x7e)).toBe(1);      // '~'
    expect(charWidth(0xe9)).toBe(1);      // 'é' (precomposed)
  });

  test('C0/C1 control and DEL are width 0', () => {
    expect(charWidth(0x00)).toBe(0);
    expect(charWidth(0x09)).toBe(0);      // tab
    expect(charWidth(0x1b)).toBe(0);      // ESC
    expect(charWidth(0x7f)).toBe(0);      // DEL
    expect(charWidth(0x9b)).toBe(0);      // C1
  });

  test('East Asian Wide / Fullwidth are width 2', () => {
    expect(charWidth(0x4e00)).toBe(2);    // 一 CJK
    expect(charWidth(0x3042)).toBe(2);    // あ Hiragana
    expect(charWidth(0xac00)).toBe(2);    // 가 Hangul syllable
    expect(charWidth(0xff21)).toBe(2);    // Ａ fullwidth A
    expect(charWidth(0x1f600)).toBe(2);   // 😀 emoji
  });

  test('halfwidth katakana stays width 1 (not caught by the fullwidth block)', () => {
    expect(charWidth(0xff66)).toBe(1);    // ﾦ halfwidth katakana
    expect(charWidth(0xff9f)).toBe(1);
  });

  test('combining marks, zero-width and variation selectors are width 0', () => {
    expect(charWidth(0x0301)).toBe(0);    // combining acute accent
    expect(charWidth(0x200b)).toBe(0);    // zero-width space
    expect(charWidth(0x200d)).toBe(0);    // ZWJ
    expect(charWidth(0xfe0f)).toBe(0);    // variation selector-16
    expect(charWidth(0xfeff)).toBe(0);    // BOM / ZWNBSP
  });
});

describe('stringWidth', () => {
  test('plain ASCII is its code-point length', () => {
    expect(stringWidth('hello')).toBe(5);
    expect(stringWidth('')).toBe(0);
  });

  test('CJK counts double', () => {
    expect(stringWidth('日本語')).toBe(6);
    expect(stringWidth('aあb')).toBe(4);  // 1 + 2 + 1
  });

  test('decomposed accents do not add width', () => {
    // 'e' + combining acute → 1 cell, not 2
    expect(stringWidth('é')).toBe(1);
    expect(stringWidth('café')).toBe(4);
  });

  test('counts astral (surrogate-pair) code points once at their true width', () => {
    expect(stringWidth('😀')).toBe(2);    // one emoji code point, width 2
    expect(stringWidth('a😀b')).toBe(4);
  });

  test('control characters contribute nothing', () => {
    expect(stringWidth('a\tb')).toBe(2);
    expect(stringWidth('\x1b[0m')).toBe(3); // ESC=0, then '[', '0', 'm'
  });
});
