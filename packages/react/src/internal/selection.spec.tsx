import React from 'react';
import { createElement, useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Buffer, type Backend, type Key } from '@flowtty/core';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { render, type CopyEvent } from './render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { Span } from '../components/base/Span.js';
import { Button } from '../components/Button.js';
import { DialogHost } from '../components/DialogHost.js';
import { FocusGroup } from '../components/FocusGroup.js';
import { ScrollBox } from '../components/ScrollBox.js';
import { Markdown } from '../components/Markdown.js';
import { layoutMarkdown, layoutMarkdownDetailed, type MarkdownOptions } from '../components/markdown/layout.js';
import { Table } from '../components/Table.js';
import { useDialogHost } from '../hooks/useDialog.js';
import { useInput } from '../hooks/useInput.js';
import { useApp } from '../hooks/useApp.js';

// Selection rides the ordinary key path, which a backend only starts feeding
// once something subscribes to it — so every fixture keeps one subscriber, the
// way a real `{ mouse: true }` app does (it turned the mouse on for the wheel).
function Listening({ children }: { children?: ReactNode }): ReactNode {
  useInput(() => {});
  return createElement(React.Fragment, null, children);
}

/** A TestBackend that can change size, so a resize can be exercised. */
class ResizableBackend extends TestBackend {
  private w: number;
  private h: number;
  private readonly resizeHandlers = new Set<() => void>();

  constructor(cols: number, rows: number) {
    super(cols, rows);
    this.w = cols;
    this.h = rows;
  }

  override size(): { width: number; height: number } {
    return { width: this.w, height: this.h };
  }

  onResize(handler: () => void): () => void {
    this.resizeHandlers.add(handler);
    return () => { this.resizeHandlers.delete(handler); };
  }

  resize(cols: number, rows: number): void {
    this.w = cols;
    this.h = rows;
    for (const h of [...this.resizeHandlers]) h();
  }
}

/** Every cell of the last frame that came back inverse, as "x,y" strings. */
function inverseCells(backend: TestBackend): string[] {
  const b = backend.lastBuffer;
  if (b === null) return [];
  const out: string[] = [];
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) if (b.get(x, y).style.inverse) out.push(`${x},${y}`);
  }
  return out;
}

/** The characters of the last frame's inverse cells, row by row. */
function inverseText(backend: TestBackend): string {
  const b = backend.lastBuffer;
  if (b === null) return '';
  const rows: string[] = [];
  for (let y = 0; y < b.height; y++) {
    let row = '';
    for (let x = 0; x < b.width; x++) if (b.get(x, y).style.inverse) row += b.get(x, y).char;
    row = row.replace(/ +$/u, '');
    if (row !== '') rows.push(row);
  }
  return rows.join('\n');
}

/** The text of the first `onCopy` a spy saw. */
function copiedText(onCopy: { mock: { calls: unknown[][] } }): string {
  return (onCopy.mock.calls[0]![0] as CopyEvent).text;
}

function drag(backend: TestBackend, from: [number, number], to: [number, number]): void {
  backend.mouse('down', from[0], from[1]);
  backend.mouse('drag', to[0], to[1]);
  backend.mouse('up', to[0], to[1]);
}

describe('drag selection', () => {
  test('a drag within one row inverts the cells it covered and reports their text', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 2);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(inverseCells(backend)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: true, source: 'selection' });
  });

  test('a drag across rows selects a stream, not a rectangle', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(6, 3);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'column' },
          createElement(Text, null, 'abcdef'),
          createElement(Text, null, 'ghijkl'),
          createElement(Text, null, 'mnopqr'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [4, 0], [1, 2]);
    await flush();
    expect(onCopy).toHaveBeenCalledWith({ text: 'ef\nghijkl\nmn', delivered: true, source: 'selection' });
    expect(inverseText(backend)).toBe('ef\nghijkl\nmn');
  });

  test('a drag that ends where it started selects nothing — that is a click', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    backend.mouse('down', 3, 0);
    backend.mouse('up', 3, 0);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
    expect(onCopy).not.toHaveBeenCalled();
  });

  test('a drag over blank cells copies nothing and fires nothing', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 2);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 1], [8, 1]);
    await flush();
    expect(onCopy).not.toHaveBeenCalled();
    expect(backend.clipboard).toEqual([]);
  });

  test('a keystroke drops a finished selection', async () => {
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(inverseCells(backend)).not.toEqual([]);
    backend.press({ name: 'a' });
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });

  test('a second press drops the previous selection', async () => {
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    backend.mouse('down', 8, 0);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });

  test('a right-button drag selects nothing', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    backend.mouse('down', 0, 0, { button: 'right' });
    backend.mouse('drag', 4, 0, { button: 'right' });
    backend.mouse('up', 4, 0, { button: 'right' });
    await flush();
    expect(inverseCells(backend)).toEqual([]);
    expect(onCopy).not.toHaveBeenCalled();
  });

  test('selection: false leaves the frame alone', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { selection: false, onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
    expect(onCopy).not.toHaveBeenCalled();
  });

  test('without mouse keys the controller never touches a frame', async () => {
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
    );
    await flushAsync(backend);
    const before = backend.frames.length;
    backend.press({ name: 'a' });
    backend.wheel('down', 2, 0);
    await flush();
    expect(backend.frames.length).toBe(before);
    expect(inverseCells(backend)).toEqual([]);
  });

  test('an already-inverse cell turns plain, so the highlight stays visible', async () => {
    const backend = new TestBackend(6, 1);
    await render(
      createElement(Listening, null, createElement(Text, { inverse: true }, 'abcdef')),
      backend,
    );
    await flushAsync(backend);
    expect(backend.lastBuffer!.get(0, 0).style.inverse).toBe(true);
    drag(backend, [0, 0], [2, 0]);
    await flush();
    const b = backend.lastBuffer!;
    expect(b.get(0, 0).style.inverse).toBeFalsy();
    expect(b.get(2, 0).style.inverse).toBeFalsy();
    expect(b.get(3, 0).style.inverse).toBe(true);
  });

  test('the frame handed to the backend before a drag is never mutated', async () => {
    const backend = new TestBackend(6, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'abcdef')),
      backend,
    );
    await flushAsync(backend);
    // Frame N already carries a selection, so the overlay on frame N+1 is a
    // different one — the interesting case for a shared buffer.
    drag(backend, [0, 0], [1, 0]);
    await flush();
    const handedOver = backend.lastBuffer!;
    const before = handedOver.toString();
    const styles = [0, 1, 2, 3, 4, 5].map((x) => handedOver.get(x, 0).style.inverse);
    drag(backend, [2, 0], [5, 0]);
    await flush();
    expect(backend.lastBuffer).not.toBe(handedOver);
    expect(handedOver.toString()).toBe(before);
    expect([0, 1, 2, 3, 4, 5].map((x) => handedOver.get(x, 0).style.inverse)).toEqual(styles);
  });
});

