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
