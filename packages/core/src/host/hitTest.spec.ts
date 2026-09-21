import { expect, test } from 'vitest';
import { getYoga } from './yoga.js';
import { createInstance, createTextInstance, appendChild, type BoxProps, type Container, type Instance } from './host.js';
import { computeLayout } from './layout.js';
import { contentRectOf } from './geometry.js';
import { paint } from './paint.js';
import { hitTest, unselectableRects } from './hitTest.js';
import { selectionScopeAt } from './selection.js';

async function newContainer(): Promise<Container> {
  const Yoga = await getYoga();
  return { children: [], Yoga };
}

function box(c: Container, props: BoxProps, parent?: Instance): Instance {
  const inst = createInstance('flowtty-box', props, c.Yoga);
  if (parent) appendChild(parent, inst, c.Yoga);
  else c.children.push(inst);
  return inst;
}

function text(c: Container, parent: Instance, s: string): void {
  appendChild(parent, createTextInstance(s, c.Yoga), c.Yoga);
}

const hitInst = (c: Container, x: number, y: number): Instance | null => {
  const path = hitTest(c, x, y);
  return path.length === 0 ? null : path[path.length - 1]!.inst;
};

test('hitTest returns the ancestor-or-self chain of the deepest box under a point', async () => {
  const c = await newContainer();
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  const child = box(c, { width: 6, height: 2 }, root);
  computeLayout(c, 20, 5);
  const path = hitTest(c, 3, 1);
  expect(path.map((e) => e.inst)).toEqual([root, child]);
  expect(path[1]!.rect).toEqual({ left: 0, top: 0, width: 6, height: 2 });
});

test('hitTest finds nothing outside every root box', async () => {
  const c = await newContainer();
  box(c, { width: 4, height: 2 });
  computeLayout(c, 20, 5);
  expect(hitTest(c, 10, 4)).toEqual([]);
});

test('a border cell belongs to the bordered box, not to its child', async () => {
  const c = await newContainer();
  const outer = box(c, { width: 10, height: 4, border: 'single' });
  const inner = box(c, { width: 8, height: 2 }, outer);
  computeLayout(c, 10, 4);
  expect(hitInst(c, 0, 0)).toBe(outer);   // top-left corner
  expect(hitInst(c, 1, 1)).toBe(inner);   // first content cell
  // The box's content rect starts inside the border ring — a hit chain carries
  // the rect it was painted at, and the content rect is derived from it.
  const hit = hitTest(c, 0, 0)[0]!;
  expect(contentRectOf(hit.inst, hit.rect)).toEqual({ left: 1, top: 1, width: 8, height: 2 });
});

test('a padding cell belongs to the padded box', async () => {
  const c = await newContainer();
  const outer = box(c, { width: 10, height: 4, padding: 1 });
  const inner = box(c, { width: 8, height: 2 }, outer);
  computeLayout(c, 10, 4);
  expect(hitInst(c, 0, 0)).toBe(outer);
  expect(hitInst(c, 1, 1)).toBe(inner);
});

test('an absolute overlay wins over the stack-flow sibling beneath it', async () => {
  const c = await newContainer();
  const root = box(c, { width: 10, height: 4 });
  const under = box(c, { width: 10, height: 4 }, root);
  const over = box(c, { position: 'absolute', top: 0, left: 0, width: 10, height: 4 }, root);
  computeLayout(c, 10, 4);
  expect(hitInst(c, 2, 2)).toBe(over);
  expect(hitTest(c, 2, 2).map((e) => e.inst)).not.toContain(under);
});

test('a higher zIndex sibling wins within the same pass', async () => {
  const c = await newContainer();
  const root = box(c, { width: 10, height: 4 });
  const high = box(c, { position: 'absolute', top: 0, left: 0, width: 10, height: 4, zIndex: 5 }, root);
  box(c, { position: 'absolute', top: 0, left: 0, width: 10, height: 4, zIndex: 1 }, root);
  computeLayout(c, 10, 4);
  expect(hitInst(c, 2, 2)).toBe(high);
});

test('a cell clipped away by overflow:hidden is not hittable', async () => {
  const c = await newContainer();
  const clipper = box(c, { width: 10, height: 2, overflow: 'hidden' });
  const tall = box(c, { width: 10, height: 6 }, clipper);
  computeLayout(c, 10, 6);
  expect(hitInst(c, 2, 1)).toBe(tall);   // inside the viewport
  expect(hitTest(c, 2, 4)).toEqual([]);  // clipped away
});

test('a scrolled viewport hit-tests its content at the shifted position', async () => {
  const c = await newContainer();
  const viewport = box(c, { width: 10, height: 2, scrollTop: 1, flexDirection: 'column' });
  const a = box(c, { height: 1 }, viewport);
  text(c, a, 'aaa');
  const b = box(c, { height: 1 }, viewport);
  text(c, b, 'bbb');
  const d = box(c, { height: 1 }, viewport);
  text(c, d, 'ddd');
  computeLayout(c, 10, 2);
  // Scrolled by one row: 'b' paints on row 0 and 'd' on row 1; 'a' is gone.
  expect(hitInst(c, 1, 0)).toBe(b);
  expect(hitInst(c, 1, 1)).toBe(d);
  expect(hitTest(c, 1, 0).map((e) => e.inst)).not.toContain(a);
});