describe('double- and triple-click', () => {
  test('a double-click selects the word under the pointer and copies it', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(createElement(Listening, null, createElement(Text, null, 'hello world')), backend, { onCopy });
    await flushAsync(backend);
    backend.mouse('down', 7, 0, { clicks: 2 });
    backend.mouse('up', 7, 0);
    await flush();
    expect(inverseCells(backend)).toEqual(['6,0', '7,0', '8,0', '9,0', '10,0']);
    expect(onCopy).toHaveBeenCalledWith({ text: 'world', delivered: true, source: 'selection' });
  });

  test('a triple-click on a wrapped paragraph copies it as one line', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(8, 3);
    await render(
      createElement(Listening, null,
        createElement(Box, { width: 8 }, createElement(Text, { wrap: 'wrap' }, 'aaa bbb ccc ddd'))),
      backend, { onCopy },
    );
    await flushAsync(backend);
    backend.mouse('down', 1, 1, { clicks: 3 });
    backend.mouse('up', 1, 1);
    await flush();
    expect(onCopy).toHaveBeenCalledWith({ text: 'aaa bbb ccc ddd', delivered: true, source: 'selection' });
  });

  test('a double-click straddling a selectable={false} gutter stops at it', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'row' },
          createElement(Text, null, 'abc'),
          createElement(Text, { selectable: false }, '│'),
          createElement(Text, null, 'def'))),
      backend, { onCopy },
    );
    await flushAsync(backend);
    backend.mouse('down', 5, 0, { clicks: 2 });
    backend.mouse('up', 5, 0);
    await flush();
    expect(onCopy).toHaveBeenCalledWith({ text: 'def', delivered: true, source: 'selection' });
  });

  test('a single press after a double-click drops the word; a double-click on a blank selects nothing', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(createElement(Listening, null, createElement(Text, null, 'hello world')), backend, { onCopy });
    await flushAsync(backend);
    backend.mouse('down', 7, 0, { clicks: 2 });
    backend.mouse('up', 7, 0);
    await flush();
    expect(inverseCells(backend)).toHaveLength(5);
    backend.mouse('down', 1, 0);
    backend.mouse('up', 1, 0);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
    backend.mouse('down', 5, 0, { clicks: 2 });
    backend.mouse('up', 5, 0);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});

