# Input, focus and forms

How keys reach a component, how focus moves, and how forms validate.

- [Paste and mouse wheel](#paste-and-mouse-wheel)
- [Focus + Button](#focus--button)
- [Usage with Zod](#usage-with-zod)

## Paste and mouse wheel

Two input events arrive through `useInput` as ordinary keys with a payload:

```tsx
useInput((key) => {
  if (key.name === 'paste') insert(key.text!);            // the whole paste, once
  if (key.name === 'wheelup') scrollBy(-3);               // key.x / key.y = cell under the pointer
  if (key.name === 'wheeldown') scrollBy(3);
});
```

- **Paste.** The TTY backends turn on bracketed paste, so pasted text is delivered
  as ONE `{ name: 'paste', text }` key (line endings normalized to `\n`) instead
  of a run of keystrokes. A pasted newline is therefore text, never Enter, and
  pasted letters never fire single-letter bindings. `<TextInput>` inserts a paste
  at the caret and, being single-line, turns its line breaks into spaces.
- **Wheel.** Opt in with `new TtyBackend(stdout, stdin, { mouse: true })`. Off by
  default because, while mouse reporting is on, the terminal hands drag-to-select
  to the app — users lose native text selection unless they hold Shift/Option.
  Inline mode (`InlineTtyBackend`) never enables it: the wheel there belongs to
  the terminal's own scrollback.

In tests, `TestBackend` has `paste(text)` and `wheel('up' | 'down', x?, y?)`. `wheel()`
defaults to cell (0, 0) — a `<ScrollBox>` only reacts while the pointer is over
it, so pass coordinates inside the box unless it sits at the origin.

**Key names.** A printable key is named by its character — `' '`, `':'`, `'a'` —
and the rest come from a fixed list, exported as `NAMED_KEYS` (type `NamedKey`):
`return`, `escape`, `tab`, `backspace`, `delete`, `insert`, the arrows, `home`,
`end`, `pageup`, `pagedown`, `f1`–`f12`, `paste`, `wheelup`, `wheeldown`. There is
no `'space'` or `'enter'`. The type can't reject such a typo (any character is a
valid name), so `TestBackend.press()` does: it throws on a name no terminal
produces, which stops a test from blessing a branch real input never reaches.

## Focus + Button

Components inside a `<FocusGroup>` can call `useFocus()` to know if they're the active focusable. Tab cycles forward, Shift-Tab backward. First registered = auto-focused.

`<DialogHost>` wraps each stack entry in an implicit `FocusGroup`, so Tab is scoped to the top dialog by default — no setup needed. Host content also gets its own implicit group.

`<Button>` is focusable. Props:

```tsx
<Button label="Open" shortcut="o" onPress={() => ...} />
```

- `Enter` when focused → `onPress()`
- `shortcut` key (anywhere in the input scope) → `onPress()` even when not focused
- Focused state: bold + inverse-video label

`<MultiSelect onAddNew>` adds a "+ add new" row. Return the new item's value from
the callback — directly or as a promise, e.g. after a sub-prompt in a dialog — and
the component selects it and moves the cursor onto it once it appears in `items`
(adding it to `items` is the caller's job). Return `null` for a cancelled prompt.

TextInput / Select / MultiSelect also plug into the focus system. Their `isFocused` prop becomes optional — if unset, they read from the FocusGroup. If set explicitly, the prop overrides.

Outside a FocusGroup, `useFocus()` returns `{isFocused: true}` (safe default — single component receives input as before).

## Usage with Zod

```tsx
import { z } from 'zod';
import { useState } from 'react';
import { render, TextInput, Box, Text } from '@flowtty/react';

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

When `validate` rejects a submit, `<TextInput>` renders the message in red under
the field and clears it on the next edit (`showError={false}` if you show it
yourself). For a one-shot prompt, skip the state: `<TextInput defaultValue="seed"
onSubmit={…} />` keeps its own value.
