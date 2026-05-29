# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1c.3 (Form + focus ring). Multi-field workflows compose via `<Form>` +
`useField`:

- `<Form onSubmit onCancel>` — owns the field registry, value aggregation, and
  intra-form focus ring. **Tab** cycles focus forward, **Shift-Tab** backward
  (via `ESC [ Z` on most terminals), **Esc** cancels.
- `useField(name, { validate })` — registers a field, returns
  `{ value, onChange, onSubmit, onCancel, isFocused, error }`. Per-field
  `validate` blocks advance/submit and surfaces the error string for the
  consumer to render.
- **Advance vs submit:** each field's `onSubmit` (Enter inside the focused
  prompt) advances focus to the next registered field; the LAST field's
  `onSubmit` fires the form's `onSubmit(values)` with the aggregated record.

### Usage

```tsx
import { render, Form, useField, TextInput, Box, Text, TtyBackend } from 'flowtty';

function SlugField() {
  const f = useField('slug', { validate: (v) => /^[a-z-]+$/.test(v as string) ? null : 'kebab-case only' });
  return (
    <Box flexDirection="column">
      <Text>slug:</Text>
      <TextInput value={(f.value as string) ?? ''} onChange={f.onChange} onSubmit={f.onSubmit} onCancel={f.onCancel} isFocused={f.isFocused} />
      {f.error && <Text color="red">{f.error}</Text>}
    </Box>
  );
}

await render(
  <Form onSubmit={(v) => console.log(v)} onCancel={() => process.exit(0)}>
    <SlugField />
    {/* ...more useField-based fields... */}
  </Form>,
  new TtyBackend(),
);
```

### Still deferred (later milestones)

- Embedded `openDialog` + `useDialog` (modal sub-prompts that return a value
  without unmounting the host) — M1c.4.
- MultiSelect "+ add new" inline-dialog row — needs `openDialog` (M1c.4).
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
- Cross-field validation (form-level validate hook).
- Async validate.
- Arrow-key focus navigation (Tab/Shift-Tab only today; arrows belong to the
  focused field).

### Usage with Zod

```tsx
import { z } from 'zod';
import { useState } from 'react';
import { render, TextInput, Box, Text } from 'flowtty';

const Slug = z.string().regex(/^[a-z0-9-]+$/, 'kebab-case only');

function App() {
  const [v, setV] = useState('');
  const validate = (x: string) => {
    const r = Slug.safeParse(x);
    return r.success ? null : r.error.issues[0]?.message ?? 'invalid';
  };
  return (
    <Box>
      <TextInput value={v} onChange={setV} validate={validate} onSubmit={(s) => console.log('slug:', s)} />
    </Box>
  );
}
```

## Usage (M0)

```tsx
import { createElement } from 'react';
import { render, Box, Text, TtyBackend } from 'flowtty';

await render(
  createElement(Box, { flexDirection: 'row' },
    createElement(Box, { width: 6 }, createElement(Text, null, 'hello')),
    createElement(Box, { width: 6 }, createElement(Text, null, 'world')),
  ),
  new TtyBackend(),
);
```
