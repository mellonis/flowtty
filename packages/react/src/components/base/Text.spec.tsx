import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../../internal/render.js';
import { Box } from './Box.js';
import { Text } from './Text.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

async function frameOf(el: React.ReactElement): Promise<string[]> {
  const backend = new TestBackend(20, 6);
  const r = await render(el, backend);
  await flushAsync(backend);
  const rows = backend.lastFrame.split('\n');
  r.unmount();
  return rows;
}

describe('Text', () => {
  test('an empty string is a blank line: it still takes one row', async () => {
    expect(await frameOf(
      <Box flexDirection="column"><Text>a</Text><Text>{''}</Text><Text>b</Text></Box>,
    )).toEqual(['a', '', 'b']);
  });

  test('several empty strings are still one blank row', async () => {
    expect(await frameOf(
      <Box flexDirection="column"><Text>a</Text><Text>{''}{''}</Text><Text>b</Text></Box>,
    )).toEqual(['a', '', 'b']);
  });

  test('no content at all (null / false) takes no row', async () => {
    expect(await frameOf(
      <Box flexDirection="column"><Text>a</Text><Text>{null}</Text><Text>{false}</Text><Text>b</Text></Box>,
    )).toEqual(['a', 'b']);
  });
});
