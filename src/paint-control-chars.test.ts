/** Cells must never carry raw C0 control bytes — emitting \r/\b to a TTY
 *  repositions the cursor and corrupts every cell after it in the diff stream.
 *  Regression: calendar rows had titles with stray \r from CRLF-encoded
 *  DB data, which caused "…»  [nnils]" tail of one row to overwrite cols 0-10
 *  of the next row. */
import { createElement } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from './render.js';
import { Box } from './components.js';
import { TestBackend } from './backends/test.js';

function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('paint: C0 control char sanitization', () => {
  test('\\r in text content is replaced with space (not stored in cell)', async () => {
    const tree = createElement(Box, { width: 30, height: 1 },
      createElement(Box, null, 'abc\rdef'),
    );
    const backend = new TestBackend(30, 1);
    await render(tree, backend);
    await flushAsync();
    // Row should read 'abc def' (with the \r masked to a space), NOT contain a
    // literal \r — if it did, emitting to a real terminal would reset cursor
    // to col 0 and 'def' would overwrite 'abc'.
    expect(backend.lastFrame.split('\n')[0]).toContain('abc def');
    expect(backend.lastFrame).not.toContain('\r');
  });

  test('all C0 control bytes (0x00-0x1f) are sanitized', async () => {
    const dirty = 'A' + String.fromCharCode(0x00, 0x07, 0x08, 0x09, 0x0d, 0x1b, 0x1f) + 'B';
    const tree = createElement(Box, { width: 20, height: 1 },
      createElement(Box, null, dirty),
    );
    const backend = new TestBackend(20, 1);
    await render(tree, backend);
    await flushAsync();
    const line = backend.lastFrame.split('\n')[0]!;
    // None of the C0 bytes should appear in the rendered output.
    for (let code = 0; code < 0x20; code++) {
      // Skip \n (0x0a) — split('\n') itself uses it as a separator and it's
      // legitimate in text; wrap mode handles it upstream.
      if (code === 0x0a) continue;
      expect(line.charCodeAt(line.indexOf('A'))).not.toBe(code);
      expect(line).not.toContain(String.fromCharCode(code));
    }
  });
});
