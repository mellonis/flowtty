import React, { useState } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../internal/render.js';
import { Shimmer } from './Shimmer.js';
import { useInput } from '../hooks/useInput.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// Fake only the interval timer; flushAsync + wasm + microtasks stay real.
beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
afterEach(() => vi.useRealTimers());

/** The fg of each cell of row 0, `undefined` where the cell carries none. */
const fgs = (backend: TestBackend, n: number): (string | undefined)[] =>
  Array.from({ length: n }, (_, x) => backend.lastBuffer!.get(x, 0).style.fg);

/** Indices of the cells of row 0 whose fg is `color`. */
const cellsIn = (backend: TestBackend, n: number, color: string): number[] =>
  fgs(backend, n).flatMap((fg, x) => (fg === color ? [x] : []));

/** How many stretches of equal fg the first `n` cells of row 0 form. */
const runCount = (backend: TestBackend, n: number): number =>
  fgs(backend, n).reduce((count, fg, x, all) => (x === 0 || fg !== all[x - 1] ? count + 1 : count), 0);

async function step(backend: TestBackend, ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await flushAsync(backend);
}

describe('Shimmer', () => {
  test('not running: the text in the base colour, no band, and time changes nothing', async () => {
    const backend = new TestBackend(12, 1);
    const r = await render(<Shimmer color="gray" highlight="cyan" running={false}>Loading</Shimmer>, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trimEnd()).toBe('Loading');
    expect(fgs(backend, 7)).toEqual(Array(7).fill('gray'));

    const frames = backend.frames.length;
    await step(backend, 80 * 20);
    expect(backend.frames.length).toBe(frames);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([]);
    r.unmount();
  });

  test('running: the band enters from the left, is `width` wide, and walks right one cell per interval', async () => {
    const backend = new TestBackend(12, 1);
    const r = await render(<Shimmer color="gray" highlight="cyan" width={3} interval={80}>Loading</Shimmer>, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trimEnd()).toBe('Loading');
    // Tick 0: the leading edge is on the first character, the rest of the band is still off the text.
    expect(cellsIn(backend, 7, 'cyan')).toEqual([0]);

    await step(backend, 80 * 2);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([0, 1, 2]);
    expect(fgs(backend, 7).slice(3)).toEqual(['gray', 'gray', 'gray', 'gray']);

    await step(backend, 80);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([1, 2, 3]);

    // Leaves fully: 7 chars + 3 wide = a period of 10; at tick 9 nothing is under the band.
    await step(backend, 80 * 6);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([]);
    // ... and comes round again.
    await step(backend, 80);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([0]);
    r.unmount();
  });

  test('direction="rtl" mirrors the travel', async () => {
    const backend = new TestBackend(12, 1);
    const r = await render(
      <Shimmer highlight="cyan" width={3} interval={80} direction="rtl">Loading</Shimmer>, backend);
    await flushAsync(backend);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([6]);

    await step(backend, 80 * 2);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([4, 5, 6]);

    await step(backend, 80);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([3, 4, 5]);
    r.unmount();
  });

  test('a gradient lays its colours across the band, the first at the leading edge', async () => {
    const backend = new TestBackend(12, 1);
    const r = await render(
      <Shimmer highlight={['red', 'green', 'blue']} width={3} interval={80}>Loading</Shimmer>, backend);
    await flushAsync(backend);
    await step(backend, 80 * 2); // the band fully on cells 0..2, leading edge at 2
    expect(fgs(backend, 4)).toEqual(['blue', 'green', 'red', undefined]);

    await step(backend, 80);
    expect(fgs(backend, 5)).toEqual([undefined, 'blue', 'green', 'red', undefined]);
    r.unmount();
  });

  test('limit: the band never reaches the characters past it', async () => {
    const backend = new TestBackend(12, 1);
    const r = await render(
      <Shimmer highlight="cyan" width={3} interval={80} limit={4}>0123456789</Shimmer>, backend);
    await flushAsync(backend);
    const seen = new Set<number>();
    // 4 animated + 3 wide = a period of 7 ticks; sweep two full periods.
    for (let i = 0; i < 14; i++) {
      for (const x of cellsIn(backend, 10, 'cyan')) seen.add(x);
      await step(backend, 80);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    r.unmount();
  });

  test('adjacent cells of one colour are one run: base + band + base', async () => {
    const backend = new TestBackend(20, 1);
    const r = await render(
      <Shimmer color="gray" highlight="cyan" width={3} interval={80}>Running tests</Shimmer>, backend);
    await flushAsync(backend);
    await step(backend, 80 * 5); // band on cells 3..5, text on both sides
    expect(cellsIn(backend, 13, 'cyan')).toEqual([3, 4, 5]);
    expect(runCount(backend, 13)).toBe(3);
    r.unmount();
  });

  test('a wide glyph is one character of two cells; the band walks over it as one step', async () => {
    const backend = new TestBackend(12, 1);
    const r = await render(<Shimmer highlight="cyan" width={2} interval={80}>a🍕bc</Shimmer>, backend);
    await flushAsync(backend);
    expect([0, 1, 2, 3].map((x) => backend.lastBuffer!.get(x, 0).char)).toEqual(['a', '🍕', '', 'b']);
    expect(cellsIn(backend, 5, 'cyan')).toEqual([0]);

    await step(backend, 80);
    expect(cellsIn(backend, 5, 'cyan')).toEqual([0, 1, 2]); // 'a' and the pizza with its continuation cell

    await step(backend, 80);
    expect(cellsIn(backend, 5, 'cyan')).toEqual([1, 2, 3]);
    r.unmount();
  });

  test('a ZWJ family is one step of two columns, and the period counts it once', async () => {
    const backend = new TestBackend(10, 1);
    const r = await render(<Shimmer highlight="cyan" width={1} interval={100}>a👩‍👧b</Shimmer>, backend);
    await flushAsync(backend);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([0]);
    await step(backend, 100);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([1, 2]);
    await step(backend, 100);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([3]);
    await step(backend, 100);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([]); // the band has left
    await step(backend, 100);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([0]); // three characters + one band width: it comes round
    r.unmount();
  });

  test('edge cases: an empty string, a band wider than the text, a limit of 0', async () => {
    const empty = new TestBackend(8, 1);
    const r1 = await render(<Shimmer highlight="cyan">{''}</Shimmer>, empty);
    await flushAsync(empty);
    expect(empty.lastFrame.trim()).toBe('');
    const frames = empty.frames.length;
    await step(empty, 80 * 5);
    expect(empty.frames.length).toBe(frames); // nothing to animate: no ticker
    r1.unmount();

    const wide = new TestBackend(8, 1);
    const r2 = await render(<Shimmer highlight="cyan" width={10} interval={80}>ab</Shimmer>, wide);
    await flushAsync(wide);
    await step(wide, 80);
    expect(cellsIn(wide, 2, 'cyan')).toEqual([0, 1]);
    await step(wide, 80 * 10); // tick 11 of a period of 12: the band has left
    expect(cellsIn(wide, 2, 'cyan')).toEqual([]);
    r2.unmount();

    const none = new TestBackend(8, 1);
    const r3 = await render(<Shimmer color="gray" highlight="cyan" limit={0}>abc</Shimmer>, none);
    await flushAsync(none);
    const still = none.frames.length;
    await step(none, 80 * 5);
    expect(none.frames.length).toBe(still);
    expect(fgs(none, 3)).toEqual(['gray', 'gray', 'gray']);
    r3.unmount();
  });

  test('running false -> true resumes the band', async () => {
    function App() {
      const [busy, setBusy] = useState(false);
      useInput((key) => { if (key.name === ' ') setBusy((b) => !b); });
      return <Shimmer highlight="cyan" width={3} interval={80} running={busy}>Loading</Shimmer>;
    }
    const backend = new TestBackend(12, 1);
    const r = await render(<App />, backend);
    await flushAsync(backend);
    await step(backend, 80 * 4);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([]);

    backend.press({ name: ' ' });
    await flushAsync(backend);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([0]);
    await step(backend, 80 * 2);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([0, 1, 2]);

    backend.press({ name: ' ' });
    await flushAsync(backend);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([]);
    await step(backend, 80 * 5);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([]);
    r.unmount();
  });

  test('freezes once unmounted', async () => {
    const backend = new TestBackend(12, 1);
    const r = await render(<Shimmer highlight="cyan">Loading</Shimmer>, backend);
    await flushAsync(backend);
    await step(backend, 80);
    expect(cellsIn(backend, 7, 'cyan')).toEqual([0, 1]);

    r.unmount();
    const framesAfter = backend.frames.length;
    await step(backend, 1000);
    expect(backend.frames.length).toBe(framesAfter); // no new paints
  });
});
