import { expect, test } from 'vitest';
import type { ContinuationMark } from '../cells.js';
import { getYoga } from './yoga.js';
import { appendChild, createInstance, createTextInstance, type BoxProps, type Container, type Instance } from './host.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';

// A tiny tree builder: `box(props, ...children)` where a string child is text.
async function tree(...roots: ((Yoga: Awaited<ReturnType<typeof getYoga>>) => Instance)[]): Promise<Container> {
  const Yoga = await getYoga();
  return { children: roots.map((make) => make(Yoga)), Yoga };
}

function box(props: BoxProps, ...children: (string | ((Yoga: Awaited<ReturnType<typeof getYoga>>) => Instance))[]) {
  return (Yoga: Awaited<ReturnType<typeof getYoga>>): Instance => {
    const inst = createInstance('flowtty-box', props, Yoga);
    for (const child of children) {
      if (typeof child === 'string') appendChild(inst, createTextInstance(child, Yoga), Yoga);
      else appendChild(inst, child(Yoga), Yoga);
    }
    return inst;
  };
}

function marksOf(container: Container, width: number, height: number): ContinuationMark[] {
  computeLayout(container, width, height);
  const buffer = paint(container, width, height);
  const out: ContinuationMark[] = [];
  for (let y = 0; y < height; y++) out.push(...buffer.continuationsAt(y));
  return out;
}

// ─── soft wrap ───────────────────────────────────────────────────────────────
// The painter is the only place that knows a line ended because the text ran
// out of room rather than because the author wrote a newline. It records that
// per painted span, so a selection can put the paragraph back together.

test('a word-wrapped box marks every line but the last, with the space it dropped', async () => {
  const container = await tree(box({ width: 6, wrap: 'wrap' }, 'hello world again'));
  expect(marksOf(container, 6, 4)).toEqual([
    { y: 0, x0: 0, x1: 5, join: ' ' },
    { y: 1, x0: 0, x1: 5, join: ' ' },
  ]);
});

test('a cut through a long word is marked as joining with nothing', async () => {
  const container = await tree(box({ width: 6, wrap: 'wrap' }, 'antidisestablish'));
  expect(marksOf(container, 6, 4)).toEqual([
    { y: 0, x0: 0, x1: 6, join: '' },
    { y: 1, x0: 0, x1: 6, join: '' },
  ]);
});

test('a newline the author wrote is never a continuation', async () => {
  const container = await tree(box({ width: 8, wrap: 'wrap' }, 'one\ntwo'));
  expect(marksOf(container, 8, 3)).toEqual([]);
});

test('truncate and no-wrap boxes mark nothing — their text does not carry on', async () => {
  const truncated = await tree(box({ width: 6, wrap: 'truncate' }, 'hello world'));
  expect(marksOf(truncated, 6, 3)).toEqual([]);
  const plain = await tree(box({ width: 6 }, 'hello world'));
  expect(marksOf(plain, 6, 3)).toEqual([]);
});

test('two wrapping panes on the same row mark their own spans, not the row', async () => {
  const container = await tree(box({ flexDirection: 'row', width: 14 },
    box({ width: 6, wrap: 'wrap' }, 'aaa bbb'),
    box({ width: 6, marginLeft: 2, wrap: 'wrap' }, 'ccc ddd'),
  ));
  expect(marksOf(container, 14, 3)).toEqual([
    { y: 0, x0: 0, x1: 3, join: ' ' },
    { y: 0, x0: 8, x1: 11, join: ' ' },
  ]);
});

test('a line whose continuation is cut off by the content height is not marked', async () => {
  // Height 1: the second wrapped line never reaches the frame, so there is
  // nothing below to join to.
  const container = await tree(box({ width: 6, height: 1, wrap: 'wrap' }, 'hello world'));
  expect(marksOf(container, 6, 2)).toEqual([]);
});

// ─── wrapContinues ───────────────────────────────────────────────────────────
// A component that wraps text itself — <Markdown> lays each row out as its own
// <Text> — paints rows the painter never wrapped. This prop is how it says so.

test('wrapContinues marks the row’s text on the box’s last row', async () => {
  const container = await tree(box({ flexDirection: 'column', width: 10 },
    box({ wrapContinues: { dropped: ' ', textWidth: 5 } }, 'hello'),
    box({}, 'world'),
  ));
  expect(marksOf(container, 10, 3)).toEqual([{ y: 0, x0: 0, x1: 5, join: ' ' }]);
});

