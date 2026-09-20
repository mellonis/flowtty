import React, { createRef, useState } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { ScrollBox, type ScrollBoxHandle } from './ScrollBox.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

const lines = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `row ${from + i}`);
const Rows = ({ items }: { items: string[] }) => <>{items.map((t) => <Text key={t}>{t}</Text>)}</>;

async function mount(el: React.ReactElement, w = 12, h = 4) {
  const backend = new TestBackend(w, h);
  const r = await render(el, backend);
  await flushAsync(backend);
  const frame = async () => { await flushAsync(backend); return backend.lastFrame.split('\n'); };
  return { backend, frame, unmount: r.unmount };
}

describe('ScrollBox', () => {
  test('anchored to the top by default: shows the first rows', async () => {
    const { frame, unmount } = await mount(<ScrollBox height={4}><Rows items={lines(10)} /></ScrollBox>);
    expect(await frame()).toEqual(['row 0', 'row 1', 'row 2', 'row 3']);
    unmount();
  });

  test('anchor="bottom" shows the last rows', async () => {
    const { frame, unmount } = await mount(<ScrollBox height={4} anchor="bottom"><Rows items={lines(10)} /></ScrollBox>);
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8', 'row 9']);
    unmount();
  });

  test('takes the space flex gives it — no height bookkeeping in the app', async () => {
    const { frame, unmount } = await mount(
      <Box flexDirection="column" height={4}>
        <Text>header</Text>
        <ScrollBox flexGrow={1} flexShrink={1} anchor="bottom"><Rows items={lines(10)} /></ScrollBox>
        <Text>footer</Text>
      </Box>,
    );
    expect(await frame()).toEqual(['header', 'row 8', 'row 9', 'footer']);
    unmount();
  });

  test('PgUp / PgDn scroll by a page minus one row, clamped at both ends', async () => {
    const { backend, frame, unmount } = await mount(<ScrollBox height={4}><Rows items={lines(10)} /></ScrollBox>);
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    backend.press({ name: 'pagedown' });
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8', 'row 9']);
    backend.press({ name: 'pageup' });
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    unmount();
  });

  test('the wheel scrolls three rows a step when the pointer is inside the box', async () => {
    const { backend, frame, unmount } = await mount(
      <Box flexDirection="column">
        <Text>title</Text>
        <ScrollBox height={3}><Rows items={lines(10)} /></ScrollBox>
      </Box>,
    );
    backend.wheel('down', 2, 2);
    expect(await frame()).toEqual(['title', 'row 3', 'row 4', 'row 5']);
    backend.wheel('up', 2, 1);
    expect(await frame()).toEqual(['title', 'row 0', 'row 1', 'row 2']);
    unmount();
  });

  test('the wheel is ignored when the pointer is outside the box', async () => {
    const { backend, frame, unmount } = await mount(
      <Box flexDirection="column">
        <Text>title</Text>
        <ScrollBox height={3}><Rows items={lines(10)} /></ScrollBox>
      </Box>,
    );
    backend.wheel('down', 2, 0); // over the title row
    expect(await frame()).toEqual(['title', 'row 0', 'row 1', 'row 2']);
    unmount();
  });

  test('isActive={false} ignores keys and wheel', async () => {
    const { backend, frame, unmount } = await mount(<ScrollBox height={4} isActive={false}><Rows items={lines(10)} /></ScrollBox>);
    backend.press({ name: 'pagedown' });
    backend.wheel('down', 0, 0);
    expect(await frame()).toEqual(['row 0', 'row 1', 'row 2', 'row 3']);
    unmount();
  });

  test('pinned to the bottom, it follows content as it grows', async () => {
    let add!: () => void;
    function App() {
      const [items, setItems] = useState(lines(6));
      add = () => setItems((c) => [...c, `row ${c.length}`]);
      return <ScrollBox height={4} anchor="bottom"><Rows items={items} /></ScrollBox>;
    }
    const { frame, unmount } = await mount(<App />);
    expect(await frame()).toEqual(['row 2', 'row 3', 'row 4', 'row 5']);
    add();
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    unmount();
  });

  test('scrolled up from the bottom, new content does not move what is being read', async () => {
    let add!: () => void;
    function App() {
      const [items, setItems] = useState(lines(10));
      add = () => setItems((c) => [...c, `row ${c.length}`]);
      return <ScrollBox height={4} anchor="bottom"><Rows items={items} /></ScrollBox>;
    }
    const { backend, frame, unmount } = await mount(<App />);
    backend.press({ name: 'pageup' });
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    add(); add();
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    // Scrolling back to the end re-pins: later content is followed again.
    backend.press({ name: 'pagedown' }); backend.press({ name: 'pagedown' }); backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 8', 'row 9', 'row 10', 'row 11']);
    add();
    expect(await frame()).toEqual(['row 9', 'row 10', 'row 11', 'row 12']);
    unmount();
  });

  test('ref.scrollToEnd() and ref.scrollTo(n)', async () => {
    const ref = createRef<ScrollBoxHandle>();
    const { frame, unmount } = await mount(<ScrollBox ref={ref} height={4}><Rows items={lines(10)} /></ScrollBox>);
    ref.current!.scrollToEnd();
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8', 'row 9']);
    ref.current!.scrollTo(1);
    expect(await frame()).toEqual(['row 1', 'row 2', 'row 3', 'row 4']);
    unmount();
  });

  test('onScroll reports the offset from the anchored edge with the metrics', async () => {
    const seen: Array<[number, number, number]> = [];
    const { backend, frame, unmount } = await mount(
      <ScrollBox height={4} anchor="bottom" onScroll={(offset, m) => seen.push([offset, m.contentHeight, m.viewportHeight])}>
        <Rows items={lines(10)} />
      </ScrollBox>,
    );
    backend.press({ name: 'pageup' });
    await frame();
    expect(seen.at(-1)).toEqual([3, 10, 4]);
    unmount();
  });

  test('controlled: `offset` drives the position and user input only reports through onScroll', async () => {
    let asked: number | undefined;
    const { backend, frame, unmount } = await mount(
      <ScrollBox height={4} anchor="bottom" offset={2} onScroll={(o) => { asked = o; }}><Rows items={lines(10)} /></ScrollBox>,
    );
    expect(await frame()).toEqual(['row 4', 'row 5', 'row 6', 'row 7']);
    backend.press({ name: 'pageup' });
    expect(await frame()).toEqual(['row 4', 'row 5', 'row 6', 'row 7']); // unchanged until the app sets offset
    expect(asked).toBe(5);
    unmount();
  });

  test('scrollbar draws a thumb in the right column sized and placed by the scroll position', async () => {
    const { backend, frame, unmount } = await mount(<ScrollBox height={4} scrollbar><Rows items={lines(8)} /></ScrollBox>, 8, 4);
    expect(await frame()).toEqual(['row 0  █', 'row 1  █', 'row 2  │', 'row 3  │']);
    backend.press({ name: 'pagedown' }); backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 4  │', 'row 5  │', 'row 6  █', 'row 7  █']);
    unmount();
  });

  test('no scrollbar is drawn when everything fits', async () => {
    const { frame, unmount } = await mount(<ScrollBox height={4} scrollbar><Rows items={lines(2)} /></ScrollBox>, 8, 4);
    expect(await frame()).toEqual(['row 0', 'row 1']);
    unmount();
  });

  test('pageStep and wheelStep set the rows per PgUp/PgDn and per wheel notch', async () => {
    const { backend, frame, unmount } = await mount(
      <ScrollBox height={4} pageStep={2} wheelStep={1}><Rows items={lines(10)} /></ScrollBox>,
    );
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['row 2', 'row 3', 'row 4', 'row 5']);
    backend.wheel('down', 0, 0);
    expect(await frame()).toEqual(['row 3', 'row 4', 'row 5', 'row 6']);
    unmount();
  });

  test('anchor="bottom" with content shorter than the viewport starts at the top, not hanging at the bottom edge', async () => {
    const { frame, unmount } = await mount(<ScrollBox height={4} anchor="bottom"><Rows items={lines(2)} /></ScrollBox>);
    expect(await frame()).toEqual(['row 0', 'row 1']);
    unmount();
  });

  test('an absolute child is a sticky overlay: it stays put while the content scrolls under it', async () => {
    const { backend, frame, unmount } = await mount(
      <ScrollBox height={4}>
        <Rows items={lines(10)} />
        <Box position="absolute" top={0} left={0}><Text>STICKY</Text></Box>
      </ScrollBox>,
    );
    backend.press({ name: 'pagedown' });
    expect(await frame()).toEqual(['STICKY', 'row 4', 'row 5', 'row 6']);
    unmount();
  });

  test('onMetrics reports heights after mount and again when the content grows', async () => {
    let add!: () => void;
    const seen: Array<[number, number]> = [];
    function App() {
      const [items, setItems] = useState(lines(6));
      add = () => setItems((c) => [...c, `row ${c.length}`]);
      return <ScrollBox height={4} anchor="bottom" onMetrics={(m) => seen.push([m.contentHeight, m.viewportHeight])}><Rows items={items} /></ScrollBox>;
    }
    const { frame, unmount } = await mount(<App />);
    add();
    await frame();
    expect(seen).toEqual([[6, 4], [7, 4]]);
    unmount();
  });

  test('a child scrolled out of view still gets onLayout, with its on-screen (shifted) row', async () => {
    const tops: number[] = [];
    const { backend, frame, unmount } = await mount(
      <ScrollBox height={4}>
        <Box onLayout={(r) => { if (tops.at(-1) !== r.top) tops.push(r.top); }}><Text>first</Text></Box>
        <Rows items={lines(9)} />
      </ScrollBox>,
    );
    backend.press({ name: 'pagedown' });
    await frame();
    expect(tops).toEqual([0, -3]); // above the viewport now: the host can tell it left the view
    unmount();
  });
});
