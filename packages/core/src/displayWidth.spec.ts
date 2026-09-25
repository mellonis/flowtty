import { describe, test, expect } from 'vitest';
import { charWidth } from './displayWidth.js';

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
    expect(charWidth(0x2705)).toBe(2);    // ✅ — a BMP emoji that is East Asian Wide
    expect(charWidth(0x274c)).toBe(2);    // ❌
    expect(charWidth(0x26a1)).toBe(2);    // ⚡
    expect(charWidth(0x1f680)).toBe(2);   // 🚀 Transport & Map
    expect(charWidth(0x2714)).toBe(1);    // ✔ — text-presentation dingbat stays narrow
    expect(charWidth(0x2611)).toBe(1);    // ☑
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
