/**
 * Inline mode demo: simulated build with append-only log lines (via <Static>)
 * scrolling above a live status row that updates in place.
 *
 * Run: `npm run inline-build-log` from the repo root, or
 *      `tsx inline-build-log/index.tsx` from packages/examples.
 *
 * Expected output (lines stream in over ~2 seconds):
 *
 *     [0] compiled module
 *     [1] compiled module
 *     [2] compiled module
 *     [3] compiled module
 *     [4] compiled module
 *     done.       ← this row redraws in place; ends as "done." when the loop completes
 */

import React from 'react';
import { useEffect, useState } from 'react';
import { render, Box, Text, Static } from '@flowtty/react';
import { InlineTtyBackend } from '@flowtty/inline-tty-backend';

function App({ onDone }: { onDone: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [phase, setPhase] = useState('compiling...');

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      setLogs((prev) => [...prev, `[${i}] compiled module`]);
      i++;
      if (i >= 5) {
        clearInterval(id);
        setPhase('done.');
        // Give React a tick to commit the final phase + the last log, then exit.
        setTimeout(onDone, 300);
      }
    }, 300);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Static items={logs} />
      <Box>
        <Text color={phase === 'done.' ? 'green' : 'cyan'}>{phase}</Text>
      </Box>
    </>
  );
}

const handle = await render(
  <App onDone={() => handle.unmount()} />,
  new InlineTtyBackend({ liveHeight: 1 }),
);
