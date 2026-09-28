import React, { createRef, useState } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { ScrollBox, type ScrollBoxHandle } from './ScrollBox.js';
import { FocusGroup } from './FocusGroup.js';
import { Button } from './Button.js';
import { useFocus } from '../hooks/useFocus.js';
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

  test('a wheel step with the scrollbar paints one frame, not two', async () => {
    const { backend, frame, unmount } = await mount(<ScrollBox height={4} scrollbar><Rows items={lines(8)} /></ScrollBox>, 8, 4);
    await frame();
    const before = backend.frames.length;
    backend.wheel('down', 0, 0);
    expect(await frame()).toEqual(['row 3  │', 'row 4  │', 'row 5  █', 'row 6  █']);
    expect(backend.frames.length - before).toBe(1);
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

  test('a wheel key with a count scrolls that many notches at once, clamped at the ends', async () => {
    const { backend, frame, unmount } = await mount(<ScrollBox height={3}><Rows items={lines(10)} /></ScrollBox>, 12, 3);
    backend.wheel('down', 0, 0, 2);
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8']);
    backend.wheel('up', 0, 0, 5);
    expect(await frame()).toEqual(['row 0', 'row 1', 'row 2']);
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

  // Overlays (absolute children, the scrollbar) are positioned by Yoga relative
  // to the ScrollBox; an ancestor's padding moves the ScrollBox, and the overlays
  // must move with it instead of being clipped away.
  test('overlays and the scrollbar still draw when an ancestor has padding', async () => {
    const { frame, unmount } = await mount(
      <Box flexDirection="column" width={12} height={6} padding={1}>
        <ScrollBox flexGrow={1} flexShrink={1} anchor="bottom" scrollbar>
          <Rows items={lines(20)} />
          <Box position="absolute" top={0} left={0}><Text>TOP</Text></Box>
        </ScrollBox>
      </Box>, 12, 6,
    );
    // 12 wide − 1 padding each side = columns 1‥10; the bar sits in column 10.
    // 20 rows in a 4-row viewport → a one-cell thumb, at the bottom while pinned.
    expect(await frame()).toEqual(['', ' TOP 16   │', ' row 17   │', ' row 18   │', ' row 19   █']);
    unmount();
  });
});

// ─── focus into view ─────────────────────────────────────────────────────────
// The nearest ScrollBox keeps the focused component in view: on focus, and
// while focused when its rect moves or grows. See docs/input.md (focus + Button).

const Buttons = ({ n }: { n: number }) => <>{Array.from({ length: n }, (_, i) => <Button key={i} label={String(i)} onPress={() => {}} />)}</>;

function Tall({ rows }: { rows: number }) {
  const { onLayout } = useFocus();
  return <Box flexDirection="column" onLayout={onLayout}>{Array.from({ length: rows }, (_, i) => <Text key={i}>{`t${i}`}</Text>)}</Box>;
}

describe('ScrollBox: focus into view', () => {
  test('Tab to a focusable below the viewport scrolls the least that shows it; Shift+Tab back scrolls up', async () => {
    const { backend, frame, unmount } = await mount(<FocusGroup><ScrollBox height={2}><Buttons n={5} /></ScrollBox></FocusGroup>, 8, 2);
    expect(await frame()).toEqual(['[ 0 ]', '[ 1 ]']);
    backend.press({ name: 'tab' });
    expect(await frame()).toEqual(['[ 0 ]', '[ 1 ]']); // 1 is in view already: nothing moves
    backend.press({ name: 'tab' });
    expect(await frame()).toEqual(['[ 1 ]', '[ 2 ]']);
    backend.press({ name: 'tab' });
    backend.press({ name: 'tab' });
    expect(await frame()).toEqual(['[ 3 ]', '[ 4 ]']);
    backend.press({ name: 'tab' }); // wraps to the first
    expect(await frame()).toEqual(['[ 0 ]', '[ 1 ]']);
    backend.press({ name: 'tab', shift: true });
    expect(await frame()).toEqual(['[ 3 ]', '[ 4 ]']);
    unmount();
  });

  test('the viewport is the content rect: a border and padding are not part of it', async () => {
    const { backend, frame, unmount } = await mount(
      <FocusGroup><ScrollBox height={5} border="single" paddingTop={1}><Buttons n={5} /></ScrollBox></FocusGroup>, 9, 5,
    );
    backend.press({ name: 'tab' });
    backend.press({ name: 'tab' });
    backend.press({ name: 'tab' });
    const rows = await frame();
    expect(rows[2]).toContain('[ 2 ]');
    expect(rows[3]).toContain('[ 3 ]');
    unmount();
  });

  test('a focused component that grows stays in view', async () => {
    let grow: (n: number) => void = () => {};
    function App() {
      const [rows, setRows] = useState(1);
      grow = setRows;
      return <FocusGroup><ScrollBox height={3}><Text>a</Text><Text>b</Text><Tall rows={rows} /></ScrollBox></FocusGroup>;
    }
    const { frame, unmount } = await mount(<App />, 8, 3);
    expect(await frame()).toEqual(['a', 'b', 't0']);
    grow(3);
    expect(await frame()).toEqual(['t0', 't1', 't2']);
    unmount();
  });

  test('a focusable taller than the viewport shows its top — at mount too, for the auto-focused one', async () => {
    const { frame, unmount } = await mount(<FocusGroup><ScrollBox height={2}><Text>a</Text><Tall rows={4} /></ScrollBox></FocusGroup>, 8, 2);
    expect(await frame()).toEqual(['t0', 't1']);
    unmount();
  });

  test('anchor="bottom": the auto-focused first field is brought into view', async () => {
    const { frame, unmount } = await mount(<FocusGroup><ScrollBox height={2} anchor="bottom"><Buttons n={5} /></ScrollBox></FocusGroup>, 8, 2);
    expect(await frame()).toEqual(['[ 0 ]', '[ 1 ]']);
    unmount();
  });

  test('outside a FocusGroup nothing is revealed — every component counts as focused there', async () => {
    const { frame, unmount } = await mount(<ScrollBox height={2}><Text>a</Text><Text>b</Text><Tall rows={1} /></ScrollBox>, 8, 2);
    expect(await frame()).toEqual(['a', 'b']);
    unmount();
  });
});
