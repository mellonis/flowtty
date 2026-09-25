// The demo screen mounts headlessly and keeps its columns straight — so the
// file cannot rot between the manual runs it exists for.
import React from 'react';
import { expect, test } from 'vitest';
import { render, DialogHost, stringWidth } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { App } from './app.js';

test('the wide-glyphs demo renders every panel with aligned table rules', async () => {
  const backend = new TestBackend(120, 44);
  const r = await render(<DialogHost><App /></DialogHost>, backend);
  await flushAsync(backend);
  const frame = backend.lastFrame;
  for (const s of ['幅テスト', 'segments with backgrounds', '日本語テスト', '🇯🇵 flag', '日本語 help bar', 'const s = "日本語 👩‍👧 café"']) {
    expect(frame).toContain(s);
  }
  // Every table rule lands on the same column: the rows with a flag, a toned
  // emoji, a decomposed accent and a ZWJ family are as wide as the plain one.
  const buf = backend.lastBuffer!;
  const rows = frame.split('\n');
  const plain = rows.findIndex((l) => l.includes('plain   │'));
  // Only the table's own rules: from its first column on (the panels to the left have rules of their own).
  const tableLeft = stringWidth(rows[plain]!.slice(0, rows[plain]!.indexOf('│ plain'))); // a column, not a UTF-16 index
  const rulesOf = (y: number) => Array.from({ length: buf.width }, (_, x) => x >= tableLeft && buf.get(x, y).char === '│' ? x : -1).filter((x) => x >= 0);
  for (const marker of ['🇯🇵 flag', '👍🏽 tone', 'cafe\u0301', '👩‍👧 zwj']) {
    const y = rows.findIndex((l) => l.includes(marker));
    expect(y).toBeGreaterThan(0);
    expect(rulesOf(y)).toEqual(rulesOf(plain));
  }
  r.unmount();
});
