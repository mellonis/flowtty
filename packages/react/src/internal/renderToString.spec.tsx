import React, { useEffect, useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { Buffer } from '@flowtty/core';
import { renderToString, Box, Text, Table } from '../index.js';

afterEach(() => {
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});

test('plain text comes back as text', async () => {
  expect(await renderToString(<Text>hello</Text>)).toBe('hello');
});

test('a bordered box comes back as its exact frame', async () => {
  const out = await renderToString(
    <Box border="single" width={9}><Text>hi</Text></Box>,
  );
  expect(out).toBe(['┌───────┐', '│hi     │', '└───────┘'].join('\n'));
});

test('the frame is as tall as the content, however tall that is', async () => {
  const out = await renderToString(
    <Box flexDirection="column">
      {Array.from({ length: 30 }, (_, i) => <Text key={i}>{`line ${i}`}</Text>)}
    </Box>,
  );
  expect(out.split('\n')).toHaveLength(30);
  expect(out.split('\n')[29]).toBe('line 29');
});

test('a component that measures itself renders — Table', async () => {
  const out = await renderToString(
    <Table
      data={[{ name: 'ada', year: 1815 }, { name: 'alan', year: 1912 }]}
      columns={[{ accessor: 'name', header: 'Name' }, { accessor: 'year', header: 'Year' }]}
    />,
    { width: 40 },
  );
  expect(out).toContain('Name');
  expect(out).toContain('ada');
  expect(out).toContain('1912');
});

test('width lays the tree out in that many columns', async () => {
  const out = await renderToString(<Text wrap="wrap">aaa bbb ccc</Text>, { width: 7 });
  expect(out).toBe('aaa bbb\nccc');
});

test('height pads the buffer to a fixed number of rows', async () => {
  const rows = await renderToString(<Text>hi</Text>, {
    height: 5,
    format: (buffer) => String(buffer.height),
  });
  expect(rows).toBe('5');
});

test('format receives the painted Buffer', async () => {
  const out = await renderToString(<Text>ab</Text>, {
    width: 4,
    format: (buffer) => {
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.width).toBe(4);
      expect(buffer.get(0, 0).char).toBe('a');
      return 'formatted';
    },
  });
  expect(out).toBe('formatted');
});

test('state set in an effect is captured in its settled form', async () => {
  function Late(): React.ReactNode {
    const [text, setText] = useState('loading');
    useEffect(() => { setText('done'); }, []);
    return <Text>{text}</Text>;
  }
  expect(await renderToString(<Late />)).toBe('done');
});

test('an error thrown by the tree rejects the promise', async () => {
  function Boom(): React.ReactNode {
    throw new Error('boom');
  }
  await expect(renderToString(<Boom />)).rejects.toThrow('boom');
});

test('leaves no process listeners behind', async () => {
  const before = process.listenerCount('SIGINT');
  await renderToString(<Text>hi</Text>);
  expect(process.listenerCount('SIGINT')).toBe(before);
});

test('leaves no process listeners behind when the tree throws', async () => {
  function Boom(): React.ReactNode {
    throw new Error('boom');
  }
  const before = process.listenerCount('SIGINT');
  await expect(renderToString(<Boom />)).rejects.toThrow('boom');
  expect(process.listenerCount('SIGINT')).toBe(before);
});
