import { expect, test, vi } from 'vitest';
import { getYoga } from './yoga.js';
import { createInstance, createTextInstance, appendChild, removeChild, measureText, applyProps, takeApplyCounts } from './host.js';

test('box instance owns a yoga node; text instance carries text', async () => {
  const Yoga = await getYoga();
  const box = createInstance('flowtty-box', { width: 8 }, Yoga);
  const text = createTextInstance('hello', Yoga);
  expect(box.type).toBe('box');
  expect(box.yogaNode).toBeDefined();
  expect(text.type).toBe('text');
  expect(text.text).toBe('hello');
});

test('appendChild wires the yoga child; removeChild frees it', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', {}, Yoga);
  const child = createInstance('flowtty-box', {}, Yoga);
  appendChild(parent, child, Yoga);
  expect(parent.children).toContain(child);
  expect(parent.yogaNode.getChildCount()).toBe(1);
  removeChild(parent, child, Yoga);
  expect(parent.children).not.toContain(child);
  expect(parent.yogaNode.getChildCount()).toBe(0);
});

test('measureText returns longest-line width and line count', () => {
  expect(measureText('hi')).toEqual({ width: 2, height: 1 });
  expect(measureText('hi\nthere')).toEqual({ width: 5, height: 2 });
  expect(measureText('')).toEqual({ width: 0, height: 1 });
});

test('measure func: wrap mode returns wrapped dimensions when parent constrains width', async () => {
  const Yoga = await getYoga();
  // Parent box width 7, with text 'hello world' and wrap='wrap'.
  // Expected wrapped lines: ['hello', 'world'] → height 2.
  const parent = createInstance('flowtty-box', { width: 7, wrap: 'wrap' }, Yoga);
  const txt = createTextInstance('hello world', Yoga);
  appendChild(parent, txt, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(parent.yogaNode.getComputedHeight()).toBe(2);
});

test('measure func: no wrap (default) returns natural single-line width', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', {}, Yoga);
  const txt = createTextInstance('hello world', Yoga);
  appendChild(parent, txt, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(parent.yogaNode.getComputedWidth()).toBe(11);
  expect(parent.yogaNode.getComputedHeight()).toBe(1);
});

test('position absolute + top/left positions the node at fixed coords inside its parent', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', { width: 20, height: 10 }, Yoga);
  const child = createInstance('flowtty-box', { position: 'absolute', top: 3, left: 5, width: 4, height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(child.yogaNode.getComputedTop()).toBe(3);
  expect(child.yogaNode.getComputedLeft()).toBe(5);
  expect(child.yogaNode.getComputedWidth()).toBe(4);
  expect(child.yogaNode.getComputedHeight()).toBe(2);
});

test('width: "100%" sizes child to parent width', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', { width: 30, height: 5 }, Yoga);
  const child = createInstance('flowtty-box', { width: '100%', height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(child.yogaNode.getComputedWidth()).toBe(30);
});

test('justifyContent center + alignItems center centers a child in its parent', async () => {
  const Yoga = await getYoga();
  // 20x10 parent, child 4x2 → centered should be at top=4, left=8
  const parent = createInstance('flowtty-box', {
    width: 20, height: 10,
    justifyContent: 'center', alignItems: 'center',
  }, Yoga);
  const child = createInstance('flowtty-box', { width: 4, height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(child.yogaNode.getComputedTop()).toBe(4);
  expect(child.yogaNode.getComputedLeft()).toBe(8);
});

test('back-compat: a box without new props lays out exactly as before (auto size, static, FlexStart)', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', { width: 10, height: 3 }, Yoga);
  const child = createInstance('flowtty-box', { width: 5, height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(child.yogaNode.getComputedTop()).toBe(0);
  expect(child.yogaNode.getComputedLeft()).toBe(0);
  expect(child.yogaNode.getComputedWidth()).toBe(5);
  expect(child.yogaNode.getComputedHeight()).toBe(2);
});

test('measureText measures in display columns', () => {
  expect(measureText('日本語')).toEqual({ width: 6, height: 1 });
  expect(measureText('ab\n🇯🇵')).toEqual({ width: 2, height: 2 });
});

// A re-render hands every host box a new props object; the Yoga setters must
// run only when something in it changed.
test('applyProps skips the Yoga setters when the props are the same', async () => {
  const Yoga = await getYoga();
  const inst = createInstance('flowtty-box', { width: 8, flexGrow: 1, bold: true }, Yoga);
  const setWidth = vi.spyOn(inst.yogaNode, 'setWidth');
  const setFlexGrow = vi.spyOn(inst.yogaNode, 'setFlexGrow');
  const next = { width: 8, flexGrow: 1, bold: true };
  applyProps(inst, next, Yoga);
  expect(setWidth).not.toHaveBeenCalled();
  expect(setFlexGrow).not.toHaveBeenCalled();
  expect(inst.props).toBe(next); // paint reads the latest object all the same
});

test('applyProps ignores children when comparing: they reach Yoga on their own', async () => {
  const Yoga = await getYoga();
  const inst = createInstance('flowtty-box', { width: 8, children: 'a' } as never, Yoga);
  const setWidth = vi.spyOn(inst.yogaNode, 'setWidth');
  applyProps(inst, { width: 8, children: 'b' } as never, Yoga);
  expect(setWidth).not.toHaveBeenCalled();
});

test('applyProps re-applies when a prop changed, appeared or went away', async () => {
  const Yoga = await getYoga();
  const inst = createInstance('flowtty-box', { width: 8 }, Yoga);
  const setWidth = vi.spyOn(inst.yogaNode, 'setWidth');
  const setFlexGrow = vi.spyOn(inst.yogaNode, 'setFlexGrow');
  applyProps(inst, { width: 9 }, Yoga);
  expect(setWidth).toHaveBeenCalledWith(9);
  applyProps(inst, { width: 9, flexGrow: 1 }, Yoga);
  expect(setFlexGrow).toHaveBeenLastCalledWith(1);
  applyProps(inst, { width: 9 }, Yoga);
  expect(setFlexGrow).toHaveBeenLastCalledWith(0);
  expect(setWidth).toHaveBeenCalledTimes(3);
});

test('takeApplyCounts says how many boxes were applied and skipped since it was last read', async () => {
  const Yoga = await getYoga();
  takeApplyCounts();
  const inst = createInstance('flowtty-box', { width: 8 }, Yoga); // applied once
  applyProps(inst, { width: 8 }, Yoga); // skipped
  applyProps(inst, { width: 9 }, Yoga); // applied
  expect(takeApplyCounts()).toEqual({ applied: 2, skipped: 1 });
  expect(takeApplyCounts()).toEqual({ applied: 0, skipped: 0 });
});

