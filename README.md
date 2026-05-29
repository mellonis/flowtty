# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1c.2 (prompts). The framework now ships three standalone prompt components,
each built on `useInput` + the editor-reducer pattern:

- `<Select>` — single choice, arrow navigation (or `j`/`k`), case-insensitive
  filter-as-you-type, Enter to submit, Esc to cancel.
- `<MultiSelect>` — multi choice, Space to toggle the cursor item, Enter to
  submit the value array (in original item order), Esc to cancel.
- `<Confirm>` — yes/no with a default; `y`/`Y`/`n`/`N` for direct answer,
  Enter takes the default, Esc cancels.

All three accept `isFocused` for use in larger trees and work on the test
backend (synthetic keys) and the TTY backend (real terminal).

### Usage

```tsx
import { render, Select, TtyBackend } from 'flowtty';

await render(
  <Select
    items={[{ label: 'apple', value: 'a' }, { label: 'banana', value: 'b' }]}
    value="a"
    onChange={() => {}}
    onSubmit={(v) => console.log('picked', v)}
  />,
  new TtyBackend(),
);
```

### Still deferred (later milestones)

- `<Form>` + intra-form focus ring + `<Form.Field>` + embedded `openDialog` — M1c.3.
- MultiSelect "+ add new" inline-dialog row — needs `openDialog` (M1c.3).
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
- Fuzzy filter matching for `<Select>` (substring only today).
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows.

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
