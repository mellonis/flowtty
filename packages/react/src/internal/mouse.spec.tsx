import React from 'react';
import { createElement, useState, type ReactNode } from 'react';
import { expect, test } from 'vitest';
import type { Key } from '@flowtty/core';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { render } from './render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { DialogHost } from '../components/DialogHost.js';
import { useDialogHost } from '../hooks/useDialog.js';
import { useInput } from '../hooks/useInput.js';

test('onClick on a Box fires on press + release in one cell, and neither key reaches useInput', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: string[] = [];
  const seen: string[] = [];
  function App() {
    useInput((k) => { seen.push(k.name); });
    return (
      <Box flexDirection="column">
        <Text onClick={(k: Key) => clicks.push(`row1@${k.x},${k.y}`)}>row 1</Text>
        <Text>row 2</Text>
      </Box>
    );
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('down', 2, 0); backend.mouse('up', 2, 0);
  await flush();
  expect(clicks).toEqual(['row1@2,0']);
  expect(seen).toEqual([]);
  backend.mouse('down', 2, 1); backend.mouse('up', 2, 1);
  await flush();
  expect(clicks).toEqual(['row1@2,0']);
  expect(seen).toEqual(['mousedown', 'mouseup']);
  r.unmount();
});

test('a drag off the box cancels the click; the release reaches useInput', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: number[] = [];
  const seen: string[] = [];
  function App() {
    useInput((k) => { seen.push(k.name); });
    return <Text onClick={() => clicks.push(1)}>row 1</Text>;
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('drag', 3, 0); backend.mouse('up', 3, 0);
  await flush();
  expect(clicks).toEqual([]);
  expect(seen).toEqual(['mousedrag', 'mouseup']);
  r.unmount();
});

test('a box under inert gets no click; the keys go on to useInput', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: number[] = [];
  const seen: string[] = [];
  function App() {
    useInput((k) => { seen.push(k.name); });
    return <Box inert><Text onClick={() => clicks.push(1)}>row 1</Text></Box>;
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
  await flush();
  expect(clicks).toEqual([]);
  expect(seen).toEqual(['mousedown', 'mouseup']);
  r.unmount();
});

test('the page under an open dialog gets no click', async () => {
  const backend = new TestBackend(20, 6);
  const clicks: number[] = [];
  let open!: () => void;
  function Page() {
    const host = useDialogHost();
    open = () => { void host.openDialog(<Text>dialog</Text>, { floating: true, anchor: { left: 10, top: 3, width: 8, height: 1 } }); };
    return <Text onClick={() => clicks.push(1)}>row 1</Text>;
  }
  const r = await render(<DialogHost><Page /></DialogHost>, backend);
  await flushAsync(backend);
  open();
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
  await flush();
  expect(clicks).toEqual([]);
  r.unmount();
});

test('render({ mouse: false }) delivers no clicks at all', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: number[] = [];
  const r = await render(<Text onClick={() => clicks.push(1)}>row 1</Text>, backend, { mouse: false });
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
  await flush();
  expect(clicks).toEqual([]);
  r.unmount();
});

test('hover follows content that scrolls under a resting pointer', async () => {
  const backend = new TestBackend(20, 4);
  const calls: string[] = [];
  let setOrder!: (o: string[]) => void;
  function App() {
    const [order, set] = useState(['a', 'b']);
    setOrder = set;
    return (
      <Box flexDirection="column">
        {order.map((id) => <Text key={id} onHoverChange={(h: boolean) => calls.push(`${id}:${h}`)}>{id}</Text>)}
      </Box>
    );
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('move', 0, 0);
  await flush();
  expect(calls).toEqual(['a:true']);
  setOrder(['b', 'a']);
  await flushAsync(backend);
  expect(calls).toEqual(['a:true', 'a:false', 'b:true']);
  r.unmount();
});

test('onClick flipping between a handler and undefined does not remount the box', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: number[] = [];
  let nextId = 0;
  let setEnabled!: (enabled: boolean) => void;
  // A fresh mount picks a new id (via the lazy initializer); a re-render of
  // the SAME instance keeps it. Unlike component state, `nextId` lives
  // outside React and is not reset by a remount, so it tells the two apart.
  function Child() {
    const [id] = useState(() => ++nextId);
    return <Text>{String(id)}</Text>;
  }
  function App() {
    const [enabled, setState] = useState(true);
    setEnabled = setState;
    return (
      <Box onClick={enabled ? () => clicks.push(1) : undefined}>
        <Child />
      </Box>
    );
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  expect(backend.lastFrame).toContain('1');
  setEnabled(false);
  await flushAsync(backend);
  expect(backend.lastFrame).toContain('1');
  setEnabled(true);
  await flushAsync(backend);
  expect(backend.lastFrame).toContain('1');
  backend.mouse('down', 0, 0); backend.mouse('up', 0, 0);
  await flush();
  expect(clicks).toEqual([1]);
  r.unmount();
});
