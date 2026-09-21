import { expect, test } from 'vitest';
import { getYoga } from './yoga.js';
import { createInstance, createTextInstance, appendChild, type Container } from './host.js';
import { computeLayout, contentHeight } from './layout.js';

async function container(): Promise<Container> {
  const Yoga = await getYoga();
  return { children: [], Yoga };
}

function addRoot(c: Container, props: Parameters<typeof createInstance>[1]): ReturnType<typeof createInstance> {
  const root = createInstance('flowtty-box', props, c.Yoga);
  c.children.push(root);
  return root;
}

test('contentHeight is 0 for an empty container', async () => {
  const c = await container();
  computeLayout(c, 20, undefined);
  expect(contentHeight(c)).toBe(0);
});

test('contentHeight is the height of a single root', async () => {
  const c = await container();
  addRoot(c, { height: 3, width: 4 });
  computeLayout(c, 20, undefined);
  expect(contentHeight(c)).toBe(3);
});

test('contentHeight counts a root offset by its margin', async () => {
  const c = await container();
  addRoot(c, { height: 3, marginTop: 2 });
  computeLayout(c, 20, undefined);
  expect(contentHeight(c)).toBe(5);
});

test('contentHeight is the max over several roots', async () => {
  const c = await container();
  addRoot(c, { height: 2 });
  addRoot(c, { height: 7 });
  computeLayout(c, 20, undefined);
  expect(contentHeight(c)).toBe(7);
});

test('contentHeight rounds a fractional height up', async () => {
  const c = await container();
  addRoot(c, { height: 2.5 });
  computeLayout(c, 20, undefined);
  expect(contentHeight(c)).toBe(3);
});

test('an undefined height lets a column of text grow to its content', async () => {
  const c = await container();
  const root = addRoot(c, { flexDirection: 'column' });
  for (const line of ['one', 'two', 'three']) {
    const box = createInstance('flowtty-box', {}, c.Yoga);
    appendChild(box, createTextInstance(line, c.Yoga), c.Yoga);
    appendChild(root, box, c.Yoga);
  }
  computeLayout(c, 20, undefined);
  expect(contentHeight(c)).toBe(3);
});

test('a percent height against an undefined parent height resolves to auto', async () => {
  const c = await container();
  const root = addRoot(c, { height: '50%' });
  appendChild(root, createTextInstance('a\nb', c.Yoga), c.Yoga);
  computeLayout(c, 20, undefined);
  // Nothing to take a percentage of — the box falls back to its content.
  expect(contentHeight(c)).toBe(2);
});
