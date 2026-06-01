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
    expect(ol).toEqual([{ kind: 'list', ordered: true, items: [{ segs: [{ text: 'a' }] }, { segs: [{ text: 'b' }] }] }]);
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