describe('selection from code', () => {
  test('select(anchor, head) highlights the range and copies with source api', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    const app = await render(createElement(Listening, null, createElement(Text, null, 'hello world')), backend, { onCopy });
    await flushAsync(backend);
    expect(app.select({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe('hello');
    await flush();
    expect(inverseCells(backend)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: true, source: 'api' });
    app.clearSelection();
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });

  test('selectWord / selectLine from useApp follow the click rules; nothing selectable gives an empty string', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 2);
    let api!: ReturnType<typeof useApp>;
    function Probe(): null { api = useApp(); return null; }
    await render(
      createElement(Listening, null, createElement(Probe), createElement(Text, null, 'hello world')),
      backend, { onCopy },
    );
    await flushAsync(backend);
    expect(api.selectWord(7, 0)).toBe('world');
    expect(api.selectLine(2, 0)).toBe('hello world');
    expect(api.selectWord(5, 0)).toBe(''); // a blank cell
    expect(api.selectWord(0, 1)).toBe(''); // an empty row
    expect(onCopy).toHaveBeenCalledTimes(2);
    await flush();
    expect(inverseCells(backend)).toEqual([]); // the last two calls dropped the earlier selection
  });

  test('with selection: false the code API is inert', async () => {
    const backend = new TestBackend(12, 1);
    const app = await render(createElement(Listening, null, createElement(Text, null, 'hello')), backend, { selection: false });
    await flushAsync(backend);
    expect(app.select({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe('');
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });
});

describe('selection scopes', () => {
  const panes = (): ReactNode => createElement(Listening, null,
    createElement(Box, { flexDirection: 'row' },
      createElement(Box, { border: 'single', width: 8, height: 3, selectionScope: true },
        createElement(Text, null, 'left'),
      ),
      createElement(Box, { border: 'single', width: 8, height: 3, selectionScope: true },
        createElement(Text, null, 'right'),
      ),
    ),
  );

  test('a drag that leaves a scoped pane stops at its content rect', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(16, 3);
    await render(panes(), backend, { onCopy });
    await flushAsync(backend);
    // Press inside the left pane's content, drag far into the right one.
    backend.mouse('down', 1, 1);
    backend.mouse('drag', 14, 2);
    backend.mouse('up', 14, 2);
    await flush();
    // The left pane's content rect is columns 1..6 of row 1 — nothing else may
    // come back inverse: not its border, not the gap, not the neighbour.
    for (const cell of inverseCells(backend)) {
      const [x, y] = cell.split(',').map(Number) as [number, number];
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(6);
      expect(y).toBe(1);
    }
    const text = copiedText(onCopy);
    expect(text).toBe('left');
    expect(text).not.toMatch(/[│─┌┐└┘]/u);
    expect(text).not.toMatch(/right/u);
  });

  test('a drag inside a dialog picks up neither its border nor what is behind it', async () => {
    const onCopy = vi.fn();
    function Opener(): ReactNode {
      const { openDialog } = useDialogHost();
      const [opened, setOpened] = useState(false);
      if (!opened) {
        setOpened(true);
        void openDialog(
          createElement(Box, { flexDirection: 'column' },
            createElement(Text, null, 'dialog one'),
            createElement(Text, null, 'dialog two'),
          ),
          { floating: true, title: 'Pick' },
        );
      }
      return createElement(Text, null, 'BACKGROUNDBACKGROUND');
    }
    const backend = new TestBackend(20, 6);
    await render(
      createElement(Listening, null,
        createElement(DialogHost, null, createElement(Opener)),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    expect(backend.lastFrame).toMatch(/dialog one/u);
    const rows = backend.lastFrame.split('\n');
    const y = rows.findIndex((r) => r.includes('dialog one'));
    const x = rows[y]!.indexOf('dialog one');
    // Start inside the dialog's text and drag off the bottom-right corner.
    backend.mouse('down', x, y);
    backend.mouse('drag', 19, 5);
    backend.mouse('up', 19, 5);
    await flush();
    const text = copiedText(onCopy);
    expect(text).toMatch(/dialog one/u);
    expect(text).toMatch(/dialog two/u);
    expect(text).not.toMatch(/BACKGROUND/u);
    expect(text).not.toMatch(/[│─┌┐└┘]/u);
    expect(inverseText(backend)).not.toMatch(/BACKGROUND/u);
  });

  test('a ScrollBox scopes to its viewport, and copies what is on screen', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 3);
    await render(
      createElement(Listening, null,
        createElement(ScrollBox, { height: 3, offset: 2, scrollbar: true },
          ...['row one', 'row two', 'row three', 'row four', 'row five'].map((t, i) =>
            createElement(Text, { key: i }, t)),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    expect(backend.lastFrame).toMatch(/row three/u);
    // Drag from the first visible row far past the box's right edge.
    backend.mouse('down', 0, 0);
    backend.mouse('drag', 11, 1);
    backend.mouse('up', 11, 1);
    await flush();
    const text = copiedText(onCopy);
    expect(text).toBe('row three\nrow four');
    expect(text).not.toMatch(/row one|row two|row five/u);
    // The scrollbar lives in the padding column, outside the viewport's content
    // rect, so the drag never reaches it.
    for (const cell of inverseCells(backend)) {
      expect(Number(cell.split(',')[0])).toBeLessThan(11);
    }
  });

  test('a selectable={false} region is skipped in the highlight and in the text', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 3);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'column' },
          createElement(Text, null, 'visible one'),
          createElement(Box, { selectable: false }, createElement(Text, null, 'SECRET')),
          createElement(Text, null, 'visible two'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [11, 2]);
    await flush();
    // The opted-out row contributes nothing at all — not even a blank line:
    // none of it was selectable, so it is not a line of the text.
    const text = copiedText(onCopy);
    expect(text).toBe('visible one\nvisible two');
    expect(inverseText(backend)).toBe('visible one\nvisible two');
  });

  test('a press inside a selectable={false} region anchors, and copies none of it', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 2);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'column' },
          createElement(Box, { selectable: false }, createElement(Text, null, 'SECRET')),
          createElement(Text, null, 'visible two'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    // Dragging OUT of an opted-out region is an ordinary gesture — out of a
    // code block's gutter, off a password field. The region itself is never
    // highlighted and never read.
    drag(backend, [2, 0], [8, 1]);
    await flush();
    expect(inverseText(backend)).toBe('visible t');
    expect(copiedText(onCopy)).toBe('visible t');
    // A press and a release inside it still yield nothing at all.
    onCopy.mockClear();
    drag(backend, [1, 0], [4, 0]);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
    expect(onCopy).not.toHaveBeenCalled();
  });
});

