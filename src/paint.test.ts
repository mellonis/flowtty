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

describe('Box padding', () => {
  test('padding shorthand applies to all four edges (child inset by 1 on each side)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { padding: 1, width: 5, height: 5 },
        createElement('flowtty-box', { width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 5);
    const buf = paint(container, 5, 5);
    // Child (3×3 red bg) should land at (1,1) — inset by padding=1 on all sides
    expect(buf.get(1, 1).style.bg).toBe('red');
    expect(buf.get(3, 3).style.bg).toBe('red');
    // Outermost ring (padding cells) has no bg
    expect(buf.get(0, 0).style.bg).toBeUndefined();
    expect(buf.get(4, 4).style.bg).toBeUndefined();
  });

  test('paddingX shorthand: only left/right inset; top/bottom flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { paddingX: 1, width: 5, height: 3 },
        createElement('flowtty-box', { width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Child at (1, 0) — paddingX=1 insets left, paddingY=undefined keeps top flush
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(3, 2).style.bg).toBe('red');
    expect(buf.get(0, 0).style.bg).toBeUndefined();
  });

  test('paddingY shorthand: only top/bottom inset; left/right flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { paddingY: 1, width: 3, height: 5 },
        createElement('flowtty-box', { width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 3, 5);
    const buf = paint(container, 3, 5);
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(2, 3).style.bg).toBe('red');
    expect(buf.get(0, 0).style.bg).toBeUndefined();
  });

  test('per-edge padding overrides axis and shorthand', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // padding: 2 (shorthand) for ALL edges, paddingTop: 0 wins on top edge
    root.render(
      createElement('flowtty-box', { padding: 2, paddingTop: 0, width: 5, height: 5 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 5);
    const buf = paint(container, 5, 5);
    // Child at (2, 0): paddingLeft=2, paddingTop=0
    expect(buf.get(2, 0).style.bg).toBe('red');
  });

  test('own text inset by padding (text-only box with padding)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { padding: 1, width: 5, height: 3 }, 'hi'),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Text 'hi' starts at (1, 1) — inset by padding=1 from outer (0,0)
    expect(buf.get(1, 1).char).toBe('h');
    expect(buf.get(2, 1).char).toBe('i');
    // Padding cells are blank
    expect(buf.get(0, 0).char).toBe(' ');
    expect(buf.get(0, 1).char).toBe(' ');
  });

  test('own text inside a bordered box lands inside the border (regression — content rect subtracts border)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { border: 'single', width: 5, height: 3 }, 'hi'),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Border drawn on outer ring
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(4, 0).char).toBe('┐');
    expect(buf.get(0, 2).char).toBe('└');
    expect(buf.get(4, 2).char).toBe('┘');
    // Text inside the border (NOT painted over the top-left corner)
    expect(buf.get(1, 1).char).toBe('h');
    expect(buf.get(2, 1).char).toBe('i');
  });

  test('padding + border combine: text inset by both', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { border: 'single', padding: 1, width: 7, height: 5 }, 'hi'),
    );
    computeLayout(container, 7, 5);
    const buf = paint(container, 7, 5);
    // Border on outer ring (0..6 wide, 0..4 tall)
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(6, 4).char).toBe('┘');
    // Text inside border+padding — at (2, 2)
    expect(buf.get(2, 2).char).toBe('h');
    expect(buf.get(3, 2).char).toBe('i');
  });

  test('backgroundColor fills padding cells too (not just content area)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { padding: 1, backgroundColor: 'blue', width: 3, height: 3 }, 'x'),
    );
    computeLayout(container, 3, 3);
    const buf = paint(container, 3, 3);
    // All 9 cells have blue bg (including the padding ring)
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(buf.get(x, y).style.bg).toBe('blue');
      }
    }
    // Text 'x' at content (1, 1)
    expect(buf.get(1, 1).char).toBe('x');
  });
});

