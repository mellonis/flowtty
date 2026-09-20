import { describe, test, expect } from 'vitest';
import { parseInline, parseMarkdown, highlightCode } from './parse.js';

describe('parseInline', () => {
  test('splits bold / emphasis / code / link runs', () => {
    const segs = parseInline('a **b** c *d* e `f` g [h](http://x)');
    expect(segs).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c ' },
      { text: 'd', emphasis: true },
      { text: ' e ' },
      { text: 'f', code: true },
      { text: ' g ' },
      { text: 'h', link: 'http://x' },
    ]);
  });

  test('leaves snake_case underscores alone (asterisk-only emphasis)', () => {
    expect(parseInline('use snake_case_here')).toEqual([{ text: 'use snake_case_here' }]);
  });

  test('parses images to a placeholder seg with the alt text', () => {
    const segs = parseInline('see ![a cat](/cat.webp) here');
    expect(segs).toEqual([
      { text: 'see ' },
      { text: 'a cat', image: true },
      { text: ' here' },
    ]);
  });

  test('image with empty alt falls back to the src', () => {
    expect(parseInline('![](/x.png)')).toEqual([{ text: '/x.png', image: true }]);
  });

  test('parses inline markup inside a link label (markers not leaked literally)', () => {
    expect(parseInline('[`pkg`](http://x)')).toEqual([
      { text: 'pkg', code: true, link: 'http://x' },
    ]);
    expect(parseInline('[**bold**](http://x)')).toEqual([
      { text: 'bold', bold: true, link: 'http://x' },
    ]);
  });
});

