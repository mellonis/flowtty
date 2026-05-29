import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { Select, type SelectProps } from './select.js';

test('Select renders items with a cursor row marker', async () => {
  function App() {
    return createElement(Select, {
      items: [
        { label: 'apple', value: 'a' },
        { label: 'banana', value: 'b' },
      ],
      value: 'a',
      onChange: () => {},
      onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ apple\n  banana');
});

test('down arrow moves cursor', async () => {
  function App() {
    return createElement(Select, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }],
      value: 'a', onChange: () => {}, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });
  await flush();
  expect(backend.lastFrame).toBe('  a\n▸ b');
});

test('typing filters and re-renders only matching items + filter row', async () => {
  function App() {
    return createElement(Select, {
      items: [
        { label: 'apple', value: 'a' },
        { label: 'banana', value: 'b' },
        { label: 'cherry', value: 'c' },
      ],
      value: 'a', onChange: () => {}, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 4);
  await render(createElement(App), backend);
  backend.type('an');
  await flush();
  expect(backend.lastFrame).toBe('filter: an\n▸ banana');
});

test('enter calls onSubmit with the highlighted value', async () => {
  const submitted: string[] = [];
  function App() {
    return createElement<SelectProps<string>>(Select, {
      items: [{ label: 'a', value: 'A' }, { label: 'b', value: 'B' }],
      value: 'A', onChange: () => {}, onSubmit: (v: string) => submitted.push(v),
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(submitted).toEqual(['B']);
});

test('esc calls onCancel', async () => {
  let cancelled = false;
  function App() {
    return createElement(Select, {
      items: [{ label: 'a', value: 'A' }],
      value: 'A', onChange: () => {}, onSubmit: () => {}, onCancel: () => { cancelled = true; },
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'escape' });
  await flush();
  expect(cancelled).toBe(true);
});

test('isFocused=false suppresses key handling', async () => {
  function App() {
    return createElement(Select, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }],
      value: 'a', onChange: () => {}, onSubmit: () => {}, isFocused: false,
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });
  await flush();
  expect(backend.lastFrame).toBe('▸ a\n  b');
});
