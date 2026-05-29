import { expect, test } from 'vitest';
import { getYoga } from '../src/yoga.js';
import { createInstance, createTextInstance, appendChild, removeChild } from '../src/host.js';

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
  appendChild(parent, child);
  expect(parent.children).toContain(child);
  expect(parent.yogaNode.getChildCount()).toBe(1);
  removeChild(parent, child);
  expect(parent.children).not.toContain(child);
  expect(parent.yogaNode.getChildCount()).toBe(0);
});
