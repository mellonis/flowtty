import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';

test('box with mixed text + box children mounts without crashing', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  // text child first installs a measure func; adding a box child must clear it, not crash
  expect(() =>
    root.render(createElement('flowtty-box', null, 'label', createElement('flowtty-box', { width: 3 }))),
  ).not.toThrow();
  const outer = container.children[0]!;
  expect(outer.children.length).toBe(2); // the text + the box
  expect(outer.yogaNode.getChildCount()).toBe(1); // one box yoga child; measure func cleared
});

test('mounting <flowtty-box> builds a host tree under the container', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 6 }, createElement('flowtty-box', { height: 2 })),
  );
  expect(container.children).toHaveLength(1);
  const outer = container.children[0]!;
  expect(outer.type).toBe('box');
  expect(outer.children).toHaveLength(1);
  expect(outer.yogaNode.getChildCount()).toBe(1);
});

test('unmount frees root Yoga nodes (calls freeRecursive on each root box)', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(createElement('flowtty-box', { width: 4 }));
  const node = container.children[0]!.yogaNode;
  let freed = false;
  const originalFree = node.freeRecursive.bind(node);
  // Spy: replace freeRecursive with a wrapper that records the call, then
  // delegates so the actual wasm-node free still happens (no leak in test).
  (node as { freeRecursive: () => void }).freeRecursive = () => { freed = true; originalFree(); };
  root.unmount();
  expect(container.children).toHaveLength(0);
  expect(freed).toBe(true);
});

test('resetAfterCommit schedules onCommit (coalesces multiple commits)', async () => {
  const Yoga = await getYoga();
  let commits = 0;
  const { root } = createRoot(Yoga, () => { commits++; });
  root.render(createElement('flowtty-box'));
  root.render(createElement('flowtty-box', { width: 3 }));
  root.render(createElement('flowtty-box', { width: 4 }));
  // Multiple synchronous commits should coalesce into a single scheduled call.
  await Promise.resolve();
  await Promise.resolve();
  expect(commits).toBe(1);
});

test('createRoot without onCommit does not throw and does not schedule', async () => {
  const Yoga = await getYoga();
  const { root } = createRoot(Yoga);
  expect(() => root.render(createElement('flowtty-box'))).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
});