describe('Box margin', () => {
  test('margin shorthand offsets the child away from the parent edges on all four sides', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 5×3; single child with margin:1 and width:3 height:1 (= 5-2 × 3-2).
    root.render(
      createElement('flowtty-box', { width: 5, height: 3 },
        createElement('flowtty-box', { margin: 1, width: 3, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Child landed at (1, 1) (margin offset on each side)
    expect(buf.get(1, 1).style.bg).toBe('red');
    expect(buf.get(3, 1).style.bg).toBe('red');
    // Outside the child — no bg
    expect(buf.get(0, 0).style.bg).toBeUndefined();
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // left margin column
    expect(buf.get(4, 1).style.bg).toBeUndefined(); // right margin column
  });

  test('marginX shorthand: only left/right offset; top/bottom flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { width: 5, height: 3 },
        createElement('flowtty-box', { marginX: 1, width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Child at (1, 0) — marginX=1 offsets left; marginY=undefined keeps top flush
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(3, 2).style.bg).toBe('red');
    // Left/right margin columns are blank
    expect(buf.get(0, 0).style.bg).toBeUndefined();
    expect(buf.get(4, 0).style.bg).toBeUndefined();
  });

  test('marginY shorthand: only top/bottom offset; left/right flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { width: 3, height: 5 },
        createElement('flowtty-box', { marginY: 1, width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 3, 5);
    const buf = paint(container, 3, 5);
    // Child at (0, 1)
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(2, 3).style.bg).toBe('red');
    expect(buf.get(0, 0).style.bg).toBeUndefined();
  });

  test('per-edge margin overrides axis and shorthand', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // margin: 2 for all edges, marginTop: 0 wins on top.
    root.render(
      createElement('flowtty-box', { width: 5, height: 5 },
        createElement('flowtty-box', { margin: 2, marginTop: 0, width: 1, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 5);
    const buf = paint(container, 5, 5);
    // Child at (2, 0): marginLeft=2, marginTop=0
    expect(buf.get(2, 0).style.bg).toBe('red');
  });

  test('marginRight separates row siblings', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // flex row, first child marginRight:2 — second child starts at x = 1 + 2 = 3
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 5, height: 1 },
        createElement('flowtty-box', { marginRight: 2, width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    // First child at x=0 (red)
    expect(buf.get(0, 0).style.bg).toBe('red');
    // Margin gap at x=1, x=2 (no bg)
    expect(buf.get(1, 0).style.bg).toBeUndefined();
    expect(buf.get(2, 0).style.bg).toBeUndefined();
    // Second child at x=3 (blue)
    expect(buf.get(3, 0).style.bg).toBe('blue');
  });

  test('negative margin pulls child outside parent rect (overlap layout)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 5×3 with another sibling, plus a 3-wide child with marginLeft: -1
    // pulled left from its row-flow position.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 5, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { marginLeft: -1, width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    // First child at x=0..1 (red); second child shifted left by -1 to x=1..2 (blue overwrites red at x=1)
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('blue'); // overlapped
    expect(buf.get(2, 0).style.bg).toBe('blue');
  });
});

describe('Box gap', () => {
  test('gap shorthand: row flex spaces siblings horizontally', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Three 1×1 children in a 5×1 row flex with gap:1 → x positions 0, 2, 4
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', gap: 1, width: 5, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBeUndefined(); // gap
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(3, 0).style.bg).toBeUndefined(); // gap
    expect(buf.get(4, 0).style.bg).toBe('blue');
  });

  test('gap shorthand: column flex spaces siblings vertically', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Three 1×1 children in a 1×5 column flex with gap:1 → y positions 0, 2, 4
    root.render(
      createElement('flowtty-box', { gap: 1, width: 1, height: 5 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 5);
    const buf = paint(container, 1, 5);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // gap
    expect(buf.get(0, 2).style.bg).toBe('green');
    expect(buf.get(0, 3).style.bg).toBeUndefined(); // gap
    expect(buf.get(0, 4).style.bg).toBe('blue');
  });

  test('rowGap controls vertical spacing in column flex', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // rowGap:2 between two 1×1 children in a column flex → y positions 0 and 3
    root.render(
      createElement('flowtty-box', { rowGap: 2, width: 1, height: 4 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 4);
    const buf = paint(container, 1, 4);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(0, 1).style.bg).toBeUndefined();
    expect(buf.get(0, 2).style.bg).toBeUndefined();
    expect(buf.get(0, 3).style.bg).toBe('blue');
  });

  test('columnGap controls horizontal spacing in row flex', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // columnGap:2 between two 1×1 children in a row flex → x positions 0 and 3
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', columnGap: 2, width: 4, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBeUndefined();
    expect(buf.get(2, 0).style.bg).toBeUndefined();
    expect(buf.get(3, 0).style.bg).toBe('blue');
  });

  test('per-axis gap overrides shorthand (columnGap wins over gap on row axis)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // gap:2 (shorthand) + columnGap:0 (axis) — horizontal spacing should be 0
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', gap: 2, columnGap: 0, width: 2, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 2, 1);
    const buf = paint(container, 2, 1);
    // No gap → siblings flush at x=0 and x=1
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('blue');
  });

  test('gap does not apply at the leading/trailing edges (only between siblings)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Two 1×1 children in a 3×1 row flex with gap:1 → first child at x=0, second at x=2.
    // If gap were applied at the start, first child would be at x=1, not x=0.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', gap: 1, width: 3, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 3, 1);
    const buf = paint(container, 3, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');   // flush left, no leading gap
    expect(buf.get(1, 0).style.bg).toBeUndefined(); // the one gap, between
    expect(buf.get(2, 0).style.bg).toBe('blue');
  });
});

