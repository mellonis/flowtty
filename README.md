# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1c (TTY input layer). `TtyBackend` now delivers real keyboard input — raw-mode
stdin is parsed via `parseKeypress` (CSI arrows, SS3, Mac Option-as-Meta,
Ctrl-A..Z, named keys) and dispatched to `useInput` subscribers the same way
the test backend does. The M1a `useInput` + M1b `<TextInput>` work on a real
terminal now.

### Still deferred (later M1c plans + later milestones)

- `<Select>` / `<MultiSelect>` / `<Confirm>` prompts — next M1c plan.
- `<Form>` + intra-form focus ring + embedded `openDialog` — the M1c plan after that.
- Frame diffing — full TTY redraw each `draw()`.
- Element-level styling (color/bold/etc.) on text — paint hardcodes empty style.
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows
  (`CSI 1;5A` etc.) — not parsed yet (they'd surface as `csi-…` / `ss3-…` names).

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