describe('selection invalidation', () => {
  test('a resize drops the selection', async () => {
    const backend = new ResizableBackend(12, 2);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend as unknown as Backend,
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(inverseCells(backend)).not.toEqual([]);
    backend.resize(20, 2);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });

  test('content changing under the selection drops it', async () => {
    let setLabel!: (s: string) => void;
    function App(): ReactNode {
      const [label, set] = useState('hello world');
      setLabel = set;
      useInput(() => {});
      return createElement(Text, null, label);
    }
    const backend = new TestBackend(12, 1);
    await render(createElement(App), backend);
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(inverseCells(backend)).not.toEqual([]);
    setLabel('HELLO world');
    await flushAsync(backend);
    expect(inverseCells(backend)).toEqual([]);
  });

  test('a key that both drops the selection and changes the content draws once', async () => {
    let setLabel!: (s: string) => void;
    function App(): ReactNode {
      const [label, set] = useState('hello world');
      setLabel = set;
      useInput((key) => { if (key.name === 'x') setLabel('HELLO world'); });
      return createElement(Text, null, label);
    }
    const backend = new TestBackend(12, 1);
    await render(createElement(App), backend);
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    const before = backend.frames.length;
    backend.press({ name: 'x' });
    await flushAsync(backend);
    // One frame: the repaint the key caused, already carrying no highlight —
    // not a clear-the-highlight draw of the OLD text followed by the new one.
    expect(backend.frames.length).toBe(before + 1);
    expect(backend.lastFrame).toBe('HELLO world');
    expect(inverseCells(backend)).toEqual([]);
    expect(setLabel).toBeTypeOf('function');
  });

  test('a repaint elsewhere keeps the selection', async () => {
    let setTick!: (n: number) => void;
    function App(): ReactNode {
      const [tick, set] = useState(0);
      setTick = set;
      useInput(() => {});
      return createElement(Box, { flexDirection: 'column' },
        createElement(Text, null, 'hello world'),
        createElement(Text, null, `tick ${tick}`),
      );
    }
    const backend = new TestBackend(12, 2);
    await render(createElement(App), backend);
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    const selected = inverseCells(backend);
    expect(selected).not.toEqual([]);
    setTick(1);
    await flushAsync(backend);
    expect(backend.lastFrame).toMatch(/tick 1/u);
    expect(inverseCells(backend)).toEqual(selected);
  });
});

describe('selection and the rest of the app', () => {
  test('mouse keys still reach useInput subscribers', async () => {
    const seen: Key[] = [];
    function App(): ReactNode {
      useInput((key) => { seen.push(key); });
      return createElement(Text, null, 'hello world');
    }
    const backend = new TestBackend(12, 1);
    await render(createElement(App), backend);
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(seen.map((k) => k.name)).toEqual(['mousedown', 'mousedrag', 'mouseup']);
  });

  test('a drag starting on a Button leaves its keyboard behaviour intact', async () => {
    const onPress = vi.fn();
    const backend = new TestBackend(14, 1);
    await render(
      createElement(Listening, null,
        createElement(FocusGroup, null, createElement(Button, { label: 'Save', onPress })),
      ),
      backend,
    );
    await flushAsync(backend);
    expect(backend.lastFrame).toBe('[ Save ]');
    drag(backend, [2, 0], [5, 0]);
    await flush();
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('200 drag steps over a 200x60 frame stay well under a second', async () => {
    const backend = new TestBackend(200, 60);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'column' },
          ...Array.from({ length: 60 }, (_, i) =>
            createElement(Text, { key: i }, `row ${i} `.repeat(20).slice(0, 190))),
        ),
      ),
      backend,
    );
    await flushAsync(backend);
    const started = Date.now();
    backend.mouse('down', 0, 0);
    for (let i = 0; i < 200; i++) {
      backend.mouse('drag', i % 190, i % 60);
      await flush(); // one repaint per step, as a terminal delivers them
    }
    backend.mouse('up', 10, 10);
    const elapsed = Date.now() - started;
    // Every step that moved the head redrew — the timing below is the real
    // per-event cost, not a coalesced one.
    expect(backend.frames.length).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(1000);
  });
});

test('a buffer clone shares no cell writes with its original', () => {
  const b = new Buffer(2, 1);
  b.set(0, 0, 'a', { bold: true });
  const copy = b.clone();
  copy.set(0, 0, 'z', {});
  expect(b.get(0, 0).char).toBe('a');
  expect(b.get(0, 0).style.bold).toBe(true);
  expect(copy.get(0, 0).char).toBe('z');
});

describe('copy on select', () => {
  test('a finished drag puts the text on the clipboard and reports that it landed', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(backend.clipboard).toEqual(['hello']);
    expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: true, source: 'selection' });
  });

  test('copyOnSelect: false skips the clipboard but still tells the app', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy, copyOnSelect: false },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(backend.clipboard).toEqual([]);
    expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: false, source: 'selection' });
  });

  test('onCopy fires with delivered: false when the terminal has no clipboard', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    backend.clipboardAvailable = false;
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(backend.clipboard).toEqual([]);
    expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: false, source: 'selection' });
  });

  test('a backend with no copy capability at all still reports the selection', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    (backend as { copy?: unknown }).copy = undefined;
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: false, source: 'selection' });
  });

  test('a copy does not disturb the frame — the selection stays highlighted', async () => {
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(backend.clipboard).toEqual(['hello']);
    expect(inverseCells(backend)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
  });
});

