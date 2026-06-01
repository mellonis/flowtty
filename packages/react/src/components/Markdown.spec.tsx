import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Markdown } from './Markdown.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

describe('Markdown', () => {
  test('renders headings, paragraphs and lists as text', async () => {
    const backend = new TestBackend(40, 12);
    const md = '# Hello\n\nA short *para* with `code`.\n\n- one\n- two';
    const r = await render(<Markdown width={38}>{md}</Markdown>, backend);
    await flushAsync(backend);

    const frame = backend.lastFrame;
    expect(frame).toContain('Hello');
    expect(frame).toContain('para');
    expect(frame).toContain('code');
    expect(frame).toContain('• one');
    expect(frame).toContain('• two');
    r.unmount();
  });

  test('measures its own width when none is given', async () => {
    const backend = new TestBackend(24, 6);
    const r = await render(<Markdown>{'one two three four five six seven'}</Markdown>, backend);
    await flushAsync(backend);
    // No explicit width → wraps to the 24-col surface (more than one row).
    const rows = backend.lastFrame.split('\n').filter((l) => l.trim() !== '');
    expect(rows.length).toBeGreaterThan(1);
    r.unmount();
  });

  test('a markdown link threads its URL into the painted cell style (OSC 8)', async () => {
    const backend = new TestBackend(40, 3);
    const r = await render(<Markdown width={38}>{'see [docs](http://x.dev)'}</Markdown>, backend);
    await flushAsync(backend);
    const buf = backend.lastBuffer!;
    let linkCell: string | undefined;
    for (let y = 0; y < buf.height && linkCell === undefined; y++) {
      for (let x = 0; x < buf.width; x++) {
        const s = buf.get(x, y).style;
        if (s.link) { linkCell = s.link; break; }
      }
    }
    expect(linkCell).toBe('http://x.dev');
    r.unmount();
  });

  test('renders fenced code', async () => {
    const backend = new TestBackend(40, 6);
    const r = await render(<Markdown width={38}>{'```ts\nconst x = 1;\n```'}</Markdown>, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('const x = 1;');
    r.unmount();
  });
});
