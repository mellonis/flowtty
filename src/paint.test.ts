import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';

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