describe('useApp().copy and RenderHandle.copy', () => {
  test('useApp().copy writes to the clipboard and fires onCopy with source: api', async () => {
    const onCopy = vi.fn();
    let copied: boolean | null = null;
    function App(): ReactNode {
      const { copy } = useApp();
      useInput((key) => { if (key.name === 'c') copied = copy('from the app'); });
      return createElement(Text, null, 'hello');
    }
    const backend = new TestBackend(12, 1);
    await render(createElement(App), backend, { onCopy });
    await flushAsync(backend);
    backend.press({ name: 'c' });
    await flushAsync(backend);
    expect(copied).toBe(true);
    expect(backend.clipboard).toEqual(['from the app']);
    expect(onCopy).toHaveBeenCalledWith({ text: 'from the app', delivered: true, source: 'api' });
  });

  test('useApp().copy reports false and still fires onCopy when the terminal refuses', async () => {
    const onCopy = vi.fn();
    let copied: boolean | null = null;
    function App(): ReactNode {
      const { copy } = useApp();
      useInput((key) => { if (key.name === 'c') copied = copy('from the app'); });
      return createElement(Text, null, 'hello');
    }
    const backend = new TestBackend(12, 1);
    backend.clipboardAvailable = false;
    await render(createElement(App), backend, { onCopy });
    await flushAsync(backend);
    backend.press({ name: 'c' });
    await flushAsync(backend);
    expect(copied).toBe(false);
    expect(onCopy).toHaveBeenCalledWith({ text: 'from the app', delivered: false, source: 'api' });
  });

  test('RenderHandle.copy works from outside the tree, and goes quiet after unmount', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    const app = await render(createElement(Text, null, 'hello'), backend, { onCopy });
    await flushAsync(backend);
    expect(app.copy('outside')).toBe(true);
    expect(backend.clipboard).toEqual(['outside']);
    app.unmount();
    expect(app.copy('after')).toBe(false);
    expect(backend.clipboard).toEqual(['outside']);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith({ text: 'outside', delivered: true, source: 'api' });
  });
});

describe('soft-wrapped text', () => {
  test('a wrapped paragraph in a scoped pane pastes as one line', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 3);
    await render(
      createElement(Listening, null,
        createElement(Box, { width: 12, selectionScope: true },
          createElement(Text, { wrap: 'wrap' }, 'hello world again'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [11, 1]);
    await flush();
    expect(copiedText(onCopy)).toBe('hello world again');
  });

  test('two separate Text lines keep their newline', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 2);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'column' },
          createElement(Text, null, 'hello'),
          createElement(Text, null, 'world'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [11, 1]);
    await flush();
    expect(copiedText(onCopy)).toBe('hello\nworld');
  });

  test('an explicit newline inside one Text is a newline in the copy', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 2);
    await render(
      createElement(Listening, null,
        createElement(Box, { width: 12, selectionScope: true },
          createElement(Text, { wrap: 'wrap' }, 'one\ntwo'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [11, 1]);
    await flush();
    expect(copiedText(onCopy)).toBe('one\ntwo');
  });

  test('a scoped wrapped pane joins its rows while its neighbour is untouched', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(16, 3);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'row' },
          createElement(Box, { width: 6, selectionScope: true },
            createElement(Text, { wrap: 'wrap' }, 'aaa bbb'),
          ),
          createElement(Box, { width: 10, flexDirection: 'column' },
            createElement(Text, null, 'ONE'),
            createElement(Text, null, 'TWO'),
          ),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    // Drag right out of the left pane: the scope clamps it, and the two rows
    // are the one paragraph they were written as.
    backend.mouse('down', 0, 0);
    backend.mouse('drag', 15, 1);
    backend.mouse('up', 15, 1);
    await flush();
    expect(copiedText(onCopy)).toBe('aaa bbb');
  });

  test('a wrapped paragraph crossing an unscoped multi-pane row is not joined', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(16, 3);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'row' },
          createElement(Box, { width: 6 }, createElement(Text, { wrap: 'wrap' }, 'aaa bbb')),
          createElement(Box, { width: 10, flexDirection: 'column' },
            createElement(Text, null, 'ONE'),
            createElement(Text, null, 'TWO'),
          ),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [15, 1]);
    await flush();
    // The drag picked up the right-hand pane too, so the rows are separate
    // lines — exactly what the terminal's own selection would copy.
    expect(copiedText(onCopy)).toBe('aaa   ONE\nbbb   TWO');
  });

  test('a Span run inside a wrapped Text comes back as one line', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 3);
    await render(
      createElement(Listening, null,
        createElement(Box, { width: 12, selectionScope: true },
          createElement(Text, { wrap: 'wrap' },
            'hello ',
            createElement(Span, { bold: true }, 'world'),
            ' again',
          ),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    drag(backend, [0, 0], [11, 1]);
    await flush();
    expect(copiedText(onCopy)).toBe('hello world again');
  });
});

