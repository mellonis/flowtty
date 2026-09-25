import React from "react";
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render, Box, Text } from '../index.js';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { TextInput } from './TextInput.js';

test('TextInput renders the value with a trailing cursor bar', async () => {
  function App() {
    return createElement(TextInput, { value: 'hi', onChange: () => {} });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  // Cursor defaults to end of value → 'hi' + inverse-space cursor (trims to 'hi')
  expect(backend.lastFrame).toBe('hi');
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
  expect(backend.lastFrame).toBe('hi');
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
  expect(backend.lastFrame).toBe('hell');
});

test('mask renders bullets instead of characters', async () => {
  function App() {
    return createElement(TextInput, { value: 'secret', onChange: () => {}, mask: true });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('••••••'); // six bullets + cursor bar
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

test('M1b acceptance: type, edit with cursor moves, validate-gated submit, then cancel', async () => {
  const events: string[] = [];
  function App() {
    const [v, setV] = useState('');
    return createElement(TextInput, {
      value: v,
      onChange: setV,
      validate: (x: string) => (x.length < 3 ? 'too short' : null),
      onSubmit: (final: string) => { events.push(`submit:${final}`); },
      onCancel: () => { events.push('cancel'); },
    });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);

  // Type "helo"
  backend.type('helo');
  await flush();
  expect(backend.lastFrame).toBe('helo');

  // Move cursor back one and insert 'l' to make "hello".
  // The cursor is now rendered as the actual character with inverse style (not
  // a separate cursor glyph), so the visible content is just the value chars.
  backend.press({ name: 'left' });
  await flush();
  expect(backend.lastFrame).toBe('helo');
  backend.press({ name: 'l', sequence: 'l' });
  await flush();
  expect(backend.lastFrame).toBe('hello');

  // Submit — validate passes (length 5 >= 3) → onSubmit fires with "hello"
  backend.press({ name: 'return' });
  await flush();
  expect(events).toEqual(['submit:hello']);

  // Clear with Ctrl-A (home) then Ctrl-K (kill to end), then try submit with a too-short value
  backend.press({ name: 'a', ctrl: true });    // home
  backend.press({ name: 'k', ctrl: true });    // kill to end → empty
  await flush();
  backend.type('hi');
  await flush();
  backend.press({ name: 'return' });           // validate fails (length 2 < 3) → no submit
  await flush();
  expect(events).toEqual(['submit:hello']);    // unchanged — second submit blocked

  // Cancel
  backend.press({ name: 'escape' });
  await flush();
  expect(events).toEqual(['submit:hello', 'cancel']);
});

test('M1d acceptance: <Box width=10 backgroundColor=blue><Text color=red bold wrap>hello world</Text></Box>', async () => {
  function App() {
    return createElement(Box, { width: 10, height: 3, backgroundColor: 'blue' },
      createElement(Text, { color: 'red', bold: true, wrap: 'wrap' }, 'hello world'),
    );
  }
  const backend = new TestBackend(10, 3);
  await render(createElement(App), backend);
  // Plain text frame: text wraps to two rows; bg fills the third row.
  expect(backend.lastFrame).toBe('hello\nworld');
  // Cell-level style: text cells red+bold over blue; bg-only cells just blue.
  const buf = backend.lastBuffer!;
  expect(buf.get(0, 0)).toEqual({ char: 'h', style: { fg: 'red', bold: true, bg: 'blue' } });
  expect(buf.get(4, 0)).toEqual({ char: 'o', style: { fg: 'red', bold: true, bg: 'blue' } });
  expect(buf.get(5, 0)).toEqual({ char: ' ', style: { bg: 'blue' } });
  expect(buf.get(0, 2)).toEqual({ char: ' ', style: { bg: 'blue' } });
});

test('a multi-line paste lands in the field as text and does not submit', async () => {
  let captured = '';
  let submitted: string | null = null;
  function App() {
    const [v, setV] = useState('ab');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV, onSubmit: (x: string) => { submitted = x; } });
  }
  const backend = new TestBackend(30, 1);
  await render(createElement(App), backend);
  backend.paste('line one\nline two');
  await flush();
  expect(captured).toBe('abline one line two');
  expect(submitted).toBeNull();
});

// ─── validate error rendering, defaultValue, field colors ────────────────────

test('a failed validate renders its message under the field, and the next edit clears it', async () => {
  function App() {
    const [v, setV] = useState('');
    return createElement(TextInput, { value: v, onChange: setV, validate: (x: string) => (x ? null : 'required') });
  }
  const backend = new TestBackend(12, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'return' });
  await flush();
  expect(backend.lastFrame.split('\n')).toEqual(['', 'required']);
  expect(backend.lastBuffer!.get(0, 1).style.fg).toBe('red');
  backend.type('a');
  await flush();
  expect(backend.lastFrame.split('\n')).toEqual(['a']);
});

test('showError={false} leaves error display to the consumer', async () => {
  function App() {
    const [v, setV] = useState('');
    return createElement(TextInput, { value: v, onChange: setV, validate: () => 'nope', showError: false });
  }
  const backend = new TestBackend(12, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'return' });
  await flush();
  expect(backend.lastFrame).toBe('');
});