test('wrapContinues respects border and padding — the mark starts at the content rect', async () => {
  const container = await tree(box({ flexDirection: 'column', width: 12, paddingLeft: 2, paddingRight: 1 },
    box({ wrapContinues: { dropped: '', textWidth: 4 } }, 'code'),
    box({}, 'more'),
  ));
  expect(marksOf(container, 12, 3)).toEqual([{ y: 0, x0: 2, x1: 6, join: '' }]);
});

test('wrapContinues ends the mark at the text, not at the padded band edge', async () => {
  // A code row with a diff band is padded out to the block width; the mark has
  // to stop where the row's own text does or the padding is copied as content.
  const container = await tree(box({ flexDirection: 'column', width: 20 },
    box({ width: 20, wrapContinues: { dropped: '', textWidth: 6 } }, 'const '),
    box({ width: 20 }, 'x = 1;'),
  ));
  expect(marksOf(container, 20, 3)).toEqual([{ y: 0, x0: 0, x1: 6, join: '' }]);
});

test('wrapContinues on a box with no content rect marks nothing', async () => {
  // Height 0 (a collapsed row): `content.top + content.height - 1` would point
  // at the row ABOVE the box and join two lines that have nothing to do with it.
  const container = await tree(box({ flexDirection: 'column', width: 10 },
    box({ height: 1 }, 'aaa'),
    box({ height: 0, wrapContinues: { dropped: ' ', textWidth: 3 } }),
    box({ height: 1 }, 'bbb'),
  ));
  expect(marksOf(container, 10, 3)).toEqual([]);
});

// ─── wide glyphs ─────────────────────────────────────────────────────────────
// A wide cluster (CJK, emoji) takes two cells: paint advances by its width and
// never leaves half of one at an edge — the buffer's, the content rect's or a
// clip's. See docs/terminal.md (display width).

function frameOf(container: Container, width: number, height: number) {
  computeLayout(container, width, height);
  return paint(container, width, height);
}

test('a wide glyph takes two cells: the next character lands two columns on', async () => {
  const container = await tree(box({}, '日x'));
  const b = frameOf(container, 5, 1);
  expect([0, 1, 2].map((x) => b.get(x, 0).char)).toEqual(['日', '', 'x']);
});

test('a wide glyph in a box\'s last content column is blanked, not torn', async () => {
  const container = await tree(box({ width: 3 }, 'ab日'));
  const b = frameOf(container, 6, 1);
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual(['a', 'b', ' ', ' ']);
});

test('a wide glyph cut by a clip (overflow hidden) is blanked, not torn', async () => {
  const container = await tree(box({ width: 3, overflow: 'hidden' }, box({ width: 6 }, 'ab日x')));
  const b = frameOf(container, 6, 1);
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual(['a', 'b', ' ', ' ']);
});

test('run styles follow clusters, not code points', async () => {
  const container = await tree(box({ runs: [{ text: '🇯🇵' }, { text: 'x', bold: true }] }));
  const b = frameOf(container, 4, 1);
  expect(b.get(0, 0)).toEqual({ char: '🇯🇵', style: {} });
  expect(b.get(2, 0)).toEqual({ char: 'x', style: { bold: true } });
});

test('a lone combining mark has no cell; DEL and C1 controls paint as a space', async () => {
  const container = await tree(box({}, '́a\x7fb\x9bc'));
  const b = frameOf(container, 6, 1);
  expect([0, 1, 2, 3, 4].map((x) => b.get(x, 0).char)).toEqual(['a', ' ', 'b', ' ', 'c']);
});

test('a continuation mark spans the columns wide text painted', async () => {
  const container = await tree(box({ width: 4, wrap: 'wrap' }, '日本 語'));
  expect(marksOf(container, 4, 2)).toEqual([{ y: 0, x0: 0, x1: 4, join: ' ' }]);
});

test('a border title with wide glyphs is drawn whole, and truncates by cluster', async () => {
  const whole = frameOf(await tree(box({ border: 'single', borderTitle: '日本語', width: 12, height: 3 })), 12, 3);
  expect(whole.toString().split('\n')[0]).toContain('─ 日本語 ─');
  // avail = 9 − 4 = 5 columns for " 日本語 " (8): " 日" then the ellipsis, never half of 本.
  const cut = frameOf(await tree(box({ border: 'single', borderTitle: '日本語', width: 9, height: 3 })), 9, 3);
  expect(cut.toString().split('\n')[0]).toContain(' 日…');
  expect(cut.toString().split('\n')[0]).not.toContain('本');
});
