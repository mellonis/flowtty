import { createElement } from 'react';
import { render, Box, Text } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

const handle = await render(
  createElement(Box, { flexDirection: 'row' },
    createElement(Box, { width: 6 }, createElement(Text, null, 'hello')),
    createElement(Box, { width: 6 }, createElement(Text, null, 'world')),
  ),
  new TtyBackend(),
);
setTimeout(() => handle.unmount(), 1500);
