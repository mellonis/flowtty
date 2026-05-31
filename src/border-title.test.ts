import { createElement } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from './render.js';
import { Box, Text } from './components.js';
import { TestBackend } from './backends/test.js';

function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('Box borderTitle', () => {
  test('paints title on top border line', async () => {
    const backend = new TestBackend(20, 3);
    await render(
      createElement(Box, { border: 'single', borderTitle: 'Hi', width: 20, height: 3 },
        createElement(Text, null, ''),
      ),
      backend,
    );
    await flushAsync();
    const rows = backend.lastFrame.split('\n');
    // Top row: corner + edge + " Hi " + edges + corner
    expect(rows[0]).toBe('┌─ Hi ─────────────┐');
    expect(rows[2]).toBe('└──────────────────┘');
  });

  test('truncates long title with ellipsis to leave at least one edge piece per side', async () => {
    const backend = new TestBackend(10, 3);
    await render(
      createElement(Box, { border: 'single', borderTitle: 'WayTooLong', width: 10, height: 3 },
        createElement(Text, null, ''),
      ),
      backend,
    );
    await flushAsync();
    const rows = backend.lastFrame.split('\n');
    // avail = 10 - 4 = 6 cells. " WayTo… " gets truncated to fit 6 chars,
    // last drawn char becomes '…'. Border corner + edge on each side preserved.
    expect(rows[0]?.[0]).toBe('┌');
    expect(rows[0]?.[1]).toBe('─');
    expect(rows[0]?.at(-1)).toBe('┐');
    expect(rows[0]?.at(-2)).toBe('─');
    expect(rows[0]).toContain('…');
  });

  test('no-op when border is not set', async () => {
    const backend = new TestBackend(10, 2);
    await render(
      createElement(Box, { borderTitle: 'X', width: 10, height: 2 },
        createElement(Text, null, ''),
      ),
      backend,
    );
    await flushAsync();
    // No border → no title overlay → no 'X' anywhere.
    expect(backend.lastFrame).not.toContain('X');
  });

  test('skipped when width < 5 (no room for corner + edge + 1 title cell + edge + corner)', async () => {
    const backend = new TestBackend(4, 3);
    await render(
      createElement(Box, { border: 'single', borderTitle: 'X', width: 4, height: 3 },
        createElement(Text, null, ''),
      ),
      backend,
    );
    await flushAsync();
    const rows = backend.lastFrame.split('\n');
    // Top row: full border, no title.
    expect(rows[0]).toBe('┌──┐');
    expect(rows[0]).not.toContain('X');
  });
});
