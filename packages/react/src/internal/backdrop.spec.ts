import { describe, expect, test } from 'vitest';
import { createElement as h } from 'react';
import { getYoga, computeLayout, paint } from '@flowtty/core/host';
import { createRoot } from './reconciler.js';

async function paintTree(tree: unknown, w = 10, hgt = 3) {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(tree as never);
  computeLayout(container, w, hgt);
  return paint(container, w, hgt);
}

describe('backdrop', () => {
  test('backdrop="dim" restyles what is already painted under the box instead of covering it', async () => {
    const buffer = await paintTree(
      h('flowtty-box', { width: 10, height: 3, flexDirection: 'column' },
        h('flowtty-box', { height: 1, color: 'red', bold: true }, 'under me'),
        h('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 5, height: 3, backdrop: 'dim' }),
      ),
    );
    expect(buffer.toString().split('\n')[0]).toBe('under me'); // the characters survive
    expect(buffer.get(0, 0).style).toMatchObject({ dim: true, fg: 'red' });
    expect(buffer.get(0, 0).style.bold).toBeFalsy();           // dim + bold fight each other in a terminal
    expect(buffer.get(7, 0).style.dim).toBeFalsy();            // outside the backdrop: untouched
    expect(buffer.get(7, 0).style.bold).toBe(true);
  });

  test('the backdrop\'s own children paint on top, undimmed', async () => {
    const buffer = await paintTree(
      h('flowtty-box', { width: 10, height: 3, flexDirection: 'column' },
        h('flowtty-box', { height: 1 }, 'background'),
        h('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 10, height: 3, backdrop: 'dim', flexDirection: 'column' },
          h('flowtty-box', { height: 1 }, 'DIALOG')),
      ),
    );
    expect(buffer.toString().split('\n')[0]).toBe('DIALOGound');
    expect(buffer.get(0, 0).style.dim).toBeFalsy();   // dialog text
    expect(buffer.get(8, 0).style.dim).toBe(true);    // what is left of the background
  });

  test('a backdrop respects an inherited clip', async () => {
    const buffer = await paintTree(
      h('flowtty-box', { width: 10, height: 3, flexDirection: 'column' },
        h('flowtty-box', { height: 1 }, '0123456789'),
        h('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 4, height: 1, overflow: 'hidden' },
          h('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 10, height: 1, backdrop: 'dim' })),
      ),
    );
    expect(buffer.get(3, 0).style.dim).toBe(true);
    expect(buffer.get(4, 0).style.dim).toBeFalsy();
  });

  test('stacked backdrops never darken twice: dim is a flag, so a second pass changes nothing', async () => {
    const under = (extra: unknown[]) => h('flowtty-box', { width: 10, height: 3, flexDirection: 'column' },
      h('flowtty-box', { height: 1, color: 'red' }, 'background'),
      ...extra as never[]);
    const layer = (key: string) => h('flowtty-box', { key, position: 'absolute', top: 0, left: 0, width: 10, height: 3, backdrop: 'dim' });
    const once = await paintTree(under([layer('a')]));
    const thrice = await paintTree(under([layer('a'), layer('b'), layer('c')]));
    for (let x = 0; x < 10; x++) expect(thrice.get(x, 0)).toEqual(once.get(x, 0));
  });
});