describe('selection over a Markdown document', () => {
  /** Drag over every row the document actually painted, blank tail excluded. */
  function dragDocument(backend: TestBackend, width: number): void {
    const rows = backend.lastFrame.split('\n');
    let last = rows.length - 1;
    while (last > 0 && rows[last]!.trim() === '') last--;
    drag(backend, [0, 0], [width - 1, last]);
  }

  const scoped = (source: string, width: number): ReactNode => createElement(Listening, null,
    createElement(Box, { width, selectionScope: true },
      createElement(Markdown, { width }, source),
    ),
  );

  test('a wrapped Markdown paragraph pastes as one line', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 4);
    await render(scoped('one two three four', 12), backend, { onCopy });
    await flushAsync(backend);
    expect(backend.lastFrame.split('\n').length).toBeGreaterThan(1);
    dragDocument(backend, 12);
    await flush();
    expect(copiedText(onCopy)).toBe('one two three four');
  });

  test('a wrapped Markdown list item keeps its bullet and loses the hanging indent', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 4);
    await render(scoped('- one two three four', 12), backend, { onCopy });
    await flushAsync(backend);
    dragDocument(backend, 12);
    await flush();
    expect(copiedText(onCopy)).toBe('• one two three four');
  });

  test('a wrapped code row rejoins, and the gutter in front of it is not copied', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(14, 6);
    const code = 'const aLongIdentifier = 1';
    await render(scoped('```\n' + code + '\n```', 14), backend, { onCopy });
    await flushAsync(backend);
    dragDocument(backend, 14);
    await flush();
    expect(copiedText(onCopy)).toBe(code);
  });

  test('a gutterless code row rejoins at the exact column it was cut', async () => {
    // A literal fence wears no gutter, so the two halves of the line belong
    // together — and the cut lands just after a space, which is content.
    const onCopy = vi.fn();
    const backend = new TestBackend(14, 5);
    const code = 'const abcde = 1;'; // cut at column 14, right after a space
    await render(
      createElement(Listening, null,
        createElement(Box, { width: 14, selectionScope: true },
          createElement(Markdown, { width: 14, codeFence: 'literal' }, '```\n' + code + '\n```'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    // Row 0 and the last row are the fences; drag over the code rows only.
    const rows = backend.lastFrame.split('\n');
    const lastCode = rows.findIndex((r, i) => i > 0 && r.startsWith('```')) - 1;
    expect(lastCode).toBeGreaterThan(1); // it really did wrap
    drag(backend, [0, 1], [13, lastCode]);
    await flush();
    expect(copiedText(onCopy)).toBe(code);
  });

  test('a wrapped diff row does not copy the band padding after its text', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(16, 6);
    const line = '+added a longer line here';
    await render(
      createElement(Listening, null,
        createElement(Box, { width: 16, selectionScope: true },
          createElement(Markdown, { width: 16, codeFence: 'literal' }, '```diff\n' + line + '\n```'),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n');
    const lastCode = rows.findIndex((r, i) => i > 0 && r.startsWith('```')) - 1;
    expect(lastCode).toBeGreaterThan(1); // it really did wrap
    drag(backend, [0, 1], [15, lastCode]);
    await flush();
    expect(copiedText(onCopy)).toBe(line);
  });

  test('two Markdown paragraphs stay two lines', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(20, 4);
    await render(scoped('one\n\ntwo', 20), backend, { onCopy });
    await flushAsync(backend);
    dragDocument(backend, 20);
    await flush();
    expect(copiedText(onCopy)).toBe('one\n\ntwo');
  });
});

test('a Table is its own selection scope — a drag out of it stops at the grid', async () => {
  const onCopy = vi.fn();
  const backend = new TestBackend(24, 6);
  await render(
    createElement(Listening, null,
      createElement(Box, { flexDirection: 'row' },
        createElement(Box, { width: 12 },
          createElement(Table<{ a: string; b: string }>, {
            data: [{ a: 'one', b: 'two' }],
            columns: [{ accessor: 'a', header: 'A' }, { accessor: 'b', header: 'B' }],
          }),
        ),
        createElement(Box, { width: 12 }, createElement(Text, null, 'NEIGHBOUR')),
      ),
    ),
    backend,
    { onCopy },
  );
  await flushAsync(backend);
  backend.mouse('down', 0, 0);
  backend.mouse('drag', 23, 5);
  backend.mouse('up', 23, 5);
  await flush();
  expect(copiedText(onCopy)).not.toMatch(/NEIGHBOUR/u);
  expect(copiedText(onCopy)).toMatch(/two/u);
});

describe('a user callback that throws', () => {
  // `onCopy` runs a `spawn('pbcopy')` in a real app. An ENOENT there used to
  // escape the backend's stdin handler as an uncaughtException, leaving the
  // terminal in the alt screen with the mouse still reporting.
  const boom = (): never => { throw new Error('pbcopy: ENOENT'); };

  test('a throwing onCopy is handled, not thrown out of the key handler', async () => {
    const onError = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null, createElement(Text, null, 'hello world')),
      backend,
      { onError, onCopy: boom },
    );
    await flushAsync(backend);
    expect(() => drag(backend, [0, 0], [4, 0])).not.toThrow();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    const info = onError.mock.calls[0]![0] as { error: Error; source: string };
    expect(info.error.message).toBe('pbcopy: ENOENT');
    expect(info.source).toBe('callback');
  });

  test('the key still reaches useInput subscribers, before onCopy runs', async () => {
    const seen: string[] = [];
    function App(): ReactNode {
      useInput((key) => { seen.push(key.name); });
      return createElement(Text, null, 'hello world');
    }
    const backend = new TestBackend(12, 1);
    await render(createElement(App), backend, {
      onError: () => {},
      onCopy: () => { seen.push('onCopy'); boom(); },
    });
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(seen).toEqual(['mousedown', 'mousedrag', 'mouseup', 'onCopy']);
  });

  test('a successful onCopy runs after the key was dispatched too', async () => {
    const seen: string[] = [];
    function App(): ReactNode {
      useInput((key) => { seen.push(key.name); });
      return createElement(Text, null, 'hello world');
    }
    const backend = new TestBackend(12, 1);
    await render(createElement(App), backend, { onCopy: () => { seen.push('onCopy'); } });
    await flushAsync(backend);
    drag(backend, [0, 0], [4, 0]);
    await flush();
    expect(seen).toEqual(['mousedown', 'mousedrag', 'mouseup', 'onCopy']);
    expect(backend.clipboard).toEqual(['hello']);
  });

  test('a throwing onCopy from useApp().copy is handled the same way', async () => {
    const onError = vi.fn();
    let copied: boolean | null = null;
    function App(): ReactNode {
      const { copy } = useApp();
      useInput((key) => { if (key.name === 'c') copied = copy('from the app'); });
      return createElement(Text, null, 'hello');
    }
    const backend = new TestBackend(12, 1);
    await render(createElement(App), backend, { onError, onCopy: boom });
    await flushAsync(backend);
    expect(() => backend.press({ name: 'c' })).not.toThrow();
    await flush();
    // The text went to the terminal before the app's callback was told about it.
    expect(backend.clipboard).toEqual(['from the app']);
    expect(copied).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as { source: string }).source).toBe('callback');
  });
});

