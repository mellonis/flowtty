import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';

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
