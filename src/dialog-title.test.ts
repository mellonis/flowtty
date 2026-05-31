import { createElement, useEffect } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from './render.js';
import { Box } from './components.js';
import { TestBackend } from './backends/test.js';
import { DialogHost } from './dialog-host.js';
import { useDialogHost } from './use-dialog.js';

function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('openDialog({ title })', () => {
  test('wraps the dialog element in a bordered Box with title in the top edge', async () => {
    function Opener() {
      const { openDialog } = useDialogHost();
      useEffect(() => {
        void openDialog(createElement(Box, null, 'HELLO'), { title: 'My Window' });
      }, []);
      return null;
    }
    const backend = new TestBackend(20, 5);
    await render(createElement(DialogHost, null, createElement(Opener)), backend);
    await flushAsync();
    await flushAsync();
    const rows = backend.lastFrame.split('\n');
    // Top row: ┌─ My Window ───┐
    expect(rows[0]).toMatch(/^┌─ My Window ─+┐$/);
    // Bottom row: └─...─┘
    expect(rows[rows.length - 1]).toMatch(/^└─+┘$/);
    // Content visible inside (row 1, indented past left border).
    expect(rows[1]).toContain('HELLO');
  });

  test('no title → no wrapper (renders element directly into overlay)', async () => {
    function Opener() {
      const { openDialog } = useDialogHost();
      useEffect(() => {
        void openDialog(createElement(Box, null, 'PLAIN'));
      }, []);
      return null;
    }
    const backend = new TestBackend(20, 3);
    await render(createElement(DialogHost, null, createElement(Opener)), backend);
    await flushAsync();
    await flushAsync();
    expect(backend.lastFrame).toContain('PLAIN');
    expect(backend.lastFrame).not.toContain('┌');
    expect(backend.lastFrame).not.toContain('└');
  });
});
