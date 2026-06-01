import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Table, type TableColumn } from './Table.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

interface Person { name: string; age: number; }

describe('Table', () => {
  test('draws a bordered grid with headers, rules, and aligned cells', async () => {
    const backend = new TestBackend(40, 8);
    const columns: TableColumn<Person>[] = [
      { accessor: 'name', header: 'Name', width: 5 },
      { accessor: 'age', header: 'Age', width: 3, align: 'right' },
    ];
    const data: Person[] = [
      { name: 'Ann', age: 30 },
      { name: 'Bo', age: 7 },
    ];
    const r = await render(<Table data={data} columns={columns} width={40} />, backend);
    await flushAsync(backend);

    const frame = backend.lastFrame;
    // Default border is 'round': round corners, single-style junctions.
    expect(frame).toContain('╭───────┬─────╮');
    expect(frame).toContain('│ Name  │ Age │');
    expect(frame).toContain('├───────┼─────┤');
    expect(frame).toContain('│ Ann   │  30 │'); // right-aligned age
    expect(frame).toContain('│ Bo    │   7 │');
    expect(frame).toContain('╰───────┴─────╯');
    r.unmount();
  });

  test('fit-to-width: shrinks columns and truncates cells with an ellipsis', async () => {
    const backend = new TestBackend(20, 8);
    const columns: TableColumn<{ title: string; desc: string }>[] = [
      { accessor: 'title', header: 'Title' },
      { accessor: 'desc', header: 'Description' },
    ];
    const data = [{ title: 'A very long title', desc: 'Some long description' }];
    const r = await render(<Table data={data} columns={columns} />, backend);
    await flushAsync(backend);

    const frame = backend.lastFrame;
    // Truncation marker appears when content is cut to fit.
    expect(frame).toContain('…');
    // The grid never exceeds the available width: the top rule fills exactly 20.
    const topRule = frame.split('\n').find((l) => l.startsWith('╭'))!;
    expect([...topRule].length).toBe(20);
    r.unmount();
  });

  test('border="none" omits rules but keeps values', async () => {
    const backend = new TestBackend(40, 6);
    const columns: TableColumn<Person>[] = [
      { accessor: 'name', header: 'Name' },
      { accessor: 'age', header: 'Age' },
    ];
    const r = await render(
      <Table data={[{ name: 'Ann', age: 30 }]} columns={columns} border="none" width={40} />,
      backend,
    );
    await flushAsync(backend);

    const frame = backend.lastFrame;
    expect(frame).not.toContain('│');
    expect(frame).not.toContain('┌');
    expect(frame).toContain('Name');
    expect(frame).toContain('Ann');
    expect(frame).toContain('30');
    r.unmount();
  });

  test('function accessor derives cell text', async () => {
    const backend = new TestBackend(40, 6);
    const columns: TableColumn<Person>[] = [
      { accessor: (p) => p.name.toUpperCase(), header: 'Name', width: 6 },
      { accessor: (p) => `${p.age}y`, header: 'Age', width: 4 },
    ];
    const r = await render(
      <Table data={[{ name: 'ann', age: 30 }]} columns={columns} width={40} />,
      backend,
    );
    await flushAsync(backend);

    const frame = backend.lastFrame;
    expect(frame).toContain('ANN');
    expect(frame).toContain('30y');
    r.unmount();
  });

  test('showHeader=false drops the header row and its separator', async () => {
    const backend = new TestBackend(40, 6);
    const columns: TableColumn<Person>[] = [{ accessor: 'name', header: 'Name', width: 5 }];
    const r = await render(
      <Table data={[{ name: 'Ann', age: 1 }]} columns={columns} showHeader={false} width={40} />,
      backend,
    );
    await flushAsync(backend);

    const frame = backend.lastFrame;
    expect(frame).not.toContain('Name');
    expect(frame).not.toContain('├'); // no header separator
    expect(frame).toContain('Ann');
    r.unmount();
  });
});
