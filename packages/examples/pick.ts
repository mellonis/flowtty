import { createElement, useState } from 'react';
import { render, Box, Text, Select } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

function App() {
  const [done, setDone] = useState<string | null>(null);
  if (done !== null) {
    return createElement(Box, null, createElement(Text, null, `picked: ${done}`));
  }
  return createElement(Box, null,
    createElement(Text, null, 'pick a fruit (type to filter, ↑↓ to navigate, Enter to pick, Esc/Ctrl-C to exit):'),
    createElement(Select<string>, {
      items: [
        { label: 'apple', value: 'apple' },
        { label: 'banana', value: 'banana' },
        { label: 'cherry', value: 'cherry' },
        { label: 'date', value: 'date' },
        { label: 'elderberry', value: 'elderberry' },
      ],
      value: 'apple',
      onChange: () => {},
      onSubmit: (v) => setDone(v),
      onCancel: () => process.exit(0),
    }),
  );
}

await render(createElement(App), new TtyBackend());
