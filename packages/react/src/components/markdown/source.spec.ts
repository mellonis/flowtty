import { describe, test, expect } from 'vitest';
import { highlightMarkdownSource, type SourceLine } from './source.js';

const text = (l: SourceLine) => l.spans.map((s) => s.text).join('');
const allText = (ls: SourceLine[]) => ls.map(text).join('\n');

describe('highlightMarkdownSource', () => {
  test('preserves the source byte-for-byte (markers kept)', () => {
    const src = '# Title\n\n- **bold** and *em* and `code`\n\nplain [docs](http://x) tail';
    const lines = highlightMarkdownSource(src, 80, false);
    expect(allText(lines)).toBe(src);
  });

  test('heading keeps its # marker dim and styles the text bold + level color', () => {
    const [line] = highlightMarkdownSource('## Heading', 80, false);
    expect(text(line!)).toBe('## Heading');
    const hash = line!.spans.find((s) => s.text.startsWith('#'));
    expect(hash?.dim).toBe(true);
    const word = line!.spans.find((s) => s.text.includes('Heading'));
    expect(word?.bold).toBe(true);
    expect(word?.color).toBe('cyan');
  });

  test('bold keeps the ** markers (dim) and bolds the inner text', () => {
    const [line] = highlightMarkdownSource('a **strong** b', 80, false);
    expect(text(line!)).toBe('a **strong** b');
    const inner = line!.spans.find((s) => s.text === 'strong');
    expect(inner?.bold).toBe(true);
    const marker = line!.spans.find((s) => s.text === '**');
    expect(marker?.dim).toBe(true);
  });

  test('link keeps brackets/url and styles the label blue + underline', () => {
    const [line] = highlightMarkdownSource('see [docs](http://x)', 80, false);
    expect(text(line!)).toBe('see [docs](http://x)');
    const label = line!.spans.find((s) => s.text === 'docs');
    expect(label?.color).toBe('blue');
    expect(label?.underline).toBe(true);
    // The closing `](`, url and `)` coalesce into one dim span.
    const url = line!.spans.find((s) => s.text.includes('http://x'));
    expect(url?.dim).toBe(true);
  });

  test('list marker is colored yellow, marker text preserved', () => {
    const [line] = highlightMarkdownSource('- item one', 80, false);
    expect(text(line!)).toBe('- item one');
    const marker = line!.spans.find((s) => s.text.startsWith('-'));
    expect(marker?.color).toBe('yellow');
  });

  test('fenced code: fences dim, body token-colored, fences printed literally', () => {
    const lines = highlightMarkdownSource('```ts\nconst x = 1;\n```', 80, false);
    expect(lines.map(text)).toEqual(['```ts', 'const x = 1;', '```']);
    expect(lines[0]!.spans.every((s) => s.dim)).toBe(true);
    const kw = lines[1]!.spans.find((s) => s.text === 'const');
    expect(kw?.color).toBe('magenta');
  });

  test('code indentation is preserved literally (no word-collapsing)', () => {
    const lines = highlightMarkdownSource('```js\n  if (x) {\n    return 1;\n  }\n```', 80, false);
    expect(lines.map(text)).toEqual(['```js', '  if (x) {', '    return 1;', '  }', '```']);
  });

  test('hard char-wrap preserves all characters and flags continuation lineNum', () => {
    const lines = highlightMarkdownSource('abcdefghij', 4, true);
    expect(lines.map(text)).toEqual(['abcd', 'efgh', 'ij']);
    expect(lines[0]!.lineNum).toBe(1);
    expect(lines[1]!.lineNum).toBe(null);
    expect(lines[2]!.lineNum).toBe(null);
  });

  test('nowrap emits one row per source line with sequential lineNums', () => {
    const lines = highlightMarkdownSource('alpha\nbeta\ngamma', 3, false);
    expect(lines.map((l) => l.lineNum)).toEqual([1, 2, 3]);
    expect(lines.map(text)).toEqual(['alpha', 'beta', 'gamma']);
  });
});
