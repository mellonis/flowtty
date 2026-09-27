import { expect, test } from 'vitest';
import type { Key } from '../keys.js';
import { getYoga } from './yoga.js';
import { appendChild, createInstance, type BoxProps, type Container, type Instance } from './host.js';
import { computeLayout } from './layout.js';
import { MouseController } from './mouse.js';

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
const key = (name: string, x: number, y: number, extra: Partial<Key> = {}): Key =>
  ({ name, sequence: '', ctrl: false, meta: false, shift: false, x, y, button: 'left', ...extra });
const down = (x: number, y: number, extra: Partial<Key> = {}) => key('mousedown', x, y, extra);
const up = (x: number, y: number) => key('mouseup', x, y);
const drag = (x: number, y: number) => key('mousedrag', x, y);
const move = (x: number, y: number) => key('mousemove', x, y);

test('a press and a release in one cell over a box with onClick deliver one click to it, and both keys are withheld', async () => {
  const c = await newContainer();
  const clicks: Key[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onClick: (k) => clicks.push(k) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(3, 1))).toBe(true);
  expect(m.handle(up(3, 1))).toBe(true);
  expect(clicks.map((k) => [k.name, k.x, k.y])).toEqual([['mouseup', 3, 1]]);
});

test('the nearest ancestor with onClick gets the click; a box without one does not stop the walk', async () => {
  const c = await newContainer();
  const got: string[] = [];
  const outer = box(c, { width: 20, height: 5, onClick: () => got.push('outer') });
  const inner = box(c, { width: 10, height: 3 }, outer);
  box(c, { width: 4, height: 1 }, inner);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(down(1, 0)); m.handle(up(1, 0));
  expect(got).toEqual(['outer']);
});

test('where boxes overlap, the one painted on top wins', async () => {
  const c = await newContainer();
  const got: string[] = [];
  const root = box(c, { width: 20, height: 5 });
  box(c, { position: 'absolute', left: 0, top: 0, width: 10, height: 2, onClick: () => got.push('under') }, root);
  box(c, { position: 'absolute', left: 0, top: 0, width: 10, height: 2, zIndex: 1, onClick: () => got.push('over') }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(down(2, 1)); m.handle(up(2, 1));
  expect(got).toEqual(['over']);
});

test('a drag between press and release cancels the click; the release is then passed on', async () => {
  const c = await newContainer();
  let clicks = 0;
  const root = box(c, { width: 20, height: 5 });
  box(c, { width: 6, height: 2, onClick: () => { clicks += 1; } }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(1, 0))).toBe(true);
  expect(m.handle(drag(2, 0))).toBe(false);
  expect(m.handle(up(2, 0))).toBe(false);
  expect(clicks).toBe(0);
});

test('a press with another button, or on a cell with no onClick, delivers nothing and withholds nothing', async () => {
  const c = await newContainer();
  let clicks = 0;
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onClick: () => { clicks += 1; } }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(1, 0, { button: 'right' }))).toBe(false);
  expect(m.handle(up(1, 0))).toBe(false);
  expect(m.handle(down(1, 4))).toBe(false);
  expect(m.handle(up(1, 4))).toBe(false);
  expect(clicks).toBe(0);
});

test('a box whose scope is muted is skipped, and so are its ancestors in the same scope', async () => {
  const c = await newContainer();
  const got: string[] = [];
  let muted = true;
  const scope = { isMuted: () => muted };
  const page = box(c, { width: 20, height: 5, onClick: () => got.push('page'), mouseScope: scope });
  box(c, { width: 6, height: 2, onClick: () => got.push('row'), mouseScope: scope }, page);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(1, 0))).toBe(false);
  expect(m.handle(up(1, 0))).toBe(false);
  expect(got).toEqual([]);
  muted = false;
  m.handle(down(1, 0)); m.handle(up(1, 0));
  expect(got).toEqual(['row']);
});

test('hover: entering a box calls onHoverChange(true) once, leaving it calls false once; moving inside it calls nothing', async () => {
  const c = await newContainer();
  const calls: boolean[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onHoverChange: (h) => calls.push(h) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  m.handle(move(2, 0));
  m.handle(move(5, 1));
  expect(calls).toEqual([true]);
  m.handle(move(10, 4));
  expect(calls).toEqual([true, false]);
});

test('hover: nested boxes are hovered together; leaving the inner one keeps the outer one on', async () => {
  const c = await newContainer();
  const calls: string[] = [];
  const panel = box(c, { width: 20, height: 5, padding: 1, onHoverChange: (h) => calls.push(`panel:${h}`) });
  box(c, { width: 6, height: 1, onHoverChange: (h) => calls.push(`row:${h}`) }, panel);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(2, 1));
  expect(calls).toEqual(['panel:true', 'row:true']);
  m.handle(move(2, 3));
  expect(calls).toEqual(['panel:true', 'row:true', 'row:false']);
});

test('hover: a mouseleave clears every hovered box, and a drag does not move the hover', async () => {
  const c = await newContainer();
  const calls: boolean[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onHoverChange: (h) => calls.push(h) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  m.handle(drag(10, 4));
  expect(calls).toEqual([true]);
  m.handle(key('mouseleave', -1, -1, { x: undefined, y: undefined }));
  expect(calls).toEqual([true, false]);
});

test('hover: observe() after a paint re-evaluates the last cell — content that moved under a resting pointer updates', async () => {
  const c = await newContainer();
  const calls: string[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  const a = box(c, { width: 6, height: 1, onHoverChange: (h) => calls.push(`a:${h}`) }, root);
  const b = box(c, { width: 6, height: 1, onHoverChange: (h) => calls.push(`b:${h}`) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  expect(calls).toEqual(['a:true']);
  // The rows swap places (a re-render reordered them); the pointer did not
  // move. `appendChild` detaches a live child before re-attaching it (the
  // React reorder path — see host.ts), so the Yoga tree follows without
  // freeing and re-creating the node.
  appendChild(root, a, c.Yoga);
  computeLayout(c, 20, 5);
  m.observe();
  expect(calls).toEqual(['a:true', 'a:false', 'b:true']);
});

test('dispose() clears the hover without further callbacks after it', async () => {
  const c = await newContainer();
  const calls: boolean[] = [];
  const root = box(c, { width: 20, height: 5 });
  box(c, { width: 6, height: 2, onHoverChange: (h) => calls.push(h) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  m.dispose();
  expect(calls).toEqual([true, false]);
  m.observe();
  expect(calls).toEqual([true, false]);
});