test('a drag over two panes copies the scoped one word for word', async () => {
  // The end-to-end shape of the whole feature: a scope, a border, a wrap that
  // eats a space, a double space that must survive and a word too long to fit.
  // The double space lands ON a wrap break: one of the two is painted at the
  // end of the row and the other is what the wrap dropped.
  const source = 'alpha beta  supercalifragilisticexpialidocious gamma';
  const onCopy = vi.fn();
  // Panes two rows taller than the text they hold: the empty rows a drag to the
  // bottom edge sweeps are not part of what was copied.
  const backend = new TestBackend(40, 8);
  await render(
    createElement(Listening, null,
      createElement(Box, { flexDirection: 'row' },
        createElement(Box, { width: 20, height: 8, border: 'single', selectionScope: true },
          createElement(Text, { wrap: 'wrap' }, source),
        ),
        createElement(Box, { width: 20, height: 8, border: 'single' },
          createElement(Text, { wrap: 'wrap' }, 'unrelated text over here'),
        ),
      ),
    ),
    backend,
    { onCopy },
  );
  await flushAsync(backend);
  backend.mouse('down', 0, 0);
  backend.mouse('drag', 39, 7);
  backend.mouse('up', 39, 7);
  await flush();
  expect(copiedText(onCopy)).toBe(source);
});

test('a tab in the source comes back as the space it is painted as', async () => {
  // The painter substitutes a space for every control byte, so that is what a
  // selection can return — documented in docs/input.md (selection).
  const onCopy = vi.fn();
  const backend = new TestBackend(12, 1);
  await render(
    createElement(Listening, null,
      createElement(Box, { width: 12, selectionScope: true },
        createElement(Text, { wrap: 'wrap' }, 'a\tb'),
      ),
    ),
    backend,
    { onCopy },
  );
  await flushAsync(backend);
  drag(backend, [0, 0], [11, 0]);
  await flush();
  expect(copiedText(onCopy)).toBe('a b');
});

describe('the coordinator’s two-pane probe', () => {
  const PARAGRAPH = 'alpha beta  supercalifragilisticexpialidocious gamma';
  const CODE = 'const x = 1; const yy = 2;';

  /** Two bordered, scoped panes side by side, each taller than its text. */
  function probe(onCopy: (event: CopyEvent) => void): Promise<TestBackend> {
    const backend = new TestBackend(44, 8);
    return render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'row', height: 8 },
          createElement(Box, { width: 22, height: 8, border: 'round', selectionScope: true },
            createElement(Text, { wrap: 'wrap' }, PARAGRAPH),
          ),
          createElement(Box, { width: 22, height: 8, border: 'round', selectionScope: true },
            createElement(Markdown, { width: 20 }, '```\n' + CODE + '\n```'),
          ),
        ),
      ),
      backend,
      { onCopy },
    ).then(() => backend);
  }

  test('a pane taller than its text copies no trailing blank rows', async () => {
    const onCopy = vi.fn();
    const backend = await probe(onCopy);
    await flushAsync(backend);
    drag(backend, [0, 0], [43, 7]);
    await flush();
    expect(copiedText(onCopy)).toBe(PARAGRAPH);
  });

  test('a drag over a fenced block copies the code, not the gutter', async () => {
    const onCopy = vi.fn();
    const backend = await probe(onCopy);
    await flushAsync(backend);
    drag(backend, [23, 1], [43, 6]);
    await flush();
    expect(copiedText(onCopy)).toBe(CODE);
  });
});