test('a scroll viewport overlay in the padding column is hittable', async () => {
  const c = await newContainer();
  const viewport = box(c, { width: 10, height: 2, scrollTop: 0, paddingRight: 1, flexDirection: 'column' });
  box(c, { height: 4 }, viewport);
  const bar = box(c, { position: 'absolute', top: 0, right: 0, width: 1, height: 2 }, viewport);
  computeLayout(c, 10, 2);
  expect(hitInst(c, 9, 0)).toBe(bar);
});

test('a full-screen dialog overlay is hit before the content behind it', async () => {
  const c = await newContainer();
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  const page = box(c, { width: 20, height: 5 }, root);
  const overlay = box(c, { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backdrop: 'dim' }, root);
  const dialog = box(c, { width: 10, height: 3, border: 'single' }, overlay);
  computeLayout(c, 20, 5);
  expect(hitInst(c, 15, 4)).toBe(overlay);
  expect(hitInst(c, 2, 1)).toBe(dialog);
  expect(hitTest(c, 2, 1).map((e) => e.inst)).not.toContain(page);
});

test('a display:none subtree is not hittable', async () => {
  const c = await newContainer();
  const root = box(c, { width: 10, height: 4 });
  box(c, { width: 10, height: 4, display: 'none' }, root);
  computeLayout(c, 10, 4);
  expect(hitInst(c, 2, 2)).toBe(root);
});

test('unselectableRects collects a selectable={false} box and its descendants', async () => {
  const c = await newContainer();
  const root = box(c, { width: 20, height: 4, flexDirection: 'column' });
  const secret = box(c, { width: 8, height: 2, selectable: false }, root);
  box(c, { width: 4, height: 1 }, secret);
  box(c, { width: 20, height: 2 }, root);
  computeLayout(c, 20, 4);
  const rects = unselectableRects(c);
  expect(rects).toContainEqual({ left: 0, top: 0, width: 8, height: 2 });
  expect(rects).toContainEqual({ left: 0, top: 0, width: 4, height: 1 });
  expect(rects).toHaveLength(2);
});

test('unselectableRects clips a rect to its clipping ancestors', async () => {
  const c = await newContainer();
  const clipper = box(c, { width: 10, height: 2, overflow: 'hidden' });
  box(c, { width: 10, height: 6, selectable: false }, clipper);
  computeLayout(c, 10, 6);
  expect(unselectableRects(c)).toEqual([{ left: 0, top: 0, width: 10, height: 2 }]);
});

// ─── occlusion ───────────────────────────────────────────────────────────────

test('an opaque scoped overlay is selectable over an unselectable box beneath it', async () => {
  // A menu bar on row 0 opted out of selection, with a full-screen dialog drawn
  // over it. Nothing of the menu bar is on screen inside the dialog, so it must
  // not cut a hole in a selection made there.
  const c = await newContainer();
  const root = box(c, { width: 20, height: 4, flexDirection: 'column' });
  box(c, { width: 20, height: 1, selectable: false }, root); // the menu bar
  box(c, { width: 20, height: 3 }, root);
  const dialog = box(c, {
    position: 'absolute', top: 0, left: 0, width: 20, height: 4,
    backgroundColor: 'default', selectionScope: true,
  }, root);
  text(c, dialog, 'dialog');
  computeLayout(c, 20, 4);
  const scope = selectionScopeAt(c, 2, 0, { left: 0, top: 0, width: 20, height: 4 });
  expect(scope).not.toBeNull();
  expect(scope!.excluded).toEqual([]);
});

test('an unselectable box inside the scope still cuts a hole in it', async () => {
  const c = await newContainer();
  const root = box(c, { width: 20, height: 4, flexDirection: 'column', selectionScope: true });
  box(c, { width: 20, height: 1 }, root);
  box(c, { width: 6, height: 1, selectable: false }, root);
  computeLayout(c, 20, 4);
  const scope = selectionScopeAt(c, 2, 0, { left: 0, top: 0, width: 20, height: 4 });
  expect(scope!.excluded).toEqual([{ left: 0, top: 1, width: 6, height: 1 }]);
});

test('an unscoped selection still sees every unselectable rect on the frame', async () => {
  const c = await newContainer();
  const root = box(c, { width: 20, height: 4, flexDirection: 'column' });
  box(c, { width: 20, height: 1 }, root);
  box(c, { width: 6, height: 1, selectable: false }, root);
  computeLayout(c, 20, 4);
  const scope = selectionScopeAt(c, 2, 0, { left: 0, top: 0, width: 20, height: 4 });
  expect(scope!.excluded).toEqual([{ left: 0, top: 1, width: 6, height: 1 }]);
});

