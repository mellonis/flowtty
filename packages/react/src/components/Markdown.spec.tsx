import React, { useEffect, useState } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Markdown } from './Markdown.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import type { MarkdownCodeBlock } from './markdown/layout.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

describe('Markdown', () => {
  test('renders headings, paragraphs and lists as text', async () => {
    const backend = new TestBackend(40, 12);
    const md = '# Hello\n\nA short *para* with `code`.\n\n- one\n- two';
    const r = await render(<Markdown width={38}>{md}</Markdown>, backend);
    await flushAsync(backend);

    const frame = backend.lastFrame;
    expect(frame).toContain('Hello');
    expect(frame).toContain('para');
    expect(frame).toContain('code');
    expect(frame).toContain('• one');
    expect(frame).toContain('• two');
    r.unmount();
  });

  test('measures its own width when none is given', async () => {
    const backend = new TestBackend(24, 6);
    const r = await render(<Markdown>{'one two three four five six seven'}</Markdown>, backend);
    await flushAsync(backend);
    // No explicit width → wraps to the 24-col surface (more than one row).
    const rows = backend.lastFrame.split('\n').filter((l) => l.trim() !== '');
    expect(rows.length).toBeGreaterThan(1);
    r.unmount();
  });

  test('a markdown link threads its URL into the painted cell style (OSC 8)', async () => {
    const backend = new TestBackend(40, 3);
    const r = await render(<Markdown width={38}>{'see [docs](http://x.dev)'}</Markdown>, backend);
    await flushAsync(backend);
    const buf = backend.lastBuffer!;
    let linkCell: string | undefined;
    for (let y = 0; y < buf.height && linkCell === undefined; y++) {
      for (let x = 0; x < buf.width; x++) {
        const s = buf.get(x, y).style;
        if (s.link) { linkCell = s.link; break; }
      }
    }
    expect(linkCell).toBe('http://x.dev');
    r.unmount();
  });

  test('renders fenced code behind the quiet bar, with a dim language label', async () => {
    const backend = new TestBackend(40, 6);
    const r = await render(<Markdown width={38}>{'```ts\nconst x = 1;\n```'}</Markdown>, backend);
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n').map((l) => l.trimEnd());
    expect(rows[0]).toBe('ts');
    expect(rows[1]).toBe('│ const x = 1;');
    r.unmount();
  });

  test('a diff block paints a solid band behind its changed rows, and nothing behind the bar', async () => {
    const backend = new TestBackend(20, 6);
    const md = '```diff\n@@ -1 +1 @@\n-gone\n+new\n```';
    const r = await render(<Markdown width={20}>{md}</Markdown>, backend);
    await flushAsync(backend);
    const buf = backend.lastBuffer!;
    const bgRow = (y: number) => Array.from({ length: buf.width }, (_, x) => buf.get(x, y).style.bg);
    // Row 0 is the label, 1 the hunk header, 2 the removed row, 3 the added one.
    expect(bgRow(1).every((bg) => bg === undefined)).toBe(true);
    // The bar's two cells stay outside the band; the rest of the row is solid.
    expect(bgRow(2)).toEqual([undefined, undefined, ...Array<string>(18).fill('#3b0000')]);
    expect(bgRow(3)).toEqual([undefined, undefined, ...Array<string>(18).fill('#003b00')]);
    // The `-` / `+` glyphs and their colors survive on top of the band.
    expect(buf.get(2, 2).char).toBe('-');
    expect(buf.get(2, 2).style.fg).toBe('red');
    expect(buf.get(2, 3).char).toBe('+');
    expect(buf.get(2, 3).style.fg).toBe('green');
    r.unmount();
  });

  test('codeFence / maxCodeRows reach layoutMarkdown as props', async () => {
    const backend = new TestBackend(40, 8);
    const md = '```ts\na\nb\nc\n```';
    const r = await render(<Markdown width={38} codeFence="literal">{md}</Markdown>, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.split('\n')[0]!.trimEnd()).toBe('```ts');
    r.unmount();

    const b2 = new TestBackend(40, 8);
    const r2 = await render(<Markdown width={38} maxCodeRows={1}>{md}</Markdown>, b2);
    await flushAsync(b2);
    expect(b2.lastFrame).toContain('… 2 more lines');
    r2.unmount();
  });

  test('onCodeBlocks reports the fenced blocks once, and not again on a re-render', async () => {
    const seen: MarkdownCodeBlock[][] = [];
    const md = '```ts title="a.ts"\nconst x = 1;\n```';
    // A parent that re-renders once with the same markdown: the callback is a
    // fresh closure each time, so only a CONTENT diff can keep it from refiring.
    function Harness() {
      const [n, setN] = useState(0);
      useEffect(() => { if (n === 0) setN(1); }, [n]);
      return (
        <Box flexDirection="column">
          <Text>{`tick ${n}`}</Text>
          <Markdown width={38} onCodeBlocks={(b) => { seen.push(b); }}>{md}</Markdown>
        </Box>
      );
    }
    const backend = new TestBackend(40, 8);
    const r = await render(<Harness />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('tick 1'); // the re-render really happened
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([{
      lang: 'ts', title: 'a.ts', source: 'const x = 1;', startLine: 0, endLine: 2, closed: true,
    }]);
    r.unmount();
  });

  // Table columns line up in display columns: a wide glyph takes two cells.
  test('table columns line up when a row has wide glyphs', async () => {
    const backend = new TestBackend(40, 8);
    const md = '| Status | Qty |\n| :-- | --: |\n| ✅ Done | 11 |\n| 日本語 | 3 |\n| 🇯🇵 flag | 5 |\n| plain | 7 |';
    const r = await render(<Markdown width={40}>{md}</Markdown>, backend);
    await flushAsync(backend);

    const buf = backend.lastBuffer!;
    const lastX = (y: number) => {
      let x = buf.width - 1;
      while (x >= 0 && buf.get(x, y).char === ' ') x--;
      return x;
    };
    const ys = [0, 1, 2, 3, 4, 5];
    expect(ys.map(lastX)).toEqual(ys.map(() => lastX(0)));
    r.unmount();
  });

  test('a fenced code line with wide glyphs hard-wraps by column, never through a glyph', async () => {
    // The default `bar` fence costs two columns, so a width of six leaves four for the code.
    const backend = new TestBackend(6, 4);
    const r = await render(<Markdown width={6} codeWrap="wrap">{'```\na日本\n```'}</Markdown>, backend);
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n');
    expect(rows.some((l) => l.includes('a日'))).toBe(true);
    expect(rows.some((l) => l.includes('本'))).toBe(true);
    r.unmount();
  });
});
