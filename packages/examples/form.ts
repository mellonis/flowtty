import { createElement, useState } from 'react';
import {
  render, Box, Text,
  Form, useField, TextInput,
} from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

function TextField({ name, label, validate }: { name: string; label: string; validate?: (v: unknown) => string | null }) {
  const f = useField(name, { validate });
  return createElement(Box, { flexDirection: 'column' },
    createElement(Text, null, `${label}${f.isFocused ? ' (focused)' : ''}:`),
    createElement(TextInput, {
      value: (f.value as string) ?? '',
      onChange: f.onChange,
      onSubmit: () => f.onSubmit(),
      onCancel: f.onCancel,
      isFocused: f.isFocused,
    }),
    f.error ? createElement(Text, { color: 'red' }, f.error) : null,
  );
}

function App() {
  const [done, setDone] = useState<Record<string, unknown> | null>(null);
  if (done) {
    return createElement(Box, null,
      createElement(Text, null, `submitted: ${JSON.stringify(done)}`),
    );
  }
  return createElement(Box, { flexDirection: 'column' },
    createElement(Text, null, 'Enter to advance/submit · Tab to cycle focus · Esc or Ctrl-C to cancel'),
    createElement(Form, {
      onSubmit: (v: Record<string, unknown>) => setDone(v),
      onCancel: () => process.exit(0),
    },
      createElement(TextField, { name: 'slug', label: 'slug', validate: (v: unknown) => /^[a-z-]+$/.test(v as string) ? null : 'kebab-case only' }),
      createElement(TextField, { name: 'title', label: 'title' }),
      createElement(TextField, { name: 'date', label: 'date', validate: (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(v as string) ? null : 'YYYY-MM-DD' }),
    ),
  );
}

await render(createElement(App), new TtyBackend());