describe('Box flex sizing', () => {
  test('flexGrow distributes leftover space equally between siblings', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex; two children width:1 flexGrow:1 → each ends up 5 wide.
    // Free space = 10 - (1+1) = 8; distributed 8/2 = 4 → each child 1+4 = 5.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, flexGrow: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, flexGrow: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    // Red at x=0..4
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(4, 0).style.bg).toBe('red');
    // Blue at x=5..9
    expect(buf.get(5, 0).style.bg).toBe('blue');
    expect(buf.get(9, 0).style.bg).toBe('blue');
  });

  test('flexGrow asymmetric: 1:2 ratio splits leftover space 1/3 : 2/3', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 9×1 row flex; both children basis 0 (width=0) so total free space = 9.
    // Distribute 9 × 1/3 = 3 and 9 × 2/3 = 6. Red x=0..2, blue x=3..8.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 9, height: 1 },
        createElement('flowtty-box', { width: 0, height: 1, flexGrow: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 0, height: 1, flexGrow: 2, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 9, 1);
    const buf = paint(container, 9, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('red');
    expect(buf.get(3, 0).style.bg).toBe('blue');
    expect(buf.get(8, 0).style.bg).toBe('blue');
  });

  test('flexShrink: equal-basis siblings shrink equally under deficit', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×1 row flex; two children width:4 flexShrink:1 → total basis 8, fit 4,
    // overflow 4, each shrinks 4 × (4×1)/(4×1 + 4×1) = 2 → final width 2 each.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('blue');
    expect(buf.get(3, 0).style.bg).toBe('blue');
  });

  test('flexBasis (number) overrides width as the initial size for grow/shrink calc', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex. Two children width:2 flexBasis:4 — basis wins, so each
    // starts at 4. Total 8; free space 2. First child flexGrow:1 → 4+2 = 6.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, flexBasis: 4, flexGrow: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, flexBasis: 4, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    // Red at x=0..5 (basis 4 + grow 2)
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(5, 0).style.bg).toBe('red');
    // Blue at x=6..9 (basis 4, no grow)
    expect(buf.get(6, 0).style.bg).toBe('blue');
    expect(buf.get(9, 0).style.bg).toBe('blue');
  });

  test('flexBasis (percent string) sets the initial size as a fraction of parent', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex. One child flexBasis:'50%' → child width 5.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { height: 1, flexBasis: '50%', backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(4, 0).style.bg).toBe('red');
    expect(buf.get(5, 0).style.bg).toBeUndefined(); // beyond the child
  });

  test('default flexShrink is 0 (Yoga convention, NOT CSS) — children overflow rather than shrink', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×1 row flex; two children width:4 with NO flexShrink set.
    // CSS default would shrink them; Yoga keeps both at 4 → second overflows past parent.
    // First child fills 0..3; second is positioned at x=4 (overflow, outside parent rect).
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 4, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 4, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 8, 1); // give the canvas room to render the overflow so we can read it
    const buf = paint(container, 8, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(3, 0).style.bg).toBe('red');
    expect(buf.get(4, 0).style.bg).toBe('blue');
    expect(buf.get(7, 0).style.bg).toBe('blue');
  });
});