test('defaultValue: uncontrolled — the field keeps its own value and still reports it', async () => {
  let submitted: string | null = null;
  const changes: string[] = [];
  const backend = new TestBackend(12, 1);
  await render(createElement(TextInput, {
    defaultValue: 'seed', onChange: (v: string) => changes.push(v), onSubmit: (v: string) => { submitted = v; },
  }), backend);
  expect(backend.lastFrame).toBe('seed');
  backend.type('!');
  await flush();
  expect(backend.lastFrame).toBe('seed!');
  expect(changes).toEqual(['seed!']);
  backend.press({ name: 'return' });
  await flush();
  expect(submitted).toBe('seed!');
});

test('text on the light field is drawn dark so it reads in a dark theme', async () => {
  const backend = new TestBackend(12, 1);
  await render(createElement(TextInput, { value: 'hi', onChange: () => {} }), backend);
  expect(backend.lastBuffer!.get(0, 0).style.fg).toBe('black');
});

test('an emoji is one character: typed, stepped over, deleted whole, and drawn intact under the caret', async () => {
  let captured = '';
  function App() {
    const [v, setV] = useState('a');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.type('😀b');
  await flush();
  expect(captured).toBe('a😀b');
  backend.press({ name: 'left' }); backend.press({ name: 'left' });
  await flush();
  // The caret sits ON the emoji: the whole character in one lead cell, its
  // continuation cell inverse with it, and 'b' two columns on.
  const buf = backend.lastBuffer!;
  expect(buf.get(1, 0).char).toBe('😀');
  expect(buf.get(1, 0).style.inverse).toBe(true);
  expect(buf.get(2, 0)).toEqual({ char: '', style: buf.get(1, 0).style });
  expect(buf.get(3, 0).char).toBe('b');
  backend.press({ name: 'delete' });
  await flush();
  expect(captured).toBe('ab');
});

test('mask draws one bullet per character, not per UTF-16 unit', async () => {
  const backend = new TestBackend(10, 1);
  await render(createElement(TextInput, { value: 'a😀', onChange: () => {}, mask: true }), backend);
  expect(backend.lastFrame).toBe('••');
});

test('a mouse button key is never typed into the value', async () => {
  let captured = 'ab';
  function App() {
    const [v, setV] = useState('ab');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.mouse('down', 1, 0);
  backend.mouse('drag', 2, 0);
  backend.mouse('up', 2, 0);
  backend.wheel('down', 1, 0);
  await flush();
  expect(captured).toBe('ab');
  expect(backend.lastFrame).toBe('ab');
});

// ─── frame ───────────────────────────────────────────────────────────────────

test('frame="none" is bare text sized to its content, with no background', async () => {
  const backend = new TestBackend(20, 1);
  await render(
    createElement(Box, { flexDirection: 'row' },
      createElement(Text, null, 'Search: '),
      createElement(TextInput, { value: 'ab', onChange: () => {}, frame: 'none', isFocused: false }),
      createElement(Text, null, ' | next'),
    ),
    backend,
  );
  await flush();
  expect(backend.lastFrame).toBe('Search: ab | next');
  expect(backend.lastBuffer!.get(8, 0).style.bg).toBeUndefined();
});

test('frame="border" is a three-row box with the value inside; the error line goes below it', async () => {
  const backend = new TestBackend(12, 5);
  await render(
    createElement(Box, { flexDirection: 'column' },
      createElement(TextInput, { value: '', onChange: () => {}, frame: 'border', validate: () => 'required' }),
    ),
    backend,
  );
  await flush();
  const lines = backend.lastFrame.split('\n');
  expect(lines[0]!.trimEnd().length).toBe(12);   // top border across the column
  expect(lines[2]!.trimEnd().length).toBe(12);   // bottom border
  expect(backend.lastBuffer!.get(1, 1).style.bg).toBe('rgb(211,211,211)'); // the band inside
  backend.press({ name: 'return' });
  await flush();
  expect(backend.lastFrame.split('\n')[3]).toBe('required');
});

test('the default frame is the band, stretched across the column', async () => {
  const backend = new TestBackend(12, 1);
  await render(
    createElement(Box, { flexDirection: 'column' }, createElement(TextInput, { value: 'ab', onChange: () => {}, isFocused: false })),
    backend,
  );
  await flush();
  expect(backend.lastBuffer!.get(10, 0).style.bg).toBe('rgb(211,211,211)');
});

// ─── in a row ────────────────────────────────────────────────────────────────

test('in a row the band takes the remaining width, and typed text shows', async () => {
  const backend = new TestBackend(20, 1);
  function App() {
    const [v, setV] = useState('');
    return createElement(Box, { flexDirection: 'row' }, createElement(Text, null, 'Name: '), createElement(TextInput, { value: v, onChange: setV, flexGrow: 1 }));
  }
  await render(createElement(App), backend);
  await flush();
  expect(backend.lastBuffer!.get(19, 0).style.bg).toBe('rgb(211,211,211)'); // the band reaches the edge
  backend.type('abc');
  await flush();
  expect(backend.lastFrame).toContain('Name: abc');
});

test('frame="none" in a row grows with its text while typed into', async () => {
  const backend = new TestBackend(20, 1);
  function App() {
    const [v, setV] = useState('');
    return createElement(Box, { flexDirection: 'row' }, createElement(Text, null, 'Search: '), createElement(TextInput, { value: v, onChange: setV, frame: 'none' }), createElement(Text, null, ' |'));
  }
  await render(createElement(App), backend);
  await flush();
  backend.type('abc');
  await flush();
  expect(backend.lastFrame).toBe('Search: abc  |');   // the caret cell after the text, then the sibling
});

test('width pins the band, and the text scrolls inside it', async () => {
  const backend = new TestBackend(20, 1);
  function App() {
    const [v, setV] = useState('');
    return createElement(Box, { flexDirection: 'row' }, createElement(TextInput, { value: v, onChange: setV, width: 6 }), createElement(Text, null, '|'));
  }
  await render(createElement(App), backend);
  await flush();
  backend.type('abcdefgh');
  await flush();
  expect(backend.lastFrame).toBe('defgh |');           // 6 cells: the last five characters and the caret
});

// ─── display columns ─────────────────────────────────────────────────────────

test('the caret on a wide glyph covers both of its cells', async () => {
  function App() {
    return createElement(TextInput, { value: 'a日b', onChange: () => {}, isFocused: true, frame: 'none' });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  // The caret starts at the end; two steps left put it on 日 (the editor steps by cluster).
  backend.press({ name: 'left' });
  backend.press({ name: 'left' });
  await flush();
  const buf = backend.lastBuffer!;
  expect([0, 1, 2, 3].map((x) => buf.get(x, 0).char)).toEqual(['a', '日', '', 'b']);
  expect(buf.get(1, 0).style.inverse).toBe(true);
  expect(buf.get(2, 0).style.inverse).toBe(true);
  expect(buf.get(3, 0).style.inverse).toBeUndefined();
});

test('scrolling through wide text leaves a blank column instead of half a glyph at the window edge', async () => {
  function App() {
    // The default `field` band stretches to its width and windows the text (`none` is content-sized and grows instead).
    return createElement(TextInput, { value: '日本語日本語', onChange: () => {}, width: 5, isFocused: true });
  }
  const backend = new TestBackend(5, 1);
  await render(createElement(App), backend);
  await flushAsync(backend); // onLayout has delivered the width
  // Each caret move commits synchronously, with the band's width along with it.
  backend.press({ name: 'home' });
  await flush();
  // Window [0, 5): 日 (0–1), 本 (2–3), 語 would need 4–5 → blank at 4.
  expect(backend.lastFrame).toBe('日本');
  backend.press({ name: 'end' });
  await flush();
  // Caret at the end (column 12) → window is columns [8, 13): 本 (8–9), 語 (10–11), the caret cell (12).
  expect(backend.lastFrame).toBe('本語');
});

test('a masked value shows one dot per cluster', async () => {
  function App() {
    return createElement(TextInput, { value: '🇯🇵a', onChange: () => {}, mask: true, frame: 'none' });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('••');
});
