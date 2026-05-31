import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga, type Key } from '@flowtty/core';
import { createRoot } from '../internal/reconciler.js';
import { useInput } from './useInput.js';
import { InputContext, type KeySubscriber } from '../context/inputContext.js';

test('useInput subscribes via context and receives dispatched keys', async () => {
  const subscribers = new Set<KeySubscriber>();
  const source = {
    subscribe(h: KeySubscriber) { subscribers.add(h); return () => { subscribers.delete(h); }; },
  };
  const seen: string[] = [];
  function Probe() {
    useInput((k) => seen.push(k.name));
    return createElement('flowtty-box');
  }
  const Yoga = await getYoga();
  const { root } = createRoot(Yoga);
  root.render(
    createElement(InputContext.Provider, { value: source }, createElement(Probe)),
  );
  // Effects (subscriptions) flush in a microtask; await one round.
  await Promise.resolve();
  // Dispatch a key to all subscribers
  const k: Key = { name: 'a', sequence: 'a', ctrl: false, meta: false, shift: false };
  for (const h of [...subscribers]) h(k);
  expect(seen).toEqual(['a']);
  root.unmount();
  // After unmount, the cleanup should have removed the subscriber
  await Promise.resolve();
  for (const h of [...subscribers]) h({ ...k, name: 'b' });
  expect(seen).toEqual(['a']); // no new event after unmount
});
