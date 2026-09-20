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

  test('GFM task-list items render checkbox glyphs (☑ checked / ☐ unchecked)', () => {
    const lines = layoutMarkdown('- [ ] todo\n- [x] done', 40);
    expect(text(lines[0]!)).toBe('☐ todo');
    expect(text(lines[1]!)).toBe('☑ done');
    // Checked box is green; unchecked uses the default color.
    const checked = lines[1]!.spans.find((s) => s.text.startsWith('☑'));
    expect(checked?.color).toBe('green');
  });

  test('emphasis underline runs continuously across an interword space', () => {
    const [line] = layoutMarkdown('*bare state*', 40);
    // The whole run — including the space — is one underlined span, not
    // "bare" + plain " " + "state".
    const span = line!.spans.find((s) => s.text.includes('bare'));
    expect(span?.text).toBe('bare state');
    expect(span?.underline).toBe(true);
    // No unstyled gap span splits the run.
    expect(line!.spans.filter((s) => s.underline)).toHaveLength(1);
  });

  test('a multi-word link underlines continuously across its interword space', () => {
    const [line] = layoutMarkdown('[bare state](http://x)', 40);
    const span = line!.spans.find((s) => s.text.includes('bare'));
    expect(span?.text).toBe('bare state'); // single span, space included
    expect(span?.underline).toBe(true);
    expect(span?.link).toBe('http://x');
  });

  test('a code-labelled link renders as code (cyan), underlined + clickable, no backticks', () => {
    const lines = layoutMarkdown('[`pkg`](http://x)', 40);
    const span = lines.flatMap((l) => l.spans).find((s) => s.text === 'pkg');
    expect(span).toBeDefined();           // backticks consumed, not shown literally
    expect(span?.color).toBe('cyan');
    expect(span?.underline).toBe(true);
    expect(span?.link).toBe('http://x');
  });

  test('nested list items indent to the parent item\'s content column', () => {
    const lines = layoutMarkdown('1. one\n2. two\n   - sub a\n   - sub b\n3. three', 40);
    expect(lines.map(text)).toEqual([
      '1. one',
      '2. two',
      '   • sub a',
      '   • sub b',
      '3. three',
    ]);
  });

  test('a wrapped nested item hangs under its own text, not under the parent', () => {
    const lines = layoutMarkdown('- a\n  - alpha beta gamma', 14);
    expect(lines.map(text)).toEqual(['• a', '  • alpha beta', '    gamma']);
  });

  test('ordered lists print the source numbers', () => {
    expect(layoutMarkdown('3. c\n4. d\n9. i', 40).map(text)).toEqual(['3. c', '4. d', '9. i']);
  });

  test('lazy numbering (every item the same number) counts up from that number', () => {
    expect(layoutMarkdown('1. a\n1. b\n1. c', 40).map(text)).toEqual(['1. a', '2. b', '3. c']);
  });

  test('a table renders as padded columns with a bold header and a dim rule', () => {
    const lines = layoutMarkdown('| Name | Qty |\n| --- | --- |\n| apple | 3 |\n| kiwi | 10 |', 40);
    expect(lines.map(text)).toEqual([
      'Name   Qty',
      '─────  ───',
      'apple  3',
      'kiwi   10',
    ]);
    expect(lines[0]!.spans.find((s) => s.text.includes('Name'))?.bold).toBe(true);
    expect(lines[1]!.spans.every((s) => s.dim || s.text.trim() === '')).toBe(true);
  });

  test('table cells keep inline styles', () => {
    const lines = layoutMarkdown('| k | v |\n| - | - |\n| **b** | `c` |', 40);
    const spans = lines[2]!.spans;
    expect(spans.find((s) => s.text === 'b')?.bold).toBe(true);
    expect(spans.find((s) => s.text === 'c')?.color).toBe('cyan');
  });

  test('table columns honor right and center alignment', () => {
    const lines = layoutMarkdown('| left | right | mid |\n| :-- | --: | :-: |\n| a | b | c |', 40);
    expect(text(lines[2]!)).toBe('a         b   c');
  });

  test('table column widths are measured in display cells (wide glyphs count 2)', () => {
    const lines = layoutMarkdown('| s | n |\n| - | - |\n| ✅ ok | 1 |\n| plain | 2 |', 40);
    // "✅ ok" is 5 cells wide, same as "plain": both second cells start in one column.
    expect(text(lines[2]!)).toBe('✅ ok  1');
    expect(text(lines[3]!)).toBe('plain  2');
  });

  test('a table wider than the width shrinks its widest column and wraps the cell', () => {
    const lines = layoutMarkdown('| id | note |\n| - | - |\n| 1 | alpha beta gamma |', 14);
    expect(lines.map(text)).toEqual([
      'id  note',
      '──  ──────────',
      '1   alpha beta',
      '    gamma',
    ]);
  });

  test('paragraph wrapping counts wide glyphs as two cells', () => {
    const lines = layoutMarkdown('日本語 日本語', 8);
    expect(lines.map(text)).toEqual(['日本語', '日本語']);
  });
});
