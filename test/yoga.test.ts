import { expect, test } from 'vitest';
import { getYoga } from '../src/yoga.js';

test('getYoga loads once and computes a simple layout', async () => {
  const Yoga = await getYoga();
  const root = Yoga.Node.create();
  root.setWidth(10);
  root.setHeight(4);
  root.calculateLayout(undefined, undefined);
  expect(root.getComputedWidth()).toBe(10);
  expect(root.getComputedHeight()).toBe(4);
  root.freeRecursive();
});

test('getYoga returns the same instance on repeated calls', async () => {
  const a = await getYoga();
  const b = await getYoga();
  expect(a).toBe(b);
});
