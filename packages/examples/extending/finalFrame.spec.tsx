import React from 'react';
import { EventEmitter } from 'node:events';
import { test, expect } from 'vitest';
import { render, Box, Text } from '@flowtty/react';
import { FinalFrameBackend } from '@flowtty/tty-backend';

// The library backend, driven through render() — the package's own specs feed it
// hand-built Buffers, so this is where the two halves meet. It lives here
// because @flowtty/tty-backend does not depend on @flowtty/react (the package
// graph points the other way).

// stdout stand-in. isTTY false: the case FinalFrameBackend exists for.
function makeStdoutStub() {
  const writes: string[] = [];
  const stub = Object.assign(new EventEmitter(), {
    isTTY: false,
    columns: 200,
    rows: 24,
    write(s: string) { writes.push(s); return true; },
  }) as unknown as NodeJS.WriteStream;
  return { stub, writes };
}

const Plain = (): React.ReactElement => (
  <Box flexDirection="column" border="round" width={20}>
    <Text>3 passed</Text>
    <Text>0 failed</Text>
  </Box>
);

const Report = (): React.ReactElement => (
  <Box flexDirection="column" border="round" width={20}>
    <Text color="green" bold>3 passed</Text>
    <Text dim>0 failed</Text>
  </Box>
);

test('the frame is printed once, on unmount, and in a pipe it is plain text', async () => {
  const { stub, writes } = makeStdoutStub();
  const app = await render(<Plain />, new FinalFrameBackend(stub, { width: 20, height: 4 }));
  expect(writes).toEqual([]);
  app.unmount();
  await app.waitUntilExit();
  expect(writes.join('')).toBe(
    '╭──────────────────╮\n│3 passed          │\n│0 failed          │\n╰──────────────────╯\n',
  );
  expect(writes.join('')).not.toContain('\x1b');
});

test('the default unbounded height makes the frame as tall as its content', async () => {
  const { stub, writes } = makeStdoutStub();
  const app = await render(<Plain />, new FinalFrameBackend(stub, { width: 20 }));
  app.unmount();
  await app.waitUntilExit();
  // Four rows of border and content, with no blank rows padding it out to a
  // terminal's 24: the surface was as tall as what came out of layout.
  expect(writes.join('').split('\n')).toHaveLength(5); // 4 rows + the trailing newline
});

test('in a pipe, emphasis survives but color does not', async () => {
  const { stub, writes } = makeStdoutStub();
  const app = await render(<Report />, new FinalFrameBackend(stub, { width: 20 }));
  app.unmount();
  await app.waitUntilExit();
  const out = writes.join('');
  expect(out).toContain('\x1b[1m3 passed');  // bold, with no color folded in
  expect(out).toContain('\x1b[2m0 failed');  // dim
  expect(out).not.toContain('32m');          // nothing green
});

test('styling survives whole when the destination does take color', async () => {
  const { stub, writes } = makeStdoutStub();
  const app = await render(<Report />, new FinalFrameBackend(stub, { width: 20, color: true, colorDepth: 4 }));
  app.unmount();
  await app.waitUntilExit();
  const out = writes.join('');
  expect(out).toContain('\x1b[1;32m3 passed'); // bold green — one SGR for the run
});
