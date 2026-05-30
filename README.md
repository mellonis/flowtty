# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga flexbox layout that renders `<Box>`/`<Text>` to a cell
buffer and draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status

M1f (overlay positioning). `<Box>` is now position-aware:

- `position: 'absolute'` + `top` / `left` / `right` / `bottom` (cells) — takes a
  box out of stack flow and positions it relative to the nearest non-static
  ancestor (typically the root, for full-screen overlays).
- `width` / `height` accept percentage strings (`'100%'`, `'50%'`) in addition
  to cell counts.
- `justifyContent` (`'flex-start'` | `'center'` | `'flex-end'` | `'space-between'`
  | `'space-around'` | `'space-evenly'`) and `alignItems` (`'flex-start'` |
  `'center'` | `'flex-end'` | `'stretch'`) for Yoga-flexbox alignment.

The paint pass renders stack-flow children first and absolutely-positioned
children **on top**, so overlays composite correctly. **`<DialogHost>` uses
this to render dialogs as centered overlays** on top of the host content,
resolving M1c.4's inline-position caveat.

### Usage

```tsx
import { Box, Text, render, TtyBackend } from 'flowtty';

await render(
  <Box width={40} height={10}>
    <Text>host content here</Text>
    <Box position="absolute" top={0} left={0} width="100%" height="100%"
         justifyContent="center" alignItems="center">
      <Box width={20} height={3} backgroundColor="blue">
        <Text color="white">CENTERED OVERLAY</Text>
      </Box>
    </Box>
  </Box>,
  new TtyBackend(),
);
```

### Still deferred (later milestones)

- Explicit `zIndex` prop for cross-depth stacking order (tree order is the
  current implicit z; later siblings overlay earlier siblings at the same depth).
- `position: 'relative'` with edge offsets.
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
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
