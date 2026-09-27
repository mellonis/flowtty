import React from "react";
import { createElement, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { describe, test, expect, vi } from 'vitest';
import { render } from '../internal/render.js';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { stringWidth } from '@flowtty/core';
import { DialogHost } from './DialogHost.js';
import { Menu, type MenuItem } from './Menu.js';

describe('Menu (MacOS-style: top bar + cascading submenus, F10 to engage)', () => {
  test('refuses to render on backends declaring fullScreen=false (e.g. inline) and warns once', async () => {
    const printStatic = vi.fn();
    // Inline-style mock: TestBackend-like dims but declares the bounded-region capability.
    const tb = new TestBackend(50, 4);
    const inlineLike: any = Object.assign(tb, { fullScreen: false, printStatic });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const items: MenuItem[] = [{ key: 'a', label: 'Alpha', onSelect: () => {} }];
      await render(createElement(DialogHost, null,
        createElement(Menu, { items }),
      ), inlineLike);
      await flushAsync(tb);
      // Menu returned null → nothing rendered in the live region.
      expect(tb.lastFrame.trim()).toBe('');
      // Warning fired (exactly once, with the component name).
      expect(warn).toHaveBeenCalled();
      const msg = String(warn.mock.calls[0]?.[0] ?? '');
      expect(msg).toContain('<Menu>');
      expect(msg).toContain('full-screen');
    } finally {
      warn.mockRestore();
    }
  });

  test('top bar renders items horizontally (always inverse, idle by default)', async () => {
    const items: MenuItem[] = [
      { key: 'a', label: 'Alpha', onSelect: () => {} },
      { key: 'b', label: 'Beta',  submenu: [{ key: 'c', label: 'Gamma', onSelect: () => {} }] },
    ];
    const backend = new TestBackend(50, 4);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items }),
    ), backend);
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n');
    const bar = rows.find((r) => r.includes('Alpha'));
    expect(bar).toMatch(/ Alpha {2}Beta/);
  });

  test('keys are ignored when idle; F10 engages and unlocks nav', async () => {
    const items: MenuItem[] = [
      { key: 'a', label: 'A', onSelect: () => {} },
      { key: 'b', label: 'B', submenu: [{ key: 'c', label: 'Child', onSelect: () => {} }] },
    ];
    const backend = new TestBackend(40, 8);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items }),
    ), backend);
    await flushAsync(backend);
    // Idle: pressing ↓ should NOT open the (non-existent for A) submenu, just no-op.
    backend.press({ name: 'down' });
    await flushAsync(backend);
    expect(backend.lastFrame).not.toContain('Child');
    // Engage with F10.
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    // Now navigate to B and open its submenu.
    backend.press({ name: 'right' });
    await flushAsync(backend);
    backend.press({ name: 'down' });
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('Child');
  });

  test('engaged: ↓ on a top item with submenu opens a vertical bordered panel', async () => {
    const items: MenuItem[] = [
      { key: 'p', label: 'Parent', submenu: [
        { key: 'a', label: 'Aaa', onSelect: () => {} },
      ]},
    ];
    const backend = new TestBackend(30, 8);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items }),
    ), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });    // engage
    await flushAsync(backend);
    backend.press({ name: 'down' });
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('╭'); // default round border
    expect(backend.lastFrame).toContain('Aaa');
  });

  test('Esc closes the current panel; another Esc disengages; another fires onExit', async () => {
    const onExit = vi.fn();
    const items: MenuItem[] = [
      { key: 'p', label: 'Parent', submenu: [{ key: 'c', label: 'Child', onSelect: () => {} }] },
    ];
    const backend = new TestBackend(30, 8);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items, onExit }),
    ), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });          // engage
    await flushAsync(backend);
    backend.press({ name: 'return' });       // open submenu
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('Child');
    backend.press({ name: 'escape' });       // close submenu
    await flushAsync(backend);
    expect(backend.lastFrame).not.toContain('Child');
    expect(onExit).not.toHaveBeenCalled();
    backend.press({ name: 'escape' });       // disengage (no onExit yet)
    await flushAsync(backend);
    expect(onExit).not.toHaveBeenCalled();
    backend.press({ name: 'escape' });       // disengaged → onExit
    await flushAsync(backend);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test('F10 toggles engage/disengage', async () => {
    const items: MenuItem[] = [
      { key: 'p', label: 'P', submenu: [{ key: 'c', label: 'C', onSelect: () => {} }] },
    ];
    const backend = new TestBackend(30, 8);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items }),
    ), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('C');
    backend.press({ name: 'f10' });          // toggle off → panels collapse
    await flushAsync(backend);
    expect(backend.lastFrame).not.toContain('C');
  });

  test('Tab navigates top items right (after engage); Shift+Tab navigates left', async () => {
    const onB = vi.fn();
    const items: MenuItem[] = [
      { key: 'a', label: 'A', onSelect: () => {} },
      { key: 'b', label: 'B', onSelect: onB },
    ];
    const backend = new TestBackend(30, 4);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items }),
    ), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    backend.press({ name: 'tab' });
    await flushAsync(backend);
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(onB).toHaveBeenCalledTimes(1);
  });

  test('leaf onSelect fires AND fully disengages (collapses panels + deactivates)', async () => {
    const cb = vi.fn();
    const items: MenuItem[] = [
      { key: 'p', label: 'Parent', submenu: [{ key: 'l', label: 'Leaf', onSelect: cb }] },
    ];
    const backend = new TestBackend(30, 8);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items }),
    ), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('Leaf');
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(backend.lastFrame).not.toContain('Leaf');
  });

  test('cascade FLIPS to the left when the right side does not fit', async () => {
    const items: MenuItem[] = [
      { key: 'spacer', label: '                  ', onSelect: () => {} },
      { key: 't', label: 'Things', submenu: [
        { key: 'totd', label: 'ToTheDayList', submenu: [
          { key: 'today', label: 'Today', onSelect: () => {} },
        ]},
      ]},
    ];
    const backend = new TestBackend(40, 10);
    await render(createElement(DialogHost, null,
      createElement(Menu, { items }),
    ), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    backend.press({ name: 'right' });    // to 'Things'
    await flushAsync(backend);
    backend.press({ name: 'down' });     // open Things
    await flushAsync(backend);
    backend.press({ name: 'right' });    // cascade
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('Today');
    const rows = backend.lastFrame.split('\n');
    const todayRow = rows.find((r) => r.includes('Today'));
    const parentRow = rows.find((r) => r.includes('ToTheDayList'));
    expect(todayRow).toBeDefined();
    expect(parentRow).toBeDefined();
    const todayX = todayRow!.indexOf('Today');
    const parentRightX = parentRow!.indexOf('ToTheDayList') + 'ToTheDayList'.length;
    expect(todayX).toBeLessThan(parentRightX);
  });

  // Page-mute behavior is covered by inert.test.ts (which tests the underlying
  // <Box inert> primitive that Menu uses to gate its `children` prop).
  test('a panel pads labels by display column: the focused band is as wide as the widest label for CJK and Latin alike', async () => {
    const items: MenuItem[] = [{ key: 'f', label: 'File', submenu: [
      { key: 'a', label: '日本語', onSelect: () => {} },
      { key: 'b', label: 'ab', onSelect: () => {} },
    ] }];
    const backend = new TestBackend(40, 8);
    await render(createElement(DialogHost, null, createElement(Menu, { items })), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    backend.press({ name: 'down' });
    await flushAsync(backend);
    const inverseCells = (y: number) => {
      const buf = backend.lastBuffer!;
      let n = 0;
      for (let x = 0; x < buf.width; x++) if (buf.get(x, y).style.inverse) n++;
      return n;
    };
    const rows = backend.lastFrame.split('\n');
    const cjkRow = rows.findIndex((l) => l.includes('日本語'));
    const abRow = rows.findIndex((l) => l.includes('ab'));
    // 日本語 is focused: its band is the panel's label width, six columns — not
    // the nine that padding by UTF-16 unit would give.
    expect(inverseCells(cjkRow)).toBe(stringWidth('日本語'));
    backend.press({ name: 'down' });
    await flushAsync(backend);
    expect(inverseCells(abRow)).toBe(stringWidth('日本語'));
  });
  test('a title with wide glyphs offsets the dropdown by its display width', async () => {
    const items: MenuItem[] = [{ key: 'f', label: 'File', submenu: [{ key: 'a', label: 'Aaa', onSelect: () => {} }] }];
    const backend = new TestBackend(40, 8);
    await render(createElement(DialogHost, null, createElement(Menu, { items, title: '日本' })), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    backend.press({ name: 'down' });
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n');
    const corner = rows.find((l) => l.includes('╭'))!;
    // The panel opens under its item, which starts right after " 日本 " (six columns).
    expect(stringWidth(corner.slice(0, corner.indexOf('╭')))).toBe(stringWidth(' 日本 '));
  });

  describe('mouse', () => {
    const items: MenuItem[] = [
      { key: 'file', label: 'File', submenu: [
        { key: 'open', label: 'Open', onSelect: vi.fn() },
        { key: 'recent', label: 'Recent', submenu: [{ key: 'r1', label: 'One', onSelect: vi.fn() }] },
      ]},
      { key: 'edit', label: 'Edit', submenu: [{ key: 'undo', label: 'Undo', onSelect: vi.fn() }] },
      { key: 'quit', label: 'Quit', onSelect: vi.fn() },
    ];
    const leaf = (key: string) => {
      const find = (list: MenuItem[]): MenuItem | undefined => {
        for (const it of list) { if (it.key === key) return it; if ('submenu' in it) { const f = find(it.submenu); if (f) return f; } }
        return undefined;
      };
      return (find(items) as { onSelect: () => void }).onSelect as ReturnType<typeof vi.fn>;
    };
    const click = (backend: TestBackend, x: number, y: number) => { backend.mouse('down', x, y); backend.mouse('up', x, y); };
    const rowOf = (backend: TestBackend, text: string) => backend.lastFrame.split('\n').findIndex((l) => l.includes(text));
    const colOf = (backend: TestBackend, text: string) => backend.lastFrame.split('\n')[rowOf(backend, text)]!.indexOf(text);
    const mount = async (page?: ReactNode) => {
      const backend = new TestBackend(40, 10);
      await render(createElement(DialogHost, null, createElement(Menu, { items }, page)), backend);
      await flushAsync(backend);
      return backend;
    };

    test('idle: a click on a bar item engages and opens its panel; a click on the open one closes it', async () => {
      const backend = await mount();
      click(backend, colOf(backend, 'File') + 1, 0);
      await flush();
      expect(backend.lastFrame).toContain('Open');
      click(backend, colOf(backend, 'File') + 1, 0);
      await flush();
      expect(backend.lastFrame).not.toContain('Open');
    });

    test('a click on another bar item while a panel is open switches panels', async () => {
      const backend = await mount();
      click(backend, colOf(backend, 'File') + 1, 0);
      await flush();
      click(backend, colOf(backend, 'Edit') + 1, 0);
      await flush();
      expect(backend.lastFrame).toContain('Undo');
      expect(backend.lastFrame).not.toContain('Open');
    });

    test('a click on a panel leaf runs it and disengages; on a submenu item opens the cascade', async () => {
      const backend = await mount();
      click(backend, colOf(backend, 'File') + 1, 0);
      await flush();
      click(backend, colOf(backend, 'Recent'), rowOf(backend, 'Recent'));
      await flush();
      expect(backend.lastFrame).toContain('One');
      click(backend, colOf(backend, 'One'), rowOf(backend, 'One'));
      await flush();
      expect(leaf('r1')).toHaveBeenCalledTimes(1);
      expect(backend.lastFrame).not.toContain('One');
      expect(backend.lastFrame).not.toContain('Open');
      // Disengaged: an arrow key no longer moves the bar.
      backend.press({ name: 'right' });
      await flushAsync(backend);
      expect(backend.lastFrame.split('\n')[0]).toContain('File');
    });

    test('a click on a bar leaf runs it without opening anything', async () => {
      const backend = await mount();
      click(backend, colOf(backend, 'Quit') + 1, 0);
      await flush();
      expect(leaf('quit')).toHaveBeenCalledTimes(1);
      expect(backend.lastFrame).not.toContain('╭');
    });

    test('a press outside the panels closes them and disengages, and the page under the menu does not see it', async () => {
      const seen: string[] = [];
      function Page() {
        // A page box with its own onClick, and a listener for what reaches the page.
        return createElement(Box, { onClick: () => seen.push('page-click'), height: 3 }, createElement(Text, null, 'the page'));
      }
      const backend = await mount(createElement(Page));
      const y = rowOf(backend, 'the page'); // before the panel covers the text
      click(backend, colOf(backend, 'File') + 1, 0);
      await flush();
      expect(backend.lastFrame).toContain('Open');
      click(backend, 30, y);
      await flush();
      expect(backend.lastFrame).not.toContain('Open');
      expect(seen).toEqual([]);
      // Disengaged: the next click on the page is the page's.
      click(backend, 30, y);
      await flush();
      expect(seen).toEqual(['page-click']);
    });

    test('a press on a panel border is consumed and changes nothing', async () => {
      const backend = await mount();
      click(backend, colOf(backend, 'File') + 1, 0);
      await flush();
      const top = rowOf(backend, '╭');
      const left = backend.lastFrame.split('\n')[top]!.indexOf('╭');
      click(backend, left, top);
      await flush();
      expect(backend.lastFrame).toContain('Open');
    });
  });
});
