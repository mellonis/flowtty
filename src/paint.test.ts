import { describe, expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';
import { BORDER_CHARS } from './borders.js';

test('paints text inside a box at the box origin', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(createElement('flowtty-box', { width: 5, height: 1 }, 'hi'));
  computeLayout(container, 5, 1);
  const buffer = paint(container, 5, 1);
  expect(buffer.toString()).toBe('hi');
});

test('paints two row children at their computed columns', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { flexDirection: 'row', width: 6, height: 1 },
      createElement('flowtty-box', { width: 2, height: 1 }, 'ab'),
      createElement('flowtty-box', { width: 2, height: 1 }, 'cd'),
    ),
  );
  computeLayout(container, 6, 1);
  const buffer = paint(container, 6, 1);
  expect(buffer.toString()).toBe('abcd');
});

test('paint: wrap mode renders text across multiple rows', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 6, height: 2, wrap: 'wrap' }, 'hello world'),
  );
  computeLayout(container, 6, 2);
  const buf = paint(container, 6, 2);
  expect(buf.toString()).toBe('hello\nworld');
});

test('paint: truncate mode renders single line with ellipsis', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 7, height: 1, wrap: 'truncate' }, 'hello world'),
  );
  computeLayout(container, 7, 1);
  const buf = paint(container, 7, 1);
  expect(buf.toString()).toBe('hello …');
});

test('paint: text style props (color/bold) flow to cell Style', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { color: 'red', bold: true }, 'X'),
  );
  computeLayout(container, 5, 1);
  const buf = paint(container, 5, 1);
  expect(buf.get(0, 0)).toEqual({ char: 'X', style: { fg: 'red', bold: true } });
});

test('paint: box backgroundColor fills the box rect', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 3, height: 2, backgroundColor: 'blue' }),
  );
  computeLayout(container, 3, 2);
  const buf = paint(container, 3, 2);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 3; x++) {
      expect(buf.get(x, y)).toEqual({ char: ' ', style: { bg: 'blue' } });
    }
  }
});

test('paint: bg fill then text on top — text cells use textStyle (incl. its own bg if set), bg-only cells keep bg', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  // Text-bearing box sets BOTH color (text) AND backgroundColor (the same box's bg).
  // textStyleOf() will include both fg+bg; bgStyleOf() fills the rest with bg.
  root.render(
    createElement('flowtty-box', { width: 4, height: 1, backgroundColor: 'blue', color: 'red' }, 'hi'),
  );
  computeLayout(container, 4, 1);
  const buf = paint(container, 4, 1);
  expect(buf.get(0, 0)).toEqual({ char: 'h', style: { fg: 'red', bg: 'blue' } });
  expect(buf.get(1, 0)).toEqual({ char: 'i', style: { fg: 'red', bg: 'blue' } });
  expect(buf.get(2, 0)).toEqual({ char: ' ', style: { bg: 'blue' } });
  expect(buf.get(3, 0)).toEqual({ char: ' ', style: { bg: 'blue' } });
});

test('absolute-positioned child paints ON TOP of stack-flow content (overlays correctly)', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  // 10x2 parent: a stack-flow text fills row 0; an absolute box overlays cols 2..3 with "XX"
  root.render(
    createElement('flowtty-box', { width: 10, height: 2 },
      createElement('flowtty-box', { width: 10, height: 1 }, 'abcdefghij'),
      createElement('flowtty-box', { position: 'absolute', top: 0, left: 2, width: 2, height: 1 }, 'XX'),
    ),
  );
  computeLayout(container, 10, 2);
  const buf = paint(container, 10, 2);
  // Row 0: 'ab' + 'XX' overlay + 'efghij'
  expect(buf.toString().split('\n')[0]).toBe('abXXefghij');
});

test('multiple absolute siblings paint in tree order (later overlays earlier)', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 6, height: 1 },
      createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 4, height: 1 }, 'AAAA'),
      createElement('flowtty-box', { position: 'absolute', top: 0, left: 2, width: 4, height: 1 }, 'BBBB'),
    ),
  );
  computeLayout(container, 6, 1);
  const buf = paint(container, 6, 1);
  // 'AAAA' (0-3) then 'BBBB' (2-5) → overlays AAAA at 2,3 → 'AABBBB'
  expect(buf.toString()).toBe('AABBBB');
});

test('absolute child declared BEFORE stack-flow sibling still paints on top (gates two-pass)', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  // Absolute child declared FIRST in the tree. With a single-pass paint, the
  // stack-flow sibling rendered after would overwrite cells under the
  // absolute. Two-pass paints stack-flow first then absolutes on top → absolute wins.
  root.render(
    createElement('flowtty-box', { width: 6, height: 1 },
      createElement('flowtty-box', { position: 'absolute', top: 0, left: 2, width: 2, height: 1 }, 'XX'),
      createElement('flowtty-box', { width: 6, height: 1 }, 'abcdef'),
    ),
  );
  computeLayout(container, 6, 1);
  const buf = paint(container, 6, 1);
  // Stack-flow 'abcdef' painted first; absolute 'XX' overlays cols 2..3 → 'abXXef'
  expect(buf.toString()).toBe('abXXef');
});

