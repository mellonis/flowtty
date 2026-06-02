import { createElement, useState } from 'react';
import { render, Box, Text, useInput } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

function Counter() {
  const [n, setN] = useState(0);
  useInput((key) => {
    if (key.name === 'i') setN((x) => x + 1);
    if (key.name === 'd' && !key.ctrl) setN((x) => x - 1);
  });
  return createElement(Box, null, createElement(Text, null, `count: ${n}  (i=+, d=-, Ctrl-C exits)`));
}

// TtyBackend default-handles Ctrl-C / Ctrl-D as dispose + exit (raw mode
// swallows SIGINT, so a `process.on('SIGINT', ...)` handler would never fire).
await render(createElement(Counter), new TtyBackend());
