import { expect, test } from 'vitest';
import { getYoga } from './yoga.js';
import { createInstance, createTextInstance, appendChild, removeChild, measureText } from './host.js';

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