describe('Box border', () => {
  test('border="single" draws ┌─┐ / │ │ / └─┘ on a 3×3 box', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(createElement('flowtty-box', { border: 'single', width: 3, height: 3 }));
    computeLayout(container, 3, 3);
    const buf = paint(container, 3, 3);
    // Top row
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(1, 0).char).toBe('─');
    expect(buf.get(2, 0).char).toBe('┐');
    // Middle row — only side edges; interior cell is blank
    expect(buf.get(0, 1).char).toBe('│');
    expect(buf.get(1, 1).char).toBe(' '); // interior
    expect(buf.get(2, 1).char).toBe('│');
    // Bottom row
    expect(buf.get(0, 2).char).toBe('└');
    expect(buf.get(1, 2).char).toBe('─');
    expect(buf.get(2, 2).char).toBe('┘');
  });

  test.each([
    ['double',  { tl: '╔', tr: '╗', bl: '╚', br: '╝', t: '═', l: '║' }],
    ['round',   { tl: '╭', tr: '╮', bl: '╰', br: '╯', t: '─', l: '│' }],
    ['bold',    { tl: '┏', tr: '┓', bl: '┗', br: '┛', t: '━', l: '┃' }],
    ['classic', { tl: '+', tr: '+', bl: '+', br: '+', t: '-', l: '|' }],
  ] as const)('border="%s" draws its corner + edge glyphs', async (style, want) => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(createElement('flowtty-box', { border: style, width: 3, height: 3 }));
    computeLayout(container, 3, 3);
    const buf = paint(container, 3, 3);
    expect(buf.get(0, 0).char).toBe(want.tl);
    expect(buf.get(2, 0).char).toBe(want.tr);
    expect(buf.get(0, 2).char).toBe(want.bl);
    expect(buf.get(2, 2).char).toBe(want.br);
    expect(buf.get(1, 0).char).toBe(want.t);
    expect(buf.get(0, 1).char).toBe(want.l);
  });

  test('borderColor applies fg style to border cells', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(createElement('flowtty-box', { border: 'single', borderColor: 'red', width: 3, height: 3 }));
    computeLayout(container, 3, 3);
    const buf = paint(container, 3, 3);
    expect(buf.get(0, 0).style.fg).toBe('red');
    expect(buf.get(1, 1).style.fg).toBeUndefined(); // interior cell unaffected
  });

  test('borderColor accepts truecolor values', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(createElement('flowtty-box', { border: 'single', borderColor: '#ff0000', width: 3, height: 3 }));
    computeLayout(container, 3, 3);
    const buf = paint(container, 3, 3);
    expect(buf.get(0, 0).style.fg).toBe('#ff0000');
  });

  test('Yoga enforces minimum 2-cell size when border is set, so guard (width < 2) is never triggered in practice', async () => {
    // Yoga expands a border-enabled box to at least 2 wide × 2 tall to accommodate
    // the 1-cell border reservation on each edge. The guard in paintBorder exists as
    // a defensive check for abnormal rect values; Yoga never produces sub-2 rects
    // for a bordered node. This test confirms Yoga's enforcement.
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(createElement('flowtty-box', { border: 'single', width: 1, height: 1 }));
    computeLayout(container, 10, 10);
    const node = (container.children[0] as any).yogaNode;
    // Yoga enforces the border space — actual computed width and height are both >= 2.
    expect(node.getComputedWidth()).toBeGreaterThanOrEqual(2);
    expect(node.getComputedHeight()).toBeGreaterThanOrEqual(2);
    // And therefore the border IS drawn (2×2 has only 4 corners, no edge runs):
    const buf = paint(container, 10, 10);
    expect(buf.get(0, 0).char).toBe(BORDER_CHARS.single.tl);
    expect(buf.get(1, 0).char).toBe(BORDER_CHARS.single.tr);
    expect(buf.get(0, 1).char).toBe(BORDER_CHARS.single.bl);
    expect(buf.get(1, 1).char).toBe(BORDER_CHARS.single.br);
  });

  test('border + content: text lands inside the border (Yoga reserves the ring)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { border: 'single', width: 5, height: 3 },
        createElement('flowtty-box', {}, 'hi'),
      ),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Border cells
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(4, 0).char).toBe('┐');
    expect(buf.get(0, 2).char).toBe('└');
    expect(buf.get(4, 2).char).toBe('┘');
    // Text inside the border (Yoga reserved 1-cell ring → content area is 3×1 at (1,1))
    expect(buf.get(1, 1).char).toBe('h');
    expect(buf.get(2, 1).char).toBe('i');
  });
});
