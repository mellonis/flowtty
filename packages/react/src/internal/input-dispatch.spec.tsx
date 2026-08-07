import React from 'react';
import { expect, test } from 'vitest';
import { createElement, useContext, useEffect, useState } from 'react';
import { render } from '../index.js';
import { InputContext, type InputSource } from '../context/inputContext.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// Discrete-event dispatch semantics (see makeKeySource in render.ts): a key
// must be delivered through the subscriber set as it stands AFTER the passive
// effects of already-committed updates have flushed. react-reconciler@0.33
// defers those effects to a scheduler macrotask, so without the pre-dispatch
// flush a subscription change committed right before a key (dialog muted a
// region, a box turned inert) would not apply to that key.
test('a subscription swap committed before a key applies to that key', async () => {
  const backend = new TestBackend(10, 2);
  const received: string[] = [];
  const mutedSource: InputSource = { subscribe: () => () => {} };
  let setMuted!: (b: boolean) => void;

  function Inner() {
    const source = useContext(InputContext);
    useEffect(() => source.subscribe((k) => { received.push(k.name); }), [source]);
    return createElement('flowtty-box', { width: 5, height: 1 }, 'x');
  }
  function App() {
    const [muted, set] = useState(false);
    setMuted = set;
    return muted
      ? createElement(InputContext.Provider, { value: mutedSource }, createElement(Inner))
      : createElement(Inner);
  }

  const handle = await render(createElement(App), backend);
  await flushAsync();
  backend.press({ name: 'a', sequence: 'a', ctrl: false, meta: false, shift: false });
  await flushAsync();
  expect(received).toEqual(['a']);
  setMuted(true);
  // Deliberately a single macrotask round: the mute COMMITS here, but its
  // passive effects (the re-subscription) may still be pending — the
  // pre-dispatch flush inside the key path must cover that gap.
  await flushAsync();
  backend.press({ name: 'b', sequence: 'b', ctrl: false, meta: false, shift: false });
  await flushAsync();
  expect(received).toEqual(['a']); // 'b' must not reach the now-muted subscriber
  handle.unmount();
});
