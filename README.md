# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1d (Text features). `<Text>` now accepts `wrap` (word-wrap with char-wrap
fallback, or `truncate` with single-cell ellipsis), `color`, `bold`, `dim`,
`underline`, `inverse`; `<Box>` accepts `backgroundColor`. Named 16-color
palette only (`black`/`red`/`green`/`yellow`/`blue`/`magenta`/`cyan`/`white`).
Background colors inherit from ancestor boxes into descendant text.

### Usage

```tsx
import { render, Box, Text, TtyBackend } from 'flowtty';

render(
  <Box width={20} backgroundColor="blue">
    <Text color="red" bold wrap="wrap">hello world this is a long line</Text>
  </Box>,
  new TtyBackend(),
);
```

### Still deferred (later milestones)

- `<Select>` / `<MultiSelect>` / `<Confirm>` prompts — next M1c plan.
- `<Form>` + intra-form focus ring + embedded `openDialog` — the plan after that.
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`) — only the named 16-color palette is recognized.
- Per-character inline style spans, RTL/bidi, CJK/emoji width awareness — assume 1 code point = 1 cell.
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
