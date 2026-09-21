import { describe, expect, test } from 'vitest';
import { highlightBlock, resolveLanguage, HIGHLIGHTED_LANGUAGES } from './index.js';

const LABELS = HIGHLIGHTED_LANGUAGES.flatMap((l) => [l.name, ...l.aliases]);

describe('the language table', () => {
  test('every name and every alias resolves to its language', () => {
    for (const lang of HIGHLIGHTED_LANGUAGES) {
      expect(resolveLanguage(lang.name)).toBe(lang.name);
      for (const alias of lang.aliases) expect(resolveLanguage(alias)).toBe(lang.name);
      expect(resolveLanguage(lang.name.toUpperCase())).toBe(lang.name);
    }
  });

  test('no label is claimed twice and every entry describes itself', () => {
    expect(new Set(LABELS).size).toBe(LABELS.length);
    for (const lang of HIGHLIGHTED_LANGUAGES) {
      expect(lang.name).toMatch(/^[a-z+#-]+$/);
      expect(lang.colors.length).toBeGreaterThan(10);
    }
  });
});

// Inputs chosen to break a tokenizer: things left open at the end of the line,
// a lone `<`, characters outside the BMP, and one very long line.
const NASTY: readonly string[][] = [
  [''],
  ['', '', ''],
  ['   '],
  ["const s = 'never closed"],
  ['/* never closed', 'still going'],
  ['"""', "'''", '```'],
  ['a < b > c <'],
  ['<!-- <![CDATA[ <?xml'],
  ['<div class="'],
  ['{ "k": '],
  ['# only a comment'],
  ['-- a', '--- b', '+++ c', '@@ x'],
  ['\t\tindented\tby\ttabs'],
  ['héllo — wörld 🌍 𝒳 👨‍👩‍👧‍👦 ́'],
  // Astral characters next to a differently-styled token: the boundary between
  // the keyword / string / tag and the pair is where a split would show up.
  ['const 🌍 = "𝒳";'],
  ['# 🌍', '"""𝒳', 'x = 🌍𝒳'],
  ['<p>🌍</p>', 'a🌍b < c'],
  ['🌍'.repeat(200)],
  ['x'.repeat(5000)],
  ['a'.repeat(1000) + '"' + 'b'.repeat(1000)],
  ['\\'],
  ['}}}{{{'],
  ['@@@ ### $$$ %%% ^^^ &&& *** ((( ))) ~~~ ``` ||| \\\\\\'],
];

const HIGH_SURROGATE = /[\uD800-\uDBFF]$/;
const LOW_SURROGATE = /^[\uDC00-\uDFFF]/;

describe('every language survives every nasty input', () => {
  for (const label of [...LABELS, '', 'text', 'not-a-language']) {
    test(`\`${label}\` re-joins to its input and never throws`, () => {
      for (const lines of NASTY) {
        const out = highlightBlock(lines, label);
        expect(out).toHaveLength(lines.length);
        expect(out.map((l) => l.segs.map((s) => s.text).join(''))).toEqual([...lines]);
        for (const line of out) {
          expect(line.segs.length).toBeGreaterThan(0);
          for (const s of line.segs) {
            // A split surrogate pair would join back correctly but paint wrong.
            expect(HIGH_SURROGATE.test(s.text)).toBe(false);
            expect(LOW_SURROGATE.test(s.text)).toBe(false);
          }
        }
      }
    });
  }
});

describe('performance', () => {
  test('5,000 lines of TypeScript highlight in well under a second', () => {
    const unit = [
      'import { readFile } from "node:fs/promises"; // io',
      '/** A doc comment with `code` and <angle> brackets. */',
      'export async function load<T>(path: string): Promise<T> {',
      '  const raw = await readFile(path, "utf8");',
      '  return JSON.parse(raw) as T;',
      '}',
      'const view = () => <Box flex={1}>{items.map((i) => <Item key={i.id} />)}</Box>;',
      '',
      '/* a block comment',
      '   that spans lines */',
    ];
    const lines = Array.from({ length: 5000 }, (_, i) => unit[i % unit.length]!);
    const start = performance.now();
    const out = highlightBlock(lines, 'tsx');
    const ms = performance.now() - start;
    expect(out).toHaveLength(5000);
    expect(ms).toBeLessThan(500);
  });
});
