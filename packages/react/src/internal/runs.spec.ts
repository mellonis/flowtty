import { describe, expect, test } from 'vitest';
import { createElement as h } from 'react';
import { getYoga, computeLayout, paint } from '@flowtty/core/host';
import { createRoot } from './reconciler.js';

async function paintTree(tree: unknown, w: number, hgt: number) {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(tree as never);
  computeLayout(container, w, hgt);
  return paint(container, w, hgt);
}
const styleRow = (buf: Awaited<ReturnType<typeof paintTree>>, y: number, pick: (s: Record<string, unknown>) => unknown, w: number) =>
  Array.from({ length: w }, (_, x) => (pick(buf.get(x, y).style as Record<string, unknown>) ? '#' : '.')).join('');

describe('text runs: styled pieces of ONE line of text', () => {
  test('each run paints with its own style, on one line', async () => {
    const buf = await paintTree(
      h('flowtty-box', { runs: [{ text: 'Press ' }, { text: 'q', bold: true, color: 'cyan' }, { text: ' to quit' }] }), 20, 1);
    expect(buf.toString()).toBe('Press q to quit');
    expect(styleRow(buf, 0, (s) => s.bold, 15)).toBe('......#........');
    expect(buf.get(6, 0).style.fg).toBe('cyan');
    expect(buf.get(0, 0).style.fg).toBeUndefined();
  });

  test('a run inherits the box\'s own text style and overrides what it sets', async () => {
    const buf = await paintTree(h('flowtty-box', { color: 'red', dim: true, runs: [{ text: 'a' }, { text: 'b', color: 'green' }] }), 5, 1);
    expect(buf.get(0, 0).style).toMatchObject({ fg: 'red', dim: true });
    expect(buf.get(1, 0).style).toMatchObject({ fg: 'green', dim: true });
  });

  test('the box measures to the joined text', async () => {
    const buf = await paintTree(
      h('flowtty-box', { flexDirection: 'row' },
        h('flowtty-box', { runs: [{ text: 'ab' }, { text: 'cd', bold: true }] }),
        h('flowtty-box', null, '|')), 10, 1);
    expect(buf.toString()).toBe('abcd|');
  });

  test('wrap: the runs wrap as ONE paragraph, and a style carries across the line break', async () => {
    const buf = await paintTree(
      h('flowtty-box', { width: 11, wrap: 'wrap', runs: [{ text: 'plain ' }, { text: 'bold words here', bold: true }, { text: ' tail' }] }), 11, 3);
    expect(buf.toString().split('\n')).toEqual(['plain bold', 'words here', 'tail']);
    expect(styleRow(buf, 0, (s) => s.bold, 11)).toBe('......####.');
    expect(styleRow(buf, 1, (s) => s.bold, 11)).toBe('##########.');
    expect(styleRow(buf, 2, (s) => s.bold, 11)).toBe('...........');
  });

  test('truncate: the ellipsis takes the style of the text it cuts', async () => {
    const buf = await paintTree(h('flowtty-box', { width: 6, wrap: 'truncate', runs: [{ text: 'ab' }, { text: 'cdefghij', underline: true }] }), 6, 1);
    expect(buf.toString()).toBe('abcde…');
    expect(styleRow(buf, 0, (s) => s.underline, 6)).toBe('..####');
  });

  test('an explicit line break inside a run starts a new line', async () => {
    const buf = await paintTree(h('flowtty-box', { runs: [{ text: 'one\ntw' }, { text: 'o', bold: true }] }), 6, 2);
    expect(buf.toString().split('\n')).toEqual(['one', 'two']);
    expect(styleRow(buf, 1, (s) => s.bold, 3)).toBe('..#');
  });
});