describe('Box flexWrap', () => {
  test('flexWrap="wrap": children that exceed main axis wrap to the next line', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×2 row flex, three 2-wide children. AA + BB fit on line 1 (4 wide total),
    // CC wraps to line 2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', width: 4, height: 2 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 2);
    const buf = paint(container, 4, 2);
    // Line 1
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(3, 0).style.bg).toBe('green');
    // Line 2 (wrapped)
    expect(buf.get(0, 1).style.bg).toBe('blue');
    expect(buf.get(1, 1).style.bg).toBe('blue');
  });

  test('default flexWrap is "nowrap" — children overflow the parent rather than wrap', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Same children, no flexWrap. Total width 6 > parent 4; third child overflows past x=4.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    // Give canvas room to render the overflow so we can observe it.
    computeLayout(container, 6, 1);
    const buf = paint(container, 6, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(4, 0).style.bg).toBe('blue');
    expect(buf.get(5, 0).style.bg).toBe('blue');
  });

  test('flexWrap="wrap-reverse": wrap lines stack in reverse cross-axis order', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Same scenario as the "wrap" test but with wrap-reverse. The line that would
    // normally land at y=0 ends up at y=1, and the wrapped line lands at y=0.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap-reverse', width: 4, height: 2 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 2);
    const buf = paint(container, 4, 2);
    // Wrapped (last) line is at TOP
    expect(buf.get(0, 0).style.bg).toBe('blue');
    expect(buf.get(1, 0).style.bg).toBe('blue');
    // First line is at BOTTOM
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(2, 1).style.bg).toBe('green');
  });

  test('flexWrap="wrap" + rowGap: lines are separated by rowGap cells', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×3 row flex with wrap + rowGap:1. AA BB at y=0, gap at y=1, CC at y=2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', rowGap: 1, width: 4, height: 3 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 3);
    const buf = paint(container, 4, 3);
    // Line 1 at y=0
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    // rowGap at y=1 (no bg)
    expect(buf.get(0, 1).style.bg).toBeUndefined();
    expect(buf.get(2, 1).style.bg).toBeUndefined();
    // Wrapped line at y=2
    expect(buf.get(0, 2).style.bg).toBe('blue');
    expect(buf.get(1, 2).style.bg).toBe('blue');
  });
});