describe('parseMarkdown', () => {
  test('headings carry their level', () => {
    const blocks = parseMarkdown('# One\n\n### Three');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, segs: [{ text: 'One' }] },
      { kind: 'heading', level: 3, segs: [{ text: 'Three' }] },
    ]);
  });

  test('joins consecutive lines into one paragraph', () => {
    const blocks = parseMarkdown('hello\nworld');
    expect(blocks).toEqual([{ kind: 'paragraph', segs: [{ text: 'hello world' }] }]);
  });

  test('fenced code keeps lang and raw lines', () => {
    const blocks = parseMarkdown('```ts\nconst x = 1;\n```');
    expect(blocks).toEqual([{ kind: 'code', lang: 'ts', lines: ['const x = 1;'] }]);
  });

  test('unordered and ordered lists', () => {
    const ul = parseMarkdown('- a\n- b');
    expect(ul).toEqual([{ kind: 'list', ordered: false, items: [{ segs: [{ text: 'a' }] }, { segs: [{ text: 'b' }] }] }]);
    const ol = parseMarkdown('1. a\n2. b');
    expect(ol).toEqual([{ kind: 'list', ordered: true, items: [{ segs: [{ text: 'a' }], num: 1 }, { segs: [{ text: 'b' }], num: 2 }] }]);
  });

  test('ordered items keep their source number', () => {
    const [list] = parseMarkdown('3. c\n7. g');
    expect(list).toEqual({ kind: 'list', ordered: true, items: [{ segs: [{ text: 'c' }], num: 3 }, { segs: [{ text: 'g' }], num: 7 }] });
  });

  test('an indented run nests under the preceding item instead of splitting the list', () => {
    const blocks = parseMarkdown('1. one\n2. two\n   - sub a\n   - sub b\n3. three');
    expect(blocks).toEqual([{
      kind: 'list', ordered: true, items: [
        { segs: [{ text: 'one' }], num: 1 },
        {
          segs: [{ text: 'two' }], num: 2,
          children: [{ ordered: false, items: [{ segs: [{ text: 'sub a' }] }, { segs: [{ text: 'sub b' }] }] }],
        },
        { segs: [{ text: 'three' }], num: 3 },
      ],
    }]);
  });

  test('nesting goes more than one level deep and unwinds on dedent', () => {
    const [list] = parseMarkdown('- a\n  - b\n    - c\n  - d\n- e');
    expect(list).toEqual({
      kind: 'list', ordered: false, items: [
        {
          segs: [{ text: 'a' }],
          children: [{
            ordered: false, items: [
              { segs: [{ text: 'b' }], children: [{ ordered: false, items: [{ segs: [{ text: 'c' }] }] }] },
              { segs: [{ text: 'd' }] },
            ],
          }],
        },
        { segs: [{ text: 'e' }] },
      ],
    });
  });

  test('a marker-type switch inside a nested run starts a sibling sub-list', () => {
    const [list] = parseMarkdown('- a\n  - b\n  1. c');
    expect(list).toEqual({
      kind: 'list', ordered: false, items: [{
        segs: [{ text: 'a' }],
        children: [
          { ordered: false, items: [{ segs: [{ text: 'b' }] }] },
          { ordered: true, items: [{ segs: [{ text: 'c' }], num: 1 }] },
        ],
      }],
    });
  });

  test('a marker-type switch at the top level still starts a new list block', () => {
    const blocks = parseMarkdown('- a\n1. b');
    expect(blocks.map((b) => b.kind === 'list' && b.ordered)).toEqual([false, true]);
  });

  test('nested task items keep their checked state', () => {
    const [list] = parseMarkdown('- parent\n  - [x] done');
    expect(list).toEqual({
      kind: 'list', ordered: false, items: [{
        segs: [{ text: 'parent' }],
        children: [{ ordered: false, items: [{ segs: [{ text: 'done' }], checked: true }] }],
      }],
    });
  });

  test('GFM task-list items carry checked state; non-standard markers stay literal', () => {
    const list = parseMarkdown('- [ ] todo\n- [x] done\n- [X] also\n- [v] literal');
    expect(list).toEqual([{
      kind: 'list', ordered: false, items: [
        { segs: [{ text: 'todo' }], checked: false },
        { segs: [{ text: 'done' }], checked: true },
        { segs: [{ text: 'also' }], checked: true },
        { segs: [{ text: '[v] literal' }] }, // [v] is not a GFM marker
      ],
    }]);
  });

  test('a GFM table becomes a table block with inline-parsed cells', () => {
    const blocks = parseMarkdown('| Name | Qty |\n| --- | --- |\n| **apple** | 3 |\n| pear | 10 |');
    expect(blocks).toEqual([{
      kind: 'table',
      align: [undefined, undefined],
      header: [[{ text: 'Name' }], [{ text: 'Qty' }]],
      rows: [
        [[{ text: 'apple', bold: true }], [{ text: '3' }]],
        [[{ text: 'pear' }], [{ text: '10' }]],
      ],
    }]);
  });

  test('table column alignment comes from the separator row', () => {
    const [t] = parseMarkdown('| a | b | c | d |\n| :-- | :-: | --: | --- |\n| 1 | 2 | 3 | 4 |');
    expect(t!.kind === 'table' && t!.align).toEqual(['left', 'center', 'right', undefined]);
  });

  test('table rows work without edge pipes', () => {
    const [t] = parseMarkdown('a | b\n--- | ---\n1 | 2');
    expect(t).toEqual({
      kind: 'table', align: [undefined, undefined],
      header: [[{ text: 'a' }], [{ text: 'b' }]],
      rows: [[[{ text: '1' }], [{ text: '2' }]]],
    });
  });

  test('short table rows are padded and long ones truncated to the header width', () => {
    const [t] = parseMarkdown('| a | b |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |');
    expect(t!.kind === 'table' && t!.rows).toEqual([
      [[{ text: '1' }], [{ text: '' }]],
      [[{ text: '1' }], [{ text: '2' }]],
    ]);
  });

  test('a pipe inside inline code or escaped with a backslash does not split the cell', () => {
    const [t] = parseMarkdown('| a | b |\n| - | - |\n| `x | y` | p \\| q |');
    expect(t!.kind === 'table' && t!.rows).toEqual([
      [[{ text: 'x | y', code: true }], [{ text: 'p | q' }]],
    ]);
  });

  test('a table ends at a blank line and interrupts a preceding paragraph', () => {
    const blocks = parseMarkdown('intro\n| a |\n| - |\n| 1 |\n\nafter');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
  });

  test('a pipe line without a matching separator row stays a paragraph', () => {
    expect(parseMarkdown('a | b\nc | d').map((b) => b.kind)).toEqual(['paragraph']);
    // Separator column count must match the header's.
    expect(parseMarkdown('a | b\n---').map((b) => b.kind)).toEqual(['paragraph', 'hr']);
  });

  test('blockquote and hr', () => {
    expect(parseMarkdown('> quoted')).toEqual([{ kind: 'blockquote', segs: [{ text: 'quoted' }] }]);
    expect(parseMarkdown('---')).toEqual([{ kind: 'hr' }]);
  });
});

describe('highlightCode', () => {
  test('colors js keywords / strings / numbers', () => {
    const segs = highlightCode("const x = 'hi';", 'ts');
    expect(segs.find((s) => s.text === 'const')?.color).toBe('magenta');
    expect(segs.find((s) => s.text === "'hi'")?.color).toBe('green');
  });

  test('json keys vs strings', () => {
    const segs = highlightCode('"k": "v"', 'json');
    expect(segs.find((s) => s.text.startsWith('"k"'))?.color).toBe('cyan');
    expect(segs.find((s) => s.text === '"v"')?.color).toBe('green');
  });

  test('unknown language is dimmed verbatim', () => {
    expect(highlightCode('whatever', 'rust')).toEqual([{ text: 'whatever', dim: true }]);
  });
});
