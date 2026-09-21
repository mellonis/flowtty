// The README's quick start, as a real file so it is typechecked and cannot rot.
//   npx tsx quickstart.tsx      (from packages/examples)
import React, { useState } from 'react';
import { render, Box, Text, useApp, useInput } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

function Counter() {
  const { exit } = useApp();
  const [count, setCount] = useState(0);
  useInput((key) => {
    if (key.name === 'up') setCount((n) => n + 1);
    if (key.name === 'down') setCount((n) => n - 1);
    if (key.name === 'q') exit(count);
  });
  return (
    <Box flexDirection="column" border="round" borderTitle=" counter " paddingX={1} width={34}>
      <Text bold color={count < 0 ? 'red' : 'green'}>{String(count)}</Text>
      <Text dim>↑ / ↓ change it · q quits</Text>
    </Box>
  );
}

const app = await render(<Counter />, new TtyBackend());
console.log('final count:', await app.waitUntilExit());