describe('copying a fenced block out of a document', () => {
  const SOURCE = [
    'function total(items) {',
    '  const sum = items.reduce((a, b) => a + b.price, 0);',
    '',
    '  return sum;',
    '}',
  ].join('\n');

  /** Drag over the rows of the document, blank tail excluded. */
  function dragAll(backend: TestBackend, width: number): void {
    const rows = backend.lastFrame.split('\n');
    let last = rows.length - 1;
    while (last > 0 && !/[^ ]/u.test(rows[last]!)) last--;
    drag(backend, [0, 0], [width - 1, last]);
  }

  async function copyDocument(src: string, width: number, options: MarkdownOptions): Promise<string> {
    const onCopy = vi.fn();
    const backend = new TestBackend(width, 40);
    await render(
      createElement(Listening, null,
        createElement(Box, { width, selectionScope: true },
          createElement(Markdown, { width, ...options }, src),
        ),
      ),
      backend,
      { onCopy },
    );
    await flushAsync(backend);
    dragAll(backend, width);
    await flush();
    return onCopy.mock.calls.length === 0 ? '' : copiedText(onCopy);
  }

  for (const lineNumbers of [false, true]) {
    test(`a wrapped block comes back as its source — bar fence, lineNumbers: ${lineNumbers}`, async () => {
      const doc = '```js\n' + SOURCE + '\n```';
      const options: MarkdownOptions = { lineNumbers };
      const { codeBlocks } = layoutMarkdownDetailed(doc, 24, options);
      expect(await copyDocument(doc, 24, options)).toBe(codeBlocks[0]!.source);
    });

    test(`a literal fence keeps its backticks — lineNumbers: ${lineNumbers}`, async () => {
      const doc = '```js\n' + SOURCE + '\n```';
      const options: MarkdownOptions = { codeFence: 'literal', lineNumbers };
      const { codeBlocks } = layoutMarkdownDetailed(doc, 24, options);
      // In literal mode the fence rows are what the author chose to show, so
      // they are content and come back with the block.
      expect(await copyDocument(doc, 24, options))
        .toBe('```js\n' + codeBlocks[0]!.source + '\n```');
    });
  }

  test('a labelled block leaves its label row behind', async () => {
    const doc = '```ts title="src/app.ts"\nconst x = 1;\n```';
    expect(await copyDocument(doc, 30, {})).toBe('const x = 1;');
  });

  test('truncate mode copies what is on screen, ellipsis and all', async () => {
    // Documented in docs/components.md: with `codeWrap: 'truncate'` the row IS
    // the cut text, so that is what a drag can return.
    const doc = '```js\n' + SOURCE + '\n```';
    const options: MarkdownOptions = { codeWrap: 'truncate' };
    const visible = layoutMarkdown(doc, 24, options)
      .slice(1) // the label row is chrome
      .map((l) => l.spans.slice(l.chrome ?? 0).map((s) => s.text).join('').replace(/ +$/u, ''))
      .join('\n');
    expect(visible).toMatch(/…/u);
    expect(await copyDocument(doc, 24, options)).toBe(visible);
  });

  test('a diff keeps its +/- column — a copied diff still applies', async () => {
    const doc = '```diff\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n```';
    const { codeBlocks } = layoutMarkdownDetailed(doc, 30, {});
    expect(await copyDocument(doc, 30, {})).toBe(codeBlocks[0]!.source);
  });

  test('a wrapped blockquote comes back without its bar', async () => {
    expect(await copyDocument('> one two three four five six', 14, {}))
      .toBe('one two three four five six');
  });

  test('a list keeps its marker and a task list its checkbox', async () => {
    expect(await copyDocument('- one two three four\n- [x] done', 12, {}))
      .toBe('• one two three four\n☑ done');
  });
});

test('a row that is frame from edge to edge is no line of the document', async () => {
  // A fence label is chrome across its whole row. It used to come back as an
  // empty line, so a quote followed by a labelled block copied with TWO blank
  // lines between them — the document's own, and the label's.
  const doc = [
    '> quoted text that is long enough to wrap',
    '',
    '```diff title="a.ts"',
    '@@ -1,2 +1,2 @@',
    ' ctx',
    '-const x = 1; const yy = 2;',
    '+const x = 3;',
    '```',
  ].join('\n');
  const onCopy = vi.fn();
  const backend = new TestBackend(24, 40);
  await render(
    createElement(Listening, null,
      createElement(Box, { width: 24, selectionScope: true },
        createElement(Markdown, { width: 24, lineNumbers: true }, doc),
      ),
    ),
    backend,
    { onCopy },
  );
  await flushAsync(backend);
  const rows = backend.lastFrame.split('\n');
  let last = rows.length - 1;
  while (last > 0 && !/[^ ]/u.test(rows[last]!)) last--;
  drag(backend, [0, 0], [23, last]);
  await flush();
  expect(copiedText(onCopy)).toBe(
    'quoted text that is long enough to wrap\n\n'
    + '@@ -1,2 +1,2 @@\n ctx\n-const x = 1; const yy = 2;\n+const x = 3;',
  );
});

test('a highlight over colored content keeps each cell\'s own pair of colors under the band', async () => {
  // A diff row (red on a dark band) and a cyan heading: each cell keeps its
  // own fg and bg and only `inverse` is added, so the band is the text's color
  // and the glyph its background — the pair that contrasted before the drag.
  const doc = '## Heading\n\n```diff\n-const a = 1;\n+const a = 2;\n```';
  const backend = new TestBackend(24, 10);
  await render(
    createElement(Listening, null,
      createElement(Box, { width: 24, selectionScope: true },
        createElement(Markdown, { width: 24 }, doc),
      ),
    ),
    backend,
  );
  await flushAsync(backend);
  const before = backend.lastBuffer!.clone();
  const rows = backend.lastFrame.split('\n');
  let last = rows.length - 1;
  while (last > 0 && !/[^ ]/u.test(rows[last]!)) last--;
  backend.mouse('down', 0, 0);
  backend.mouse('drag', 23, last);
  await flush();
  const frame = backend.lastBuffer!;
  let selected = 0;
  let withBand = 0;
  for (let y = 0; y <= last; y++) {
    for (let x = 0; x < frame.width; x++) {
      const { style } = frame.get(x, y);
      if (style.inverse !== true) continue;
      selected++;
      const own = before.get(x, y).style;
      // Never a color the cell did not have, and never one it had taken away:
      // the band is the cell's own fg and the glyph its own bg. `dim` goes.
      expect(style.fg, `cell ${x},${y}`).toBe(own.fg);
      expect(style.bg, `cell ${x},${y}`).toBe(own.bg);
      expect(style.dim, `cell ${x},${y}`).toBeUndefined();
      if (own.fg !== undefined && own.bg !== undefined) withBand++;
    }
  }
  expect(selected).toBeGreaterThan(30);
  // The diff rows carry a color on a band of their own, and keep both.
  expect(withBand).toBeGreaterThan(0);
  // The heading keeps its cyan — as the band's color, with the glyph in the
  // default background.
  const heading = frame.get(3, 0);
  expect(heading.char).toBe('H');
  expect(heading.style).toEqual({ inverse: true, fg: 'cyan', bold: true });
});
