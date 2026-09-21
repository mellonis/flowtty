import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../../internal/render.js';
import { Box } from './Box.js';
import { Text } from './Text.js';
import { Span } from './Span.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { takeWarnings } from '@flowtty/core';

async function draw(el: React.ReactElement, w = 24, h = 4) {
  const backend = new TestBackend(w, h);
  const app = await render(el, backend);
  await flushAsync(backend);
  return { backend, rows: backend.lastFrame.split('\n'), app };
}
const mask = (backend: TestBackend, y: number, w: number, pick: (s: Record<string, unknown>) => unknown) =>
  Array.from({ length: w }, (_, x) => (pick(backend.lastBuffer!.get(x, y).style as Record<string, unknown>) ? '#' : '.')).join('');

describe('<Span>: a styled piece of a line of text', () => {
  test('spans and plain text flow as one line', async () => {
    const { backend, rows, app } = await draw(<Text>Press <Span bold color="cyan">q</Span> to quit</Text>);
    expect(rows).toEqual(['Press q to quit']);
    expect(mask(backend, 0, 15, (s) => s.bold)).toBe('......#........');
    expect(backend.lastBuffer!.get(6, 0).style.fg).toBe('cyan');
    app.unmount();
  });

  test('the whole thing wraps as one paragraph', async () => {
    const { backend, rows, app } = await draw(
      <Box width={11}><Text wrap="wrap">plain <Span bold>bold words here</Span> tail</Text></Box>, 11, 4);
    expect(rows).toEqual(['plain bold', 'words here', 'tail']);
    expect(mask(backend, 1, 11, (s) => s.bold)).toBe('##########.');
    app.unmount();
  });

  test('spans nest: the inner one adds to the outer one', async () => {
    const { backend, app } = await draw(<Text><Span color="red">a<Span bold>b</Span>c</Span></Text>);
    expect(backend.lastFrame).toBe('abc');
    expect(mask(backend, 0, 3, (s) => s.bold)).toBe('.#.');
    expect([0, 1, 2].map((x) => backend.lastBuffer!.get(x, 0).style.fg)).toEqual(['red', 'red', 'red']);
    app.unmount();
  });

  test('the Text\'s own style is the base; numbers and conditionals work like in any JSX', async () => {
    const n = 3;
    const { backend, app } = await draw(<Text dim>{n} files{false} <Span dim={false} color="green">ok</Span>{null}</Text>);
    expect(backend.lastFrame).toBe('3 files ok');
    expect(mask(backend, 0, 10, (s) => s.dim)).toBe('########..');
    app.unmount();
  });

  test('a link span carries its target', async () => {
    const { backend, app } = await draw(<Text>see <Span link="https://x.dev" underline>the docs</Span></Text>);
    expect(backend.lastBuffer!.get(4, 0).style).toMatchObject({ link: 'https://x.dev', underline: true });
    expect(backend.lastBuffer!.get(0, 0).style.link).toBeUndefined();
    app.unmount();
  });

  test('a Span on its own, outside a <Text>, is just styled text', async () => {
    const { backend, app } = await draw(<Span bold>alone</Span>);
    expect(backend.lastFrame).toBe('alone');
    expect(backend.lastBuffer!.get(0, 0).style.bold).toBe(true);
    app.unmount();
  });

  test('plain <Text> without spans is unchanged — including the blank-line rule', async () => {
    const { rows, app } = await draw(<Box flexDirection="column"><Text>a</Text><Text>{''}</Text><Text>b</Text></Box>);
    expect(rows).toEqual(['a', '', 'b']);
    app.unmount();
  });
});

describe('the nested-<Text> trap', () => {
  test('a <Text> inside a <Text> notes a warning that names the fix', async () => {
    takeWarnings();
    const { app } = await draw(<Text>a <Text bold>b</Text></Text>);
    const warnings = takeWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('<Span>');
    app.unmount();
  });

  test('spans note nothing', async () => {
    takeWarnings();
    const { app } = await draw(<Text>a <Span bold>b</Span></Text>);
    expect(takeWarnings()).toEqual([]);
    app.unmount();
  });
});
