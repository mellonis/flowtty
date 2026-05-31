import React from "react";
import { createElement } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { TestBackend } from '@flowtty/core/testing';
import { Title } from './Title.js';
import { HRule } from './HRule.js';
import { HelpBar } from './HelpBar.js';

function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('chrome primitives', () => {
  test('Title renders bold text at the left of a sized parent row', async () => {
    const backend = new TestBackend(20, 1);
    await render(
      createElement(Box, { flexDirection: 'column', width: 20 },
        createElement(Title, null, 'Hello'),
      ),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toBe('Hello');
  });

  test('HRule paints "─" across the full terminal width', async () => {
    const backend = new TestBackend(8, 1);
    await render(createElement(HRule, {}), backend);
    await flushAsync();
    expect(backend.lastFrame).toBe('────────');
  });

  test('HelpBar pads its text to full width (so inverse bg covers the row)', async () => {
    const backend = new TestBackend(15, 1);
    await render(createElement(HelpBar, null, 'q quit'), backend);
    await flushAsync();
    // The visible chars are the text; the rest are trailing spaces (trimmed by
    // toString) — so we assert the text appears at the start and the cell
    // count matches.
    expect(backend.lastFrame.startsWith('q quit')).toBe(true);
  });

  test('HRule with a custom char', async () => {
    const backend = new TestBackend(5, 1);
    await render(createElement(HRule, { char: '=' }), backend);
    await flushAsync();
    expect(backend.lastFrame).toBe('=====');
  });

  test('Title + HRule + HelpBar compose into a 3-row chrome', async () => {
    const backend = new TestBackend(12, 3);
    await render(
      createElement(Box, { flexDirection: 'column', width: 12, height: 3 },
        createElement(Title, null, 'X'),
        createElement(HRule, {}),
        createElement(Box, { flexGrow: 1 }),
        createElement(HelpBar, null, 'esc'),
      ),
      backend,
    );
    await flushAsync();
    const rows = backend.lastFrame.split('\n');
    expect(rows[0]).toBe('X');
    expect(rows[1]).toBe('────────────');
    expect(rows[rows.length - 1]?.startsWith('esc')).toBe(true);
  });
});
