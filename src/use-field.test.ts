import { expect, test } from 'vitest';
import { createElement } from 'react';
import { render } from './index.js';
import { TestBackend, flush, flushAsync } from './testing.js';
import { Form } from './form.js';
import { useField } from './use-field.js';
import { TextInput } from './text-input.js';
import { Box, Text } from './components.js';

function TextField({ name, validate }: { name: string; validate?: (v: unknown) => string | null }) {
  const f = useField(name, { validate });
  return createElement(Box, null,
    createElement(TextInput, {
      value: (f.value as string) ?? '',
      onChange: f.onChange,
      onSubmit: () => f.onSubmit(),
      onCancel: f.onCancel,
      isFocused: f.isFocused,
    }),
    f.error ? createElement(Text, { color: 'red' }, f.error) : false,
  );
}

test('useField registers + flows value/onChange through Form state', async () => {
  const submits: Array<Record<string, unknown>> = [];
  function App() {
    return createElement(Form, { onSubmit: (v: Record<string, unknown>) => submits.push(v) },
      createElement(TextField, { name: 'a' }),
      createElement(TextField, { name: 'b' }),
    );
  }
  const backend = new TestBackend(40, 2);
  await render(createElement(App), backend);
  await flushAsync();  // wait for useField register effects + initial auto-focus
  // First field auto-focused; type into it
  backend.type('hi');
  await flush();
  backend.press({ name: 'return' });
  await flush();
  // Advanced to field 'b' (not submitted yet)
  expect(submits).toEqual([]);
  backend.type('yo');
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(submits).toEqual([{ a: 'hi', b: 'yo' }]);
});

test('Tab advances focus across registered fields (wrapping)', async () => {
  const focusLog: string[] = [];
  function Probe({ name }: { name: string }) {
    const f = useField(name);
    if (f.isFocused) focusLog.push(name);
    return null;
  }
  function App() {
    return createElement(Form, { onSubmit: () => {} },
      createElement(Probe, { name: 'a' }),
      createElement(Probe, { name: 'b' }),
      createElement(Probe, { name: 'c' }),
    );
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  await flushAsync();
  expect(focusLog[focusLog.length - 1]).toBe('a');
  backend.press({ name: 'tab' });
  await flush();
  expect(focusLog[focusLog.length - 1]).toBe('b');
  backend.press({ name: 'tab' });
  await flush();
  expect(focusLog[focusLog.length - 1]).toBe('c');
  backend.press({ name: 'tab' });
  await flush();
  expect(focusLog[focusLog.length - 1]).toBe('a');
});

test('validate blocks advance + sets error (displayed below the field)', async () => {
  const submits: Array<Record<string, unknown>> = [];
  function App() {
    return createElement(Form, { onSubmit: (v: Record<string, unknown>) => submits.push(v) },
      createElement(TextField, { name: 'slug', validate: (v: unknown) => (v as string).length < 3 ? 'too short' : null }),
      createElement(TextField, { name: 'name' }),
    );
  }
  const backend = new TestBackend(40, 3);
  await render(createElement(App), backend);
  await flushAsync();
  backend.type('hi');                    // 2 chars → validation fails
  await flush();
  backend.press({ name: 'return' });     // should NOT advance
  await flush();
  expect(backend.lastFrame).toContain('too short');
  backend.type('!');                     // 3 chars now ('hi!')
  await flush();
  backend.press({ name: 'return' });     // advance to 'name'
  await flush();
  backend.type('alice');
  await flush();
  backend.press({ name: 'return' });     // submit
  await flush();
  expect(submits).toEqual([{ slug: 'hi!', name: 'alice' }]);
});

test('Esc on any field fires the Form onCancel', async () => {
  let cancelled = false;
  function App() {
    return createElement(Form, {
      onSubmit: () => {},
      onCancel: () => { cancelled = true; },
    },
      createElement(TextField, { name: 'a' }),
    );
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  await flushAsync();
  backend.press({ name: 'escape' });
  await flush();
  expect(cancelled).toBe(true);
});
