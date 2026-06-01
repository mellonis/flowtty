import React from "react";
import { createElement } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render } from '../internal/render.js';
import { TestBackend } from '@flowtty/core/testing';
import { DialogHost } from './DialogHost.js';
import { Menu, type MenuItem } from './Menu.js';

function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

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
      await flushAsync();
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
    await flushAsync();
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
    await flushAsync();
    // Idle: pressing ↓ should NOT open the (non-existent for A) submenu, just no-op.
    backend.press({ name: 'down' });
    await flushAsync();
    expect(backend.lastFrame).not.toContain('Child');
    // Engage with F10.
    backend.press({ name: 'f10' });
    await flushAsync();
    // Now navigate to B and open its submenu.
    backend.press({ name: 'right' });
    await flushAsync();
    backend.press({ name: 'down' });
    await flushAsync();
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
    await flushAsync();
    backend.press({ name: 'f10' });    // engage
    await flushAsync();
    backend.press({ name: 'down' });
    await flushAsync();
    expect(backend.lastFrame).toContain('┌');
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
    await flushAsync();
    backend.press({ name: 'f10' });          // engage
    await flushAsync();
    backend.press({ name: 'return' });       // open submenu
    await flushAsync();
    expect(backend.lastFrame).toContain('Child');
    backend.press({ name: 'escape' });       // close submenu
    await flushAsync();
    expect(backend.lastFrame).not.toContain('Child');
    expect(onExit).not.toHaveBeenCalled();
    backend.press({ name: 'escape' });       // disengage (no onExit yet)
    await flushAsync();
    expect(onExit).not.toHaveBeenCalled();
    backend.press({ name: 'escape' });       // disengaged → onExit
    await flushAsync();
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
    await flushAsync();
    backend.press({ name: 'f10' });
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(backend.lastFrame).toContain('C');
    backend.press({ name: 'f10' });          // toggle off → panels collapse
    await flushAsync();
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
    await flushAsync();
    backend.press({ name: 'f10' });
    await flushAsync();
    backend.press({ name: 'tab' });
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
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
    await flushAsync();
    backend.press({ name: 'f10' });
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(backend.lastFrame).toContain('Leaf');
    backend.press({ name: 'return' });
    await flushAsync();
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
    await flushAsync();
    backend.press({ name: 'f10' });
    await flushAsync();
    backend.press({ name: 'right' });    // to 'Things'
    await flushAsync();
    backend.press({ name: 'down' });     // open Things
    await flushAsync();
    backend.press({ name: 'right' });    // cascade
    await flushAsync();
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
});
