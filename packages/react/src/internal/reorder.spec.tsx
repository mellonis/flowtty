import React, { useState } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from './render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// React moves an existing keyed child by re-inserting the SAME host node
// (appendChild for a move to the end, insertBefore otherwise) without removing
// it first — the host has to treat that as a move, not a second attach.
async function mountList(initial: string[]) {
  let set!: (next: string[]) => void;
  function List() {
    const [items, setItems] = useState(initial);
    set = setItems;
    return <Box flexDirection="column">{items.map((t) => <Text key={t}>{t}</Text>)}</Box>;
  }
  const backend = new TestBackend(20, 6);
  const r = await render(<List />, backend);
  await flushAsync(backend);
  const rows = async (next: string[]) => {
    set(next);
    await flushAsync(backend);
    return backend.lastFrame.split('\n');
  };
  return { rows, unmount: r.unmount };
}

describe('re-ordering keyed children', () => {
  test('moving the last child to the front repaints in the new order', async () => {
    const { rows, unmount } = await mountList(['one', 'two', 'three']);
    expect(await rows(['three', 'one', 'two'])).toEqual(['three', 'one', 'two']);
    unmount();
  });

  test('moving the first child to the end repaints in the new order', async () => {
    const { rows, unmount } = await mountList(['one', 'two', 'three']);
    expect(await rows(['two', 'three', 'one'])).toEqual(['two', 'three', 'one']);
    unmount();
  });

  test('a full reversal, then a removal, leaves no duplicate or stale rows', async () => {
    const { rows, unmount } = await mountList(['a', 'b', 'c', 'd']);
    expect(await rows(['d', 'c', 'b', 'a'])).toEqual(['d', 'c', 'b', 'a']);
    expect(await rows(['d', 'b'])).toEqual(['d', 'b']);
    unmount();
  });

  test('a move combined with an insert keeps every row once', async () => {
    const { rows, unmount } = await mountList(['a', 'b', 'c']);
    expect(await rows(['c', 'new', 'a', 'b'])).toEqual(['c', 'new', 'a', 'b']);
    unmount();
  });

  test('root-level children (no wrapping box) can be re-ordered too', async () => {
    let set!: (next: string[]) => void;
    function Root() {
      const [items, setItems] = useState(['one', 'two', 'three']);
      set = setItems;
      return <>{items.map((t) => <Text key={t}>{t}</Text>)}</>;
    }
    const backend = new TestBackend(20, 6);
    const r = await render(<Root />, backend);
    await flushAsync(backend);
    // Root children overlay each other (last one paints on top), so after the
    // move 'two' covers 'one' covers 'three'.
    set(['three', 'one', 'two']);
    await flushAsync(backend);
    expect(backend.lastFrame).toBe('twoee');
    // A moved child must not linger as a second entry: once 'one' and 'two' are
    // removed, only 'three' is left to paint.
    set(['three']);
    await flushAsync(backend);
    expect(backend.lastFrame).toBe('three');
    r.unmount();
  });
});
