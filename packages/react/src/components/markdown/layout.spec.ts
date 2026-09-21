import { describe, test, expect } from 'vitest';
import { layoutMarkdown, layoutMarkdownDetailed, type StyledLine } from './layout.js';

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

  test('fenced code gets a dim language label and a dim bar, and token-colors the body', () => {
    const lines = layoutMarkdown('```ts\nconst x = 1;\n```', 40);
    expect(lines.map(text)).toEqual(['ts', '│ const x = 1;']);
    expect(lines[0]!.spans).toEqual([{ text: 'ts', dim: true }]);
    const bar = lines[1]!.spans[0]!;
    expect(bar.text).toBe('│ ');
    expect(bar.dim).toBe(true);
    expect(bar.color).toBeUndefined();
    const kw = lines[1]!.spans.find((s) => s.text === 'const');
    expect(kw?.color).toBe('magenta');
    // The bar is the frame: the code itself is not dimmed along with it.
    expect(kw?.dim).toBeFalsy();
  });

  test('a block with neither language nor title has no label row', () => {
    expect(layoutMarkdown('```\nab\n```', 40).map(text)).toEqual(['│ ab']);
  });

  test('codeFence: \'literal\' keeps the old look — literal backticks, no bar', () => {
    const lines = layoutMarkdown('```ts\nconst x = 1;\n```', 40, { codeFence: 'literal' });
    expect(lines).toHaveLength(3);
    expect(text(lines[0]!)).toBe('```ts');
    expect(lines[0]!.spans.find((s) => s.text === '```ts')?.dim).toBe(true);
    expect(text(lines[1]!)).toBe('const x = 1;');
    expect(text(lines[2]!)).toBe('```');
    expect(lines[2]!.spans.find((s) => s.text === '```')?.dim).toBe(true);
    expect(lines[1]!.spans.find((s) => s.text === 'const')?.color).toBe('magenta');
  });

  test('the label shows the title, and the language beside it when both are given', () => {
    expect(text(layoutMarkdown('```ts title="src/app.ts"\nx\n```', 40)[0]!)).toBe('ts · src/app.ts');
    expect(text(layoutMarkdown('``` title="notes.txt"\nx\n```', 40)[0]!)).toBe('notes.txt');
  });

  test('codeWrap: \'truncate\' ends an over-long row with … in the style of the cut text', () => {
    const lines = layoutMarkdown("```ts\nconst s = 'aaaaaaaaaaaaaaaaaaaa';\n```", 20, { codeWrap: 'truncate' });
    expect(lines.map(text)).toEqual(['ts', "│ const s = 'aaaaaa…"]);
    const last = lines[1]!.spans[lines[1]!.spans.length - 1]!;
    expect(last.text.endsWith('…')).toBe(true);
    expect(last.color).toBe('green'); // the cut fell inside the string literal
  });

  test('maxCodeRows keeps the first rows and adds a dim "… N more lines" row behind the bar', () => {
    const lines = layoutMarkdown('```ts\na\nb\nc\nd\n```', 40, { maxCodeRows: 2 });
    expect(lines.map(text)).toEqual(['ts', '│ a', '│ b', '│ … 2 more lines']);
    const more = lines[3]!.spans.find((s) => s.text.includes('more'));
    expect(more?.dim).toBe(true);
    // Singular for a single hidden line.
    expect(layoutMarkdown('```ts\na\nb\nc\nd\n```', 40, { maxCodeRows: 3 }).map(text))
      .toEqual(['ts', '│ a', '│ b', '│ c', '│ … 1 more line']);
    // Under the limit, nothing is added.
    expect(layoutMarkdown('```ts\na\nb\n```', 40, { maxCodeRows: 9 }).map(text))
      .toEqual(['ts', '│ a', '│ b']);
  });

  test('lineNumbers puts dim right-aligned source numbers between the bar and the code', () => {
    const src = '```ts\n' + Array.from({ length: 10 }, (_, i) => `x${i}`).join('\n') + '\n```';
    const lines = layoutMarkdown(src, 40, { lineNumbers: true });
    expect(text(lines[1]!)).toBe('│  1 x0');
    expect(text(lines[10]!)).toBe('│ 10 x9');
    expect(lines[1]!.spans.find((s) => s.text.includes('1'))?.dim).toBe(true);
  });

  test('a wrapped continuation row keeps the bar and blanks the number gutter', () => {
    const lines = layoutMarkdown('```ts\nabcdefgh\n```', 8, { lineNumbers: true });
    expect(lines.map(text)).toEqual(['ts', '│ 1 abcd', '│   efgh']);
  });

  test('layoutMarkdownDetailed reports each fenced block with its raw source and line range', () => {
    const src = 'para\n\n```ts title="src/app.ts"\nconst x = 1;\nconst y = 2;\n```\n\nafter';
    const { lines, codeBlocks } = layoutMarkdownDetailed(src, 40);
    expect(lines.map(text)).toEqual([
      'para', '', 'ts · src/app.ts', '│ const x = 1;', '│ const y = 2;', '', 'after',
    ]);
    expect(codeBlocks).toEqual([{
      lang: 'ts',
      title: 'src/app.ts',
      source: 'const x = 1;\nconst y = 2;',
      startLine: 2,
      endLine: 5,
      closed: true,
    }]);
    // layoutMarkdown is the thin wrapper — same rows.
    expect(layoutMarkdown(src, 40).map(text)).toEqual(lines.map(text));
  });

  test('the reported source is the full block even when maxCodeRows hides rows', () => {
    const { codeBlocks } = layoutMarkdownDetailed('```ts\na\nb\nc\n```', 40, { maxCodeRows: 1 });
    expect(codeBlocks[0]!.source).toBe('a\nb\nc');
    expect(codeBlocks[0]!.endLine).toBe(3); // label + one row + the "more" row
  });

  test('an unclosed (still streaming) fence lays out as a code block, marked open', () => {
    const { lines, codeBlocks } = layoutMarkdownDetailed('```ts\nconst x = 1;', 40);
    expect(lines.map(text)).toEqual(['ts', '│ const x = 1;']);
    expect(codeBlocks[0]!.closed).toBe(false);
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
    // The label of a checked item is plain text — not struck through, not dimmed.
    const label = lines[1]!.spans.find((s) => s.text.includes('done'));
    expect(label?.dim).toBeFalsy();
    expect(label?.color).toBeUndefined();
  });

  test('nested task items render their own checkbox under the parent item\'s text', () => {
    const lines = layoutMarkdown('- [ ] outer\n  - [x] inner\n  - [ ] other\n- [x] last', 40);
    expect(lines.map(text)).toEqual(['☐ outer', '  ☑ inner', '  ☐ other', '☑ last']);
  });

  test('an ordered task item keeps its number before the checkbox', () => {
    expect(layoutMarkdown('1. [x] done\n2. [ ] todo', 40).map(text))
      .toEqual(['1. ☑ done', '2. ☐ todo']);
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

  test('table padding counts grid columns: a wide glyph is one, like any code point', () => {
    const lines = layoutMarkdown('| s | n |\n| - | - |\n| ✅ ok | 1 |\n| four | 2 |', 40);
    // "✅ ok" and "four" are both 4 code points, so their second cells start
    // at the same grid column (see the painted-grid test in Markdown.spec.tsx).
    expect(text(lines[2]!)).toBe('✅ ok  1');
    expect(text(lines[3]!)).toBe('four  2');
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

  test('an unbreakable long word in a table cell hard-wraps inside its column', () => {
    const lines = layoutMarkdown('| name | url |\n| - | - |\n| docs | https://example.com/a/very/long/path/index.html |', 30);
    expect(lines.map(text)).toEqual([
      'name  url',
      '────  ────────────────────────',
      'docs  https://example.com/a/ve',
      '      ry/long/path/index.html',
    ]);
  });

  test('wrapped lines of an aligned cell are each aligned, and no line exceeds the width', () => {
    const lines = layoutMarkdown('| k | value |\n| - | --: |\n| a | lorem ipsum dolor sit amet consectetur |', 30);
    expect(lines.map(text)).toEqual([
      'k                       value',
      '─  ──────────────────────────',
      'a  lorem ipsum dolor sit amet',
      '                  consectetur',
    ]);
    for (const l of lines) expect([...text(l)].length).toBeLessThanOrEqual(30);
  });

  test('wrapping counts grid columns, so wide glyphs fill the width like any code point', () => {
    const lines = layoutMarkdown('日本語 日本語 日本語', 8);
    expect(lines.map(text)).toEqual(['日本語 日本語', '日本語']);
  });

  test('a fenced code line longer than the width hard-wraps, keeping its token colors — it never overflows', () => {
    const lines = layoutMarkdown("```ts\nimport { render } from '@flowtty/react';\n```", 20);
    for (const l of lines) expect([...text(l)].length).toBeLessThanOrEqual(20);
    // The bar costs two cells, so the code wraps at 18.
    expect(lines.map(text)).toEqual(['ts', '│ import { render } ', "│ from '@flowtty/rea", '│ ct\';']);
    // `import` keeps its keyword color, and the string keeps its own across the break.
    expect(lines[1]!.spans.find((s) => s.text === 'import')?.color).toBe('magenta');
    expect(lines[2]!.spans.find((s) => s.text.includes('@flowtty'))?.color).toBe('green');
  });

  test('codeFence: \'literal\' hard-wraps at the full width, as before', () => {
    const lines = layoutMarkdown("```ts\nimport { render } from '@flowtty/react';\n```", 20, { codeFence: 'literal' });
    for (const l of lines) expect([...text(l)].length).toBeLessThanOrEqual(20);
    expect(lines.map(text)).toEqual(['```ts', 'import { render } fr', "om '@flowtty/react';", '```']);
    expect(lines[1]!.spans.find((s) => s.text === 'import')?.color).toBe('magenta');
    expect(lines[2]!.spans.find((s) => s.text.includes('@flowtty'))?.color).toBe('green');
  });

  test('a short code line is left alone, and an empty one is still a row behind the bar', () => {
    const lines = layoutMarkdown('```\nab\n\ncd\n```', 20);
    expect(lines.map(text)).toEqual(['│ ab', '│ ', '│ cd']);
    expect(layoutMarkdown('```\nab\n\ncd\n```', 20, { codeFence: 'literal' }).map(text))
      .toEqual(['```', 'ab', '', 'cd', '```']);
  });
});

// The faint bands a diff row wears. Kept here as literals on purpose: they are
// what an app sees, and a change to them should show up as a failing test.
const ADDED_BG = '#003b00';
const REMOVED_BG = '#3b0000';

const fence = (lang: string, ...lines: string[]) => ['```' + lang, ...lines, '```'].join('\n');

describe('fenced code: languages, diffs and numbering', () => {
  test('an unknown language is normal text — not dim — in both fence modes', () => {
    const bar = layoutMarkdown(fence('brainfuck', '+[-]>'), 40);
    expect(bar.map(text)).toEqual(['brainfuck', '│ +[-]>']);
    const body = bar[1]!.spans.filter((s) => s.text !== '│ ');
    expect(body.every((s) => !s.dim && s.color === undefined)).toBe(true);

    const literal = layoutMarkdown(fence('brainfuck', '+[-]>'), 40, { codeFence: 'literal' });
    expect(literal[1]!.spans.every((s) => !s.dim && s.color === undefined)).toBe(true);
  });

  test('a block with no language at all is normal text too', () => {
    const lines = layoutMarkdown(fence('', 'just some words'), 40);
    expect(lines.map(text)).toEqual(['│ just some words']);
    expect(lines[0]!.spans.filter((s) => s.text !== '│ ').every((s) => !s.dim && !s.color)).toBe(true);
  });

  test('added and removed rows wear a faint band across the full code width', () => {
    const lines = layoutMarkdown(fence('diff', '@@ -3,2 +3,3 @@', ' keep', '-gone', '+new'), 20);
    expect(lines.map(text)).toEqual([
      'diff',
      '│ @@ -3,2 +3,3 @@',
      '│  keep',
      '│ ' + '-gone'.padEnd(18),
      '│ ' + '+new'.padEnd(18),
    ]);
    // The band fills the row exactly — no cell short, none over the width.
    for (const l of lines.slice(3)) expect([...text(l)].length).toBe(20);

    const removed = lines[3]!;
    const added = lines[4]!;
    // The bar is the frame, not the band: it stays outside.
    expect(removed.spans[0]).toEqual({ text: '│ ', dim: true });
    expect(added.spans[0]).toEqual({ text: '│ ', dim: true });
    const banded = (l: StyledLine) => l.spans.filter((s) => s.background !== undefined);
    expect(banded(removed).map((s) => s.text).join('')).toBe('-gone'.padEnd(18));
    expect(banded(added).map((s) => s.text).join('')).toBe('+new'.padEnd(18));
    expect(new Set(banded(removed).map((s) => s.background))).toEqual(new Set([REMOVED_BG]));
    expect(new Set(banded(added).map((s) => s.background))).toEqual(new Set([ADDED_BG]));
    // The text keeps its own color on top of the band.
    expect(removed.spans.find((s) => s.text.startsWith('-gone'))?.color).toBe('red');
    expect(added.spans.find((s) => s.text.startsWith('+new'))?.color).toBe('green');
    // Hunk headers and context rows carry no band.
    expect(lines[1]!.spans.every((s) => s.background === undefined)).toBe(true);
    expect(lines[2]!.spans.every((s) => s.background === undefined)).toBe(true);
  });

  test('a wrapped continuation row keeps the band solid', () => {
    const lines = layoutMarkdown(fence('diff', '+aaaaaaaaaaaa'), 10);
    expect(lines.map(text)).toEqual(['diff', '│ +aaaaaaa', '│ ' + 'aaaaa'.padEnd(8)]);
    for (const l of lines.slice(1)) {
      expect(l.spans.filter((s) => s.background === ADDED_BG).map((s) => s.text).join('').length).toBe(8);
    }
  });

  test('a truncated row keeps its band, ellipsis included', () => {
    const lines = layoutMarkdown(fence('diff', '+' + 'a'.repeat(40)), 20, { codeWrap: 'truncate' });
    const row = lines[1]!;
    expect([...text(row)].length).toBe(20);
    expect(text(row).endsWith('…')).toBe(true);
    expect(row.spans[row.spans.length - 1]!.background).toBe(ADDED_BG);
  });

  test('diffBackground: false leaves the rows exactly as they would be without bands', () => {
    const src = fence('diff', '@@ -3,2 +3,3 @@', ' keep', '-gone', '+new');
    const off = layoutMarkdown(src, 20, { diffBackground: false });
    expect(off.map(text)).toEqual(['diff', '│ @@ -3,2 +3,3 @@', '│  keep', '│ -gone', '│ +new']);
    expect(off.flatMap((l) => l.spans).every((s) => s.background === undefined)).toBe(true);
    // The token colors are untouched — only the band is gone.
    expect(off[3]!.spans.find((s) => s.text === '-gone')?.color).toBe('red');
    expect(off[4]!.spans.find((s) => s.text === '+new')?.color).toBe('green');
  });

  test('the band only decorates: every row still reads as its source line', () => {
    // Under NO_COLOR a backend drops every color, background included — what is
    // left must still be the diff, so the `+` / `-` glyphs carry the meaning.
    const src = ['@@ -3,2 +3,3 @@', ' keep', '-gone', '+new'];
    const rows = layoutMarkdown(fence('diff', ...src), 20).slice(1);
    expect(rows.map((l) => text(l).slice(2).trimEnd())).toEqual(src);
  });

  test('lineNumbers on a diff counts from the hunk header: old for removed, new for the rest', () => {
    const lines = layoutMarkdown(
      fence('diff', '--- a/x.ts', '+++ b/x.ts', '@@ -10,3 +20,4 @@', ' ctx', '-gone', '+new', '+more', ' tail'),
      40,
      { lineNumbers: true },
    );
    expect(lines.map((l) => text(l).trimEnd())).toEqual([
      'diff',
      '│    --- a/x.ts',
      '│    +++ b/x.ts',
      '│    @@ -10,3 +20,4 @@',
      '│ 20  ctx',
      '│ 11 -gone',
      '│ 21 +new',
      '│ 22 +more',
      '│ 23  tail',
    ]);
  });

  test('a diff with no hunk header numbers nothing — it does not fall back to 1..N', () => {
    const lines = layoutMarkdown(fence('diff', 'diff --git a/x b/x', '-gone', '+new'), 40, { lineNumbers: true });
    expect(lines.map((l) => text(l).trimEnd())).toEqual([
      'diff',
      '│   diff --git a/x b/x',
      '│   -gone',
      '│   +new',
    ]);
  });

  test('a non-diff block keeps plain 1-based numbering', () => {
    const lines = layoutMarkdown(fence('ts', 'a', 'b'), 40, { lineNumbers: true });
    expect(lines.map(text)).toEqual(['ts', '│ 1 a', '│ 2 b']);
  });

  test('the label shows the word the author wrote, not the canonical language', () => {
    expect(text(layoutMarkdown(fence('ts', 'x'), 20)[0]!)).toBe('ts');
    expect(text(layoutMarkdown(fence('patch', '-x'), 20)[0]!)).toBe('patch');
  });

  test('an unlabeled block detected as a diff gets a dim `diff` label and diff colors', () => {
    const lines = layoutMarkdown(fence('', '@@ -1 +1 @@', '-a', '+b'), 20);
    expect(lines[0]!.spans).toEqual([{ text: 'diff', dim: true }]);
    expect(lines[2]!.spans.find((s) => s.text.startsWith('-a'))?.color).toBe('red');
    // Literal fences print what the author wrote, so nothing is added there.
    expect(text(layoutMarkdown(fence('', '@@ -1 +1 @@'), 20, { codeFence: 'literal' })[0]!)).toBe('```');
  });
});
