import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';

test('paints text inside a box at the box origin', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(createElement('flowtty-box', { width: 5, height: 1 }, 'hi'));
  computeLayout(container, 5, 1);
  const buffer = paint(container, 5, 1);
  expect(buffer.toString()).toBe('hi');
});

test('paints two row children at their computed columns', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { flexDirection: 'row', width: 6, height: 1 },
      createElement('flowtty-box', { width: 2, height: 1 }, 'ab'),
      createElement('flowtty-box', { width: 2, height: 1 }, 'cd'),
    ),
  );
  computeLayout(container, 6, 1);
  const buffer = paint(container, 6, 1);
  expect(buffer.toString()).toBe('abcd');
});
