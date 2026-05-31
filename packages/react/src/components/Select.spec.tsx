import React from "react";
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from '../index.js';
import { TestBackend, flush } from '@flowtty/core/testing';
import { Select, type SelectProps } from './Select.js';
import { MultiSelect } from './MultiSelect.js';
import { Confirm } from './Confirm.js';

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

test('M1c.2 acceptance: Select + MultiSelect + Confirm each fire onSubmit correctly', async () => {
  // Select
  const picks: string[] = [];
  function PickApp() {
    return createElement(Select<string>, {
      items: [{ label: 'apple', value: 'A' }, { label: 'banana', value: 'B' }, { label: 'cherry', value: 'C' }],
      value: 'A', onChange: () => {}, onSubmit: (v: string) => picks.push(v),
    });
  }
  const pickBackend = new TestBackend(20, 4);
  await render(createElement(PickApp), pickBackend);
  pickBackend.type('an'); // filter → only 'banana'
  await flush();
  pickBackend.press({ name: 'return' });
  await flush();
  expect(picks).toEqual(['B']);

  // MultiSelect
  const checks: string[][] = [];
  function ChecksApp() {
    const [v, setV] = useState<string[]>([]);
    return createElement(MultiSelect<string>, {
      items: [{ label: 'one', value: '1' }, { label: 'two', value: '2' }, { label: 'three', value: '3' }],
      value: v, onChange: setV, onSubmit: (arr: string[]) => checks.push(arr),
    });
  }
  const checksBackend = new TestBackend(20, 3);
  await render(createElement(ChecksApp), checksBackend);
  checksBackend.press({ name: ' ' });           // toggle 'one' on
  await flush();
  checksBackend.press({ name: 'down' });
  await flush();
  checksBackend.press({ name: 'down' });
  await flush();
  checksBackend.press({ name: ' ' });           // toggle 'three' on
  await flush();
  checksBackend.press({ name: 'return' });
  await flush();
  expect(checks).toEqual([['1', '3']]);

  // Confirm
  const confirms: boolean[] = [];
  function ConfApp() {
    return createElement(Confirm, { message: 'go?', onSubmit: (yes: boolean) => confirms.push(yes) });
  }
  const confBackend = new TestBackend(10, 1);
  await render(createElement(ConfApp), confBackend);
  confBackend.press({ name: 'y' });
  await flush();
  expect(confirms).toEqual([true]);
});
