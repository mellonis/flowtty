import { describe, test, expect } from 'vitest';
import { layoutMarkdown, type StyledLine } from './layout.js';

// Flatten a line's spans back to plain text for content assertions.
const text = (l: StyledLine) => l.spans.map((s) => s.text).join('');
const allText = (ls: StyledLine[]) => ls.map(text).join('\n');

describe('layoutMarkdown', () => {
  test('headings render bold with the level color and dim # prefix', () => {
    const [line] = layoutMarkdown('## Title', 40);
    expect(text(line!)).toBe('## Title');
    const hash = line!.spans.find((s) => s.text.startsWith('#'));
    expect(hash?.dim).toBe(true);
    const word = line!.spans.find((s) => s.text.includes('Title'));
    expect(word?.bold).toBe(true);
    expect(word?.color).toBe('cyan');
  });

  test('word-wraps a paragraph to the given width', () => {
    const lines = layoutMarkdown('one two three four five', 9);
    // Every produced line must fit within the width.
    for (const l of lines) expect(text(l).length).toBeLessThanOrEqual(9);
    expect(allText(lines).replace(/\n/g, ' ')).toBe('one two three four five');
  });

  test('inline styles survive wrapping (bold span keeps its flag)', () => {
    const lines = layoutMarkdown('plain **strong words here** tail', 12);
    const bold = lines.flatMap((l) => l.spans).filter((s) => s.bold);
    expect(bold.map((s) => s.text).join('')).toContain('strong');
  });

  test('list markers get a hanging indent on wrapped continuation lines', () => {
    const lines = layoutMarkdown('- alpha beta gamma delta', 12);
    expect(lines[0]!.spans[0]!.text).toBe('• ');
    // Continuation line is indented by the marker width, not a second bullet.
    expect(lines[1]!.spans[0]!.text).toBe('  ');
  });

  test('fenced code prints the fences (dim, no indent) and token-colors the body', () => {
    const lines = layoutMarkdown('```ts\nconst x = 1;\n```', 40);
    expect(lines).toHaveLength(3);
    expect(text(lines[0]!)).toBe('```ts');
    expect(lines[0]!.spans.find((s) => s.text === '```ts')?.dim).toBe(true);
    expect(text(lines[2]!)).toBe('```');
    const kw = lines[1]!.spans.find((s) => s.text === 'const');
    expect(kw?.color).toBe('magenta');
  });

  test('inserts blank spacer lines between blocks', () => {
    const lines = layoutMarkdown('# H\n\npara', 40);
    expect(lines.map(text)).toEqual(['# H', '', 'para']);
  });

  test('links are blue + underlined and carry the OSC 8 target', () => {
    const lines = layoutMarkdown('see [docs](http://x)', 40);
    const link = lines.flatMap((l) => l.spans).find((s) => s.text.includes('docs'));
    expect(link?.color).toBe('blue');
    expect(link?.underline).toBe(true);
    expect(link?.link).toBe('http://x');
  });

  test('a code-labelled link renders as code (cyan), underlined + clickable, no backticks', () => {
    const lines = layoutMarkdown('[`pkg`](http://x)', 40);
    const span = lines.flatMap((l) => l.spans).find((s) => s.text === 'pkg');
    expect(span).toBeDefined();           // backticks consumed, not shown literally
    expect(span?.color).toBe('cyan');
    expect(span?.underline).toBe(true);
    expect(span?.link).toBe('http://x');
  });
});
