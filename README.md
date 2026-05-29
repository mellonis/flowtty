# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1b (interactive prompts: TextInput). The renderer + interactivity loop from
M1a now have their first prompt-grade component: `<TextInput>` with the proven
articles.mjs line-editor bindings — emacs (`Ctrl-A`/`E`/`B`/`F`/`D`/`H`/`K`/`U`/`W`),
word ops (`Option`+`Left`/`Right`/`B`/`F`/`D`/`Backspace`), Mac Option-modifier
typography (`Option`+`Space` → NBSP, `Option`+`-` → en/em dash, `Option`+`[`/`]`
→ curly quotes), masking, and validate-gated submit (Zod-compatible).

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

### Still deferred (M1c and later)

- TTY-backend stdin raw-mode + key parsing — synthetic keys via TestBackend
  work today; real-terminal interactivity ships with M1c.
- `<Select>` / `<MultiSelect>` / `<Confirm>` + intra-form focus ring + `<Form>` — M1c.
- Frame diffing — full TTY redraw each `draw()`.
- Element-level styling (color/bold/etc.) on text — paint hardcodes empty style.
- Error display inside TextInput — consumers own `validate` and render errors themselves.

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
