import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { ContainerList } from './ContainerList.js';
import type { Container } from './types.js';

const containers: Container[] = [
  { id: 'c1', name: 'poetry-nextjs', state: 'running', status: 'Up 3 hours' },
  { id: 'c2', name: 'dozzle', state: 'exited', status: 'Exited (0) 5 minutes ago' },
];

describe('ContainerList', () => {
  test('renders container names and the status column', async () => {
    const backend = new TestBackend(44, 8);
    const r = await render(
      <ContainerList containers={containers} selectedIndex={0} width={44} />,
      backend,
    );
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('poetry-nextjs');
    expect(frame).toContain('dozzle');
    expect(frame).toContain('Up 3 hours');
    r.unmount();
  });

  test('dims a stopped container row but leaves the running one undimmed', async () => {
    const backend = new TestBackend(44, 8);
    // Select the running row so the stopped row stays unselected — selection
    // paints inverse, which would otherwise mask the dim we want to assert.
    const r = await render(
      <ContainerList containers={containers} selectedIndex={0} width={44} />,
      backend,
    );
    await flushAsync(backend);
    const lines = backend.lastFrame.split('\n');
    const buf = backend.lastBuffer!;
    const rowY = (name: string) => lines.findIndex((l) => l.includes(name));
    // Name-cell content starts at x=2 (left border + one pad column).
    const dim = (y: number) => buf.get(2, y).style.dim === true;
    expect(dim(rowY('dozzle'))).toBe(true);          // exited → dimmed
    expect(dim(rowY('poetry-nextjs'))).toBe(false);  // running → not dimmed
    r.unmount();
  });
});
