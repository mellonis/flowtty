import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { TextInput } from './text-input.js';

test('TextInput renders the value with a trailing cursor bar', async () => {
  function App() {
    return createElement(TextInput, { value: 'hi', onChange: () => {} });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  // Cursor defaults to end of value → 'hi' + '▏' (3 cells)
  expect(backend.lastFrame).toBe('hi▏');
});

test('typing appends characters and onChange fires per key', async () => {
  let captured = '';
  function App() {
    const [v, setV] = useState('');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.type('hi');
  await flush();
  expect(captured).toBe('hi');
  expect(backend.lastFrame).toBe('hi▏');
});

test('backspace removes the char before cursor', async () => {
  function App() {
    const [v, setV] = useState('hello');
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'backspace' });
  await flush();
  expect(backend.lastFrame).toBe('hell▏');
});

test('mask renders bullets instead of characters', async () => {
  function App() {
    return createElement(TextInput, { value: 'secret', onChange: () => {}, mask: true });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('••••••▏'); // six bullets + cursor bar
});

test('isFocused: false suppresses key handling (value unchanged)', async () => {
  let captured = '';
  function App() {
    const [v, setV] = useState('a');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV, isFocused: false });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.type('xy');
  await flush();
  expect(captured).toBe('a');
});
