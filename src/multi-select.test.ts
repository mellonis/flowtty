import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { MultiSelect } from './multi-select.js';

test('renders all items with [ ] or [x] + cursor marker', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [
        { label: 'a', value: 'a' },
        { label: 'b', value: 'b' },
        { label: 'c', value: 'c' },
      ],
      value: ['b'],
      onChange: () => {},
      onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ [ ] a\n  [x] b\n  [ ] c');
});

test('space toggles cursor item (onChange fires with updated array, original-item-order)', async () => {
  const captured: string[][] = [];
  function App() {
    const [v, setV] = useState<string[]>([]);
    captured.push(v);
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }],
      value: v, onChange: setV, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['a']);
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['a', 'b']);
  backend.press({ name: 'up' });
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['b']);
});

test('enter submits the current value array in original item order', async () => {
  const submitted: string[][] = [];
  function App() {
    const [v, setV] = useState<string[]>(['b']);
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }, { label: 'c', value: 'c' }],
      value: v, onChange: setV, onSubmit: (arr: string[]) => submitted.push(arr),
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: ' ' }); // toggle 'a' on
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(submitted).toEqual([['a', 'b']]);
});

test('onAddNew prop adds a "+ add new" row at the bottom (after items)', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: () => {},
      onAddNew: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ [ ] a\n  + add new');
});

test('Enter on "+ add new" row calls onAddNew (NOT onSubmit)', async () => {
  let addCalled = false;
  const submits: string[][] = [];
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: (v) => submits.push(v),
      onAddNew: () => { addCalled = true; },
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });   // cursor → '+ add new'
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(addCalled).toBe(true);
  expect(submits).toEqual([]);
});

test('Space on "+ add new" row is a noop (no onChange)', async () => {
  let toggled = false;
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: (v: string[]) => { toggled = v.length > 0; }, onSubmit: () => {},
      onAddNew: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });   // cursor → '+ add new'
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(toggled).toBe(false);
});

test('without onAddNew, no "+ add new" row (back-compat)', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ [ ] a');
});