describe('Box alignContent', () => {
  test('alignContent="flex-end": wrap lines pack at the bottom (cross-axis end)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // 2 lines (2 rows used) in a 4-row parent → 2 free rows.
    // flex-end: free space at top, line 1 at y=2, line 2 at y=3.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-end', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    expect(buf.get(0, 0).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 2).style.bg).toBe('red');     // line 1
    expect(buf.get(2, 2).style.bg).toBe('green');
    expect(buf.get(0, 3).style.bg).toBe('blue');    // line 2
  });

  test('alignContent="center": wrap lines pack in the middle of cross-axis', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // center: 1 free row above, 1 free row below → line 1 at y=1, line 2 at y=2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    expect(buf.get(0, 0).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 1).style.bg).toBe('red');     // line 1 centered
    expect(buf.get(2, 1).style.bg).toBe('green');
    expect(buf.get(0, 2).style.bg).toBe('blue');    // line 2
    expect(buf.get(0, 3).style.bg).toBeUndefined(); // free
  });

  test('alignContent="space-between": first line at top, last at bottom, free space between', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // space-between: line 1 at y=0, line 2 at y=3, free at y=1 and y=2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'space-between', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    expect(buf.get(0, 0).style.bg).toBe('red');     // line 1 at top
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 2).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 3).style.bg).toBe('blue');    // line 2 at bottom
  });

  test('alignContent="stretch": wrap lines stretch to fill cross-axis (each line 2 rows tall)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // 2 lines stretch to fill 4 rows → each line is 2 rows tall.
    // Children with height:1 + default alignItems='flex-start' render at the TOP of their line.
    // Line 1 spans y=0..1; children render at y=0. Line 2 spans y=2..3; children at y=2.
    // Compare to flex-start default (lines at y=0 and y=1, free at y=2,3) to see the difference.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    // Line 1 (stretched to y=0..1): children at y=0
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // line 1 bottom row (stretched, no child)
    // Line 2 (stretched to y=2..3): children at y=2
    expect(buf.get(0, 2).style.bg).toBe('blue');
    expect(buf.get(0, 3).style.bg).toBeUndefined(); // line 2 bottom row
  });
});

describe('Box zIndex', () => {
  test('higher zIndex paints on top within the absolute pass (overrides tree order)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Two absolutes at same (0,0). Without zIndex, tree order wins → blue (second) on top.
    // With zIndex 5 on red (first) and default 0 on blue, red wins.
    root.render(
      createElement('flowtty-box', { width: 1, height: 1 },
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'red', zIndex: 5 }),
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 1);
    const buf = paint(container, 1, 1);
    expect(buf.get(0, 0).style.bg).toBe('red'); // higher zIndex wins
  });

  test('tree order is the tiebreaker when zIndex is equal', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Both zIndex 5 → second sibling wins (tree order tiebreaker).
    root.render(
      createElement('flowtty-box', { width: 1, height: 1 },
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'red',  zIndex: 5 }),
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'blue', zIndex: 5 }),
      ),
    );
    computeLayout(container, 1, 1);
    const buf = paint(container, 1, 1);
    expect(buf.get(0, 0).style.bg).toBe('blue');
  });

  test('zIndex does NOT cross pass boundaries — absolute with zIndex 0 still paints on top of stack-flow with zIndex 999', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Stack-flow child fills the parent with red and has a huge zIndex.
    // Absolute child overlays a single blue cell with default zIndex.
    // Pass-boundary rule wins: absolute on top.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 1, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red', zIndex: 999 }),
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 1);
    const buf = paint(container, 1, 1);
    expect(buf.get(0, 0).style.bg).toBe('blue'); // absolute pass wins regardless of zIndex
  });

  test('negative zIndex pushes a sibling below others in the same pass', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Stack-flow siblings overlapping via negative margin (M1 margin feature).
    // First child red zIndex:-1, second child blue zIndex:0 — blue on top (default order),
    // negative zIndex makes red go under EVEN IF it appeared later in tree.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 2, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
        createElement('flowtty-box', { width: 2, height: 1, marginLeft: -2, backgroundColor: 'red', zIndex: -1 }),
      ),
    );
    computeLayout(container, 2, 1);
    const buf = paint(container, 2, 1);
    // Without zIndex, red (later) would overwrite blue. With zIndex:-1 on red, blue wins.
    expect(buf.get(0, 0).style.bg).toBe('blue');
    expect(buf.get(1, 0).style.bg).toBe('blue');
  });
});
