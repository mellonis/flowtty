import React, { createRef, useState } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { ScrollList } from './ScrollList.js';
import { ScrollBox, type ScrollBoxHandle } from './ScrollBox.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

const lines = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `row ${from + i}`);
const row = (t: string) => <Text>{t}</Text>;

async function mount(el: React.ReactElement, w = 12, h = 4) {
  const backend = new TestBackend(w, h);
  const r = await render(el, backend);
  await flushAsync(backend);
  const frame = async () => { await flushAsync(backend); return backend.lastFrame.split('\n'); };
  return { backend, frame, unmount: r.unmount };
}

describe('ScrollList', () => {
  test('anchored to the top by default: shows the first rows', async () => {
    const { frame, unmount } = await mount(<ScrollList height={4} items={lines(10)} renderItem={row} />);
    expect(await frame()).toEqual(['row 0', 'row 1', 'row 2', 'row 3']);
    unmount();
  });

  test('anchor="bottom" shows the last rows', async () => {
    const { frame, unmount } = await mount(<ScrollList height={4} anchor="bottom" items={lines(10)} renderItem={row} />);
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8', 'row 9']);
    unmount();
  });

  test('the first frame already has the right rows, before any metrics', async () => {
    const backend = new TestBackend(12, 4);
    const r = await render(<ScrollList height={4} anchor="bottom" items={lines(10_000)} renderItem={row} />, backend);
    await flushAsync(backend);
    expect(backend.frames[0]!.split('\n')).toEqual(['row 9996', 'row 9997', 'row 9998', 'row 9999']);
    r.unmount();
  });

  test('anchor="bottom" with content shorter than the viewport starts at the top', async () => {
    const { frame, unmount } = await mount(<ScrollList height={4} anchor="bottom" items={lines(2)} renderItem={row} />);
    expect(await frame()).toEqual(['row 0', 'row 1']);
    unmount();
  });

  test('takes the space flex gives it', async () => {
    const { frame, unmount } = await mount(
      <Box flexDirection="column" height={4}>
        <Text>header</Text>
        <ScrollList flexGrow={1} flexShrink={1} anchor="bottom" items={lines(10)} renderItem={row} />
        <Text>footer</Text>
      </Box>,
    );
    expect(await frame()).toEqual(['header', 'row 8', 'row 9', 'footer']);
    unmount();
  });

  test('pinned to the bottom, it follows rows as they are appended', async () => {
    let add!: () => void;
    function App() {
      const [items, setItems] = useState(lines(6));
      add = () => setItems((c) => [...c, `row ${c.length}`]);
      return <ScrollList height={4} anchor="bottom" items={items} renderItem={row} />;
    }
    const { frame, unmount } = await mount(<App />);
    expect(await frame()).toEqual(['row 2', 'row 3', 'row 4', 'row 5']);
    add();
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    add(); add(); add();
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8', 'row 9']);
    unmount();
  });

  test('scrolled up from the bottom, appended rows do not move what is being read', async () => {
    let add!: () => void;
    function App() {
      const [items, setItems] = useState(lines(10));
      add = () => setItems((c) => [...c, `row ${c.length}`]);
      return <ScrollList height={4} anchor="bottom" items={items} renderItem={row} />;
    }
    const { backend, frame, unmount } = await mount(<App />);
    backend.press({ name: 'pageup' });
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    add(); add();
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    // Scrolling back to the end re-pins: later rows are followed again.
    backend.press({ name: 'pagedown' }); backend.press({ name: 'pagedown' }); backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 8', 'row 9', 'row 10', 'row 11']);
    add();
    expect(await frame()).toEqual(['row 9', 'row 10', 'row 11', 'row 12']);
    unmount();
  });

  test('PgUp / PgDn scroll by a page minus one row, clamped at both ends', async () => {
    const { backend, frame, unmount } = await mount(<ScrollList height={4} items={lines(10)} renderItem={row} />);
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    backend.press({ name: 'pagedown' });
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8', 'row 9']);
    backend.press({ name: 'pageup' });
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    unmount();
  });

  test('the wheel scrolls when the pointer is inside the list, and is ignored outside it', async () => {
    const { backend, frame, unmount } = await mount(
      <Box flexDirection="column">
        <Text>title</Text>
        <ScrollList height={3} items={lines(10)} renderItem={row} />
      </Box>,
    );
    backend.wheel('down', 2, 0); // over the title row
    expect(await frame()).toEqual(['title', 'row 0', 'row 1', 'row 2']);
    backend.wheel('down', 2, 2);
    expect(await frame()).toEqual(['title', 'row 3', 'row 4', 'row 5']);
    backend.wheel('up', 2, 1);
    expect(await frame()).toEqual(['title', 'row 0', 'row 1', 'row 2']);
    unmount();
  });

  test('the window follows a page-by-page walk into the middle of 10,000 rows', async () => {
    const { backend, frame, unmount } = await mount(<ScrollList height={4} items={lines(10_000)} renderItem={row} />);
    for (let i = 0; i < 100; i++) backend.press({ name: 'pagedown' });
    // 100 pages of 3 rows: rows 300..303. Nothing else was ever rendered.
    expect(await frame()).toEqual(['row 300', 'row 301', 'row 302', 'row 303']);
    backend.wheel('down', 0, 0);
    expect(await frame()).toEqual(['row 303', 'row 304', 'row 305', 'row 306']);
    unmount();
  });

  test('ref.scrollToEnd(), scrollTo(n) and scrollToStart() jump across a long list', async () => {
    const ref = createRef<ScrollBoxHandle>();
    const { frame, unmount } = await mount(<ScrollList ref={ref} height={4} items={lines(10_000)} renderItem={row} />);
    ref.current!.scrollToEnd();
    expect(await frame()).toEqual(['row 9996', 'row 9997', 'row 9998', 'row 9999']);
    ref.current!.scrollTo(5_000);
    expect(await frame()).toEqual(['row 5000', 'row 5001', 'row 5002', 'row 5003']);
    ref.current!.scrollToStart();
    expect(await frame()).toEqual(['row 0', 'row 1', 'row 2', 'row 3']);
    unmount();
  });

  test('a big jump has its rows in the very next frame — no blank frame', async () => {
    const ref = createRef<ScrollBoxHandle>();
    const { backend, frame, unmount } = await mount(<ScrollList height={4} ref={ref} items={lines(10_000)} renderItem={row} />);
    const before = backend.frames.length;
    ref.current!.scrollTo(7_000);
    await frame();
    expect(backend.frames[before]!.split('\n')).toEqual(['row 7000', 'row 7001', 'row 7002', 'row 7003']);
    unmount();
  });

  test('controlled: `offset` drives the position and the window', async () => {
    let asked: number | undefined;
    const { backend, frame, unmount } = await mount(
      <ScrollList height={4} anchor="bottom" offset={2} onScroll={(o) => { asked = o; }} items={lines(10_000)} renderItem={row} />,
    );
    expect(await frame()).toEqual(['row 9994', 'row 9995', 'row 9996', 'row 9997']);
    backend.press({ name: 'pageup' });
    expect(await frame()).toEqual(['row 9994', 'row 9995', 'row 9996', 'row 9997']); // unchanged until the app sets offset
    expect(asked).toBe(5);
    unmount();
  });

  test('onScroll and onMetrics still reach the app', async () => {
    const scrolls: number[] = [];
    const metrics: Array<[number, number]> = [];
    const { backend, frame, unmount } = await mount(
      <ScrollList
        height={4} anchor="bottom" items={lines(10)} renderItem={row}
        onScroll={(o) => scrolls.push(o)} onMetrics={(m) => metrics.push([m.contentHeight, m.viewportHeight])}
      />,
    );
    backend.press({ name: 'pageup' });
    await frame();
    expect(scrolls).toEqual([3]);
    expect(metrics[0]).toEqual([10, 4]);
    unmount();
  });

  test('scrollbar: the thumb is sized against the whole list, not the rendered window', async () => {
    const { backend, frame, unmount } = await mount(<ScrollList height={4} scrollbar items={lines(8)} renderItem={row} />, 8, 4);
    expect(await frame()).toEqual(['row 0  █', 'row 1  █', 'row 2  │', 'row 3  │']);
    backend.press({ name: 'pagedown' }); backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 4  │', 'row 5  │', 'row 6  █', 'row 7  █']);
    unmount();
  });

  test('scrollbar on a long list: a one-cell thumb that walks the column', async () => {
    const ref = createRef<ScrollBoxHandle>();
    const { frame, unmount } = await mount(
      <ScrollList ref={ref} height={4} scrollbar items={lines(10_000)} renderItem={row} />, 10, 4,
    );
    expect(await frame()).toEqual(['row 0    █', 'row 1    │', 'row 2    │', 'row 3    │']);
    ref.current!.scrollTo(5_000);
    expect(await frame()).toEqual(['row 5000 │', 'row 5001 │', 'row 5002 █', 'row 5003 │']);
    ref.current!.scrollToEnd();
    expect(await frame()).toEqual(['row 9996 │', 'row 9997 │', 'row 9998 │', 'row 9999 █']);
    unmount();
  });

  test('no scrollbar is drawn when everything fits', async () => {
    const { frame, unmount } = await mount(<ScrollList height={4} scrollbar items={lines(2)} renderItem={row} />, 8, 4);
    expect(await frame()).toEqual(['row 0', 'row 1']);
    unmount();
  });

  test('an absolute child is a sticky overlay: it stays put while the rows scroll under it', async () => {
    const { backend, frame, unmount } = await mount(
      <ScrollList height={4} items={lines(10_000)} renderItem={row}>
        <Box position="absolute" top={0} left={0}><Text>STICKY</Text></Box>
      </ScrollList>,
    );
    expect(await frame()).toEqual(['STICKY', 'row 1', 'row 2', 'row 3']);
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['STICKY', 'row 4', 'row 5', 'row 6']);
    for (let i = 0; i < 50; i++) backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['STICKY3', 'row 154', 'row 155', 'row 156']); // the overlay is six wide; "row 153" shows past it
    unmount();
  });

  test('rowHeight > 1: rows are exactly that tall, a taller row loses its bottom under the next one', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const tall = (t: string) => <><Text>{t}1</Text><Text>{t}2</Text><Text>{t}3</Text></>;
    const { backend, frame, unmount } = await mount(<ScrollList height={4} rowHeight={2} items={items} renderItem={tall} />);
    expect(await frame()).toEqual(['a1', 'a2', 'b1', 'b2']);
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['b2', 'c1', 'c2', 'd1']);
    unmount();
  });

  test('keyOf keeps a row mounted while the window moves', async () => {
    const mounted: string[] = [];
    function Row({ t }: { t: string }) {
      React.useEffect(() => { mounted.push(t); }, [t]);
      return <Text>{t}</Text>;
    }
    const { backend, frame, unmount } = await mount(
      <ScrollList height={4} overscan={1} items={lines(20)} keyOf={(t) => t} renderItem={(t) => <Row t={t} />} />,
    );
    await frame();
    mounted.length = 0;
    backend.wheel('down', 0, 0); // 3 rows: rows 3..6 in view, 2..7 rendered
    await frame();
    // The window moves from rows 0..4 to 2..7: only 5, 6 and 7 mount.
    expect(mounted).toEqual(['row 5', 'row 6', 'row 7']);
    unmount();
  });

  test('a wheel step inside the overscan re-renders no rows', async () => {
    let calls = 0;
    const counting = (t: string) => { calls++; return <Text>{t}</Text>; };
    const { backend, frame, unmount } = await mount(
      <ScrollList height={4} overscan={20} items={lines(100)} renderItem={counting} />,
    );
    await frame();
    calls = 0;
    backend.wheel('down', 0, 0); // 3 rows: still deep inside the 20 rows rendered below the viewport
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    expect(calls).toBe(0);
    unmount();
  });

  test('only the windowed rows are rendered: 10,000 items, a 10-row viewport', async () => {
    let calls = 0;
    const counting = (t: string) => { calls++; return <Text>{t}</Text>; };
    const { backend, frame, unmount } = await mount(
      <ScrollList height={10} anchor="bottom" items={lines(10_000)} renderItem={counting} />, 12, 10,
    );
    expect((await frame()).at(-1)).toBe('row 9999');
    const perRender = 30; // viewport (10) + one viewport of overscan each side
    // A few renders settle the mount (the first paint's metrics, at most).
    expect(calls).toBeLessThanOrEqual(perRender * 3);
    const mounted = calls;
    calls = 0;
    backend.press({ name: 'pageup' });
    await frame();
    expect(calls).toBeLessThanOrEqual(perRender * 2);
    console.info(`ScrollList renderItem calls — mount over 10,000 items: ${mounted}; one PgUp: ${calls}`);
    unmount();
  });

  test('a re-render of the app with 400 rows calls renderItem only for the window', async () => {
    let calls = 0;
    let tick!: () => void;
    const items = lines(400);
    const counting = (t: string) => { calls++; return <Text>{t}</Text>; };
    function App() {
      const [n, setN] = useState(0);
      tick = () => setN((c) => c + 1);
      return (
        <Box flexDirection="column" height={12}>
          <ScrollList flexGrow={1} flexShrink={1} anchor="bottom" items={items} renderItem={counting} />
          <Text>typed {n}</Text>
        </Box>
      );
    }
    const { backend, frame, unmount } = await mount(<App />, 12, 12);
    expect((await frame()).slice(-2)).toEqual(['row 399', 'typed 0']);
    calls = 0;
    const t0 = performance.now();
    tick();
    expect((await frame()).at(-1)).toBe('typed 1');
    const ms = performance.now() - t0;
    expect(calls).toBeLessThanOrEqual(33 * 2); // 11 in view + 11 overscan each side, per render
    expect(calls).toBeGreaterThan(0);
    // A generous bound: the point is that the cost does not grow with the list.
    expect(ms).toBeLessThan(2_000);
    console.info(`ScrollList keystroke over 400 rows: renderItem calls ${calls}, ${ms.toFixed(1)} ms (frames ${backend.frames.length})`);
    unmount();
  });

  test('a drag over the rows in view selects and copies their text', async () => {
    const { backend, frame, unmount } = await mount(<ScrollList height={4} items={lines(10_000)} renderItem={row} />);
    await frame();
    backend.mouse('down', 0, 1);
    backend.mouse('drag', 4, 2);
    backend.mouse('up', 4, 2);
    await frame();
    expect(backend.clipboard).toEqual(['row 1\nrow 2']);
    unmount();
  });

  test('a soft-wrapped paragraph laid out as two rows still copies as one line, as under ScrollBox', async () => {
    // A component that wraps text itself (Markdown, a chat) paints each row as
    // its own box, marks the upper one with `wrapContinues`, and indents the
    // continuation row with blanks. Under the list that mark has to survive:
    // the row below is the next item.
    const items = [
      { gutter: '> ', text: 'hello', continues: { dropped: ' ', textWidth: 5 } },
      { gutter: '  ', text: 'world', continues: undefined },
      { gutter: '> ', text: 'after', continues: undefined },
    ];
    const wrapped = (r: typeof items[number]) => (
      <Box flexDirection="row" flexShrink={0}>
        <Text>{r.gutter}</Text>
        <Box flexDirection="row" flexShrink={0} wrapContinues={r.continues}><Text>{r.text}</Text></Box>
      </Box>
    );
    for (const el of [
      <ScrollBox height={4}>{items.map((r, i) => <React.Fragment key={i}>{wrapped(r)}</React.Fragment>)}</ScrollBox>,
      <ScrollList height={4} items={items} renderItem={wrapped} />,
    ]) {
      const { backend, frame, unmount } = await mount(el);
      await frame();
      backend.mouse('down', 2, 0);
      backend.mouse('drag', 6, 2);
      backend.mouse('up', 6, 2);
      await frame();
      expect(backend.clipboard).toEqual(['hello world\n> after']);
      unmount();
    }
  });

  test('a drag selects the rows on screen after a jump into the list', async () => {
    const ref = createRef<ScrollBoxHandle>();
    const { backend, frame, unmount } = await mount(<ScrollList ref={ref} height={4} items={lines(10_000)} renderItem={row} />);
    ref.current!.scrollTo(5_000);
    await frame();
    backend.mouse('down', 0, 0);
    backend.mouse('drag', 7, 0);
    backend.mouse('up', 7, 0);
    await frame();
    expect(backend.clipboard).toEqual(['row 5000']);
    unmount();
  });
});
