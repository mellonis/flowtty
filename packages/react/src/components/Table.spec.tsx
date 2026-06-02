import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
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

  test('cellStyle dims a per-column cell without touching its neighbours', async () => {
    const backend = new TestBackend(40, 8);
    const columns: TableColumn<Person>[] = [
      { accessor: 'name', header: 'Name', width: 5 },
      {
        accessor: 'age',
        header: 'Age',
        width: 3,
        cellStyle: (p) => (p.age < 10 ? { dim: true } : undefined),
      },
    ];
    const data: Person[] = [
      { name: 'Ann', age: 30 },
      { name: 'Bo', age: 7 },
    ];
    const r = await render(<Table data={data} columns={columns} width={40} />, backend);
    await flushAsync(backend);

    const buf = backend.lastBuffer!;
    // Lines: 0 top · 1 header · 2 mid · 3 row0 (age 30) · 4 row1 (age 7, dim).
    // Age column content starts after "│ Name  │ " — the digit at x=11.
    const dim = (x: number, y: number) => buf.get(x, y).style.dim === true;
    expect(dim(11, 4)).toBe(true);  // Bo's age cell is dimmed (age < 10)
    expect(dim(11, 3)).toBe(false); // Ann's age cell is not (age 30)
    expect(dim(2, 4)).toBe(false);  // Bo's name cell is untouched
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

  test('selectedIndex inverse-highlights the cursor row edge-to-edge', async () => {
    const backend = new TestBackend(40, 10);
    const columns: TableColumn<Person>[] = [
      { accessor: 'name', header: 'Name', width: 6 },
      { accessor: 'age', header: 'Age', width: 3, align: 'right' },
    ];
    const data: Person[] = [
      { name: 'Ann', age: 30 },
      { name: 'Bo', age: 7 },
      { name: 'Cy', age: 9 },
    ];
    const r = await render(
      <Table data={data} columns={columns} width={40} selectedIndex={1} />,
      backend,
    );
    await flushAsync(backend);

    const buf = backend.lastBuffer!;
    // Lines: 0 top rule · 1 header · 2 mid rule · 3 row0 · 4 row1 (selected) · 5 row2.
    const inv = (x: number, y: number) => buf.get(x, y).style.inverse === true;
    expect(inv(2, 4)).toBe(true);  // selected row's cell content is inverse
    expect(inv(0, 4)).toBe(true);  // ...and so is its left border — a continuous bar
    expect(inv(2, 3)).toBe(false); // neighbouring rows are not
    expect(inv(2, 5)).toBe(false);
    r.unmount();
  });

  test('scrollable windows rows to the viewport with a sticky header and stable columns', async () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      name: `item-${String(i).padStart(2, '0')}`,
      age: i,
    }));
    const columns: TableColumn<{ name: string; age: number }>[] = [
      { accessor: 'name', header: 'Name' },
      { accessor: 'age', header: 'Age', align: 'right' },
    ];
    const topRuleOf = (frame: string) => frame.split('\n').find((l) => l.startsWith('╭'))!;

    // Cursor at the top: window sticks to the start (first rows shown, last hidden).
    const top = new TestBackend(30, 8); // height 8 − chrome 4 ⇒ 4 rows visible of 20
    const rTop = await render(
      <Table data={data} columns={columns} selectedIndex={0} scrollable />,
      top,
    );
    await flushAsync(top);
    const topFrame = top.lastFrame;
    expect(topFrame).toContain('item-00');
    expect(topFrame).not.toContain('item-19');
    expect(topFrame.split('\n')[1]).toContain('Name'); // header pinned directly under the top rule
    rTop.unmount();

    // Cursor at the end: window sticks to the bottom (last rows shown, first hidden).
    const bot = new TestBackend(30, 8);
    const rBot = await render(
      <Table data={data} columns={columns} selectedIndex={19} scrollable />,
      bot,
    );
    await flushAsync(bot);
    const botFrame = bot.lastFrame;
    expect(botFrame).toContain('item-19');
    expect(botFrame).not.toContain('item-00');
    expect(botFrame.split('\n')[1]).toContain('Name'); // header still pinned at the top

    // Columns are sized from the full data, so the geometry doesn't jitter as
    // the window scrolls: the top rule is identical at both scroll positions.
    expect(topRuleOf(botFrame)).toBe(topRuleOf(topFrame));
    rBot.unmount();
  });

  test('scrollable table fits its allocated height between siblings (flexShrink)', async () => {
    // Regression: with Yoga's flexShrink=0 default the scrollable box would
    // self-stabilize at the full screen height, clipping its own bottom border
    // and the footer below it. It must collapse to its flex allocation instead.
    const data = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, title: `t${i}` }));
    const columns: TableColumn<(typeof data)[number]>[] = [
      { accessor: 'id', header: 'id' },
      { accessor: 'title', header: 'title' },
    ];
    const backend = new TestBackend(24, 12);
    const r = await render(
      <Box flexDirection="column" width="100%" height="100%">
        <Box>HEAD</Box>
        <Table data={data} columns={columns} selectedIndex={0} scrollable />
        <Box>FOOT</Box>
      </Box>,
      backend,
    );
    await flushAsync(backend);

    const lines = backend.lastFrame.split('\n');
    // The table's bottom rule is on screen…
    expect(lines.some((l) => l.startsWith('╰'))).toBe(true);
    // …and the footer below the table is the last visible line, not pushed off.
    expect(lines[11]).toContain('FOOT');
    r.unmount();
  });
});
