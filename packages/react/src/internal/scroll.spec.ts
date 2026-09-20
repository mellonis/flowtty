import { describe, expect, test } from 'vitest';
import { createElement as h } from 'react';
import { getYoga, computeLayout, paint } from '@flowtty/core/host';
import { createRoot } from './reconciler.js';

const rows = (names: string[]) => names.map((t) => h('flowtty-box', { key: t, height: 1 }, t));

async function frame(props: Record<string, unknown>, children: unknown[], w = 8, hgt = 3): Promise<string[]> {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(h('flowtty-box', { flexDirection: 'column', width: w, height: hgt, overflow: 'hidden', ...props }, ...children as never[]));
  computeLayout(container, w, hgt);
  return paint(container, w, hgt).toString().split('\n');
}

describe('scroll props on a box', () => {
  const five = ['r0', 'r1', 'r2', 'r3', 'r4'];

  test('without a scroll prop, overflowing children are clipped from the top', async () => {
    expect(await frame({}, rows(five))).toEqual(['r0', 'r1', 'r2']);
  });

  test('scrollTop shifts children up by that many rows', async () => {
    expect(await frame({ scrollTop: 2 }, rows(five))).toEqual(['r2', 'r3', 'r4']);
  });

  test('scrollTop is clamped to the scrollable range', async () => {
    expect(await frame({ scrollTop: 99 }, rows(five))).toEqual(['r2', 'r3', 'r4']);
    expect(await frame({ scrollTop: -5 }, rows(five))).toEqual(['r0', 'r1', 'r2']);
  });

  test('scrollBottom counts from the end: 0 pins the last rows into view', async () => {
    expect(await frame({ scrollBottom: 0 }, rows(five))).toEqual(['r2', 'r3', 'r4']);
    expect(await frame({ scrollBottom: 1 }, rows(five))).toEqual(['r1', 'r2', 'r3']);
    expect(await frame({ scrollBottom: 99 }, rows(five))).toEqual(['r0', 'r1', 'r2']);
  });

  test('content shorter than the viewport does not scroll, whatever the offset', async () => {
    expect(await frame({ scrollBottom: 0 }, rows(['a', 'b']))).toEqual(['a', 'b']);
    expect(await frame({ scrollTop: 1 }, rows(['a', 'b']))).toEqual(['a', 'b']);
  });

  test('a scroll prop clips on its own — overflow="hidden" is implied', async () => {
    expect(await frame({ overflow: undefined, scrollTop: 1 }, rows(five))).toEqual(['r1', 'r2', 'r3']);
  });

  test('border and padding stay put; only the content moves, inside the content rect', async () => {
    expect(await frame({ border: 'single', scrollTop: 1 }, rows(five), 6, 4)).toEqual([
      '┌────┐',
      '│r1  │',
      '│r2  │',
      '└────┘',
    ]);
  });

  test('absolute children are overlays: they do not scroll and do not count as content', async () => {
    const overlay = h('flowtty-box', { key: 'o', position: 'absolute', top: 0, right: 0, width: 1, height: 1 }, '#');
    expect(await frame({ scrollTop: 2 }, [...rows(five), overlay])).toEqual(['r2     #', 'r3', 'r4']);
  });

  test('onScrollMetrics reports content size, viewport size and the effective scrollTop', async () => {
    const seen: unknown[] = [];
    await frame({ scrollBottom: 0, onScrollMetrics: (m: unknown) => seen.push(m) }, rows(five));
    expect(seen.at(-1)).toEqual({ contentHeight: 5, viewportHeight: 3, scrollTop: 2, maxScrollTop: 2 });
  });

  test('nested descendants report onLayout rects at their scrolled position', async () => {
    let top: number | undefined;
    const kids = five.map((t) => h('flowtty-box', { key: t, height: 1, onLayout: t === 'r3' ? (r: { top: number }) => { top = r.top; } : undefined }, t));
    await frame({ scrollTop: 2 }, kids);
    expect(top).toBe(1);
  });
});