// ─── paint / hit cross-check ─────────────────────────────────────────────────
// `walk` here and `paintInstance` in paint.ts are two hand-kept copies of one
// traversal. This is the guard that they agree: every cell of a painted frame
// must be claimed by the box whose own fill produced it.

test('for every cell, hitTest names the box whose paint produced it', async () => {
  const c = await newContainer();
  // Unique background per box, no borders and no backdrop: the last box to fill
  // a cell is the topmost one, and its color identifies it.
  const colors = new Map<Instance, string>();
  const paintedBox = (props: BoxProps, parent?: Instance): Instance => {
    const color = `#${(colors.size + 1).toString(16).padStart(6, '0')}`;
    const inst = box(c, { ...props, backgroundColor: color }, parent);
    colors.set(inst, color);
    return inst;
  };

  const root = paintedBox({ width: 20, height: 8, flexDirection: 'column' });
  const header = paintedBox({ width: 20, height: 1 }, root);
  paintedBox({ width: 8, height: 1, zIndex: 2 }, header); // z within the header
  const viewport = paintedBox({ width: 12, height: 3, scrollTop: 1, flexDirection: 'column', paddingRight: 1 }, root);
  for (let i = 0; i < 6; i++) paintedBox({ width: 11, height: 1 }, viewport);
  paintedBox({ position: 'absolute', top: 0, right: 0, width: 1, height: 3 }, viewport); // scrollbar in the padding
  const clipper = paintedBox({ width: 10, height: 2, overflow: 'hidden' }, root);
  paintedBox({ width: 10, height: 6 }, clipper); // overflows, clipped away
  const low = paintedBox({ position: 'absolute', top: 5, left: 0, width: 14, height: 2, zIndex: 1 }, root);
  paintedBox({ width: 4, height: 1 }, low);
  paintedBox({ position: 'absolute', top: 6, left: 2, width: 6, height: 2, zIndex: 3 }, root);

  computeLayout(c, 20, 8);
  const frame = paint(c, 20, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 20; x++) {
      const path = hitTest(c, x, y);
      const top = path[path.length - 1];
      const painted = frame.get(x, y).style.bg;
      expect(top === undefined ? undefined : colors.get(top.inst), `cell ${x},${y}`).toBe(painted);
    }
  }
});

// ─── cost ────────────────────────────────────────────────────────────────────

test('a press inside a long scrolled list resolves its scope quickly', async () => {
  const c = await newContainer();
  const viewport = box(c, {
    width: 40, height: 20, scrollTop: 2000, flexDirection: 'column', selectionScope: true,
  });
  for (let i = 0; i < 5000; i++) {
    const row = box(c, { width: 40, height: 1 }, viewport);
    text(c, row, `row ${i}`);
  }
  computeLayout(c, 40, 20);
  const frame = { left: 0, top: 0, width: 40, height: 20 };
  const started = Date.now();
  for (let i = 0; i < 50; i++) {
    expect(selectionScopeAt(c, 3, i % 20, frame)).not.toBeNull();
    expect(selectionScopeAt(c, 5, (i + 7) % 20, frame)).not.toBeNull();
  }
  expect(Date.now() - started).toBeLessThan(4000);
});

test('an unselectable overlay painted OVER a scope is still taken out of it', async () => {
  // The mirror of the case above: a menu dropdown (absolute, opaque, chrome)
  // opened over a scoped pane. It is painted after the pane, so its glyphs are
  // what a drag inside the pane would pick up — and must not be copied.
  const c = await newContainer();
  const root = box(c, { width: 20, height: 4, flexDirection: 'column' });
  box(c, { width: 20, height: 4, selectionScope: true }, root);
  box(c, {
    position: 'absolute', top: 1, left: 4, width: 6, height: 2,
    backgroundColor: 'default', selectable: false,
  }, root);
  computeLayout(c, 20, 4);
  const scope = selectionScopeAt(c, 2, 0, { left: 0, top: 0, width: 20, height: 4 });
  expect(scope!.excluded).toEqual([{ left: 4, top: 1, width: 6, height: 2 }]);
});

test('a press ON an unselectable overlay anchors, with the overlay taken out', async () => {
  // The same dropdown, pressed rather than dragged across. Nothing scopes the
  // press — the dropdown is a sibling of the pane, not inside it — so the drag
  // is a frame-wide one, exactly as the terminal's own selection would be, and
  // the dropdown's own cells are excluded from it.
  const c = await newContainer();
  const root = box(c, { width: 20, height: 4, flexDirection: 'column' });
  box(c, { width: 20, height: 4, selectionScope: true }, root);
  box(c, {
    position: 'absolute', top: 1, left: 4, width: 6, height: 2,
    backgroundColor: 'default', selectable: false,
  }, root);
  computeLayout(c, 20, 4);
  const frame = { left: 0, top: 0, width: 20, height: 4 };
  const scope = selectionScopeAt(c, 5, 1, frame);
  expect(scope).not.toBeNull();
  expect(scope!.clip).toEqual(frame);
  expect(scope!.excluded).toContainEqual({ left: 4, top: 1, width: 6, height: 2 });
});
