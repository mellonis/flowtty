# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1c.4 (embedded dialogs). Any descendant of `<DialogHost>` can pop a modal
sub-prompt and await its result without unmounting the host:

- `useDialogHost()` → `{ openDialog(element): Promise<{status:'done',value}|{status:'cancelled'}> }`
- `useDialog()` → `{ done(value), cancel() }` (called from inside a dialog component)
- `<DialogHost>` swaps the `InputContext` source while a dialog is open so the
  host subtree receives no keys; the dialog gets the outer source.

`<MultiSelect>` gained an `onAddNew?` prop: when set, a `+ add new` row
appears at the bottom; Enter on it triggers the callback (typically opens a
`<TextInput>` dialog and appends the result to the items list).

**Visual caveat:** flowtty's stack layout has no `position: absolute` / z-index,
so the dialog renders **below** the host content in the cell buffer (behaviorally
modal — keys gated + awaitable — but visually inline). A true centered overlay
needs positioning primitives, planned for a later layout milestone.

### Usage

```tsx
import {
  render, DialogHost, useDialogHost, useDialog,
  MultiSelect, TextInput, Box, Text, TtyBackend,
} from 'flowtty';

function NameDialog() {
  const { done, cancel } = useDialog();
  const [v, setV] = useState('');
  return (
    <Box>
      <Text>new label: </Text>
      <TextInput value={v} onChange={setV} onSubmit={() => done(v)} onCancel={cancel} />
    </Box>
  );
}

function App() {
  const host = useDialogHost();
  const [items, setItems] = useState([{ label: 'apple', value: 'a' }]);
  return (
    <MultiSelect
      items={items} value={[]} onChange={() => {}} onSubmit={() => {}}
      onAddNew={async () => {
        const r = await host.openDialog<string>(<NameDialog />);
        if (r.status === 'done') setItems((p) => [...p, { label: r.value, value: r.value }]);
      }}
    />
  );
}

await render(<DialogHost><App /></DialogHost>, new TtyBackend());
```

### Still deferred (later milestones)

- Stacked/nested dialogs (one at a time today).
- True modal overlay positioning (absolute/z-index) — dialogs render below host inline.
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
- Async-rendered dialog components (Suspense).
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
