import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga, computeLayout, layoutOf } from '@flowtty/core';
import { createRoot } from './reconciler.js';

test('row layout places two fixed-width boxes side by side', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
      createElement('flowtty-box', { width: 3, height: 1 }),
      createElement('flowtty-box', { width: 3, height: 1 }),
    ),
  );
  computeLayout(container, 10, 1);
  const outer = container.children[0]!;
  const boxes = outer.children.filter((c) => c.type === 'box');
  expect(layoutOf(boxes[0]!)).toMatchObject({ left: 0, top: 0, width: 3, height: 1 });
  expect(layoutOf(boxes[1]!)).toMatchObject({ left: 3, top: 0, width: 3, height: 1 });
});
