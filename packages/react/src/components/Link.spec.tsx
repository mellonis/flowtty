import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { Link } from './Link.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// A test surface that advertises OSC 8 support, so <Link> takes the clickable path.
class LinkCapableBackend extends TestBackend {
  hyperlinks = true;
}

// Find the style of the first cell whose char matches `ch` in the last buffer.
function styleOf(backend: TestBackend, ch: string) {
  const buf = backend.lastBuffer!;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (buf.get(x, y).char === ch) return buf.get(x, y).style;
    }
  }
  return undefined;
}

describe('Link', () => {
  test('on a hyperlink-capable backend, sets the OSC 8 link on the label cells', async () => {
    const backend = new LinkCapableBackend(40, 3);
    const r = await render(<Link href="http://example.com">docs</Link>, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('docs');
    // The URL rides in the cell Style, not on screen.
    expect(backend.lastFrame).not.toContain('example.com');
    const s = styleOf(backend, 'd');
    expect(s?.link).toBe('http://example.com');
    expect(s?.underline).toBe(true);
    expect(s?.fg).toBe('blue');
    r.unmount();
  });

  test('without hyperlink support, falls back to label + visible URL', async () => {
    const backend = new TestBackend(40, 3);
    const r = await render(<Link href="http://example.com">docs</Link>, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('docs');
    expect(backend.lastFrame).toContain('(http://example.com)');
    // No OSC 8 link is set on the cells when unsupported.
    expect(styleOf(backend, 'd')?.link).toBeUndefined();
    r.unmount();
  });

  test('no fallback URL when the label already equals the href', async () => {
    const backend = new TestBackend(40, 3);
    const r = await render(<Link href="http://x.dev" />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('http://x.dev');
    // The URL appears once (as the label), not again in parentheses.
    expect(backend.lastFrame).not.toContain('(http://x.dev)');
    r.unmount();
  });

  test('showUrlFallback={false} suppresses the visible URL suffix', async () => {
    const backend = new TestBackend(40, 3);
    const r = await render(<Link href="http://example.com" showUrlFallback={false}>docs</Link>, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('docs');
    expect(backend.lastFrame).not.toContain('example.com');
    r.unmount();
  });
});
