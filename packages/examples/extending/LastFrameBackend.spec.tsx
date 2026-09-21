import React from 'react';
import { test, expect } from 'vitest';
import { render, Box, Text } from '@flowtty/react';
import { LastFrameBackend } from './LastFrameBackend.js';

test('prints nothing while running, and the last frame as plain text on unmount', async () => {
  const written: string[] = [];
  const backend = new LastFrameBackend(20, 4, (t) => written.push(t));
  const app = await render(
    <Box flexDirection="column" border="round" width={20}>
      <Text color="green" bold>3 passed</Text>
      <Text dim>0 failed</Text>
    </Box>,
    backend,
  );
  expect(written).toEqual([]);
  app.unmount();
  expect(written.join('')).toBe('╭──────────────────╮\n│3 passed          │\n│0 failed          │\n╰──────────────────╯\n');
  expect(written.join('')).not.toContain('\x1b');
});
